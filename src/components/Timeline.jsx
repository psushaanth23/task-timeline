import React from 'react';
import { HoverButton } from './ui.jsx';
import ChainLink from './ChainLink.jsx';
import SelectionBox from './SelectionBox.jsx';
import TrackName from './TrackName.jsx';
import TrackTags from './TrackTags.jsx';

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

  // Titles wrap across as many lines as fit the card, then clamp with an
  // ellipsis (line count is per-task, tuned to the card height — see t.titleLines).
  const titleBaseStyle = {
    fontSize: '13px',
    fontWeight: 600,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    whiteSpace: 'normal',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    lineHeight: 1.25,
    width: '100%',
    textShadow: '0 1px 3px rgba(0,0,0,.7)',
  };
  const titleEditingStyle = {
    // While renaming, render as a normal wrapping block (no line clamp) so the
    // full text is visible/editable and the caret behaves.
    display: 'block',
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

  // Live scrubbing HUD: two translucent, glowing pills that track a task's
  // start (above the leading edge) and end (below the trailing edge) while it's
  // dragged/resized. pointer-events:none so it never interferes with the drag.
  const renderHud = (hud) => {
    if (!hud) return null;
    const c = hud.color;
    const pill = {
      position: 'absolute',
      padding: '3px 9px',
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: "'JetBrains Mono',monospace",
      letterSpacing: '.04em',
      color: '#f5f7fb',
      background: 'rgba(16,18,26,0.66)',
      backdropFilter: 'blur(9px) saturate(150%)',
      WebkitBackdropFilter: 'blur(9px) saturate(150%)',
      border: '1px solid ' + c + '99',
      borderRadius: '8px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 20,
      boxShadow: '0 4px 14px rgba(0,0,0,.5), 0 0 12px ' + c + '80',
      textShadow: '0 1px 2px rgba(0,0,0,.85)',
    };
    // Small diamond tick pointing from each pill toward the card edge.
    const tick = {
      position: 'absolute',
      width: '7px',
      height: '7px',
      background: 'rgba(16,18,26,0.66)',
      borderRight: '1px solid ' + c + '99',
      borderBottom: '1px solid ' + c + '99',
      left: '50%',
    };
    const startPos = isVertical
      ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '10px' }
      : { bottom: '100%', left: 0, marginBottom: '10px' };
    const endPos = isVertical
      ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '10px' }
      : { top: '100%', right: 0, marginTop: '10px' };
    // Start pill sits above the card → tick points down (rotate 45°) from its
    // bottom. End pill sits below → tick points up from its top.
    const startTick = { ...tick, top: '100%', transform: 'translate(-50%,-50%) rotate(45deg)' };
    const endTick = { ...tick, bottom: '100%', transform: 'translate(-50%,50%) rotate(-135deg)' };
    return (
      <>
        <div style={{ ...pill, ...startPos }}>
          {hud.start}
          <span style={startTick} />
        </div>
        <div style={{ ...pill, ...endPos }}>
          {hud.end}
          <span style={endTick} />
        </div>
      </>
    );
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
              <div
                key={lane.index}
                className="track-row"
                style={lane.chipStyle}
                onMouseDown={lane.onRowMouseDown}
                title="Drag to reorder · double-click name to rename"
              >
                <div
                  data-no-drag="true"
                  onClick={lane.onCycleColor}
                  title="Click to change track color"
                  style={lane.barStyle}
                />
                <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <TrackName
                    name={lane.name}
                    style={lane.nameStyleV}
                    editing={lane.editing}
                    onDoubleClick={lane.onStartEdit}
                    onRename={lane.onRename}
                    onKeyDown={lane.onKeyDown}
                  />
                  <TrackTags tags={lane.tagList} onAdd={lane.onAddTag} />
                </div>
                <HoverButton
                  onClick={lane.onDelete}
                  title="Delete track"
                  data-no-drag="true"
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
            title={t.editing ? undefined : t.title}
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
              title={t.editing ? undefined : t.title}
              onMouseDown={t.editing ? (e) => e.stopPropagation() : undefined}
              onClick={t.editing ? (e) => e.stopPropagation() : undefined}
              onDoubleClick={t.editing ? (e) => e.stopPropagation() : undefined}
              onKeyDown={t.editing ? onTitleKeyDown : undefined}
              onBlur={t.editing ? (e) => onTitleBlur(t.id, e) : undefined}
              style={
                t.editing
                  ? { ...titleBaseStyle, ...titleEditingStyle }
                  : t.narrow
                    ? { ...titleBaseStyle, display: 'none' }
                    : { ...titleBaseStyle, WebkitLineClamp: t.titleLines }
              }
            >
              {t.editing || t.narrow ? null : t.title}
            </div>
            {!t.narrow && (
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
            )}
            {t.narrow && !t.editing && <div style={t.externalLabelStyle}>{t.title}</div>}
            <div
              data-dot="true"
              data-task-id={t.id}
              onMouseDown={t.onDotEndDown}
              style={t.dotEndStyle}
            />
            <div onMouseDown={t.onResizeDown} style={t.resizeHandleStyle} />
            {renderHud(t.hud)}
          </div>
        ))}
        <SelectionBox rect={marqueeRect} />
      </div>
    </div>
  );
}
