import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import App from './App';

const registerPreloadErrorHandler = () => {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    window.location.reload();
  });
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container');
}

registerPreloadErrorHandler();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
