import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LoadingImage } from './loading-image';
afterEach(cleanup);

it('keeps the gray placeholder until image decoding completes and resets for a new source', () => {
  const view = render(<LoadingImage alt="Exercise photo" />);
  expect(screen.getByRole('status', { name: 'Loading Exercise photo' })).toHaveClass('image-placeholder');
  expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  view.rerender(<LoadingImage src="blob:first" alt="Exercise photo" />);
  const image = screen.getByAltText('Exercise photo');
  expect(image).not.toBeVisible();
  fireEvent.load(image);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(image).toBeVisible();
  view.rerender(<LoadingImage src="blob:second" alt="Exercise photo" />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});
it('uses a static placeholder if the image cannot decode', () => {
  render(<LoadingImage src="blob:broken" alt="Photo" />);
  fireEvent.error(screen.getByAltText('Photo'));
  expect(screen.getByRole('img', { name: 'Photo unavailable' })).not.toHaveClass('is-loading');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
