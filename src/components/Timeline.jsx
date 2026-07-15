import React from 'react';
import { HoverButton } from './ui.jsx';
import ChainLink from './ChainLink.jsx';
import SelectionBox from './SelectionBox.jsx';

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
    onBoardMouseDown,
    lanesStyle,
    laneRows,
    gridOverlayStyle,
    svgWidthNum,
    svgHeightNum,
    connectors,
    chainLinks,
    wireLive,
    taskViews,
    marqueeRect,
    editingId,
    editingTitle,
    onCommitTitle,
    onCancelTitle,
  } = props;

  // Ref to the currently-editing title element; cancelRef distinguishes an
  // Escape (cancel) blur from a normal commit blur.
  const editRef = React.useRef(null);
  const cancelRef = React.useRef(false);

  React.useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    // Seed the element's text imperatively (React renders no children for it, so
    // subsequent re-renders won't clobber what the user types), then focus and
    // select all so the user can immediately type a replacement name.
    el.textContent = editingTitle || '';
    const focusSelect = () => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    requestAnimationFrame(focusSelect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const titleBaseStyle = {
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
    textShadow: '0 1px 3px rgba(0,0,0,.7)',
  };
  const titleEditingStyle = {
    overflow: 'visible',
    textOverflow: 'clip',
    outline: 'none',
    cursor: 'text',
    // Beat the app-root user-select:none so the caret and selection work.
    userSelect: 'text',
    WebkitUserSelect: 'text',
    pointerEvents: 'auto',
    background: 'rgba(0,0,0,.4)',
    borderRadius: '4px',
    padding: '0 3px',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.35)',
  };

  const onTitleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      cancelRef.current = false;
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRef.current = true;
      e.currentTarget.blur();
    }
  };
  const onTitleBlur = (id, e) => {
    if (cancelRef.current) {
      cancelRef.current = false;
      onCancelTitle();
    } else {
      onCommitTitle(id, e.currentTarget.textContent);
    }
  };

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
          </>
        )}
        {showNow && <div style={nowRulerStyle}>now</div>}
      </div>

      <div ref={contentRef} onDoubleClick={onBoardDblClick} onMouseDown={onBoardMouseDown} style={lanesStyle}>
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
          {chainLinks.map((c) => (
            <ChainLink key={c.id} x={c.x} y={c.y} vertical={isVertical} />
          ))}
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
              ref={t.editing ? editRef : null}
              contentEditable={t.editing}
              suppressContentEditableWarning
              title={t.editing ? undefined : 'Double-click to rename'}
              onMouseDown={t.editing ? (e) => e.stopPropagation() : undefined}
              onClick={t.editing ? (e) => e.stopPropagation() : undefined}
              onDoubleClick={t.editing ? (e) => e.stopPropagation() : undefined}
              onKeyDown={t.editing ? onTitleKeyDown : undefined}
              onBlur={t.editing ? (e) => onTitleBlur(t.id, e) : undefined}
              style={t.editing ? { ...titleBaseStyle, ...titleEditingStyle } : titleBaseStyle}
            >
              {t.editing ? null : t.title}
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
            <div onMouseDown={t.onResizeDown} style={t.resizeHandleStyle} />
          </div>
        ))}
        <SelectionBox rect={marqueeRect} />
      </div>
    </div>
  );
}
