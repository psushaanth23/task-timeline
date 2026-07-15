# Task Timeline

A working UI prototype of a timeline-based to-do / task planner. Tasks live on a horizontal (or vertical) 48-hour timeline, organized into color-coded tracks, with drag-to-move cards and visual dependency links.

It was ported from a Salesforce DesignComponent (DC) HTML prototype into a real, runnable **Vite + React** app. There is no backend — all data and view preferences persist to the browser's `localStorage`.

## Features

- **48-hour timeline** spanning 2 days, with hour ticks and day bands. Switch between horizontal and vertical orientation.
- **Live "now" indicator** — a glowing marker tracks the current time and auto-scrolls into view.
- **Tracks (swimlanes)** — rename inline, cycle the color by clicking the dot, reorder by dragging the handle, and add or delete tracks.
- **Draggable task cards** — double-click empty space to create a task, drag to move across time and between tracks, and double-click a card to edit it. Duration, start time, and track are chosen in a modal.
- **Dependencies** — drag from a card's start/end dot onto another card to link them, or pick "Depends on" tasks in the modal. Dependencies render as dashed bezier connector curves.
- **Progress-aware styling** — task cards fade or brighten based on progress versus the current time, and pulse when urgent.
- **Persistent state** — orientation, sidebar width, collapse state, and all task/track data are saved to `localStorage`.

## Getting started

Requires Node.js. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build      # production build
npm run preview    # preview the production build locally
```

## Project structure

```
task-timeline/
  index.html
  package.json
  vite.config.js
  src/
    main.jsx            # entry, mounts <App> with config props
    index.css           # global styles, fonts, keyframes, scrollbar, hover helpers
    App.jsx             # main component: state, handlers, layout, computeVals()
    lib/
      constants.js      # layout constants, color palette, seed tasks/tracks
      time.js           # time formatting/parsing helpers
      color.js          # hexToRgba
      geometry.js       # bezier path builder
      storage.js        # localStorage load/save
    components/
      ui.jsx            # HoverButton/HoverInput/HoverSelect/HoverDiv (hover & focus styling)
      Header.jsx        # top bar with actions
      Sidebar.jsx       # track list / time gutter
      Timeline.jsx      # ruler + board + task cards + connectors
      TaskModal.jsx     # create/edit task dialog
```

## Usage / interactions

| Action | How |
| --- | --- |
| Add a task | Double-click empty space on the timeline |
| Edit a task | Double-click a task card |
| Move a task | Drag a card across time or between tracks |
| Link tasks | Drag from a card's start/end dot onto another card (or set "Depends on" in the modal) |
| Recolor a track | Click the track's color dot to cycle colors |
| Rename a track | Click the track name and edit inline |
| Reorder tracks | Drag the track's handle |
| Add / delete tracks | Use the track list controls in the sidebar |
| Change view & actions | Use the buttons in the header (orientation, collapse, etc.) |

## Configuration

Props are passed to `<App>` in `src/main.jsx`:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `zoom` | number | `2` | Pixels per minute (horizontal scale of the timeline) |
| `showDependencies` | boolean | `true` | Whether dependency connector curves are rendered |
| `timeFormat` | `'12h'` \| `'24h'` | `'12h'` | Clock format used throughout the UI |

## Notes

This is a front-end prototype. There is no server or database — all tasks, tracks, and view preferences are stored in the browser's `localStorage`, so data persists across reloads on the same browser but is not synced anywhere.

License: MIT
