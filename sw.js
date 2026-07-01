const ICON = '/favicon.svg';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// In-memory map of scheduled notification timers
const _timers = new Map();

self.addEventListener('message', e => {
  const d = e.data || {};

  if (d.type === 'SCHEDULE_NOTIF') {
    if (_timers.has(d.id)) clearTimeout(_timers.get(d.id));
    if (!d.delay || d.delay <= 0) return;
    const t = setTimeout(() => {
      self.registration.showNotification(d.title, {
        body: d.body,
        icon: ICON,
        badge: ICON,
        tag: `task-${d.id}`,
        renotify: false,
        data: { taskId: d.id }
      });
      _timers.delete(d.id);
    }, d.delay);
    _timers.set(d.id, t);
  }

  if (d.type === 'CLEAR_NOTIFS') {
    for (const t of _timers.values()) clearTimeout(t);
    _timers.clear();
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
