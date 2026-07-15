import React from 'react';
import { HoverButton, HoverInput, HoverSelect, HoverDiv } from './ui.jsx';

export default function TaskModal(props) {
  const {
    close,
    stop,
    draftDot,
    modalTitle,
    draft,
    onTitle,
    draftStartInput,
    onStart,
    onDuration,
    trackOptions,
    onTrack,
    draftParentChips,
    dependQuery,
    onDependInput,
    onDependFocus,
    onDependBlur,
    dependOpen,
    filteredParentOptions,
    noResults,
    save,
    saveLabel,
    isEdit,
    remove,
  } = props;

  const inputStyle = {
    width: '100%',
    background: '#0d0f16',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '10px',
    padding: '11px 13px',
    color: '#e7e9ee',
    fontSize: '14px',
    marginBottom: '18px',
  };

  const smallInputStyle = {
    width: '100%',
    background: '#0d0f16',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '10px',
    padding: '10px 12px',
    color: '#e7e9ee',
    fontSize: '14px',
  };

  const focusStyle = { borderColor: '#22d3ee', outline: 'none' };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(231,233,238,.55)',
    marginBottom: '7px',
  };

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6,7,10,.62)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        animation: 'fadeIn .14s ease',
      }}
    >
      <div
        onClick={stop}
        style={{
          width: '400px',
          maxWidth: '92vw',
          background: '#14161e',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 30px 80px rgba(0,0,0,.6)',
          animation: 'popIn .18s cubic-bezier(.2,.9,.3,1.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '11px',
            marginBottom: '20px',
          }}
        >
          <div style={draftDot}></div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{modalTitle}</h2>
        </div>

        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: 'rgba(231,233,238,.55)',
            marginBottom: '7px',
            letterSpacing: '.02em',
          }}
        >
          Task name
        </label>
        <HoverInput
          value={draft.title}
          onChange={onTitle}
          placeholder="What needs doing?"
          autoFocus
          style={inputStyle}
          focusStyle={focusStyle}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          <div>
            <label style={labelStyle}>Start</label>
            <HoverInput
              type="time"
              step="900"
              value={draftStartInput}
              onChange={onStart}
              style={{
                width: '100%',
                background: '#0d0f16',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: '#e7e9ee',
                fontSize: '14px',
                fontFamily: "'JetBrains Mono',monospace",
              }}
              focusStyle={focusStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Duration</label>
            <HoverSelect
              value={draft.duration}
              onChange={onDuration}
              style={smallInputStyle}
              focusStyle={focusStyle}
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
            </HoverSelect>
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={labelStyle}>Track</label>
          <HoverSelect
            value={draft.lane}
            onChange={onTrack}
            style={smallInputStyle}
            focusStyle={focusStyle}
          >
            {trackOptions.map((tr) => (
              <option key={tr.index} value={tr.index}>
                {tr.name}
              </option>
            ))}
          </HoverSelect>
        </div>

        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <label style={labelStyle}>Depends on (multiple allowed)</label>
          {draftParentChips.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '8px',
              }}
            >
              {draftParentChips.map((dp) => (
                <span key={dp.id} style={dp.style}>
                  {dp.title}
                  <button
                    onClick={dp.onRemove}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      opacity: 0.75,
                      cursor: 'pointer',
                      marginLeft: '2px',
                      padding: '0 2px',
                      fontSize: '13px',
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <HoverInput
            value={dependQuery}
            onChange={onDependInput}
            onFocus={onDependFocus}
            onBlur={onDependBlur}
            placeholder="Search tasks to add…"
            style={smallInputStyle}
            focusStyle={focusStyle}
          />
          {dependOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '6px',
                background: '#0d0f16',
                border: '1px solid rgba(255,255,255,.14)',
                borderRadius: '10px',
                maxHeight: '160px',
                overflow: 'auto',
                zIndex: 20,
                boxShadow: '0 12px 30px rgba(0,0,0,.5)',
              }}
            >
              {filteredParentOptions.map((p) => (
                <HoverDiv
                  key={p.id}
                  onMouseDown={p.onSelect}
                  style={{
                    padding: '9px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  hoverStyle={{ background: 'rgba(255,255,255,.06)' }}
                >
                  <div style={p.dotStyle}></div>
                  {p.title}
                </HoverDiv>
              ))}
              {noResults && (
                <div
                  style={{
                    padding: '9px 12px',
                    fontSize: '12.5px',
                    color: 'rgba(231,233,238,.4)',
                  }}
                >
                  No matches
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ height: '8px' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HoverButton
            onClick={save}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg,#22d3ee,#38bdf8)',
              border: 'none',
              color: '#06121a',
              fontWeight: 700,
              padding: '12px',
              borderRadius: '11px',
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 8px 22px rgba(56,189,248,.35)',
            }}
            hoverStyle={{ filter: 'brightness(1.08)' }}
          >
            {saveLabel}
          </HoverButton>
          {isEdit && (
            <HoverButton
              onClick={remove}
              style={{
                background: 'rgba(255,90,124,.12)',
                border: '1px solid rgba(255,90,124,.4)',
                color: '#ff7a95',
                fontWeight: 600,
                padding: '12px 16px',
                borderRadius: '11px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
              hoverStyle={{ background: 'rgba(255,90,124,.22)' }}
            >
              Delete
            </HoverButton>
          )}
          <HoverButton
            onClick={close}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,.12)',
              color: 'rgba(231,233,238,.7)',
              padding: '12px 16px',
              borderRadius: '11px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
            hoverStyle={{ background: 'rgba(255,255,255,.05)' }}
          >
            Cancel
          </HoverButton>
        </div>
      </div>
    </div>
  );
}
