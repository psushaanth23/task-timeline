import React from 'react';
import { HoverButton } from './ui.jsx';

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
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={collapseBtnStyle}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
        {!sidebarCollapsed && <span>{gutterHeaderLabel}</span>}
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
            <div key={lane.index} style={lane.rowStyle}>
              <div
                onMouseDown={lane.onDragHandleDown}
                title="Drag to reorder"
                style={lane.dragHandleStyle}
              >
                ⠿
              </div>
              <div
                onClick={lane.onCycleColor}
                title="Click to change track color"
                style={lane.dotStyle}
              />
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={lane.onRename}
                onKeyDown={lane.onKeyDown}
                style={lane.nameStyle}
              >
                {lane.name}
              </div>
              <HoverButton
                onClick={lane.onDelete}
                title="Delete track"
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
                ×
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
