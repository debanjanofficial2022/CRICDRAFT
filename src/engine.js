// CricDraft — match engine. Pure functions, seeded randomness, no DOM.
// Ratings: bat 35–99 (percentile vs international batters of the format), bowl 35–99 (vs regular bowlers), 0 = doesn't bowl.

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashSeed = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- per-ball base rates (legal deliveries) ----------
const BASE = {
  t20: { w: 0.046, d: 0.35, 1: 0.37, 2: 0.07, 3: 0.004, 4: 0.106, 6: 0.053, ex: 0.035 },
  odi: { w: 0.0205, d: 0.50, 1: 0.33, 2: 0.062, 3: 0.004, 4: 0.083, 6: 0.017, ex: 0.028 },
  test: { w: 0.0128, d: 0.735, 1: 0.15, 2: 0.036, 3: 0.007, 4: 0.06, 6: 0.003, ex: 0.012 },
};
export const PITCHES = {
  flat: { label: "Flat deck", runs: 1.1, pace: 0.85, spin: 0.85 },
  green: { label: "Green seamer", runs: 0.92, pace: 1.3, spin: 0.85 },
  turning: { label: "Turning track", runs: 0.95, pace: 0.88, spin: 1.35 },
  bouncy: { label: "Hard and bouncy", runs: 1.0, pace: 1.18, spin: 0.92 },
  balanced: { label: "Good cricket wicket", runs: 1.0, pace: 1.0, spin: 1.0 },
};
export const HOME_PITCH = {
  India: ["turning", "turning", "flat", "balanced"], "Sri Lanka": ["turning", "turning", "balanced"], Bangladesh: ["turning", "turning", "flat"],
  Pakistan: ["flat", "flat", "turning", "balanced"], England: ["green", "green", "balanced"], "New Zealand": ["green", "green", "balanced"],
  "South Africa": ["green", "bouncy", "balanced"], Australia: ["bouncy", "bouncy", "balanced", "flat"], "West Indies": ["balanced", "turning", "bouncy"],
  Zimbabwe: ["flat", "balanced", "turning"], Ireland: ["green", "balanced"], IPL: ["flat", "flat", "balanced", "turning", "flat"], neutral: ["balanced", "flat", "green", "turning", "bouncy"],
};
export const PLANS = {
  attack: { label: "Attacking", w: 1.18, b: 1.18 },
  balanced: { label: "Balanced", w: 1, b: 1 },
  defend: { label: "Defensive", w: 0.85, b: 0.86 },
};

// ---------- players ----------
export function makePlayer(data, entry, team, year) {
  const [pi, bat, bowl, flags] = entry;
  const [name, meta, full, ident] = data.players[pi];
  let style = meta[1] === "S" ? "spin" : meta[1] === "P" ? "pace" : bowl > 0 ? "pace" : "none";
  return { pi, name, full: full || name, ident: ident || name, meta, bat, bowl, keeper: !!(flags & 1), opener: !!(flags & 2), overseas: !!(flags & 4), style, arm: meta[2], hand: meta[3], role: meta[0], team, year };
}
export function squad(data, fmt, key) {
  const [team, year] = [key.slice(0, key.lastIndexOf(" ")), +key.slice(key.lastIndexOf(" ") + 1)];
  return data.squads[fmt][key].map(e => makePlayer(data, e, team, year));
}
export const teamOf = key => key.slice(0, key.lastIndexOf(" "));

// Best XI for a computer side: 2 openers, 3–4 batters, keeper, all-rounder, 4 bowlers (one spinner if decent).
export function autoXI(players, maxOverseas = 11) {
  let pool = [...players];
  let os = 0;
  const take = p => { pool.splice(pool.indexOf(p), 1); if (p.overseas && ++os >= maxOverseas) pool = pool.filter(q => !q.overseas); return p; };
  const keeper = take([...pool].filter(p => p.keeper).sort((a, b) => b.bat - a.bat)[0] || [...pool].sort((a, b) => b.bat - a.bat)[0]);
  const bowlers = [];
  const spin = [...pool].filter(p => p.style === "spin" && p.bowl > 0).sort((a, b) => b.bowl - a.bowl)[0];
  if (spin && spin.bowl >= 55) bowlers.push(take(spin));
  while (bowlers.length < 4) { const b = [...pool].filter(p => p.bowl > 0).sort((a, b) => (b.bowl + b.bat * 0.15) - (a.bowl + a.bat * 0.15))[0]; if (!b) break; bowlers.push(take(b)); }
  const allr = [...pool].filter(p => p.bowl > 0).sort((a, b) => (b.bat + b.bowl) - (a.bat + a.bowl))[0];
  const ar = allr && allr.bat >= 55 ? take(allr) : null;
  const bats = [...pool].sort((a, b) => b.bat - a.bat).slice(0, ar ? 5 : 6);
  bats.forEach(take);
  const openers = [...bats].sort((a, b) => (b.opener - a.opener) || (b.bat - a.bat)).slice(0, 2);
  const middle = bats.filter(p => !openers.includes(p)).sort((a, b) => b.bat - a.bat);
  const order = [...openers, ...middle, keeper, ...(ar ? [ar] : []), ...bowlers.sort((a, b) => b.bat - a.bat)];
  return order.slice(0, 11);
}
export function strength(xi) {
  const bats = [...xi].map(p => p.bat).sort((a, b) => b - a).slice(0, 7);
  const bowls = [...xi].map(p => p.bowl).sort((a, b) => b - a).slice(0, 5);
  return Math.round((bats.reduce((a, b) => a + b, 0) / 7) * 0.5 + (bowls.reduce((a, b) => a + b, 0) / 5) * 0.5);
}

// ---------- one ball ----------
function ball(r, fmt, batter, bowler, ctx) {
  const B = BASE[fmt], P = PITCHES[ctx.pitch];
  if (r() < B.ex) return { extra: 1 };
  let bowlEff = bowler.effBowl;
  const styleMul = bowler.style === "spin" ? P.spin * (ctx.wear || 1) : P.pace * (ctx.newBall || 1);
  const diff = (batter.bat - bowlEff) / 100;
  const a = ctx.aggr; // situational aggression, -1 (block) … +1.5 (slog)
  let w = B.w * Math.exp(-2.1 * diff) * styleMul * (a >= 0 ? 1 + 0.38 * a : 1 + 0.3 * a) * ctx.plan.w;
  let f = B[4] * Math.exp(1.1 * diff) * P.runs * (1 + 0.32 * a) * ctx.plan.b;
  let s = B[6] * Math.exp(1.5 * diff) * P.runs * (1 + 0.55 * a) * ctx.plan.b;
  let one = B[1] * Math.exp(0.35 * diff) * (1 + 0.08 * a), two = B[2] * Math.exp(0.35 * diff), three = B[3];
  w = clamp(w, 0.002, 0.3); f = Math.max(0, f); s = Math.max(0, s);
  const x = r();
  let c = w; if (x < c) return { wicket: true };
  c += s; if (x < c) return { runs: 6 };
  c += f; if (x < c) return { runs: 4 };
  c += three; if (x < c) return { runs: 3 };
  c += two; if (x < c) return { runs: 2 };
  c += one; if (x < c) return { runs: 1 };
  return { runs: 0 };
}

const HOW = { spin: ["c", "st", "lbw", "b", "c"], pace: ["c", "c", "b", "lbw", "c"] };

// ---------- one innings ----------
// opts: { fmt, maxOvers (limited overs), target (runs to win, or null), ballsLeft (Test time), pitch, plan, day0Ball (Test: balls already bowled in match), declare(state) }
export function innings(r, batting, bowling, opts) {
  const fmt = opts.fmt === "ipl" ? "t20" : opts.fmt;
  const order = batting.xi;
  const card = order.map(p => ({ p, r: 0, b: 0, f: 0, s: 0, out: null, in: false }));
  const bowlers = bowling.xi.filter(p => p.bowl > 0).sort((a, b) => b.bowl - a.bowl);
  while (bowlers.length < 5) { const pt = bowling.xi.filter(p => !bowlers.includes(p)).sort((a, b) => a.bat - b.bat)[0]; bowlers.push({ ...pt, bowl: 30, style: "pace", partTime: true, ref: pt }); }
  const use = fmt === "test" ? bowlers.slice(0, 6) : bowlers.slice(0, 6);
  const bc = new Map(use.map(b => [b, { p: b.ref || b, balls: 0, r: 0, w: 0, m: 0, spell: 0 }]));
  const maxPer = fmt === "t20" ? 4 : fmt === "odi" ? 10 : 999;
  let runs = 0, wk = 0, balls = 0, extras = 0;
  let striker = 0, non = 1, next = 2; card[0].in = card[1].in = true;
  let last = null, overBowler = null, overRuns = 0;
  const maxBalls = fmt === "test" ? (opts.ballsLeft ?? 2700) : opts.maxOvers * 6;
  const fall = [];
  const chooseBowler = () => {
    const overNo = Math.floor(balls / 6);
    const left = (fmt === "test" ? 999 : opts.maxOvers) - overNo;
    let options = use.filter(b => b !== last && bc.get(b).balls / 6 < maxPer);
    if (!options.length) options = use.filter(b => bc.get(b).balls / 6 < maxPer);
    if (!options.length) options = use;
    // keep enough overs for the best bowlers at the death in limited overs
    const score = b => {
      const s = bc.get(b); let v = b.bowl + r() * 14;
      if (fmt === "test") v -= Math.max(0, s.spell - 5) * 3 + (b.style === "spin" && balls < 120 ? 8 : 0) + (b.style === "pace" && balls < 90 ? -6 : 0);
      else {
        const phaseDeath = left <= (fmt === "t20" ? 4 : 10);
        const quotaLeft = maxPer - s.balls / 6;
        if (!phaseDeath && b.bowl >= use[1].bowl && quotaLeft <= (fmt === "t20" ? 2 : 3)) v -= 18; // save the best for the end
        if (fmt === "t20" && overNo < 6 && b.style === "spin") v -= 4;
      }
      return v;
    };
    options.sort((a, b) => score(b) - score(a));
    return options[0];
  };
  while (balls < maxBalls && wk < 10) {
    if (balls % 6 === 0) {
      const nb = chooseBowler();
      if (fmt === "test") { for (const [b, s] of bc) if (b !== nb && b !== last) s.spell = Math.max(0, s.spell - 1); }
      overBowler = nb; overRuns = 0;
    }
    const bs = bc.get(overBowler);
    // situational aggression
    let a = 0;
    const overNo = Math.floor(balls / 6), ballsLeft = maxBalls - balls, wkLeft = 10 - wk;
    if (fmt !== "test") {
      const pp = fmt === "t20" ? 6 : 10, death = fmt === "t20" ? 16 : 40;
      if (overNo < pp) a += 0.25; else if (overNo >= death) a += wkLeft >= 4 ? 0.9 : 0.4; else a += 0;
      if (wk >= 7 && overNo < death) a -= 0.35;
      if (opts.target != null) {
        const need = opts.target - runs, rrr = need / Math.max(1, ballsLeft) * 6, par = fmt === "t20" ? 8 : 5.4;
        a += clamp((rrr - par) / par * 1.6, -0.7, 1.4);
        if (need <= 0) break;
      }
    } else {
      if (opts.target != null) {
        const need = opts.target - runs, rrr = need / Math.max(1, ballsLeft) * 6;
        a = rrr > 5.2 || wkLeft <= 3 ? -1 : rrr > 3.6 ? 0.1 : rrr < 2.2 ? 0.35 : 0.15;
        if (need <= 0) break;
      } else if (opts.declareAt && runs >= opts.declareAt - 150) a = 0.6;
    }
    const day = fmt === "test" ? Math.floor(((opts.day0Ball || 0) + balls) / 540) + 1 : 1;
    const ctx = {
      pitch: opts.pitch, plan: opts.plan, aggr: a,
      wear: fmt === "test" ? 1 + 0.09 * (day - 1) : 1,
      newBall: fmt === "test" && balls % 480 < 90 ? 1.12 : (fmt !== "test" && overNo < (fmt === "t20" ? 2 : 6) ? 1.08 : 1),
    };
    const batter = card[striker];
    const res = ball(r, fmt, batter.p, { ...overBowler, effBowl: overBowler.bowl - (fmt === "test" ? Math.max(0, bs.spell - 6) * 1.5 : 0) }, ctx);
    if (res.extra) { runs++; extras++; bs.r++; overRuns++; continue; }
    balls++; bs.balls++; batter.b++;
    if (res.wicket) {
      wk++; bs.w++;
      const how = pick(r, HOW[overBowler.style === "spin" ? "spin" : "pace"]);
      batter.out = { how, bowler: (overBowler.ref || overBowler).name };
      fall.push(runs);
      if (wk < 10) { card[next].in = true; striker = next; next++; }
    } else {
      runs += res.runs; batter.r += res.runs; bs.r += res.runs; overRuns += res.runs;
      if (res.runs === 4) batter.f++; if (res.runs === 6) batter.s++;
      if (res.runs % 2 === 1) [striker, non] = [non, striker];
    }
    if (balls % 6 === 0) {
      if (overRuns === 0) bs.m++;
      if (fmt === "test") bs.spell++;
      last = overBowler; [striker, non] = [non, striker];
      if (opts.target != null && runs >= opts.target) break;
      if (opts.declareAt && runs >= opts.declareAt) return finish(true);
      if (opts.declareOvers && balls >= opts.declareOvers * 6) return finish(true);
    }
    if (opts.target != null && runs >= opts.target) break;
  }
  return finish(false);
  function finish(declared) {
    return { team: batting.name, runs, wk, balls, extras, declared, allOut: wk >= 10, bat: card.filter(c => c.in), bowl: [...bc.values()].filter(s => s.balls > 0), fall };
  }
}

export const overs = b => `${Math.floor(b / 6)}${b % 6 ? "." + (b % 6) : ""}`;

// ---------- matches ----------
// sides: { name, xi } ; returns { winner: 0|1|null, result text, innings[] }
export function playLimited(r, fmt, A, B, { pitch, planA, planB }) {
  const maxOvers = fmt === "odi" ? 50 : 20;
  const batFirst = r() < 0.5 ? 0 : 1;
  const s = [A, B], plans = [planA, planB];
  const i1 = innings(r, s[batFirst], s[1 - batFirst], { fmt, maxOvers, pitch, plan: plans[batFirst] });
  const i2 = innings(r, s[1 - batFirst], s[batFirst], { fmt, maxOvers, pitch, plan: plans[1 - batFirst], target: i1.runs + 1 });
  let winner, text;
  if (i2.runs > i1.runs) { winner = 1 - batFirst; text = `${s[winner].name} won by ${10 - i2.wk} wicket${10 - i2.wk === 1 ? "" : "s"}`; }
  else if (i2.runs < i1.runs) { winner = batFirst; text = `${s[winner].name} won by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? "" : "s"}`; }
  else { // tie: super over decides
    winner = r() < 0.5 ? 0 : 1; text = `Tied, ${s[winner].name} won the Super Over`;
  }
  return { winner, text, inns: [i1, i2], batFirst };
}

export function playTest(r, A, B, { pitch, planA, planB, followOn = true }) {
  const TOTAL = 5 * 90 * 6;
  let used = 0;
  const s = [A, B], plans = [planA, planB];
  const first = r() < 0.5 ? 0 : 1;
  const inns = [];
  const left = () => TOTAL - used;
  const go = (bi, opts) => { const i = innings(r, s[bi], s[1 - bi], { fmt: "test", pitch, plan: plans[bi], ballsLeft: left(), day0Ball: used, ...opts }); used += i.balls; i.side = bi; inns.push(i); return i; };
  const tot = side => inns.filter(i => i.side === side).reduce((a, i) => a + i.runs, 0);
  const result = (winner, text) => ({ winner, text, inns, batFirst: first, draw: winner == null });
  // 1st innings: declare around 550–650 or after ~165 overs
  go(first, { declareAt: 560 + Math.floor(r() * 90), declareOvers: 165 });
  if (left() <= 0) return result(null, "Match drawn");
  const second = 1 - first;
  go(second, { declareAt: inns[0].runs + 250, declareOvers: 165 });
  if (left() <= 0) return result(null, "Match drawn");
  const lead = inns[0].runs - inns[1].runs;
  let thirdSide = first;
  if (followOn && lead >= 200 && left() > 150 * 6) thirdSide = second; // follow-on enforced
  const deficitFor = side => tot(1 - side) - tot(side);
  if (thirdSide === second) {
    go(second, {});
    const need = tot(second) - tot(first) + 1;
    if (need <= 0) return result(first, `${s[first].name} won by an innings and ${-need + 1} runs`);
    if (left() <= 0) return result(null, "Match drawn");
    const last = go(first, { target: need });
    if (last.runs >= need) return result(first, `${s[first].name} won by ${10 - last.wk} wickets (after enforcing the follow-on)`);
    if (last.allOut) return result(second, `${s[second].name} won by ${need - 1 - last.runs} runs after following on`);
    return result(null, "Match drawn");
  }
  // normal 3rd innings: declare to set a target that leaves time to bowl the opposition out
  const remOvers = left() / 6;
  const targetLead = clamp(Math.round(remOvers * 3.3 - 90), 180, 480);
  const third = go(first, { declareAt: Math.max(1, targetLead - (tot(first) - tot(second))), declareOvers: Math.max(10, Math.floor(remOvers - Math.max(50, remOvers * 0.45))) });
  if (deficitFor(first) > 0 && third.allOut) {
    return result(second, `${s[second].name} won by an innings and ${deficitFor(first)} runs`);
  }
  if (left() <= 0) return result(null, "Match drawn");
  const need = tot(first) - tot(second) + 1;
  const fourth = go(second, { target: need });
  if (fourth.runs >= need) return result(second, `${s[second].name} won by ${10 - fourth.wk} wickets`);
  if (fourth.allOut) return result(first, `${s[first].name} won by ${need - 1 - fourth.runs} runs`);
  return result(null, "Match drawn");
}
