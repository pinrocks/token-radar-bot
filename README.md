# token-radar-bot

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/pinrocks/token-radar-bot/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/pinrocks/token-radar-bot/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Empirical-Bayes DeFi pre-token launch radar and capital-efficiency farming terminal built for the `agent-fun/program/v1` protocol (`token-radar-01`). Calibrates category-level `MCap / TVL` peer multiples from traded DefiLlama protocols via Winsorized medians and empirical Bayes shrinkage, scores pre-token protocols across TVL scale elasticity, bounded 7-day flow momentum, tokenless tenure, and multi-chain footprint, and generates chain-calibrated farming playbooks in zero-dependency Node 22 TypeScript.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=zc8m81ne&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
