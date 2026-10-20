'use client';
import { useEffect, useRef } from 'react';
export type Sample = {
  time: number;
  error: number | null;
  x: number;
  y: number;
  estimateX: number | null;
  estimateY: number | null;
};
export default function ScientificChart({ samples, light }: { samples: Sample[]; light: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const node = ref.current;
    if (!node) return;
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
            marker: { color: '#40c9c6', size: 5 },
            connectgaps: false,
            line: { color: '#40c9c6', width: 1.7 },
            fill: 'tozeroy' as const,
            fillcolor: 'rgba(64,201,198,.07)',
            hovertemplate: '%{x:.1f} s · %{y:.4f} m<extra></extra>',
          },
        ];
        void P.react(
          node,
          data,
          {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Consolas, monospace', size: 10, color: light ? '#64748b' : '#708092' },
            margin: { l: 44, r: 16, t: 12, b: 30 },
            xaxis: {
              title: { text: 'Simulation time (s)', font: { size: 10 } },
              gridcolor: light ? '#e2e8f0' : '#1b2936',
              zeroline: false,
              range: [samples[0]?.time ?? 0, Math.max(10, samples.at(-1)?.time ?? 0)],
            },
            yaxis: {
              title: { text: 'Error (m)', font: { size: 10 } },
              gridcolor: light ? '#e2e8f0' : '#1b2936',
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
  }, [samples, light]);
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
