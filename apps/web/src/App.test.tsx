import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

// Smoke-тест каркаса: проверяет, что связка Vitest + jsdom + RTL + jest-dom работает.
describe('App', () => {
  it('renders the app title', () => {
    render(<App />);

    // Поиск по роли, а не по классу или test-id: так тест видит страницу как пользователь
    // и скринридер. https://testing-library.com/docs/queries/about#priority
    expect(screen.getByRole('heading', { name: 'Slot Booking' })).toBeInTheDocument();
  });
});
