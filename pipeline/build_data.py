"""Build data/ratings.json for CricDraft.
Sources:
  raw/kaggle.txt          Test + ODI per player/team/year totals from the Kaggle scorecard datasets (bhuvaneshprasad, Apache-2.0), 1983–2024
  raw/kaggle_players.txt  object_id|name|batting style|bowling style|country_id for international players
  raw/cricsheet.txt       Cricsheet ball-by-ball totals: Test/ODI 2021+, T20I 2005+, IPL 2008+
  scratchpad player_meta  cricketdata R package: cricsheet_id <-> cricinfo_id, roles, styles, country
Ratings are era-adjusted (each year's league scoring rates) and then ranked within each format (35–99).
"""
import json, math, re, warnings, collections, sys
warnings.filterwarnings("ignore")
import os
RAW = os.path.dirname(os.path.abspath(__file__)) + "/"
META_RDA = RAW + "player_meta.rda"
FULL = {"India", "Australia", "England", "South Africa", "New Zealand", "Pakistan", "Sri Lanka", "West Indies", "Bangladesh", "Afghanistan", "Zimbabwe", "Ireland"}
F = ["m", "i", "r", "rb", "b", "o", "f", "s", "pos", "bb", "br", "w", "st", "w5", "h"]
KAGGLE_LAST = {"test": 2023, "odi": 2023}

def parse_rows(path):
    rows, extra, section = [], [], None
    for line in open(path, encoding="utf8"):
        line = line.rstrip("\n")
        if line.startswith("@@"): section = line[2:]; continue
        if not line: continue
        if section == "ROWS":
            fmt, pid, team, year, vals = line.split("|")
            rows.append((fmt, pid, team, int(year), dict(zip(F, map(float, vals.split(","))))))
        else: extra.append(line.split("|"))
    return rows, extra

krows, kplayers = parse_rows(RAW + "kaggle.txt")      # kplayers: player_id|object_id|name|bat|bowl|country|dob
crows, cnames = parse_rows(RAW + "cricsheet.txt")     # cnames: cricsheet_id|name
kp_by_pid = {p[0]: p for p in kplayers}
kall = {}
for line in open(RAW + "kaggle_players.txt", encoding="utf8"):
    p = line.rstrip("\n").split("|")
    if len(p) >= 5: kall[p[0]] = p                     # object_id -> [obj, name, bat, bowl, country]
csname = {a: b for a, b in cnames}

import rdata
pm = rdata.read_rda(META_RDA)["player_meta"]
pm = pm[pm["cricsheet_id"].notna()].astype(object).where(lambda x: x.notna(), "")
cs_meta = {r["cricsheet_id"]: r for _, r in pm.iterrows()}

# country ids in the Kaggle data (India = 6 etc.) -> names, learned from rows
# ---------- identities ----------
def ident_kaggle(pid):
    p = kp_by_pid.get(pid); return "ci:" + p[1] if p and p[1] else "kg:" + pid
def ident_cs(cid):
    m = cs_meta.get(cid); ci = str(m["cricinfo_id"]).split(".")[0] if m is not None and m["cricinfo_id"] else ""
    return "ci:" + ci if ci else "cs:" + cid

info = {}  # ident -> dict(name, bat, bowl, role, country)
def put(ident, **kw):
    d = info.setdefault(ident, {})
    for k, v in kw.items():
        if v and not d.get(k): d[k] = v
for pid, p in kp_by_pid.items():
    put(ident_kaggle(pid), name=p[2], bat=p[3], bowl=p[4])
for cid in csname:
    ident = ident_cs(cid); m = cs_meta.get(cid)
    obj = ident[3:] if ident.startswith("ci:") else None
    if obj and obj in kall: put(ident, name=kall[obj][1], bat=kall[obj][2], bowl=kall[obj][3])
    if m is not None: put(ident, bat=str(m["batting_style"]), bowl=str(m["bowling_style"]), role=str(m["playing_role"]), country=str(m["country"]))
    put(ident, name=csname[cid])
# roles/countries for Kaggle-only identities via cricinfo id in player_meta
by_ci = {}
for cid, m in cs_meta.items():
    ci = str(m["cricinfo_id"]).split(".")[0]
    if ci: by_ci[ci] = m
for ident in list(info):
    if ident.startswith("ci:") and ident[3:] in by_ci:
        m = by_ci[ident[3:]]; put(ident, role=str(m["playing_role"]), country=str(m["country"]), bat=str(m["batting_style"]), bowl=str(m["bowling_style"]))

def style_of(bowl):
    b = (bowl or "").lower()
    if any(k in b for k in ["break", "orthodox", "googly", "wrist", "spin", "slow", "chinaman"]): return "S"
    if any(k in b for k in ["fast", "medium", "pace"]): return "P"
    return "-"
def meta_code(ident, keeper):
    d = info.get(ident, {}); role = (d.get("role") or "").lower()
    r = "K" if keeper or "wicketkeeper" in role else "O" if "opening" in role else "A" if "allrounder" in role else "W" if "bowler" in role else "B" if ("batter" in role or "batsman" in role) else "-"
    bw = d.get("bowl", ""); arm = "L" if "left" in bw.lower() else "R"; hand = "L" if (d.get("bat") or "").lower().startswith("left") else "R"
    return r + style_of(bw) + arm + hand

# ---------- per-source tables: (fmt, source) -> ident -> year -> totals ; squads ----------
tables = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(lambda: dict.fromkeys(F, 0.0))))
teamyear = collections.defaultdict(lambda: collections.defaultdict(dict))   # (fmt,src) -> (team,year) -> ident -> m
def add(fmt, src, ident, team, year, v):
    t = tables[(fmt, src)][ident][year]
    for k in F: t[k] += v[k]
    teamyear[(fmt, src)][(team, year)][ident] = teamyear[(fmt, src)][(team, year)].get(ident, 0) + v["m"]
for fmt, pid, team, year, v in krows:
    if fmt in KAGGLE_LAST and team in FULL: add(fmt, "kg", ident_kaggle(pid), team, year, v)
for fmt, cid, team, year, v in crows:
    if fmt == "ipl" or team in FULL: add(fmt, "cs", ident_cs(cid), team, year, v)

# ---------- era baselines ----------
def baselines(tab):
    tot = collections.defaultdict(lambda: dict.fromkeys(F, 0.0))
    for ident, ys in tab.items():
        for y, v in ys.items():
            for k in F: tot[y][k] += v[k]
    out = {}
    for y, t in tot.items():
        out[y] = dict(avg=t["r"] / max(1, t["o"]), sr=100 * t["rb"] / max(1, t["b"]), ba=t["br"] / max(1, t["w"]), eco=6 * t["br"] / max(1, t["bb"]))
    return out
BASE = {key: baselines(tab) for key, tab in tables.items()}
def ref(fmt):
    vals = collections.defaultdict(list)
    for (f, src), b in BASE.items():
        if f != fmt: continue
        for y, d in b.items():
            for k, v in d.items(): vals[k].append(v)
    return {k: sorted(v)[len(v) // 2] for k, v in vals.items()}
REF = {f: ref(f) for f in ["test", "odi", "t20", "ipl"]}

P = {  # priors in reference-era units; qualification
    "test": dict(k=3, avg0=20, sr0=48, kb=150, ba0=42, e0=3.4, kbb=300, minBall=600, minOut=6, bpm=12, mainBpm=30),
    "odi": dict(k=3, avg0=22, sr0=75, kb=120, ba0=40, e0=5.6, kbb=180, minBall=360, minOut=6, bpm=6, mainBpm=18),
    "t20": dict(k=3, avg0=18, sr0=115, kb=80, ba0=30, e0=8.4, kbb=90, minBall=150, minOut=5, bpm=3, mainBpm=9),
    "ipl": dict(k=3, avg0=18, sr0=118, kb=80, ba0=30, e0=8.6, kbb=90, minBall=150, minOut=5, bpm=3, mainBpm=9),
}
def bat_val(fmt, avg, sr):
    if fmt == "test": return avg * (sr / 50) ** 0.15
    if fmt == "odi": return avg * (sr / 85) ** 0.9
    return avg ** 0.45 * (sr / 100) ** 1.8
def bowl_val(fmt, ba, eco):
    if fmt == "test": return (1 / ba) * (3.2 / eco) ** 0.25
    if fmt == "odi": return 1 / (ba ** 0.55 * eco)
    return 1 / (ba ** 0.3 * eco ** 1.4)

WIN = [(-2, 0.2), (-1, 0.5), (0, 1.0), (1, 0.5), (2, 0.2)]
MIN_TEAM_M = {"test": 3, "odi": 6, "t20": 5, "ipl": 8}
YEARS = {"test": (1983, 2026), "odi": (1983, 2026), "t20": (2005, 2026), "ipl": (2008, 2026)}
def source_for(fmt, year):
    if fmt in KAGGLE_LAST: return "kg" if year <= KAGGLE_LAST[fmt] else "cs"
    return "cs"

rows = collections.defaultdict(list)  # fmt -> list of rated rows
for fmt in ["test", "odi", "t20", "ipl"]:
    pr = P[fmt]; R = REF[fmt]
    for src in ["kg", "cs"]:
        key = (fmt, src)
        if key not in tables: continue
        tab, base = tables[key], BASE[key]
        for (team, year), members in teamyear[key].items():
            if not (YEARS[fmt][0] <= year <= YEARS[fmt][1]) or source_for(fmt, year) != src: continue
            tm = max(members.values())
            if tm < MIN_TEAM_M[fmt]: continue
            sq = sorted(members.items(), key=lambda x: -x[1])
            sq = [x for x in sq if x[1] >= max(1, round(tm * 0.15))][:18]
            for ident, _ in sq:
                acc = dict.fromkeys(["r", "o_adj", "rb", "b_adj", "br", "w_adj", "bb_adj", "m", "i", "pos", "st", "bb", "o", "w"], 0.0)
                for dy, wt in WIN:
                    y = year + dy; v = tab[ident].get(y)
                    if not v: continue
                    b = base[y]
                    acc["r"] += wt * v["r"]; acc["o"] += wt * v["o"]; acc["o_adj"] += wt * v["o"] * b["avg"] / R["avg"]
                    acc["rb"] += wt * v["rb"]; acc["b_adj"] += wt * v["b"] * b["sr"] / R["sr"]
                    acc["br"] += wt * v["br"]; acc["w"] += wt * v["w"]; acc["w_adj"] += wt * v["w"] * b["ba"] / R["ba"]
                    acc["bb"] += wt * v["bb"]; acc["bb_adj"] += wt * v["bb"] * b["eco"] / R["eco"]
                    for k in ["m", "i", "pos", "st"]: acc[k] += wt * v[k]
                avg = (acc["r"] + pr["k"] * pr["avg0"]) / (acc["o_adj"] + pr["k"])
                sr = 100 * (acc["rb"] + pr["kb"] * pr["sr0"] / 100) / (acc["b_adj"] + pr["kb"])
                ba = (acc["br"] + pr["k"] * pr["ba0"]) / (acc["w_adj"] + pr["k"])
                eco = 6 * (acc["br"] + pr["kbb"] * pr["e0"] / 6) / (acc["bb_adj"] + pr["kbb"])
                rows[fmt].append(dict(team=team, year=year, ident=ident, acc=acc, avg=avg, sr=sr, ba=ba, eco=eco,
                    bv=bat_val(fmt, avg, sr), wv=bowl_val(fmt, ba, eco), bpm=acc["bb"] / max(1, acc["m"]),
                    pos=acc["pos"] / max(1, acc["i"]), qb=acc["o"] >= pr["minOut"], qw=acc["bb"] >= pr["minBall"]))

def pct_fn(vals):
    s = sorted(vals)
    import bisect
    return lambda v: bisect.bisect_left(s, v) / max(1, len(s))
for fmt, rs in rows.items():
    pr = P[fmt]
    fb = pct_fn([r["bv"] for r in rs if r["qb"]]); fw = pct_fn([r["wv"] for r in rs if r["qw"] and r["bpm"] >= pr["mainBpm"]])
    for r in rs:
        r["bat"] = round(35 + 64 * fb(r["bv"]))
        r["bowl"] = round(35 + 64 * fw(r["wv"])) if r["bpm"] >= pr["bpm"] else 0

# ---------- keepers found from catches/stumpings per team-year (Kaggle) ----------
KK = json.load(open(RAW + "kaggle_keepers.json"))
keeper_years = collections.defaultdict(list)   # (ident, team) -> years
for fmt_, lst in KK.items():
    for x in lst:
        pid, team, y = x.split("|"); keeper_years[(ident_kaggle(pid), team)].append(int(y))
def is_keeper(r):
    d = info.get(r["ident"], {})
    if "wicketkeeper" in (d.get("role") or "").lower() or r["acc"]["st"] >= 0.9: return True
    return any(abs(y - r["year"]) <= 3 for y in keeper_years.get((r["ident"], r["team"]), []))

# ---------- output ----------
players, pidx = [], {}
def pi(ident, keeper):
    if ident not in pidx:
        d = info.get(ident, {}); pidx[ident] = len(players)
        players.append([d.get("name") or ident, meta_code(ident, keeper), d.get("name") or ident, ident])
    return pidx[ident]
out = {"players": players, "squads": {}}
for fmt, rs in rows.items():
    S = collections.defaultdict(list)
    for r in rs:
        d = info.get(r["ident"], {})
        keeper = is_keeper(r)
        opener = r["acc"]["i"] >= 3 and r["pos"] <= 2.4
        overseas = fmt == "ipl" and (d.get("country") or "India") != "India"
        S[f"{r['team']} {r['year']}"].append([pi(r["ident"], keeper), r["bat"], r["bowl"], (1 if keeper else 0) | (2 if opener else 0) | (4 if overseas else 0)])
    ok = {}
    for k, l in S.items():
        if any(x[3] & 1 for x in l) and sum(1 for x in l if x[2] > 0) >= 4 and len(l) >= 11: ok[k] = l
    out["squads"][fmt] = dict(sorted(ok.items()))
json.dump(out, open(RAW + "../data/ratings.json", "w"), separators=(",", ":"))
import os
print("players", len(players), {f: len(v) for f, v in out["squads"].items()}, os.path.getsize(RAW + "../data/ratings.json"))
print("REF", {f: {k: round(v, 2) for k, v in REF[f].items()} for f in REF})

def show(fmt, key):
    l = out["squads"][fmt].get(key)
    if not l: print(fmt, key, "missing"); return
    print(fmt, key, sorted([(players[x[0]][0], x[1], x[2], x[3]) for x in l], key=lambda t: -(t[1] + t[2]))[:9])
for fmt, key in [("odi", "West Indies 1984"), ("odi", "India 1983"), ("test", "West Indies 1985"), ("test", "Pakistan 1987"), ("test", "Australia 2001"), ("odi", "Afghanistan 2019"), ("t20", "India 2024"), ("ipl", "Chennai Super Kings 2011"), ("ipl", "Royal Challengers Bangalore 2016"), ("test", "India 2025")]:
    show(fmt, key)
