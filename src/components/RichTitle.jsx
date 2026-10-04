import React from 'react';

// Renders a task title with typed ASCII arrows shown as real arrow icons:
//   "->" → right arrow, "<-" → left arrow, "<->" → both ways.
// Display only: the stored title keeps the plain text, so editing still shows
// exactly what was typed. Icons use currentColor and scale with the font.
const ARROW_RE = /(<->|->|<-)/;

const PATHS = {
  '->': ['M4 12h15', 'M13 6l6 6-6 6'],
  '<-': ['M20 12H5', 'M11 6l-6 6 6 6'],
  '<->': ['M4 12h16', 'M9 7l-5 5 5 5', 'M15 7l5 5-5 5'],
};

function Arrow({ kind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={kind === '<-' ? 'left arrow' : kind === '<->' ? 'both ways' : 'right arrow'}
      style={{ display: 'inline-block', verticalAlign: '-0.14em', margin: '0 0.12em', flex: 'none' }}
    >
      {PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export default function RichTitle({ text }) {
  if (typeof text !== 'string' || !ARROW_RE.test(text)) return text ?? null;
  return text.split(ARROW_RE).map((part, i) =>
    PATHS[part] ? <Arrow key={i} kind={part} /> : part ? <React.Fragment key={i}>{part}</React.Fragment> : null,
  );
}
