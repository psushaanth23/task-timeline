export const PALETTE = [
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
  return TRACK_NAMES.map((n, i) => ({ id: 'trk' + i, name: n, color: PALETTE[i % PALETTE.length] }));
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
