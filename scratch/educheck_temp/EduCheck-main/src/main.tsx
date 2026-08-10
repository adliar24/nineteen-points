import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Silence logs in production
if (import.meta.env.PROD) {
  console.log = () => {};
  console.warn = () => {};
  // Keep console.error for debugging critical issues
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
