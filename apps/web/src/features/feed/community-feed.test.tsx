import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiBlob, apiRequest } from '../../lib/api';
import { CommunityFeed } from './community-feed';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), apiBlob: vi.fn() }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ ready: true, user: { id: 'client', displayName: 'Aman', role: 'CLIENT', approvalStatus: 'APPROVED' } }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const post = { id: 'post', body: 'First 5K complete!', authorName: 'Aman', isCoach: false, createdAt: '2026-09-19T12:00:00Z', canDelete: true, attachments: [], liked: false, likeCount: 0, commentCount: 0 };

it('publishes a status with clear audience information and resets the composer', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [], nextCursor: null, community: 'Team Forme' });
  render(<CommunityFeed />);
  await screen.findByText('Every community starts with a hello.');
  expect(screen.getByText('Sharing with your coach and their approved clients')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Share post' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Write a community post'), { target: { value: 'First 5K complete!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share post' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/feed/posts', { method: 'POST', body: JSON.stringify({ body: 'First 5K complete!', attachments: [] }) }));
  await screen.findByText('Your post was shared with the community.');
  expect(screen.getByLabelText('Write a community post')).toHaveValue('');
});
it('retains a failed draft and supports changing timeline filters', async () => {
  vi.mocked(apiRequest).mockImplementation(async (_path, init) => { if (init?.method === 'POST') throw new Error('Upload failed'); return { items: [], nextCursor: null, community: 'Team Forme' }; });
  render(<CommunityFeed />);
  await screen.findByText('Every community starts with a hello.');
  fireEvent.change(screen.getByLabelText('Write a community post'), { target: { value: 'Keep my draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share post' }));
  await screen.findByText('Upload failed');
  expect(screen.getByLabelText('Write a community post')).toHaveValue('Keep my draft');
  fireEvent.click(screen.getByRole('button', { name: 'Files' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/feed/posts?filter=files'));
});
it('likes posts, adds comments and confirms deletion', async () => {
  vi.mocked(apiRequest).mockImplementation(async path => path.includes('/comments') ? { items: [], nextCursor: null } : { items: [post], nextCursor: null, community: 'Team Forme' });
  render(<CommunityFeed />);
  await screen.findByText('First 5K complete!');
  fireEvent.click(screen.getByRole('button', { name: /0 likes/ }));
  await screen.findByRole('button', { name: /1 like/ });
  expect(apiRequest).toHaveBeenCalledWith('/feed/posts/post/like', { method: 'PUT', body: '{"liked":true}' });
  fireEvent.click(screen.getByRole('button', { name: /0 comments/ }));
  await screen.findByText('Be the first to encourage them.');
  fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Nice work!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/feed/posts/post/comments', { method: 'POST', body: '{"body":"Nice work!"}' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete post by Aman' }));
  expect(apiRequest).not.toHaveBeenCalledWith('/feed/posts/post', { method: 'DELETE' });
  fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
  await waitFor(() => expect(screen.queryByText('First 5K complete!')).not.toBeInTheDocument());
});
it('loads private photos through authenticated requests and revokes preview URLs', async () => {
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:private'), revokeObjectURL });
  vi.mocked(apiBlob).mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ ...post, attachments: [{ id: 'photo', name: 'win.jpg', mediaType: 'image/jpeg', size: 100 }] }], nextCursor: null, community: 'Team Forme' });
  const view = render(<CommunityFeed />);
  await screen.findByAltText('win.jpg');
  expect(apiBlob).toHaveBeenCalledWith('/feed/posts/post/attachments/photo');
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:private');
});
