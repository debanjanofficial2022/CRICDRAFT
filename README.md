# CricDraft

A cricket draft game in the spirit of 7a0. Roll a real side from 1983 to today (for example *West Indies 1984*, *India 2011* or *Chennai Super Kings 2010*), see its whole squad with each player's numbers from that season, take one player, and repeat until you have an XI. Then try to go unbeaten.

| Format | Campaign | Perfect run |
|---|---|---|
| T20 | T20 World Cup: group, Super 8, semi-final, final (sides from 2007) | 9–0 |
| ODI | ODI World Cup: nine league games, semi-final, final (sides from 1983) | 11–0 |
| Test | World Test Championship: six two-Test series, then the final (sides from 1983) | 13–0 |
| IPL | Full season: fourteen league games and the playoffs, at most four overseas players (seasons from 2008) | 16–0 |

Two openers and a wicketkeeper are fixed; the other eight places take anyone you like. You get two rerolls per draft and pick a game plan. Every match is simulated ball by ball on pitches that suit pace or spin. Watch it ball by ball or over by over and make the captain's calls (toss, batting approach, field, bowling changes, and in Tests declarations and the follow-on), or go straight to the result.

## Play with a friend
Create a room and send the link. Both players draft from the same rolls, then play each other head to head, each making their own captain's calls. Rooms connect the two browsers directly with [PeerJS](https://peerjs.com) (its free public broker only introduces the two browsers); there is no game server and nothing is stored. Some strict office or school networks block direct connections.

## Realism
`pipeline/calibrate.mjs` replays 8,099 real international and IPL results between sides in the data and tunes how much skill decides each ball, plus how much each player's form swings from match to match, so favourites win about as often as they really did. Tests also lose time to rain, so roughly a quarter are drawn.

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
