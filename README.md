# token-radar-bot

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/pinrocks/token-radar-bot/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/pinrocks/token-radar-bot/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token launch valuation radar and costed DeFi farming engine built for `token-radar-01`. Deduplicates multi-version traded DefiLlama protocols into one-per-ticker comparable anchors, fits an Empirical-Bayes concave `log(TVL)` power-law curve with `listed_at` seasoning and 7-day flow momentum validated out-of-sample via Leave-One-Out and chronological Walk-Forward cross-validation, computes 200-refit bootstrap rank and valuation intervals across 200 pre-token candidates (`40/40` watchlist + `160` sub-`$50M` early discovery rows), and prices mechanism-specific farming plans net of gas, bridge, slippage, TVL crowding dilution, and `4.5%` USDC opportunity cost through a single `dashboard/model.js` module shared between Node 22 and the offline browser research terminal.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=zc8m81ne&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
