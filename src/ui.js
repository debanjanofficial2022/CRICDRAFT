// CricDraft — screens. Bundled with engine.js and game.js into one page by build.mjs.
const DATA = window.CRICDRAFT_DATA;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("cricdraft-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cricdraft-" + k, JSON.stringify(v)); } catch {} },
};
const today = () => new Date().toISOString().slice(0, 10);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MIXKEYS = [["bat", "Batters", "Middle order, besides the two openers"], ["ar", "All-rounders", "Bat and bowl"], ["spin", "Spinners", "Finger and wrist spin"], ["pace", "Pace bowlers", "Fast and medium"]];

let S = null; // current run
const home = { fmt: store.get("fmt", "odi"), mode: "daily", mix: store.get("mix", { ...PRESETS.balanced.mix }) };

const styleLine = p => !p.bowl || p.style === "none" ? (p.keeper ? "Wicketkeeper" : "Batter") : `${p.arm === "L" ? "Left" : "Right"}-arm ${p.style}`;
const handLine = p => `${p.hand === "L" ? "Left" : "Right"}-hand bat`;
const myName = "Your XI";
const isIPL = () => S && S.fmt === "ipl";
const overseasCount = () => S.slots.filter(x => x.p && x.p.overseas).length;

function newRun() {
  const mixKey = MIXKEYS.map(([k]) => home.mix[k]).join("");
  const seedBase = home.mode === "daily" ? `${today()}|${home.fmt}|${mixKey}` : `${Date.now()}|${Math.random()}`;
  S = {
    fmt: home.fmt, mode: home.mode, mix: { ...home.mix }, day: today(),
    seedBase, drawR: rng(hashSeed(seedBase + "|draw")),
    slots: slotsFor(home.mix).map(s => ({ s, p: null })),
    used: [], key: null, hand: [], rerolls: 3, rolls: 0, pending: null,
    plan: "balanced", screen: "draft", campaign: null, results: [], matches: [], idx: 0, alive: true, notes: [], open: null,
  };
  render(); window.scrollTo(0, 0);
}

/* ---------------- screens ---------------- */
function render() {
  const app = $("#app");
  if (!S) app.innerHTML = homeView();
  else if (S.screen === "draft") app.innerHTML = draftView();
  else if (S.screen === "ready") app.innerHTML = readyView();
  else app.innerHTML = campaignView();
  wire();
}

function mixView() {
  const prob = mixProblem(home.mix, home.fmt), warn = !prob && mixWarning(home.mix, home.fmt);
  const total = MIXKEYS.reduce((a, [k]) => a + home.mix[k], 0);
  const preset = Object.entries(PRESETS).find(([, p]) => MIXKEYS.every(([k]) => p.mix[k] === home.mix[k]));
  return `<fieldset class="mixbox" aria-label="Team mix"><legend>Team mix <span class="mixcount${total === FLEX ? "" : " bad"}">${total}/${FLEX}</span></legend>
    <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="chip-btn${preset && preset[0] === k ? " sel" : ""}" data-act="preset" data-k="${k}">${p.label}</button>`).join("")}</div>
    <div class="fixed"><span class="tag">OPEN</span><span class="tag">OPEN</span><span class="tag">WK</span><span class="note">Two openers and a wicketkeeper are always in.</span></div>
    <div class="steppers">${MIXKEYS.map(([k, l, d]) => `<div class="step"><div><b>${l}</b><span>${d}</span></div>
      <div class="ctrl"><button class="sbtn" data-act="mix" data-k="${k}" data-d="-1" aria-label="One fewer ${l.toLowerCase()}" ${home.mix[k] <= MIX_LIMITS[k][0] ? "disabled" : ""}>−</button><output id="mix-${k}">${home.mix[k]}</output><button class="sbtn" data-act="mix" data-k="${k}" data-d="1" aria-label="One more ${l.toLowerCase()}" ${home.mix[k] >= MIX_LIMITS[k][1] ? "disabled" : ""}>+</button></div></div>`).join("")}</div>
    ${prob ? `<p class="warn bad">${esc(prob)}</p>` : warn ? `<p class="warn">${esc(warn)}</p>` : ""}
  </fieldset>`;
}

function homeView() {
  const best = store.get("best", {}), f = FORMATS[home.fmt];
  const prob = mixProblem(home.mix, home.fmt);
  return `<section class="hero">
    <div class="board">
      <div class="board-top"><span>Target · ${esc(f.event)}</span><span class="lamp on"></span><span class="lamp"></span><span class="lamp"></span></div>
      <div class="big">${f.perfect}<span>–</span>0</div>
      <div class="board-foot">Win every match. Lose none.</div>
    </div>
    <div class="pitch-copy">
      <h1>CricDraft</h1>
      <p class="lede">Roll a real side from 1983 to today, take one player from it, and repeat until you have eleven. Then take your XI through a World Cup, a World Test Championship or a full IPL season and try to finish without a single defeat.</p>
    </div>
  </section>
  <section class="setup">
    <fieldset class="seg four" aria-label="Format"><legend>Format</legend>
      ${Object.entries(FORMATS).map(([k, x]) => `<label class="opt${home.fmt === k ? " sel" : ""}"><input type="radio" name="fmt" id="fmt-${k}" value="${k}" ${home.fmt === k ? "checked" : ""}><b>${x.label}</b><span>${x.event}</span><em>Perfect run: ${x.perfect}–0</em>${best[k] != null ? `<small>Your best: ${best[k]} wins</small>` : ""}</label>`).join("")}
    </fieldset>
    <p class="note fmtdesc">${esc(f.desc)}</p>
    ${mixView()}
    <fieldset class="seg two" aria-label="Mode"><legend>Mode</legend>
      <label class="opt${home.mode === "daily" ? " sel" : ""}"><input type="radio" name="mode" id="mode-daily" value="daily" ${home.mode === "daily" ? "checked" : ""}><b>Daily</b><span>Everyone with the same format and team mix gets the same rolls and fixtures today.</span></label>
      <label class="opt${home.mode === "free" ? " sel" : ""}"><input type="radio" name="mode" id="mode-free" value="free" ${home.mode === "free" ? "checked" : ""}><b>Free play</b><span>New rolls every time.</span></label>
    </fieldset>
    <button class="btn big-btn" id="start" data-act="start" ${prob ? "disabled" : ""}>Start drafting</button>
    <details class="how"><summary>How it works</summary>
      <ul>
        <li>Each roll gives you a real side and year, such as <b>West Indies 1984</b>, <b>India 2011</b> or <b>Chennai Super Kings 2010</b>, and five of its players. Pick one and put him in an open slot.</li>
        <li>You get three rerolls: keep the year and change the team, or keep the team and change the year.</li>
        <li>In the IPL you can field at most four overseas players, as in the real league.</li>
        <li>Ratings come from every Test and ODI scorecard since 1983 and ball-by-ball records of T20 internationals and the IPL. Each player is rated over a five-year window around that season and adjusted for how easy runs were in that era, so a 1985 opener and a 2023 opener are compared fairly.</li>
        <li>Matches are simulated ball by ball. Pitches change by venue: green seamers help pace, turning tracks help spin.</li>
      </ul></details>
    <p class="note credit">Data: Test and ODI scorecards 1983–2023 from the Kaggle datasets by Bhuvanesh Prasad (Apache 2.0); ball-by-ball data from <a href="https://cricsheet.org" target="_blank" rel="noopener">Cricsheet</a> (Open Data Commons Attribution licence); player roles from the cricketdata R package. CricDraft is a fan game and is not affiliated with the ICC, the BCCI, the IPL, any board or any franchise.</p>
  </section>`;
}

const filled = () => S.slots.filter(x => x.p).length;
function slotRow(x, i) {
  const sl = SLOT[x.s];
  if (!x.p) return `<li class="slot empty"><span class="no">${i + 1}</span><span class="tag">${sl.short}</span><span class="who">${sl.label}</span></li>`;
  const p = x.p;
  return `<li class="slot"><span class="no">${i + 1}</span><span class="tag">${sl.short}</span><span class="who" title="${esc(p.full)}"><b>${esc(p.name)}${p.overseas && isIPL() ? ' <i class="os">OS</i>' : ""}</b><small>${esc(p.team)} ${p.year}</small></span><span class="rt"><i>BAT</i>${p.bat}</span><span class="rt"><i>BOWL</i>${p.bowl || "–"}</span></li>`;
}
function cardView(p, j) {
  const open = S.slots.filter(x => !x.p).map(x => x.s);
  const blocked = isIPL() && p.overseas && overseasCount() >= MAX_OVERSEAS;
  const fits = blocked ? [] : [...new Set(open.filter(s => SLOT[s].ok(p)))];
  return `<article class="card${fits.length ? "" : " nofit"}">
    <header><b title="${esc(p.full)}">${esc(p.name)}</b><span>${esc(styleLine(p))} · ${esc(handLine(p))}</span></header>
    <div class="meters"><div><i>BAT</i><strong>${p.bat}</strong><span class="bar"><span style="width:${p.bat}%"></span></span></div><div><i>BOWL</i><strong>${p.bowl || "–"}</strong><span class="bar"><span style="width:${p.bowl}%"></span></span></div></div>
    <div class="badges">${p.keeper ? '<span class="chip">Keeper</span>' : ""}${p.opener ? '<span class="chip">Opener</span>' : ""}${p.bowl && p.bat >= 50 ? '<span class="chip">All-rounder</span>' : ""}${isIPL() && p.overseas ? '<span class="chip os">Overseas</span>' : ""}</div>
    ${fits.length ? `<div class="fit">${fits.map(s => `<button class="btn sm" data-act="pick" data-j="${j}" data-slot="${s}">${SLOT[s].label}</button>`).join("")}</div>` : `<p class="note">${blocked ? "You already have four overseas players." : "No open slot fits him."}</p>`}
  </article>`;
}
function draftView() {
  const f = FORMATS[S.fmt];
  const done = filled() === 11;
  const ipl = isIPL();
  return `<div class="bar-top"><button class="linkbtn" data-act="quit">← Menu</button><span>${f.event} · ${S.mode === "daily" ? "Daily " + S.day : "Free play"}</span><span class="count">${filled()}<small>/11</small></span></div>
  <div class="draft">
    <section class="xi" aria-label="Your XI"><h2>Your XI ${ipl ? `<small>Overseas ${overseasCount()}/${MAX_OVERSEAS}</small>` : ""}</h2><ol class="slots">${S.slots.map(slotRow).join("")}</ol></section>
    <section class="rollzone" aria-live="polite">
      ${done ? `<div class="done"><h2>Your XI is complete</h2><p class="note">Team strength <b>${strength(S.slots.map(x => x.p))}</b>. Most real sides rate between 70 and 85.</p><button class="btn big-btn" data-act="ready">Pick a game plan</button></div>`
      : !S.key ? `<div class="dice-wrap"><button class="dice" data-act="roll" aria-label="Roll for a team"><span id="die">${S.rolls ? "⚄" : "⚀"}</span></button><p>Roll for a ${ipl ? "franchise" : "team"}. Pick ${11 - filled()} more.</p></div>`
      : `<div class="rolled"><div class="rolled-head"><div><span class="eyebrow">You rolled</span><h2 id="rolled-name">${esc(S.key)}</h2></div>
          <div class="rerolls"><span class="note">Rerolls left: <b>${S.rerolls}</b></span><button class="btn sm ghost" data-act="rr-team" ${S.rerolls ? "" : "disabled"}>Same ${ipl ? "season, new franchise" : "year, new team"}</button><button class="btn sm ghost" data-act="rr-year" ${S.rerolls ? "" : "disabled"}>Same ${ipl ? "franchise, new season" : "team, new year"}</button></div></div>
          <div class="cards">${S.hand.map(cardView).join("")}</div>
          ${S.hand.some(p => !(isIPL() && p.overseas && overseasCount() >= MAX_OVERSEAS) && S.slots.some(x => !x.p && SLOT[x.s].ok(p))) ? "" : `<p class="note">Nobody here fits your open slots.${S.rerolls ? " Use a reroll, or roll again." : ""}</p><button class="btn" data-act="skip">Roll again</button>`}
        </div>`}
    </section>
  </div>`;
}

function readyView() {
  const xi = S.slots.map(x => x.p);
  return `<div class="bar-top"><button class="linkbtn" data-act="back-draft">← Back</button><span>${FORMATS[S.fmt].event}</span><span class="count">${strength(xi)}<small> str</small></span></div>
  <section class="ready">
    <h2>Game plan</h2>
    <fieldset class="seg" aria-label="Game plan">
      ${[["attack", "Attacking", "More boundaries, more wickets lost."], ["balanced", "Balanced", "Play the situation."], ["defend", "Defensive", S.fmt === "test" ? "Bat time. Harder to lose, harder to win." : "Protect wickets, fewer boundaries."]].map(([k, l, d]) => `<label class="opt${S.plan === k ? " sel" : ""}"><input type="radio" name="plan" id="plan-${k}" value="${k}" ${S.plan === k ? "checked" : ""}><b>${l}</b><span>${d}</span></label>`).join("")}
    </fieldset>
    <h2>Batting order</h2>
    <ol class="slots compact">${S.slots.map(slotRow).join("")}</ol>
    <button class="btn big-btn" data-act="go">Start the ${FORMATS[S.fmt].event}</button>
  </section>`;
}

function tally() {
  const W = S.results.filter(r => r === "W").length, L = S.results.filter(r => r === "L").length, D = S.results.filter(r => r === "D").length;
  return { W, L, D };
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
function scoreLine(inn) { return `<b>${esc(inn.team)}</b> ${inn.runs}${inn.allOut ? "" : "/" + inn.wk}${inn.declared ? "d" : ""} <span class="ov">(${overs(inn.balls)} ov)</span>`; }
function inningsDetail(inn) {
  const bats = [...inn.bat].sort((a, b) => b.r - a.r).slice(0, 3), bowls = [...inn.bowl].sort((a, b) => (b.w - a.w) || (a.r - b.r)).slice(0, 2);
  return `<div class="inn"><div class="inn-head">${scoreLine(inn)}</div>
    <div class="perf">${bats.map(c => `<span>${esc(c.p.name)} <b>${c.r}${c.out ? "" : "*"}</b> <small>(${c.b})</small></span>`).join("")}</div>
    <div class="perf bowl">${bowls.map(b => `<span>${esc(b.p.name)} <b>${b.w}/${b.r}</b> <small>(${overs(b.balls)})</small></span>`).join("")}</div></div>`;
}
function lamps() {
  const fx = S.campaign.fixtures, f = FORMATS[S.fmt];
  const pad = isIPL() && !finished() ? Math.max(0, f.perfect - fx.length) : 0;
  return fx.map((x, i) => `<span class="lamp ${S.results[i] === "W" ? "on" : S.results[i] === "L" ? "red" : S.results[i] === "D" ? "dim" : ""}" title="${esc(x.stage)}"></span>`).join("") + '<span class="lamp ghost"></span>'.repeat(pad);
}
function campaignView() {
  const f = FORMATS[S.fmt], fx = S.campaign.fixtures;
  const { W, L, D } = tally();
  const over = finished();
  const v = over ? verdict() : null;
  let lastStage = null;
  const rows = fx.map((x, i) => {
    const head = x.stage !== lastStage ? `<li class="stage">${esc(x.stage)}${S.fmt === "test" && x.series != null ? ` · v ${esc(x.opp.team)} ${x.away ? "(away)" : "(home)"}` : ""}</li>` : ""; lastStage = x.stage;
    const res = S.results[i], m = S.matches[i];
    const locked = i > S.idx || (!S.alive && i >= S.idx);
    return head + `<li class="fx${res ? " r-" + res : ""}${i === S.idx && !over ? " next" : ""}${locked && !res ? " locked" : ""}">
      <span class="res">${res || (i === S.idx && !over ? "▶" : "")}</span>
      <span class="opp"><b>${esc(x.opp.name)}</b><small>${PITCHES[x.pitch].label}${S.fmt === "test" && x.test ? ` · ${["1st", "2nd"][x.test - 1]} Test` : ""} · str ${x.opp.str}</small></span>
      <span class="txt">${m ? esc(m.text.replace(myName, "You")) : ""}</span>
      ${m ? `<button class="linkbtn" data-act="card" data-i="${i}" aria-expanded="${S.open === i}">Scorecard</button>` : ""}
      ${m && S.open === i ? `<div class="sc">${m.inns.map(inningsDetail).join("")}</div>` : ""}
    </li>`;
  }).join("");
  const nx = fx[S.idx];
  return `<div class="bar-top"><button class="linkbtn" data-act="quit">← Menu</button><span>${f.event}</span><span class="count">${W}<small>–${L}${D ? "–" + D : ""}</small></span></div>
  <section class="camp">
    <div class="board wide">
      <div class="lights">${lamps()}</div>
      ${over ? `<div class="verdict"><div class="vtitle">${esc(v.title)}</div><div class="big">${esc(v.rec)}</div><p>${esc(v.sub)}</p></div>` : `<div class="verdict"><div class="big">${W}<span>–</span>${L}${D ? `<span>–</span>${D}` : ""}</div><p>Next: ${esc(nx.stage)} v ${esc(nx.opp.name)} · ${PITCHES[nx.pitch].label}</p></div>`}
      <div class="ctl">${over ? `<button class="btn" data-act="share">Copy result</button><button class="btn ghost" data-act="again">Play again</button>` : `<button class="btn" data-act="play">Play match</button><button class="btn ghost" data-act="playall">Play the rest</button>`}</div>
      ${over ? `<textarea id="share-text" class="share" rows="4" readonly aria-label="Result to share">${esc(shareText())}</textarea>` : ""}
    </div>
    <ol class="fixtures">${rows}</ol>
    <details class="how"><summary>Your XI</summary><ol class="slots compact">${S.slots.map(slotRow).join("")}</ol></details>
  </section>`;
}
function shareText() {
  const f = FORMATS[S.fmt], v = verdict();
  const sq = S.campaign.fixtures.map((x, i) => S.results[i] === "W" ? "🟩" : S.results[i] === "L" ? "🟥" : S.results[i] === "D" ? "⬜" : "⬛").join("");
  return `CricDraft · ${f.event}${S.mode === "daily" ? " · " + S.day : ""}\n${v.perfect ? `${v.rec} 🏆 Unbeaten` : `${v.title}, ${v.rec}`}\n${sq}\nXI: ${S.slots.map(x => x.p.name).join(", ")}`;
}

/* ---------------- actions ---------------- */
function doRoll(kind) {
  if (kind === "team") S.key = rerollTeam(S.drawR, DATA, S.fmt, S.key);
  else if (kind === "year") S.key = rerollYear(S.drawR, DATA, S.fmt, S.key);
  else S.key = roll(S.drawR, DATA, S.fmt);
  const open = S.slots.filter(x => !x.p).map(x => x.s);
  const osFull = isIPL() && overseasCount() >= MAX_OVERSEAS;
  const pool = squad(DATA, S.fmt, S.key).filter(p => !S.used.includes(p.ident));
  S.hand = deal(S.drawR, pool, open, osFull ? p => !p.overseas : null);
  S.rolls++;
}
function place(j, slotIdx) {
  const p = S.hand[j], x = S.slots[slotIdx];
  x.p = effective(p, x.s); S.used.push(p.ident); S.key = null; S.hand = [];
}
function playNext() {
  const fx = S.campaign.fixtures;
  if (finished()) return;
  const r = rng(hashSeed(S.seedBase + "|match|" + S.idx + "|" + S.slots.map(x => x.p.ident).join(",") + "|" + S.plan));
  const m = playFixture(r, S.fmt, S.slots.map(x => x.p), myName, fx[S.idx], S.plan);
  S.matches[S.idx] = m; S.results[S.idx] = m.result;
  const g = stageGate(r, S.fmt, S.campaign, S.results, S.idx);
  if (g.note) S.notes.push(g.note);
  if (!g.through) S.alive = false;
  S.idx++;
  if (finished()) {
    const best = store.get("best", {}), W = S.results.filter(x => x === "W").length;
    best[S.fmt] = Math.max(best[S.fmt] || 0, W); store.set("best", best);
  }
}

function wire() {
  document.querySelectorAll('input[name="fmt"]').forEach(i => i.onchange = () => { home.fmt = i.value; store.set("fmt", i.value); render(); });
  document.querySelectorAll('input[name="mode"]').forEach(i => i.onchange = () => { home.mode = i.value; render(); });
  document.querySelectorAll('input[name="plan"]').forEach(i => i.onchange = () => { S.plan = i.value; render(); });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "start") return newRun();
  if (a === "preset") { home.mix = { ...PRESETS[b.dataset.k].mix }; store.set("mix", home.mix); return render(); }
  if (a === "mix") { const k = b.dataset.k; home.mix[k] = Math.max(MIX_LIMITS[k][0], Math.min(MIX_LIMITS[k][1], home.mix[k] + +b.dataset.d)); store.set("mix", home.mix); return render(); }
  if (a === "quit") { S = null; return render(); }
  if (a === "roll" || a === "skip") {
    const die = $("#die"), faces = "⚀⚁⚂⚃⚄⚅"; let n = 0;
    if (a === "roll" && die && !reduced) { const t = setInterval(() => { die.textContent = faces[n++ % 6]; if (n > 7) { clearInterval(t); doRoll(); render(); } }, 60); return; }
    doRoll(); return render();
  }
  if (a === "rr-team" || a === "rr-year") { if (S.rerolls > 0) { S.rerolls--; doRoll(a === "rr-team" ? "team" : "year"); render(); } return; }
  if (a === "pick") {
    const j = +b.dataset.j, idx = S.slots.findIndex(x => !x.p && x.s === b.dataset.slot);
    if (idx >= 0) { place(j, idx); render(); }
    return;
  }
  if (a === "ready") { S.screen = "ready"; return render(); }
  if (a === "back-draft") { S.screen = "draft"; return render(); }
  if (a === "go") { S.campaign = buildCampaign(rng(hashSeed(S.seedBase + "|campaign")), DATA, S.fmt); S.screen = "camp"; render(); return window.scrollTo(0, 0); }
  if (a === "play") { playNext(); S.open = S.idx - 1; return render(); }
  if (a === "playall") { while (!finished()) playNext(); S.open = null; return render(); }
  if (a === "card") { const i = +b.dataset.i; S.open = S.open === i ? null : i; return render(); }
  if (a === "again") { home.fmt = S.fmt; home.mix = { ...S.mix }; home.mode = "free"; return newRun(); }
  if (a === "share") {
    const t = shareText(), ta = $("#share-text");
    const ok = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy result"), 1600); };
    try { navigator.clipboard.writeText(t).then(ok, () => { ta.select(); b.textContent = "Selected: press Ctrl+C"; }); } catch { ta.select(); }
  }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button]")) { e.preventDefault(); e.target.click(); } });

render();
