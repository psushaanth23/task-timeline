import React from 'react';
import { HoverButton } from './ui.jsx';
import TrackName from './TrackName.jsx';

export default function Sidebar(props) {
  const {
    sidebarWrapStyle,
    gutterHeaderStyle,
    gutterHeaderLabel,
    isVertical,
    notVertical,
    timeColStyle,
    hourTicksV,
    dayBandsV,
    lanes,
    addTrack,
    resizeHandleStyle,
    onSidebarResizeDown,
    toggleSidebar,
    sidebarCollapsed,
  } = props;

  const collapseBtnStyle = {
    flex: 'none',
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '6px',
    color: 'rgba(231,233,238,.7)',
    fontSize: '13px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div style={sidebarWrapStyle}>
      <div style={gutterHeaderStyle}>
        {!sidebarCollapsed && <span>{gutterHeaderLabel}</span>}
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ ...collapseBtnStyle, marginLeft: 'auto' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={sidebarCollapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
          </svg>
        </button>
      </div>

      {!sidebarCollapsed && isVertical && (
        <div style={timeColStyle}>
          {hourTicksV.map((tick, i) => (
            <div key={i} style={tick.style}>{tick.label}</div>
          ))}
          {dayBandsV.map((band, i) => (
            <div key={i} style={band.style}>{band.label}</div>
          ))}
        </div>
      )}

      {!sidebarCollapsed && notVertical && (
        <>
          {lanes.map(lane => (
            <div
              key={lane.index}
              style={lane.rowStyle}
              onMouseDown={lane.onRowMouseDown}
              title="Drag to reorder · double-click name to rename"
            >
              <div title="Drag to reorder" style={lane.dragHandleStyle}>
                ⠿
              </div>
              <div
                data-no-drag="true"
                onClick={lane.onCycleColor}
                title="Click to change track color"
                style={lane.dotStyle}
              />
              <TrackName
                name={lane.name}
                style={lane.nameStyle}
                editing={lane.editing}
                onDoubleClick={lane.onStartEdit}
                onRename={lane.onRename}
                onKeyDown={lane.onKeyDown}
              />
              <HoverButton
                onClick={lane.onDelete}
                title="Delete track"
                data-no-drag="true"
                style={{
                  marginLeft: 'auto',
                  flex: 'none',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(231,233,238,.28)',
                  fontSize: '15px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  lineHeight: 1,
                }}
                hoverStyle={{ color: '#ff7a95' }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </HoverButton>
            </div>
          ))}
          <HoverButton
            onClick={addTrack}
            style={{
              margin: '10px 12px',
              padding: '8px',
              border: '1px dashed rgba(255,255,255,.18)',
              borderRadius: '9px',
              background: 'transparent',
              color: 'rgba(231,233,238,.5)',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono',monospace",
            }}
            hoverStyle={{
              borderColor: 'rgba(20,184,166,.5)',
              color: '#14b8a6',
              background: 'rgba(20,184,166,.08)',
            }}
          >
            + Add track
          </HoverButton>
        </>
      )}

      {!sidebarCollapsed && <div onMouseDown={onSidebarResizeDown} style={resizeHandleStyle} />}
    </div>
  );
}
