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
    scrollWrapStyle,
    rulerStyle,
    isVertical,
    notVertical,
    dayBands,
    hourTicks,
    quarterTicks = [],
    lanes,
    showNow,
    nowRulerStyle,
    nowStyle,
    nowTime,
    onBoardDblClick,
    onBoardMouseDown,
    lanesStyle,
    laneRows,
    dividers = [],
    dividerAdds = [],
    gridOverlayStyle,
    svgWidthNum,
    svgHeightNum,
    connectors,
    onDeleteConnector,
    chainLinks,
    wireLive,
    pendingLive,
    taskViews,
    marqueeRect,
    editingId,
    editingTitle,
    onCommitTitle,
    onCancelTitle,
    // #87: horizontal labels-on-lanes gutter
    labelGutterStyle,
    bodyOuterStyle,
    rulerCornerStyle,
    labelGutterW = 0,
    labelsHidden = false,
    addTrack,
    onSidebarResizeDown,
    resizeHandleStyle,
  } = props;

  // Ref to the currently-editing title element; cancelRef distinguishes an
  // Escape (cancel) blur from a normal commit blur.
  const editRef = React.useRef(null);
  const cancelRef = React.useRef(false);
  // Which dependency connector line the pointer is hovering (for click-to-delete
  // highlight). Cleared on leave.
  const [hoverConn, setHoverConn] = React.useState(null);

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

  // The now-indicator pill contents: live clock time on top (with a softly
  // blinking colon) and a small "NOW" underneath. Same markup in both
  // orientations; the pill's position/glow come from nowRulerStyle.
  const renderNowLabel = () => {
    const t = nowTime || '';
    const idx = t.indexOf(':');
    const timeContent =
      idx === -1 ? (
        t
      ) : (
        <>
          {t.slice(0, idx)}
          <span className="now-colon">:</span>
          {t.slice(idx + 1)}
        </>
      );
    return (
      <>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.02em', lineHeight: 1 }}>
          {timeContent}
        </span>
        <span
          style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '.16em', opacity: 0.75, lineHeight: 1 }}
        >
          NOW
        </span>
      </>
    );
  };

  // Divider dot handles (#75, #87). In horizontal mode both the add-dot (empty
  // gap) and the remove-dot (existing divider) live in the sticky left label
  // gutter — pinned between the track-name rectangles — so they stay visible at
  // the left no matter how far the timeline is scrolled horizontally. In
  // vertical mode they stay along the top edge inside the content. The glowing
  // divider LINE always spans the lanes inside the content. Behavior unchanged:
  // add-dot adds, remove-dot removes; both data-no-drag + stopPropagation.
  const renderAddDot = (a) => (
    <button
      key={'add' + a.key}
      type="button"
      className="divider-add-dot"
      data-no-drag="true"
      title="Add divider"
      aria-label="Add track divider"
      style={a.dotStyle}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={a.onAdd}
    />
  );
  const renderDelDot = (d) => (
    <button
      key={'del' + d.id}
      type="button"
      className="divider-del-dot"
      data-no-drag="true"
      title="Remove divider"
      aria-label="Remove track divider"
      style={d.dotStyle}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={d.onRemove}
    />
  );

  // #87: one track label pinned in the left gutter, aligned to its lane row.
  // Reuses the sidebar row UI (color accent, inline-rename name, compact tags,
  // delete) but lives inside the scrolling lane body so it can never drift.
  const renderLaneLabel = (lane) => (
    <div
      key={lane.index}
      className="track-row"
      style={{ ...lane.rowStyle, overflow: 'hidden' }}
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
          style={lane.nameStyle}
          editing={lane.editing}
          onDoubleClick={lane.onStartEdit}
          onRename={lane.onRename}
          onKeyDown={lane.onKeyDown}
        />
        <TrackTags tags={lane.tagList} onAdd={lane.onAddTag} onOpenTag={lane.onOpenTag} />
      </div>
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
          fontSize: '13px',
          cursor: 'pointer',
          padding: '2px 3px',
          lineHeight: 1,
        }}
        hoverStyle={{ color: '#ff7a95' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </HoverButton>
    </div>
  );

  // Shared inner content (dependency SVG, now-line, tasks, marquee) rendered
  // inside the offset content wrapper for both orientations (#87).
  const renderContentInner = () => (
    <>
      <svg
        width={svgWidthNum}
        height={svgHeightNum}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
      >
        {connectors.map((c) => {
          const hot = hoverConn === c.id;
          return (
            <g key={c.id}>
              <path
                d={c.d}
                fill="none"
                stroke={hot ? '#ff5c7c' : 'rgba(255,255,255,.28)'}
                strokeWidth={hot ? 3.5 : 2}
                strokeDasharray="5 5"
                style={{ pointerEvents: 'none' }}
              />
              <path
                d={c.d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onMouseEnter={() => setHoverConn(c.id)}
                onMouseLeave={() => setHoverConn((h) => (h === c.id ? null : h))}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoverConn(null);
                  onDeleteConnector && onDeleteConnector(c.childId, c.parentId);
                }}
              />
            </g>
          );
        })}
        {wireLive && (
          <path d={wireLive.d} fill="none" stroke="#5eead4" strokeWidth={2.5} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
        )}
        {pendingLive && (
          <path d={pendingLive.d} fill="none" stroke="#ffd60a" strokeWidth={2.5} strokeDasharray="6 5" style={{ pointerEvents: 'none' }} />
        )}
        {chainLinks.map((c) => (
          <ChainLink key={c.id} x={c.x} y={c.y} vertical={isVertical} />
        ))}
      </svg>
      {showNow && <div style={nowStyle} />}
      {/* Vertical mode: the "now" label lives in the scrolling content (same
          coords as the line + tasks). Horizontal puts it in the top ruler. */}
      {showNow && isVertical && <div style={nowRulerStyle}>{renderNowLabel()}</div>}
      {taskViews.map((t) => (
        <div
          key={t.id}
          className="task-card"
          style={t.style}
          /* #84: full task name is ALWAYS the native tooltip on hover (not gated
             on truncation/zoom); suppressed only while inline-renaming. */
          title={t.editing ? undefined : t.title}
          onMouseDown={t.onMouseDown}
          onClick={t.onClick}
          onDoubleClick={t.onDbl}
        >
          <div data-dot="true" data-task-id={t.id} onMouseDown={t.onDotStartDown} style={t.dotStartStyle} />
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
          {t.narrow && !t.editing && (
            <div title={t.title} data-no-drag="true" onMouseDown={(e) => e.stopPropagation()} style={t.externalLabelStyle}>
              {t.title}
            </div>
          )}
          <div data-dot="true" data-task-id={t.id} onMouseDown={t.onDotEndDown} style={t.dotEndStyle} />
          <div onMouseDown={t.onResizeDown} style={t.resizeHandleStyle} />
          <button
            type="button"
            className={t.hasNotes ? 'task-note-btn has-notes' : 'task-note-btn'}
            data-no-drag="true"
            title={t.hasNotes ? 'Open notes' : 'Add notes'}
            aria-label={t.hasNotes ? 'Open notes panel (has notes)' : 'Open notes panel'}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={t.onOpenPanel}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 3h11l5 5v13a0 0 0 0 1 0 0H4z" />
              <path d="M14 3v5h5" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="13" y2="17" />
            </svg>
          </button>
          {renderHud(t.hud)}
        </div>
      ))}
      <SelectionBox rect={marqueeRect} />
    </>
  );

  return (
    <div ref={scrollRef} style={scrollWrapStyle || { flex: 1, overflowX: 'auto', overflowY: 'visible' }}>
      <div style={rulerStyle}>
        {notVertical && labelGutterW > 0 && (
          <div style={rulerCornerStyle}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'rgba(231,233,238,.35)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Tracks
            </span>
            <HoverButton
              onClick={addTrack}
              title="Add track"
              aria-label="Add track"
              data-no-drag="true"
              style={{
                marginLeft: 'auto',
                flex: 'none',
                width: '22px',
                height: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                borderRadius: '6px',
                border: '1px dashed rgba(255,255,255,.22)',
                background: 'transparent',
                color: 'rgba(231,233,238,.6)',
                fontSize: '15px',
                lineHeight: 1,
                cursor: 'pointer',
              }}
              hoverStyle={{ borderColor: 'rgba(20,184,166,.6)', color: '#14b8a6', background: 'rgba(20,184,166,.1)' }}
            >
              +
            </HoverButton>
          </div>
        )}
        {notVertical && (
          <>
            {dayBands.map((band, i) => (
              <div key={i} style={band.style}>{band.label}</div>
            ))}
            {hourTicks.map((tick, i) => (
              <div key={i} style={tick.style}>{tick.label}</div>
            ))}
            {quarterTicks.map((tick) => (
              <div key={tick.key} style={tick.style}>{tick.label}</div>
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
                  style={lane.barStyleV}
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
                  <TrackTags tags={lane.tagList} onAdd={lane.onAddTag} onOpenTag={lane.onOpenTag} />
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
        {showNow && notVertical && <div style={nowRulerStyle}>{renderNowLabel()}</div>}
      </div>

      {notVertical ? (
        <div style={bodyOuterStyle}>
          {labelGutterW > 0 && (
            <div style={labelGutterStyle}>
              {lanes.map((lane) => renderLaneLabel(lane))}
              {/* Divider handles live in the sticky gutter, between the name
                  rectangles, so they stay visible at the left on horizontal
                  scroll and sit above the label rows (#87). */}
              {dividerAdds.map((a) => renderAddDot(a))}
              {dividers.map((d) => renderDelDot(d))}
              <div onMouseDown={onSidebarResizeDown} style={resizeHandleStyle} />
            </div>
          )}
          <div ref={contentRef} onDoubleClick={onBoardDblClick} onMouseDown={onBoardMouseDown} style={lanesStyle}>
            {laneRows.map((row, i) => (
              <div key={i} style={row.style} />
            ))}
            <div style={gridOverlayStyle} />
            {/* Track divider LINES (#75): decorative glowing separators
                (pointer-events:none). The dot handles live in the gutter. */}
            {dividers.map((d) => (
              <div key={d.id} style={d.lineStyle} />
            ))}
            {renderContentInner()}
          </div>
        </div>
      ) : (
        <div ref={contentRef} onDoubleClick={onBoardDblClick} onMouseDown={onBoardMouseDown} style={lanesStyle}>
          {laneRows.map((row, i) => (
            <div key={i} style={row.style} />
          ))}
          <div style={gridOverlayStyle} />
          {/* Vertical mode: divider dots sit along the top edge inside content. */}
          {dividerAdds.map((a) => renderAddDot(a))}
          {dividers.map((d) => (
            <React.Fragment key={d.id}>
              <div style={d.lineStyle} />
              {renderDelDot(d)}
            </React.Fragment>
          ))}
          {renderContentInner()}
        </div>
      )}
    </div>
  );
}
