const ICON = '/favicon.svg';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── State ────────────────────────────────────────────────────────────────────
let _day = null;
// {
//   date: 'YYYY-MM-DD',
//   isSunday: bool,
//   backlogCount: number,
//   newCount: number,
//   dayTasks:  Map<id, { completed: bool }>,
//   weekTasks: Map<id, { completed: bool }>,
// }

const _timers = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────
function clearAll() {
  for (const t of _timers.values()) clearTimeout(t);
  _timers.clear();
}

function schedule(key, delayMs, fn) {
  if (_timers.has(key)) clearTimeout(_timers.get(key));
  if (!delayMs || delayMs <= 0) return;
  const t = setTimeout(() => { _timers.delete(key); fn(); }, delayMs);
  _timers.set(key, t);
}

function msUntil(h, m) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return target - now;
}

function notify(title, body, tag) {
  return self.registration.showNotification(title, {
    body, icon: ICON, badge: ICON, tag, renotify: true
  });
}

// ── Progress calculators ─────────────────────────────────────────────────────
function dayProgress() {
  if (!_day) return { done: 0, total: 0, remaining: 0, pct: 0 };
  let done = 0, total = 0;
  for (const t of _day.dayTasks.values()) { total++; if (t.completed) done++; }
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, remaining: total - done, pct };
}

function weekProgress() {
  if (!_day) return { done: 0, total: 0, pct: 0 };
  let done = 0, total = 0;
  for (const t of _day.weekTasks.values()) { total++; if (t.completed) done++; }
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, pct };
}

// ── Notification content ─────────────────────────────────────────────────────
function fire7am() {
  if (!_day) return;
  const { backlogCount, newCount } = _day;
  const total = backlogCount + newCount;
  const body = backlogCount > 0
    ? `${backlogCount} carried over + ${newCount} new tasks today (${total} total). Time to plan your day 📋`
    : `You have ${newCount} tasks today. Let's get it! 📋`;
  notify('🌅 Good morning, Goga!', body, 'daily-7am');
}

function fire12pm() {
  const { done, total, remaining, pct } = dayProgress();
  if (total === 0) return;
  let title, body;
  if (pct === 0) {
    title = 'Olodo uprising detected 😭';
    body = `You still haven't ticked anything off your list! ${total} tasks to go, sis.`;
  } else if (pct < 30) {
    title = "Someone's slacking... 👀";
    body = `You've done ${done}/${total} tasks. You still have ${remaining} to go!`;
  } else if (pct < 50) {
    title = 'Girl damn!! Let\'s get this 🔥';
    body = `${done}/${total} done — ${remaining} to go. You've got this!`;
  } else {
    title = 'FIRE FIRE FIRE 🔥🔥🔥';
    body = `${done}/${total} tasks down! ${remaining} to go — you're ON ONE!`;
  }
  notify(title, body, 'daily-12pm');
}

function fire820pm() {
  const { done, total, remaining, pct } = dayProgress();
  if (total === 0) return;
  if (pct >= 100) {
    notify('⭐⭐⭐⭐⭐ Everything is done!!', 'You absolutely ate today. Not even a crumb left. 👑', 'daily-820pm');
  } else if (pct >= 80) {
    notify('You outdid yourself boo!! ✨', `${done}/${total} tasks done. What an incredible day!`, 'daily-820pm');
  } else {
    notify('The day is ending... ⏰', `You have ${remaining}/${total} tasks still to go — can you knock them out?`, 'daily-820pm');
  }
}

function fire10pm() {
  const { remaining, pct } = dayProgress();
  if (pct >= 100 || remaining === 0) return; // no notif if all done ✓
  notify('⏰ 2 more hours, Goga!', `${remaining} tasks left — can you close out strong tonight?`, 'daily-10pm');
}

function fireSunday2pm() {
  const { done, total, pct } = weekProgress();
  if (total === 0) return;
  let title, body;
  if (pct < 40) {
    title = 'Girl you slacking or something?? 😭';
    body = `${done}/${total} tasks done this week... we need to talk.`;
  } else if (pct < 85) {
    title = "Girl you're on to something 👀";
    body = `${done}/${total} weekly tasks done — weldone! Go harder this week! 💪`;
  } else {
    title = 'THE WOMAN OF YOUR DREAMS 👑';
    body = `${done}/${total} tasks done this week. The IT girl? You are HER!!! 🔥`;
  }
  notify(title, body, 'weekly-sunday');
}

// ── Timer setup ──────────────────────────────────────────────────────────────
function setupTimers() {
  if (!_day) return;
  schedule('7am',   msUntil(7,  0),  fire7am);
  schedule('12pm',  msUntil(12, 0),  fire12pm);
  schedule('820pm', msUntil(20, 20), fire820pm);
  schedule('10pm',  msUntil(22, 0),  fire10pm);
  if (_day.isSunday) schedule('sun2pm', msUntil(14, 0), fireSunday2pm);
}

// ── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  const d = e.data || {};

  if (d.type === 'SCHEDULE_DAY') {
    clearAll();
    _day = {
      date: d.date,
      isSunday: !!d.isSunday,
      backlogCount: d.backlogCount || 0,
      newCount: d.newCount || 0,
      dayTasks:  new Map((d.dayTasks  || []).map(t => [t.id, { completed: !!t.completed }])),
      weekTasks: new Map((d.weekTasks || []).map(t => [t.id, { completed: !!t.completed }])),
    };
    setupTimers();

    // Per-task time-based reminders (10 min before proposedTime)
    (d.timedTasks || []).forEach(t => {
      if (t.delay > 0 && t.delay < 24 * 60 * 60 * 1000) {
        schedule(`task-${t.id}`, t.delay, () => {
          self.registration.showNotification(t.text, {
            body: `Starting at ${t.proposedTime} · tap to open your planner`,
            icon: ICON, badge: ICON, tag: `task-${t.id}`, renotify: false
          });
        });
      }
    });
  }

  if (d.type === 'TASK_UPDATE' && _day) {
    if (_day.dayTasks.has(d.taskId))  _day.dayTasks.get(d.taskId).completed  = d.completed;
    if (_day.weekTasks.has(d.taskId)) _day.weekTasks.get(d.taskId).completed = d.completed;
  }

  if (d.type === 'CLEAR_NOTIFS') {
    clearAll();
    _day = null;
  }
});

// ── Notification click → focus/open app ─────────────────────────────────────
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
