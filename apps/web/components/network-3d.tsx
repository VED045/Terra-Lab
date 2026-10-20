'use client';
import { Component, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { NetworkObject, Solution } from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { useSceneView, sceneMutationAllowed } from '@/lib/scene-view';
import { fromScene, recordedScene, toScene, translatedObject } from '@/lib/scene-model';
import { useLabView } from '@/lib/lab-view';
import { Button } from './ui/button';
import { viewPresetSchema, readViewPresets, type ViewPreset } from '@/lib/view-presets';
const Renderer = dynamic(() => import('./scene-renderer'), {
  ssr: false,
  loading: () => (
    <div className="scene-state" role="status">
      Loading 3D renderer…
    </div>
  ),
});

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function supportedWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
export default function Network3D({ verifiedSolution }: { verifiedSolution?: Solution | null }) {
  const s = useStudio(),
    view = useSceneView(),
    lab = useLabView();
  const [status, setStatus] = useState<'checking' | 'available' | 'ready' | 'unavailable' | 'lost'>(
    'checking',
  );
  const [attempt, setAttempt] = useState(0),
    [unit, setUnit] = useState(1),
    [stats, setStats] = useState('Preparing scene');
  const [presetName, setPresetName] = useState('My view'),
    [savedPresets, setSavedPresets] = useState<ViewPreset[]>([]),
    [presetMessage, setPresetMessage] = useState('');
  useEffect(() => {
    setStatus(supportedWebGL() ? 'available' : 'unavailable');
  }, [attempt]);
  const lost = useCallback(() => setStatus('lost'), []),
    ready = useCallback(() => setStatus('ready'), []);
  const onStats = useCallback((text: string) => setStats(text), []);
  const chosen = s.project.objects.find((o) => s.selected.includes(o.id));
  const recorded = useMemo(
    () => (lab.result ? recordedScene(s.project, lab.result, lab.index) : null),
    [s.project, lab.result, lab.index],
  );
  const readonly = !view.editable;
  function add(kind: NetworkObject['kind']) {
    if (sceneMutationAllowed()) s.add(kind, { x: 0, y: 0 });
  }
  function nudge(axis: 'x' | 'y' | 'z', direction: number) {
    if (!chosen || !sceneMutationAllowed()) return;
    if (axis === 'z' && chosen.kind !== 'receiver') return;
    const target = {
      x: chosen.x,
      y: chosen.y,
      z: chosen.kind === 'receiver' ? chosen.altitude : 0,
    };
    target[axis] += direction * (view.snap || 1);
    s.edit((p) => {
      const i = p.objects.findIndex((o) => o.id === chosen.id);
      if (i >= 0) p.objects[i] = translatedObject(p.objects[i], target, view.snap, axis);
    });
  }
  const fallback = (message: string) => (
    <div className="scene-state" role="alert">
      <strong>{message}</strong>
      <p>The 2D editor remains available with your project and selection intact.</p>
      <Button
        onClick={() => {
          setStatus('checking');
          setAttempt((v) => v + 1);
        }}
      >
        Retry 3D
      </Button>
      <Button onClick={() => view.set({ mode: '2d' })}>Return to 2D</Button>
    </div>
  );
  return (
    <section className="network3d" aria-label="3D scientific workspace">
      <div className="scene-toolbar" aria-label="3D camera and editing controls">
        <div className="scene-camera-buttons">
          <label>
            Camera{' '}
            <select
              aria-label="3D projection"
              value={view.projection}
              onChange={(e) => view.set({ projection: e.target.value as typeof view.projection })}
            >
              <option value="perspective">Perspective</option>
              <option value="orthographic">Orthographic</option>
            </select>
          </label>
          {(['perspective', 'top', 'front', 'side'] as const).map((preset) => (
            <Button
              size="sm"
              key={preset}
              onClick={() => view.camera(preset)}
              aria-label={'3D ' + preset + ' view'}
            >
              {preset[0].toUpperCase() + preset.slice(1)}
            </Button>
          ))}
          <Button size="sm" onClick={() => view.camera(view.preset)}>
            Fit all
          </Button>
          <Button
            size="sm"
            onClick={() => {
              view.set({ projection: 'perspective' });
              view.camera('perspective');
            }}
          >
            Reset camera
          </Button>
          <details className="scene-options">
            <summary>Saved view presets</summary>
            <div className="scene-options-panel">
              <p>
                Browser-local camera preset, projection, units and layers. Scientific settings and
                2D preferences are unchanged. Free-orbit position is not saved.
              </p>
              <input
                aria-label="View preset name"
                value={presetName}
                maxLength={80}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const p = viewPresetSchema.parse({
                      format: 'terralab-view-1',
                      name: presetName,
                      unit,
                      view,
                    });
                    const all = readViewPresets(localStorage.getItem('terralab.views.v1'));
                    const list = [p, ...all.filter((x) => x.name !== p.name)].slice(0, 10);
                    localStorage.setItem('terralab.views.v1', JSON.stringify(list));
                    setSavedPresets(list);
                    setPresetMessage('View saved separately from project data.');
                  } catch (e) {
                    setPresetMessage(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Save view preset
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    setSavedPresets(readViewPresets(localStorage.getItem('terralab.views.v1')));
                    setPresetMessage('');
                  } catch {
                    setPresetMessage(
                      'Saved view preferences are invalid; your project is unaffected.',
                    );
                  }
                }}
              >
                Load view presets
              </Button>
              {savedPresets.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  onClick={() => {
                    view.set(p.view);
                    setUnit(p.unit);
                    view.camera(p.view.preset);
                    setPresetMessage('Applied ' + p.name);
                  }}
                >
                  {p.name}
                </Button>
              ))}
              {presetMessage && <p role="status">{presetMessage}</p>}
            </div>
          </details>
          <details className="scene-options">
            <summary>View & layers</summary>
            <div className="scene-options-panel">
              <label>
                Grid spacing (m)
                <select
                  aria-label="3D grid spacing"
                  value={view.gridStep}
                  onChange={(e) => view.set({ gridStep: Number(e.target.value) })}
                >
                  {[1, 5, 10, 50, 100].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Scene unit
                <select
                  aria-label="3D unit scale"
                  value={unit}
                  onChange={(e) => setUnit(Number(e.target.value))}
                >
                  <option value={1}>1 unit = 1 metre</option>
                  <option value={0.01}>1 unit = 1 centimetre</option>
                  <option value={1000}>1 unit = 1 kilometre</option>
                </select>
              </label>
              <label>
                Legacy illustrative extrusion for obstacles with unknown physical height (m)
                <select
                  aria-label="Illustrative obstacle extrusion"
                  value={view.extrusion}
                  onChange={(e) => view.set({ extrusion: Number(e.target.value) })}
                >
                  {[0, 2, 5, 10, 20].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              {(['grid', 'ground', 'planes', 'elevation'] as const).map((key) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={view[key]}
                    onChange={(e) => view.set({ [key]: e.target.checked })}
                  />
                  {key === 'elevation'
                    ? 'Show receiver altitude metadata'
                    : key === 'planes'
                      ? 'Coordinate planes'
                      : key[0].toUpperCase() + key.slice(1)}
                </label>
              ))}
              <fieldset>
                <legend>Visible layers</legend>
                {(
                  [
                    'anchors',
                    'receivers',
                    'obstacles',
                    'paths',
                    'labels',
                    'links',
                    'truth',
                    'estimates',
                    'errors',
                  ] as const
                ).map((layer) => (
                  <label className="check-row" key={layer}>
                    <input
                      type="checkbox"
                      checked={view.layers.includes(layer)}
                      onChange={() => view.toggle(layer)}
                    />
                    {layer}
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
        </div>
        <div className="scene-edit-buttons">
          <label>
            Translate
            <select
              aria-label="3D translation constraint"
              value={view.axis}
              onChange={(e) => view.set({ axis: e.target.value as typeof view.axis })}
            >
              <option value="xy">XY plane</option>
              <option value="x">X axis</option>
              <option value="y">Y axis</option>
              <option value="z" disabled={chosen?.kind !== 'receiver' || !view.elevation}>
                Z · receiver metadata
              </option>
            </select>
          </label>
          <label>
            Snap
            <select
              aria-label="3D snapping"
              value={view.snap}
              onChange={(e) => view.set({ snap: Number(e.target.value) })}
            >
              <option value={0}>Off</option>
              {[0.1, 1, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} m
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>Add object</summary>
            <div className="scene-add-menu">
              {(['anchor', 'receiver', 'obstacle', 'trajectory'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  disabled={readonly}
                  onClick={() => add(kind)}
                  aria-label={'Add 3D ' + kind + ' at origin'}
                >
                  {kind}
                </Button>
              ))}
            </div>
          </details>
          <Button size="sm" disabled={readonly || !chosen} onClick={s.duplicate}>
            Duplicate selected
          </Button>
          <Button size="sm" disabled={readonly || !chosen} onClick={s.remove}>
            Delete selected
          </Button>
          <Button
            size="sm"
            disabled={readonly || !chosen}
            onClick={() => nudge('x', -1)}
            aria-label="Move selected west"
          >
            X−
          </Button>
          <Button
            size="sm"
            disabled={readonly || !chosen}
            onClick={() => nudge('x', 1)}
            aria-label="Move selected east"
          >
            X+
          </Button>
          <Button
            size="sm"
            disabled={readonly || !chosen}
            onClick={() => nudge('y', -1)}
            aria-label="Move selected south"
          >
            Y−
          </Button>
          <Button
            size="sm"
            disabled={readonly || !chosen}
            onClick={() => nudge('y', 1)}
            aria-label="Move selected north"
          >
            Y+
          </Button>
        </div>
      </div>
      <p className="scene-contract">
        3D view · horizontal positioning only · scientific Z is unestimated. Physical obstacle
        dimensions are user supplied scene metadata. Unknown heights use only the optional
        illustrative fallback.
        {view.elevation ? 'Receiver height is metadata; scientific links stay on XY. ' : ''}
        {readonly
          ? 'Read-only cloud project (or access is still being checked).'
          : 'Drag the translation handles at t=0, or edit initial coordinates in Properties.'}
      </p>
      <div
        className="scene-viewport"
        role="application"
        aria-label="Interactive 3D network canvas, coordinates in metres"
        data-ready={status === 'ready'}
      >
        {status === 'checking' ? (
          <div className="scene-state" role="status">
            Checking WebGL availability…
          </div>
        ) : status === 'unavailable' ? (
          fallback('WebGL 2 is unavailable in this browser')
        ) : status === 'lost' ? (
          fallback('The 3D graphics context was lost')
        ) : (
          <SceneBoundary key={attempt} fallback={fallback('The 3D renderer could not start')}>
            <Renderer
              unit={unit}
              onLost={lost}
              onReady={ready}
              onStats={onStats}
              verifiedSolution={verifiedSolution}
            />
          </SceneBoundary>
        )}
        {!s.project.objects.length && status === 'ready' && (
          <div className="scene-empty" role="status">
            Empty network. Add an object at the origin or import a project.
          </div>
        )}
        <div className="scene-legend">
          ▲ Anchor · ● Receiver / truth · ◆ Estimate · amber Error · dashed Missing / rejected /
          NLOS
        </div>
      </div>
      <div className="scene-footer">
        <span data-testid="scene-stats">
          {s.project.objects.length} objects · {stats}
        </span>
        <span>
          Grid {view.gridStep} m · {unit} m / scene unit · X East / Y North / Z Up
        </span>
      </div>
      {chosen && (
        <div className="scene-selection" aria-live="polite">
          Selected: {chosen.name} · X {chosen.x.toFixed(2)} m · Y {chosen.y.toFixed(2)} m ·{' '}
          {chosen.kind === 'receiver'
            ? 'Altitude metadata ' + chosen.altitude + ' m'
            : chosen.kind === 'obstacle'
              ? 'Physical height ' +
                (chosen.verticalHeight === undefined ? 'unknown' : chosen.verticalHeight + ' m') +
                '; base elevation ' +
                (chosen.baseElevation === undefined
                  ? 'unknown (presentation ground)'
                  : chosen.baseElevation + ' m')
              : 'Z unavailable; presentation plane 0 m'}
          .{' '}
          {chosen.kind === 'receiver' && chosen.mobility === 'waypoints'
            ? 'Waypoint motion follows the path; translate the path to move its route.'
            : ''}
        </div>
      )}
      {lab.result && (
        <details className="scene-recorded">
          <summary>
            Recorded scientific data · {recorded?.record.estimator ?? 'snapshot hidden'}
          </summary>
          {!recorded ? (
            <p>Snapshot hidden: restore its network in Laboratory before previewing.</p>
          ) : (
            <>
              <p data-testid="scene-recorded-position">
                Epoch {lab.index + 1} · {recorded.record.time}s · truth {recorded.truth.x},{' '}
                {recorded.truth.y} m · estimate{' '}
                {recorded.estimate
                  ? recorded.estimate.x + ', ' + recorded.estimate.y + ' m'
                  : 'no fix'}{' '}
                · Z unestimated
              </p>
              <label>
                Recorded epoch
                <input
                  aria-label="3D recorded epoch"
                  type="range"
                  min={0}
                  max={lab.result.records.length - 1}
                  value={lab.index}
                  onChange={(e) => lab.show(lab.result!, Number(e.target.value))}
                />
              </label>
              <table>
                <caption>Stored links (first 100; full values remain in the saved output)</caption>
                <thead>
                  <tr>
                    <th>Anchor / kind</th>
                    <th>Status</th>
                    <th>Value (native units)</th>
                    <th>Residual (native units)</th>
                  </tr>
                </thead>
                <tbody>
                  {recorded.links.slice(0, 100).map((l, i) => (
                    <tr key={i}>
                      <td>
                        {l.id} / {l.kind}
                      </td>
                      <td>{l.status}</td>
                      <td>
                        {l.value === null
                          ? 'no recorded observation'
                          : l.value +
                            ' ' +
                            (l.kind === 'aoa' ? 'rad' : l.kind === 'rss' ? 'dBm' : 'm')}
                      </td>
                      <td>
                        {l.residual === undefined
                          ? 'not recorded'
                          : l.residual +
                            ' ' +
                            (l.kind === 'aoa' ? 'rad' : l.kind === 'rss' ? 'dB' : 'm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </details>
      )}
    </section>
  );
}
