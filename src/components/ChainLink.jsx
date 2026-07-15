import React from 'react';

export default function ChainLink(props) {
  const { x, y, vertical = false, color = '#5eead4' } = props;

  const rings = vertical
    ? [
        { x: -3.5, y: -9, width: 7, height: 11 },
        { x: -3.5, y: -2, width: 7, height: 11 },
      ]
    : [
        { x: -9, y: -3.5, width: 11, height: 7 },
        { x: -2, y: -3.5, width: 11, height: 7 },
      ];

  return (
    <g transform={`translate(${x}, ${y})`} opacity={0.95}>
      {rings.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          rx={3.5}
          ry={3.5}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      ))}
    </g>
  );
}
