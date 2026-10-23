const TEAMS = {
  ARI:["Arizona Cardinals","#97233F"], ATL:["Atlanta Falcons","#A71930"], BAL:["Baltimore Ravens","#241773"],
  BUF:["Buffalo Bills","#00338D"], CAR:["Carolina Panthers","#0085CA"], CHI:["Chicago Bears","#0B162A"],
  CIN:["Cincinnati Bengals","#FB4F14"], CLE:["Cleveland Browns","#311D00"], DAL:["Dallas Cowboys","#003594"],
  DEN:["Denver Broncos","#FB4F14"], DET:["Detroit Lions","#0076B6"], GB:["Green Bay Packers","#203731"],
  HOU:["Houston Texans","#03202F"], IND:["Indianapolis Colts","#002C5F"], JAX:["Jacksonville Jaguars","#006778"],
  KC:["Kansas City Chiefs","#E31837"], LV:["Las Vegas Raiders","#000000"], LAC:["Los Angeles Chargers","#0080C6"],
  LAR:["Los Angeles Rams","#003594"], MIA:["Miami Dolphins","#008E97"], MIN:["Minnesota Vikings","#4F2683"],
  NE:["New England Patriots","#002244"], NO:["New Orleans Saints","#D3BC8D"], NYG:["New York Giants","#0B2265"],
  NYJ:["New York Jets","#125740"], PHI:["Philadelphia Eagles","#004C54"], PIT:["Pittsburgh Steelers","#FFB612"],
  SF:["San Francisco 49ers","#AA0000"], SEA:["Seattle Seahawks","#002244"], TB:["Tampa Bay Buccaneers","#D50A0A"],
  TEN:["Tennessee Titans","#4B92DB"], WAS:["Washington Commanders","#5A1414"]
};
const ESPN_TO_OURS = { WSH: "WAS" };   // ESPN abbreviation -> ours
const LOGO_CODE = { WAS: "wsh" };      // ours -> ESPN logo filename
const logoUrl = a => `https://a.espncdn.com/i/teamlogos/nfl/500/${(LOGO_CODE[a] || a).toLowerCase()}.png`;
const logoHtml = a => `<span class="logo"><img src="${logoUrl(a)}" crossorigin="anonymous" alt="${a}" onerror="this.parentNode.textContent='${a}'"></span>`;
const nick = a => TEAMS[a][0].split(" ").pop();
const TIER_COLORS = ["#f5c542", "#3fb6ff", "#5ddc8b", "#ff7a59", "#b18cff", "#8d97ad"];
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const STANDINGS  = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";  // note: /apis/v2, not /apis/site/v2

// Export size presets. w/h = output pixels. css1 / css2 = on-screen design width for 1- and 2-column layouts.
const PRESETS = {
  auto:      { label: "Size: Auto (card)",           w: null, h: null,  css1: 760,  css2: 1000 },
  square:    { label: "Square 1:1 · 1080×1080",      w: 1080, h: 1080,  css1: 900,  css2: 1100 },
  portrait:  { label: "Portrait 4:5 · 1080×1350",    w: 1080, h: 1350,  css1: 900,  css2: 1000 },
  story:     { label: "Story 9:16 · 1080×1920",      w: 1080, h: 1920,  css1: 900,  css2: 800  },
  landscape: { label: "Wide 16:9 · 1920×1080",       w: 1920, h: 1080,  css1: 1100, css2: 1100 }
};

const KEY = "nflPicks.v1";
const defaults = () => ({
  tab: "rank",
  rankTitle: "NFL Power Rankings", rankSub: "2026 Season · Week 7",
  order: Object.keys(TEAMS), notes: {}, tiers: {},
  layout: "one",          // "one" | "two"
  showNotes: false,       // notes field on each team (off by default)
  showRec: true,          // record column (read-only, from ESPN)
  showMov: true,          // risers/fallers box
  size: "auto",           // export preset key
  records: {},            // abbr -> "5-1"  (from ESPN standings)
  snapshots: [],          // [{id,label,date,order:[team abbrs]}]
  compareTo: null,        // snapshot id used for movement arrows + movers box
  gameTitle: "Game Predictions", gameSub: "",
  season: null, week: null,
  schedule: {},           // "season-week" -> [{id,date,away,home,state,awayPts,homePts}]
  custom: {},             // "season-week" -> [{id,away,home,custom:true}]
  picks: {}               // "season-week" -> { gameId: {pick, awayScore, homeScore} }
});
let state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}"));
delete state.recManual;   // manual record overrides were removed; ignore any saved ones
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const card = document.getElementById("card");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isTier = id => id.startsWith("T:");
const curKey = () => `${state.season}-${state.week}`;
const pickObj = (key, id) => ((state.picks[key] ??= {})[id] ??= {});
const teamOrder = () => state.order.filter(id => !isTier(id));
const recVal = a => state.records[a] ?? "";

// ---------- color helpers ----------
const rgb = hex => [1,3,5].map(i => parseInt(hex.substr(i,2),16));
const isLight = hex => { const [r,g,b] = rgb(hex); return (0.299*r + 0.587*g + 0.114*b) > 150; };
const shade = (hex, amt) => "#" + rgb(hex).map(v => Math.max(0, Math.min(255, Math.round(v*(1+amt)))).toString(16).padStart(2,"0")).join("");
const tierStyle = c => `background:linear-gradient(90deg, ${c}66, ${c}08); border-left:5px solid ${c};`;

// ---------- Frame / export size ----------
const fitEl = document.getElementById("fit");
function applyFrame() {
  const p = PRESETS[state.size] || PRESETS.auto;
  const two = state.tab === "rank" && state.layout === "two";
  const cssW = two ? p.css2 : p.css1;
  card.style.width = cssW + "px";
  card.classList.toggle("framed", !!p.w);
  card.style.minHeight = p.w ? Math.round(cssW * p.h / p.w) + "px" : "";
  const over = p.w && card.offsetHeight > parseFloat(card.style.minHeight) + 2;
  fitEl.textContent = over ? "⚠ Taller than frame" : "";
  fitEl.title = over ? "Content is taller than this aspect ratio, so the export will shrink to fit (with side margins). Try 2 columns or a taller preset." : "";
}

// ---------- Power rankings ----------
function moveHtml(a, rank, oldRank) {
  if (!oldRank) return "";
  const o = oldRank[a];
  if (o == null) return `<span class="mv new">NEW</span>`;
  const d = o - rank;   // positive = moved up
  if (d > 0) return `<span class="mv up">▲${d}</span>`;
  if (d < 0) return `<span class="mv down">▼${-d}</span>`;
  return `<span class="mv same">–</span>`;
}

function teamRow(a, rank, oldRank, two) {
  const hex = TEAMS[a][1];
  const fg = isLight(hex) ? "#111" : "#fff";
  const rv = recVal(a);
  return `
    <li class="team" data-id="${a}" style="background:linear-gradient(90deg, ${hex}, ${shade(hex, -0.4)}); color:${fg};">
      <span class="handle">⠿</span>
      <span class="rk">${rank}</span>
      ${moveHtml(a, rank, oldRank)}
      ${logoHtml(a)}
      <span class="info ${state.showNotes ? "" : "nonote"}">
        <span class="nm" title="${TEAMS[a][0]}">${two ? nick(a) : TEAMS[a][0]}</span>
        ${state.showNotes ? `<input class="note" data-note="${a}" placeholder="note…" value="${esc(state.notes[a])}">` : ""}
      </span>
      ${state.showRec ? `<span class="trecw ${rv ? "" : "empty"}"><span class="trec" data-rec="${a}" title="Record from ESPN">${esc(rv) || "–"}</span></span>` : ""}
      <button class="tierbtn" data-addtier="${a}" title="Insert tier break below">${two ? "＋" : "＋ tier"}</button>
    </li>`;
}

function tierRow(id) {
  const t = state.tiers[id] || (state.tiers[id] = { name: "New Tier", color: TIER_COLORS[0] });
  return `
    <li class="tier" data-id="${id}" style="${tierStyle(t.color)}">
      <span class="handle">⠿</span>
      <input class="tier-name" data-tname="${id}" placeholder="Tier name" value="${esc(t.name)}">
      <input type="color" data-tcolor="${id}" value="${t.color}">
      <button class="del" data-deltier="${id}" title="Remove tier break">✕</button>
    </li>`;
}

function moversHtml(oldRank) {
  if (!state.showMov || !oldRank) return "";
  const list = [];
  teamOrder().forEach((a, i) => {
    const o = oldRank[a];
    if (o != null) list.push({ a, now: i + 1, old: o, d: o - (i + 1) });
  });
  const up   = list.filter(x => x.d > 0).sort((x, y) => y.d - x.d || x.now - y.now).slice(0, 3);
  const down = list.filter(x => x.d < 0).sort((x, y) => x.d - y.d || x.now - y.now).slice(0, 3);
  if (!up.length && !down.length) return "";
  const item = (x, cls) => `
    <div class="mi">${logoHtml(x.a)}<span class="mn">${nick(x.a)}</span>
      <span class="mr">#${x.old} → #${x.now}</span>
      <span class="md ${cls}">${cls === "up" ? "▲" : "▼"}${Math.abs(x.d)}</span></div>`;
  const col = (cls, title, arr) => `
    <div class="mcol ${cls}"><div class="mh">${title}</div>
      ${arr.length ? arr.map(x => item(x, cls)).join("") : `<div class="mnone">—</div>`}</div>`;
  return `<div class="movers">${col("up", "▲ Biggest risers", up)}${col("down", "▼ Biggest fallers", down)}</div>`;
}

let sortables = [];
function renderRank() {
  const two = state.layout === "two";
  const base = state.snapshots.find(s => s.id === state.compareTo);
  const oldRank = base ? Object.fromEntries(base.order.map((a, i) => [a, i + 1])) : null;

  // In 2-col mode the left column holds the first half of the teams (plus any tiers before the next team)
  let split = state.order.length;
  if (two) {
    const half = Math.ceil(teamOrder().length / 2);
    let c = 0;
    split = state.order.findIndex(id => !isTier(id) && ++c === half) + 1;
  }

  let rank = 0;
  const rows = state.order.map(id => isTier(id) ? tierRow(id) : teamRow(id, ++rank, oldRank, two));
  const body = two
    ? `<div class="cols"><ol class="rlist two">${rows.slice(0, split).join("")}</ol><ol class="rlist two">${rows.slice(split).join("")}</ol></div>`
    : `<ol class="rlist">${rows.join("")}</ol>`;

  card.innerHTML = `
    <input class="title" data-k="rankTitle" value="${esc(state.rankTitle)}">
    <input class="sub" data-k="rankSub" value="${esc(state.rankSub)}">
    ${moversHtml(oldRank)}
    <button class="add top" data-addtier="top">+ Tier break at top</button>
    ${body}
    ${base ? `<div class="foot">▲▼ movement vs. ${esc(base.label)}</div>` : ""}`;

  sortables.forEach(s => s.destroy());
  sortables = [...card.querySelectorAll(".rlist")].map(el => Sortable.create(el, {
    group: "rank", handle: ".handle", animation: 150,
    onEnd() {
      // Both columns read in DOM order = the full ranking
      state.order = [...card.querySelectorAll(".rlist li")].map(li => li.dataset.id);
      save();
      setTimeout(renderRank, 0);
    }
  }));
  applyFrame();
}

function addTier(afterId) {
  const id = "T:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const n = Object.keys(state.tiers).length;
  state.tiers[id] = { name: "Tier " + (n + 1), color: TIER_COLORS[n % TIER_COLORS.length] };
  const idx = afterId === "top" ? 0 : state.order.indexOf(afterId) + 1;
  state.order.splice(idx, 0, id);
  save(); renderRank();
}

// ---------- Records (ESPN standings, read-only) ----------
const rstatus = document.getElementById("rstatus");
const setRStatus = m => rstatus.textContent = m;

function paintRecords() {
  card.querySelectorAll("[data-rec]").forEach(el => {
    const v = recVal(el.dataset.rec);
    el.textContent = v || "–";
    el.parentNode.classList.toggle("empty", !v);
  });
}

async function loadRecords() {
  setRStatus("Loading records…");
  try {
    const r = await fetch(state.season ? `${STANDINGS}?season=${state.season}` : STANDINGS);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const entries = [];
    (function walk(n) {
      if (!n) return;
      if (n.standings?.entries) entries.push(...n.standings.entries);
      (n.children || []).forEach(walk);
    })(d);
    const rec = {};
    for (const e of entries) {
      const raw = e.team?.abbreviation;
      const ab = ESPN_TO_OURS[raw] || raw;
      if (!TEAMS[ab]) continue;
      const st = Object.fromEntries((e.stats || []).map(s => [s.name, s]));
      let str = "";
      if (st.wins && st.losses) {
        const w = Number(st.wins.value), l = Number(st.losses.value), t = Number(st.ties?.value || 0);
        str = `${w}-${l}` + (t ? `-${t}` : "");
      } else if (st.overall?.displayValue) str = st.overall.displayValue;
      else if (st.record?.displayValue) str = st.record.displayValue;
      if (str) rec[ab] = str;
    }
    if (!Object.keys(rec).length) throw new Error("No records found in response");
    state.records = rec;
    save();
    setRStatus("Records updated");
  } catch (err) {
    console.warn("Standings fetch failed:", err);
    setRStatus(Object.keys(state.records).length ? "Offline – saved records" : "Records failed to load");
  }
  paintRecords();
}

// ---------- Snapshots (for movement arrows + movers box) ----------
const cmpSel = document.getElementById("cmpSel");
function renderCmp() {
  const fmt = d => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  cmpSel.innerHTML = `<option value="">No comparison</option>` +
    [...state.snapshots].reverse().map(s =>
      `<option value="${s.id}">vs. ${esc(s.label)} (${fmt(s.date)})</option>`).join("");
  cmpSel.value = state.snapshots.some(s => s.id === state.compareTo) ? state.compareTo : "";
}
cmpSel.onchange = () => { state.compareTo = cmpSel.value || null; save(); renderRank(); };
document.getElementById("snapSave").onclick = () => {
  const label = prompt(
    "Name this snapshot.\n\nFrom now on, movement arrows and the movers box will compare against it — so export your current graphic first!",
    state.rankSub);
  if (!label) return;
  const snap = { id: "s" + Date.now().toString(36), label, date: new Date().toISOString(), order: teamOrder() };
  state.snapshots.push(snap);
  state.compareTo = snap.id;
  save(); renderCmp(); renderRank();
};
document.getElementById("snapDel").onclick = () => {
  const s = state.snapshots.find(x => x.id === state.compareTo);
  if (!s) return alert("Select a snapshot in the dropdown first.");
  if (!confirm(`Delete snapshot "${s.label}"?`)) return;
  state.snapshots = state.snapshots.filter(x => x.id !== s.id);
  state.compareTo = state.snapshots.length ? state.snapshots[state.snapshots.length - 1].id : null;
  save(); renderCmp(); renderRank();
};

// ---------- Game predictions ----------
const ET = "America/New_York";
const fmtDay  = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "long", month: "short", day: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
const fmtKey  = new Intl.DateTimeFormat("en-CA", { timeZone: ET });   // YYYY-MM-DD, used only for grouping

let netMsg = "";
const setStatus = m => { netMsg = m; document.getElementById("status").textContent = m; };

// Who won? "away" | "home" | "tie" | null (not final yet)
const result = g => {
  if (g.state !== "post" || g.awayPts == null || g.homePts == null) return null;
  return g.awayPts > g.homePts ? "away" : g.homePts > g.awayPts ? "home" : "tie";
};
// Was the pick right? "ok" | "bad" | "tie" | null
function grade(g, p) {
  const res = result(g);
  if (!res || !p?.pick) return null;
  if (res === "tie") return "tie";
  return res === p.pick ? "ok" : "bad";
}
function tally(keyFilter) {
  const t = { w: 0, l: 0, t: 0 };
  for (const [key, games] of Object.entries(state.schedule)) {
    if (!keyFilter(key)) continue;
    for (const g of games) {
      const r = grade(g, state.picks[key]?.[g.id]);
      if (r === "ok") t.w++; else if (r === "bad") t.l++; else if (r === "tie") t.t++;
    }
  }
  return t;
}
function recordBar() {
  const n = t => t.w + t.l + t.t;
  const wk = tally(k => k === curKey());
  const se = tally(k => k.startsWith(state.season + "-"));
  if (!n(se)) return "";
  const rec = t => `${t.w}–${t.l}${t.t ? "–" + t.t : ""}`;
  const pct = t => ((t.w + t.t / 2) / n(t) * 100).toFixed(1) + "%";
  const box = (label, t) => n(t)
    ? `<div class="rec"><span class="rl">${label}</span><span class="rv">${rec(t)}</span><span class="rp">${pct(t)}</span></div>` : "";
  return `<div class="recbar">${box("Week " + state.week, wk)}${box("Season", se)}</div>`;
}

function teamSelect(val, id, side) {
  return `<select data-cg="${id}" data-side="${side}">` +
    Object.keys(TEAMS).map(a => `<option value="${a}" ${a===val?"selected":""}>${TEAMS[a][0]}</option>`).join("") +
    `</select>`;
}

function gameRow(g, key) {
  const p = state.picks[key]?.[g.id] || {};
  const gr = grade(g, p);
  const res = result(g);
  const side = s => {
    const cls = [
      p.pick === s ? "win" : "",
      p.pick === s && gr === "bad" ? "wrong" : "",
      res && res !== "tie" && res !== s ? "lost" : ""
    ].join(" ");
    return `
    <div class="side ${cls}">
      <button class="pick" data-pick="${g.id}:${s}">${p.pick === s && gr === "bad" ? "✗" : "✓"}</button>
      ${logoHtml(g[s])}
      ${g.custom ? teamSelect(g[s], g.id, s) : `<span class="nick">${nick(g[s])}</span>`}
      <input class="score" type="number" data-score="${g.id}:${s}" value="${esc(p[s + "Score"])}" placeholder="–">
    </div>`;
  };
  let chip = "";
  if ((g.state === "post" || g.state === "in") && g.awayPts != null && g.homePts != null) {
    chip = `<div class="res ${gr === "tie" ? "" : gr || ""} ${g.state}">
      <span class="rt">${g.state === "in" ? "LIVE" : "FINAL"}</span>
      <span class="rs">${g.awayPts}–${g.homePts}</span></div>`;
  }
  return `<div class="game">${side("away")}<span class="at">@</span>${side("home")}${chip}
    ${g.custom ? `<button class="del" data-delc="${g.id}">✕</button>` : ""}</div>`;
}

function renderGames() {
  const key = curKey();
  const sched = [...(state.schedule[key] || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const custom = state.custom[key] || [];

  let html = "", lastDay = "", lastSlot = "";
  for (const g of sched) {
    const d = new Date(g.date);
    const day = fmtKey.format(d), slot = fmtTime.format(d) + " ET";
    if (day !== lastDay) { html += `<div class="day">${fmtDay.format(d)}</div>`; lastDay = day; lastSlot = ""; }
    if (slot !== lastSlot) { html += `<div class="slot">${slot}</div>`; lastSlot = slot; }
    html += gameRow(g, key);
  }
  if (custom.length) html += `<div class="day">Added games</div>` + custom.map(g => gameRow(g, key)).join("");
  if (!sched.length && !custom.length)
    html += `<div class="msg">${netMsg.startsWith("Loading") || !state.week ? "Loading schedule…" : "No games loaded. Use “+ Add game” below to enter them manually."}</div>`;

  let bye = "";
  if (sched.length) {
    const playing = new Set(sched.flatMap(g => [g.away, g.home]));
    const off = Object.keys(TEAMS).filter(a => !playing.has(a));
    if (off.length) bye = `Bye: ${off.join(", ")} &nbsp;·&nbsp; `;
  }

  card.innerHTML = `
    <input class="title" data-k="gameTitle" value="${esc(state.gameTitle)}">
    <input class="sub" data-k="gameSub" value="${esc(state.gameSub)}">
    ${recordBar()}
    ${html}
    <button class="add" id="addGame">+ Add game</button>
    <div class="foot">${bye}✓ = your pick · ✗ = missed · times ET</div>`;
  applyFrame();
}

// ---------- Auto-pick / clear ----------
function autoPick() {
  const key = curKey();
  const rk = {};
  teamOrder().forEach((a, i) => rk[a] = i);
  const games = [...(state.schedule[key] || []), ...(state.custom[key] || [])];
  if (!games.length) return setStatus("No games to pick");
  let n = 0;
  for (const g of games) {
    if (g.state === "post" || g.state === "in") continue;   // don't pick games already started
    const p = pickObj(key, g.id);
    if (p.pick) continue;                                    // keep picks you already made
    p.pick = rk[g.away] < rk[g.home] ? "away" : "home";      // lower index = higher ranked
    n++;
  }
  save(); renderGames();
  setStatus(n ? `Picked ${n} game${n > 1 ? "s" : ""}` : "Nothing to fill");
}
function clearPicks() {
  const key = curKey();
  const games = [...(state.schedule[key] || []), ...(state.custom[key] || [])];
  const locked = new Set(games.filter(g => g.state === "post").map(g => g.id));
  const picks = state.picks[key] || {};
  const ids = Object.keys(picks).filter(id => picks[id].pick && !locked.has(id));
  if (!ids.length) return setStatus("No picks to clear");
  if (!confirm(`Clear ${ids.length} pick${ids.length > 1 ? "s" : ""} for Week ${state.week}? (Finished games are kept so your record doesn't change.)`)) return;
  ids.forEach(id => picks[id].pick = null);
  save(); renderGames(); setStatus("Cleared");
}

// ---------- ESPN schedule loading ----------
async function fetchWeek(season, week) {
  const r = await fetch(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const fix = a => ESPN_TO_OURS[a] || a;
  const num = v => (v === undefined || v === null || v === "") ? null : Number(v);
  const games = (d.events || []).map(ev => {
    const c = ev.competitions[0];
    const home = c.competitors.find(x => x.homeAway === "home");
    const away = c.competitors.find(x => x.homeAway === "away");
    const st = ev.status?.type || {};
    const gState = st.completed ? "post" : st.state === "in" ? "in" : "pre";
    const hasScore = gState !== "pre";
    return {
      id: ev.id, date: ev.date, away: fix(away.team.abbreviation), home: fix(home.team.abbreviation),
      state: gState,
      awayPts: hasScore ? num(away.score) : null,
      homePts: hasScore ? num(home.score) : null
    };
  }).filter(g => TEAMS[g.away] && TEAMS[g.home]);
  if (!games.length) throw new Error("No games");
  return games;
}

async function loadWeek() {
  if (!state.week) return;
  const key = curKey();
  setStatus("Loading…");
  if (state.tab === "games") renderGames();   // show cached data immediately
  try {
    state.schedule[key] = await fetchWeek(state.season, state.week);
    save();
    setStatus("Updated");
  } catch (err) {
    console.warn("Schedule fetch failed:", err);
    setStatus(state.schedule[key] ? "Offline – saved schedule" : "Load failed");
  }
  if (state.tab === "games") renderGames();
}

// Quietly update results for other weeks where you made picks, so the season record stays current
async function refreshPicked() {
  for (const key of Object.keys(state.picks)) {
    const [s, w] = key.split("-").map(Number);
    if (s !== state.season || key === curKey()) continue;
    const games = state.schedule[key];
    if (games && games.every(g => g.state === "post")) continue;
    try { state.schedule[key] = await fetchWeek(s, w); save(); }
    catch (err) { console.warn("Couldn't refresh", key, err); }
  }
  if (state.tab === "games") renderGames();
}

function setWeek(week, season = state.season) {
  const changed = week !== state.week || season !== state.season;
  state.week = week; state.season = season;
  if (changed) state.gameSub = `${season} Season · Week ${week}`;
  save();
  document.getElementById("weekSel").value = week;
}

async function detectCurrentWeek() {
  let season = state.season, week = state.week;
  try {
    const d = await (await fetch(SCOREBOARD)).json();
    if (d.season?.year) season = d.season.year;
    if (d.season?.type === 2 && d.week?.number) week = d.week.number;
  } catch (err) { console.warn("Couldn't detect current week:", err); }
  setWeek(week ?? 1, season ?? new Date().getFullYear());
  if (state.showRec) loadRecords();
  await loadWeek();
  refreshPicked();
}

// ---------- Controls ----------
const layoutSel = document.getElementById("layoutSel");
const noteChk = document.getElementById("noteChk");
const recChk = document.getElementById("recChk");
const movChk = document.getElementById("movChk");
const sizeSel = document.getElementById("sizeSel");
sizeSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join("");

function syncControls() {
  layoutSel.value = state.layout;
  noteChk.checked = state.showNotes;
  recChk.checked = state.showRec;
  movChk.checked = state.showMov;
  sizeSel.value = PRESETS[state.size] ? state.size : "auto";
}

function render() {
  syncControls();
  document.getElementById("tabRank").classList.toggle("active", state.tab === "rank");
  document.getElementById("tabGames").classList.toggle("active", state.tab === "games");
  document.getElementById("weekWrap").style.display = state.tab === "games" ? "flex" : "none";
  document.getElementById("rankTools").style.display = state.tab === "rank" ? "flex" : "none";
  if (state.tab === "rank") { renderCmp(); renderRank(); } else renderGames();
}

layoutSel.onchange = () => { state.layout = layoutSel.value; save(); renderRank(); };
noteChk.onchange = () => { state.showNotes = noteChk.checked; save(); renderRank(); };
recChk.onchange = () => {
  state.showRec = recChk.checked; save(); renderRank();
  if (state.showRec && !Object.keys(state.records).length) loadRecords();
};
movChk.onchange = () => { state.showMov = movChk.checked; save(); renderRank(); };
sizeSel.onchange = () => { state.size = sizeSel.value; save(); applyFrame(); };
document.getElementById("recRefresh").onclick = loadRecords;

// ---------- Events (delegated) ----------
card.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.k) state[t.dataset.k] = t.value;
  else if (t.dataset.note) state.notes[t.dataset.note] = t.value;
  else if (t.dataset.tname) state.tiers[t.dataset.tname].name = t.value;
  else if (t.dataset.tcolor) {
    state.tiers[t.dataset.tcolor].color = t.value;
    t.closest("li").setAttribute("style", tierStyle(t.value));
  }
  else if (t.dataset.score) {
    const s = t.dataset.score, i = s.lastIndexOf(":");
    pickObj(curKey(), s.slice(0, i))[s.slice(i + 1) + "Score"] = t.value;
  }
  save();
});
card.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.cg) {
    const g = (state.custom[curKey()] || []).find(x => x.id === t.dataset.cg);
    if (g) { g[t.dataset.side] = t.value; save(); renderGames(); }
  }
});
card.addEventListener("click", e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.addtier) {
    addTier(t.dataset.addtier);
  } else if (t.dataset.deltier) {
    const id = t.dataset.deltier;
    state.order = state.order.filter(x => x !== id);
    delete state.tiers[id];
    save(); renderRank();
  } else if (t.dataset.pick) {
    const s = t.dataset.pick, i = s.lastIndexOf(":");
    const p = pickObj(curKey(), s.slice(0, i)), side = s.slice(i + 1);
    p.pick = p.pick === side ? null : side;
    save(); renderGames();
  } else if (t.dataset.delc) {
    const key = curKey();
    state.custom[key] = (state.custom[key] || []).filter(g => g.id !== t.dataset.delc);
    save(); renderGames();
  } else if (t.id === "addGame") {
    const key = curKey();
    (state.custom[key] ??= []).push({ id: "c" + Date.now().toString(36), away: "KC", home: "BUF", custom: true });
    save(); renderGames();
  }
});

// ---------- Toolbar ----------
const weekSel = document.getElementById("weekSel");
weekSel.innerHTML = Array.from({ length: 18 }, (_, i) => `<option value="${i+1}">Week ${i+1}</option>`).join("");
weekSel.onchange = () => { setWeek(+weekSel.value); loadWeek(); };
document.getElementById("refresh").onclick = () => { loadWeek(); refreshPicked(); };
document.getElementById("autopick").onclick = autoPick;
document.getElementById("clearpicks").onclick = clearPicks;
document.getElementById("tabRank").onclick = () => { state.tab = "rank"; save(); render(); };
document.getElementById("tabGames").onclick = () => { state.tab = "games"; save(); render(); };
document.getElementById("reset").onclick = () => {
  if (confirm("Reset everything? This also deletes your snapshots, notes and picks.")) {
    state = defaults(); save(); render(); detectCurrentWeek();
  }
};

// ---------- Export ----------
function paintBg(ctx, w, h) {   // same look as the card's CSS: linear-gradient(160deg, #141a28, #0b0f18)
  const a = 160 * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const g = ctx.createLinearGradient(w/2 - dx*len/2, h/2 - dy*len/2, w/2 + dx*len/2, h/2 + dy*len/2);
  g.addColorStop(0, "#141a28"); g.addColorStop(1, "#0b0f18");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

document.getElementById("export").onclick = async () => {
  document.activeElement?.blur();
  const p = PRESETS[state.size] || PRESETS.auto;
  card.classList.add("exporting");
  try {
    // Capture the card at a resolution high enough for the target size
    const scale = p.w ? Math.max(2, p.w / card.offsetWidth) : 2;
    const shot = await html2canvas(card, { scale, backgroundColor: null, useCORS: true });

    // Compose onto an exact-size canvas; shrink-to-fit if the content is taller than the frame
    const W = p.w || shot.width, H = p.h || shot.height;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d");
    paintBg(ctx, W, H);
    const fit = Math.min(W / shot.width, H / shot.height);
    const dw = shot.width * fit, dh = shot.height * fit;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(shot, (W - dw) / 2, (H - dh) / 2, dw, dh);

    const a = document.createElement("a");
    const base = state.tab === "rank" ? "power-rankings" : `game-predictions-week${state.week}`;
    a.download = base + (p.w ? "-" + state.size : "") + ".png";
    a.href = out.toDataURL("image/png");
    a.click();
  } finally {
    card.classList.remove("exporting");
  }
};

render();
detectCurrentWeek();
