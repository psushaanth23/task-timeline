import React from 'react';
import { HoverButton } from './ui.jsx';

export default function Timeline(props) {
  const {
    scrollRef,
    contentRef,
    rulerStyle,
    isVertical,
    notVertical,
    dayBands,
    hourTicks,
    lanes,
    showNow,
    nowRulerStyle,
    nowStyle,
    onBoardDblClick,
    lanesStyle,
    laneRows,
    gridOverlayStyle,
    svgWidthNum,
    svgHeightNum,
    connectors,
    wireLive,
    taskViews,
  } = props;

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
      <div style={rulerStyle}>
        {notVertical && (
          <>
            {dayBands.map((band, i) => (
              <div key={i} style={band.style}>{band.label}</div>
            ))}
            {hourTicks.map((tick, i) => (
              <div key={i} style={tick.style}>{tick.label}</div>
            ))}
          </>
        )}
        {isVertical && (
          <>
            {lanes.map(lane => (
              <div key={lane.index} style={lane.chipStyle}>
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
                  style={lane.nameStyleV}
                >
                  {lane.name}
                </div>
                <HoverButton
                  onClick={lane.onDelete}
                  title="Delete track"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(231,233,238,.28)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  hoverStyle={{ color: '#ff7a95' }}
                >
                  ×
                </HoverButton>
              </div>
            ))}
          </>
        )}
        {showNow && <div style={nowRulerStyle}>now</div>}
      </div>

      <div ref={contentRef} onDoubleClick={onBoardDblClick} style={lanesStyle}>
        {laneRows.map((row, i) => (
          <div key={i} style={row.style} />
        ))}
        <div style={gridOverlayStyle} />
        <svg
          width={svgWidthNum}
          height={svgHeightNum}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
        >
          {connectors.map(c => (
            <path
              key={c.id}
              d={c.d}
              fill="none"
              stroke="rgba(255,255,255,.28)"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          ))}
          {wireLive && (
            <path
              d={wireLive.d}
              fill="none"
              stroke="#5eead4"
              strokeWidth={2.5}
              strokeDasharray="6 5"
            />
          )}
        </svg>
        {showNow && <div style={nowStyle} />}
        {taskViews.map(t => (
          <div
            key={t.id}
            style={t.style}
            onMouseDown={t.onMouseDown}
            onClick={t.onClick}
            onDoubleClick={t.onDbl}
          >
            <div
              data-dot="true"
              data-task-id={t.id}
              onMouseDown={t.onDotStartDown}
              style={t.dotStartStyle}
            />
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.2,
                textShadow: '0 1px 3px rgba(0,0,0,.7)',
              }}
            >
              {t.title}
            </div>
            <div
              style={{
                fontSize: '11px',
                opacity: 0.9,
                fontFamily: "'JetBrains Mono',monospace",
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textShadow: '0 1px 3px rgba(0,0,0,.7)',
              }}
            >
              {t.timeLabel}
            </div>
            <div
              data-dot="true"
              data-task-id={t.id}
              onMouseDown={t.onDotEndDown}
              style={t.dotEndStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
