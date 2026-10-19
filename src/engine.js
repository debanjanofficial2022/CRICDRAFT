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
  const styleMul = bowler.style === "spin" ? P.spin * (ctx.wear || 1) : P.pace * (ctx.newBall || 1);
  const diff = (batter.bat - bowler.effBowl) / 100;
  const a = ctx.aggr; // situational aggression, -1 (block) … +1.5 (slog)
  const ua = ctx.ua || 0; // a human captain's approach on top of the situation: risk rises faster than reward
  const F = ctx.field || FIELDS.balanced;
  const uw = ua >= 0 ? 1 + 0.95 * ua : 1 + 0.55 * ua, ub = ua >= 0 ? 1 + 0.3 * ua : 1 + 0.6 * ua, us = ua >= 0 ? 1 + 0.6 * ua : 1 + 0.8 * ua;
  let w = B.w * Math.exp(-2.1 * diff) * styleMul * (a >= 0 ? 1 + 0.38 * a : 1 + 0.3 * a) * ctx.plan.w * F.w * uw;
  let f = B[4] * Math.exp(1.1 * diff) * P.runs * (1 + 0.32 * a) * ctx.plan.b * F.b * ub;
  let s = B[6] * Math.exp(1.5 * diff) * P.runs * (1 + 0.55 * a) * ctx.plan.b * F.b * us;
  let one = B[1] * Math.exp(0.35 * diff) * (1 + 0.08 * a) * F.one * (ua < 0 ? 1 - 0.15 * ua : 1), two = B[2] * Math.exp(0.35 * diff), three = B[3];
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

const HOW = { spin: ["caught", "stumped", "lbw", "bowled", "caught"], pace: ["caught", "caught", "bowled", "lbw", "caught"] };

// Choices a captain can make. Batting approach shifts aggression; the field changes the batters' odds.
export const APPROACH = {
  attack: { label: "Go hard", desc: "More boundaries, more risk", a: 0.7 },
  steady: { label: "Play the situation", desc: "Rotate strike, punish bad balls", a: 0 },
  dig: { label: "Dig in", desc: "Protect wickets, fewer runs", a: -0.6 },
};
export const FIELDS = {
  attack: { label: "Attacking field", desc: "Slips and catchers: more wickets, more boundaries", w: 1.13, b: 1.2, one: 0.95 },
  balanced: { label: "Balanced field", desc: "A bit of both", w: 1, b: 1, one: 1 },
  defend: { label: "Boundary riders", desc: "Cut the boundaries, give away singles", w: 0.9, b: 0.82, one: 1.18 },
};
const dec = (side, kind, prompt, options, def, extra = {}) => ({ type: "decision", side, kind, prompt, options, def, ...extra });
const opt = (id, label, desc) => ({ id, label, desc });

// ---------- one innings (generator) ----------
// Yields { type: "ball" | "over" | "decision" }; a decision's answer is passed back through next().
// opts: { fmt, maxOvers, target, ballsLeft, pitch, plan, day0Ball, declareAt, declareOvers, inn, batSide, leadBefore,
//         interactive, humanBat, humanBowl, canDeclare }
export function* inningsGen(r, batting, bowling, opts) {
  const fmt = opts.fmt === "ipl" ? "t20" : opts.fmt;
  const order = batting.xi;
  const card = order.map(p => ({ p, r: 0, b: 0, f: 0, s: 0, out: null, in: false }));
  const bowlers = bowling.xi.filter(p => p.bowl > 0).sort((a, b) => b.bowl - a.bowl);
  while (bowlers.length < 5) { const pt = bowling.xi.filter(p => !bowlers.includes(p) && !bowlers.some(b => b.ref === p)).sort((a, b) => a.bat - b.bat)[0]; bowlers.push({ ...pt, bowl: 30, style: "pace", partTime: true, ref: pt }); }
  const use = bowlers.slice(0, 6);
  const bc = new Map(use.map(b => [b, { p: b.ref || b, balls: 0, r: 0, w: 0, m: 0, spell: 0 }]));
  const maxPer = fmt === "t20" ? 4 : fmt === "odi" ? 10 : 999;
  let runs = 0, wk = 0, balls = 0, extras = 0;
  let striker = 0, non = 1, next = 2; card[0].in = card[1].in = true;
  let last = null, overBowler = null, overRuns = 0, overWk = 0, overBalls = [];
  const maxBalls = fmt === "test" ? (opts.ballsLeft ?? 2700) : opts.maxOvers * 6;
  const fall = [];
  const askBat = !!(opts.interactive && opts.humanBat), askBowl = !!(opts.interactive && opts.humanBowl);
  let userAggr = 0, field = FIELDS.balanced, autoBowl = !askBowl, wicketPrompt = false, lastDeclAsk = -99;
  const pp = fmt === "t20" ? 6 : 10, mid = fmt === "t20" ? 11 : 30, death = fmt === "t20" ? 16 : 40;
  const phaseName = o => fmt === "test" ? null : o === 0 ? "Powerplay" : o === pp ? "Middle overs" : o === mid ? "Second half" : o === death ? "Death overs" : null;
  const fig = s => `${Math.floor(s.balls / 6)}${s.balls % 6 ? "." + (s.balls % 6) : ""}-${s.m}-${s.r}-${s.w}`;
  const autoBowler = () => {
    const overNo = Math.floor(balls / 6);
    const left = (fmt === "test" ? 999 : opts.maxOvers) - overNo;
    let options = use.filter(b => b !== last && bc.get(b).balls / 6 < maxPer);
    if (!options.length) options = use.filter(b => bc.get(b).balls / 6 < maxPer);
    if (!options.length) options = use;
    const score = b => {
      const s = bc.get(b); let v = b.bowl + r() * 14;
      if (fmt === "test") v -= Math.max(0, s.spell - 5) * 3 + (b.style === "spin" && balls < 120 ? 8 : 0) + (b.style === "pace" && balls < 90 ? -6 : 0);
      else {
        const phaseDeath = left <= (fmt === "t20" ? 4 : 10);
        const quotaLeft = maxPer - s.balls / 6;
        if (!phaseDeath && b.bowl >= use[1].bowl && quotaLeft <= (fmt === "t20" ? 2 : 3)) v -= 18;
        if (fmt === "t20" && overNo < 6 && b.style === "spin") v -= 4;
      }
      return v;
    };
    options.sort((a, b) => score(b) - score(a));
    return options[0];
  };
  const state = () => ({ runs, wk, balls, target: opts.target ?? null });
  while (balls < maxBalls && wk < 10) {
    if (balls % 6 === 0 && overBalls !== null && (overBalls.length === 0)) {
      const overNo = Math.floor(balls / 6);
      const ph = phaseName(overNo);
      const testSession = fmt === "test" && (((opts.day0Ball || 0) + balls) % 180 === 0 || balls === 0);
      // declaration (Test, human batting side)
      if (fmt === "test" && askBat && opts.canDeclare && overNo - lastDeclAsk >= 10) {
        const lead = (opts.leadBefore || 0) + runs;
        const firstInns = opts.inn <= 2;
        if ((firstInns && runs >= 400 && overNo >= 90) || (!firstInns && lead >= 200)) {
          lastDeclAsk = overNo;
          const ans = yield dec(opts.batSide, "declare", `${runs}/${wk} after ${overNo} overs${firstInns ? "" : `, a lead of ${lead}`}. Declare?`,
            [opt("declare", "Declare", firstInns ? "Get the opposition in" : `Set them ${lead + 1} to win`), opt("bat", "Bat on", "Build a bigger total")], "bat");
          if (ans === "declare") return finish(true);
        }
      }
      if (askBat && (ph || testSession || wicketPrompt || balls === 0)) {
        wicketPrompt = false;
        const c = yield dec(opts.batSide, "approach", `${ph || (fmt === "test" ? "New session" : "After the wicket")}: how should your batters play?`,
          Object.entries(APPROACH).map(([k, v]) => opt(k, v.label, v.desc)), "steady", { state: state() });
        userAggr = (APPROACH[c] || APPROACH.steady).a;
      }
      if (askBowl && (ph || testSession || balls === 0)) {
        const c = yield dec(1 - opts.batSide, "field", `${ph || (fmt === "test" ? "New session" : "Field")}: set your field`,
          Object.entries(FIELDS).map(([k, v]) => opt(k, v.label, v.desc)), "balanced", { state: state() });
        field = FIELDS[c] || FIELDS.balanced;
      }
      let nb = null;
      const askNow = askBowl && !autoBowl && (fmt !== "test" || testSession || !overBowler || bc.get(overBowler).spell >= 6);
      if (askNow) {
        const avail = use.filter(b => b !== last && bc.get(b).balls / 6 < maxPer);
        const list = avail.length ? avail : use.filter(b => bc.get(b).balls / 6 < maxPer);
        const sug = autoBowler();
        const c = yield dec(1 - opts.batSide, "bowler", `Over ${overNo + 1}: who bowls?`,
          [...list.map(b => { const s = bc.get(b); return opt(String(use.indexOf(b)), (b.ref || b).name, `${b.style === "spin" ? "Spin" : "Pace"} · bowl ${b.bowl} · ${fig(s)}${fmt !== "test" ? ` · ${maxPer - Math.ceil(s.balls / 6)} left` : ""}`); }), opt("auto", "Let the captain decide", "Stop asking this innings")],
          String(use.indexOf(sug)), { state: state(), suggestion: (sug.ref || sug).name });
        if (c === "auto") { autoBowl = true; nb = sug; } else nb = use[+c] && list.includes(use[+c]) ? use[+c] : sug;
      }
      if (!nb) nb = autoBowler();
      if (fmt === "test" && nb !== overBowler) { for (const [b, s] of bc) if (b !== nb && b !== last) s.spell = Math.max(0, s.spell - 1); }
      overBowler = nb; overRuns = 0; overWk = 0;
    }
    if (overBalls === null || balls % 6 === 0) overBalls = overBalls || [];
    const bs = bc.get(overBowler);
    // situational aggression (the captain's default), plus the human approach
    let a = 0;
    const overNo = Math.floor(balls / 6), ballsLeft = maxBalls - balls, wkLeft = 10 - wk;
    if (fmt !== "test") {
      if (overNo < pp) a += 0.25; else if (overNo >= death) a += wkLeft >= 4 ? 0.9 : 0.4;
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
      } else if (opts.declareAt && runs >= opts.declareAt - 150 && !askBat) a = 0.6;
    }

    const day = fmt === "test" ? Math.floor(((opts.day0Ball || 0) + balls) / 540) + 1 : 1;
    const ctx = {
      pitch: opts.pitch, plan: opts.plan, aggr: a, ua: askBat ? userAggr : 0, field: askBowl ? field : FIELDS.balanced,
      wear: fmt === "test" ? 1 + 0.09 * (day - 1) : 1,
      newBall: fmt === "test" && balls % 480 < 90 ? 1.12 : (fmt !== "test" && overNo < (fmt === "t20" ? 2 : 6) ? 1.08 : 1),
    };
    const batter = card[striker];
    const res = ball(r, fmt, batter.p, { ...overBowler, effBowl: overBowler.bowl - (fmt === "test" ? Math.max(0, bs.spell - 6) * 1.5 : 0) }, ctx);
    const bowlerName = (overBowler.ref || overBowler).name;
    if (res.extra) {
      runs++; extras++; bs.r++; overRuns++;
      const ev = { type: "ball", inn: opts.inn, over: overNo, ball: balls % 6 + 1, bowler: bowlerName, batter: batter.p.name, runs: 1, extra: true, score: state() };
      overBalls.push("wd"); yield ev; continue;
    }
    balls++; bs.balls++; batter.b++;
    let ev;
    if (res.wicket) {
      wk++; bs.w++; overWk++;
      const how = pick(r, HOW[overBowler.style === "spin" ? "spin" : "pace"]);
      batter.out = { how, bowler: bowlerName };
      fall.push(runs);
      ev = { type: "ball", inn: opts.inn, over: overNo, ball: (balls - 1) % 6 + 1, bowler: bowlerName, batter: batter.p.name, runs: 0, wicket: how, batterScore: `${batter.r} (${batter.b})`, score: state() };
      if (wk < 10) { card[next].in = true; striker = next; next++; ev.newBatter = card[striker].p.name; }
      if ([3, 5, 7].includes(wk)) wicketPrompt = true;
      overBalls.push("W");
    } else {
      runs += res.runs; batter.r += res.runs; bs.r += res.runs; overRuns += res.runs;
      if (res.runs === 4) batter.f++; if (res.runs === 6) batter.s++;
      ev = { type: "ball", inn: opts.inn, over: overNo, ball: (balls - 1) % 6 + 1, bowler: bowlerName, batter: batter.p.name, runs: res.runs, score: state(), milestone: (batter.r >= 100 && batter.r - res.runs < 100) ? 100 : (batter.r >= 50 && batter.r - res.runs < 50) ? 50 : null, batterScore: `${batter.r} (${batter.b})` };
      if (res.runs % 2 === 1) [striker, non] = [non, striker];
      overBalls.push(String(res.runs));
    }
    yield ev;
    const chased = opts.target != null && runs >= opts.target;
    if (balls % 6 === 0 || chased || wk >= 10 || balls >= maxBalls) {
      if (balls % 6 === 0) { if (overRuns === 0) bs.m++; if (fmt === "test") bs.spell++; last = overBowler; [striker, non] = [non, striker]; }
      yield { type: "over", inn: opts.inn, over: overNo, bowler: bowlerName, figures: fig(bs), runs: overRuns, wickets: overWk, balls: overBalls, score: state(),
        batters: [card[striker], card[non]].filter(c => c && c.in && !c.out).map(c => `${c.p.name} ${c.r} (${c.b})`) };
      overBalls = [];
      if (chased) break;
      if (!askBat && opts.declareAt && runs >= opts.declareAt) return finish(true);
      if (!askBat && opts.declareOvers && balls >= opts.declareOvers * 6) return finish(true);
    }
  }
  return finish(false);
  function finish(declared) {
    return { team: batting.name, side: opts.batSide, runs, wk, balls, extras, declared, allOut: wk >= 10, bat: card.filter(c => c.in), bowl: [...bc.values()].filter(s => s.balls > 0), fall };
  }
}

export const overs = b => `${Math.floor(b / 6)}${b % 6 ? "." + (b % 6) : ""}`;

// Runs a match generator to the end, answering every decision with its default (the captain's choice).
export function runAuto(gen, answer) {
  let x = gen.next();
  while (!x.done) x = gen.next(x.value && x.value.type === "decision" ? (answer ? answer(x.value) : x.value.def) : undefined);
  return x.value;
}

// ---------- matches (generators) ----------
// sides: [{ name, xi }, { name, xi }] ; o: { pitch, plans:[p0,p1], human:[bool,bool], interactive }
function* toss(r, fmt, s, o) {
  const winner = r() < 0.5 ? 0 : 1;
  let choice = fmt === "test" ? (r() < 0.8 ? "bat" : "bowl") : (r() < 0.55 ? "bowl" : "bat");
  if (o.interactive && o.human[winner]) {
    choice = yield dec(winner, "toss", `You won the toss on a ${PITCHES[o.pitch].label.toLowerCase()}. Bat or bowl?`,
      [opt("bat", "Bat first", fmt === "test" ? "Use the pitch while it's fresh" : "Set a target"), opt("bowl", "Bowl first", fmt === "test" ? "Use any early movement" : "Know what you're chasing")], choice);
  }
  yield { type: "toss", winner, choice, text: `${s[winner].name} won the toss and chose to ${choice}` };
  return choice === "bat" ? winner : 1 - winner;
}

export function* limitedGen(r, fmt, A, B, o) {
  const maxOvers = fmt === "odi" ? 50 : 20;
  const s = [A, B];
  const human = o.human || [false, false];
  const batFirst = yield* toss(r, fmt, s, { ...o, human });
  const io = side => ({ fmt, maxOvers, pitch: o.pitch, plan: o.plans[side], batSide: side, interactive: o.interactive, humanBat: human[side], humanBowl: human[1 - side] });
  const i1 = yield* inningsGen(r, s[batFirst], s[1 - batFirst], { ...io(batFirst), inn: 1 });
  yield { type: "innings", inn: 1, result: i1, text: `${i1.team} ${i1.runs}/${i1.wk} (${overs(i1.balls)} ov). Target ${i1.runs + 1}.` };
  const i2 = yield* inningsGen(r, s[1 - batFirst], s[batFirst], { ...io(1 - batFirst), inn: 2, target: i1.runs + 1 });
  let winner, text;
  if (i2.runs > i1.runs) { winner = 1 - batFirst; text = `${s[winner].name} won by ${10 - i2.wk} wicket${10 - i2.wk === 1 ? "" : "s"}`; }
  else if (i2.runs < i1.runs) { winner = batFirst; text = `${s[winner].name} won by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? "" : "s"}`; }
  else { winner = r() < 0.5 ? 0 : 1; text = `Tied, ${s[winner].name} won the Super Over`; }
  return { winner, text, inns: [i1, i2], batFirst };
}

export function* testGen(r, A, B, o) {
  const TOTAL = 5 * 90 * 6;
  let used = 0;
  const s = [A, B], human = o.human || [false, false];
  const first = yield* toss(r, "test", s, { ...o, human });
  const second = 1 - first;
  const inns = [];
  const left = () => TOTAL - used;
  const tot = side => inns.filter(i => i.side === side).reduce((a, i) => a + i.runs, 0);
  const go = function* (bi, extra) {
    const i = yield* inningsGen(r, s[bi], s[1 - bi], { fmt: "test", pitch: o.pitch, plan: o.plans[bi], ballsLeft: left(), day0Ball: used, batSide: bi, inn: inns.length + 1,
      interactive: o.interactive, humanBat: human[bi], humanBowl: human[1 - bi], canDeclare: true, leadBefore: tot(bi) - tot(1 - bi), ...extra });
    used += i.balls; inns.push(i);
    yield { type: "innings", inn: inns.length, result: i, text: `${i.team} ${i.runs}${i.allOut ? "" : "/" + i.wk}${i.declared ? " declared" : ""}. Day ${Math.min(5, Math.floor(used / 540) + 1)}.` };
    return i;
  };
  const result = (winner, text) => ({ winner, text, inns, batFirst: first, draw: winner == null });
  yield* go(first, { declareAt: 560 + Math.floor(r() * 90), declareOvers: 165 });
  if (left() <= 0) return result(null, "Match drawn");
  yield* go(second, { declareAt: inns[0].runs + 250, declareOvers: 165 });
  if (left() <= 0) return result(null, "Match drawn");
  const lead = inns[0].runs - inns[1].runs;
  let enforce = lead >= 200 && left() > 150 * 6;
  if (lead >= 200 && o.interactive && human[first]) {
    const c = yield dec(first, "followon", `You lead by ${lead}. Enforce the follow-on?`,
      [opt("yes", "Enforce", "Make them bat again now"), opt("no", "Bat again", "Extend the lead, rest your bowlers")], enforce ? "yes" : "no");
    enforce = c === "yes";
  }
  if (enforce) {
    yield* go(second, {});
    const need = tot(second) - tot(first) + 1;
    if (need <= 0) return result(first, `${s[first].name} won by an innings and ${-need + 1} runs`);
    if (left() <= 0) return result(null, "Match drawn");
    const last = yield* go(first, { target: need });
    if (last.runs >= need) return result(first, `${s[first].name} won by ${10 - last.wk} wickets after enforcing the follow-on`);
    if (last.allOut) return result(second, `${s[second].name} won by ${need - 1 - last.runs} runs after following on`);
    return result(null, "Match drawn");
  }
  const remOvers = left() / 6;
  const targetLead = clamp(Math.round(remOvers * 3.3 - 90), 180, 480);
  const third = yield* go(first, { declareAt: Math.max(1, targetLead - (tot(first) - tot(second))), declareOvers: Math.max(10, Math.floor(remOvers - Math.max(50, remOvers * 0.45))) });
  if (tot(second) - tot(first) > 0 && third.allOut) return result(second, `${s[second].name} won by an innings and ${tot(second) - tot(first)} runs`);
  if (left() <= 0) return result(null, "Match drawn");
  const need = tot(first) - tot(second) + 1;
  const fourth = yield* go(second, { target: need });
  if (fourth.runs >= need) return result(second, `${s[second].name} won by ${10 - fourth.wk} wickets`);
  if (fourth.allOut) return result(first, `${s[first].name} won by ${need - 1 - fourth.runs} runs`);
  return result(null, "Match drawn");
}

export const matchGen = (r, fmt, A, B, o) => fmt === "test" ? testGen(r, A, B, o) : limitedGen(r, fmt, A, B, o);
// Non-interactive helpers kept for simulations and the campaign's unwatched matches.
export const playLimited = (r, fmt, A, B, { pitch, planA, planB }) => runAuto(limitedGen(r, fmt, A, B, { pitch, plans: [planA, planB] }));
export const playTest = (r, A, B, { pitch, planA, planB }) => runAuto(testGen(r, A, B, { pitch, plans: [planA, planB] }));
