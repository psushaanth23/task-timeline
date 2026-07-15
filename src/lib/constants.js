export const PALETTE = [
  // Original palette — DO NOT reorder or change; track/tag colors are stored as
  // these hex values, so existing selections must stay valid.
  '#ff5c7c',
  '#ff8f5c',
  '#ffd23f',
  '#4ade80',
  '#22d3ee',
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#c084fc',
  // Added for more variety — distinct hues/saturations spread around the wheel,
  // all tuned to read as bright accents on the dark glass theme.
  '#ef4444', // red
  '#f97316', // deep orange
  '#f59e0b', // amber / gold
  '#a3e635', // lime
  '#22c55e', // green
  '#6ee7b7', // mint
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#7c3aed', // deep violet / plum
  '#d946ef', // fuchsia
  '#ec4899', // hot pink
];

export const TRACK_NAMES = [
  'Planning',
  'Design',
  'Engineering',
  'Track 4',
  'Track 5',
  'Track 6',
  'Track 7',
  'Track 8',
];

// Layout constants for the time/track axes.
export const LAYOUT = {
  laneSize: 72,
  dateBarH: 24,
  hourBarH: 40,
  trackHeaderH: 58,
  totalMin: 2880, // 48 hours
};

export function genTrackId() {
  return 'trk' + Date.now() + Math.floor(Math.random() * 9999);
}

export function makeTracks() {
  return TRACK_NAMES.map((n, i) => ({
    id: 'trk' + i,
    name: n,
    color: PALETTE[i % PALETTE.length],
    tagIds: [],
  }));
}

export function genTagId() {
  return 'tag' + Date.now() + Math.floor(Math.random() * 9999);
}

export function seedTasks() {
  return [
    { id: 't1', title: 'Kickoff sync', lane: 0, start: 540, duration: 30, parentIds: [] },
    { id: 't2', title: 'Design spec', lane: 1, start: 570, duration: 60, parentIds: ['t1'] },
    { id: 't3', title: 'API scaffolding', lane: 2, start: 570, duration: 90, parentIds: ['t1'] },
    { id: 't4', title: 'Build UI', lane: 1, start: 630, duration: 120, parentIds: ['t2'] },
    { id: 't5', title: 'Integration', lane: 2, start: 660, duration: 75, parentIds: ['t3'] },
    { id: 't6', title: 'Review & demo', lane: 0, start: 780, duration: 45, parentIds: ['t4', 't5'] },
  ];
}
