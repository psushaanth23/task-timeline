import React from 'react';
import { HoverButton } from './ui.jsx';
import ZoomBar from './ZoomBar.jsx';
import HelpPanel from './HelpPanel.jsx';

// Minimal orbit/timeline brand mark — a planet on an inclined orbit ring with
// a small satellite, subtle teal→indigo gradient and a soft glow. Crisp at 38px.
function BrandMark() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 38 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 4px 14px rgba(45,212,191,.35))', flex: 'none' }}
    >
      <defs>
        <linearGradient id="brandCore" x1="8" y1="8" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="brandGlow" cx="0.5" cy="0.42" r="0.6">
          <stop stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* soft ambient halo */}
      <circle cx="19" cy="19" r="17" fill="url(#brandGlow)" opacity="0.18" />
      {/* inclined orbit ring */}
      <ellipse
        cx="19"
        cy="19"
        rx="15"
        ry="6.6"
        transform="rotate(-32 19 19)"
        stroke="url(#brandCore)"
        strokeWidth="1.6"
        opacity="0.75"
      />
      {/* planet */}
      <circle cx="19" cy="19" r="6.4" fill="url(#brandCore)" />
      <circle cx="16.6" cy="16.6" r="2" fill="#ecfeff" opacity="0.5" />
      {/* satellite */}
      <circle cx="31.4" cy="11.2" r="2.1" fill="#a5f3fc" />
    </svg>
  );
}

export default function Header(props) {
  const {
    todayLabel,
    isVertical,
    toggleOrientation,
    jumpToNow,
    zoomBarValue,
    zoomBarMin,
    zoomBarMax,
    zoomBarStep,
    zoomBarLabel,
    zoomBarUnit,
    onZoomBarChange,
    onOpenArchive,
    archiveCount = 0,
    onOpenTags,
    tagCount = 0,
    sidebarCollapsed,
    toggleSidebar,
  } = props;

  // Segmented orientation toggle. `toggleOrientation` simply flips the current
  // orientation, so each segment only fires when it isn't already active.
  const segWrap = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px',
    gap: '2px',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '10px',
  };
  const seg = (active) => ({
    background: active ? 'rgba(99,102,241,.22)' : 'transparent',
    border: active ? '1px solid rgba(99,102,241,.5)' : '1px solid transparent',
    color: active ? '#a5b4fc' : 'rgba(231,233,238,.55)',
    padding: '6px 13px',
    borderRadius: '8px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1,
  });
  const goHorizontal = () => {
    if (isVertical) toggleOrientation();
  };
  const goVertical = () => {
    if (!isVertical) toggleOrientation();
  };
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '18px',
        padding: '16px 26px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        flex: 'none',
        background: 'linear-gradient(180deg,#141519,#101116)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
        <BrandMark />
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                fontFamily: "'Orbitron','Space Grotesk',sans-serif",
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                fontSize: '17px',
                background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Timeline
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffd60a',
                background: 'rgba(255,214,10,.12)',
                border: '1px solid rgba(255,214,10,.35)',
                padding: '3px 9px',
                borderRadius: '20px',
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: '.04em',
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
          >
            {todayLabel}
            </span>
          </h1>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 'none' }}>
        <div style={segWrap} role="group" aria-label="Orientation">
          <button type="button" style={seg(!isVertical)} onClick={goHorizontal}>
            Horizontal
          </button>
          <button type="button" style={seg(isVertical)} onClick={goVertical}>
            Vertical
          </button>
        </div>
        {/* #87: labels-on-lanes toggle (horizontal only). Hides the left track
            label gutter for a full-width track view; state persists via the same
            sidebarCollapsed flag. Vertical mode uses top headers, so it's hidden
            there to keep a single coherent collapse control per orientation. */}
        {!isVertical && (
          <HoverButton
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Show track labels' : 'Hide track labels'}
            aria-label={sidebarCollapsed ? 'Show track labels' : 'Hide track labels'}
            aria-pressed={!sidebarCollapsed}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: sidebarCollapsed ? 'rgba(255,255,255,.05)' : 'rgba(99,102,241,.18)',
              border: sidebarCollapsed ? '1px solid rgba(255,255,255,.12)' : '1px solid rgba(99,102,241,.5)',
              color: sidebarCollapsed ? 'rgba(231,233,238,.7)' : '#a5b4fc',
              padding: '8px 13px',
              borderRadius: '9px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono',monospace",
            }}
            hoverStyle={{ background: sidebarCollapsed ? 'rgba(255,255,255,.1)' : 'rgba(99,102,241,.28)', color: '#e7e9ee' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
            Labels
          </HoverButton>
        )}
        <HoverButton
          onClick={onOpenArchive}
          title="View deleted tracks"
          aria-label="View deleted tracks"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(231,233,238,.7)',
            padding: '8px 13px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono',monospace",
          }}
          hoverStyle={{ background: 'rgba(255,255,255,.1)', color: '#e7e9ee' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Completed{archiveCount > 0 ? ' (' + archiveCount + ')' : ''}
        </HoverButton>
        <HoverButton
          onClick={onOpenTags}
          title="Manage tags"
          aria-label="Manage tags"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(231,233,238,.7)',
            padding: '8px 13px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono',monospace",
          }}
          hoverStyle={{ background: 'rgba(255,255,255,.1)', color: '#e7e9ee' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          Tags{tagCount > 0 ? ' (' + tagCount + ')' : ''}
        </HoverButton>
        <HoverButton
          onClick={jumpToNow}
          style={{
            background: 'rgba(255,214,10,.12)',
            border: '1px solid rgba(255,214,10,.5)',
            color: '#ffd60a',
            padding: '8px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(255,214,10,.22)' }}
        >
          Now
        </HoverButton>
        <ZoomBar
          value={zoomBarValue}
          min={zoomBarMin}
          max={zoomBarMax}
          step={zoomBarStep}
          label={zoomBarLabel}
          unit={zoomBarUnit}
          onChange={onZoomBarChange}
        />
        <HoverButton
          onClick={() => setHelpOpen(true)}
          title="How to use"
          aria-label="How to use"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            flex: 'none',
            padding: 0,
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: '50%',
            color: 'rgba(231,233,238,.7)',
            cursor: 'pointer',
            fontWeight: 700,
          }}
          hoverStyle={{ background: 'rgba(125,211,252,.16)', color: '#7dd3fc', borderColor: 'rgba(125,211,252,.45)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </HoverButton>
      </div>
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </header>
  );
}
