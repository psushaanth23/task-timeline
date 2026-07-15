# Task Timeline

A working UI prototype of a timeline-based to-do / task planner. Tasks live on a horizontal (or vertical) 48-hour timeline, organized into color-coded tracks, with drag-to-move cards and visual dependency links.

It was ported from a Salesforce DesignComponent (DC) HTML prototype into a real, runnable **Vite + React** app. There is no backend — all data and view preferences persist to the browser's `localStorage`.

## Features

- **48-hour timeline** spanning 2 days, with hour ticks and day bands. Switch between horizontal and vertical orientation.
- **Live "now" indicator** — a glowing marker tracks the current time and auto-scrolls into view.
- **Tracks (swimlanes)** — rename inline, cycle the color by clicking the dot, reorder by dragging the handle, and add or delete tracks.
- **Draggable task cards** — double-click empty space to create a task, drag to move across time and between tracks. Duration, start time, and track are chosen in a modal.
- **Marquee (rubber-band) selection** — click and drag on empty timeline space to draw a selection rectangle; every task fully enclosed by the rectangle becomes selected and highlighted. Clicking empty space without dragging clears the selection.
- **Group move** — with multiple tasks selected, dragging any selected task moves the whole selection together. Group moves are constrained to the time axis only, so tasks keep their tracks.
- **Resize duration** — hover the trailing edge or corner of a task card and drag to change its duration along the time axis. The start/opposite dots still initiate dependency links.
- **Mark done (double-click)** — double-clicking a task toggles its "done" state. A done task renders desaturated/blacked-out and disabled-looking, and is dropped from the current selection. Double-click again to un-complete it. (Creating tasks is still done by double-clicking empty space.)
- **Edge auto-scroll** — while dragging a task, moving a selection, or resizing, moving near the left or right edge of the timeline auto-scrolls the view in that direction so you can drag across long distances.
- **Density control (zoom bar)** — a toolbar above the timeline with a slider and − / + buttons compresses or stretches the time (X) axis. The chosen density is remembered across reloads.
- **Dependencies** — drag from a card's start/end dot onto another card to link them, or pick "Depends on" tasks in the modal. Dependencies render as dashed bezier connector curves. When a parent task's end meets a child task's start exactly (adjacent, same track, dots colliding), the connector is drawn as a chain-link glyph to signify a stronger "one-after-another" bond instead of a curve.
- **Progress-aware styling** — task cards fade or brighten based on progress versus the current time, and pulse when urgent.
- **Persistent state** — orientation, sidebar width, collapse state, timeline density, and all task/track data are saved to `localStorage`.

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
      autoscroll.js     # edge auto-scroll controller
      storage.js        # localStorage load/save
    components/
      ui.jsx            # HoverButton/HoverInput/HoverSelect/HoverDiv (hover & focus styling)
      Header.jsx        # top bar with actions
      ZoomBar.jsx       # density toolbar (slider + / - to scale the time axis)
      Sidebar.jsx       # track list / time gutter
      Timeline.jsx      # ruler + board + task cards + connectors
      SelectionBox.jsx  # marquee (rubber-band) selection rectangle
      ChainLink.jsx     # chain glyph for back-to-back dependencies
      TaskModal.jsx     # create/edit task dialog
```

## Usage / interactions

| Action | How |
| --- | --- |
| Add a task | Double-click empty space on the timeline |
| Mark a task done / undone | Double-click a task card to toggle its "done" state |
| Move a task | Drag a card across time or between tracks |
| Select multiple tasks | Click and drag on empty space to draw a marquee; tasks fully enclosed are selected |
| Clear the selection | Click empty space without dragging |
| Move a group of tasks | Drag any selected task; the whole selection moves together along the time axis |
| Resize a task's duration | Drag the trailing edge or corner of a task card |
| Drag across long distances | Drag near the left/right edge to auto-scroll the timeline |
| Change timeline density | Use the zoom bar's slider or − / + buttons above the timeline |
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
| `zoom` | number | `2` | Initial/default density in pixels per minute (horizontal scale of the timeline). The on-screen density slider (zoom bar) overrides this and persists the chosen value to `localStorage`. |
| `showDependencies` | boolean | `true` | Whether dependency connector curves are rendered |
| `timeFormat` | `'12h'` \| `'24h'` | `'12h'` | Clock format used throughout the UI |

## Notes

This is a front-end prototype. There is no server or database — all tasks, tracks, and view preferences are stored in the browser's `localStorage`, so data persists across reloads on the same browser but is not synced anywhere.

License: MIT
