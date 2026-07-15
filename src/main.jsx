import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Prototype configuration (previously DesignComponent props).
//   zoom            -> initial pixels-per-minute density; the on-screen
//                      density slider overrides and persists this value
//   showDependencies -> render dependency connector curves
//   timeFormat      -> '12h' | '24h'
const config = {
  zoom: 4,
  showDependencies: true,
  timeFormat: '12h',
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App {...config} />
  </React.StrictMode>,
);
