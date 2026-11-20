import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL размонтирует компоненты автоматически, только если afterEach глобальный (globals: true).
// У нас globals выключены, поэтому чистим DOM явно — иначе разметка одного теста видна в следующем.
afterEach(() => {
  cleanup();
});
