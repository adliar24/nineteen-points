import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from './queryClient.ts';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import App from './App.tsx';
import './index.css';

// Automatically reload if a dynamic import fails due to newly deployed bundle chunks
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
