'use client';
import { useEffect, useRef } from 'react';
import type { WorkspaceTheme } from '@terralab/shared';
export type Sample = {
  time: number;
  error: number | null;
  x: number;
  y: number;
  estimateX: number | null;
  estimateY: number | null;
};
export default function ScientificChart({
  samples,
  theme,
}: {
  samples: Sample[];
  theme: WorkspaceTheme;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const node = ref.current;
    if (!node) return;
    const styles = getComputedStyle(node);
    const accent = styles.getPropertyValue('--cyan').trim();
    // Production CSS shortens monochrome #eeeeee to #eee.
    const fullAccent = accent.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3');
    const muted = styles.getPropertyValue('--muted').trim();
    const grid = styles.getPropertyValue('--grid').trim();
    let observer: ResizeObserver | undefined;
    import('plotly.js-basic-dist-min')
      .then(({ default: P }) => {
        if (!alive) return;
        const data = [
          {
            x: samples.map((s) => s.time),
            y: samples.map((s) => s.error),
            type: 'scatter' as const,
            mode: samples.length < 2 ? ('markers' as const) : ('lines' as const),
            marker: { color: accent, size: 5 },
            connectgaps: false,
            line: { color: accent, width: 1.7 },
            fill: 'tozeroy' as const,
            fillcolor: `rgba(${[1, 3, 5].map((offset) => parseInt(fullAccent.slice(offset, offset + 2), 16)).join(',')},.07)`,
            hovertemplate: '%{x:.1f} s · %{y:.4f} m<extra></extra>',
          },
        ];
        void P.react(
          node,
          data,
          {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Consolas, monospace', size: 10, color: muted },
            margin: { l: 44, r: 16, t: 12, b: 30 },
            xaxis: {
              title: { text: 'Simulation time (s)', font: { size: 10 } },
              gridcolor: grid,
              zeroline: false,
              range: [samples[0]?.time ?? 0, Math.max(10, samples.at(-1)?.time ?? 0)],
            },
            yaxis: {
              title: { text: 'Error (m)', font: { size: 10 } },
              gridcolor: grid,
              rangemode: 'tozero',
              zeroline: false,
            },
            showlegend: false,
            autosize: true,
          },
          { displayModeBar: false, responsive: false },
        ).catch(() => {
          if (alive && node.isConnected)
            node.textContent = 'Chart unavailable. Measurements remain available in the table.';
        });
        observer = new ResizeObserver(() => {
          if (!alive || !node.isConnected || !node.clientWidth || !node.clientHeight) return;
          // Plotly resolves resize asynchronously; the panel can disappear before it completes.
          void Promise.resolve(P.Plots.resize(node)).catch(() => {});
        });
        observer.observe(node);
      })
      .catch(() => {
        if (alive)
          node.textContent = 'Chart failed to load. Measurements are available in the table.';
      });
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [samples, theme]);
  // Keep the plot between data updates; purging in the data effect races the next react() call.
  useEffect(() => {
    const node = ref.current;
    return () => {
      if (node)
        import('plotly.js-basic-dist-min').then(({ default: P }) => P.purge(node)).catch(() => {});
    };
  }, []);
  return (
    <div
      className="scientific-chart"
      ref={ref}
      aria-label="Position error versus deterministic simulation time"
    />
  );
}
