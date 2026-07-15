import React, { useState } from 'react';

// Small presentational primitives that replicate the DesignComponent
// `style-hover` / `style-focus` attributes by merging an extra style object
// while the element is hovered or focused.

export function HoverButton({ style, hoverStyle, children, onMouseEnter, onMouseLeave, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      {...rest}
      style={hovered && hoverStyle ? { ...style, ...hoverStyle } : style}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter && onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave && onMouseLeave(e);
      }}
    >
      {children}
    </button>
  );
}

export function HoverDiv({ style, hoverStyle, children, onMouseEnter, onMouseLeave, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      {...rest}
      style={hovered && hoverStyle ? { ...style, ...hoverStyle } : style}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter && onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave && onMouseLeave(e);
      }}
    >
      {children}
    </div>
  );
}

export function HoverInput({ style, focusStyle, onFocus, onBlur, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...rest}
      style={focused && focusStyle ? { ...style, ...focusStyle } : style}
      onFocus={(e) => {
        setFocused(true);
        onFocus && onFocus(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur && onBlur(e);
      }}
    />
  );
}

export function HoverSelect({ style, focusStyle, children, onFocus, onBlur, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...rest}
      style={focused && focusStyle ? { ...style, ...focusStyle } : style}
      onFocus={(e) => {
        setFocused(true);
        onFocus && onFocus(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur && onBlur(e);
      }}
    >
      {children}
    </select>
  );
}
