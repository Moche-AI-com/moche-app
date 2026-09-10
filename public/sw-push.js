// Guest portal push service worker (issue #133, item 5). Receives the neutral
// "your host replied" push and focuses/opens the portal on click. The payload
// carries no message text — the guest opens the portal to read it, same privacy
// contract as the guest SMS.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Moche-AI';
  const body = typeof data.body === 'string' && data.body ? data.body : 'Your host replied.';
  const url = typeof data.url === 'string' && data.url ? data.url : '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      tag: 'moche-host-reply',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes('/g/') || client.url.includes('/stay/')) {
            client.navigate(target);
            return client.focus();
          }
        }
        return clients.openWindow(target);
      }),
  );
});
