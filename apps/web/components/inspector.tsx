'use client';
import { useState, useMemo } from 'react';
import {
  Radio,
  Crosshair,
  Square,
  Route,
  SlidersHorizontal,
  ChevronDown,
  Copy,
  Trash2,
  ArrowRightLeft,
  Plus,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { solveProject, distance, type Receiver, type Solution, type Point } from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { Button } from './ui/button';
import { NumberField } from './ui/number-field';
import { SimulationSettings } from './simulation-settings';
import { useLabView } from '@/lib/lab-view';
import { LaboratoryPreviewFacts } from './laboratory-preview';
const icons = { anchor: Radio, receiver: Crosshair, obstacle: Square, trajectory: Route };
export default function Inspector({ verifiedSolution }: { verifiedSolution?: Solution | null }) {
  const scientificSnapshot = useLabView((s) => s.result);
  const { project, selected, update, edit, time } = useStudio();
  const [tab, setTab] = useState<'properties' | 'simulation'>('properties');
  const o = project.objects.find((o) => selected.includes(o.id));
  const Icon = o ? icons[o.kind] : SlidersHorizontal;
  const receivers = project.objects.filter(
    (o): o is Receiver => o.kind === 'receiver' && o.enabled,
  );
  const receiver = o?.kind === 'receiver' && o.enabled ? o : receivers[0];
  const result = useMemo(() => {
    if (!receiver) return null;
    const live = solveProject(project, receiver, time);
    return verifiedSolution ? { ...live, solution: verifiedSolution, error: null } : live;
  }, [project, receiver, time, verifiedSolution]);
  const n = (label: string, key: string, unit?: string, min?: number, max?: number) =>
    o ? (
      <NumberField
        label={label}
        value={Number((o as unknown as Record<string, unknown>)[key])}
        unit={unit}
        min={min}
        max={max}
        onChange={(v) => update(o.id, { [key]: v })}
      />
    ) : null;
  function updatePosition(axis: 'x' | 'y', v: number) {
    if (!o) return;
    if (o.kind === 'trajectory') {
      const d = v - o[axis];
      update(o.id, { [axis]: v, points: o.points.map((p) => ({ ...p, [axis]: p[axis] + d })) });
    } else update(o.id, { [axis]: v });
  }
  return (
    <aside className="inspector">
      <div className="panel-tabs">
        <button
          className={tab === 'properties' ? 'active' : ''}
          onClick={() => setTab('properties')}
        >
          Properties
        </button>
        <button
          className={tab === 'simulation' ? 'active' : ''}
          onClick={() => setTab('simulation')}
        >
          Simulation
        </button>
        <button
          aria-label="Open simulation settings"
          title="Simulation settings"
          onClick={() => setTab('simulation')}
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>
      <div className="inspector-scroll">
        {tab === 'simulation' ? (
          <SimulationSettings />
        ) : (
          <>
            {!o ? (
              <div className="empty-inspector">
                <SlidersHorizontal size={25} />
                <h3>{selected.length ? 'Selection unavailable' : 'Inspect your network'}</h3>
                <p>
                  Select an object on the canvas or from the object list to edit its properties.
                </p>
              </div>
            ) : (
              <>
                <div className="object-identity">
                  <span className={`identity-icon ${o.kind}`}>
                    <Icon size={21} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      {selected.length > 1
                        ? `${selected.length} OBJECTS SELECTED`
                        : o.kind === 'anchor'
                          ? 'TRANSMITTER'
                          : o.kind.toUpperCase()}
                    </span>
                    <h2>{o.name}</h2>
                  </div>
                  <span className={o.enabled ? 'online-pill' : 'offline-pill'}>
                    {o.enabled ? 'Active' : 'Off'}
                  </span>
                </div>
                {selected.length > 1 && (
                  <p className="info-note">
                    Editing {o.name}. Drag, duplicate or delete applies to the whole selection.
                  </p>
                )}
                <label className="text-field">
                  Object name
                  <input
                    aria-label="Object name"
                    key={o.id + o.name}
                    defaultValue={o.name}
                    maxLength={80}
                    onBlur={(e) => {
                      if (e.target.value.trim()) update(o.id, { name: e.target.value.trim() });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={o.enabled}
                    onChange={(e) => update(o.id, { enabled: e.target.checked })}
                  />
                  Enabled in simulation
                </label>
                <section className="property-section">
                  <div className="section-title">
                    POSITION <span>WORLD COORDINATES</span>
                  </div>
                  <div className="field-pair">
                    <NumberField
                      label="X position"
                      value={o.x}
                      unit="m"
                      min={-1e6}
                      max={1e6}
                      onChange={(v) => updatePosition('x', v)}
                    />
                    <NumberField
                      label="Y position"
                      value={o.y}
                      unit="m"
                      min={-1e6}
                      max={1e6}
                      onChange={(v) => updatePosition('y', v)}
                    />
                  </div>
                  {o.kind === 'receiver' && n('Altitude', 'altitude', 'm')}
                  <p className="field-caption">
                    {o.kind === 'receiver'
                      ? 'Initial position at t = 0. Altitude is metadata for the 2D baseline.'
                      : 'Surveyed Cartesian coordinates in metres.'}
                  </p>
                </section>
                {o.kind === 'anchor' && (
                  <>
                    <section className="property-section">
                      <div className="section-title">RADIO CONFIGURATION</div>
                      {n('Transmit power', 'power', 'dBm', -100, 100)}
                      {n('Carrier frequency', 'frequency', 'MHz', 0.001, 100000)}
                      {n('Bandwidth', 'bandwidth', 'MHz', 0.001, 10000)}
                    </section>
                    <section className="property-section">
                      <div className="section-title">TIMING & CALIBRATION</div>
                      {n('Timing offset', 'timingOffset', 'ns')}
                      {n('Timing uncertainty', 'timingUncertainty', 'ns', 0)}
                      {n('Clock drift', 'clockDrift', 'ppm')}
                      {n('Hardware delay', 'hardwareDelay', 'ns')}
                      <p className="field-caption">
                        Phase 1 preview assumes compensation. The scientific laboratory injects
                        these residual timing/hardware errors; 1 ns corresponds to 0.299792458 m
                        one-way and 1 ppm drift adds 1,000 ns per second.
                      </p>
                    </section>
                    <section className="property-section">
                      <div className="section-title">RANGE MEASUREMENT</div>
                      {n('Range noise σ', 'noise', 'm', 0, 1000)}
                      <p className="field-caption">Set σ to 0 for noiseless recovery.</p>
                    </section>
                  </>
                )}
                {o.kind === 'receiver' && (
                  <>
                    <section className="property-section">
                      <div className="section-title">RECEIVER MODEL</div>
                      <label className="select-field">
                        Device type
                        <select
                          value={o.deviceType}
                          onChange={(e) => update(o.id, { deviceType: e.target.value })}
                        >
                          <option value="rover">Survey rover</option>
                          <option value="vehicle">Vehicle</option>
                          <option value="handheld">Handheld</option>
                        </select>
                      </label>
                      {n('Clock offset', 'clockOffset', 'ns')}
                      {n('Clock drift', 'clockDrift', 'ppm')}
                    </section>
                    <section className="property-section">
                      <div className="section-title">
                        MOBILITY MODEL <ChevronDown size={12} />
                      </div>
                      <label className="select-field">
                        Motion
                        <select
                          aria-label="Motion"
                          value={o.mobility}
                          onChange={(e) => update(o.id, { mobility: e.target.value })}
                        >
                          <option value="stationary">Stationary</option>
                          <option value="velocity">Constant velocity</option>
                          <option value="linear">Linear trajectory</option>
                          <option value="circular">Circular trajectory</option>
                          <option value="random">Random waypoint</option>
                          <option value="waypoints">User-defined waypoints</option>
                        </select>
                      </label>
                      {n('Speed', 'speed', 'm/s', 0, 1000)}
                      {n('Heading', 'heading', '°')}
                      {n('Update interval', 'updateInterval', 's', 0.1, 60)}
                      {o.mobility === 'circular' && n('Circle radius', 'radius', 'm', 0.001, 10000)}
                      {o.mobility === 'waypoints' && (
                        <>
                          <label className="select-field">
                            Trajectory
                            <select
                              value={o.trajectoryId ?? ''}
                              onChange={(e) =>
                                update(o.id, { trajectoryId: e.target.value || null })
                              }
                            >
                              <option value="">Select a trajectory…</option>
                              {project.objects
                                .filter((t) => t.kind === 'trajectory')
                                .map((t) => (
                                  <option value={t.id} key={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <p className="field-caption">
                            Waypoint playback uses the selected trajectory’s speed. Draw a path with
                            the route tool.
                          </p>
                        </>
                      )}
                    </section>
                  </>
                )}
                {o.kind === 'obstacle' && (
                  <section className="property-section">
                    <div className="section-title">OBSTACLE GEOMETRY</div>
                    <label className="select-field">
                      Shape
                      <select
                        value={o.shape}
                        onChange={(e) =>
                          update(o.id, {
                            shape: e.target.value,
                            ...(e.target.value === 'wall' ? { height: 1 } : {}),
                          })
                        }
                      >
                        <option value="rectangle">Rectangular building</option>
                        <option value="wall">Wall</option>
                        <option value="polygon">Custom polygon</option>
                      </select>
                    </label>
                    {o.shape !== 'polygon' ? (
                      <>
                        {n('Width (X)', 'width', 'm', 0.1, 10000)}
                        {n('Depth (Y)', 'height', 'm', 0.1, 10000)}
                      </>
                    ) : (
                      <PointEditor
                        points={o.vertices}
                        onChange={(points) => update(o.id, { vertices: points })}
                        minimum={3}
                        relative
                      />
                    )}
                    {(['verticalHeight', 'baseElevation'] as const).map((key) => (
                      <div key={key}>
                        {o[key] === undefined ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              edit((p) => {
                                p.schemaVersion = 2;
                                const target = p.objects.find((x) => x.id === o.id);
                                if (target?.kind === 'obstacle')
                                  target[key] = key === 'verticalHeight' ? 10 : 0;
                              })
                            }
                          >
                            Set{' '}
                            {key === 'verticalHeight' ? 'height (Z): 10 m' : 'base elevation: 0 m'}
                          </Button>
                        ) : (
                          <>
                            <NumberField
                              label={key === 'verticalHeight' ? 'Height (Z)' : 'Base elevation (Z)'}
                              value={o[key]!}
                              unit="m"
                              min={key === 'verticalHeight' ? 0.01 : -1000000}
                              max={key === 'verticalHeight' ? 10000 : 1000000}
                              onChange={(v) => update(o.id, { [key]: v })}
                            />
                            <Button
                              size="sm"
                              onClick={() =>
                                edit((p) => {
                                  const target = p.objects.find((x) => x.id === o.id);
                                  if (target?.kind === 'obstacle') delete target[key];
                                })
                              }
                            >
                              Clear {key === 'verticalHeight' ? 'height' : 'base elevation'}
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    <p className="field-caption">
                      {o.verticalHeight === undefined
                        ? 'Physical height unknown; 3D may use a labelled illustrative extrusion.'
                        : 'Physical height entered by the user.'}{' '}
                      {o.baseElevation === undefined
                        ? 'Base elevation unknown; shown relative to presentation ground.'
                        : 'Base elevation entered by the user.'}{' '}
                      Setting dimensions opts this project into schema 2; old clients cannot open
                      it.
                    </p>
                    <p className="field-caption">
                      Footprint intersections and positioning remain 2D. Vertical dimensions
                      describe the scene and do not alter the approved propagation or solver model.
                    </p>
                  </section>
                )}
                {o.kind === 'trajectory' && (
                  <section className="property-section">
                    <div className="section-title">WAYPOINT TRAJECTORY</div>
                    {n('Path speed', 'speed', 'm/s', 0, 1000)}
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={o.loop}
                        onChange={(e) => update(o.id, { loop: e.target.checked })}
                      />
                      Loop path
                    </label>
                    <Button
                      size="sm"
                      onClick={() => update(o.id, { points: [...o.points].reverse() })}
                    >
                      <ArrowRightLeft size={13} />
                      Reverse path
                    </Button>
                    <PointEditor
                      points={o.points}
                      onChange={(points) => update(o.id, { points })}
                      minimum={1}
                    />
                  </section>
                )}
                <div className="object-actions">
                  <Button size="sm" onClick={() => useStudio.getState().duplicate()}>
                    <Copy size={13} />
                    Duplicate
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => useStudio.getState().remove()}>
                    <Trash2 size={13} />
                    Delete
                  </Button>
                </div>
                <p className="object-id mono">ID · {o.id}</p>
              </>
            )}
          </>
        )}
      </div>
      {scientificSnapshot ? (
        <LaboratoryPreviewFacts compact />
      ) : (
        <div className="solver-summary">
          <div className="section-title">
            BASELINE SOLUTION{' '}
            <span className={result?.solution ? 'good' : 'warning'}>
              {result?.solution ? (
                <>
                  <Check size={12} />
                  VALID FIX
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  NO FIX
                </>
              )}
            </span>
          </div>
          {result?.solution ? (
            <>
              <div className="position-error">
                <span>Position error</span>
                <strong data-testid="position-error">
                  {distance(result.truth, result.solution.position).toFixed(3)} <small>m</small>
                </strong>
              </div>
              <div className="solver-facts">
                <span>
                  Usable anchors
                  <b>
                    {result.usable.length} / {result.set.measurements.length}
                  </b>
                </span>
                <span>
                  Condition number<b>{result.solution.condition.toFixed(2)}</b>
                </span>
                <span>
                  Range residual RMS<b>{result.solution.rms.toFixed(3)} m</b>
                </span>
              </div>
            </>
          ) : (
            <p className="small-copy warning">
              {result?.error ?? 'Add an enabled receiver and at least three non-collinear anchors.'}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
function PointEditor({
  points,
  onChange,
  minimum,
  relative = false,
}: {
  points: Point[];
  onChange: (p: Point[]) => void;
  minimum: number;
  relative?: boolean;
}) {
  return (
    <div className="point-editor">
      <p className="field-caption">
        {relative ? 'Local offsets from obstacle origin' : 'World coordinates'} · metres
      </p>
      {points.map((p, i) => (
        <div key={i} className="point-row">
          <span>{i + 1}</span>
          {(['x', 'y'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={`${axis.toUpperCase()} ${i + 1}`}
              value={p[axis]}
              onChange={(v) => onChange(points.map((q, j) => (j === i ? { ...q, [axis]: v } : q)))}
            />
          ))}
          <button
            className="destructive-action"
            aria-label={`Remove point ${i + 1}`}
            disabled={points.length <= minimum}
            onClick={() => onChange(points.filter((_, j) => i !== j))}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        onClick={() => onChange([...points, { x: points.at(-1)!.x + 5, y: points.at(-1)!.y + 5 }])}
      >
        <Plus size={13} />
        Add point
      </Button>
    </div>
  );
}
