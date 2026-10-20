'use client';
import { useMemo, useState } from 'react';
import type { ExperimentResult } from '@/lib/laboratory';
import { experimentCsv } from '@/lib/laboratory';
import {
  publicationSvg,
  defaultPlotOptions,
  reproducibilityManifest,
  svgPng,
  reportPayload,
} from '@/lib/publication';
import { downloadFile } from '@/lib/downloads';
import { supabase } from '@/lib/persistence';
import {
  saveResearchArtifact,
  researchArtifacts,
  readResearchArtifact,
  type ArtifactRow,
} from '@/lib/research';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function PublicationDialog({
  result,
  open,
  onOpenChange,
}: {
  result: ExperimentResult;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [options, setOptions] = useState(defaultPlotOptions),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [persist, setPersist] = useState(false),
    [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const svg = useMemo(() => (open ? publicationSvg(result, options) : ''), [result, options, open]);
  async function output(kind: string) {
    setBusy(true);
    setError('');
    try {
      let data: BlobPart = svg,
        mime = 'image/svg+xml',
        extension = 'svg';
      if (kind === 'png') {
        data = await svgPng(svg);
        mime = 'image/png';
        extension = 'png';
      }
      if (kind === 'json') {
        data = JSON.stringify(result);
        mime = 'application/json';
        extension = 'json';
      }
      if (kind === 'csv') {
        data = experimentCsv(result);
        mime = 'text/csv';
        extension = 'csv';
      }
      if (kind === 'manifest') {
        data = JSON.stringify(await reproducibilityManifest(result), null, 2);
        mime = 'application/json';
        extension = 'manifest.json';
      }
      if (kind === 'pdf') {
        const session = await supabase()?.auth.getSession();
        const token = session?.data.session?.access_token;
        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(reportPayload(result, options)),
        });
        if (!response.ok) {
          const e = await response.json();
          throw Error(e.detail || 'PDF service unavailable');
        }
        data = await response.blob();
        mime = 'application/pdf';
        extension = 'pdf';
      }
      const file = new File([data], `${result.id}.${extension}`, { type: mime });
      downloadFile(file);
      if (persist) {
        await saveResearchArtifact(result.id, kind, file);
        setArtifacts(await researchArtifacts(result.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Publication exports"
      description="Figures are calculated from this immutable experiment. Labels change presentation only."
      wide
    >
      <div className="publication-options">
        {(['title', 'xLabel', 'yLabel'] as const).map((key) => (
          <label key={key}>
            {key === 'title'
              ? 'Figure title'
              : key === 'xLabel'
                ? 'X-axis label and units'
                : 'Y-axis label and units'}
            <input
              aria-label={`Publication ${key}`}
              maxLength={key === 'title' ? 150 : 100}
              value={options[key]}
              onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          SVG width (px)
          <input
            type="number"
            min={600}
            max={2400}
            value={options.width}
            onChange={(e) =>
              setOptions({
                ...options,
                width: Math.min(2400, Math.max(600, Number(e.target.value) || 1200)),
              })
            }
          />
        </label>
        <label>
          SVG height (px)
          <input
            type="number"
            min={450}
            max={1600}
            value={options.height}
            onChange={(e) =>
              setOptions({
                ...options,
                height: Math.min(1600, Math.max(450, Number(e.target.value) || 750)),
              })
            }
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={options.legend}
            onChange={(e) => setOptions({ ...options, legend: e.target.checked })}
          />
          Show legend
        </label>
      </div>
      <div
        className="publication-preview"
        role="img"
        aria-label="Recorded experiment CDF"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="small-copy">
        SVG preserves vector geometry. PNG renders at 2× the configured dimensions. PDF includes
        configuration, units, seed, actual summary metrics, network/trajectory figures, sampled CDF,
        failure counts, methodology and limitations. This API must be running for PDF generation.
      </p>
      <label className="check-row">
        <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
        Also append generated artifact to this cloud run (sign-in and a worker-published run
        required; max 2 MB/file)
      </label>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void researchArtifacts(result.id)
            .then(setArtifacts)
            .catch((e) => setError(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        Load saved export artifacts
      </Button>
      {artifacts.map((a) => (
        <div className="research-project" key={a.id}>
          <span className="project-open">
            {a.kind} · {new Date(a.created_at).toLocaleString()} · {a.bytes} bytes
          </span>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void readResearchArtifact(a)
                .then((blob) =>
                  downloadFile(new File([blob], a.path.split('/').at(-1)!, { type: blob.type })),
                )
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Download checked artifact
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="research-inline">
        {['svg', 'png', 'pdf', 'json', 'csv', 'manifest'].map((k) => (
          <Button key={k} disabled={busy} onClick={() => void output(k)}>
            {busy ? 'Preparing…' : `Export ${k.toUpperCase()}`}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
