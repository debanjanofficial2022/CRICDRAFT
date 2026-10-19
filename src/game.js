// CricDraft — draft rules and campaigns.
import { squad, autoXI, strength, teamOf, HOME_PITCH, PITCHES, PLANS, playLimited, playTest } from "./engine.js";

export const FORMATS = {
  t20: { label: "T20", event: "T20 World Cup", perfect: 9, desc: "Group stage, Super 8, semi-final and final. Sides from 2005 on." },
  odi: { label: "ODI", event: "ODI World Cup", perfect: 11, desc: "Nine league games, semi-final and final. Sides from 1983 on." },
  test: { label: "Test", event: "World Test Championship", perfect: 13, desc: "Six two-Test series, then the final. Sides from 1983 on." },
  ipl: { label: "IPL", event: "IPL season", perfect: 16, desc: "Fourteen league games, then the playoffs. Franchise squads from 2008 on, at most four overseas players." },
};
export const MAX_OVERSEAS = 4;

export const SLOT = {
  OP: { label: "Opener", short: "OPEN", ok: p => true },
  BAT: { label: "Batter", short: "BAT", ok: p => true },
  WK: { label: "Wicketkeeper", short: "WK", ok: p => p.keeper },
  AR: { label: "All-rounder", short: "AR", ok: p => p.bowl > 0 && p.bat >= 50 },
  SPIN: { label: "Spinner", short: "SPIN", ok: p => p.bowl > 0 && p.style === "spin" },
  PACE: { label: "Pace bowler", short: "PACE", ok: p => p.bowl > 0 && p.style === "pace" },
};
// Two openers and a keeper are fixed; the other eight places are the player's choice.
export const FLEX = 8;
export const PRESETS = {
  balanced: { label: "Balanced", mix: { bat: 3, ar: 1, spin: 1, pace: 3 } },
  batting: { label: "Bat deep", mix: { bat: 4, ar: 2, spin: 1, pace: 1 } },
  bowling: { label: "Five bowlers", mix: { bat: 2, ar: 1, spin: 2, pace: 3 } },
  spin: { label: "Spin attack", mix: { bat: 3, ar: 1, spin: 3, pace: 1 } },
};
export const MIX_LIMITS = { bat: [0, 6], ar: [0, 5], spin: [0, 5], pace: [0, 6] };
export const slotsFor = mix => ["OP", "OP", ...Array(mix.bat).fill("BAT"), "WK", ...Array(mix.ar).fill("AR"), ...Array(mix.spin).fill("SPIN"), ...Array(mix.pace).fill("PACE")];
export function mixProblem(mix, fmt) {
  const total = mix.bat + mix.ar + mix.spin + mix.pace, bowlers = mix.ar + mix.spin + mix.pace;
  if (total !== FLEX) return `Choose ${FLEX} players besides the openers and keeper (now ${total}).`;
  if (bowlers < 4) return "Pick at least four players who bowl.";
  return null;
}
export const mixWarning = (mix, fmt) => (fmt !== "test" && mix.ar + mix.spin + mix.pace < 5 ? "Only four bowlers: a part-timer will have to bowl the rest of the overs." : null);

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
// Each roll shows CARDS players from the squad, at least one of whom fits an open slot when possible.
export const CARDS = 5;
export const REROLLS = 2;
export function deal(r, players, openSlots, allow) {
  const pool = allow ? players.filter(allow) : [...players];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const hand = pool.slice(0, CARDS);
  const fits = p => openSlots.some(s => SLOT[s].ok(p));
  if (!hand.some(fits)) { const f = pool.slice(CARDS).find(fits); if (f) hand[hand.length - 1] = f; }
  return hand;
}

// ---------- campaigns ----------
const sidesCache = {};
function sides(data, fmt) {
  if (sidesCache[fmt]) return sidesCache[fmt];
  return (sidesCache[fmt] = keysFor(data, fmt).map(k => { const xi = autoXI(squad(data, fmt, k), fmt === "ipl" ? MAX_OVERSEAS : 11); return { key: k, name: k, team: teamOf(k), xi, str: strength(xi) }; }).sort((a, b) => b.str - a.str));
}
function draw(r, pool, n, usedTeams) {
  const out = [], c = [...pool];
  while (out.length < n && c.length) {
    const s = c.splice(Math.floor(r() * c.length), 1)[0];
    if (usedTeams.has(s.team)) continue;
    usedTeams.add(s.team); out.push(s);
  }
  return out;
}
const pitchFor = (r, host) => { const l = HOME_PITCH[host] || HOME_PITCH.neutral; return l[Math.floor(r() * l.length)]; };

export function buildCampaign(r, data, fmt) {
  const all = sides(data, fmt), n = all.length;
  const top = f => all.slice(0, Math.max(6, Math.round(n * f)));
  const fx = [];
  if (fmt === "t20") {
    const host = ["India", "Australia", "England", "West Indies", "Sri Lanka", "South Africa"][Math.floor(r() * 6)];
    draw(r, top(0.4), 4, new Set()).forEach(o => fx.push({ stage: "Group", opp: o, pitch: pitchFor(r, host) }));
    draw(r, top(0.22), 3, new Set()).forEach(o => fx.push({ stage: "Super 8", opp: o, pitch: pitchFor(r, host) }));
    const ko = draw(r, top(0.08), 2, new Set());
    fx.push({ stage: "Semi-final", opp: ko[0], pitch: pitchFor(r, host) }, { stage: "Final", opp: ko[1], pitch: pitchFor(r, host) });
    return { fmt, host, fixtures: fx };
  }
  if (fmt === "odi") {
    const host = ["India", "England", "Australia", "South Africa", "New Zealand", "Pakistan"][Math.floor(r() * 6)];
    draw(r, top(0.45), 9, new Set()).forEach(o => fx.push({ stage: "League", opp: o, pitch: pitchFor(r, host) }));
    while (fx.length < 9) fx.push({ stage: "League", opp: top(0.45)[Math.floor(r() * top(0.45).length)], pitch: pitchFor(r, host) });
    const ko = draw(r, top(0.08), 2, new Set());
    fx.push({ stage: "Semi-final", opp: ko[0], pitch: pitchFor(r, host) }, { stage: "Final", opp: ko[1], pitch: pitchFor(r, host) });
    return { fmt, host, fixtures: fx };
  }
  if (fmt === "ipl") {
    // nine other franchises; five of them twice, as in a 10-team IPL
    const opps = draw(r, top(0.35), 9, new Set());
    const twice = new Set(opps.slice(0, 5));
    const list = [...opps, ...opps.filter(o => twice.has(o))];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    list.forEach((o, i) => fx.push({ stage: "League", opp: o, pitch: pitchFor(r, "IPL"), away: i % 2 === 1 }));
    return { fmt, host: "India", fixtures: fx, playoffPool: top(0.05) };
  }
  // World Test Championship: six two-Test series, alternating away and home
  const opps = draw(r, top(0.5), 6, new Set());
  opps.forEach((o, i) => {
    const away = i % 2 === 0;
    for (let t = 1; t <= 2; t++) fx.push({ stage: `Series ${i + 1}`, series: i, test: t, away, opp: o, pitch: away ? pitchFor(r, o.team) : pitchFor(r, "neutral") });
  });
  const fin = top(0.06)[Math.floor(r() * top(0.06).length)];
  fx.push({ stage: "Final", opp: fin, pitch: ["green", "balanced", "green"][Math.floor(r() * 3)] });
  return { fmt, host: "Home and away", fixtures: fx };
}

export function playFixture(r, fmt, myXI, myName, fixture, plan) {
  const me = { name: myName, xi: myXI }, opp = { name: fixture.opp.name, xi: fixture.opp.xi };
  const m = fmt === "test" ? playTest(r, me, opp, { pitch: fixture.pitch, planA: PLANS[plan], planB: PLANS.balanced }) : playLimited(r, fmt, me, opp, { pitch: fixture.pitch, planA: PLANS[plan], planB: PLANS.balanced });
  return { ...m, result: m.winner === 0 ? "W" : m.winner === 1 ? "L" : "D" };
}

// After match i: does the campaign continue? May append IPL playoff fixtures. Returns { through, note }.
export function stageGate(r, fmt, campaign, results, i) {
  const fixtures = campaign.fixtures, f = fixtures[i], nx = fixtures[i + 1];
  const won = results[i] === "W";
  if (fmt === "ipl") return iplGate(r, campaign, results, i);
  if (f.stage === "Semi-final" || f.stage === "Final") return won ? { through: true, note: f.stage === "Final" ? "Champions." : null } : { through: false, note: f.stage === "Final" ? "Lost the final." : "Knocked out in the semi-final." };
  if (!nx || nx.stage === f.stage || (fmt === "test" && nx.stage !== "Final")) return { through: true };
  const idx = fixtures.map((x, j) => j).filter(j => fixtures[j].stage === f.stage || (fmt === "test" && fixtures[j].stage !== "Final"));
  const W = idx.filter(j => results[j] === "W").length, D = idx.filter(j => results[j] === "D").length, n = idx.length;
  if (fmt === "t20" && f.stage === "Group") { if (W >= 3) return { through: true, note: "Top of the group." }; if (W === 2) return r() < 0.4 ? { through: true, note: "Through on net run rate." } : { through: false, note: "Out on net run rate." }; return { through: false, note: "Out in the group stage." }; }
  if (fmt === "t20" && f.stage === "Super 8") { if (W >= 2) return { through: true, note: "Into the semi-finals." }; if (W === 1) return r() < 0.15 ? { through: true, note: "Sneaked through on net run rate." } : { through: false, note: "Out in the Super 8." }; return { through: false, note: "Out in the Super 8." }; }
  if (fmt === "odi") { if (W >= 7) return { through: true, note: `Qualified with ${W} wins.` }; if (W === 6) return r() < 0.75 ? { through: true, note: "Qualified on net run rate." } : { through: false, note: "Missed out on net run rate." }; if (W === 5) return r() < 0.25 ? { through: true, note: "Sneaked in on net run rate." } : { through: false, note: "Missed the semi-finals." }; return { through: false, note: "Out in the league stage." }; }
  if (fmt === "test") { const pct = (12 * W + 4 * D) / (12 * n); return pct >= 0.6 ? { through: true, note: `Qualified for the final with ${Math.round(pct * 100)}% of points.` } : { through: false, note: `Finished with ${Math.round(pct * 100)}% of points, short of the final.` }; }
  return { through: true };
}

function iplGate(r, c, results, i) {
  const fx = c.fixtures, f = fx[i], won = results[i] === "W";
  const add = stage => { const p = c.playoffPool; fx.push({ stage, opp: p[Math.floor(r() * p.length)], pitch: pitchFor(r, "IPL") }); };
  if (f.stage === "League") {
    if (fx[i + 1] && fx[i + 1].stage === "League") return { through: true };
    const W = results.filter((x, j) => fx[j].stage === "League" && x === "W").length;
    let place;
    if (W >= 10) place = W >= 11 || r() < 0.8 ? 1 : 3;
    else if (W === 9) place = r() < 0.25 ? 2 : r() < 0.75 ? 3 : 5;
    else if (W === 8) place = r() < 0.4 ? 4 : 5;
    else if (W === 7) place = r() < 0.12 ? 4 : 5;
    else place = 6;
    if (place <= 2) { add("Qualifier 1"); return { through: true, note: `Top two with ${W} wins.` }; }
    if (place <= 4) { add("Eliminator"); return { through: true, note: `Into the playoffs in ${place === 3 ? "third" : "fourth"} place with ${W} wins.` }; }
    return { through: false, note: `${W} wins: missed the playoffs.` };
  }
  if (f.stage === "Qualifier 1") { add(won ? "Final" : "Qualifier 2"); return { through: true, note: won ? "Straight into the final." : "Another chance in Qualifier 2." }; }
  if (f.stage === "Eliminator") { if (won) { add("Qualifier 2"); return { through: true }; } return { through: false, note: "Out in the Eliminator." }; }
  if (f.stage === "Qualifier 2") { if (won) { add("Final"); return { through: true }; } return { through: false, note: "Out in Qualifier 2." }; }
  if (f.stage === "Final") return won ? { through: true, note: "Champions." } : { through: false, note: "Lost the final." };
  return { through: true };
}
export { PITCHES, PLANS };
