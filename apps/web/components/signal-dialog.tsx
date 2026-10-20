'use client';
import { useState } from 'react';
import { supabase } from '@/lib/persistence';
import { downloadFile } from '@/lib/downloads';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
type Result = {
  moduleVersion: string;
  validation: string;
  request: unknown;
  seed: number;
  gridNs: number[];
  estimators: Record<
    string,
    {
      delaysNs: number[];
      spectrum: number[];
      runtimeMs: number;
      note: string;
      error: string | null;
    }
  >;
  warnings: string[];
  elapsedMs: number;
};
const initial = {
  bandwidthMHz: 20,
  spacingKHz: 625,
  snapshots: 32,
  snrDb: 30,
  seed: 123,
  maxDelayNs: 500,
  gridPoints: 1024,
  calibrationPhaseDeg: 0,
  calibrationGainDb: 0,
  calibrationDelayNs: 0,
};
const limits: Record<keyof typeof initial, [number, number, string]> = {
  bandwidthMHz: [0.01, 160, 'MHz'],
  spacingKHz: [10, 10000, 'kHz'],
  snapshots: [1, 64, 'snapshots'],
  snrDb: [-20, 120, 'dB'],
  seed: [0, 2147483647, 'integer'],
  maxDelayNs: [1, 5000, 'ns'],
  gridPoints: [128, 2048, 'points'],
  calibrationPhaseDeg: [0, 180, 'deg RMS'],
  calibrationGainDb: [0, 12, 'dB RMS'],
  calibrationDelayNs: [0, 50, 'ns RMS'],
};
export function SignalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [config, setConfig] = useState(initial),
    [bands, setBands] = useState('2400, 2480'),
    [paths, setPaths] = useState(
      '[{"delayNs":100,"real":1,"imag":0},{"delayNs":180,"real":0.5,"imag":0.2}]',
    ),
    [gainMode, setGainMode] = useState('independent'),
    [algorithms, setAlgorithms] = useState(['matched', 'weighted', 'music']),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      const session = await supabase()?.auth.getSession();
      const token = session?.data.session?.access_token;
      const request = {
        ...config,
        bandsMHz: bands.split(',').map((x) => {
          if (!x.trim()) throw Error('Empty frequency band');
          const n = Number(x);
          if (!Number.isFinite(n)) throw Error('Invalid frequency band');
          return n;
        }),
        paths: JSON.parse(paths),
        gainMode,
        algorithms,
        bandNoiseDb: [],
      };
      const response = await fetch('/api/signals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      setResult(data);
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
      title="Multiband signal laboratory"
      description="Experimental synthetic CSI · conventional baseline and limited subspace demonstrations · not MBWDE."
      wide
    >
      <p className="signal-status">
        H(f) = Σ αₖ exp(−j2πfτₖ) + n(f). Known path count, synthetic frequency-invariant path gains,
        at most 128 tones, 64 snapshots and 2,048 delay-grid points. Independent phases model
        decorrelated snapshots; coherent gains remain fixed. MUSIC requires independent snapshot
        gains for multiple paths. ESPRIT supports one contiguous band.
      </p>
      <div className="signal-controls">
        <label>
          Band centres (MHz, comma separated)
          <input
            aria-label="Signal bands MHz"
            value={bands}
            onChange={(e) => setBands(e.target.value)}
          />
        </label>
        <label>
          Snapshot gains
          <select value={gainMode} onChange={(e) => setGainMode(e.target.value)}>
            <option value="independent">Independent phases per snapshot</option>
            <option value="coherent">Coherent fixed complex gains</option>
          </select>
        </label>
        {(Object.keys(config) as (keyof typeof config)[]).map((key) => (
          <label key={key}>
            {key} ({limits[key][2]})
            <input
              aria-label={`Signal ${key}`}
              type="number"
              min={limits[key][0]}
              max={limits[key][1]}
              step="any"
              value={config[key]}
              onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="span-all">
          Multipath components (delayNs, real and imaginary amplitude)
          <textarea
            aria-label="Signal paths JSON"
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
          />
        </label>
      </div>
      <div className="research-inline">
        {['matched', 'weighted', 'music', 'esprit'].map((a) => (
          <label className="check-row" key={a}>
            <input
              type="checkbox"
              checked={algorithms.includes(a)}
              onChange={(e) =>
                setAlgorithms(
                  e.target.checked ? [...algorithms, a] : algorithms.filter((x) => x !== a),
                )
              }
            />
            {a}
          </label>
        ))}
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? 'Calculating…' : 'Run bounded CSI example'}
        </Button>
        <Button
          onClick={() => {
            setBands('2400');
            setGainMode('coherent');
            setAlgorithms(['matched', 'esprit']);
          }}
        >
          Single-band ESPRIT preset
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="info-note">
            {result.validation} · {result.elapsedMs.toFixed(2)} ms
          </p>
          <div className="lab-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Estimator</th>
                  <th>Delay estimates (ns)</th>
                  <th>Runtime (ms)</th>
                  <th>Status / assumptions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.estimators).map(([key, v]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{v.delaysNs.map((n) => n.toFixed(4)).join(', ') || 'unavailable'}</td>
                    <td>{v.runtimeMs.toFixed(3)}</td>
                    <td>{v.error || v.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <svg
            role="img"
            aria-label="Experimental normalized delay spectra"
            viewBox="0 0 900 290"
            style={{ width: '100%', background: 'var(--canvas)' }}
          >
            <text x={50} y={20} fill="currentColor" fontSize={12}>
              Normalized spectrum (each estimator independently scaled)
            </text>
            {Object.entries(result.estimators)
              .filter(([, v]) => v.spectrum.length)
              .map(([key, v], i) => (
                <g key={key}>
                  <polyline
                    fill="none"
                    stroke={['#2563eb', '#a855f7', '#16a34a', '#d97706'][i % 4]}
                    strokeWidth={1.5}
                    points={v.spectrum
                      .map((n, j) => `${50 + (j / (v.spectrum.length - 1)) * 800},${240 - n * 200}`)
                      .join(' ')}
                  />
                  <text x={60 + i * 180} y={275} fill="currentColor" fontSize={11}>
                    {key}
                  </text>
                </g>
              ))}
            <path d="M50 40V240H850" stroke="currentColor" fill="none" />
            <text x={460} y={257} fill="currentColor" fontSize={11}>
              Delay 0 – {result.gridNs.at(-1)} ns
            </text>
          </svg>
          {result.warnings.map((w) => (
            <p className="small-copy" key={w}>
              {w}
            </p>
          ))}
          <Button
            onClick={() =>
              downloadFile(
                new File([JSON.stringify(result)], `terralab-csi-seed-${result.seed}.json`, {
                  type: 'application/json',
                }),
              )
            }
          >
            Export CSI, configuration and actual results JSON
          </Button>
        </>
      )}
    </Dialog>
  );
}
