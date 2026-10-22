// CricDraft — draft rules and campaigns.
import { squad, autoXI, strength, teamOf, HOME_PITCH, PITCHES, PLANS, playLimited, playTest } from "./engine.js";

export const FORMATS = {
  t20: { label: "T20", event: "T20 World Cup", perfect: 7, desc: "Twelve teams: four groups of three, a Super 8, semi-finals and the final. Sides from 2005 on." },
  odi: { label: "ODI", event: "ODI World Cup", perfect: 11, desc: "Ten teams play each other once; the top four reach the semi-finals. Sides from 1983 on." },
  test: { label: "Test", event: "World Test Championship", perfect: 13, desc: "Nine teams, six two-Test series each; the top two by points percentage meet in the final. Sides from 1983 on." },
  ipl: { label: "IPL", event: "IPL season", perfect: 16, desc: "Ten franchises, fourteen league games each, then the playoffs. Seasons from 2008 on, at most four overseas players." },
};
export const MAX_OVERSEAS = 4;

export const SLOT = {
  OP: { label: "Opener", short: "OPEN", ok: p => true },
  BAT: { label: "Batter", short: "BAT", ok: p => true },
  WK: { label: "Wicketkeeper", short: "WK", ok: p => p.keeper },
  AR: { label: "All-rounder", short: "AR", ok: p => p.bowl > 0 && (p.role === "A" || p.bat >= 50 || (p.bat >= 60 && p.bowl >= 60)) },
  SPIN: { label: "Spinner", short: "SPIN", ok: p => p.bowl > 0 && p.style === "spin" },
  PACE: { label: "Pace bowler", short: "PACE", ok: p => p.bowl > 0 && p.style === "pace" },
  ANY: { label: "Add to XI", short: "ANY", ok: p => true },
};
// Two openers and a keeper are fixed; the other eight places are the player's choice.
export const FLEX = 8;
export const PRESETS = {
  balanced: { label: "Balanced", mix: { bat: 3, ar: 1, spin: 1, pace: 3 } },
  batting: { label: "Bat deep", mix: { bat: 4, ar: 2, spin: 1, pace: 1 } },
  bowling: { label: "Five bowlers", mix: { bat: 2, ar: 1, spin: 2, pace: 3 } },
  spin: { label: "Spin attack", mix: { bat: 3, ar: 1, spin: 3, pace: 1 } },
};
export const MIX_LIMITS = { bat: [0, 8], ar: [0, 8], spin: [0, 8], pace: [0, 8] };
// Two openers and a keeper are fixed; the player chooses how the other eight split.
export const slotsFor = mix => ["OP", "OP", ...Array(mix.bat).fill("BAT"), "WK", ...Array(mix.ar).fill("AR"), ...Array(mix.spin).fill("SPIN"), ...Array(mix.pace).fill("PACE")];
export function mixProblem(mix, fmt) {
  if (!mix) return null;
  const total = mix.bat + mix.ar + mix.spin + mix.pace, bowlers = mix.ar + mix.spin + mix.pace;
  if (total !== FLEX) return `Choose ${FLEX} players besides the openers and keeper (now ${total}).`;
  return null;
}
export const mixWarning = (mix, fmt) => { const n = mix.ar + mix.spin + mix.pace; return n < 5 ? (n === 0 ? "Nobody in this XI bowls: the batters will have to share every over." : `Only ${n} bowler${n === 1 ? "" : "s"}: part-timers will have to bowl the rest of the overs.`) : null; };

// All-rounder types: 60+ in both is a true all-rounder; otherwise whichever skill is stronger.
export function arType(p) {
  if (!(p.bowl > 0)) return null;
  if (p.bat >= 60 && p.bowl >= 60) return "True all-rounder";
  if (p.role === "A") return p.bat > p.bowl ? "Batting all-rounder" : "Bowling all-rounder";
  return null;
}
// A batter used out of position at the top loses a little.
export const effective = (p, slot) => (slot === "OP" && !p.opener ? { ...p, bat: Math.max(35, p.bat - 4) } : p);

export const keysFor = (data, fmt) => Object.keys(data.squads[fmt]);
export function roll(r, data, fmt) { const ks = keysFor(data, fmt); return ks[Math.floor(r() * ks.length)]; }
export function rerollTeam(r, data, fmt, key) { // same year, different team
  const y = key.slice(-4), opts = keysFor(data, fmt).filter(k => k.endsWith(" " + y) && k !== key);
  return opts.length ? opts[Math.floor(r() * opts.length)] : roll(r, data, fmt);
}
export function rerollYear(r, data, fmt, key) { // same team, different year
  const t = teamOf(key), opts = keysFor(data, fmt).filter(k => teamOf(k) === t && k !== key);
  return opts.length ? opts[Math.floor(r() * opts.length)] : roll(r, data, fmt);
}
// Rerolls per draft: keep the year and change the team, or keep the team and change the year.
export const REROLLS = 2;

// ---------- tournaments ----------
// Every tournament is a real competition: the whole field is drawn first, every match between other teams is
// simulated too, and progress is decided by points tables with real tie-breakers (points, wins, net run rate).
const sidesCache = {};
function sides(data, fmt) {
  if (sidesCache[fmt]) return sidesCache[fmt];
  return (sidesCache[fmt] = keysFor(data, fmt).map(k => { const xi = autoXI(squad(data, fmt, k), fmt === "ipl" ? MAX_OVERSEAS : 11); return { key: k, name: k, team: teamOf(k), xi, str: strength(xi) }; }).sort((a, b) => b.str - a.str));
}
const pitchFor = (r, host) => { const l = HOME_PITCH[host] || HOME_PITCH.neutral; return l[Math.floor(r() * l.length)]; };
const shuffle = (r, a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const BIG8 = ["Australia", "England", "India", "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "West Indies"];
const FRANCHISE = { "Delhi Daredevils": "Delhi", "Delhi Capitals": "Delhi", "Kings XI Punjab": "Punjab", "Punjab Kings": "Punjab", "Royal Challengers Bangalore": "Bengaluru", "Royal Challengers Bengaluru": "Bengaluru", "Rising Pune Supergiant": "Pune RPS", "Rising Pune Supergiants": "Pune RPS" };
export const franchiseOf = t => FRANCHISE[t] || t;
// Each nation (or franchise) appears once, in one of its stronger years, so the field stays tough.
export const TOUGH = { t20: 0.2, odi: 0.35, test: 0.3, ipl: 0.15 };
function pickYear(r, data, fmt, match) {
  const c = sides(data, fmt).filter(s => match(s.team));
  if (!c.length) return null;
  const top = c.slice(0, Math.max(1, Math.ceil(c.length * TOUGH[fmt])));
  return top[Math.floor(r() * top.length)];
}
const ORD = n => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

function tSlim(i) {
  return { team: i.team, side: i.side, runs: i.runs, wk: i.wk, balls: i.balls, declared: i.declared, allOut: i.allOut,
    bat: i.bat.map(c => ({ n: c.p.name, r: c.r, b: c.b, out: !!c.out, how: c.out ? `${c.out.how}, ${c.out.bowler}` : "" })),
    bowl: i.bowl.map(s => ({ n: s.p.name, balls: s.balls, r: s.r, w: s.w, m: s.m })) };
}
function playOf(r, fmt, A, B, pitch) {
  return fmt === "test" ? playTest(r, A, B, { pitch, planA: PLANS.balanced, planB: PLANS.balanced }) : playLimited(r, fmt, A, B, { pitch, planA: PLANS.balanced, planB: PLANS.balanced });
}
const maxOvers = fmt => (fmt === "odi" ? 50 : 20);

// result: { winner: 0 (a) | 1 (b) | null, text, inns (slim) }
function record(T, m, res) {
  const rec = { ...m, winner: res.winner == null ? null : res.winner === 0 ? m.a : m.b, text: res.text, inns: res.inns, n: T.results.length };
  T.results.push(rec);
  return rec;
}
function simMatch(T, m) {
  const A = T.teams[m.a], B = T.teams[m.b];
  const res = playOf(T.r, T.fmt, A, B, m.pitch);
  return record(T, m, { winner: res.winner, text: res.text, inns: res.inns.map(tSlim) });
}
// Standings for a set of teams over matches that pass the filter.
export function standings(T, ids, filter) {
  const rows = new Map(ids.map(id => [id, { id, P: 0, W: 0, L: 0, D: 0, pts: 0, rf: 0, bf: 0, ra: 0, ba: 0, nrr: 0, pct: 0 }]));
  const full = maxOvers(T.fmt) * 6;
  for (const m of T.results) {
    if (!filter(m) || !rows.has(m.a) || !rows.has(m.b)) continue;
    for (const id of [m.a, m.b]) {
      const x = rows.get(id); x.P++;
      if (m.winner == null) { x.D++; x.pts += T.fmt === "test" ? 4 : 1; }
      else if (m.winner === id) { x.W++; x.pts += T.fmt === "test" ? 12 : 2; }
      else x.L++;
    }
    if (T.fmt !== "test") for (const inn of m.inns) {
      const bat = inn.team === T.teams[m.a].name ? m.a : m.b, bowl = bat === m.a ? m.b : m.a;
      const balls = inn.allOut ? full : inn.balls;
      rows.get(bat).rf += inn.runs; rows.get(bat).bf += balls; rows.get(bowl).ra += inn.runs; rows.get(bowl).ba += balls;
    }
  }
  for (const x of rows.values()) {
    x.nrr = x.bf && x.ba ? x.rf / x.bf * 6 - x.ra / x.ba * 6 : 0;
    x.pct = x.P ? 100 * x.pts / (12 * x.P) : 0;
  }
  const h2h = (a, b) => { const m = T.results.find(m => filter(m) && ((m.a === a.id && m.b === b.id) || (m.a === b.id && m.b === a.id)) && m.winner != null); return m ? (m.winner === a.id ? -1 : 1) : 0; };
  return [...rows.values()].sort((a, b) => T.fmt === "test"
    ? (b.pct - a.pct) || (b.W - a.W) || (a.L - b.L)
    : (b.pts - a.pts) || (b.W - a.W) || (b.nrr - a.nrr) || h2h(a, b));
}
export const fmtNRR = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(3);
// Why you did or didn't get through, in the words a commentator would use.
function exitNote(T, rows, qual, where) {
  const pos = rows.findIndex(x => x.id === 0), me = rows[pos], cut = rows[qual - 1];
  if (pos < qual) return null;
  const nm = id => T.teams[id].name;
  if (T.fmt === "test") return `Finished ${ORD(pos + 1)} on ${me.pct.toFixed(1)}% of points; ${nm(cut.id)} took the last place in the final on ${cut.pct.toFixed(1)}%.`;
  if (me.pts === cut.pts && me.W === cut.W) return `Finished ${ORD(pos + 1)} in ${where}: level on ${me.pts} points with ${nm(cut.id)}, out on net run rate (${fmtNRR(me.nrr)} v ${fmtNRR(cut.nrr)}).`;
  return `Finished ${ORD(pos + 1)} in ${where} with ${me.pts} points; ${nm(cut.id)} went through in ${ORD(qual)} place with ${cut.pts}.`;
}
// Plays a list of matches in order. Your matches are handed to the player (yield); the rest are simulated.
function* playList(T, list) {
  for (const m of list) {
    if (!T.out && (m.a === 0 || m.b === 0)) {
      T.upcoming = T.upcoming.filter(u => u !== m);
      const meA = m.a === 0, opp = T.teams[meA ? m.b : m.a];
      const res = yield { ...m, opp, mine: true };
      record(T, meA ? m : { ...m, a: 0, b: m.a }, res);
    } else simMatch(T, m);
  }
}
function knockoutWinner(T, rec) { return rec.winner != null ? rec.winner : null; }
// A single knockout match; returns the winner's id. A drawn Test final is shared.
function* knockout(T, stage, a, b, pitch) {
  const m = { stage, a, b, pitch, ko: true };
  const before = T.results.length;
  yield* playList(T, [m]);
  const rec = T.results[before];
  if (rec.winner == null) return null;
  if ((a === 0 || b === 0) && !T.out && rec.winner !== 0) { T.out = true; T.note = stage === "Final" ? "Lost the final." : stage === "Semi-final" ? "Knocked out in the semi-final." : `Knocked out in ${stage === "Eliminator" ? "the Eliminator" : stage}.`; T.place = stage; }
  return rec.winner;
}
const rrRounds = ids => { // circle method; returns rounds of pairs
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a != null && b != null) pairs.push(k % 2 ? [b, a] : [a, b]); }
    rounds.push(pairs); t.splice(1, 0, t.pop());
  }
  return rounds;
};

export function buildTournament(r, data, fmt, myXI, myName) {
  const T = { fmt, r, teams: [{ id: 0, name: myName, team: myName, xi: myXI, str: strength(myXI), me: true }], results: [], groups: [], upcoming: [], out: false, note: null, champion: null, stagesDone: [], log: [] };
  const add = s => { const t = { id: T.teams.length, name: s.name, key: s.key, team: s.team, xi: s.xi, str: s.str }; T.teams.push(t); return t.id; };
  if (fmt === "t20") {
    T.host = ["India", "Australia", "England", "West Indies", "Sri Lanka", "South Africa"][Math.floor(r() * 6)];
    const nations = [...new Set(sides(data, fmt).map(s => s.team))];
    const ids = nations.map(n => add(pickYear(r, data, fmt, t => t === n))).sort((a, b) => T.teams[b].str - T.teams[a].str);
    // seeded draw: you head Group A; the top three seeds head B, C and D; then two pots
    const G = [[0], [ids[0]], [ids[1]], [ids[2]]];
    const pot2 = shuffle(r, ids.slice(3, 7)), pot3 = shuffle(r, ids.slice(7, 11));
    G.forEach((g, i) => { g.push(pot2[i], pot3[i]); });
    T.groups = G.map((g, i) => ({ name: "Group " + "ABCD"[i], ids: g, stage: "Group", qual: 2 }));
  } else if (fmt === "odi") {
    T.host = ["India", "England", "Australia", "South Africa", "New Zealand", "Pakistan"][Math.floor(r() * 6)];
    const minor = r() < 0.6 ? "Bangladesh" : ["Zimbabwe", "Afghanistan", "Ireland", "Bangladesh"][Math.floor(r() * 4)];
    [...BIG8, minor].forEach(n => add(pickYear(r, data, fmt, t => t === n)));
    T.groups = [{ name: "League table", ids: T.teams.map(t => t.id), stage: "League", qual: 4 }];
  } else if (fmt === "test") {
    T.host = "Home and away";
    const pool = [...BIG8, "Bangladesh"], drop = r() < 0.5 ? "Bangladesh" : pool[Math.floor(r() * pool.length)];
    shuffle(r, pool.filter(n => n !== drop)).forEach(n => add(pickYear(r, data, fmt, t => t === n)));
    T.groups = [{ name: "WTC table", ids: T.teams.map(t => t.id), stage: "League", qual: 2 }];
  } else {
    T.host = "India";
    const fr = shuffle(r, [...new Set(sides(data, fmt).map(s => franchiseOf(s.team)))]).slice(0, 9);
    fr.forEach(f => add(pickYear(r, data, fmt, t => franchiseOf(t) === f)));
    T.groups = [{ name: "Points table", ids: T.teams.map(t => t.id), stage: "League", qual: 4 }];
  }
  T.gen = tourneyGen(T);
  return T;
}

function* tourneyGen(T) {
  const r = T.r, fmt = T.fmt, P = host => pitchFor(r, host);
  const champion = id => { T.champion = id; };
  if (fmt === "t20") {
    // Group stage: three rounds, every group plays one match per round.
    const pairsOf = g => [[g[0], g[1]], [g[0], g[2]], [g[1], g[2]]];
    const list = [];
    for (let k = 0; k < 3; k++) for (const g of T.groups) { const [a, b] = pairsOf(g.ids)[k]; list.push({ stage: "Group", group: g.name, a, b, pitch: P(T.host) }); }
    T.upcoming = list.filter(m => m.a === 0 || m.b === 0);
    yield* playList(T, list);
    const tab = T.groups.map(g => standings(T, g.ids, m => m.stage === "Group" && m.group === g.name));
    T.stagesDone.push("Group");
    const n = exitNote(T, tab[0], 2, "Group A"); if (n && !T.out) { T.out = true; T.note = n; T.place = "Group"; }
    const [A, B, C, D] = tab.map(t => t.map(x => x.id));
    const S8 = [{ name: "Super 8 Group 1", ids: [A[0], B[1], C[0], D[1]] }, { name: "Super 8 Group 2", ids: [B[0], A[1], D[0], C[1]] }].map(g => ({ ...g, stage: "Super 8", qual: 2 }));
    T.groups.push(...S8);
    const l2 = [];
    for (let k = 0; k < 3; k++) for (const g of S8) for (const [i, j] of [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]][k]) l2.push({ stage: "Super 8", group: g.name, a: g.ids[i], b: g.ids[j], pitch: P(T.host) });
    T.upcoming = l2.filter(m => m.a === 0 || m.b === 0);
    yield* playList(T, l2);
    const t2 = S8.map(g => standings(T, g.ids, m => m.stage === "Super 8" && m.group === g.name));
    T.stagesDone.push("Super 8");
    if (!T.out) { const gi = S8.findIndex(g => g.ids.includes(0)); const n2 = exitNote(T, t2[gi], 2, S8[gi].name); if (n2) { T.out = true; T.note = n2; T.place = "Super 8"; } }
    const s1 = yield* knockout(T, "Semi-final", t2[0][0].id, t2[1][1].id, P(T.host));
    const s2 = yield* knockout(T, "Semi-final", t2[1][0].id, t2[0][1].id, P(T.host));
    champion(yield* knockout(T, "Final", s1, s2, P(T.host)));
  } else if (fmt === "odi") {
    const list = rrRounds(T.groups[0].ids).flatMap(round => round.map(([a, b]) => ({ stage: "League", group: "League table", a, b, pitch: P(T.host) })));
    T.upcoming = list.filter(m => m.a === 0 || m.b === 0);
    yield* playList(T, list);
    const tab = standings(T, T.groups[0].ids, m => m.stage === "League");
    T.stagesDone.push("League");
    const n = exitNote(T, tab, 4, "the league"); if (n && !T.out) { T.out = true; T.note = n; T.place = "League"; }
    const s1 = yield* knockout(T, "Semi-final", tab[0].id, tab[3].id, P(T.host));
    const s2 = yield* knockout(T, "Semi-final", tab[1].id, tab[2].id, P(T.host));
    champion(yield* knockout(T, "Final", s1, s2, P(T.host)));
  } else if (fmt === "test") {
    // Each team hosts the next three on the circle and visits the previous three: six two-Test series each.
    const n = T.teams.length, series = [];
    for (let i = 0; i < n; i++) for (let d = 1; d <= 3; d++) series.push({ host: i, guest: (i + d) % n });
    const mine = series.filter(s => s.host === 0 || s.guest === 0);
    const away = mine.filter(s => s.guest === 0), home = mine.filter(s => s.host === 0);
    const myOrder = []; for (let k = 0; k < 3; k++) myOrder.push(away[k], home[k]);
    const others = shuffle(r, series.filter(s => s.host !== 0 && s.guest !== 0));
    const tests = (s, si) => [1, 2].map(t => { const host = T.teams[s.host]; const pitch = s.host === 0 ? P("neutral") : P(host.team); return { stage: "League", group: "WTC table", a: s.guest, b: s.host, series: si, test: t, away: s.guest === 0, pitch }; });
    const myTests = myOrder.flatMap((s, i) => tests(s, i));
    const otherTests = others.flatMap((s, i) => tests(s, 100 + i));
    T.upcoming = [...myTests];
    let done = 0;
    for (let k = 0; k < myTests.length; k++) {
      yield* playList(T, [myTests[k]]);
      const upto = Math.round(otherTests.length * (k + 1) / myTests.length);
      for (; done < upto; done++) simMatch(T, otherTests[done]);
    }
    const tab = standings(T, T.groups[0].ids, m => m.stage === "League");
    T.stagesDone.push("League");
    const nt = exitNote(T, tab, 2, "the table"); if (nt && !T.out) { T.out = true; T.note = nt; T.place = "League"; }
    const w = yield* knockout(T, "Final", tab[0].id, tab[1].id, ["green", "balanced", "green"][Math.floor(r() * 3)]);
    champion(w == null ? [tab[0].id, tab[1].id] : w);
    if (w == null && (tab[0].id === 0 || tab[1].id === 0)) { T.out = false; T.note = "The final was drawn: the title is shared."; }
  } else {
    // IPL: two groups of five; play your group twice, the other group once, and your opposite number a second time.
    const ids = T.groups[0].ids, G1 = ids.slice(0, 5), G2 = ids.slice(5);
    const all = [];
    const pair = (a, b) => all.push({ stage: "League", group: "Points table", a, b, pitch: P("IPL") });
    for (const G of [G1, G2]) for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) { pair(G[i], G[j]); pair(G[j], G[i]); }
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pair(G1[i], G2[j]);
    for (let i = 0; i < 5; i++) pair(G2[i], G1[i]);
    const mine = shuffle(r, all.filter(m => m.a === 0 || m.b === 0)), others = shuffle(r, all.filter(m => m.a !== 0 && m.b !== 0));
    T.upcoming = [...mine];
    let done = 0;
    for (let k = 0; k < mine.length; k++) {
      yield* playList(T, [mine[k]]);
      const upto = Math.round(others.length * (k + 1) / mine.length);
      for (; done < upto; done++) simMatch(T, others[done]);
    }
    const tab = standings(T, ids, m => m.stage === "League");
    T.stagesDone.push("League");
    const n = exitNote(T, tab, 4, "the league"); if (n && !T.out) { T.out = true; T.note = n; T.place = "League"; }
    const [p1, p2, p3, p4] = tab.map(x => x.id);
    const before = T.results.length;
    // Qualifier 1: losing it is not the end
    const q1m = { stage: "Qualifier 1", a: p1, b: p2, pitch: P("IPL"), ko: true };
    yield* playList(T, [q1m]);
    const q1 = T.results[before], q1w = q1.winner, q1l = q1w === p1 ? p2 : p1;
    const el = yield* knockout(T, "Eliminator", p3, p4, P("IPL"));
    const q2 = yield* knockout(T, "Qualifier 2", q1l, el, P("IPL"));
    champion(yield* knockout(T, "Final", q1w, q2, P("IPL")));
  }
  T.done = true;
}

// A non-interactive run of a whole tournament for one XI (used by the difficulty checks).
export function autoTournament(r, data, fmt, xi, plan = "balanced", matchR = r) {
  const T = buildTournament(r, data, fmt, xi, "Your XI");
  let x = T.gen.next(), mine = [];
  while (!x.done) {
    const f = x.value;
    const m = fmt === "test" ? playTest(matchR, { name: "Your XI", xi }, { name: f.opp.name, xi: f.opp.xi }, { pitch: f.pitch, planA: PLANS[plan], planB: PLANS.balanced })
      : playLimited(matchR, fmt, { name: "Your XI", xi }, { name: f.opp.name, xi: f.opp.xi }, { pitch: f.pitch, planA: PLANS[plan], planB: PLANS.balanced });
    mine.push(m.winner === 0 ? "W" : m.winner === 1 ? "L" : "D");
    x = T.gen.next({ winner: m.winner, text: m.text, inns: m.inns.map(tSlim) });
  }
  return { T, mine };
}

export function playFixture(r, fmt, myXI, myName, fixture, plan) {
  const me = { name: myName, xi: myXI }, opp = { name: fixture.opp.name, xi: fixture.opp.xi };
  const m = fmt === "test" ? playTest(r, me, opp, { pitch: fixture.pitch, planA: PLANS[plan], planB: PLANS.balanced }) : playLimited(r, fmt, me, opp, { pitch: fixture.pitch, planA: PLANS[plan], planB: PLANS.balanced });
  return { ...m, result: m.winner === 0 ? "W" : m.winner === 1 ? "L" : "D" };
}
export { PITCHES, PLANS };
