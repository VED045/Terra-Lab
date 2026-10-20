'use client';
import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  GizmoHelper,
  GizmoViewport,
  Line,
  TransformControls,
} from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlType } from 'three-stdlib';
import {
  obstacleVertices,
  positionAt,
  solveProject,
  isLightTheme,
  type NetworkObject,
  type Project,
  type Receiver,
  type Solution,
} from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { useSceneView, sceneMutationAllowed } from '@/lib/scene-view';
import {
  fromScene,
  toScene,
  objectPosition,
  sceneBounds,
  translatedObject,
  recordedScene,
  type XYZ,
} from '@/lib/scene-model';
import { useLabView } from '@/lib/lab-view';
import type { ExperimentResult } from '@/lib/laboratory';

type Props = {
  unit: number;
  onLost: () => void;
  onReady: () => void;
  onStats: (text: string) => void;
  verifiedSolution?: Solution | null;
};
const colors = {
  anchor: '#139faa',
  receiver: '#49ae7e',
  truth: '#39a778',
  estimate: '#a98ae4',
  used: '#529dae',
  NLOS: '#df9a38',
  blocked: '#d29142',
  missing: '#87909b',
  rejected: '#e46d73',
};
function Segment({
  points,
  color,
  dashed = false,
  width = 1.5,
}: {
  points: XYZ[];
  color: string;
  dashed?: boolean;
  width?: number;
}) {
  const unit = useContextUnit();
  return points.length > 1 ? (
    <Line
      points={points.map((p) => toScene(p, unit))}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashSize={2 / unit}
      gapSize={1 / unit}
    />
  ) : null;
}
// The rendering root owns the scale; all canonical domain coordinates stay in metres.
const Unit = createContext(1);
const useContextUnit = () => useContext(Unit);

function CameraRig({ project, unit }: { project: Project; unit: number }) {
  const view = useSceneView();
  const controls = useRef<OrbitControlType>(null);
  const camera = useThree((s) => s.camera),
    invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const stored = useLabView.getState();
    const data = stored.result ? recordedScene(project, stored.result, stored.index) : null;
    const extra: XYZ[] = data
      ? [
          data.truth,
          ...(data.estimate ? [data.estimate] : []),
          ...data.path.flatMap((p) => (p.estimate ? [p.truth, p.estimate] : [p.truth])),
        ]
      : [];
    const { center, span } = sceneBounds(project, view.elevation, useStudio.getState().time, extra);
    const c = new THREE.Vector3(...toScene(center, unit));
    const distance = (span / unit) * 1.75;
    const direction =
      view.preset === 'top'
        ? new THREE.Vector3(0, 1, 0.0001)
        : view.preset === 'front'
          ? new THREE.Vector3(0, 0, 1)
          : view.preset === 'side'
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0.85, 0.8, 1).normalize();
    camera.position.copy(c).addScaledVector(direction, distance);
    camera.near = Math.max(0.001, span / unit / 10000);
    camera.far = Math.max(1000, distance * 100);
    if (camera instanceof THREE.OrthographicCamera)
      camera.zoom = Math.max(0.0001, Math.min(size.width, size.height) / ((span / unit) * 1.8));
    if (camera instanceof THREE.PerspectiveCamera) camera.fov = 45;
    camera.up.set(0, 1, 0);
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    controls.current?.target.copy(c);
    controls.current?.update();
    invalidate();
    // Editing geometry must not reset a user's camera. Fit/reset/preset are explicit actions.
  }, [camera, unit, view.cameraRevision, view.projection, project.id, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      minDistance={0.01 / unit}
      maxDistance={1e8 / unit}
      screenSpacePanning
    />
  );
}
function Lifecycle({ onLost, onReady, onStats }: Pick<Props, 'onLost' | 'onReady' | 'onStats'>) {
  const gl = useThree((s) => s.gl);
  const timer = useRef(0),
    frames = useRef(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    const lost = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', lost);
    onReady();
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      gl.info.autoReset = previousAutoReset;
    };
  }, [gl, onLost, onReady]);
  useFrame((_, delta) => {
    timer.current += delta;
    frames.current++;
    if (frames.current <= 3 || timer.current > 1) {
      onStats(gl.info.render.calls + ' draw calls · ' + gl.info.memory.geometries + ' geometries');
      timer.current = 0;
    }
    // GizmoHelper renders the main scene and HUD at priority 1; count both passes.
    gl.info.reset();
  }, 2);
  return null;
}
function Nodes({
  objects,
  project,
  time,
  elevation,
  kind,
  radius,
}: {
  objects: NetworkObject[];
  project: Project;
  time: number;
  elevation: boolean;
  kind: 'anchor' | 'receiver';
  radius: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null),
    unit = useContextUnit();
  const select = useStudio((s) => s.select),
    selected = useStudio((s) => s.selected);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (!mesh.current) return;
    objects.forEach((o, index) => {
      dummy.position.set(...toScene(objectPosition(o, project, time, elevation), unit));
      dummy.rotation.set(kind === 'anchor' ? Math.PI : 0, 0, 0);
      const scale = (radius / unit) * (selected.includes(o.id) ? 1.25 : 1);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
      mesh.current!.setColorAt(index, new THREE.Color(o.enabled ? colors[kind] : '#87909b'));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [objects, project, time, elevation, kind, radius, unit, dummy, selected]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, objects.length]}
      onClick={(e) => {
        e.stopPropagation();
        const o = objects[e.instanceId ?? -1];
        if (o) select(e.shiftKey ? [...new Set([...useStudio.getState().selected, o.id])] : [o.id]);
      }}
    >
      {kind === 'anchor' ? (
        <coneGeometry args={[1, 2.5, 6]} />
      ) : (
        <sphereGeometry args={[1, 12, 8]} />
      )}
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}
function Obstacle({
  object,
  depth,
  selected,
}: {
  object: Extract<NetworkObject, { kind: 'obstacle' }>;
  depth: number;
  selected: boolean;
}) {
  const unit = useContextUnit(),
    select = useStudio((s) => s.select);
  const geometry = useMemo(() => {
    const points = obstacleVertices(object),
      shape = new THREE.Shape();
    points.forEach((p, i) =>
      i ? shape.lineTo(p.x / unit, p.y / unit) : shape.moveTo(p.x / unit, p.y / unit),
    );
    shape.closePath();
    return depth > 0
      ? new THREE.ExtrudeGeometry(shape, { depth: depth / unit, bevelEnabled: false })
      : new THREE.ShapeGeometry(shape);
  }, [object, depth, unit]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        select([object.id]);
      }}
    >
      <meshStandardMaterial
        color={selected ? '#cf9b53' : '#6a7d8b'}
        transparent
        opacity={0.65}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
function Translation({
  object,
  unit,
  span,
}: {
  object: NetworkObject;
  unit: number;
  span: number;
}) {
  const group = useRef<THREE.Group>(null),
    dragging = useRef(false);
  const view = useSceneView(),
    s = useStudio();
  const z = object.kind === 'receiver' && view.elevation ? object.altitude : 0;
  const position = toScene({ x: object.x, y: object.y, z }, unit);
  useEffect(() => {
    if (group.current && !dragging.current) group.current.position.set(...position);
  }, [object.x, object.y, z, unit]);
  if (!view.editable || s.playing || s.time !== 0) return null;
  const vertical = view.axis === 'z';
  const supported = !vertical || (object.kind === 'receiver' && view.elevation);
  if (!supported) return null;
  return (
    <>
      <group ref={group} position={position}>
        <mesh>
          <boxGeometry
            args={[(span * 0.035) / unit, (span * 0.035) / unit, (span * 0.035) / unit]}
          />
          <meshBasicMaterial color="#e2ad4d" wireframe />
        </mesh>
      </group>
      <TransformControls
        object={group as React.RefObject<THREE.Object3D>}
        mode="translate"
        space="world"
        showX={!vertical && view.axis !== 'y'}
        showY={vertical}
        showZ={!vertical && view.axis !== 'x'}
        translationSnap={view.snap > 0 ? view.snap / unit : null}
        size={0.8}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onMouseUp={() => {
          dragging.current = false;
          if (!group.current || !sceneMutationAllowed()) return;
          const target = fromScene(
            group.current.position.toArray() as [number, number, number],
            unit,
          );
          s.edit((p) => {
            const i = p.objects.findIndex((o) => o.id === object.id);
            if (i >= 0) p.objects[i] = translatedObject(p.objects[i], target, view.snap, view.axis);
          });
        }}
      />
    </>
  );
}
function Recorded({
  project,
  result,
  index,
  radius,
}: {
  project: Project;
  result: ExperimentResult;
  index: number;
  radius: number;
}) {
  const unit = useContextUnit(),
    view = useSceneView();
  const data = useMemo(() => recordedScene(project, result, index), [project, result, index]);
  if (!data) return null;
  const layers = view.layers;
  const lines: ColoredSegment[] = [];
  for (let i = 1; i < data.path.length; i++) {
    const a = data.path[i - 1],
      b = data.path[i];
    if (layers.includes('truth')) lines.push({ points: [a.truth, b.truth], color: colors.truth });
    if (layers.includes('estimates') && a.estimate && b.estimate && !b.breakEstimate)
      lines.push({ points: [a.estimate, b.estimate], color: colors.estimate });
  }
  return (
    <group>
      <SegmentBatch segments={lines} />
      {layers.includes('truth') && (
        <mesh position={toScene(data.truth, unit)}>
          <sphereGeometry args={[(radius * 0.7) / unit, 12, 8]} />
          <meshBasicMaterial color={colors.truth} />
        </mesh>
      )}
      {layers.includes('estimates') && data.estimate && (
        <mesh position={toScene(data.estimate, unit)}>
          <octahedronGeometry args={[radius / unit]} />
          <meshBasicMaterial color={colors.estimate} />
        </mesh>
      )}
      {layers.includes('errors') && data.estimate && (
        <Segment points={[data.truth, data.estimate]} color="#e2ad4d" width={3} />
      )}
      {layers.includes('links') &&
        [false, true].map((dashed) => (
          <SegmentBatch
            key={String(dashed)}
            dashed={dashed}
            segments={data.links
              .slice(0, 1000)
              .filter((l) => (l.status !== 'used') === dashed)
              .map((l) => ({
                points: [l.from, l.to],
                color: colors[l.status as keyof typeof colors] ?? colors.used,
              }))}
          />
        ))}
      {data.record.ellipse && layers.includes('estimates') && data.estimate && (
        <Segment
          points={Array.from({ length: 65 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2,
              e = data.record.ellipse!,
              angle = e.angle;
            return {
              x:
                data.estimate!.x +
                e.major * Math.cos(a) * Math.cos(angle) -
                e.minor * Math.sin(a) * Math.sin(angle),
              y:
                data.estimate!.y +
                e.major * Math.cos(a) * Math.sin(angle) +
                e.minor * Math.sin(a) * Math.cos(angle),
              z: 0,
            };
          })}
          color={colors.estimate}
        />
      )}
    </group>
  );
}
function Content({ unit, verifiedSolution }: Pick<Props, 'unit' | 'verifiedSolution'>) {
  const s = useStudio(),
    view = useSceneView(),
    lab = useLabView();
  const { project, time, selected } = s,
    { span } = sceneBounds(project, view.elevation),
    radius = span * 0.013;
  const light = isLightTheme(project.canvas.theme),
    layers = view.layers;
  const receiver = project.objects.find((o): o is Receiver => o.kind === 'receiver' && o.enabled);
  const live = useMemo(
    () => (!lab.result && receiver ? solveProject(project, receiver, time) : null),
    [project, receiver, time, lab.result],
  );
  const estimate = verifiedSolution?.position ?? live?.solution?.position;
  const point = live?.truth;
  const visible = (kind: NetworkObject['kind']) => project.objects.filter((o) => o.kind === kind);
  const chosen = project.objects.find((o) => selected.includes(o.id));
  function groundClick(e: ThreeEvent<MouseEvent>) {
    if (!sceneMutationAllowed()) return;
    const kind = useStudio.getState().tool;
    if (!['anchor', 'receiver', 'obstacle', 'trajectory'].includes(kind)) return;
    const p = fromScene(e.point.toArray() as [number, number, number], unit);
    const snap = view.snap;
    s.add(kind as NetworkObject['kind'], {
      x: snap ? Math.round(p.x / snap) * snap : p.x,
      y: snap ? Math.round(p.y / snap) * snap : p.y,
    });
    s.setTool('select');
  }
  return (
    <Unit.Provider value={unit}>
      <color attach="background" args={[light ? '#eef3f7' : '#0c1621']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[span / unit, (span * 2) / unit, span / unit]} intensity={2} />
      <CameraRig project={project} unit={unit} />
      {view.ground && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.015 / unit, 0]}
          onClick={groundClick}
        >
          <planeGeometry
            args={[Math.max(1000, span * 10) / unit, Math.max(1000, span * 10) / unit]}
          />
          <meshStandardMaterial color={light ? '#e6edf1' : '#101e2a'} side={THREE.DoubleSide} />
        </mesh>
      )}
      {view.grid && (
        <gridHelper
          args={[
            (view.gridStep * 20) / unit,
            20,
            light ? '#a6bac7' : '#43566a',
            light ? '#d0dbe3' : '#253647',
          ]}
        />
      )}
      <axesHelper args={[Math.max(10, span * 0.3) / unit]} />
      {view.planes &&
        [0, 1].map((n) => (
          <mesh key={n} rotation={n === 0 ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
            <planeGeometry args={[(span * 2) / unit, (span * 2) / unit]} />
            <meshBasicMaterial
              color={n ? '#4499c5' : '#db7a5c'}
              opacity={0.08}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      {layers.includes('anchors') && (
        <Nodes
          objects={visible('anchor')}
          project={project}
          time={time}
          elevation={view.elevation}
          kind="anchor"
          radius={radius}
        />
      )}
      {layers.includes('receivers') && (
        <Nodes
          objects={visible('receiver')}
          project={project}
          time={time}
          elevation={view.elevation && !lab.result}
          kind="receiver"
          radius={radius}
        />
      )}
      {layers.includes('obstacles') &&
        visible('obstacle').map((o) => (
          <Obstacle
            key={o.id}
            object={o as Extract<NetworkObject, { kind: 'obstacle' }>}
            depth={view.extrusion}
            selected={selected.includes(o.id)}
          />
        ))}
      {layers.includes('paths') &&
        visible('trajectory').map(
          (o) =>
            o.kind === 'trajectory' && (
              <group key={o.id}>
                <Segment
                  points={(o.loop ? [...o.points, o.points[0]] : o.points).map((p) => ({
                    ...p,
                    z: 0,
                  }))}
                  color="#9c86d2"
                  dashed
                />
                <mesh
                  position={toScene(o.points[0], unit)}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.select([o.id]);
                  }}
                >
                  <boxGeometry args={[radius / unit, radius / unit, radius / unit]} />
                  <meshBasicMaterial color="#9c86d2" />
                </mesh>
              </group>
            ),
        )}
      {!lab.result && point && estimate && layers.includes('estimates') && (
        <mesh position={toScene(estimate, unit)}>
          <octahedronGeometry args={[(radius * 0.8) / unit]} />
          <meshBasicMaterial color={colors.estimate} />
        </mesh>
      )}
      {!lab.result && point && estimate && layers.includes('errors') && (
        <Segment
          points={[
            { ...point, z: 0 },
            { ...estimate, z: 0 },
          ]}
          color="#e2ad4d"
          width={2}
        />
      )}
      {!lab.result &&
        live &&
        point &&
        layers.includes('links') &&
        [false, true].map((blocked) => (
          <SegmentBatch
            key={String(blocked)}
            dashed={blocked}
            segments={live.set.measurements
              .filter((m) => m.blocked === blocked)
              .map((m) => ({
                points: [
                  { ...m.anchor, z: 0 },
                  { ...point, z: 0 },
                ],
                color: blocked ? colors.blocked : colors.used,
              }))}
          />
        ))}
      {lab.result && (
        <Recorded project={project} result={lab.result} index={lab.index} radius={radius} />
      )}
      {chosen && <Translation key={chosen.id} object={chosen} unit={unit} span={span} />}
      <GizmoHelper alignment="bottom-right" margin={[65, 65]}>
        <GizmoViewport
          disabled
          axisColors={['#d96c65', '#65b87d', '#669fd4']}
          labels={['X', 'Z', '−Y']}
          labelColor={light ? '#203246' : '#ffffff'}
        />
      </GizmoHelper>
    </Unit.Provider>
  );
}
type ScreenLabel = {
  id: string;
  objectId?: string;
  text: string;
  x: number;
  y: number;
  selected?: boolean;
};
function LabelProjector({
  unit,
  onLabels,
}: {
  unit: number;
  onLabels: (labels: ScreenLabel[]) => void;
}) {
  const project = useStudio((s) => s.project),
    time = useStudio((s) => s.time),
    selected = useStudio((s) => s.selected);
  const view = useSceneView(),
    lab = useLabView();
  const { camera, size } = useThree();
  const previous = useRef('');
  const items = useMemo(() => {
    if (!view.layers.includes('labels')) return [];
    const { span } = sceneBounds(project);
    const entries: { id: string; objectId?: string; text: string; p: XYZ; selected?: boolean }[] = [
      { id: 'origin', text: 'Origin · presentation Z=0', p: { x: 0, y: 0, z: 0 } },
      { id: 'east', text: 'X East (red)', p: { x: span * 0.3, y: 0, z: 0 } },
      { id: 'north', text: 'Y North (blue)', p: { x: 0, y: span * 0.3, z: 0 } },
      { id: 'up', text: 'Z Up (green)', p: { x: 0, y: 0, z: span * 0.3 } },
    ];
    project.objects.slice(0, 80).forEach((o) => {
      const layer =
        o.kind === 'anchor'
          ? 'anchors'
          : o.kind === 'receiver'
            ? 'receivers'
            : o.kind === 'obstacle'
              ? 'obstacles'
              : 'paths';
      if (view.layers.includes(layer))
        entries.push({
          id: o.id,
          objectId: o.id,
          text: o.name + (!o.enabled ? ' · disabled' : ''),
          p: objectPosition(o, project, time, view.elevation && !lab.result),
          selected: selected.includes(o.id),
        });
    });
    if (lab.result) {
      const data = recordedScene(project, lab.result, lab.index);
      if (data)
        entries.push({
          id: 'recorded',
          text:
            'Recorded ' +
            data.record.estimator +
            ' · ' +
            data.record.time +
            ' s · XY / Z unestimated',
          p: data.truth,
        });
    }
    return entries;
  }, [project, time, selected, view.layers, view.elevation, lab.result, lab.index]);
  useFrame(() => {
    const stamp =
      camera.matrixWorld.elements.join(',') +
      camera.projectionMatrix.elements.join(',') +
      size.width +
      ':' +
      size.height +
      JSON.stringify(items) +
      unit;
    if (stamp === previous.current) return;
    previous.current = stamp;
    const labels: ScreenLabel[] = [];
    for (const item of items) {
      const point = new THREE.Vector3(...toScene(item.p, unit)).project(camera);
      if (point.z < -1 || point.z > 1) continue;
      const x = ((point.x + 1) * size.width) / 2,
        y = ((1 - point.y) * size.height) / 2;
      if (x < 0 || x > size.width || y < 0 || y > size.height) continue;
      labels.push({
        id: item.id,
        objectId: item.objectId,
        text: item.text,
        x,
        y,
        selected: item.selected,
      });
    }
    onLabels(labels);
  });
  return null;
}
type ColoredSegment = { points: [XYZ, XYZ]; color: string };
function SegmentBatch({
  segments,
  dashed = false,
}: {
  segments: ColoredSegment[];
  dashed?: boolean;
}) {
  const unit = useContextUnit(),
    invalidate = useThree((s) => s.invalidate);
  const line = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  useEffect(() => {
    const positions = new Float32Array(segments.length * 6),
      colorsArray = new Float32Array(segments.length * 6);
    segments.forEach((s, i) => {
      positions.set([...toScene(s.points[0], unit), ...toScene(s.points[1], unit)], i * 6);
      const c = new THREE.Color(s.color);
      colorsArray.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    const old = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (old && old.array.length !== positions.length) geometry.dispose();
    const update = (name: string, values: Float32Array, size: number) => {
      const current = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (current && current.array.length === values.length) {
        current.array.set(values);
        current.needsUpdate = true;
      } else geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
    };
    update('position', positions, 3);
    update('color', colorsArray, 3);
    const distances = new Float32Array(segments.length * 2);
    segments.forEach((s, i) => {
      distances[i * 2 + 1] =
        Math.hypot(
          s.points[1].x - s.points[0].x,
          s.points[1].y - s.points[0].y,
          s.points[1].z - s.points[0].z,
        ) / unit;
    });
    update('lineDistance', distances, 1);
    geometry.computeBoundingSphere();
    invalidate();
  }, [segments, unit, geometry, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments ref={line} geometry={geometry}>
      {dashed ? (
        <lineDashedMaterial vertexColors dashSize={2 / unit} gapSize={1 / unit} />
      ) : (
        <lineBasicMaterial vertexColors />
      )}
    </lineSegments>
  );
}

export default function SceneRenderer(props: Props) {
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  const onLabels = useCallback((next: ScreenLabel[]) => setLabels(next), []);
  const projection = useSceneView((s) => s.projection),
    playing = useStudio((s) => s.playing);
  return (
    <div className="scene-render-root">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={playing ? 'always' : 'demand'}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => useStudio.getState().select([])}
      >
        {projection === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 120, 120]} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 120, 120]} fov={45} />
        )}
        <Lifecycle onLost={props.onLost} onReady={props.onReady} onStats={props.onStats} />
        <Content unit={props.unit} verifiedSolution={props.verifiedSolution} />
        <LabelProjector unit={props.unit} onLabels={onLabels} />
      </Canvas>
      <div className="scene-label-overlay">
        {labels.map((label) =>
          label.objectId ? (
            <button
              key={label.id}
              style={{ left: label.x, top: label.y }}
              className={'scene-label scene-projected-label ' + (label.selected ? 'selected' : '')}
              onClick={() => useStudio.getState().select([label.objectId!])}
              data-scene-object-id={label.objectId}
            >
              {label.text}
            </button>
          ) : (
            <span
              key={label.id}
              style={{ left: label.x, top: label.y }}
              className="scene-axis scene-projected-label"
            >
              {label.text}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
