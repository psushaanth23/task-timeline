import React, { useState } from 'react';

// Seam glyph drawn where two same-lane tasks touch edge-to-edge.
//   linked   (default): three short horizontal stitch bars sewn across the seam.
//                       The tasks drag as one block; App hides both connection
//                       dots at this seam, so the stitches own the centre.
//   detached (user unlinked): no glyph at all. The dots come back and the plain
//                       seam reads as "separate". Hovering the seam shows a
//                       small "link" label so it can be re-linked.
// Clicking toggles the seam (onToggle). In the detached state the hit area
// skips the centre so the returned dots stay grabbable for drag-to-connect.
//
// Props: x, y, vertical, detached, onToggle, span (card cross-size, px).

const INK = '#e7e9ee';
const BOARD = '#101116';

export default function ChainLink(props) {
  const { x, y, vertical = false, detached = false, onToggle, span = 40 } = props;
  const [hover, setHover] = useState(false);
  const clickable = typeof onToggle === 'function';

  const handleClick = (e) => {
    if (!clickable) return;
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  };

  // Hit areas in "seam runs vertically" coords; the group rotates for vertical mode.
  const h = span / 2 + 4;
  const hits = detached
    ? [
        { y: -h, height: h - 9 },
        { y: 9, height: h - 9 },
      ]
    : [{ y: -h, height: h * 2 }];

  // Hover label at the seam's outer edge (top in horizontal, left in vertical).
  const label = detached ? 'link' : 'unlink';
  const pillW = label.length * 5.6 + 14;
  const pillX = vertical ? -span / 2 - pillW / 2 + 6 : 0;
  const pillY = vertical ? 12 : -span / 2 - 6;

  return (
    <g
      transform={`translate(${x} ${y})`}
      onMouseEnter={clickable ? () => setHover(true) : undefined}
      onMouseLeave={clickable ? () => setHover(false) : undefined}
      onMouseDown={clickable ? (e) => e.stopPropagation() : undefined}
      onClick={handleClick}
      style={clickable ? { cursor: 'pointer', pointerEvents: 'auto' } : { pointerEvents: 'none' }}
    >
      {clickable && (
        <title>{detached ? 'Unlinked — click to link (move together)' : 'Linked — click to unlink (move individually)'}</title>
      )}
      <g transform={`rotate(${vertical ? -90 : 0})`}>
        {hits.map((r, i) => (
          <rect key={i} x={-8} y={r.y} width={16} height={r.height} fill="transparent" />
        ))}
        <g opacity={hover ? 1 : 0.62} style={{ transition: 'opacity .15s ease' }}>
          {[-8, 0, 8].map((t, i) => (
            <path
              key={t}
              d={`M -3.5 ${t} H 3.5`}
              pathLength={1}
              stroke={INK}
              strokeWidth={1.6}
              strokeLinecap="round"
              fill="none"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: detached ? 1 : 0,
                transition: `stroke-dashoffset .22s ease ${detached ? 0 : i * 0.06}s`,
              }}
            />
          ))}
        </g>
      </g>
      {clickable && (
        <g
          transform={`translate(${pillX} ${pillY})`}
          style={{ opacity: hover ? 1 : 0, transition: 'opacity .15s ease', pointerEvents: 'none' }}
        >
          <rect x={-pillW / 2} y={-7} width={pillW} height={14} rx={7} fill={BOARD} stroke={INK} strokeOpacity={0.18} />
          <text
            textAnchor="middle"
            y={3}
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill={INK}
            fillOpacity={0.8}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
