import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </HashRouter>
  </StrictMode>,
);
