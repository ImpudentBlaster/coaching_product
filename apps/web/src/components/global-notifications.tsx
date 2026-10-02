import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from 'sonner';
import './global-notifications.css';

export function GlobalNotifications() {
  const [host] = useState(() => document.createElement('div'));
  useEffect(() => {
    // Native modal dialogs occupy the browser's top layer and make other DOM
    // inert. Keep the single viewport-positioned toaster in the active dialog
    // while it is open, so its dismiss controls remain usable.
    const update = () => {
      const dialogs = document.querySelectorAll('dialog[open]');
      const parent = dialogs.item(dialogs.length - 1) ?? document.body;
      if(host.parentElement !== parent) parent.appendChild(host);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    update();
    return () => { observer.disconnect(); host.remove(); };
  }, [host]);
  return createPortal(<Toaster position="top-right" expand visibleToasts={3} gap={12} closeButton theme="light"
    offset={{ top: 24, right: 24 }} mobileOffset={{ top: 80, left: 16, right: 16 }}
    containerAriaLabel="Notifications" toastOptions={{ closeButtonAriaLabel: 'Dismiss notification', classNames: { toast: 'app-toast', title: 'app-toast-title', description: 'app-toast-description', closeButton: 'app-toast-close' } }}/>, host);
}
