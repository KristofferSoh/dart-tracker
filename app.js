import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { initDartboard } from "./dartboard.js";

// Which scorecard are we in? No scorecard => back to the login page.
const CARD = localStorage.getItem("dt_card_id");
if (!CARD) {
  location.replace("login.html");
  await new Promise(() => {}); // stop here; the navigation is already underway
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- date helpers (local time, Monday-based weeks) ----------
function isoDate(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const offset = (x.getDay() + 6) % 7; // Mon = 0 ... Sun = 6
  x.setDate(x.getDate() - offset);
  return x;
}
function weekRange(weekOffset = 0) {
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end, startIso: isoDate(start), endIso: isoDate(end) };
}
function fmtShort(d) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ---------- state ----------
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const todayDow = (new Date().getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
const defaultDow = () => Math.min(todayDow, 4); // weekends fall back to Friday
let players = [];
let editingPlayerId = null;
let weekOffset = 0; // 0 = current week, -1 = last week, ...
let selectedDow = defaultDow(); // 0 = Mon ... 4 = Fri
const todayIso = isoDate(new Date());

// ---------- elements ----------
const $ = (id) => document.getElementById(id);
const leaderboardBody = $("leaderboardBody");
const weekLabel = $("weekLabel");
const scorePlayer = $("scorePlayer");
const daySelect = $("daySelect");
const dayFieldWeek = $("dayFieldWeek");
const throwEls = [$("throw1"), $("throw2"), $("throw3")];
const dayTotalEl = $("dayTotal");
const scoreMsg = $("scoreMsg");
const playerList = $("playerList");
const playerMsg = $("playerMsg");
const breakdownTable = $("breakdownTable");

// ---------- players ----------
function playerChip(p) {
  if (editingPlayerId === p.id) {
    return `<li class="player-edit" data-id="${p.id}">
      <input type="text" class="player-edit-input" value="${escapeHtml(p.name)}" maxlength="40" aria-label="Player name" />
      <button type="button" class="player-edit-save" data-id="${p.id}">Save</button>
      <button type="button" class="player-edit-cancel">Cancel</button>
    </li>`;
  }
  return `<li data-id="${p.id}">${escapeHtml(p.name)}<button type="button" class="player-edit-btn" data-id="${p.id}" aria-label="Rename ${escapeHtml(p.name)}">✎</button></li>`;
}

function renderPlayerList() {
  playerList.innerHTML = players.length
    ? players.map(playerChip).join("")
    : `<li class="muted">No players yet — add some above.</li>`;
  if (editingPlayerId) playerList.querySelector(".player-edit-input")?.focus();
}

async function loadPlayers() {
  const { data, error } = await db.rpc("sc_list_players", { p_card: CARD });
  if (error) return console.error(error);
  players = data || [];

  renderPlayerList();

  const current = scorePlayer.value;
  scorePlayer.innerHTML = players
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  if (current) scorePlayer.value = current;
}

async function savePlayerName(id, name) {
  name = name.trim();
  if (!name) return;
  playerMsg.className = "msg";
  playerMsg.textContent = "";
  const { error } = await db.rpc("sc_rename_player", {
    p_card: CARD,
    p_player: id,
    p_name: name,
  });
  if (error) {
    playerMsg.className = "msg err";
    playerMsg.textContent = /duplicate|unique/i.test(error.message)
      ? "That name already exists."
      : error.message;
    return;
  }
  editingPlayerId = null;
  playerMsg.className = "msg ok";
  playerMsg.textContent = "Name updated.";
  await loadPlayers();
  await refreshWeekViews();
}

playerList.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".player-edit-btn");
  const saveBtn = e.target.closest(".player-edit-save");
  const cancelBtn = e.target.closest(".player-edit-cancel");
  if (editBtn) {
    editingPlayerId = editBtn.dataset.id;
    renderPlayerList();
  } else if (cancelBtn) {
    editingPlayerId = null;
    playerMsg.textContent = "";
    renderPlayerList();
  } else if (saveBtn) {
    const input = saveBtn.closest("li").querySelector(".player-edit-input");
    savePlayerName(saveBtn.dataset.id, input.value);
  }
});

playerList.addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("player-edit-input")) return;
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.closest("li").querySelector(".player-edit-save").click();
  } else if (e.key === "Escape") {
    editingPlayerId = null;
    playerMsg.textContent = "";
    renderPlayerList();
  }
});

$("playerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("playerName").value.trim();
  if (!name) return;
  playerMsg.className = "msg";
  playerMsg.textContent = "";
  const { error } = await db.rpc("sc_add_player", { p_card: CARD, p_name: name });
  if (error) {
    playerMsg.className = "msg err";
    playerMsg.textContent = /duplicate|unique/i.test(error.message)
      ? "That name already exists."
      : error.message;
    return;
  }
  $("playerName").value = "";
  playerMsg.className = "msg ok";
  playerMsg.textContent = `Added ${name}.`;
  await loadPlayers();
  await refreshWeekViews();
});

// ---------- score entry ----------
function currentDayTotal() {
  return throwEls.reduce((s, el) => s + (parseInt(el.value, 10) || 0), 0);
}
function renderDayTotal() {
  dayTotalEl.textContent = currentDayTotal();
}
throwEls.forEach((el) => el.addEventListener("input", renderDayTotal));

initDartboard({
  openButton: $("openDartboard"),
  onApply: (points) => {
    throwEls.forEach((el, i) => (el.value = points[i]));
    renderDayTotal();
    scoreMsg.className = "msg ok";
    scoreMsg.textContent = "Filled from dartboard — review, then save.";
  },
});

// The ISO date for the currently selected weekday within the viewed week.
function selectedDayIso() {
  const { start } = weekRange(weekOffset);
  const d = new Date(start);
  d.setDate(d.getDate() + selectedDow);
  return isoDate(d);
}

// Every Mon–Fri of the viewed week is pickable. Logging a day more than one
// either side of today just triggers a soft warning on save (see throwingWarning).
function renderDaySelect() {
  const { start } = weekRange(weekOffset);
  daySelect.innerHTML = DOW.map((lbl, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = isoDate(d);
    const cls =
      "day-btn" +
      (i === selectedDow ? " sel" : "") +
      (iso === todayIso ? " today" : "");
    return `<button type="button" class="${cls}" data-dow="${i}">
      <span class="dow">${lbl}</span><span class="dom">${d.getDate()}</span>
    </button>`;
  }).join("");
  dayFieldWeek.textContent =
    weekOffset === 0 ? "· this week" : `· week of ${fmtShort(start)}`;
}

daySelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".day-btn");
  if (!btn) return;
  selectedDow = Number(btn.dataset.dow);
  renderDaySelect();
  prefillScore();
});

async function prefillScore() {
  const playerId = scorePlayer.value;
  const day = selectedDayIso();
  if (!playerId || !day) return;
  const { data } = await db.rpc("sc_get_score", {
    p_card: CARD,
    p_player: playerId,
    p_day: day,
  });
  const s = data && data[0];
  throwEls[0].value = s?.throw1 ?? 0;
  throwEls[1].value = s?.throw2 ?? 0;
  throwEls[2].value = s?.throw3 ?? 0;
  renderDayTotal();
  scoreMsg.className = "msg";
  scoreMsg.textContent = s ? "Editing an existing entry." : "";
}
scorePlayer.addEventListener("change", () => {
  weekOffset = 0;
  selectedDow = defaultDow();
  syncWeekViews();
  prefillScore();
});

const weekdayName = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });

// Soft rule checks — nothing is ever blocked, we just flag likely slips:
//  - logging a day more than one either side of today
//  - more than two days logged in one real day, or two non-consecutive ones
// Only the normal (current-week) flow is checked; past-week corrections are left
// alone. "Someone threw between the rounds" is physical and just a reminder.
async function throwingWarning(playerId, savedDayIso) {
  if (weekOffset !== 0) return "";
  const warnings = [];

  const gap = Math.round(
    (new Date(savedDayIso + "T00:00:00") - new Date(todayIso + "T00:00:00")) / 86400000
  );
  if (Math.abs(gap) > 1) {
    warnings.push(`You're logging ${weekdayName(savedDayIso)}, more than a day either side of today.`);
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { data } = await db.rpc("sc_player_days_since", {
    p_card: CARD,
    p_player: playerId,
    p_since: since.toISOString(),
  });
  const days = [...new Set(data || [])].sort();
  if (days.length > 2) {
    warnings.push(`That's ${days.length} different days logged today — the rules allow at most two.`);
  } else if (days.length === 2) {
    const d = (new Date(days[1]) - new Date(days[0])) / 86400000;
    warnings.push(
      d === 1
        ? `Two days logged today (${weekdayName(days[0])} + ${weekdayName(days[1])}) — remember another player has to throw between your two rounds.`
        : `${weekdayName(days[0])} and ${weekdayName(days[1])} aren't consecutive — two days in one sitting have to be next to each other.`
    );
  }
  return warnings.join(" ");
}

$("scoreForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const row = {
    player_id: scorePlayer.value,
    day: selectedDayIso(),
    throw1: parseInt(throwEls[0].value, 10) || 0,
    throw2: parseInt(throwEls[1].value, 10) || 0,
    throw3: parseInt(throwEls[2].value, 10) || 0,
  };
  if (!row.player_id) {
    scoreMsg.className = "msg err";
    scoreMsg.textContent = "Add a player first.";
    return;
  }
  const { error } = await db.rpc("sc_upsert_score", {
    p_card: CARD,
    p_player: row.player_id,
    p_day: row.day,
    p_t1: row.throw1,
    p_t2: row.throw2,
    p_t3: row.throw3,
  });
  if (error) {
    scoreMsg.className = "msg err";
    scoreMsg.textContent = error.message;
    return;
  }
  const saved = `Saved — ${row.throw1 + row.throw2 + row.throw3} points.`;
  const warn = await throwingWarning(row.player_id, row.day);
  scoreMsg.className = warn ? "msg warn" : "msg ok";
  scoreMsg.textContent = warn ? `${saved} ⚠ ${warn}` : saved;
  await refreshWeekViews();
});

// ---------- week views ----------
async function fetchWeekScores(offset) {
  const { startIso, endIso } = weekRange(offset);
  const { data, error } = await db.rpc("sc_week_scores", {
    p_card: CARD,
    p_from: startIso,
    p_to: endIso,
  });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

function aggregate(rows) {
  const byPlayer = new Map();
  for (const r of rows) {
    const name = r.player_name ?? "?";
    const agg = byPlayer.get(r.player_id) || { name, total: 0, days: 0, best: 0 };
    agg.total += r.total;
    agg.days += 1;
    agg.best = Math.max(agg.best, r.total);
    byPlayer.set(r.player_id, agg);
  }
  return [...byPlayer.values()].sort((a, b) => b.total - a.total);
}

async function renderLeaderboard() {
  const { start, end } = weekRange(weekOffset);
  weekLabel.textContent =
    weekOffset === 0
      ? "This week"
      : weekOffset === -1
      ? "Last week"
      : `${fmtShort(start)} – ${fmtShort(end)}`;

  const standings = aggregate(await fetchWeekScores(weekOffset));
  if (!standings.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="5" class="muted">No scores logged for this week yet.</td></tr>`;
    return;
  }
  const topScore = standings[0].total;
  leaderboardBody.innerHTML = standings
    .map((s, i) => {
      const leader = s.total === topScore && topScore > 0 ? " class=\"leader\"" : "";
      return `<tr${leader}><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${s.days}</td><td>${s.best}</td><td>${s.total}</td></tr>`;
    })
    .join("");
}

async function renderTrophyHolder() {
  // Whoever won the most recent completed week holds the trophy now.
  const standings = aggregate(await fetchWeekScores(-1));
  const winner = standings[0];
  const { start, end } = weekRange(-1);
  if (!winner || winner.total === 0) {
    $("trophyHolder").textContent = "Up for grabs";
    $("trophyMeta").textContent = "No scores recorded last week.";
    return;
  }
  $("trophyHolder").textContent = winner.name;
  $("trophyMeta").textContent = `Won ${fmtShort(start)} – ${fmtShort(end)} with ${winner.total} points`;
}

async function renderBreakdown() {
  const { start } = weekRange(weekOffset);
  const days = [...Array(5)].map((_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const rows = await fetchWeekScores(weekOffset);
  const lookup = new Map(rows.map((r) => [`${r.player_id}|${r.day}`, r.total]));

  const head =
    `<tr><th>Player</th>` +
    days.map((d) => `<th>${d.toLocaleDateString(undefined, { weekday: "short" })}</th>`).join("") +
    `<th>Σ</th></tr>`;

  const body = players.length
    ? players
        .map((p) => {
          let sum = 0;
          const cells = days
            .map((d) => {
              const key = `${p.id}|${isoDate(d)}`;
              const v = lookup.get(key);
              if (v != null) sum += v;
              const cls = isoDate(d) === todayIso ? ' class="today"' : "";
              return `<td${cls}>${v ?? "·"}</td>`;
            })
            .join("");
          return `<tr><td>${escapeHtml(p.name)}</td>${cells}<td>${sum || "·"}</td></tr>`;
        })
        .join("")
    : `<tr><td class="muted" colspan="7">No players yet.</td></tr>`;

  breakdownTable.querySelector("thead").innerHTML = head;
  breakdownTable.querySelector("tbody").innerHTML = body;
}

async function refreshWeekViews() {
  await Promise.all([renderLeaderboard(), renderTrophyHolder(), renderBreakdown()]);
}

function syncWeekViews() {
  renderDaySelect();
  renderLeaderboard();
  renderBreakdown();
}

function changeWeek(delta) {
  const next = weekOffset + delta;
  if (next > 0) return; // no future weeks
  weekOffset = next;
  syncWeekViews();
  prefillScore();
}
$("prevWeek").addEventListener("click", () => changeWeek(-1));
$("nextWeek").addEventListener("click", () => changeWeek(1));

// ---------- rules modal ----------
(function bindRulesModal() {
  const modal = $("rulesModal");
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };
  $("openRules").addEventListener("click", () => {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  });
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!modal.hidden && e.key === "Escape") close();
  });
})();

// ---------- scorecard ----------
$("cardName").textContent = localStorage.getItem("dt_card_name") || "";
$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("dt_card_id");
  localStorage.removeItem("dt_card_name");
  location.replace("login.html");
});

// ---------- misc ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- init ----------
renderDaySelect();
await loadPlayers();
await prefillScore();
await refreshWeekViews();
