import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n/config';
import App from './App';
import { cleanupChunkReloadParam, installChunkLoadRecovery } from './utils/chunkLoadRecovery';
import { capturePendingScan } from './utils/pendingScan';

// Before anything can redirect to /login: keep a scanned QR token for this tab.
capturePendingScan();
installChunkLoadRecovery();
cleanupChunkReloadParam();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
