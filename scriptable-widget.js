// Goga's Planner — Today's Tasks
// Paste this into a new Scriptable script on your iPhone.
// Add a Scriptable widget to your homescreen and select this script.

const SUPABASE_URL = 'https://pqzkebhrxkvswzgavmke.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e8yxX4S_ojUnhwaWy8Q7AA_pFfWP1op';
const APP_URL      = 'https://goga-in-her-era-2026.netlify.app/'; // update to your Netlify URL

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:      new Color('#151f30'),
  card:    new Color('#1f2e45'),
  gold:    new Color('#E8B775'),
  green:   new Color('#8aaa82'),
  red:     new Color('#E87560'),
  white:   new Color('#ffffff'),
  dim:     new Color('#ffffff55'),
  dimmer:  new Color('#ffffff28'),
  goldDim: new Color('#E8B77560'),
};

// ── Supabase fetch ────────────────────────────────────────────────────────────
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

// ── Widget ────────────────────────────────────────────────────────────────────
async function buildWidget(state) {
  const now     = new Date();
  const weekKey = getCurrentWeekKey(now);
  const dayName = todayDayName(now);
  const family  = config.widgetFamily || 'medium';

  const allWk  = (state.weeklyTasks || []).filter(t => t.weekKey === weekKey);
  const todayIdx = WP_DAYS.indexOf(dayName);
  const pastDays = WP_DAYS.slice(0, todayIdx);

  const todayTasks   = allWk.filter(t => t.assignedDay === dayName);
  const backlogTasks = allWk.filter(t => pastDays.includes(t.assignedDay) && !t.completed);
  const allForProg   = [...todayTasks, ...backlogTasks];

  const done  = allForProg.filter(t => t.completed).length;
  const total = allForProg.length;
  const pct   = total === 0 ? 100 : Math.round((done / total) * 100);

  // Sort: incomplete first, then by proposedTime
  const sorted = [...todayTasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.proposedTime && b.proposedTime) return a.proposedTime.localeCompare(b.proposedTime);
    if (a.proposedTime) return -1;
    if (b.proposedTime) return 1;
    return 0;
  });

  const maxRows   = family === 'small' ? 3 : family === 'large' ? 14 : 6;
  const showTasks = sorted.slice(0, maxRows);
  const overflow  = sorted.length - maxRows;

  // ── Build widget ────────────────────────────────────────────────────────────
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = APP_URL;
  w.setPadding(14, 16, 12, 16);

  // Header
  const hdr = w.addStack();
  hdr.layoutHorizontally();
  hdr.centerAlignContent();

  const title = hdr.addText('G — Today');
  title.font = Font.boldRoundedSystemFont(13);
  title.textColor = C.gold;

  hdr.addSpacer();

  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const dateTxt = hdr.addText(dateStr);
  dateTxt.font = Font.regularSystemFont(11);
  dateTxt.textColor = C.dim;

  w.addSpacer(8);

  // Progress bar + fraction
  if (total > 0) {
    const progRow = w.addStack();
    progRow.layoutHorizontally();
    progRow.centerAlignContent();
    progRow.spacing = 8;

    const barW = family === 'small' ? 90 : 150;
    const barBg = progRow.addStack();
    barBg.size = new Size(barW, 5);
    barBg.backgroundColor = C.dimmer;
    barBg.cornerRadius = 3;

    const fill = barBg.addStack();
    fill.size = new Size(Math.max(3, Math.round(barW * pct / 100)), 5);
    fill.backgroundColor = pct >= 80 ? C.green : pct >= 50 ? C.gold : C.red;
    fill.cornerRadius = 3;

    barBg.addSpacer();

    const fracTxt = progRow.addText(`${done}/${total}`);
    fracTxt.font = Font.mediumSystemFont(11);
    fracTxt.textColor = C.dim;

    w.addSpacer(9);
  }

  // Task rows
  if (showTasks.length === 0) {
    const empty = w.addText(backlogTasks.length > 0
      ? `${backlogTasks.length} carried-over task${backlogTasks.length > 1 ? 's' : ''} in backlog`
      : 'Nothing scheduled today ✨');
    empty.font = Font.regularSystemFont(12);
    empty.textColor = C.dim;
  }

  for (const task of showTasks) {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.spacing = 7;

    const icon = row.addText(task.completed ? '✓' : '·');
    icon.font = Font.boldRoundedSystemFont(13);
    icon.textColor = task.completed ? C.green : C.gold;

    const label = row.addText(task.text || '');
    label.font = task.completed ? Font.italicSystemFont(12) : Font.regularSystemFont(12);
    label.textColor = task.completed ? C.dim : C.white;
    label.lineLimit = 1;

    row.addSpacer();

    if (task.proposedTime && !task.completed) {
      const time = row.addText(task.proposedTime);
      time.font = Font.regularSystemFont(10);
      time.textColor = C.goldDim;
    }

    w.addSpacer(3);
  }

  // Overflow hint
  if (overflow > 0) {
    w.addSpacer(3);
    const more = w.addText(`+${overflow} more`);
    more.font = Font.regularSystemFont(10);
    more.textColor = C.dimmer;
  }

  // Backlog notice (only if today tasks fill space)
  if (backlogTasks.length > 0 && showTasks.length < maxRows && overflow === 0) {
    w.addSpacer(5);
    const bl = w.addText(`↩ ${backlogTasks.length} earlier task${backlogTasks.length > 1 ? 's' : ''} not done`);
    bl.font = Font.regularSystemFont(10);
    bl.textColor = new Color('#E8756060');
  }

  return w;
}

// ── Error widget ─────────────────────────────────────────────────────────────
function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(16, 16, 16, 16);
  const t = w.addText(msg);
  t.font = Font.regularSystemFont(12);
  t.textColor = C.dim;
  return w;
}

// ── Run ───────────────────────────────────────────────────────────────────────
const state = await fetchState();
const widget = state
  ? await buildWidget(state)
  : errorWidget('Could not load tasks.\nCheck your connection.');

Script.setWidget(widget);

// Preview when running inside Scriptable app
if (config.runsInApp) widget.presentMedium();

Script.complete();
