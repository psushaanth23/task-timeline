import React from 'react';
import { HoverButton } from './ui.jsx';

export default function Header(props) {
  const {
    todayLabel,
    orientationLabel,
    sidebarToggleLabel,
    toggleOrientation,
    toggleSidebar,
    jumpToNow,
    clearAll,
  } = props;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 26px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        flex: 'none',
        background: '#16161a',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '11px',
            background: 'linear-gradient(135deg,#14b8a6,#6366f1)',
            boxShadow: '0 6px 20px rgba(20,184,166,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: '#0b0c10',
            fontSize: '18px',
          }}
        >
          T
        </div>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '19px',
              fontWeight: 600,
              letterSpacing: '-.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            Timeline{' '}
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
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '12.5px',
              color: 'rgba(231,233,238,.5)',
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            Double-click empty space to add · drag to move · drag dots to link · scrolls across days
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <HoverButton
          onClick={toggleOrientation}
          style={{
            background: 'rgba(99,102,241,.14)',
            border: '1px solid rgba(99,102,241,.45)',
            color: '#a5b4fc',
            padding: '9px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(99,102,241,.24)' }}
        >
          {orientationLabel}
        </HoverButton>
        <HoverButton
          onClick={toggleSidebar}
          style={{
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(231,233,238,.75)',
            padding: '9px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
          hoverStyle={{ background: 'rgba(255,255,255,.09)' }}
        >
          {sidebarToggleLabel}
        </HoverButton>
        <HoverButton
          onClick={jumpToNow}
          style={{
            background: 'rgba(255,214,10,.12)',
            border: '1px solid rgba(255,214,10,.5)',
            color: '#ffd60a',
            padding: '9px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(255,214,10,.22)' }}
        >
          Jump to now
        </HoverButton>
        <HoverButton
          onClick={clearAll}
          style={{
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(231,233,238,.75)',
            padding: '9px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
          hoverStyle={{
            background: 'rgba(255,90,124,.14)',
            borderColor: 'rgba(255,90,124,.5)',
            color: '#ff7a95',
          }}
        >
          Clear all
        </HoverButton>
      </div>
    </header>
  );
}
