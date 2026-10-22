'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Crosshair,
  Maximize,
  Minus,
  Plus,
  MousePointer2,
  Move,
  Radio,
  ScanLine,
  Square,
  Route,
  PenTool,
  Ruler,
  Grid2X2,
  Tags,
  Magnet,
  Layers,
  Copy,
  Trash2,
} from 'lucide-react';
import {
  canvasToWorld,
  worldToCanvas,
  distance,
  obstacleVertices,
  positionAt,
  solveProject,
  type Point,
  type NetworkObject,
  type Receiver,
  type Solution,
} from '@terralab/shared';
import { useStudio, type ToolMode } from '@/lib/store';
import { Tool } from './ui/tool';
import { Button } from './ui/button';
import { LaboratoryOverlay } from './laboratory-overlay';
import { useLabView } from '@/lib/lab-view';
const tools: { mode: ToolMode; label: string; icon: typeof Radio }[] = [
  { mode: 'select', label: 'Select / multi-select (V / Shift)', icon: MousePointer2 },
  { mode: 'pan', label: 'Pan canvas (H / middle drag)', icon: Move },
  { mode: 'anchor', label: 'Add transmitter (A)', icon: Radio },
  { mode: 'receiver', label: 'Add receiver (R)', icon: Crosshair },
  { mode: 'obstacle', label: 'Add building (B)', icon: Square },
  { mode: 'polygon', label: 'Draw polygon · Enter to finish', icon: PenTool },
  { mode: 'trajectory', label: 'Draw trajectory · Enter to finish', icon: Route },
  { mode: 'measure', label: 'Measure distance (M)', icon: Ruler },
];
export default function NetworkCanvas({
  verifiedSolution,
  fitOnLoad = false,
  onInitialFit,
  canvasStore,
  readOnly = false,
}: {
  verifiedSolution?: Solution | null;
  fitOnLoad?: boolean;
  onInitialFit?: () => void;
  canvasStore?: typeof useStudio;
  readOnly?: boolean;
}) {
  const useCanvasStore = canvasStore ?? useStudio;
  const { project, selected, tool, time, playing, edit, select, setTool, add, log } =
    useCanvasStore();
  const savedLaboratory = useLabView((s) => s.result);
  const laboratory = readOnly ? null : savedLaboratory;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [measured, setMeasured] = useState(false);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [draft, setDraft] = useState<Point[]>([]);
  const [measure, setMeasure] = useState<Point[]>([]);
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const [menu, setMenu] = useState<Point | null>(null);
  const [layers, setLayers] = useState(false);
  const drag = useRef<{
    start: Point;
    pan: Point;
    positions: NetworkObject[];
    ids: string[];
    kind: 'pan' | 'objects' | 'box';
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      setMeasured(true);
    });
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);
  const view = { ...size, zoom: project.canvas.zoom, pan: project.canvas.pan };
  const screen = (p: Point) => worldToCanvas(p, view);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: Point, snap = true) => {
    const w = canvasToWorld(p, view);
    return project.canvas.snap && snap
      ? { x: Math.round(w.x / 5) * 5, y: Math.round(w.y / 5) * 5 }
      : w;
  };
  const receivers = project.objects.filter(
    (o): o is Receiver => o.kind === 'receiver' && o.enabled,
  );
  const focus = receivers.find((r) => selected.includes(r.id)) ?? receivers[0];
  const result = useMemo(() => {
    if (laboratory) return null;
    if (!focus) return null;
    const live = solveProject(project, focus, time);
    return verifiedSolution ? { ...live, solution: verifiedSolution, error: null } : live;
  }, [project, focus, time, verifiedSolution, laboratory]);
  const fit = useCallback(() => {
    const points = project.objects.flatMap((o) =>
      o.kind === 'trajectory'
        ? o.points
        : o.kind === 'obstacle'
          ? obstacleVertices(o)
          : [{ x: o.x, y: o.y }],
    );
    if (!points.length) return;
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y));
    const z = Math.max(
      0.2,
      Math.min(
        12,
        (size.width - 120) / Math.max(20, maxX - minX),
        (size.height - (readOnly ? 150 : 255)) / Math.max(20, maxY - minY),
      ),
    );
    edit((p) => {
      p.canvas.zoom = z;
      p.canvas.pan = { x: (-(minX + maxX) / 2) * z, y: 27.5 + ((minY + maxY) / 2) * z };
    });
  }, [project.objects, size.width, size.height, edit, readOnly]);
  const fittedViewport = useRef('');
  useEffect(() => {
    if (!fitOnLoad || !measured || size.width <= 0 || size.height <= 0) return;
    const key = [project.id, size.width, size.height].join(':');
    if (fittedViewport.current === key) return;
    fittedViewport.current = key;
    fit();
    onInitialFit?.();
  }, [fitOnLoad, measured, project.id, size.width, size.height, fit, onInitialFit]);
  function zoom(f: number, at = { x: size.width / 2, y: size.height / 2 }) {
    const w = canvasToWorld(at, view);
    const z = Math.min(12, Math.max(0.2, view.zoom * f));
    edit((p) => {
      p.canvas.zoom = z;
      p.canvas.pan = { x: at.x - size.width / 2 - w.x * z, y: at.y - size.height / 2 + w.y * z };
    }, false);
  }
  function finishDraft() {
    if (tool === 'polygon' && draft.length >= 3) {
      const id = crypto.randomUUID(),
        origin = draft[0];
      edit((p) =>
        p.objects.push({
          id,
          kind: 'obstacle',
          name: 'Custom polygon',
          enabled: true,
          ...origin,
          shape: 'polygon',
          width: 1,
          height: 1,
          vertices: draft.map((q) => ({ x: q.x - origin.x, y: q.y - origin.y })),
        }),
      );
      select([id]);
      setDraft([]);
      setTool('select');
    } else if (tool === 'trajectory' && draft.length >= 2) {
      const id = crypto.randomUUID();
      edit((p) =>
        p.objects.push({
          id,
          kind: 'trajectory',
          name: 'Survey route',
          enabled: true,
          ...draft[0],
          points: draft,
          loop: true,
          speed: 2,
        }),
      );
      select([id]);
      setDraft([]);
      setTool('select');
    }
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if (e.key === 'Enter') finishDraft();
      if (e.key === 'Escape') {
        setDraft([]);
        setMeasure([]);
        setMenu(null);
      }
      if (e.key.toLowerCase() === 'f') fit();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });
  useEffect(() => {
    setDraft([]);
    setMeasure([]);
  }, [tool]);
  function down(e: React.PointerEvent<SVGSVGElement>, id?: string) {
    if (e.button === 2) return;
    setMenu(null);
    const point = local(e),
      w = world(point);
    const s = useCanvasStore.getState();
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault();
      drag.current = {
        start: point,
        pan: { ...view.pan },
        positions: [],
        ids: [],
        kind: 'pan',
        moved: false,
      };
    } else if (id && tool === 'select') {
      const ids = e.shiftKey
        ? selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id];
      select(ids);
      if (readOnly) return;
      drag.current = {
        start: point,
        pan: { ...view.pan },
        positions: structuredClone(project.objects.filter((o) => ids.includes(o.id))),
        ids,
        kind: 'objects',
        moved: false,
      };
      if (playing) s.play(false);
    } else if (tool === 'anchor' || tool === 'receiver' || tool === 'obstacle') {
      add(tool, w);
    } else if (tool === 'polygon' || tool === 'trajectory') {
      setDraft((d) => [...d, w]);
    } else if (tool === 'measure') {
      setMeasure((m) => (m.length === 1 ? [m[0], w] : [w]));
    } else {
      if (!e.shiftKey) select([]);
      setBox({ a: point, b: point });
      drag.current = {
        start: point,
        pan: { ...view.pan },
        positions: [],
        ids: e.shiftKey ? selected : [],
        kind: 'box',
        moved: false,
      };
    }
    svg.current?.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const pos = local(e);
    setCursor(world(pos, false));
    const d = drag.current;
    if (!d) return;
    const dx = (pos.x - d.start.x) / view.zoom,
      dy = -(pos.y - d.start.y) / view.zoom;
    if (Math.hypot(dx, dy) < 0.2 && !d.moved) return;
    if (d.kind === 'pan') {
      edit((p) => {
        p.canvas.pan = { x: d.pan.x + pos.x - d.start.x, y: d.pan.y + pos.y - d.start.y };
      }, false);
    } else if (d.kind === 'box') {
      setBox({ a: d.start, b: pos });
    } else {
      if (!d.moved) edit(() => {});
      edit((p) => {
        for (const original of d.positions) {
          const obj = p.objects.find((o) => o.id === original.id)!;
          const x = original.x + dx,
            y = original.y + dy;
          obj.x = p.canvas.snap ? Math.round(x / 5) * 5 : x;
          obj.y = p.canvas.snap ? Math.round(y / 5) * 5 : y;
          if (obj.kind === 'trajectory' && original.kind === 'trajectory')
            obj.points = original.points.map((q) => ({
              x: q.x + obj.x - original.x,
              y: q.y + obj.y - original.y,
            }));
        }
      }, false);
    }
    d.moved = true;
  }
  function up() {
    const d = drag.current;
    if (d?.kind === 'box' && box) {
      const minX = Math.min(box.a.x, box.b.x),
        maxX = Math.max(box.a.x, box.b.x),
        minY = Math.min(box.a.y, box.b.y),
        maxY = Math.max(box.a.y, box.b.y);
      select([
        ...new Set([
          ...d.ids,
          ...project.objects
            .filter((o) => {
              const p = screen(o);
              return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
            })
            .map((o) => o.id),
        ]),
      ]);
    }
    drag.current = null;
    setBox(null);
  }
  const gridStep = project.canvas.zoom * 10;
  const origin = screen({ x: 0, y: 0 });
  const activeTools = tools.find((t) => t.mode === tool);
  return (
    <div className="canvas-wrap" ref={host}>
      <div className="canvas-heading">
        <div>
          <span className="eyebrow">NETWORK WORKSPACE</span>
          <h1>
            Terrestrial network <span>2D</span>
          </h1>
        </div>
        <div className="canvas-meta">
          <span className="status-dot" />{' '}
          {project.objects.filter((o) => o.kind === 'anchor' && o.enabled).length} transmitters
          online <span className="meta-separator">/</span> <span>Cartesian · metres</span>
        </div>
      </div>
      <div className="object-toolbar" role="toolbar" aria-label="Network tools">
        {tools.map(({ mode, label, icon: Icon }, i) => (
          <span key={mode} className={i === 2 || i === 7 ? 'tool-separator' : ''}>
            <Tool
              label={label}
              active={tool === mode}
              disabled={readOnly && !['select', 'pan', 'measure'].includes(mode)}
              onClick={() => setTool(mode)}
            >
              <Icon size={18} />
            </Tool>
          </span>
        ))}
      </div>
      <svg
        ref={svg}
        className={`network-canvas tool-${tool}`}
        width={size.width}
        height={size.height}
        role="application"
        aria-label="Interactive network canvas, coordinates in metres"
        onPointerDown={(e) => down(e)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, local(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(local(e));
        }}
      >
        <defs>
          <pattern
            id="minor-grid"
            x={origin.x}
            y={origin.y}
            width={gridStep}
            height={gridStep}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
              fill="none"
              stroke="var(--grid)"
              strokeWidth=".7"
            />
          </pattern>
          <pattern
            id="major-grid"
            x={origin.x}
            y={origin.y}
            width={gridStep * 5}
            height={gridStep * 5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={gridStep * 5} height={gridStep * 5} fill="url(#minor-grid)" />
            <path
              d={`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`}
              fill="none"
              stroke="var(--grid-major)"
              strokeWidth=".8"
            />
          </pattern>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M-1 1L1-1M0 7L7 0M6 8L8 6" stroke="var(--obstacle-line)" strokeWidth=".6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="var(--canvas)" />
        {project.canvas.grid && <rect width="100%" height="100%" fill="url(#major-grid)" />}
        {project.canvas.grid && (
          <g className="coordinate-labels">
            {Array.from({ length: Math.ceil(size.width / (gridStep * 5)) + 2 }, (_, i) => {
              const x = Math.floor((-size.width / 2 - view.pan.x) / (gridStep * 5)) * 50 + i * 50;
              const p = screen({ x, y: 0 });
              return (
                <text key={x} x={p.x + 4} y={size.height - 16}>
                  {x} m
                </text>
              );
            })}
            {Array.from({ length: Math.ceil(size.height / (gridStep * 5)) + 2 }, (_, i) => {
              const y = Math.floor((view.pan.y - size.height / 2) / (gridStep * 5)) * 50 + i * 50;
              const p = screen({ x: 0, y });
              return (
                <text key={y} x={12} y={p.y - 5}>
                  {y}
                </text>
              );
            })}
          </g>
        )}
        {project.canvas.obstacles &&
          project.objects
            .filter((o) => o.kind === 'obstacle')
            .map((o) => {
              if (o.kind !== 'obstacle') return null;
              const pts = obstacleVertices(o).map(screen);
              const c = screen({ x: o.x + o.width / 2, y: o.y + o.height / 2 });
              return (
                <g
                  key={o.id}
                  opacity={o.enabled ? 1 : 0.35}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    down(e as unknown as React.PointerEvent<SVGSVGElement>, o.id);
                  }}
                  onContextMenu={() => select([o.id])}
                >
                  <polygon
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="var(--obstacle)"
                    stroke={selected.includes(o.id) ? 'var(--cyan)' : 'var(--obstacle-line)'}
                    strokeWidth={selected.includes(o.id) ? 2 : 1}
                  />
                  <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="url(#hatch)" />
                  {project.canvas.labels && (
                    <text className="building-label" x={c.x} y={c.y} textAnchor="middle">
                      {o.name}
                    </text>
                  )}
                </g>
              );
            })}
        {project.canvas.trajectories &&
          project.objects
            .filter((o) => o.kind === 'trajectory')
            .map((o) => {
              if (o.kind !== 'trajectory') return null;
              const pts = (o.loop ? [...o.points, o.points[0]] : o.points).map(screen);
              return (
                <g
                  key={o.id}
                  opacity={o.enabled ? 1 : 0.35}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    down(e as unknown as React.PointerEvent<SVGSVGElement>, o.id);
                  }}
                >
                  <polyline
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={selected.includes(o.id) ? 'var(--cyan)' : 'var(--purple)'}
                    strokeWidth="2"
                    strokeDasharray="6 5"
                  />
                  {o.points.map((q, i) => {
                    const p = screen(q);
                    return (
                      <g key={i}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={5}
                          fill="var(--canvas)"
                          stroke="var(--purple)"
                        />
                        <text x={p.x + 9} y={p.y - 7} className="waypoint-label">
                          W{i + 1}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
        {result &&
          project.canvas.links &&
          result.set.measurements.map((m) => {
            const a = screen(m.anchor),
              p = screen(result.truth);
            const residual =
              result.solution && result.usable.findIndex((x) => x.anchorId === m.anchorId);
            return (
              <g key={m.anchorId} className="measurement-link" pointerEvents="none">
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={m.blocked ? 'var(--amber)' : 'var(--cyan)'}
                  strokeWidth="1"
                  opacity={m.blocked ? 0.45 : 0.35}
                  strokeDasharray={m.blocked ? '4 5' : undefined}
                />
                {project.canvas.labels && (
                  <g transform={`translate(${(a.x + p.x) / 2},${(a.y + p.y) / 2})`}>
                    <rect
                      x="-36"
                      y="-10"
                      width="72"
                      height="20"
                      rx="3"
                      fill="var(--canvas)"
                      opacity=".9"
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      className={m.blocked ? 'range-label blocked' : 'range-label'}
                    >
                      {m.range.toFixed(2)} m
                    </text>
                    <title>
                      {[
                        m.blocked ? 'Geometric obstruction' : 'Line of sight',
                        ' · residual ',
                        typeof residual === 'number' && residual >= 0
                          ? result.solution!.residuals[residual].toFixed(4)
                          : 'excluded',
                        ' m',
                      ].join('')}
                    </title>
                  </g>
                )}
              </g>
            );
          })}
        {project.objects
          .filter((o) => o.kind === 'anchor' || o.kind === 'receiver')
          .map((o) => {
            const pos = o.kind === 'receiver' ? positionAt(o, time, project) : o;
            const p = screen(pos),
              isSelected = selected.includes(o.id),
              rx = o.kind === 'receiver';
            return (
              <g
                key={o.id}
                transform={`translate(${p.x},${p.y})`}
                className={`network-node ${rx ? 'receiver-node' : 'anchor-node'}`}
                role="button"
                tabIndex={0}
                aria-label={`${o.name}, ${o.kind}`}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select([o.id]);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  down(e as unknown as React.PointerEvent<SVGSVGElement>, o.id);
                }}
                onContextMenu={() => select([o.id])}
                opacity={o.enabled ? 1 : 0.35}
              >
                {isSelected && (
                  <>
                    <circle
                      r="32"
                      fill="none"
                      stroke={rx ? 'var(--green)' : 'var(--cyan)'}
                      strokeWidth="1"
                      opacity=".6"
                      strokeDasharray="3 4"
                    />
                    <path
                      d="M-35 -20v-15h15M20 -35h15v15M35 20v15H20M-20 35h-15V20"
                      fill="none"
                      stroke={rx ? 'var(--green)' : 'var(--cyan)'}
                      opacity=".7"
                    />
                  </>
                )}
                {rx ? (
                  <>
                    <circle
                      r="23"
                      fill="var(--receiver-fill)"
                      stroke="var(--green)"
                      strokeWidth="1.5"
                    />
                    <circle r="12" fill="none" stroke="var(--green)" opacity=".45" />
                    <path d="M0-17v8M0 9v8M-17 0h8M9 0h8" stroke="var(--green)" />
                    <circle r="4" fill="var(--green)" />
                  </>
                ) : (
                  <>
                    <path
                      d="M0-24 21-12 21 12 0 24-21 12-21-12Z"
                      fill="var(--node-fill)"
                      stroke="var(--cyan)"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M0-9v17M-7 8h14M-4-3a6 6 0 0 1 0-8M4-3a6 6 0 0 0 0-8M-8 0a11 11 0 0 1 0-14M8 0a11 11 0 0 0 0-14"
                      stroke="var(--cyan)"
                      fill="none"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </>
                )}
                {project.canvas.labels && (
                  <>
                    <text textAnchor="middle" y="47" className="node-label">
                      {o.name}
                    </text>
                    <text textAnchor="middle" y="62" className="node-coordinate">
                      {pos.x.toFixed(1)}, {pos.y.toFixed(1)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        {project.canvas.estimates &&
          result?.solution &&
          (() => {
            const p = screen(result.solution.position),
              truth = screen(result.truth);
            return (
              <g className="estimate" pointerEvents="none">
                <line
                  x1={truth.x}
                  y1={truth.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="var(--purple)"
                  strokeWidth="2"
                />
                <path
                  d={`M${p.x} ${p.y - 8}l8 8-8 8-8-8Z`}
                  fill="var(--purple)"
                  stroke="var(--canvas)"
                  strokeWidth="1.5"
                />
                <title>
                  {[
                    'Estimate (',
                    result.solution.position.x.toFixed(3),
                    ', ',
                    result.solution.position.y.toFixed(3),
                    ') m · error ',
                    distance(result.truth, result.solution.position).toFixed(4),
                    ' m',
                  ].join('')}
                </title>
              </g>
            );
          })()}
        {draft.length > 0 && (
          <g>
            <polyline
              points={[...draft, cursor]
                .map(screen)
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill="none"
              stroke="var(--purple)"
              strokeDasharray="5 4"
            />
            {draft.map((p, i) => {
              const s = screen(p);
              return <circle key={i} cx={s.x} cy={s.y} r="4" fill="var(--purple)" />;
            })}
          </g>
        )}
        {measure.length > 0 &&
          (() => {
            const a = screen(measure[0]),
              b = screen(measure[1] ?? cursor);
            return (
              <g>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--text)"
                  strokeDasharray="5 4"
                />
                <circle cx={a.x} cy={a.y} r="3" fill="var(--text)" />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} className="measure-label">
                  {distance(measure[0], measure[1] ?? cursor).toFixed(2)} m
                </text>
              </g>
            );
          })()}
        {box && (
          <rect
            x={Math.min(box.a.x, box.b.x)}
            y={Math.min(box.a.y, box.b.y)}
            width={Math.abs(box.a.x - box.b.x)}
            height={Math.abs(box.a.y - box.b.y)}
            fill="var(--selection)"
            stroke="var(--cyan)"
          />
        )}
        {!readOnly && <LaboratoryOverlay project={project} view={view} />}
      </svg>
      {draft.length > 0 && (
        <div className="draft-hint">
          {draft.length} points{' '}
          <Button
            size="sm"
            onClick={finishDraft}
            disabled={draft.length < (tool === 'polygon' ? 3 : 2)}
          >
            Finish · Enter
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft([])}>
            Cancel
          </Button>
        </div>
      )}
      <div className="canvas-legend">
        <span>
          <i className="legend-tx" />
          Transmitter
        </span>
        <span>
          <i className="legend-rx" />
          Ground truth
        </span>
        <span>
          <i className="legend-est" />
          Estimate
        </span>
        <span>
          <i className="legend-blocked" />
          Obstructed link
        </span>
      </div>
      <div className="canvas-view-tools">
        <Tool
          label="Toggle grid"
          active={project.canvas.grid}
          onClick={() =>
            edit((p) => {
              p.canvas.grid = !p.canvas.grid;
            })
          }
        >
          <Grid2X2 size={17} />
        </Tool>
        <Tool
          label="Toggle labels"
          active={project.canvas.labels}
          onClick={() =>
            edit((p) => {
              p.canvas.labels = !p.canvas.labels;
            })
          }
        >
          <Tags size={17} />
        </Tool>
        <Tool
          label="Snap to 5 m grid"
          active={project.canvas.snap}
          onClick={() =>
            edit((p) => {
              p.canvas.snap = !p.canvas.snap;
            })
          }
        >
          <Magnet size={17} />
        </Tool>
        <Tool label="Visual layers" active={layers} onClick={() => setLayers(!layers)}>
          <Layers size={17} />
        </Tool>
        <span className="vertical-rule" />
        <Tool label="Fit network (F)" onClick={fit}>
          <Maximize size={17} />
        </Tool>
        <Tool label="Zoom out" onClick={() => zoom(1 / 1.2)}>
          <Minus size={17} />
        </Tool>
        <span className="zoom-value">{Math.round((view.zoom / 4.5) * 100)}%</span>
        <Tool label="Zoom in" onClick={() => zoom(1.2)}>
          <Plus size={17} />
        </Tool>
      </div>
      {layers && (
        <div className="layer-popover">
          <b>Visual layers</b>
          {(['links', 'obstacles', 'trajectories', 'estimates'] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={project.canvas[key]}
                onChange={(e) =>
                  edit((p) => {
                    p.canvas[key] = e.target.checked;
                  })
                }
              />
              {key}
            </label>
          ))}
        </div>
      )}
      <div className="canvas-bottom">
        <span>
          <ScanLine size={12} />
          {readOnly
            ? 'Preview · use Edit canvas to change this saved network'
            : activeTools?.mode === 'select'
              ? 'Drag to move · Shift to multi-select'
              : activeTools?.label}
        </span>
        <span className="mono">
          X {cursor.x.toFixed(1)} <span className="muted">m</span> &nbsp; Y {cursor.y.toFixed(1)}{' '}
          <span className="muted">m</span>
        </span>
        <span className="scale-bar" style={{ width: 20 * view.zoom }}>
          20 m
        </span>
      </div>
      {menu && (
        <div
          className="context-menu"
          style={{
            left: Math.min(menu.x, size.width - 190),
            top: Math.min(menu.y, size.height - 180),
          }}
        >
          <button
            onClick={() => {
              useCanvasStore.getState().duplicate();
              setMenu(null);
            }}
            disabled={readOnly || !selected.length}
          >
            <Copy size={14} />
            Duplicate selection
          </button>
          <button
            className="destructive-action"
            onClick={() => {
              useCanvasStore.getState().remove();
              setMenu(null);
            }}
            disabled={readOnly || !selected.length}
          >
            <Trash2 size={14} />
            Delete selection
          </button>
          <button
            disabled={readOnly}
            onClick={() => {
              add('anchor', world(menu));
              setMenu(null);
            }}
          >
            <Radio size={14} />
            Add transmitter here
          </button>
          <button
            onClick={() => {
              fit();
              setMenu(null);
              log('Viewport fitted to network');
            }}
          >
            <Maximize size={14} />
            Fit network
          </button>
        </div>
      )}
    </div>
  );
}
