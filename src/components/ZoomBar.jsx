import React from 'react';

export default function ZoomBar(props) {
  const { value, min = 1, max = 12, step = 0.5, label = 'Density', unit = 'px/min', onChange } = props;

  const barStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '8px 26px',
    background: '#151519',
    borderBottom: '1px solid rgba(255,255,255,.08)',
    flex: 'none',
  };

  const labelStyle = {
    fontSize: '11px',
    letterSpacing: '.08em',
    color: 'rgba(231,233,238,.45)',
    fontWeight: 600,
    textTransform: 'uppercase',
    minWidth: '86px',
  };

  const hintStyle = {
    fontSize: '13px',
    color: 'rgba(231,233,238,.35)',
    fontWeight: 600,
    userSelect: 'none',
  };

  const buttonStyle = {
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    color: '#e7e9ee',
    borderRadius: '8px',
    width: '28px',
    height: '28px',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
  };

  const sliderStyle = {
    flex: 1,
    accentColor: '#22d3ee',
    cursor: 'pointer',
  };

  const readoutStyle = {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '12px',
    color: '#22d3ee',
    minWidth: '84px',
    textAlign: 'right',
  };

  const round2 = (n) => +Number(n).toFixed(2);
  const decrease = () => onChange(Math.max(min, round2(value - step)));
  const increase = () => onChange(Math.min(max, round2(value + step)));

  return (
    <div style={barStyle}>
      <span style={labelStyle}>{label}</span>
      <button type="button" style={buttonStyle} onClick={decrease}>
        −
      </button>
      <span style={hintStyle}>«</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={sliderStyle}
      />
      <span style={hintStyle}>»</span>
      <button type="button" style={buttonStyle} onClick={increase}>
        +
      </button>
      <span style={readoutStyle}>
        {value} {unit}
      </span>
    </div>
  );
}
