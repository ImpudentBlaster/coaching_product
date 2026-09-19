import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProgressStory } from './progress-story';

afterEach(cleanup);

it('does not turn missing measurements into zero weight or a trend', () => {
  render(<ProgressStory entries={[{ measurement_date: '2026-09-01', body_weight: null }, { measurement_date: '2026-09-02', body_weight: '' }]} />);
  expect(screen.getByText('Your starting point matters.')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});

it('orders recorded values without mutating entries and labels the chart honestly', () => {
  const entries = [{ measurement_date: '2026-09-18', body_weight: '81' }, { measurement_date: '2026-09-01', body_weight: '80' }];
  render(<ProgressStory entries={entries} />);
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('from 80 to 81 kilograms');
  expect(screen.getByText(/\+1 kg since 2026-09-01/)).toBeTruthy();
  expect(entries[0]?.measurement_date).toBe('2026-09-18');
});

it('keeps a single measurement as a starting point rather than inventing a trend', () => {
  render(<ProgressStory entries={[{ measurement_date: '2026-09-01', body_weight: 80 }]} />);
  expect(screen.getByText('80')).toBeTruthy();
  expect(screen.getByText('Your next entry begins the trend.')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
