import { newObject, type Project, type Receiver, type Trajectory, type Anchor } from './model';
export const templates = [
  {
    id: 'square',
    name: 'Four-anchor square',
    tag: 'THE BASELINE',
    description: 'A well-conditioned network. Start with the fundamentals.',
    count: 4,
  },
  {
    id: 'outdoor',
    name: 'Outdoor research site',
    tag: 'SIX TRANSMITTERS',
    description: 'A wider network with buildings and redundant observations.',
    count: 6,
  },
  {
    id: 'poor',
    name: 'Geometry matters',
    tag: 'DEGENERATE GEOMETRY',
    description: 'Collinear anchors reveal why placement matters.',
    count: 4,
  },
  {
    id: 'moving',
    name: 'A receiver in motion',
    tag: 'MOBILITY STUDY',
    description: 'Follow a rover along a repeatable waypoint trajectory.',
    count: 4,
  },
];
export function createTemplate(key = 'outdoor', id = crypto.randomUUID()): Project {
  const square = [
    [0, 0],
    [100, 0],
    [100, 80],
    [0, 80],
  ];
  const coords =
    key === 'outdoor'
      ? [
          [0, 0],
          [60, -10],
          [120, 0],
          [120, 85],
          [60, 100],
          [0, 85],
        ]
      : key === 'poor'
        ? [
            [0, 0],
            [30, 0],
            [60, 0],
            [100, 0],
          ]
        : square;
  const anchors = coords.map(
    ([x, y], i) =>
      ({
        ...newObject('anchor', { x, y }, `tx-${i + 1}`),
        name: `TX-${String(i + 1).padStart(2, '0')}`,
      }) as Anchor,
  );
  const receiver = {
    ...newObject('receiver', { x: 45, y: 38 }, 'rx-1'),
    name: 'Rover 01',
    mobility: key === 'moving' ? 'waypoints' : 'stationary',
    trajectoryId: key === 'moving' ? 'path-1' : null,
  } as Receiver;
  const path = {
    ...newObject('trajectory', { x: 25, y: 25 }, 'path-1'),
    name: 'Survey route',
    points: [
      { x: 25, y: 25 },
      { x: 70, y: 25 },
      { x: 85, y: 60 },
      { x: 30, y: 65 },
    ],
    speed: 2,
    loop: true,
  } as Trajectory;
  return {
    schemaVersion: 1,
    id,
    name: templates.find((t) => t.id === key)?.name ?? 'Untitled network',
    description: 'GNSS-independent positioning · Phase 1',
    updatedAt: new Date().toISOString(),
    archived: false,
    objects: [
      ...anchors,
      receiver,
      ...(key === 'outdoor'
        ? [
            { ...newObject('obstacle', { x: 72, y: 52 }, 'building-1'), name: 'Research building' },
            {
              ...newObject('obstacle', { x: 18, y: 57 }, 'building-2'),
              name: 'Equipment shelter',
              width: 15,
              height: 9,
            },
          ]
        : []),
      ...(key === 'moving' ? [path] : []),
    ],
    settings: {
      duration: 60,
      step: 0.1,
      seed: 42,
      excludeBlocked: false,
      engine: 'browser',
      measurement: 'calibrated_range',
      speedMultiplier: 1,
    },
    canvas: {
      grid: true,
      labels: true,
      snap: true,
      links: true,
      obstacles: true,
      trajectories: true,
      estimates: true,
      zoom: 4.5,
      pan: { x: -270, y: 190 },
      theme: 'dark',
    },
  };
}

// Reuse the project's validated defaults without prepopulating any network objects.
export function createBlankProject(id = crypto.randomUUID()): Project {
  const project = createTemplate('square', id);
  return {
    ...project,
    name: 'Untitled project',
    description: '',
    objects: [],
    canvas: { ...project.canvas, pan: { x: 0, y: 0 } },
  };
}
