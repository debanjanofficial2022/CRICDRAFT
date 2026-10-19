// CricDraft — screens. Bundled with engine.js and game.js into one page by build.mjs.
const DATA = window.CRICDRAFT_DATA;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("cricdraft-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cricdraft-" + k, JSON.stringify(v)); } catch {} },
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MIXKEYS = [["bat", "Batters", "Middle order, besides the two openers"], ["ar", "All-rounders", "Bat and bowl"], ["spin", "Spinners", "Finger and wrist spin"], ["pace", "Pace bowlers", "Fast and medium"]];
const VIEWS = { ball: ["Ball by ball", "Every delivery, and you make the captain's calls"], over: ["Over by over", "One update an over, and you make the captain's calls"], result: ["Result only", "Straight to the scorecard"] };
const SPEEDS = [1, 2, 4];
const PEER_SRC = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
const PEER_PREFIX = "cricdraft-room-";
const SOLO = "Your XI";
const PHOTOS = window.CRICDRAFT_PHOTOS || {};
// Freely licensed photos from Wikimedia Commons, matched by ESPNcricinfo ID through Wikidata.
function photoOf(p) {
  const id = String(p.ident || ""); if (!id.startsWith("ci:")) return null;
  const x = PHOTOS[id.slice(3)]; if (!x) return null;
  const src = x[0].replace(/^T:/, "https://upload.wikimedia.org/wikipedia/commons/thumb/").replace(/^U:/, "https://upload.wikimedia.org/wikipedia/commons/");
  return { src, author: x[1], license: x[2], page: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(x[3].replace(/ /g, "_")) };
}
function portrait(p) {
  const ph = photoOf(p);
  if (!ph) return `<figure class="portrait none"><span class="ini-badge" aria-hidden="true">${esc(initials(p.name))}</span><figcaption>No free photo yet</figcaption></figure>`;
  return `<figure class="portrait"><img src="${esc(ph.src)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('none');this.remove()"><span class="ini-badge" aria-hidden="true">${esc(initials(p.name))}</span><figcaption>Photo: <a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.author || "Wikimedia Commons")}</a>, ${esc(ph.license || "see file page")}</figcaption></figure>`;
}

let S = null; // the current draft and campaign (or friend game)
let M = null; // the match being watched
let R = null; // the friend room
const home = { fmt: store.get("fmt", "odi"), mix: store.get("mix", { ...PRESETS.balanced.mix }), name: store.get("name", ""), friend: false, code: "" };
{
  const q = new URLSearchParams(location.search).get("room");
  if (q) { home.friend = true; home.code = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
}

const newSeed = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
const isIPL = () => S && S.fmt === "ipl";
const overseasCount = () => S.slots.filter(x => x.p && x.p.overseas).length;
const filled = () => S.slots.filter(x => x.p).length;
const xiOf = () => S.slots.map(x => x.p);
const surname = n => { const w = String(n).split(" "); return w.length > 1 ? w.slice(1).join(" ") : n; };
const initials = n => String(n).split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const cleanName = (n, d) => (String(n || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20) || d);
const topBar = (left, mid, right = "") => `<div class="bar-top">${left}<span>${mid}</span><span class="count">${right}</span></div>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------------- players ---------------- */
function groupOf(p) {
  if (p.keeper) return "wk";
  if (p.bowl > 0 && p.role === "A") return "ar";
  if (p.bowl > 0 && (p.role === "W" || (p.role !== "B" && p.role !== "O" && p.role !== "K" && p.bowl >= p.bat))) return p.style === "spin" ? "spin" : "pace";
  return "bat";
}
const GROUPS = [["bat", "Batters"], ["wk", "Wicketkeepers"], ["ar", "All-rounders"], ["spin", "Spinners"], ["pace", "Pace bowlers"]];
function roleLine(p) {
  const parts = [];
  if (p.keeper) parts.push("Keeper");
  if (p.opener) parts.push("Opener");
  parts.push(`${p.hand === "L" ? "Left" : "Right"}-hand bat`);
  if (p.bowl > 0) parts.push(`${p.arm === "L" ? "Left" : "Right"}-arm ${p.style}`);
  return parts.join(" · ");
}
const shortFmt = () => S.fmt === "t20" || S.fmt === "ipl";
function statHeads() { return ["Bat", "Bowl", "M", "Runs", "Avg", "SR", "100s", "Wkts", "Econ", ...(shortFmt() ? [] : ["5w"])].map(h => `<span>${h}</span>`).join(""); }
function statCells(p) {
  const s = p.st || [0, 0, -1, -1, 0, 0, -1, 0];
  const [m, r, a, sr, h, w, e, w5] = s;
  const cell = (l, v) => `<span class="st"><i>${l}</i>${v}</span>`;
  return `<span class="st rt2"><i>Bat</i>${p.bat}</span><span class="st rt2"><i>Bowl</i>${p.bowl || "–"}</span>` + cell("M", m) + cell("Runs", r) + cell("Avg", a < 0 ? (r > 0 ? "–" : "–") : (a / 10).toFixed(1)) + cell("SR", sr < 0 ? "–" : sr) + cell("100s", h) +
    cell("Wkts", e < 0 ? "–" : w) + cell("Econ", e < 0 ? "–" : (e / 10).toFixed(1)) + (shortFmt() ? "" : cell("5w", e < 0 ? "–" : w5));
}
function sqCache() {
  if (!S.sq || S.sq.key !== S.key) {
    const list = squad(DATA, S.fmt, S.key);
    const st = p => p.st || [0, 0, 0, 0, 0, 0, 0, 0];
    list.sort((a, b) => { const g = groupOf(a); return g === "spin" || g === "pace" ? st(b)[5] - st(a)[5] : g === "ar" ? (st(b)[1] + 25 * st(b)[5]) - (st(a)[1] + 25 * st(a)[5]) : st(b)[1] - st(a)[1]; });
    S.sq = { key: S.key, list };
  }
  return S.sq.list;
}
function fitsFor(p) {
  if (S.used.includes(p.ident)) return [];
  if (isIPL() && p.overseas && overseasCount() >= MAX_OVERSEAS) return [];
  return [...new Set(S.slots.filter(x => !x.p).map(x => x.s).filter(s => SLOT[s].ok(p)))];
}

/* ---------------- the field ---------------- */
const FIELD = [[100, 140], [100, 56], [116, 147], [137, 134], [160, 106], [150, 66], [124, 36], [76, 36], [48, 68], [40, 106], [64, 168]];
function spotsFor(slots) { let k = 1; return slots.map(x => (x.s === "WK" ? FIELD[0] : FIELD[Math.min(k++, 10)])); }
function fieldSVG(slots) {
  const sp = spotsFor(slots), n = slots.filter(x => x.p).length;
  return `<svg class="field" viewBox="0 0 200 200" role="img" aria-label="The field: ${n} of 11 places filled">
    <circle cx="100" cy="100" r="97" class="f-grass"/><circle cx="100" cy="100" r="62" class="f-ring"/><rect x="94" y="78" width="12" height="44" rx="1" class="f-strip"/>
    ${slots.map((x, i) => { const [cx, cy] = sp[i]; return `<g class="spot${x.p ? " on" : ""}${S && S.justPicked === i ? " pending" : ""}" data-spot="${i}"><circle cx="${cx}" cy="${cy}" r="7.5"/>${x.p ? `<text x="${cx}" y="${cy + 2.6}" class="ini">${esc(initials(x.p.name))}</text><text x="${cx}" y="${cy + 17}" class="lbl">${esc(surname(x.p.name))}</text>` : `<text x="${cx}" y="${cy + 17}" class="lbl dim">${slotTag(x)}</text>`}</g>`; }).join("")}
  </svg>`;
}
function fly(from, i, p) {
  const g = document.querySelector(`[data-spot="${i}"]`), dot = g && g.querySelector("circle"), row = document.querySelector(`[data-slotrow="${i}"]`);
  const finish = () => { S && (S.justPicked = null); if (g) { g.classList.remove("pending"); g.classList.add("pop"); } if (row) row.classList.add("flash"); };
  if (!dot || !from) return finish();
  const to = dot.getBoundingClientRect();
  const chip = document.createElement("div");
  chip.className = "flyer"; chip.textContent = initials(p.name); chip.setAttribute("aria-hidden", "true");
  document.body.appendChild(chip);
  const sx = from.left + 12, sy = from.top + from.height / 2 - 22, ex = to.left + to.width / 2 - 22, ey = to.top + to.height / 2 - 22;
  const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 70;
  const anim = chip.animate([
    { transform: `translate(${sx}px,${sy}px) scale(1)` },
    { transform: `translate(${mx}px,${my}px) scale(1.15)`, offset: 0.45 },
    { transform: `translate(${ex}px,${ey}px) scale(.42)` },
  ], { duration: 720, easing: "cubic-bezier(.4,.1,.3,1)", fill: "forwards" });
  anim.onfinish = () => { chip.remove(); finish(); };
}

/* ---------------- runs ---------------- */
function newRun(o) {
  S = {
    fmt: o.fmt, mix: { ...o.mix }, seed: o.seed, friend: !!o.friend,
    slots: slotsFor(o.mix).map(s => ({ s, p: null })), used: [], rollNo: 0, rrNo: 0, rerolls: REROLLS, key: null, sel: null, sq: null, justPicked: null,
    plan: "balanced", screen: "draft", campaign: null, results: [], matches: [], idx: 0, alive: true, notes: [], open: null, view: store.get("campview", "over"),
  };
  M = null; render(); window.scrollTo(0, 0);
}
function doRoll(kind) {
  if (!kind) { S.rollNo++; S.key = roll(rng(hashSeed(`${S.seed}|roll|${S.rollNo}`)), DATA, S.fmt); }
  else { S.rrNo++; const r = rng(hashSeed(`${S.seed}|rr|${S.rollNo}|${S.rrNo}|${kind}`)); S.key = kind === "team" ? rerollTeam(r, DATA, S.fmt, S.key) : kind === "year" ? rerollYear(r, DATA, S.fmt, S.key) : (() => { let k = S.key; for (let i = 0; i < 20 && (k === S.key || teamOf(k) === teamOf(S.key)); i++) k = roll(r, DATA, S.fmt); return k; })(); }
  S.sel = null;
}
// Batting order: the two openers, then everyone else by batting rating (the keeper included).
function orderXI() {
  const ops = S.slots.filter(x => x.s === "OP"), rest = S.slots.filter(x => x.s !== "OP").sort((a, b) => b.p.bat - a.p.bat);
  S.slots = [...ops, ...rest];
}
const bowlerCount = () => S.slots.filter(x => x.p && x.p.bowl > 0).length;
function bowlHint() {
  const n = bowlerCount(), need = 5, left = 11 - filled();
  if (n >= need) return `<p class="note">Bowlers in your XI: <b>${n}</b>.</p>`;
  return `<p class="${left < need - n ? "warn" : "note"}">Bowlers in your XI: <b>${n}</b>. Most sides pick five${left < need - n ? `; with ${left} place${left === 1 ? "" : "s"} left, part-timers will have to bowl` : ""}.</p>`;
}
function placePlayer(p, slotType) {
  const i = S.slots.findIndex(x => !x.p && x.s === slotType);
  if (i < 0 || !fitsFor(p).includes(slotType)) return -1;
  S.slots[i].p = effective(p, slotType); S.used.push(p.ident); S.key = null; S.sel = null;
  if (R) send({ t: "progress", n: filled() });
  return i;
}

/* ---------------- render ---------------- */
function render() {
  const app = $("#app");
  if (!S || S.screen !== "draft") document.querySelectorAll(".flyer").forEach(e => e.remove());
  if (!S) app.innerHTML = homeView();
  else if (S.screen === "draft") app.innerHTML = draftView();
  else if (S.screen === "ready") app.innerHTML = readyView();
  else if (S.screen === "match") app.innerHTML = matchView();
  else if (S.screen === "h2h") app.innerHTML = h2hView();
  else app.innerHTML = campaignView();
  wire();
}

function mixView() {
  const prob = mixProblem(home.mix, home.fmt), warn = !prob && mixWarning(home.mix, home.fmt);
  const total = MIXKEYS.reduce((a, [k]) => a + home.mix[k], 0);
  const preset = Object.entries(PRESETS).find(([, p]) => MIXKEYS.every(([k]) => p.mix[k] === home.mix[k]));
  return `<fieldset class="mixbox" aria-label="Team make-up"><legend>Team make-up: the other eight <span class="mixcount${total === FLEX ? "" : " bad"}">${total}/${FLEX}</span></legend>
    <div class="fixed"><span class="tag">OPEN</span><span class="tag">OPEN</span><span class="tag">WK</span><span class="note">Two openers and a wicketkeeper are always in. Split the other eight however you like.</span></div>
    <div class="steppers">${MIXKEYS.map(([k, l, d]) => `<div class="step"><div><b>${l}</b><span>${d}</span></div>
      <div class="ctrl"><button class="sbtn" data-act="mix" data-k="${k}" data-d="-1" aria-label="One fewer ${l.toLowerCase()}" ${home.mix[k] <= MIX_LIMITS[k][0] ? "disabled" : ""}>−</button><output>${home.mix[k]}</output><button class="sbtn" data-act="mix" data-k="${k}" data-d="1" aria-label="One more ${l.toLowerCase()}" ${home.mix[k] >= MIX_LIMITS[k][1] || total >= FLEX ? "disabled" : ""}>+</button></div></div>`).join("")}</div>
    ${prob ? `<p class="warn bad">${esc(prob)}</p>` : warn ? `<p class="warn">${esc(warn)}</p>` : ""}
  </fieldset>`;
}

function roomPanel() {
  if (R) {
    const link = `${location.origin}${location.pathname}?room=${R.code}`;
    if (R.err) return `<div class="friend"><p class="warn bad" role="alert">${esc(R.err)}</p><button class="btn ghost" data-act="leave">Back</button></div>`;
    if (R.host) return `<div class="friend" aria-live="polite"><span class="eyebrow">Your room</span><div class="code">${esc(R.code)}</div>
      <p>${R.status === "waiting" ? "Send this link to your friend. The draft starts as soon as they join." : "Opening the room…"}</p>
      <div class="linkrow"><input id="roomlink" readonly value="${esc(link)}" aria-label="Room link"><button class="btn sm" data-act="copylink">Copy link</button></div>
      <p class="note">You both draft from the same rolls in ${esc(FORMATS[home.fmt].label)} with the team make-up above, then play each other.</p>
      <button class="linkbtn" data-act="leave">Cancel</button></div>`;
    return `<div class="friend" aria-live="polite"><p>Joining room <b>${esc(R.code)}</b>…</p><button class="linkbtn" data-act="leave">Cancel</button></div>`;
  }
  return `<div class="friend">
    <label class="field-l">Your name<input id="pname" maxlength="20" autocomplete="nickname" value="${esc(home.name)}" placeholder="Player"></label>
    <div class="fr-cols">
      <div class="fr"><h3>Create a room</h3><p class="note">You choose the format and team make-up. Your friend gets the same rolls.</p><button class="btn" data-act="create" ${mixProblem(home.mix, home.fmt) ? "disabled" : ""}>Create room</button></div>
      <div class="fr"><h3>Join a room</h3><label class="field-l">Room code<input id="jcode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(home.code)}" placeholder="ABCDE"></label><button class="btn ghost" data-act="join">Join</button></div>
    </div>
    ${home.err ? `<p class="warn bad" role="alert">${esc(home.err)}</p>` : ""}
    <p class="note">Rooms connect your two browsers directly. A few office or school networks block that.</p>
  </div>`;
}

function homeView() {
  const best = store.get("best", {}), f = FORMATS[home.fmt];
  const prob = mixProblem(home.mix, home.fmt);
  const invited = home.friend && home.code && !R;
  return `<section class="hero">
    <div class="board">
      <div class="board-top"><span>Target · ${esc(f.event)}</span><span class="lamp on"></span><span class="lamp"></span><span class="lamp"></span></div>
      <div class="big">${f.perfect}<span>–</span>0</div>
      <div class="board-foot">Win every match. Lose none.</div>
    </div>
    <div class="pitch-copy">
      <h1>CricDraft</h1>
      <p class="lede">Roll a real side from 1983 to today, see its whole squad with that season's numbers, and take one player. Repeat until you have eleven. Then captain them through a World Cup, a World Test Championship or an IPL season, or take on a friend.</p>
    </div>
  </section>
  ${invited ? `<p class="invite">You've been invited to room <b>${esc(home.code)}</b>. Enter your name and join below.</p>` : ""}
  <section class="setup">
    <fieldset class="seg four" aria-label="Format"><legend>Format</legend>
      ${Object.entries(FORMATS).map(([k, x]) => `<label class="opt${home.fmt === k ? " sel" : ""}"><input type="radio" name="fmt" value="${k}" ${home.fmt === k ? "checked" : ""}><b>${x.label}</b><span>${x.event}</span><em>Perfect run: ${x.perfect}–0</em>${best[k] != null ? `<small>Your best: ${best[k]} wins</small>` : ""}</label>`).join("")}
    </fieldset>
    <p class="note fmtdesc">${esc(f.desc)}</p>
    ${mixView()}
    <div class="startrow">
      <button class="btn big-btn" data-act="start" ${prob ? "disabled" : ""}>Play solo</button>
      <button class="btn big-btn ghost${home.friend ? " on" : ""}" data-act="friend" aria-expanded="${home.friend}">Play with a friend</button>
    </div>
    ${home.friend ? roomPanel() : ""}
    <details class="how"><summary>How it works</summary>
      <ul>
        <li>Each roll gives you a real side and year, such as <b>West Indies 1984</b>, <b>India 2011</b> or <b>Chennai Super Kings 2010</b>, with every player's numbers from that season. Pick one and put him in an open slot. Each player also has a batting and bowling rating (35–99) for that season.</li>
        <li>You get two rerolls: keep the year and change the team, keep the team and change the year, or roll a completely new side.</li>
        <li>In the IPL you can field at most four overseas players, as in the real league.</li>
        <li>Watch each match ball by ball or over by over and make five or six captain's calls: the toss, how your batters start and finish, your field, and a couple of moments in the game, like a review, a gamble on a big over or a bouncer barrage. In T20s you also pick who bowls the last four overs, and in Tests when to declare. Or skip straight to the result.</li>
        <li>Ratings come from every Test and ODI scorecard since 1983 and ball-by-ball records of T20 internationals and the IPL, adjusted for era. Upsets happen about as often as they do in real cricket: the engine was checked against 8,099 real results.</li>
      </ul></details>
    <p class="note credit">Data: Test and ODI scorecards 1983–2023 from the Kaggle datasets by Bhuvanesh Prasad (Apache 2.0); ball-by-ball data from <a href="https://cricsheet.org" target="_blank" rel="noopener">Cricsheet</a> (Open Data Commons Attribution licence); player roles from the cricketdata R package. CricDraft is a fan game and is not affiliated with the ICC, the BCCI, the IPL, any board or any franchise.</p>
  </section>`;
}

const ROLE_TAG = { bat: "BAT", wk: "WK", ar: "AR", spin: "SPIN", pace: "PACE" };
const slotTag = x => (x.s === "ANY" ? (x.p ? ROLE_TAG[groupOf(x.p)] : "ANY") : SLOT[x.s].short);
function slotRow(x, i) {
  const sl = { ...SLOT[x.s], short: slotTag(x), label: x.s === "ANY" ? "Any player" : SLOT[x.s].label };
  if (!x.p) return `<li class="slot empty" data-slotrow="${i}"><span class="no">${i + 1}</span><span class="tag">${sl.short}</span><span class="who">${sl.label}</span></li>`;
  const p = x.p;
  return `<li class="slot" data-slotrow="${i}"><span class="no">${i + 1}</span><span class="tag">${sl.short}</span><span class="who" title="${esc(p.full)}"><b>${esc(p.name)}${p.overseas && S.fmt === "ipl" ? ' <i class="os">OS</i>' : ""}</b><small>${esc(p.team)} ${p.year}</small></span><span class="rt"><i>BAT</i>${Math.round(p.bat)}</span><span class="rt"><i>BOWL</i>${p.bowl ? Math.round(p.bowl) : "–"}</span></li>`;
}
function roomStrip() {
  if (!R) return "";
  return `<div class="roomstrip" id="roomstrip">Room <b>${esc(R.code)}</b> · v <b>${esc(R.oppName)}</b> · ${R.lost ? '<span class="bad">disconnected</span>' : R.oppXI ? "XI locked in" : `drafting ${R.oppPicks}/11`}</div>`;
}
function playerRow(p) {
  const fits = fitsFor(p), used = S.used.includes(p.ident), sel = S.sel === p.ident;
  const why = used ? "In your XI" : !fits.length ? (isIPL() && p.overseas && overseasCount() >= MAX_OVERSEAS ? "Overseas limit reached" : "No open slot fits") : "";
  return `<li class="pl${used ? " used" : !fits.length ? " nofit" : ""}${sel ? " sel" : ""}">
    <button class="pl-main" data-act="sel" data-id="${esc(p.ident)}" ${why ? "disabled" : ""} aria-expanded="${sel}">
      <span class="nm"><b>${esc(p.name)}${isIPL() && p.overseas ? ' <i class="os">OS</i>' : ""}</b><small>${esc(roleLine(p))}${why ? ` · <em>${why}</em>` : ""}</small></span>${statCells(p)}
    </button>
    ${sel ? `<div class="put">${portrait(p)}<div class="put-acts"><span>Put him in as</span>${fits.map(s => `<button class="btn sm" data-act="pick" data-id="${esc(p.ident)}" data-slot="${s}">${SLOT[s].label}</button>`).join("")}<button class="linkbtn" data-act="sel" data-id="">Cancel</button></div></div>` : ""}
  </li>`;
}
function squadView() {
  const ps = sqCache(), cols = shortFmt() ? " short" : "";
  return GROUPS.map(([g, label]) => {
    const list = ps.filter(p => groupOf(p) === g);
    if (!list.length) return "";
    return `<section class="grp"><h3>${label} <small>${list.length}</small></h3><div class="ptable${cols}"><div class="phead" aria-hidden="true"><span>Player · season ${esc(S.key.slice(-4))}</span>${statHeads()}</div><ul>${list.map(playerRow).join("")}</ul></div></section>`;
  }).join("");
}
function draftView() {
  const f = FORMATS[S.fmt], done = filled() === 11, ipl = isIPL();
  const anyFit = S.key && sqCache().some(p => fitsFor(p).length);
  return `${topBar(`<button class="linkbtn" data-act="${R ? "leave" : "quit"}">← ${R ? "Leave room" : "Menu"}</button>`, esc(f.event), `${filled()}<small>/11</small>`)}
  ${roomStrip()}
  <div class="draft">
    <section class="xi" aria-label="Your XI"><h2>Your XI ${ipl ? `<small>Overseas ${overseasCount()}/${MAX_OVERSEAS}</small>` : ""}</h2>
      ${fieldSVG(S.slots)}
      <ol class="slots">${S.slots.map(slotRow).join("")}</ol></section>
    <section class="rollzone" aria-live="polite">
      ${done ? `<div class="done"><h2>Your XI is complete</h2><p class="note">Team strength <b>${strength(xiOf())}</b>. Most real sides rate between 70 and 85.</p>${bowlerCount() < 5 ? `<p class="warn">Only ${bowlerCount()} of your XI bowl, so part-timers will bowl the rest of the overs.</p>` : ""}<button class="btn big-btn" data-act="ready">Pick a game plan</button></div>`
      : !S.key ? `<div class="dice-wrap"><button class="dice" data-act="roll" aria-label="Roll for a team"><span id="die">${S.rollNo ? "⚄" : "⚀"}</span></button><p>Roll for a ${ipl ? "franchise" : "team"}. ${11 - filled()} to pick.${S.rerolls ? ` ${plural(S.rerolls, "reroll")} left.` : ""}</p></div>`
      : `<div class="rolled"><div class="rolled-head"><div><span class="eyebrow">You rolled</span><h2 id="rolled-name">${esc(S.key)}</h2></div>
          <div class="rerolls"><span class="note">Rerolls left: <b>${S.rerolls}</b></span><button class="btn sm ghost" data-act="rr-team" ${S.rerolls ? "" : "disabled"}>Same ${ipl ? "season, new franchise" : "year, new team"}</button><button class="btn sm ghost" data-act="rr-year" ${S.rerolls ? "" : "disabled"}>Same ${ipl ? "franchise, new season" : "team, new year"}</button><button class="btn sm ghost" data-act="rr-any" ${S.rerolls ? "" : "disabled"}>New ${ipl ? "franchise, new season" : "team, new year"}</button></div></div>
          <p class="note">Tap a player to see where he fits. Numbers are for that ${ipl ? "IPL season" : "calendar year"}.</p>
          ${anyFit ? "" : `<p class="warn">Nobody in this squad fits your open slots.</p><button class="btn" data-act="skip">Roll again</button>`}
          ${squadView()}
        </div>`}
    </section>
  </div>`;
}

function readyView() {
  const xi = xiOf();
  return `${topBar(`<button class="linkbtn" data-act="back-draft">← Back</button>`, esc(FORMATS[S.fmt].event), `${strength(xi)}<small> str</small>`)}
  ${roomStrip()}
  <section class="ready">
    <h2>Game plan</h2>
    <fieldset class="seg" aria-label="Game plan">
      ${[["attack", "Attacking", "More boundaries, more wickets lost."], ["balanced", "Balanced", "Play the situation."], ["defend", "Defensive", S.fmt === "test" ? "Bat time. Harder to lose, harder to win." : "Protect wickets, fewer boundaries."]].map(([k, l, d]) => `<label class="opt${S.plan === k ? " sel" : ""}"><input type="radio" name="plan" value="${k}" ${S.plan === k ? "checked" : ""}><b>${l}</b><span>${d}</span></label>`).join("")}
    </fieldset>
    <h2>Batting order</h2><p class="note">Openers, batters, keeper, all-rounders, then bowlers.</p><div class="ready-xi">${fieldSVG(S.slots)}<ol class="slots compact">${S.slots.map(slotRow).join("")}</ol></div>
    ${R ? `<button class="btn big-btn" data-act="lock">Lock in my XI</button>` : `<button class="btn big-btn" data-act="go">Start the ${FORMATS[S.fmt].event}</button>`}
  </section>`;
}

/* ---------------- campaign ---------------- */
function tally() {
  const c = k => S.results.filter(r => r === k).length;
  return { W: c("W"), L: c("L"), D: c("D") };
}
const finished = () => !S.alive || S.idx >= S.campaign.fixtures.length;
function verdict() {
  const f = FORMATS[S.fmt], { W, L, D } = tally();
  const rec = `${W}–${L}${D ? "–" + D : ""}`;
  const champion = S.alive && S.results.at(-1) === "W" && S.campaign.fixtures.at(-1).stage === "Final";
  if (champion && !L && !D) return { title: "Unbeaten", rec: `${W}–0`, sub: `A perfect ${f.event}. That's rare.`, perfect: true };
  if (champion) return { title: "Champions", rec, sub: `${W} won, ${L} lost${D ? `, ${D} drawn` : ""}. Not perfect, but the trophy is yours.` };
  const last = S.campaign.fixtures[S.idx - 1].stage;
  const title = last === "Final" ? "Runners-up" : /Qualifier|Eliminator|Semi/.test(last) ? "Knocked out" : S.fmt === "test" ? "Missed the final" : S.fmt === "ipl" ? "Missed the playoffs" : "Knocked out";
  return { title, rec, sub: `${S.notes.at(-1) || ""} ${W} won, ${L} lost${D ? `, ${D} drawn` : ""}.`.trim() };
}
const innScore = i => `${i.runs}${i.allOut ? "" : "/" + i.wk}${i.declared ? "d" : ""}`;
function scoreLine(inn) { return `<b>${esc(inn.team)}</b> ${innScore(inn)} <span class="ov">(${overs(inn.balls)} ov)</span>`; }
function cardHTML(inn) {
  return `<div class="inn"><div class="inn-head">${scoreLine(inn)}</div>
    <table class="sc-t"><thead><tr><th scope="col">Batter</th><th scope="col"><span class="vh">How out</span></th><th scope="col">R</th><th scope="col">B</th></tr></thead><tbody>
    ${inn.bat.map(c => `<tr><td>${esc(c.n)}</td><td class="how">${c.out ? esc(c.how) : "not out"}</td><td><b>${c.r}</b></td><td>${c.b}</td></tr>`).join("")}</tbody></table>
    <table class="sc-t"><thead><tr><th scope="col">Bowler</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th></tr></thead><tbody>
    ${inn.bowl.map(b => `<tr><td>${esc(b.n)}</td><td>${overs(b.balls)}</td><td>${b.m}</td><td>${b.r}</td><td><b>${b.w}</b></td></tr>`).join("")}</tbody></table></div>`;
}
function slimInn(i) {
  return { team: i.team, side: i.side, runs: i.runs, wk: i.wk, balls: i.balls, declared: i.declared, allOut: i.allOut,
    bat: i.bat.map(c => ({ n: c.p.name, r: c.r, b: c.b, out: !!c.out, how: c.out ? `${c.out.how}, ${c.out.bowler}` : "" })),
    bowl: i.bowl.map(s => ({ n: s.p.name, balls: s.balls, r: s.r, w: s.w, m: s.m })) };
}
const slimMatch = m => ({ winner: m.winner, text: m.text, inns: m.inns.map(i => (i.bat && i.bat[0] && i.bat[0].p ? slimInn(i) : i)) });
function lamps() {
  const fx = S.campaign.fixtures, f = FORMATS[S.fmt];
  const pad = isIPL() && !finished() ? Math.max(0, f.perfect - fx.length) : 0;
  return fx.map((x, i) => `<span class="lamp ${S.results[i] === "W" ? "on" : S.results[i] === "L" ? "red" : S.results[i] === "D" ? "dim" : ""}" title="${esc(x.stage)}"></span>`).join("") + '<span class="lamp ghost"></span>'.repeat(pad);
}
function campaignView() {
  const f = FORMATS[S.fmt], fx = S.campaign.fixtures;
  const { W, L, D } = tally();
  const over = finished(), v = over ? verdict() : null;
  let lastStage = null;
  const rows = fx.map((x, i) => {
    const head = x.stage !== lastStage ? `<li class="stage">${esc(x.stage)}${S.fmt === "test" && x.series != null ? ` · v ${esc(x.opp.team)} ${x.away ? "(away)" : "(home)"}` : ""}</li>` : ""; lastStage = x.stage;
    const res = S.results[i], m = S.matches[i];
    const locked = i > S.idx || (!S.alive && i >= S.idx);
    return head + `<li class="fx${res ? " r-" + res : ""}${i === S.idx && !over ? " next" : ""}${locked && !res ? " locked" : ""}">
      ${i === S.idx && !over ? `<button class="res playnow" data-act="play" aria-label="Play this match: ${esc(VIEWS[S.view][0].toLowerCase())}">▶</button>` : `<span class="res">${res || ""}</span>`}
      <span class="opp"><b>${esc(x.opp.name)}</b><small>${PITCHES[x.pitch].label}${S.fmt === "test" && x.test ? ` · ${["1st", "2nd"][x.test - 1]} Test` : ""} · str ${x.opp.str}</small></span>
      <span class="txt">${m ? esc(m.text.replace(SOLO, "You")) : ""}</span>
      ${m ? `<button class="linkbtn" data-act="card" data-i="${i}" aria-expanded="${S.open === i}">Scorecard</button>` : ""}
      ${m && S.open === i ? `<div class="sc">${m.inns.map(cardHTML).join("")}</div>` : ""}
    </li>`;
  }).join("");
  const nx = fx[S.idx];
  return `${topBar(`<button class="linkbtn" data-act="quit">← Menu</button>`, esc(f.event), `${W}<small>–${L}${D ? "–" + D : ""}</small>`)}
  <section class="camp">
    <div class="board wide">
      <div class="lights">${lamps()}</div>
      ${over ? `<div class="verdict"><div class="vtitle">${esc(v.title)}</div><div class="big">${esc(v.rec)}</div><p>${esc(v.sub)}</p></div>`
      : `<div class="verdict"><div class="big">${W}<span>–</span>${L}${D ? `<span>–</span>${D}` : ""}</div><p>Next: <b>${esc(nx.stage)}</b> v ${esc(nx.opp.name)} · ${PITCHES[nx.pitch].label}</p></div>`}
      ${over ? `<div class="ctl"><button class="btn" data-act="share">Copy result</button><button class="btn ghost" data-act="again">Play again</button></div>
        <textarea id="share-text" class="share" rows="4" readonly aria-label="Result to share">${esc(shareText())}</textarea>`
      : `<div class="watch"><span class="eyebrow">How to watch</span>
        <div class="segbtns big" role="group" aria-label="How to watch">${Object.entries(VIEWS).map(([k, [l, d]]) => `<button class="sb${k === S.view ? " on" : ""}" data-act="setview" data-v="${k}" aria-pressed="${k === S.view}" title="${esc(d)}">${l}</button>`).join("")}</div>
        <p class="note">${esc(VIEWS[S.view][1])}.</p>
        <div class="ctl"><button class="btn" data-act="play">▶ Play match ${S.idx + 1}</button><button class="linkbtn" data-act="playall">Sim the rest</button></div></div>`}
    </div>
    ${over ? awardsHTML() : ""}
    <ol class="fixtures">${rows}</ol>
    <details class="how"><summary>Your XI</summary><ol class="slots compact">${S.slots.map(slotRow).join("")}</ol></details>
  </section>`;
}
// Tournament awards from every scorecard in the campaign (your XI and the opponents you met).
function seriesStats() {
  const P = new Map();
  const get = (n, team) => { const k = team + "|" + n; if (!P.has(k)) P.set(k, { n, team, m: new Set(), r: 0, b: 0, outs: 0, inn: 0, hs: 0, hsNo: false, w: 0, rc: 0, bb: 0, best: [0, 0], f50: 0, h100: 0 }); return P.get(k); };
  S.matches.forEach((m, mi) => {
    if (!m) return;
    const teams = [...new Set(m.inns.map(i => i.team))];
    for (const inn of m.inns) {
      const bowlTeam = teams.find(t => t !== inn.team) || "";
      for (const c of inn.bat) { const p = get(c.n, inn.team); p.m.add(mi); p.r += c.r; p.b += c.b; p.inn++; if (c.out) p.outs++; if (c.r > p.hs || (c.r === p.hs && !c.out)) { p.hs = c.r; p.hsNo = !c.out; } if (c.r >= 100) p.h100++; else if (c.r >= 50) p.f50++; }
      for (const o of inn.bowl) { const p = get(o.n, bowlTeam); p.m.add(mi); p.w += o.w; p.rc += o.r; p.bb += o.balls; if (o.w > p.best[0] || (o.w === p.best[0] && o.r < p.best[1])) p.best = [o.w, o.r]; }
    }
  });
  const all = [...P.values()];
  const runs = [...all].sort((a, b) => b.r - a.r || a.b - b.b).slice(0, 3);
  const wkts = [...all].filter(p => p.w > 0).sort((a, b) => b.w - a.w || a.rc - b.rc).slice(0, 3);
  const score = p => p.r + 22 * p.w + 15 * p.h100 + 5 * p.f50 + (p.team === SOLO ? 8 * p.m.size : 0);
  const pots = [...all].sort((a, b) => score(b) - score(a))[0];
  return { runs, wkts, pots };
}
const teamLabel = t => (t === SOLO ? "Your XI" : t);
function awardsHTML() {
  const st = seriesStats(); if (!st.pots) return "";
  const ipl = S.fmt === "ipl";
  const avg = p => (p.outs ? (p.r / p.outs).toFixed(1) : p.r ? "–" : "0");
  const sr = p => (p.b ? (100 * p.r / p.b).toFixed(1) : "–");
  const bavg = p => (p.w ? (p.rc / p.w).toFixed(1) : "–");
  const row = (p, i, txt) => `<li${p.team === SOLO ? ' class="mine"' : ""}><span class="rk">${i + 1}</span><span class="who"><b>${esc(p.n)}</b><small>${esc(teamLabel(p.team))}</small></span><span class="fig">${txt}</span></li>`;
  const pp = st.pots;
  const potsLine = [pp.r ? `${pp.r} runs${pp.outs ? ` at ${avg(pp)}` : ""}` : "", pp.w ? `${pp.w} wickets${pp.w ? ` at ${bavg(pp)}` : ""}` : "", pp.h100 ? `${pp.h100} hundred${pp.h100 > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  return `<section class="awards" aria-label="Tournament awards"><h2>${ipl ? "Season awards" : "Tournament awards"}</h2>
    <div class="aw-grid">
      <div class="aw pots"><span class="eyebrow">Player of the ${ipl ? "season" : "series"}</span><div class="aw-name">${esc(pp.n)}</div><small>${esc(teamLabel(pp.team))} · ${pp.m.size} match${pp.m.size === 1 ? "" : "es"}</small><p>${esc(potsLine)}</p></div>
      <div class="aw"><span class="eyebrow">${ipl ? "Orange Cap · most runs" : "Most runs"}</span><ol>${st.runs.map((p, i) => row(p, i, `<b>${p.r}</b><small>avg ${avg(p)} · SR ${sr(p)} · HS ${p.hs}${p.hsNo ? "*" : ""}</small>`)).join("")}</ol></div>
      <div class="aw"><span class="eyebrow">${ipl ? "Purple Cap · most wickets" : "Most wickets"}</span><ol>${st.wkts.map((p, i) => row(p, i, `<b>${p.w}</b><small>avg ${bavg(p)} · best ${p.best[0]}/${p.best[1]}</small>`)).join("")}</ol></div>
    </div></section>`;
}
function shareText() {
  const f = FORMATS[S.fmt], v = verdict();
  const sq = S.campaign.fixtures.map((x, i) => S.results[i] === "W" ? "🟩" : S.results[i] === "L" ? "🟥" : S.results[i] === "D" ? "⬜" : "⬛").join("");
  return `CricDraft · ${f.event}\n${v.perfect ? `${v.rec} 🏆 Unbeaten` : `${v.title}, ${v.rec}`}\n${sq}${(() => { const st = seriesStats(); return st.pots ? `\nPlayer of the ${S.fmt === "ipl" ? "season" : "series"}: ${st.pots.n}${st.runs[0] ? ` · Most runs: ${st.runs[0].n} ${st.runs[0].r}` : ""}${st.wkts[0] ? ` · Most wickets: ${st.wkts[0].n} ${st.wkts[0].w}` : ""}` : ""; })()}\nXI: ${S.slots.map(x => x.p.name).join(", ")}\n${location.origin}${location.pathname}`;
}
function recordSolo(m) {
  S.matches[S.idx] = slimMatch(m);
  S.results[S.idx] = m.winner === 0 ? "W" : m.winner === 1 ? "L" : "D";
  const g = stageGate(rng(hashSeed(`${S.seed}|gate|${S.idx}`)), S.fmt, S.campaign, S.results, S.idx);
  if (g.note) S.notes.push(g.note);
  if (!g.through) S.alive = false;
  S.idx++;
  if (finished()) {
    const best = store.get("best", {}), W = S.results.filter(x => x === "W").length;
    best[S.fmt] = Math.max(best[S.fmt] || 0, W); store.set("best", best);
  }
}
const matchSeed = () => hashSeed(`${S.seed}|match|${S.idx}|${S.plan}`);
function simNext() {
  if (finished()) return;
  recordSolo(playFixture(rng(matchSeed()), S.fmt, xiOf(), SOLO, S.campaign.fixtures[S.idx], S.plan));
}
function watchSolo(view) {
  const fx = S.campaign.fixtures[S.idx];
  const A = { name: SOLO, xi: xiOf() }, B = { name: fx.opp.name, xi: fx.opp.xi };
  M = newMatch({ view, names: [A.name, B.name], me: 0, pitch: fx.pitch, fmt: S.fmt, title: `${fx.stage} v ${fx.opp.name}` });
  M.gen = matchGen(rng(matchSeed()), S.fmt, A, B, { pitch: fx.pitch, plans: [PLANS[S.plan], PLANS.balanced], human: [true, false], interactive: true });
  M.onEnd = recordSolo;
  S.screen = "match"; render(); window.scrollTo(0, 0); pump();
}

/* ---------------- match viewer ---------------- */
function newMatch(o) {
  return { ...o, speed: store.get("speed", 1), paused: false, feed: [], live: null, inns: [], crease: {}, fig: {}, bowler: null, chips: [], lastChips: [], notes: [],
    pending: null, waiting: null, auto: [false, false], ff: null, answer: undefined, timer: null, done: null, toss: "", rain: "", gen: null, remote: false, seq: 0 };
}
const chipOf = b => (b === "W" ? "W" : b === "wd" ? "wd" : b === "0" || b === 0 ? "•" : String(b));
const chipCls = b => (b === "W" ? "w" : b === "4" || b === "6" ? "b" : b === "wd" ? "x" : "");
const chipsHTML = list => `<span class="chips">${list.map(b => `<i class="c ${chipCls(String(b))}">${chipOf(String(b))}</i>`).join("")}</span>`;
function feedAdd(cls, html) { M.feed.unshift({ cls, html, k: ++M.seq }); if (M.feed.length > 160) M.feed.length = 160; }
function ballText(ev) {
  const who = `${esc(ev.bowler)} to ${esc(ev.batter)}`;
  if (ev.extra) return `${who}: wide`;
  if (ev.wicket) return `<b class="out">OUT${ev.review === "overturned" ? " on review" : ""}</b> ${esc(ev.batter)}, ${esc(ev.wicket)} off ${esc(ev.bowler)}, ${esc(ev.batterScore)}${ev.review === "lost" ? " · review lost" : ""}${ev.hattrick ? ` · <b class="ms">HAT-TRICK for ${esc(ev.bowler)}!</b>` : ""}`;
  if (ev.review === "saved") return `${who}: given out, but the review saves ${esc(ev.batter)}! <b class="ms">Not out</b>`;
  if (ev.review === "lost") return `${who}: lbw reviewed, still not out. Review lost`;
  const r = ev.runs;
  const t = r === 4 ? "<b>FOUR</b>" : r === 6 ? "<b>SIX</b>" : r === 0 ? "no run" : plural(r, "run");
  return `${who}: ${t}${ev.milestone ? ` · <b class="ms">${esc(ev.batter)} reaches ${ev.milestone}</b>` : ""}`;
}
function consume(ev) {
  if (ev.type === "toss") { M.toss = ev.text; feedAdd("event", esc(ev.text)); return; }
  if (ev.type === "rain") { M.rain = ev.text; feedAdd("event", esc(ev.text)); return; }
  if (ev.type === "ball") {
    if (!M.live || M.live.inn !== ev.inn) {
      M.crease = {}; M.fig = {}; M.chips = []; M.lastChips = []; M.notes = [];
      feedAdd("inn", `Innings ${ev.inn}: ${esc(M.names[ev.side])} batting`);
    }
    M.live = { ...ev.score, side: ev.side, inn: ev.inn };
    M.bowler = ev.bowler;
    if (!ev.extra) M.crease[ev.batter] = ev.batterScore;
    if (ev.wicket) { delete M.crease[ev.batter]; if (ev.newBatter) M.crease[ev.newBatter] = "0 (0)"; }
    M.chips.push(ev.extra ? "wd" : ev.wicket ? "W" : String(ev.runs));
    if (!M.ff && (ev.milestone || ev.hattrick)) M.cel = ev.hattrick ? { kind: "hat", who: ev.bowler, team: M.names[1 - ev.side] } : { kind: ev.milestone >= 100 ? "ton" : "fifty", n: ev.milestone, who: ev.batter, team: M.names[ev.side], score: ev.batterScore };
    if (M.view === "ball") feedAdd(ev.wicket ? "wkt" : ev.runs >= 4 ? "bdry" : "", `<span class="bn">${ev.over}.${ev.ball}</span> ${ballText(ev)}`);
    else if (ev.wicket || ev.milestone) M.notes.push(ev.wicket ? `<b class="out">OUT</b> ${esc(ev.batter)} ${esc(ev.batterScore)}` : `<b class="ms">${esc(ev.batter)} ${ev.milestone}</b>`);
    return;
  }
  if (ev.type === "over") {
    M.fig[ev.bowler] = ev.figures;
    M.crease = {};
    for (const s of ev.batters || []) { const m = /^(.*) (\d+ \(\d+\))$/.exec(s); if (m) M.crease[m[1]] = m[2]; }
    const sc = `${ev.score.runs}/${ev.score.wk}`;
    if (M.view === "ball") feedAdd("over", `End of over ${ev.over + 1}: <b>${sc}</b> · ${esc(ev.bowler)} ${esc(ev.figures)}`);
    else feedAdd(ev.wickets ? "wkt" : "", `<span class="bn">Ov ${ev.over + 1}</span> ${chipsHTML(ev.balls)} <b>${plural(ev.runs, "run")}</b>${ev.wickets ? `, ${plural(ev.wickets, "wicket")}` : ""} · ${sc} · ${esc(ev.bowler)} ${esc(ev.figures)}${M.notes.length ? `<span class="notes">${M.notes.join(" · ")}</span>` : ""}`);
    M.notes = []; M.lastChips = ev.balls.map(String); M.chips = [];
    return;
  }
  if (ev.type === "innings") {
    M.inns.push(ev.result); M.live = null; M.crease = {};
    feedAdd("inn", `<b>${esc(ev.text)}</b>`);
  }
}
function celebrate(c) {
  const big = c.kind === "hat" ? "Hat-trick" : c.kind === "fifty" ? "Fifty" : c.n === 100 ? "Hundred" : c.n === 200 ? "Double hundred" : String(c.n);
  const colors = c.kind === "hat" ? ["#e0533d", "#f4b63d", "#eef1e6"] : c.kind === "ton" ? ["#f4b63d", "#ffe08a", "#eef1e6", "#7fd1a8"] : ["#eef1e6", "#a9b9a8", "#f4b63d"];
  const n = reduced ? 0 : c.kind === "fifty" ? 28 : 70;
  const bits = Array.from({ length: n }, () => `<i class="cf" style="--x:${(Math.random() * 100).toFixed(1)}vw;--c:${colors[Math.floor(Math.random() * colors.length)]};--d:${(1.6 + Math.random() * 1.4).toFixed(2)}s;--dl:${(Math.random() * 0.5).toFixed(2)}s;--r:${Math.floor(Math.random() * 360)}deg"></i>`).join("");
  const el = document.createElement("div");
  el.className = `cele ${c.kind}`; el.setAttribute("role", "status");
  el.innerHTML = `${bits}<div class="cele-in">${c.kind === "hat" ? '<span class="hatballs" aria-hidden="true"><i>W</i><i>W</i><i>W</i></span>' : ""}<span class="cele-big">${esc(big)}</span><span class="cele-who">${esc(c.who)}</span><span class="cele-sub">${c.kind === "hat" ? "Three wickets in three balls" : esc(c.score)} · ${esc(c.team)}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function delayFor(ev) {
  if (M.ff) return 0;
  const t = M.view === "ball" ? { ball: 850, over: 450, innings: 2200, toss: 1500, rain: 1500 } : { ball: 0, over: 1000, innings: 2200, toss: 1500, rain: 1500 };
  return (t[ev.type] || 0) / M.speed;
}
const humanSide = s => (R ? true : s === 0);
function pump() {
  if (!M || !M.gen) return;
  clearTimeout(M.timer);
  if (M.done || M.pending || M.waiting || (M.paused && !M.ff)) return;
  let delay = 0, n = 0;
  for (;;) {
    const x = M.gen.next(M.answer); M.answer = undefined;
    if (x.done) return endMatch(x.value);
    let ev = x.value;
    if (ev.type === "decision") {
      if (M.ff || M.auto[ev.side] || !humanSide(ev.side) || (R && ev.side !== M.me && (R.lost || !R.conn))) { M.answer = ev.def; continue; }
      if (ev.side === M.me) { M.pending = ev; if (R) send({ t: "wait" }); updateMatch(true); return; }
      M.waiting = { name: M.names[ev.side], d: ev }; send({ t: "ask", d: ev }); updateMatch(); return;
    }
    if (ev.type === "innings") ev = { ...ev, result: slimInn(ev.result) };
    consume(ev);
    if (R && R.host) send({ t: "ev", ev });
    if (M.cel) { celebrate(M.cel); M.cel = null; delay = 2400; break; }
    if (ev.type === "innings" && M.ff === "innings") { M.ff = null; delay = 1200; break; }
    delay = delayFor(ev);
    if (delay > 0) break;
    if (++n > 4000) break; // let the page breathe during long skips
  }
  updateMatch();
  M.timer = setTimeout(pump, delay);
}
function endMatch(res) {
  clearTimeout(M.timer);
  M.done = slimMatch(res); M.pending = null; M.waiting = null; M.inns = M.done.inns; M.live = null;
  if (R) {
    R.tally[res.winner === 0 ? 0 : res.winner === 1 ? 1 : 2]++;
    if (R.host) send({ t: "end", res: M.done });
  }
  if (M.onEnd) M.onEnd(res);
  render();
}
function liveInfo() {
  const L = M.live; if (!L) return "";
  const maxB = (M.fmt === "odi" ? 50 : 20) * 6;
  if (M.fmt !== "test") {
    if (L.target != null) { const need = L.target - L.runs, left = maxB - L.balls; return need > 0 ? `Need ${need} from ${plural(left, "ball")} · required ${(need / Math.max(1, left) * 6).toFixed(2)} an over` : ""; }
    return `Run rate ${(L.runs / Math.max(1, L.balls) * 6).toFixed(2)}`;
  }
  if (L.target != null) return `Need ${Math.max(0, L.target - L.runs)} to win`;
  const tot = s => M.inns.filter(i => i.side === s).reduce((a, i) => a + i.runs, 0);
  if (!M.inns.length) return "";
  const lead = tot(L.side) + L.runs - tot(1 - L.side);
  return lead >= 0 ? `Lead by ${lead}` : `Trail by ${-lead}`;
}
function boardHTML() {
  const sideRow = s => {
    const parts = M.inns.filter(i => i.side === s).map(innScore);
    const live = M.live && M.live.side === s && !M.done;
    if (live) parts.push(`${M.live.runs}/${M.live.wk}`);
    return `<div class="trow${live ? " batting" : ""}${s === M.me ? " me" : ""}"><span class="tname">${esc(M.names[s])}${s === M.me ? ' <i class="you">you</i>' : ""}</span><span class="tscore">${parts.join(" &amp; ") || "–"}</span>${live ? `<span class="tov">${overs(M.live.balls)} ov</span>` : '<span class="tov"></span>'}</div>`;
  };
  if (M.done) {
    const won = M.done.winner === M.me, drawn = M.done.winner == null;
    return `<div class="trows">${sideRow(0)}${sideRow(1)}</div>
      <div class="verdict"><div class="vtitle ${won ? "" : drawn ? "d" : "l"}">${won ? "You won" : drawn ? "Match drawn" : "You lost"}</div><p>${esc(M.done.text.replace(SOLO, "You"))}</p></div>`;
  }
  const L = M.live, cr = Object.entries(M.crease).slice(0, 2);
  return `<div class="trows">${sideRow(0)}${sideRow(1)}</div>
    <div class="liveinfo">${esc(liveInfo())}</div>
    ${L ? `<div class="crease"><div>${cr.map(([n, s]) => `<span><b>${esc(n)}</b> ${esc(s)}</span>`).join("")}</div><div class="bowling">${esc(M.bowler || "")}${M.bowler && M.fig[M.bowler] ? ` <small>${esc(M.fig[M.bowler])}</small>` : ""}</div></div>
      <div class="thisover"><span class="eyebrow">${M.chips.length ? "This over" : "Last over"}</span>${chipsHTML(M.chips.length ? M.chips : M.lastChips)}</div>`
    : `<div class="liveinfo">${esc(M.toss || "")}</div>`}
    <div class="pitchline">${PITCHES[M.pitch].label}${M.rain ? ` · ${esc(M.rain)}` : ""}</div>`;
}
function decHTML() {
  if (M.done) return "";
  if (M.waiting) return `<div class="dec wait" role="status">${esc(M.waiting.name)} is making a captain's call…</div>`;
  if (M.remoteWait) return `<div class="dec wait" role="status">${esc(M.remoteWait)} is making a captain's call…</div>`;
  const d = M.pending; if (!d) return "";
  const st = d.state ? `<p class="note">${d.state.runs}/${d.state.wk} after ${overs(d.state.balls)} overs${d.state.target ? `, chasing ${d.state.target}` : ""}</p>` : "";
  return `<div class="dec${d.kind === "scenario" || d.kind === "review" ? " scen" : ""}" role="group" aria-labelledby="dec-q"><span class="eyebrow">${d.kind === "review" ? "Review?" : d.kind === "scenario" ? "Captain's dilemma" : "Your call"}</span><h3 id="dec-q">${esc(d.prompt)}</h3>${st}
    <div class="dopts${d.options.length > 4 ? " many" : ""}">${d.options.map(o => `<button class="dopt${o.id === d.def ? " def" : ""}" data-act="ans" data-v="${esc(o.id)}"><b>${esc(o.label)}</b><span>${esc(o.desc)}</span>${o.id === d.def ? "<em>Captain's pick</em>" : ""}</button>`).join("")}</div>
    <button class="linkbtn" data-act="autoall">Let the captain make every call for the rest of this match</button></div>`;
}
function ctlHTML() {
  if (M.done) return "";
  const views = `<div class="segbtns" role="group" aria-label="Updates">${["ball", "over"].map(v => `<button class="sb${M.view === v ? " on" : ""}" data-act="mview" data-v="${v}" aria-pressed="${M.view === v}">${VIEWS[v][0]}</button>`).join("")}</div>`;
  if (M.remote) return `${views}<span class="note">${esc(M.names[0])} controls the pace.</span>`;
  const blocked = !!M.waiting;
  return `${views}<div class="segbtns" role="group" aria-label="Speed">${SPEEDS.map(s => `<button class="sb${M.speed === s ? " on" : ""}" data-act="speed" data-v="${s}" aria-pressed="${M.speed === s}">${s}×</button>`).join("")}</div>
    <button class="btn sm ghost" data-act="pause">${M.paused ? "Resume" : "Pause"}</button>
    <button class="btn sm ghost" data-act="ffinn" ${blocked ? "disabled" : ""}>Skip innings</button>
    <button class="btn sm ghost" data-act="ffall" ${blocked ? "disabled" : ""}>Skip to result</button>`;
}
function feedHTML() { return M.feed.map(f => `<li class="${f.cls}">${f.html}</li>`).join(""); }
function doneHTML() {
  if (!M.done) return "";
  const cards = `<div class="sc">${M.done.inns.map(cardHTML).join("")}</div>`;
  let btns;
  if (!R) btns = `<button class="btn" data-act="tocamp">Back to the ${esc(FORMATS[S.fmt].event)}</button>`;
  else if (R.host) btns = `<button class="btn" data-act="rematch">Rematch</button><button class="btn ghost" data-act="redraft">New draft</button><button class="linkbtn" data-act="leave">Leave room</button>`;
  else btns = `<span class="note">Waiting for ${esc(R.oppName)} to choose a rematch or a new draft.</span><button class="linkbtn" data-act="leave">Leave room</button>`;
  const t = R ? `<p class="note">Series: ${esc(R.name)} ${R.tally[R.host ? 0 : 1]} – ${R.tally[R.host ? 1 : 0]} ${esc(R.oppName)}${R.tally[2] ? ` (${plural(R.tally[2], "draw")})` : ""}</p>` : "";
  return `<div class="ctl">${btns}</div>${t}${cards}`;
}
function matchView() {
  return `${topBar(`<span class="eyebrow">${esc(FORMATS[M.fmt].label)}</span>`, esc(M.title), "")}
  ${roomStrip()}
  <section class="mv">
    <div class="board mboard" id="m-board">${boardHTML()}</div>
    <div id="m-done">${doneHTML()}</div>
    <div id="m-dec" aria-live="polite">${decHTML()}</div>
    <div class="mctl" id="m-ctl">${ctlHTML()}</div>
    <ol class="feed" id="m-feed">${feedHTML()}</ol>
  </section>`;
}
function updateMatch(focusDec) {
  if (!S || S.screen !== "match" || !M) return;
  const set = (id, h) => { const el = document.getElementById(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
  set("m-board", boardHTML()); set("m-dec", decHTML()); set("m-ctl", ctlHTML()); set("m-feed", feedHTML());
  if (focusDec) requestAnimationFrame(() => { const b = document.querySelector("#m-dec .dopt.def") || document.querySelector("#m-dec .dopt"); if (b) { b.focus({ preventScroll: true }); b.closest(".dec").scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); } });
}
function answer(v) {
  if (!M || !M.pending) return;
  const d = M.pending; M.pending = null;
  if (M.remote) { send({ t: "answer", v }); updateMatch(); return; }
  M.answer = d.options.some(o => o.id === v) ? v : d.def;
  pump();
}

/* ---------------- friend rooms (PeerJS, browser to browser) ---------------- */
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = PEER_SRC; s.onload = ok; s.onerror = () => no(new Error("Couldn't load the connection library. Check your connection and try again.")); document.head.appendChild(s); });
}
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
function mkRoom(host, code) {
  return { host, code, name: cleanName(home.name, host ? "Player 1" : "Player 2"), oppName: host ? "Player 2" : "Player 1", status: "connecting", err: null, peer: null, conn: null,
    seed: null, fmt: home.fmt, mix: { ...home.mix }, oppPicks: 0, oppXI: null, oppPlan: "balanced", locked: false, tally: [0, 0, 0], game: 0, lost: false };
}
function send(m) { try { if (R && R.conn && R.conn.open) R.conn.send(m); } catch {} }
function peerErr(e) {
  const t = e && e.type;
  if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") return "Couldn't reach the room server. Check your connection and try again.";
  if (t === "browser-incompatible") return "This browser can't make direct connections. Try a recent Chrome, Firefox, Edge or Safari.";
  return "The connection failed. Try again, or create a new room.";
}
function roomFail(msg) { if (!R) return; R.err = msg; try { R.peer && R.peer.destroy(); } catch {} if (!S) render(); else { R.lost = true; refreshStrip(); } }
async function createRoom() {
  if (mixProblem(home.mix, home.fmt)) return;
  R = mkRoom(true, newCode()); render();
  try { await loadPeer(); } catch (e) { return roomFail(e.message); }
  openHost();
}
function openHost() {
  if (!R) return;
  const peer = (R.peer = new window.Peer(PEER_PREFIX + R.code.toLowerCase(), { debug: 0 }));
  peer.on("open", () => { if (!R) return; R.status = "waiting"; if (!S) render(); });
  peer.on("connection", conn => {
    if (!R || (R.conn && R.conn.open)) { conn.on("open", () => { try { conn.send({ t: "full" }); } catch {} setTimeout(() => conn.close(), 400); }); return; }
    attach(conn);
  });
  peer.on("error", e => { if (!R) return; if (e.type === "unavailable-id" && !R.conn) { peer.destroy(); R.code = newCode(); openHost(); render(); } else if (!R.conn) roomFail(peerErr(e)); });
  peer.on("disconnected", () => { try { if (R && !peer.destroyed) peer.reconnect(); } catch {} });
}
async function joinRoom(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) { home.err = "Enter the room code your friend sent you."; return render(); }
  home.err = "";
  R = mkRoom(false, code); render();
  try { await loadPeer(); } catch (e) { return roomFail(e.message); }
  if (!R) return;
  const peer = (R.peer = new window.Peer({ debug: 0 }));
  peer.on("open", () => { if (!R) return; attach(peer.connect(PEER_PREFIX + code.toLowerCase(), { reliable: true, serialization: "json" })); });
  peer.on("error", e => roomFail(e.type === "peer-unavailable" ? `There's no open room called ${code}. Check the code, or ask your friend for a new link.` : peerErr(e)));
  setTimeout(() => { if (R && !R.host && !S && !R.err && !(R.conn && R.conn.open)) roomFail(`Couldn't connect to room ${code}. Your network may block direct connections; try another network, or check the code.`); }, 20000);
}
function attach(conn) {
  R.conn = conn;
  conn.on("open", () => send({ t: "hi", name: R.name }));
  conn.on("data", m => { try { onMsg(m); } catch (e) { console.error(e); } });
  conn.on("close", () => {
    if (!R || R.conn !== conn) return;
    R.lost = true; R.conn = null;
    if (M && !M.done && M.waiting && !M.remote) { const d = M.waiting.d; M.waiting = null; M.auto[1 - M.me] = true; M.answer = d.def; pump(); }
    if (!S) { R.err = "Your friend left before the draft started."; render(); } else { refreshStrip(); if (S.screen === "h2h") render(); if (S.screen === "match") updateMatch(); }
  });
}
function refreshStrip() { const el = $("#roomstrip"); if (el) el.outerHTML = roomStrip(); }
function serialXI() { return S.slots.map(x => ({ k: `${x.p.team} ${x.p.year}`, id: x.p.ident, s: x.s })); }
function buildXI(list) {
  if (!Array.isArray(list) || list.length !== 11) return null;
  const xi = [];
  for (const it of list) {
    const k = String(it.k || ""), sq = DATA.squads[R.fmt][k] ? squad(DATA, R.fmt, k) : null;
    const p = sq && sq.find(q => q.ident === it.id);
    if (!p || !SLOT[it.s]) return null;
    xi.push(effective(p, it.s));
  }
  return xi;
}
function startFriendDraft() {
  R.status = "playing"; R.oppPicks = 0; R.oppXI = null; R.locked = false;
  try { history.replaceState(null, "", location.pathname); } catch {}
  newRun({ fmt: R.fmt, mix: R.mix, seed: R.seed, friend: true });
}
function onMsg(m) {
  if (!R || !m || typeof m !== "object") return;
  switch (m.t) {
    case "hi":
      R.oppName = cleanName(m.name, R.host ? "Player 2" : "Player 1");
      if (R.oppName === R.name) R.oppName += " (2)";
      if (R.host && !S) { R.seed = newSeed(); R.fmt = home.fmt; R.mix = { ...home.mix }; send({ t: "start", fmt: R.fmt, mix: R.mix, seed: R.seed, name: R.name }); startFriendDraft(); }
      return;
    case "start":
      if (R.host || !FORMATS[m.fmt] || !m.mix) return;
      R.oppName = cleanName(m.name, "Player 1"); if (R.oppName === R.name) R.name += " (2)";
      R.fmt = m.fmt; R.mix = { bat: +m.mix.bat || 0, ar: +m.mix.ar || 0, spin: +m.mix.spin || 0, pace: +m.mix.pace || 0 }; R.seed = String(m.seed);
      if (mixProblem(R.mix, R.fmt)) return roomFail("The room's settings didn't make sense. Ask your friend to create a new room.");
      return startFriendDraft();
    case "progress": R.oppPicks = Math.max(0, Math.min(11, +m.n || 0)); return refreshStrip();
    case "xi": {
      const xi = buildXI(m.xi); if (!xi) return;
      R.oppXI = xi; R.oppPlan = PLANS[m.plan] ? m.plan : "balanced"; R.oppPicks = 11;
      refreshStrip(); if (S && S.screen === "h2h") render();
      return;
    }
    case "go":
      if (R.host || !R.oppXI || !S) return;
      R.game = +m.game || R.game + 1;
      M = newMatch({ view: m.view === "ball" ? "ball" : "over", names: [R.oppName, R.name], me: 1, pitch: PITCHES[m.pitch] ? m.pitch : "balanced", fmt: R.fmt, title: `Game ${R.game} · ${R.oppName} v ${R.name}` });
      M.remote = true;
      S.screen = "match"; render(); window.scrollTo(0, 0);
      return;
    case "ev": if (M && M.remote && !M.done && m.ev) { M.remoteWait = null; consume(m.ev); updateMatch(); if (M.cel) { celebrate(M.cel); M.cel = null; } } return;
    case "ask": if (M && M.remote && !M.done && m.d && Array.isArray(m.d.options)) { M.remoteWait = null; M.pending = m.d; updateMatch(true); } return;
    case "wait": if (M && M.remote && !M.done) { M.remoteWait = R.oppName; updateMatch(); } return;
    case "end":
      if (M && M.remote && !M.done && m.res && Array.isArray(m.res.inns)) {
        M.done = m.res; M.pending = null; M.remoteWait = null; M.inns = m.res.inns; M.live = null;
        R.tally[m.res.winner === 0 ? 0 : m.res.winner === 1 ? 1 : 2]++; render();
      }
      return;
    case "answer": if (R.host && M && M.waiting) { const d = M.waiting.d; M.waiting = null; M.answer = d.options.some(o => o.id === m.v) ? m.v : d.def; pump(); } return;
    case "autoall": if (R.host && M) { M.auto[1] = true; } return;
    case "h2h": if (!R.host && S) { M = null; S.screen = "h2h"; render(); } return;
    case "again": if (!R.host) { R.seed = String(m.seed); M = null; startFriendDraft(); } return;
    case "full": return roomFail("That room already has two players.");
    case "bye": R.lost = true; if (R.conn) try { R.conn.close(); } catch {} return;
  }
}
function leaveRoom() {
  if (R) { send({ t: "bye" }); const p = R.peer; setTimeout(() => { try { p && p.destroy(); } catch {} }, 200); }
  if (M) clearTimeout(M.timer);
  R = null; S = null; M = null; home.friend = false;
  try { history.replaceState(null, "", location.pathname); } catch {}
  render(); window.scrollTo(0, 0);
}
function h2hView() {
  const mine = xiOf(), both = R.locked && R.oppXI;
  const list = (xi, plan) => `<ol class="slots compact">${xi.map((p, i) => `<li class="slot"><span class="no">${i + 1}</span><span class="tag">${S.slots[i] ? slotTag(S.slots[i]) : ""}</span><span class="who"><b>${esc(p.name)}</b><small>${esc(p.team)} ${p.year}</small></span><span class="rt"><i>BAT</i>${Math.round(p.bat)}</span><span class="rt"><i>BOWL</i>${p.bowl ? Math.round(p.bowl) : "–"}</span></li>`).join("")}</ol><p class="note">Plan: ${esc(PLANS[plan].label)}</p>`;
  const oppList = xi => `<ol class="slots compact">${xi.map((p, i) => `<li class="slot"><span class="no">${i + 1}</span><span class="tag"></span><span class="who"><b>${esc(p.name)}</b><small>${esc(p.team)} ${p.year}</small></span><span class="rt"><i>BAT</i>${Math.round(p.bat)}</span><span class="rt"><i>BOWL</i>${p.bowl ? Math.round(p.bowl) : "–"}</span></li>`).join("")}</ol><p class="note">Plan: ${esc(PLANS[R.oppPlan].label)}</p>`;
  const me = R.host ? 0 : 1;
  return `${topBar(`<button class="linkbtn" data-act="leave">← Leave room</button>`, `Room ${esc(R.code)} · ${esc(FORMATS[R.fmt].label)}`, `${R.tally[me]}<small>–${R.tally[1 - me]}</small>`)}
  ${roomStrip()}
  <section class="h2h">
    <div class="vs">
      <div class="team-card"><h2>${esc(R.name)} <small>str ${strength(mine)}</small></h2>${list(mine, S.plan)}</div>
      <div class="vs-mid" aria-hidden="true">v</div>
      <div class="team-card">${both ? `<h2>${esc(R.oppName)} <small>str ${strength(R.oppXI)}</small></h2>${oppList(R.oppXI)}` : `<h2>${esc(R.oppName)}</h2><p class="note">${R.lost ? "Disconnected." : R.oppXI ? "Locked in. Their XI shows once you lock in yours." : `Still drafting: ${R.oppPicks}/11.`}</p>`}</div>
    </div>
    <div class="board wide">
      ${R.lost ? `<p class="warn bad">${esc(R.oppName)} has left the room.</p><div class="ctl"><button class="btn" data-act="leave">Back to the menu</button></div>`
      : !both ? `<p>Waiting for ${esc(R.oppName)} to finish their XI.</p>`
      : R.host ? `<span class="eyebrow">Start the match</span><div class="ctl">${Object.entries(VIEWS).map(([k, [l, d]]) => `<button class="btn${k === "over" ? "" : " ghost"}" data-act="h2hgo" data-v="${k}" title="${esc(d)}">${l}</button>`).join("")}</div><p class="note">You both make your own captain's calls as the match goes on. You control the pace.</p>`
      : `<p>Waiting for ${esc(R.oppName)} to start the match. You'll make your own captain's calls.</p>`}
    </div>
  </section>`;
}
function hostStart(view) {
  if (!R || !R.host || !R.oppXI) return;
  R.game++;
  const r = rng(hashSeed(`${R.seed}|h2h|${R.game}`));
  const pitch = HOME_PITCH.neutral[Math.floor(r() * HOME_PITCH.neutral.length)];
  const A = { name: R.name, xi: xiOf() }, B = { name: R.oppName, xi: R.oppXI };
  send({ t: "go", view, game: R.game, pitch });
  M = newMatch({ view: view === "result" ? "over" : view, names: [A.name, B.name], me: 0, pitch, fmt: R.fmt, title: `Game ${R.game} · ${A.name} v ${B.name}` });
  const o = { pitch, plans: [PLANS[S.plan], PLANS[R.oppPlan]], human: [true, true], interactive: view !== "result" };
  M.gen = matchGen(r, R.fmt, A, B, o);
  S.screen = "match"; render(); window.scrollTo(0, 0);
  if (view === "result") M.ff = "match";
  pump();
}

/* ---------------- events ---------------- */
function wire() {
  document.querySelectorAll('input[name="fmt"]').forEach(i => (i.onchange = () => { home.fmt = i.value; store.set("fmt", i.value); render(); }));
  document.querySelectorAll('input[name="plan"]').forEach(i => (i.onchange = () => { S.plan = i.value; render(); }));
  const pn = $("#pname"); if (pn) pn.oninput = () => { home.name = pn.value; store.set("name", pn.value); };
  const jc = $("#jcode"); if (jc) { jc.oninput = () => { home.code = jc.value.toUpperCase(); }; jc.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); joinRoom(jc.value); } }; }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "start") return newRun({ fmt: home.fmt, mix: home.mix, seed: newSeed() });
  if (a === "friend") { home.friend = !home.friend; return render(); }
  if (a === "create") return createRoom();
  if (a === "join") return joinRoom(($("#jcode") || {}).value || home.code);
  if (a === "copylink") { const i = $("#roomlink"); const ok = () => (b.textContent = "Copied"); try { navigator.clipboard.writeText(i.value).then(ok, () => { i.select(); }); } catch { i.select(); } return; }
  if (a === "leave") return leaveRoom();
  if (a === "preset") { home.mix = { ...PRESETS[b.dataset.k].mix }; store.set("mix", home.mix); return render(); }
  if (a === "mix") { const k = b.dataset.k; home.mix[k] = Math.max(MIX_LIMITS[k][0], Math.min(MIX_LIMITS[k][1], home.mix[k] + +b.dataset.d)); store.set("mix", home.mix); return render(); }
  if (a === "quit") { if (M) clearTimeout(M.timer); S = null; M = null; render(); return window.scrollTo(0, 0); }
  if (a === "roll" || a === "skip") {
    const die = $("#die"), faces = "⚀⚁⚂⚃⚄⚅"; let n = 0;
    if (a === "roll" && die && !reduced) { b.disabled = true; const t = setInterval(() => { die.textContent = faces[n++ % 6]; if (n > 7) { clearInterval(t); doRoll(); render(); } }, 60); return; }
    doRoll(); return render();
  }
  if (a === "rr-team" || a === "rr-year" || a === "rr-any") { if (S.rerolls > 0) { S.rerolls--; doRoll(a.slice(3)); render(); } return; }
  if (a === "sel") { S.sel = S.sel === b.dataset.id ? null : b.dataset.id || null; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  if (a === "pick") {
    const p = sqCache().find(q => q.ident === b.dataset.id); if (!p) return;
    const row = b.closest(".pl"), from = row ? row.getBoundingClientRect() : null;
    const i = placePlayer(p, b.dataset.slot); if (i < 0) return;
    S.justPicked = reduced ? null : i; render();
    if (!reduced) fly(from, i, p); else S.justPicked = null;
    return;
  }
  if (a === "ready") { S.screen = "ready"; render(); return window.scrollTo(0, 0); }
  if (a === "back-draft") { S.screen = "draft"; return render(); }
  if (a === "go") { S.campaign = buildCampaign(rng(hashSeed(S.seed + "|campaign")), DATA, S.fmt); S.screen = "camp"; render(); return window.scrollTo(0, 0); }
  if (a === "lock") { R.locked = true; send({ t: "xi", xi: serialXI(), plan: S.plan }); S.screen = "h2h"; render(); return window.scrollTo(0, 0); }
  if (a === "setview") { S.view = VIEWS[b.dataset.v] ? b.dataset.v : "over"; store.set("campview", S.view); return render(); }
  if (a === "play") {
    if (finished()) return;
    if (S.view === "result") { simNext(); S.open = S.idx - 1; return render(); }
    return watchSolo(S.view);
  }
  if (a === "playall") { while (!finished()) simNext(); S.open = null; return render(); }
  if (a === "card") { const i = +b.dataset.i; S.open = S.open === i ? null : i; return render(); }
  if (a === "again") return newRun({ fmt: S.fmt, mix: S.mix, seed: newSeed() });
  if (a === "share") {
    const t = shareText(), ta = $("#share-text");
    const ok = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy result"), 1600); };
    try { navigator.clipboard.writeText(t).then(ok, () => { ta.select(); b.textContent = "Selected: press Ctrl+C"; }); } catch { ta.select(); }
    return;
  }
  // match viewer
  if (a === "ans") return answer(b.dataset.v);
  if (a === "autoall") { if (!M || !M.pending) return; const d = M.pending; if (M.remote) { send({ t: "autoall" }); } else M.auto[M.me] = true; return answer(d.def); }
  if (a === "mview") { M.view = b.dataset.v; store.set("view", M.view); if (S) S.view = M.view; return updateMatch(); }
  if (a === "speed") { M.speed = +b.dataset.v; store.set("speed", M.speed); updateMatch(); return pump(); }
  if (a === "pause") { M.paused = !M.paused; updateMatch(); return pump(); }
  if (a === "ffinn" || a === "ffall") {
    M.ff = a === "ffinn" ? "innings" : "match";
    if (M.pending && !M.remote) { M.answer = M.pending.def; M.pending = null; }
    return pump();
  }
  if (a === "tocamp") { M = null; S.screen = "camp"; S.open = S.idx - 1; render(); return window.scrollTo(0, 0); }
  if (a === "rematch") { M = null; send({ t: "h2h" }); S.screen = "h2h"; render(); return window.scrollTo(0, 0); }
  if (a === "redraft") { R.seed = newSeed(); send({ t: "again", seed: R.seed }); M = null; return startFriendDraft(); }
  if (a === "h2hgo") return hostStart(b.dataset.v);
});

render();
if (home.friend && home.code && !R) { const i = $("#pname"); if (i) i.focus(); }
