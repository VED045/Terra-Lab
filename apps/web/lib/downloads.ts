import type { Project } from '@terralab/shared';

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file),
    link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function captureNetworkSvg(): string {
  const source = document.querySelector<SVGSVGElement>('.network-canvas');
  if (!source) throw Error('The network canvas is unavailable.');
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...Array.from(source.querySelectorAll('*'))],
    copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const properties = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'text-anchor',
    'paint-order',
    'opacity',
    'display',
    'visibility',
  ];
  originals.forEach((element, index) => {
    const target = copies[index] as SVGElement,
      style = getComputedStyle(element);
    for (const property of properties) {
      const value = style
        .getPropertyValue(property)
        .replace(/url\(["']?[^)]*#([^"' )]+)["']?\)/g, 'url(#$1)');
      if (value) target.style.setProperty(property, value);
    }
    for (const attribute of Array.from(target.attributes)) {
      if (
        /^on/i.test(attribute.name) ||
        (['href', 'xlink:href'].includes(attribute.name) && !attribute.value.startsWith('#'))
      )
        target.removeAttribute(attribute.name);
    }
  });
  clone.querySelectorAll('script,foreignObject,iframe').forEach((element) => element.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${source.clientWidth} ${source.clientHeight}`);
  clone.setAttribute('width', String(source.clientWidth));
  clone.setAttribute('height', String(source.clientHeight));
  return new XMLSerializer().serializeToString(clone);
}
export async function networkPng(svg: string, project: Project, time: number): Promise<Blob> {
  const size = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const width = Number(size.getAttribute('width')),
    height = Number(size.getAttribute('height'));
  if (!width || !height) throw Error('The network canvas has no visible area.');
  const scale = Math.min(2, 4096 / Math.max(width, height + 70)),
    canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil((height + 70) * scale);
  const context = canvas.getContext('2d');
  if (!context) throw Error('PNG export is unavailable in this browser.');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error('Could not render the network screenshot.'));
      image.src = url;
    });
    context.scale(scale, scale);
    context.fillStyle = '#0c1621';
    context.fillRect(0, 0, width, height + 70);
    context.drawImage(image, 0, 70, width, height);
    context.fillStyle = '#dbe4ed';
    context.font = '18px Arial';
    context.fillText(project.name, 20, 29, width - 40);
    context.fillStyle = '#77a6b7';
    context.font = '11px Arial';
    context.fillText(
      `TERRALAB · ${time.toFixed(1)} s · calibrated 2D ranges · seed ${project.settings.seed}`,
      20,
      51,
      width - 40,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error('PNG encoding failed.'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
