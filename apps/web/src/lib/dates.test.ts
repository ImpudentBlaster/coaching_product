import { expect, it } from 'vitest';
import { formatDate, formatDateTime } from './dates';

it('formats date-only values without timezone conversion', () => {
  expect(formatDate('2026-01-05')).toBe('05-01-2026');
  expect(formatDate('2024-02-29')).toBe('29-02-2024');
  expect(formatDateTime('2026-01-05')).toBe('05-01-2026');
});
it('formats timestamps with the date first and handles missing dates', () => {
  expect(formatDate(new Date(2026, 9, 11, 12))).toBe('11-10-2026');
  expect(formatDateTime(new Date(2026, 9, 11, 12))).toMatch(/^11-10-2026 /);
  expect(formatDate('invalid')).toBe('—');
});
