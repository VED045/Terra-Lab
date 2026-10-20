'use client';
import { useEffect, useRef, useState } from 'react';
import {
  defaultLabConfig,
  parseSweepValues,
  labConfigSchema,
  labParameters,
  measurementModels,
  measurementNames,
  estimatorIds,
  estimatorNames,
  compatibleEstimator,
  createTemplate,
  newObject,
  type LabConfig,
  type LabNumberKey,
  type MeasurementModel,
  type EstimatorId,
} from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { useLabView, labLayers, labLayerNames } from '@/lib/lab-view';
import {
  laboratoryRequest,
  savedExperiments,
  saveExperiment,
  syncExperiment,
  cloudExperiments,
  readExperiment,
  experimentCsv,
  type ExperimentResult,
} from '@/lib/laboratory';
import { downloadFile } from '@/lib/downloads';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { NumberField } from './ui/number-field';
import { LaboratoryCharts, LaboratoryObservations, labFormat as fmt } from './laboratory-charts';
import { LaboratoryObjectControls } from './laboratory-object-controls';
import { PublicationDialog } from './publication-dialog';
import { saveProject } from '@/lib/persistence';
const terminal = (status: string) => !['queued', 'running'].includes(status);
const activeKey = 'terralab.laboratory.active';
function Parameter({
  name,
  config,
  change,
}: {
  name: LabNumberKey;
  config: LabConfig;
  change: (patch: Partial<LabConfig>) => void;
}) {
  const p = labParameters[name];
  return (
    <div className="lab-parameter">
      <NumberField
        label={p.label}
        value={config[name]}
        unit={p.unit}
        min={p.min}
        max={p.max}
        step={p.step}
        onChange={(value) => change({ [name]: value })}
      />
      <input
        type="range"
        aria-label={`${p.label} slider`}
        min={p.min}
        max={p.max}
        step={p.step}
        value={config[name]}
        onChange={(e) => change({ [name]: Number(e.target.value) })}
      />
      <p>
        {p.description} Default: {p.value} {p.unit}.
      </p>
    </div>
  );
}
export function LaboratoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { project, edit, load, play, setTime, log } = useStudio();
  const config = project.laboratory ?? defaultLabConfig();
  const view = useLabView();
  const [tab, setTab] = useState<'configure' | 'results' | 'archive'>('configure');
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [archive, setArchive] = useState<ExperimentResult[]>([]);
  const [index, setIndex] = useState(0),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false);
  const [sweepText, setSweepText] = useState(config.sweepValues.join(', '));
  const input = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    setSweepText(config.sweepValues.join(', '));
  }, [config.sweepValues.join(',')]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      setActive(localStorage.getItem(activeKey));
    } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    void savedExperiments()
      .then(setArchive)
      .catch((error) => setFailure(error.message));
  }, [open]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await laboratoryRequest(`?id=${active}`);
        if (!alive) return;
        if (terminal(status.status)) {
          const finished = await laboratoryRequest(`?id=${active}&detail=true`);
          if (!alive) return;
          setResult(finished);
          setIndex(0);
          try {
            localStorage.removeItem(activeKey);
          } catch {}
          if (finished.artifactUnavailable) {
            setActive(null);
            setFailure(
              `Job ${finished.status}: ${finished.error ?? 'Result publication was interrupted'}. Progress and failure logs remain in the cloud job history; no complete result artifact was published.`,
            );
            return;
          }
          try {
            const existing = await savedExperiments();
            if (!existing.some((r) => r.id === finished.id)) await saveExperiment(finished);
            if (alive) setArchive(await savedExperiments());
            if (alive)
              setMessage(
                `${finished.status}: ${finished.completed}/${finished.planned} attempted epochs. Snapshot saved locally.`,
              );
          } catch (error) {
            if (alive)
              setFailure(
                `Result is available, but local persistence failed: ${error instanceof Error ? error.message : String(error)}. Export JSON now.`,
              );
          }
          log(
            `Scientific experiment ${finished.status}: ${finished.completed}/${finished.planned} estimator epochs.`,
          );
          // Clearing active tears down this effect. Finish local persistence and its
          // feedback first, while this poll is still the current request.
          setActive(null);
          return;
        }
        setResult(status);
        setFailure('');
      } catch (error) {
        if (alive)
          setFailure(
            `${error instanceof Error ? error.message : String(error)} Polling will retry; job completion is not assumed.`,
          );
      }
      if (alive) timer = setTimeout(() => void poll(), 1000);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, log]);
  function change(patch: Partial<LabConfig>) {
    const candidate = { ...config, ...patch };
    const parsed = labConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0].message);
      return;
    }
    edit((p) => {
      p.laboratory = parsed.data;
    });
    setFailure('');
  }
  async function run() {
    setBusy(true);
    setFailure('');
    setMessage('');
    play(false);
    try {
      const parsed = labConfigSchema.parse({
        ...config,
        sweepValues: parseSweepValues(sweepText),
      });
      edit((p) => {
        p.laboratory = parsed;
      });
      const original = structuredClone(useStudio.getState().project);
      let submission: {
        key: string;
        body: { project: typeof original; config: LabConfig };
      } | null = null;
      const fingerprint = (p: typeof original) =>
        JSON.stringify({
          ...p,
          updatedAt: undefined,
          cloudVersion: undefined,
          cloudOwnerId: undefined,
        });
      try {
        const pending = JSON.parse(localStorage.getItem('terralab.pending-submission') || 'null');
        if (
          pending?.body?.project &&
          fingerprint(pending.body.project) === fingerprint(original) &&
          JSON.stringify(pending.body.config) === JSON.stringify(parsed)
        )
          submission = pending;
      } catch {}
      if (!submission) {
        const snapshot = await saveProject(original);
        useStudio.getState().acceptSave(original, snapshot);
        submission = { key: crypto.randomUUID(), body: { project: snapshot, config: parsed } };
        localStorage.setItem('terralab.pending-submission', JSON.stringify(submission));
      }
      const job = await laboratoryRequest('', 'POST', submission.body, submission.key);
      localStorage.removeItem('terralab.pending-submission');
      setResult(null);
      setActive(job.id);
      setTab('results');
      try {
        localStorage.setItem(activeKey, job.id);
      } catch {}
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    try {
      await laboratoryRequest(`?id=${active}`, 'DELETE');
      setMessage('Cancellation requested. Completed epochs will be retained.');
    } catch (error) {
      setFailure(String(error));
    }
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await work();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  function benchmark() {
    const network = createTemplate('outdoor');
    network.objects = network.objects.filter((o) => o.kind !== 'obstacle');
    let anchorIndex = 0;
    for (const a of network.objects)
      if (a.kind === 'anchor') {
        a.noise = 0;
        a.timingUncertainty = anchorIndex++ * 0.2;
      }
    network.objects.push(
      {
        ...newObject('receiver', { x: 25, y: 25 }, 'rx-benchmark-2'),
        name: 'Benchmark location 2',
      },
      {
        ...newObject('receiver', { x: 90, y: 60 }, 'rx-benchmark-3'),
        name: 'Benchmark location 3',
      },
    );
    network.laboratory = {
      ...defaultLabConfig(),
      trials: 100,
      sweepValues: [0.1, 1, 3, 10],
      seed: 20261020,
      nlosProbability: 0.1,
      nlosBiasM: 5,
      nlosLossDb: 0,
      outlierProbability: 0.02,
      outlierScale: 20,
    };
    load(network);
    setTab('configure');
    setMessage(
      'Loaded six anchors and three static receiver locations. Values are synthetic simulation settings.',
    );
  }
  const groups = [...new Set(Object.values(labParameters).map((p) => p.group))];
  const records = result?.records ?? [];
  const selected = records[Math.min(index, Math.max(records.length - 1, 0))] ?? null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scientific laboratory"
      description="Phase 2 · Reproducible observations, matched estimator comparisons and explicit failure accounting."
      wide
      className="laboratory-dialog"
    >
      <div className="lab-tabs">
        {(['configure', 'results', 'archive'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'configure'
              ? 'Experiment setup'
              : t === 'results'
                ? 'Results & analytics'
                : 'Saved snapshots'}
          </button>
        ))}
      </div>
      {failure && (
        <p className="lab-error" role="alert">
          {failure}
        </p>
      )}
      {message && (
        <p className="lab-message" role="status">
          {message}
        </p>
      )}
      {tab === 'configure' && (
        <>
          <div className="lab-intro">
            <span>
              {project.name} ·{' '}
              {project.objects.filter((o) => o.kind === 'anchor' && o.enabled).length} enabled
              anchors · {project.objects.filter((o) => o.kind === 'receiver' && o.enabled).length}{' '}
              receivers
            </span>
            <Button onClick={benchmark} disabled={Boolean(active)}>
              Load six-anchor benchmark
            </Button>
          </div>
          <div className="lab-config-grid">
            <section>
              <label className="select-field">
                Measurement model
                <select
                  aria-label="Laboratory measurement model"
                  value={config.measurement}
                  onChange={(e) => {
                    const measurement = e.target.value as MeasurementModel;
                    change({
                      measurement,
                      estimators: config.estimators.filter((x) =>
                        compatibleEstimator(measurement, x),
                      ).length
                        ? config.estimators.filter((x) => compatibleEstimator(measurement, x))
                        : ['wls'],
                    });
                  }}
                >
                  {measurementModels.map((m) => (
                    <option key={m} value={m}>
                      {measurementNames[m]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-caption">
                Horizontal 2D observations. Clock/hardware values in the object inspector represent
                residual timing errors in ns; drift is ppm. Altitude remains outside this model. RTT
                cancels clock offset but is sensitive to clock rate.
              </p>
              <LaboratoryObjectControls />
              {config.measurement === 'hybrid' && (
                <fieldset className="lab-fieldset">
                  <legend>Independent observation blocks</legend>
                  {(['toa', 'aoa', 'rss'] as const).map((m) => (
                    <label className="check-row" key={m}>
                      <input
                        type="checkbox"
                        checked={config.hybrid.includes(m)}
                        onChange={(e) =>
                          change({
                            hybrid: e.target.checked
                              ? [...config.hybrid, m]
                              : config.hybrid.filter((x) => x !== m),
                          })
                        }
                      />
                      {measurementNames[m]}
                    </label>
                  ))}
                  <p className="field-caption">
                    At least two components. Whitened joint residuals; nominal cross-block
                    covariance is zero. NLOS/outlier mixture dependencies are unmodeled.
                  </p>
                </fieldset>
              )}
              {config.measurement === 'tdoa' && (
                <label className="select-field">
                  Reference anchor
                  <select
                    aria-label="TDOA reference anchor"
                    value={config.referenceId}
                    onChange={(e) => change({ referenceId: e.target.value })}
                  >
                    <option value="auto">First available enabled anchor</option>
                    {project.objects
                      .filter((o) => o.kind === 'anchor' && o.enabled)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <fieldset className="lab-fieldset">
                <legend>Positioning estimators</legend>
                {estimatorIds.map((e) => (
                  <label className="check-row" key={e}>
                    <input
                      type="checkbox"
                      disabled={!compatibleEstimator(config.measurement, e)}
                      checked={config.estimators.includes(e)}
                      onChange={(event) =>
                        change({
                          estimators: event.target.checked
                            ? [...config.estimators, e]
                            : config.estimators.filter((x) => x !== e),
                        })
                      }
                    />
                    {estimatorNames[e]}
                    {!compatibleEstimator(config.measurement, e) && ' · incompatible'}
                  </label>
                ))}
                <p className="field-caption">
                  WLS and Gaussian MLE share the same whitened objective with fixed known
                  covariance. NLS is unweighted for single models; hybrid NLS uses whitening to
                  combine physical units.
                </p>
              </fieldset>
              <label className="select-field">
                Parameter sweep
                <select
                  aria-label="Experiment parameter sweep"
                  value={config.sweep}
                  onChange={(e) => {
                    const sweep = e.target.value as LabConfig['sweep'];
                    change({
                      sweep,
                      sweepValues:
                        sweep === 'nlosProbability'
                          ? [0, 0.1, 0.3, 0.5]
                          : sweep === 'anchorCount'
                            ? [3, 4]
                            : sweep === 'speed'
                              ? [0, 1, 3, 5]
                              : [0.1, 1, 3, 10],
                    });
                  }}
                >
                  {Object.entries({
                    none: 'Single configuration',
                    timingNs: 'Timing uncertainty (ns)',
                    nlosProbability: 'NLOS probability',
                    speed: 'Receiver speed (m/s)',
                    anchorCount: 'Anchor count',
                  }).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {config.sweep !== 'none' && (
                <label className="select-field">
                  Sweep values · comma separated
                  <input
                    aria-label="Sweep values"
                    value={sweepText}
                    onChange={(e) => setSweepText(e.target.value)}
                    onBlur={() => {
                      try {
                        change({ sweepValues: parseSweepValues(sweepText) });
                      } catch (error) {
                        setFailure(error instanceof Error ? error.message : String(error));
                      }
                    }}
                  />
                </label>
              )}
              <fieldset className="lab-fieldset">
                <legend>Deliberately missing anchors</legend>
                {project.objects
                  .filter((o) => o.kind === 'anchor')
                  .map((o) => (
                    <label className="check-row" key={o.id}>
                      <input
                        type="checkbox"
                        checked={config.missingIds.includes(o.id)}
                        onChange={(e) =>
                          change({
                            missingIds: e.target.checked
                              ? [...config.missingIds, o.id]
                              : config.missingIds.filter((x) => x !== o.id),
                          })
                        }
                      />
                      {o.name}
                    </label>
                  ))}
              </fieldset>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={config.excludeBlocked}
                  onChange={(e) => change({ excludeBlocked: e.target.checked })}
                />
                Exclude geometrically blocked links
              </label>
              <p className="field-caption">
                Obstacles otherwise cause NLOS bias/attenuation. Propagation is a
                geometric/log-distance approximation, without RF ray tracing. Changes affect new
                runs; previous snapshots remain fixed.
              </p>
            </section>
            <section>
              {groups.map((group) => (
                <details
                  key={group}
                  className="lab-control-group"
                  open={group === 'Experiment' || undefined}
                >
                  <summary>{group}</summary>
                  {(Object.keys(labParameters) as LabNumberKey[])
                    .filter((key) => labParameters[key].group === group)
                    .map((key) => (
                      <Parameter key={key} name={key} config={config} change={change} />
                    ))}
                </details>
              ))}
            </section>
          </div>
          <div className="lab-actions">
            <Button variant="default" onClick={() => void run()} disabled={busy || Boolean(active)}>
              Run reproducible experiment
            </Button>
            <span>
              Up to 100,000 estimator epochs. All estimators receive identical observations per
              epoch.
            </span>
          </div>
          <details className="lab-control-group">
            <summary>Estimator compatibility and assumptions</summary>
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Estimator</th>
                  {measurementModels.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimatorIds.map((e) => (
                  <tr key={e}>
                    <th>{estimatorNames[e]}</th>
                    {measurementModels.map((m) => (
                      <td key={m}>{compatibleEstimator(m, e) ? '✓' : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="field-caption">
              Linear LS uses squared-range differencing; RSS LS uses inverted path-loss ranges and
              is not dB-domain MLE. EKF/UKF use constant-velocity states and optionally clock
              bias/drift. Filters initialize from WLS observations, never ground truth. A failed
              update is counted as no fix; the prediction is retained internally for the next
              update. No particle filter or Phase 3 processing is included.
            </p>
          </details>
        </>
      )}
      {tab === 'results' && (
        <>
          {active && (
            <div className="lab-progress">
              <progress
                aria-label="Experiment progress"
                max={Math.max(1, result?.planned ?? 1)}
                value={result?.completed ?? 0}
              />
              <span>
                {result?.status ?? 'queued'} · {result?.completed ?? 0}/{result?.planned ?? '…'}{' '}
                epochs
              </span>
              <Button onClick={() => void cancel()}>Cancel experiment</Button>
            </div>
          )}
          {!result && !active && (
            <p className="small-copy">
              Run an experiment or open a saved snapshot to view calculated results.
            </p>
          )}
          {result && (
            <>
              <p className="small-copy">
                {result.status} · {result.request.project.name} · seed {result.request.config.seed}{' '}
                · software {result.softwareVersion} · {result.completed}/{result.planned} attempted
                {result.unattempted ? ` · ${result.unattempted} unattempted` : ''}. Error metrics
                are conditional on successful fixes; availability and failure counts use every
                attempted epoch. Runtime measures the estimator call, including failed calls, on
                this machine.
              </p>
              {result.error && <p className="lab-error">{result.error}</p>}
              <div className="lab-table-scroll">
                <table className="lab-table">
                  <thead>
                    <tr>
                      {[
                        'Estimator / sweep',
                        'Attempts',
                        'Failures',
                        'Availability',
                        'Mean m',
                        'Median m',
                        'RMSE m',
                        'P95 m',
                        'Max m',
                        'Residual RMS σ',
                        'Residual mean / SD / |P95| σ',
                        'Cond. med / P95',
                        'Runtime med / P95 ms',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.summaries.map((s) => (
                      <tr key={`${s.estimator}:${s.sweepValue}`}>
                        <th>
                          {estimatorNames[s.estimator]} / {s.sweepValue}
                        </th>
                        <td>{s.attempted}</td>
                        <td>
                          {s.failures} ({fmt((s.failureRate ?? 0) * 100)}%)
                        </td>
                        <td>{fmt((s.availability ?? 0) * 100)}%</td>
                        <td>{fmt(s.meanErrorM)}</td>
                        <td>{fmt(s.medianErrorM)}</td>
                        <td>{fmt(s.rmseM)}</td>
                        <td>{fmt(s.p95ErrorM)}</td>
                        <td>{fmt(s.maxErrorM)}</td>
                        <td>{fmt(s.meanNormalizedResidualRms)}</td>
                        <td>
                          {fmt(s.residualMean)} / {fmt(s.residualStd)} / {fmt(s.residualAbsP95)}
                        </td>
                        <td>
                          {fmt(s.medianCondition)} / {fmt(s.p95Condition)}
                        </td>
                        <td>
                          {fmt(s.medianRuntimeMs)} / {fmt(s.p95RuntimeMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.summaries.some((s) => s.failures > 0) && (
                <details className="lab-control-group">
                  <summary>Failure accounting</summary>
                  {result.summaries
                    .filter((s) => s.failures > 0)
                    .map((s) => (
                      <p className="field-caption" key={`${s.estimator}:${s.sweepValue}`}>
                        {estimatorNames[s.estimator]} / {s.sweepValue}:{' '}
                        {Object.entries(s.failureReasons)
                          .map(([reason, count]) => `${count} × ${reason}`)
                          .join('; ')}
                      </p>
                    ))}
                </details>
              )}
              {records.length > 0 && (
                <>
                  <div className="lab-epoch">
                    <NumberField
                      label="Result epoch"
                      value={index}
                      unit={`/ ${records.length - 1}`}
                      min={0}
                      max={records.length - 1}
                      step={1}
                      onChange={setIndex}
                    />
                    <input
                      type="range"
                      aria-label="Result epoch slider"
                      min="0"
                      max={records.length - 1}
                      value={index}
                      onChange={(e) => setIndex(Number(e.target.value))}
                    />
                    <Button
                      onClick={() => {
                        view.show(result, index);
                        setTime(selected?.time ?? 0);
                        play(false);
                        onOpenChange(false);
                      }}
                    >
                      Preview on studio canvas
                    </Button>
                  </div>
                  <p className="field-caption">
                    {selected?.estimator} · trial {(selected?.trial ?? 0) + 1} ·{' '}
                    {selected?.locationId} · t={selected?.time} s · sweep={selected?.sweepValue} ·{' '}
                    {selected?.failure ?? `error ${fmt(selected?.errorM)} m`}
                  </p>
                  <LaboratoryObservations result={result} selected={selected} />
                  <div className="lab-layer-list">
                    {labLayers.map((layer) => (
                      <label className="check-row" key={layer}>
                        <input
                          type="checkbox"
                          checked={view.layers.includes(layer)}
                          onChange={() => view.toggle(layer)}
                        />
                        {labLayerNames[layer]}
                      </label>
                    ))}
                  </div>
                  <LaboratoryCharts result={result} selected={selected} />
                </>
              )}
              {terminal(result.status) && (
                <div className="lab-actions">
                  <Button onClick={() => setPublicationOpen(true)}>Publication exports</Button>
                  <Button
                    onClick={() =>
                      downloadFile(
                        new File(
                          [JSON.stringify(result, null, 2)],
                          `terralab-experiment-${result.id}.json`,
                          { type: 'application/json' },
                        ),
                      )
                    }
                  >
                    Export complete JSON
                  </Button>
                  <Button
                    onClick={() =>
                      downloadFile(
                        new File([experimentCsv(result)], `terralab-epochs-${result.id}.csv`, {
                          type: 'text/csv',
                        }),
                      )
                    }
                  >
                    Export epochs CSV
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await syncExperiment(result);
                        setMessage(
                          'Immutable experiment snapshot saved to your private cloud storage.',
                        );
                      })
                    }
                  >
                    Save private cloud snapshot
                  </Button>
                  <Button
                    onClick={() => {
                      load(structuredClone(result.request.project));
                      setMessage(
                        'Restored the saved network. Experiment outputs remain unchanged.',
                      );
                    }}
                  >
                    Restore snapshot network
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {tab === 'archive' && (
        <>
          <div className="lab-actions">
            <Button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setArchive(await savedExperiments());
                  setMessage('Loaded local snapshots.');
                })
              }
            >
              Local snapshots
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setArchive(await cloudExperiments());
                  setMessage('Loaded private cloud snapshots.');
                })
              }
            >
              Load private cloud snapshots
            </Button>
            <Button onClick={() => input.current?.click()}>Import experiment JSON</Button>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void action(async () => {
                    const imported = readExperiment(await file.text());
                    await saveExperiment(imported);
                    setArchive(await savedExperiments());
                    setResult(imported);
                    setIndex(0);
                    setTab('results');
                  });
                e.target.value = '';
              }}
            />
          </div>
          {archive.length === 0 && (
            <p className="small-copy">
              No snapshots in this source. Completed, cancelled and failed jobs are retained
              locally; cloud storage is optional.
            </p>
          )}
          {archive.map((saved) => (
            <button
              className="lab-snapshot"
              key={saved.id}
              onClick={() => {
                setResult(saved);
                setIndex(0);
                setTab('results');
              }}
            >
              <b>{saved.request.project.name}</b>
              <span>
                {new Date(saved.createdAt).toLocaleString()} · {saved.status} · {saved.completed}/
                {saved.planned} epochs · seed {saved.request.config.seed}
              </span>
            </button>
          ))}
        </>
      )}
      {result && terminal(result.status) && (
        <PublicationDialog
          result={result}
          open={publicationOpen}
          onOpenChange={setPublicationOpen}
        />
      )}
    </Dialog>
  );
}
