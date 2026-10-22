import { MAX_FILE, type ResearchAsset } from './contracts';
const types: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  tex: 'application/x-tex',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
export async function validateResearchFile(file: Blob & { name: string }) {
  if (!file.size || file.size > MAX_FILE)
    throw Error('Choose a nonempty file no larger than 10 MiB.');
  const extension = file.name.split('.').at(-1)?.toLowerCase() || '',
    mime = types[extension];
  if (!mime) throw Error('Supported files: PDF, TXT, MD, TEX, CSV, JSON, PNG and JPEG.');
  if (
    file.type &&
    ![
      'application/octet-stream',
      mime,
      ...(extension === 'tex' ? ['text/plain', 'text/x-tex'] : []),
    ].includes(file.type)
  )
    throw Error('The file MIME type does not match its extension.');
  const bytes = new Uint8Array(await file.arrayBuffer()),
    head = new TextDecoder().decode(bytes.slice(0, 8));
  if (extension === 'pdf' && !head.startsWith('%PDF-')) throw Error('Invalid PDF signature.');
  if (extension === 'png' && ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    throw Error('Invalid PNG signature.');
  if (
    (extension === 'jpg' || extension === 'jpeg') &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    throw Error('Invalid JPEG signature.');
  if (extension === 'png') {
    if (bytes.length < 33 || new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR')
      throw Error('Invalid PNG header.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      width = view.getUint32(16),
      height = view.getUint32(20);
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000)
      throw Error('Images are limited to 16 megapixels and 8192 pixels per side.');
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    let offset = 2,
      found = false;
    for (let segment = 0; segment < 512 && offset + 8 < bytes.length; segment++) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      if (marker >= 208 && marker <= 215) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        if (length < 8) break;
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4],
          width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000)
          throw Error('Images are limited to 16 megapixels and 8192 pixels per side.');
        found = true;
        break;
      }
      offset += length;
    }
    if (!found) throw Error('A supported JPEG image header is required.');
  }
  if (!['pdf', 'png', 'jpg', 'jpeg'].includes(extension)) {
    if (bytes.length > 1_000_000) throw Error('Text files are limited to 1 MB.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw Error('Text files must be UTF-8 without binary content.');
    if (extension === 'json') JSON.parse(text);
  }
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return { mime: mime as ResearchAsset['mime'], bytes, sha256, extension };
}
export async function extractResearchText(
  file: Blob,
  mime: string,
): Promise<ResearchAsset['extraction']> {
  if (mime.startsWith('image/')) return { status: 'not-applicable', pages: [], truncated: false };
  if (mime !== 'application/pdf') {
    const text = await file.text();
    return {
      status: text.trim() ? 'ready' : 'empty',
      pages: Array.from({ length: Math.min(10, Math.ceil(text.length / 6000)) }, (_, i) => ({
        page: i + 1,
        text: text.slice(i * 6000, (i + 1) * 6000),
      })),
      truncated: text.length > 60000,
      message: 'Text chunks are logical sections, not PDF page numbers.',
    };
  }
  const pdfjs = await import('pdfjs-dist');
  const nativeWorker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {
    type: 'module',
  });
  const worker = pdfjs.PDFWorker.create({ port: nativeWorker });
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    worker,
    useWasm: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    maxImageSize: 4_000_000,
    stopAtErrors: true,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void task.destroy();
    nativeWorker.terminate();
  }, 15000);
  try {
    const pdf = await task.promise;
    const pages: { page: number; text: string }[] = [];
    let total = 0,
      truncated = pdf.numPages > 40;
    for (let n = 1; n <= Math.min(pdf.numPages, 40) && total < 60000; n++) {
      const page = await pdf.getPage(n),
        content = await page.getTextContent();
      const raw = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      const text = raw.slice(0, Math.min(6000, 60000 - total));
      truncated ||= text.length < raw.length;
      total += text.length;
      pages.push({ page: n, text });
      page.cleanup();
    }
    return {
      status: total ? 'ready' : 'empty',
      pages,
      truncated,
      message: total
        ? undefined
        : 'No searchable text. Scanned PDFs require external OCR; no OCR is claimed.',
    };
  } catch {
    return {
      status: 'failed',
      pages: [],
      truncated: false,
      message: timedOut
        ? 'PDF extraction exceeded 15 seconds. The original file is retained.'
        : 'PDF text extraction failed. The original file is retained; encrypted or unsupported PDFs may require an external reader.',
    };
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => {});
    worker.destroy();
    nativeWorker.terminate();
  }
}
