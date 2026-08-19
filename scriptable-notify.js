// Goga's Planner — Reminders
// Paste into a new Scriptable script on your iPhone (e.g. name it "Goga Notify").
// Triggered by an iOS Shortcuts Personal Automation (Time of Day) — NOT run manually.
// Reliable because iOS wakes Shortcuts automations at their scheduled time even when
// the app/browser is closed, unlike a web service worker's setTimeout.
//
// Set up as many Personal Automations at whatever times you want — the script reads
// the clock itself and picks a sassy tone from the time of day, so there's no fixed
// slot to match and no automation to update if your times move around.
//   Shortcuts app → Automation tab → + → Create Personal Automation → Time of Day
//   → Action: Scriptable → Run Script → this script
//   → turn OFF "Ask Before Running" so it fires silently in the background.

const SUPABASE_URL = 'https://pqzkebhrxkvswzgavmke.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e8yxX4S_ojUnhwaWy8Q7AA_pFfWP1op';
const APP_URL      = 'https://goga-in-her-era-2026.netlify.app/';

// ── Supabase fetch (mirrors scriptable-widget.js) ────────────────────────────
async function fetchState() {
  try {
    const req = new Request(
      `${SUPABASE_URL}/rest/v1/goga_data?key=eq.goga2026_state&select=value`
    );
    req.headers = {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    };
    const rows = await req.loadJSON();
    const raw = rows?.[0]?.value;
    if (!raw) return null;
    // The app stores state as a JSON-encoded string in the `value` column —
    // parse it back into an object, same as the app's own cloudGet() does.
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

// ── Week key (mirrors app logic exactly) ─────────────────────────────────────
function getWeeksForMonth(year, month) {
  const weeks = [];
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) break;
    if (d.getDay() !== 0) continue;
    const start = new Date(year, month, day, 14, 0, 0);
    weeks.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}-w${weeks.length + 1}`,
      start,
      end: new Date(start.getTime() + 7 * 86400000),
    });
  }
  return weeks;
}

function getCurrentWeekKey(date) {
  const d = date || new Date();
  const wkStart = new Date(d);
  wkStart.setDate(d.getDate() - d.getDay());
  wkStart.setHours(14, 0, 0, 0);
  if (d < wkStart) wkStart.setDate(wkStart.getDate() - 7);
  const m = wkStart.getMonth();
  const y = wkStart.getFullYear();
  const weeks = getWeeksForMonth(y, m);
  const w = weeks.find(x => x.start.getTime() === wkStart.getTime());
  return w ? w.key : `${y}-${String(m + 1).padStart(2, '0')}-w1`;
}

const WP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function todayDayName(d) {
  const dow = (d || new Date()).getDay();
  return WP_DAYS[dow === 0 ? 6 : dow - 1];
}

// ── Progress (mirrors sw.js dayProgress/weekProgress) ────────────────────────
function dayProgress(state, now) {
  const weekKey = getCurrentWeekKey(now);
  const dayName = todayDayName(now);
  const todayIdx = WP_DAYS.indexOf(dayName);
  const pastDays = WP_DAYS.slice(0, todayIdx);
  const allWk = (state.weeklyTasks || []).filter(t => t.weekKey === weekKey);

  const todayTasks   = allWk.filter(t => t.assignedDay === dayName);
  const backlogTasks = allWk.filter(t => pastDays.includes(t.assignedDay) && !t.completed);
  const all = [...todayTasks, ...backlogTasks];

  const done = all.filter(t => t.completed).length;
  const total = all.length;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, remaining: total - done, pct, backlogCount: backlogTasks.length, newCount: todayTasks.length };
}

function weekProgress(state, now) {
  const weekKey = getCurrentWeekKey(now);
  const allWk = (state.weeklyTasks || []).filter(t => t.weekKey === weekKey);
  const done = allWk.filter(t => t.completed).length;
  const total = allWk.length;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, pct };
}

// ── Notification content by time-of-day tone (mirrors sw.js's fire7am/fire12pm/
// fire820pm/fire10pm sass, but by bucket instead of an exact clock match so it
// still lands whatever time you set the automation for) ──
function contentMorning(p) {
  const total = p.backlogCount + p.newCount;
  if (total === 0) return { title: '🌅 Good morning, Goga!', body: "Nothing on the books yet today — add a task or enjoy the clean slate ✨" };
  const body = p.backlogCount > 0
    ? `${p.backlogCount} carried over + ${p.newCount} new tasks today (${total} total). Time to plan your day 📋`
    : `You have ${p.newCount} tasks today. Let's get it! 📋`;
  return { title: '🌅 Good morning, Goga!', body };
}

function contentMidday(p) {
  if (p.total === 0) return { title: 'Quiet day so far 👀', body: 'No tasks on today\'s plate yet — go add one or just breathe.' };
  if (p.pct === 0) return { title: 'Olodo uprising detected 😭', body: `You still haven't ticked anything off your list! ${p.total} tasks to go, sis.` };
  if (p.pct < 30)  return { title: "Someone's slacking... 👀", body: `You've done ${p.done}/${p.total} tasks. You still have ${p.remaining} to go!` };
  if (p.pct < 50)  return { title: "Girl damn!! Let's get this 🔥", body: `${p.done}/${p.total} done — ${p.remaining} to go. You've got this!` };
  if (p.pct < 100) return { title: 'FIRE FIRE FIRE 🔥🔥🔥', body: `${p.done}/${p.total} tasks down! ${p.remaining} to go — you're ON ONE!` };
  return { title: '⭐ Already done?!', body: `${p.done}/${p.total} tasks done and it's not even evening. Show off 👑` };
}

function contentEvening(p) {
  if (p.total === 0) return { title: 'Free evening 🌙', body: 'Nothing was on the plate today — rest up or get ahead for tomorrow.' };
  if (p.pct >= 100) return { title: '⭐⭐⭐⭐⭐ Everything is done!!', body: 'You absolutely ate today. Not even a crumb left. 👑' };
  if (p.pct >= 80)  return { title: 'You outdid yourself boo!! ✨', body: `${p.done}/${p.total} tasks done. What an incredible day!` };
  return { title: 'The day is winding down... ⏰', body: `You have ${p.remaining}/${p.total} tasks still to go — can you knock them out?` };
}

function contentNight(p) {
  if (p.total === 0) return { title: '🌙 Quiet one tonight', body: 'Nothing was scheduled today — sleep well, Goga.' };
  if (p.pct >= 100 || p.remaining === 0) return { title: '👑 Closed it out!', body: `${p.done}/${p.total} done today. Go rest, you earned it.` };
  return { title: '⏰ Day\'s almost over, Goga!', body: `${p.remaining} tasks left — can you close out strong tonight?` };
}

function contentWeekly(w) {
  if (w.total === 0) return { title: '🌿 Slow week', body: 'No tasks logged for the week yet — plan on ahead when you\'re ready.' };
  if (w.pct < 40) return { title: 'Girl you slacking or something?? 😭', body: `${w.done}/${w.total} tasks done this week... we need to talk.` };
  if (w.pct < 85) return { title: "Girl you're on to something 👀", body: `${w.done}/${w.total} weekly tasks done — weldone! Go harder this week! 💪` };
  return { title: 'THE WOMAN OF YOUR DREAMS 👑', body: `${w.done}/${w.total} tasks done this week. The IT girl? You are HER!!! 🔥` };
}

// ── Run ───────────────────────────────────────────────────────────────────────
// No fixed slots to match — read whatever time it actually is and pick the tone
// that fits, so any automation time (or a time you change later) still works.
const now = new Date();
const hour = now.getHours();
const isSundayAfternoon = now.getDay() === 0 && hour >= 12;

const state = await fetchState();
if (state) {
  const msg = isSundayAfternoon
    ? contentWeekly(weekProgress(state, now))
    : (() => {
        const dp = dayProgress(state, now);
        if (hour < 11) return contentMorning(dp);
        if (hour < 17) return contentMidday(dp);
        if (hour < 21) return contentEvening(dp);
        return contentNight(dp);
      })();

  const n = new Notification();
  n.title = msg.title;
  n.body = msg.body;
  n.sound = 'default';
  n.openURL = APP_URL;
  await n.schedule();
}
Script.complete();
