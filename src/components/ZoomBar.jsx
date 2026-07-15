import React from 'react';

// Compact, inline density control designed to sit at the far-right of the
// header toolbar. Orientation-aware label/unit are supplied by the caller
// (time px/min in horizontal mode, track-column width in vertical mode).
export default function ZoomBar(props) {
  const { value, min = 1, max = 12, step = 0.5, label = 'Density', unit = 'px/min', onChange } = props;

  const barStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    flex: 'none',
  };

  const labelStyle = {
    fontSize: '10px',
    letterSpacing: '.09em',
    color: 'rgba(231,233,238,.42)',
    fontWeight: 600,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };

  const buttonStyle = {
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    color: '#e7e9ee',
    borderRadius: '7px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '15px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  };

  const sliderStyle = {
    width: '120px',
    flex: 'none',
    accentColor: '#22d3ee',
    cursor: 'pointer',
  };

  const readoutStyle = {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '11px',
    color: '#22d3ee',
    minWidth: '70px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };

  const round2 = (n) => +Number(n).toFixed(2);
  const decrease = () => onChange(Math.max(min, round2(value - step)));
  const increase = () => onChange(Math.min(max, round2(value + step)));

  return (
    <div style={barStyle} title={`${label} · ${value} ${unit}`}>
      <span style={labelStyle}>{label}</span>
      <button type="button" style={buttonStyle} onClick={decrease} aria-label="Decrease">
        −
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={sliderStyle}
      />
      <button type="button" style={buttonStyle} onClick={increase} aria-label="Increase">
        +
      </button>
      <span style={readoutStyle}>
        {value} {unit}
      </span>
    </div>
  );
}
