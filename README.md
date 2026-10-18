# CricDraft

A cricket draft game in the spirit of 7a0. Roll a real side from 1983 to today (for example *West Indies 1984*, *India 2011* or *Chennai Super Kings 2010*), take one of five players it deals you, and repeat until you have an XI. Then try to go unbeaten.

| Format | Campaign | Perfect run |
|---|---|---|
| T20 | T20 World Cup: group, Super 8, semi-final, final (sides from 2007) | 9–0 |
| ODI | ODI World Cup: nine league games, semi-final, final (sides from 1983) | 11–0 |
| Test | World Test Championship: six two-Test series, then the final (sides from 1983) | 13–0 |
| IPL | Full season: fourteen league games and the playoffs, at most four overseas players (seasons from 2008) | 16–0 |

You choose your team mix (batters, all-rounders, spinners, pace bowlers; two openers and a keeper are always in), get three rerolls per draft, pick a game plan, and every match is simulated ball by ball with pitches that suit pace or spin. Daily mode gives everyone with the same format and mix the same rolls and fixtures.

## How players are rated
Each player is rated for the team and year you roll, from his record over a five-year window around that season (weighted towards the season itself). Batting uses average and strike rate; bowling uses average and economy. Every number is first adjusted for how easy runs were that year, so a 1985 opener and a 2023 opener are compared fairly, and the result is ranked against every rated player in that format (35–99). Players who rarely bowl get no bowling rating.

## Data and credits
- Test and ODI scorecards 1983–2023: Kaggle datasets by Bhuvanesh Prasad, *ODI Cricket Matches Dataset (1971–2024)* and *Test Matches Dataset (1877–2023)*, Apache License 2.0.
- Ball-by-ball data for Tests and ODIs from 2024, all T20 internationals and the IPL: [Cricsheet](https://cricsheet.org), Open Data Commons Attribution License.
- Player roles, bowling styles and the Cricsheet–Cricinfo ID map: the `cricketdata` R package (Hyndman et al.).

CricDraft is a fan game. It is not affiliated with the ICC, the BCCI, the IPL, any cricket board or any franchise.

## Building
```
node build.mjs                    # writes dist/site (index.html, app.js, data.js) and dist/cricdraft.html
python3 pipeline/build_data.py    # rebuilds data/ratings.json from the exports in pipeline/ (needs: pip install rdata)
```
`pipeline/*.txt` are per-player, per-team, per-year totals exported from the sources above. Vercel builds the site with `node build.mjs` and serves `dist/site` (see `vercel.json`).
