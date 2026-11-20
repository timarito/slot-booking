import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
// Явная ошибка вместо `!`: если index.html и код разъедутся, причина будет видна сразу.
if (!container) {
  throw new Error('Root element #root not found');
}

// StrictMode в dev намеренно рендерит компоненты и запускает эффекты дважды, чтобы выявить
// побочные эффекты в рендере и эффекты без cleanup. В продакшен-сборке не влияет ни на что.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
