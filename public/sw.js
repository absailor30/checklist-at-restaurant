// Service worker for push notifications.
//
// It runs with the app closed, which is the entire point: a manager who has
// gone home still needs to hear that the closing checklist is locked.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Restaurant Checklist', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Restaurant Checklist';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Tagging by task means a repeated alert about the same thing replaces
      // the previous one instead of stacking up a wall of duplicates.
      tag: data.tag || 'checklist',
      renotify: true,
      data: { url: data.url || '/manager' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/manager';

  // Focus an already-open tab rather than opening a second one.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
