import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiBlob } from '../lib/api';
import { ExerciseGif } from './exercise-gif';
vi.mock('../lib/api', () => ({ apiBlob: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('fetches through the authenticated API, recovers from stale flags and releases blob URLs', async () => {
  const revokeObjectURL = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:exercise'), revokeObjectURL });
  vi.mocked(apiBlob).mockResolvedValue(new Blob(['GIF89a'], { type: 'image/gif' }));
  const view = render(<ExerciseGif id="0001" name="Sit-up" available={false} />);
  expect(await screen.findByAltText('Sit-up demonstration')).toHaveAttribute('src', 'blob:exercise');
  expect(apiBlob).toHaveBeenCalledWith('/exercises/0001/gif');
  view.unmount(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:exercise');
});
it('retries transient failures and resets when the exercise changes', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:exercise'), revokeObjectURL: vi.fn() });
  vi.mocked(apiBlob).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Blob(['GIF89a']));
  const view = render(<ExerciseGif id="0001" name="Sit-up" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry animation for Sit-up' }));
  await screen.findByAltText('Sit-up demonstration');
  view.rerender(<ExerciseGif id="0002" name="Row" />);
  await waitFor(() => expect(apiBlob).toHaveBeenCalledWith('/exercises/0002/gif'));
  await screen.findByAltText('Row demonstration');
});
