'use client';
import { useEffect, useState } from 'react';
import { Camera, FileJson, FileText, Table2, Download, Share2, RefreshCw } from 'lucide-react';
import {
  simulationSnapshot,
  samplesCsv,
  serializeProject,
  type SimulationSnapshot,
} from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { buildSimulationReport, exportStem } from '@/lib/report';
import { captureNetworkSvg, networkPng, downloadFile } from '@/lib/downloads';
import { useLabView } from '@/lib/lab-view';
import { experimentCsv } from '@/lib/laboratory';
import { buildExperimentReport } from '@/lib/lab-report';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { PublicationDialog } from './publication-dialog';
const formats = [
  {
    id: 'png',
    title: 'Network screenshot',
    detail: 'PNG image · current viewport and timestamp',
    icon: Camera,
  },
  {
    id: 'json',
    title: 'Runnable setup',
    detail: 'JSON configuration · import into TerraLab',
    icon: FileJson,
  },
  {
    id: 'report',
    title: 'Simulation report',
    detail: 'Standalone HTML · print or save as PDF',
    icon: FileText,
  },
  {
    id: 'csv',
    title: 'Simulation samples',
    detail: 'CSV · timestamped truth, estimates and error',
    icon: Table2,
  },
] as const;
type Format = (typeof formats)[number]['id'];
export function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { result: labResult, index: labIndex } = useLabView();
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null),
    [format, setFormat] = useState<Format>('png');
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  function refresh() {
    const state = useStudio.getState();
    state.play(false);
    setSnapshot(simulationSnapshot(state.project, state.time, state.selected));
    setMessage('');
  }
  useEffect(() => {
    if (open) refresh();
    else {
      setSnapshot(null);
      setFile(null);
    }
  }, [open]);
  useEffect(() => {
    if (!snapshot) return;
    let active = true;
    setBusy(true);
    setError('');
    setFile(null);
    setMessage('');
    void (async () => {
      const stem = exportStem(snapshot.project.name, snapshot.time);
      if (labResult) {
        const record = labResult.records[labIndex];
        if (format === 'json')
          return new File([JSON.stringify(labResult)], `${stem}-experiment.json`, {
            type: 'application/json',
          });
        if (format === 'csv')
          return new File([experimentCsv(labResult)], `${stem}-experiment.csv`, {
            type: 'text/csv',
          });
        if (
          JSON.stringify(snapshot.project.objects) !==
          JSON.stringify(labResult.request.project.objects)
        )
          throw Error(
            'Restore the saved network in Laboratory before exporting a scientific image/report. JSON and CSV remain available.',
          );
        if (format === 'report')
          return new File(
            [buildExperimentReport(labResult, captureNetworkSvg(), labIndex)],
            `${stem}-experiment.html`,
            { type: 'text/html' },
          );
        return new File(
          [
            await networkPng(
              captureNetworkSvg(),
              labResult.request.project,
              record?.time ?? 0,
              `recorded ${labResult.request.config.measurement} · ${record?.estimator ?? 'no epoch'} · seed ${labResult.request.config.seed}`,
            ),
          ],
          `${stem}-experiment.png`,
          { type: 'image/png' },
        );
      }
      switch (format) {
        case 'json':
          return new File([serializeProject(snapshot.project)], `${stem}-setup.json`, {
            type: 'application/json',
          });
        case 'csv':
          if (!snapshot.receiver)
            throw Error('Add an enabled receiver before exporting simulation samples.');
          return new File([samplesCsv(snapshot.samples)], `${stem}-samples.csv`, {
            type: 'text/csv',
          });
        case 'report':
          return new File(
            [buildSimulationReport(snapshot, captureNetworkSvg())],
            `${stem}-report.html`,
            { type: 'text/html' },
          );
        case 'png':
          return new File(
            [await networkPng(captureNetworkSvg(), snapshot.project, snapshot.time)],
            `${stem}-network.png`,
            { type: 'image/png' },
          );
      }
    })()
      .then((value) => {
        if (active) setFile(value);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Export failed.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot, format, labResult, labIndex]);
  const canShare = Boolean(
    file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }),
  );
  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: snapshot?.project.name ?? 'TerraLab export' });
      setMessage('File passed to your device share sheet.');
    } catch (reason) {
      if (reason instanceof Error && reason.name !== 'AbortError')
        setError('Your browser could not share this file. Download it and attach it instead.');
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share your research"
      description="Export the current setup or a timestamped simulation snapshot. Playback pauses while you prepare a file."
    >
      <div className="export-formats">
        {formats.map(({ id, title, detail, icon: Icon }) => (
          <button
            key={id}
            className={`export-format ${format === id ? 'selected' : ''}`}
            aria-pressed={format === id}
            onClick={() => setFormat(id)}
          >
            <Icon size={20} />
            <span>
              <b>
                {labResult
                  ? {
                      png: 'Scientific screenshot',
                      json: 'Complete experiment',
                      report: 'Scientific report',
                      csv: 'All experiment epochs',
                    }[id]
                  : title}
              </b>
              <small>
                {labResult
                  ? {
                      png: 'PNG · selected recorded epoch and visible layers',
                      json: 'JSON · immutable configuration and full output',
                      report: 'HTML · actual experiment metrics · print as PDF',
                      csv: 'CSV · every attempted estimator epoch, including failures',
                    }[id]
                  : detail}
              </small>
            </span>
            <span className="format-radio" />
          </button>
        ))}
      </div>
      {labResult && (
        <p className="field-caption">
          Exporting scientific experiment {labResult.id}. Metrics and samples come from its recorded
          outputs.
        </p>
      )}
      {snapshot && (
        <div className="export-snapshot">
          <span>
            <b>{snapshot.project.name}</b>
            <small>
              {snapshot.time.toFixed(1)} s · {snapshot.project.objects.length} network objects
            </small>
          </span>
          <button aria-label="Refresh export snapshot" onClick={refresh}>
            <RefreshCw size={15} />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      <div className="export-actions">
        {labResult && (
          <Button onClick={() => setPublicationOpen(true)}>Publication SVG / PNG / PDF</Button>
        )}
        <Button
          variant="default"
          disabled={busy || !file}
          onClick={() => {
            if (file) {
              downloadFile(file);
              setMessage(`Downloaded ${file.name}`);
            }
          }}
        >
          <Download size={15} />
          {busy ? 'Preparing file…' : 'Download file'}
        </Button>
        <Button disabled={!canShare || busy} onClick={() => void share()}>
          <Share2 size={15} />
          Share via device
        </Button>
      </div>
      <p className="field-caption">
        {!canShare
          ? 'Device file sharing is unavailable for this format or browser. Download the file and attach it anywhere. '
          : ''}
        Exports contain the project configuration and simulated results, without account details or
        credentials. Cloud projects remain private.
      </p>
      {labResult && (
        <PublicationDialog
          result={labResult}
          open={publicationOpen}
          onOpenChange={setPublicationOpen}
        />
      )}
    </Dialog>
  );
}
