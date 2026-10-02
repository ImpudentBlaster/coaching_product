import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/app';
import { GlobalNotifications } from './components/global-notifications';
import './styles.css';
import './ui/tokens.css';
import './ui/primitives.css';
import './ui/sidebar.css';

const queryClient = new QueryClient();
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /><GlobalNotifications /></QueryClientProvider></StrictMode>);
