# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ahkamq321-glitch/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ahkamq321-glitch/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that reads a sealed DefiLlama snapshot, finds the protocols that have no token yet, and ranks them by implied launch value — so you can see which launches are worth farming before they happen.

## What it does
- Scans 758 protocols and keeps the tokenless ones, leaving out wrapped, staked, bridge, exchange, and versioned products of protocols that already trade.
- Ranks them by implied launch value: the 40 strongest form the watchlist, with 158 more early names behind them.
- Gives every protocol a six-step farm plan, so each row tells you exactly what to do to be positioned if the token launches.
- Shows the board, a per-protocol detail view, and a filtered view in a static dashboard that needs no network.

## How the ranking works
Implied value = TVL × benchmark × growth × maturity × breadth, where the benchmark is the median market-cap-to-TVL ratio, 0.2138, measured across the 128 protocols in the snapshot itself that already have a live token.

## The board
`board.json` holds 198 rows — 40 watchlist + 158 early. Top three: Steakhouse Financial $511.4M, Sentora Curator $482.4M, Gauntlet $304.6M.

## Running it
node main.ts --input <snapshot|dir> — without --input the program stops with "no snapshot at /input/snapshot.json".

## What is in this repo
- `main.ts` scores every protocol and writes `board.json` and `dossier.json`; `lib/model.ts` is the scoring model; `dashboard/` is the static board page; `screenshots/` holds three views; `vendor/makefun-board.ts` (unchanged from the kit) produces `dossier.json`.

Built for make.fun's ["token launch radar"](https://make.fun/bounty/token-radar-01) bounty.

---
Built with [make.fun](https://make.fun) · Referral code: `3qxkam06`
