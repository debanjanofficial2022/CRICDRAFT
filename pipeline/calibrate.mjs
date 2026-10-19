// Fits the engine's skill sensitivity and match-day form so simulated upsets match real ones.
// For every real match between two sides we have squads for, compares how often the stronger side
// (by our team strength) actually won with how often it wins in simulation.
// Usage: node pipeline/calibrate.mjs [fmt] [skill] [form]
import fs from "fs";
import * as E from "../src/engine.js";
const data = JSON.parse(fs.readFileSync(new URL("../data/ratings.json", import.meta.url)));
const lines = fs.readFileSync(new URL("./results.txt", import.meta.url), "utf8").trim().split("\n").map(l => l.split("|"));

const strCache = {};
function side(fmt, key) {
  const k = fmt + "|" + key;
  if (!strCache[k]) { const xi = E.autoXI(E.squad(data, fmt, key), fmt === "ipl" ? 4 : 11); strCache[k] = { name: key, xi, str: E.strength(xi) }; }
  return strCache[k];
}
export function realMatches(fmt) {
  const out = [];
  for (const [f, y, a, b, res] of lines) {
    if (f !== fmt) continue;
    const ka = `${a} ${y}`, kb = `${b} ${y}`;
    if (!data.squads[fmt][ka] || !data.squads[fmt][kb]) continue;
    if (!["1", "2", "D"].includes(res)) continue;
    out.push({ A: side(fmt, ka), B: side(fmt, kb), res });
  }
  return out;
}
// P(stronger side wins), P(draw), by gap bucket
export function summarise(rows) {
  const buckets = [[0, 3], [3, 6], [6, 10], [10, 15], [15, 99]];
  return buckets.map(([lo, hi]) => {
    const r = rows.filter(x => Math.abs(x.gap) >= lo && Math.abs(x.gap) < hi);
    const dec = r.filter(x => x.res !== "D");
    const fav = dec.filter(x => (x.gap >= 0 && x.res === "1") || (x.gap < 0 && x.res === "2")).length;
    return { gap: `${lo}-${hi}`, n: r.length, favWins: dec.length ? +(100 * fav / dec.length).toFixed(1) : null, draws: r.length ? +(100 * (r.length - dec.length) / r.length).toFixed(1) : null };
  });
}
export function simulate(fmt, matches, n, seed) {
  const r = E.rng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = matches[Math.floor(r() * matches.length)];
    const pitch = ["balanced", "flat", "green", "turning", "bouncy"][Math.floor(r() * 5)];
    const res = fmt === "test" ? E.playTest(r, m.A, m.B, { pitch, planA: E.PLANS.balanced, planB: E.PLANS.balanced })
      : E.playLimited(r, fmt, m.A, m.B, { pitch, planA: E.PLANS.balanced, planB: E.PLANS.balanced });
    rows.push({ gap: m.A.str - m.B.str, res: res.winner === 0 ? "1" : res.winner === 1 ? "2" : "D" });
  }
  return rows;
}
const err = (a, b) => a.reduce((s, x, i) => s + (x.favWins == null || b[i].favWins == null ? 0 : (x.favWins - b[i].favWins) ** 2 * Math.min(x.n, 400)), 0);

if (process.argv[1] && process.argv[1].endsWith("calibrate.mjs")) {
  const fmts = process.argv[2] ? [process.argv[2]] : ["t20", "ipl", "odi", "test"];
  for (const fmt of fmts) {
    const ms = realMatches(fmt);
    const real = summarise(ms.map(m => ({ gap: m.A.str - m.B.str, res: m.res })));
    console.log(`\n${fmt}: ${ms.length} real matches`);
    console.log(" real ", JSON.stringify(real));
    const ef = fmt;
    const grid = process.argv[3] ? [[+process.argv[3], +process.argv[4]]] : (fmt === "test" ? [[1, 0], [0.8, 0], [0.7, 4], [0.6, 4], [0.6, 6], [0.5, 6]] : [[E.TUNE.skill[fmt], E.TUNE.form[fmt]]]);
    for (const [k, f] of grid) {
      E.TUNE.skill[ef] = k; E.TUNE.form[ef] = f;
      const sim = summarise(simulate(fmt, ms, fmt === "test" ? 700 : 2500, 7));
      console.log(` skill ${k} form ${f}`.padEnd(20), JSON.stringify(sim.map(x => [x.favWins, x.draws])), "error", Math.round(err(real, sim)));
    }
  }
}
