// Goga's Planner — Reminders
// Paste into a new Scriptable script on your iPhone (e.g. name it "Goga Notify").
// Triggered by iOS Shortcuts Personal Automations at fixed times — NOT run manually.
// Reliable because iOS wakes Shortcuts automations at their scheduled time even when
// the app/browser is closed, unlike a web service worker's setTimeout.
//
// Setup (Shortcuts app → Automation tab → + → Create Personal Automation → Time of Day):
//   7:00 AM, 12:00 PM, 8:20 PM, 10:00 PM, 2:00 PM  (daily, all five)
//   Action: Scriptable → Run Script → this script
//   Turn OFF "Ask Before Running" so it fires silently in the background.
// (The 2:00 PM one only actually sends a notification on Sundays — safe to run daily.)

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
    return rows?.[0]?.value ?? null;
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

// ── Notification content (mirrors sw.js fire7am/fire12pm/fire820pm/fire10pm/fireSunday2pm) ──
function content7am(p) {
  const total = p.backlogCount + p.newCount;
  const body = p.backlogCount > 0
    ? `${p.backlogCount} carried over + ${p.newCount} new tasks today (${total} total). Time to plan your day 📋`
    : `You have ${p.newCount} tasks today. Let's get it! 📋`;
  return { title: '🌅 Good morning, Goga!', body };
}

function content12pm(p) {
  if (p.total === 0) return null;
  if (p.pct === 0) return { title: 'Olodo uprising detected 😭', body: `You still haven't ticked anything off your list! ${p.total} tasks to go, sis.` };
  if (p.pct < 30)  return { title: "Someone's slacking... 👀", body: `You've done ${p.done}/${p.total} tasks. You still have ${p.remaining} to go!` };
  if (p.pct < 50)  return { title: "Girl damn!! Let's get this 🔥", body: `${p.done}/${p.total} done — ${p.remaining} to go. You've got this!` };
  return { title: 'FIRE FIRE FIRE 🔥🔥🔥', body: `${p.done}/${p.total} tasks down! ${p.remaining} to go — you're ON ONE!` };
}

function content820pm(p) {
  if (p.total === 0) return null;
  if (p.pct >= 100) return { title: '⭐⭐⭐⭐⭐ Everything is done!!', body: 'You absolutely ate today. Not even a crumb left. 👑' };
  if (p.pct >= 80)  return { title: 'You outdid yourself boo!! ✨', body: `${p.done}/${p.total} tasks done. What an incredible day!` };
  return { title: 'The day is ending... ⏰', body: `You have ${p.remaining}/${p.total} tasks still to go — can you knock them out?` };
}

function content10pm(p) {
  if (p.pct >= 100 || p.remaining === 0) return null;
  return { title: '⏰ 2 more hours, Goga!', body: `${p.remaining} tasks left — can you close out strong tonight?` };
}

function contentSun2pm(w) {
  if (w.total === 0) return null;
  if (w.pct < 40) return { title: 'Girl you slacking or something?? 😭', body: `${w.done}/${w.total} tasks done this week... we need to talk.` };
  if (w.pct < 85) return { title: "Girl you're on to something 👀", body: `${w.done}/${w.total} weekly tasks done — weldone! Go harder this week! 💪` };
  return { title: 'THE WOMAN OF YOUR DREAMS 👑', body: `${w.done}/${w.total} tasks done this week. The IT girl? You are HER!!! 🔥` };
}

// ── Pick the closest scheduled slot to right now (tolerate a few minutes of drift) ──
function closestSlot(now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const slots = [
    { name: '7am',   mins: 7 * 60 },
    { name: '12pm',  mins: 12 * 60 },
    { name: '820pm', mins: 20 * 60 + 20 },
    { name: '10pm',  mins: 22 * 60 },
  ];
  if (now.getDay() === 0) slots.push({ name: 'sun2pm', mins: 14 * 60 });

  let best = null, bestDiff = Infinity;
  for (const s of slots) {
    const diff = Math.abs(mins - s.mins);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return bestDiff <= 20 ? best.name : null; // >20min off any slot = don't fire (e.g. manual test run)
}

// ── Run ───────────────────────────────────────────────────────────────────────
const now = new Date();
const slot = closestSlot(now);
if (!slot) {
  Script.complete();
} else {
  const state = await fetchState();
  if (state) {
    const dp = dayProgress(state, now);
    const wp = weekProgress(state, now);
    const msg =
      slot === '7am'   ? content7am(dp) :
      slot === '12pm'  ? content12pm(dp) :
      slot === '820pm' ? content820pm(dp) :
      slot === '10pm'  ? content10pm(dp) :
      slot === 'sun2pm'? contentSun2pm(wp) : null;

    if (msg) {
      const n = new Notification();
      n.title = msg.title;
      n.body = msg.body;
      n.sound = 'default';
      n.openURL = APP_URL;
      await n.schedule();
    }
  }
  Script.complete();
}
