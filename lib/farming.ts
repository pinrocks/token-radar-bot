// Domain-specific DeFi points and pre-TGE farming playbook generator.
// Self-contained leaf module (Node 22 stdlib/strip-types compatible, zero external imports).

export interface ProtoInput {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface ValuationMetrics {
  impliedValueUsd: number;
  estPoolUsd: number;
  airdropPct: number;
  yieldPer1kTvl: number;
  ageDays: number | null;
  isWatchlist: boolean;
  confidenceTier: 'High' | 'Medium' | 'Early';
  categoryMultiple: number;
  scaleFactor: number;
  growthFactor: number;
  tenureFactor: number;
  chainFactor: number;
}

export interface FarmPlan {
  steps: string[];
  minCapitalUsd: number;
  estGasUsd: string;
  durationDays: number;
  cadence: string;
  riskNote: string;
}

interface ChainGasProfile {
  tier: 'eth_l1' | 'evm_l2' | 'parallel_fast' | 'btc_alt' | 'evm_side';
  primary: string;
  altLowFee: string | null;
  txGasRange: string;
  txGasMidUsd: number;
  cadenceLabel: string;
  weeklyMinutes: number;
  weeklyTxCount: number;
  gasReserveHint: string;
}

const EVM_L2_CHAINS = new Set([
  'arbitrum', 'base', 'optimism', 'polygon', 'blast', 'scroll', 'linea', 'mantle',
  'ink', 'unichain', 'starknet', 'zksync era', 'morph', 'rise', 'manta', 'katana',
  'world chain', 'x layer', 'immutable zkevm', 'silicon zkevm', 'zklighter',
  'reya network', 'robinhood chain', 'fluent', 'metis', 'mode', 'taiko', 'bob',
]);

const PARALLEL_FAST_CHAINS = new Set([
  'solana', 'sui', 'aptos', 'sei', 'monad', 'hyperliquid l1', 'sonic', 'algorand',
  'stellar', 'ripple', 'noble', 'near', 'injective', 'osmosis', 'dydx', 'cosmos',
  'provenance', 'hedera', 'icp', 'xion', 'zigchain', 'waves', 'eos', 'proton',
]);

const BTC_ALT_CHAINS = new Set([
  'bitcoin', 'stacks', 'tron', 'ton', 'bsquared', 'mezo', 'merlin', 'hemi', 'core',
  'rsk', 'babylon genesis', 'bittensor', 'thorchain', 'chainflip', 'filecoin',
  'litecoin', 'doge', 'mixin',
]);

function fmtUsd(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `$${v.toLocaleString('en-US')}`;
}

function fmtCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function findAltLowFeeChain(chains: string[]): string | null {
  for (let i = 1; i < chains.length; i++) {
    const raw = chains[i];
    if (!raw) continue;
    const key = raw.trim().toLowerCase();
    if (EVM_L2_CHAINS.has(key) || PARALLEL_FAST_CHAINS.has(key)) return raw;
  }
  return chains.length > 1 && chains[1] && chains[1].toLowerCase() !== 'ethereum' ? chains[1] : null;
}

export function resolveChainProfile(chains: string[]): ChainGasProfile {
  const primary = chains.length > 0 && chains[0] ? chains[0].trim() : 'Ethereum';
  const key = primary.toLowerCase();
  const altLowFee = findAltLowFeeChain(chains);

  if (key === 'ethereum') {
    return {
      tier: 'eth_l1',
      primary,
      altLowFee,
      txGasRange: '$6-$18/tx',
      txGasMidUsd: 10.5,
      cadenceLabel: '1x/wk batch (~15 min/wk)',
      weeklyMinutes: 15,
      weeklyTxCount: 1,
      gasReserveHint: '0.015 ETH',
    };
  }
  if (EVM_L2_CHAINS.has(key)) {
    return {
      tier: 'evm_l2',
      primary,
      altLowFee: null,
      txGasRange: '$0.05-$0.35/tx',
      txGasMidUsd: 0.16,
      cadenceLabel: '2x/wk active (~12 min/wk)',
      weeklyMinutes: 12,
      weeklyTxCount: 2,
      gasReserveHint: '$5 of native L2 gas',
    };
  }
  if (PARALLEL_FAST_CHAINS.has(key)) {
    return {
      tier: 'parallel_fast',
      primary,
      altLowFee: null,
      txGasRange: '$0.01-$0.05/tx',
      txGasMidUsd: 0.025,
      cadenceLabel: '3x/wk active (~15 min/wk)',
      weeklyMinutes: 15,
      weeklyTxCount: 3,
      gasReserveHint: '$3 of native gas',
    };
  }
  if (BTC_ALT_CHAINS.has(key)) {
    return {
      tier: 'btc_alt',
      primary,
      altLowFee,
      txGasRange: '$0.40-$3.00/tx',
      txGasMidUsd: 1.35,
      cadenceLabel: '1x/wk checkpoint (~15 min/wk)',
      weeklyMinutes: 15,
      weeklyTxCount: 1,
      gasReserveHint: '$12 of native network fee buffer',
    };
  }
  return {
    tier: 'evm_side',
    primary,
    altLowFee: null,
    txGasRange: '$0.05-$0.30/tx',
    txGasMidUsd: 0.14,
    cadenceLabel: '2x/wk active (~12 min/wk)',
    weeklyMinutes: 12,
    weeklyTxCount: 2,
    gasReserveHint: '$5 of native gas',
  };
}

interface ChainAssetTerms {
  cashAsset: string;
  yieldAsset: string;
  stakeAsset: string;
  vaultStandard: string;
  gasReserve: string;
}

function resolveChainAssets(primary: string, tier: ChainGasProfile['tier']): ChainAssetTerms {
  const k = primary.toLowerCase();
  if (k === 'bitcoin' || k === 'bsquared' || k === 'mezo' || k === 'merlin' || k === 'babylon genesis' || k === 'hemi') {
    return { cashAsset: 'BTC / wBTC', yieldAsset: 'BTC collateral', stakeAsset: 'BTC', vaultStandard: 'native BTC vault', gasReserve: '$12 in BTC fee UTXOs' };
  }
  if (k === 'bittensor') {
    return { cashAsset: 'TAO', yieldAsset: 'TAO / dTAO alpha', stakeAsset: 'TAO', vaultStandard: 'subnet liquidity pool', gasReserve: '0.05 TAO extrinsic buffer' };
  }
  if (k === 'tron') {
    return { cashAsset: 'USDT / USDD', yieldAsset: 'USDT or TRX', stakeAsset: 'TRX', vaultStandard: 'TRC-20 vault', gasReserve: '100 TRX staked for Energy' };
  }
  if (k === 'ripple') {
    return { cashAsset: 'RLUSD / XRP', yieldAsset: 'XRP or RLUSD', stakeAsset: 'XRP', vaultStandard: 'XRPL custody/escrow vault', gasReserve: '15 XRP reserve + fees' };
  }
  if (k === 'stellar') {
    return { cashAsset: 'USDC', yieldAsset: 'USDC or XLM', stakeAsset: 'XLM', vaultStandard: 'Soroban vault', gasReserve: '10 XLM fee reserve' };
  }
  if (k === 'algorand') {
    return { cashAsset: 'USDCa', yieldAsset: 'USDCa or ALGO', stakeAsset: 'ALGO', vaultStandard: 'Algorand app pool', gasReserve: '5 ALGO opt-in + fee buffer' };
  }
  if (k === 'solana') {
    return { cashAsset: 'USDC', yieldAsset: 'USDC or JitoSOL/SOL', stakeAsset: 'SOL', vaultStandard: 'SPL program vault', gasReserve: '0.05 SOL rent + priority fees' };
  }
  if (k === 'sui' || k === 'aptos' || k === 'sei') {
    const sym = k.toUpperCase();
    return { cashAsset: 'USDC', yieldAsset: `USDC or liquid ${sym}`, stakeAsset: sym, vaultStandard: 'Move module vault', gasReserve: `$3 in ${sym} gas` };
  }
  if (k === 'ton') {
    return { cashAsset: 'USDT', yieldAsset: 'USDT or TON', stakeAsset: 'TON', vaultStandard: 'Jetton vault', gasReserve: '2 TON storage + gas buffer' };
  }
  if (k === 'stacks') {
    return { cashAsset: 'sBTC / USDC', yieldAsset: 'sBTC or STX', stakeAsset: 'STX', vaultStandard: 'Clarity vault', gasReserve: '5 STX gas buffer' };
  }
  if (tier === 'eth_l1') {
    return { cashAsset: 'USDC', yieldAsset: 'USDC or WETH/wstETH', stakeAsset: 'ETH / wstETH', vaultStandard: 'ERC-4626 vault', gasReserve: '0.015 ETH gas buffer' };
  }
  return { cashAsset: 'USDC', yieldAsset: 'USDC or WETH', stakeAsset: 'native staking asset', vaultStandard: 'ERC-4626 vault', gasReserve: '$5 in native gas' };
}

export function calibrateMinCapital(proto: ProtoInput, metrics: ValuationMetrics, chain: ChainGasProfile): number {
  const tvl = Number.isFinite(proto.tvl_usd) ? Math.max(0, proto.tvl_usd) : 10_000_000;
  const estPool = Number.isFinite(metrics?.estPoolUsd) ? Math.max(0, metrics.estPoolUsd) : tvl * 0.02;
  const yieldPer1k = Number.isFinite(metrics?.yieldPer1kTvl) ? metrics.yieldPer1kTvl : 25;

  let base = 400;
  if (tvl >= 1_500_000_000) base = 2_200;
  else if (tvl >= 500_000_000) base = 1_600;
  else if (tvl >= 150_000_000) base = 1_100;
  else if (tvl >= 50_000_000) base = 750;
  else if (tvl >= 15_000_000) base = 450;
  else base = 300;

  // Scale ticket modestly when estimated airdrop reward pool exceeds $25M, or trim on micro-pools (<$600K).
  if (estPool >= 25_000_000) base = Math.round(base * 1.1);
  else if (estPool > 0 && estPool < 600_000) base = Math.round(base * 0.85);

  // High implied reward density per $1k TVL lets smaller tickets capture meaningful share; diluted mega-pools need larger tickets.
  if (yieldPer1k >= 80) base = Math.round(base * 0.88);
  else if (yieldPer1k > 0 && yieldPer1k < 18) base = Math.round(base * 1.12);

  // Keep round-trip gas drag below ~2.5% of principal on Ethereum L1 and UTXO/alt networks.
  if (chain.tier === 'eth_l1') base = Math.max(base, 1_200);
  else if (chain.tier === 'btc_alt') base = Math.max(base, 500);

  const clamped = Math.min(2_500, Math.max(250, base));
  return Math.round(clamped / 50) * 50;
}

export function calibrateDurationDays(proto: ProtoInput, metrics: ValuationMetrics): number {
  const age = metrics?.ageDays ?? null;
  const chg = typeof proto.change_7d === 'number' && Number.isFinite(proto.change_7d) ? proto.change_7d : 0;
  const cat = (proto.category ?? '').toLowerCase();

  let days = 45;
  if (age !== null) {
    if (age < 120) days = 60;
    else if (age < 300) days = 45;
    else if (age < 540) days = 35;
    else days = 30;
  }
  if (chg >= 12) days = Math.min(60, days + 7);
  if (cat.includes('restak') || cat.includes('rwa') || cat.includes('collateral') || cat.includes('staking pool')) {
    days = Math.min(65, days + 10);
  }
  return days;
}

function estimateTotalGasText(chain: ChainGasProfile, durationDays: number): string {
  const weeks = Math.max(4, Math.round(durationDays / 7));
  // On high-fee L1/UTXO chains, weekly checkpoints are off-chain reads and on-chain txs are batched (approve + deposit + 1 rebalance + exit).
  const totalTxs =
    chain.tier === 'eth_l1' ? 4 :
    chain.tier === 'btc_alt' ? 4 + Math.floor(weeks / 3) :
    3 + weeks * chain.weeklyTxCount;
  const lowPerTx =
    chain.tier === 'eth_l1' ? 6 :
    chain.tier === 'btc_alt' ? 0.4 :
    chain.tier === 'evm_l2' ? 0.05 :
    chain.tier === 'parallel_fast' ? 0.01 : 0.05;
  const highPerTx =
    chain.tier === 'eth_l1' ? 18 :
    chain.tier === 'btc_alt' ? 3.0 :
    chain.tier === 'evm_l2' ? 0.35 :
    chain.tier === 'parallel_fast' ? 0.05 : 0.30;

  const estLow = totalTxs * lowPerTx;
  const estHigh = totalTxs * highPerTx;
  const fmtBound = (v: number): string => (v >= 10 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);
  return `${fmtBound(estLow)}-${fmtBound(estHigh)} (${chain.txGasRange})`;
}

function sanitizeStep(raw: string): string {
  let clean = raw.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/has no token/gi, 'records no token in DefiLlama snapshot');
  if (clean.length > 338) {
    const cut = clean.slice(0, 334);
    const sp = cut.lastIndexOf(' ');
    clean = `${(sp > 260 ? cut.slice(0, sp) : cut).replace(/[.,;:\s]+$/, '')}.`;
  }
  if (clean.length < 48) {
    clean = `${clean} Track position snapshots weekly via official protocol docs.`;
  }
  return clean;
}

export function buildFarmPlan(proto: ProtoInput, metrics: ValuationMetrics): FarmPlan {
  const chain = resolveChainProfile(proto.chains ?? []);
  const assets = resolveChainAssets(chain.primary, chain.tier);
  const minCapitalUsd = calibrateMinCapital(proto, metrics, chain);
  const durationDays = calibrateDurationDays(proto, metrics);
  const estGasUsd = estimateTotalGasText(chain, durationDays);
  const catRaw = proto.category ?? 'DeFi';
  const cat = catRaw.toLowerCase();
  const capStr = fmtUsd(minCapitalUsd);
  const halfCapStr = fmtUsd(Math.round(minCapitalUsd / 2));
  const tvlStr = fmtCompactUsd(proto.tvl_usd);
  const poolStr = fmtCompactUsd(metrics?.estPoolUsd ?? proto.tvl_usd * 0.02);
  const altNote =
    chain.tier === 'eth_l1' && chain.altLowFee
      ? ` or bridge via ${chain.altLowFee} ($0.03-$0.25/tx) where points parity applies`
      : '';

  const step1 =
    `Fund a segregated farm wallet on ${chain.primary} with ${capStr} in ${assets.cashAsset} plus ${assets.gasReserve}${altNote} ` +
    `to keep approval and entry fees bounded (gas: ${chain.txGasRange}; setup: 15 min).`;

  let step2 = '';
  let step3 = '';
  let riskSpecific = 'smart-contract and liquidity concentration risk';

  if (cat.includes('risk curator') || cat.includes('capital allocator')) {
    step2 =
      `Supply ${capStr} of ${assets.yieldAsset} into ${proto.name}'s highest-liquidity curated ${assets.vaultStandard} on ${chain.primary} ` +
      `(${tvlStr} TVL) to stack curator points alongside base money-market yield (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Audit underlying collateral market caps, curator queue reallocations, and utilization (<92%) on a ${chain.cadenceLabel} ` +
      `schedule without looping receipt shares into illiquid secondary pools (cost: ${chain.txGasRange}).`;
    riskSpecific = 'underlying borrower market bad-debt caps and high-utilization withdrawal queues';
  } else if (cat.includes('dex') || cat.includes('liquidity manager')) {
    step2 =
      `Execute one organic native swap on ${proto.name}, then supply ${halfCapStr} + ${halfCapStr} (${assets.yieldAsset}) into its deepest ` +
      `core pool on ${chain.primary} (${tvlStr} TVL) for trader + LP fee-tier points (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Rebalance active LP tick bounds and log organic swap volume on a ${chain.cadenceLabel} schedule so fee APR offsets ` +
      `impermanent loss while building multi-week activity streaks (cost: ${chain.txGasRange}).`;
    riskSpecific = 'impermanent loss on volatile pairs and tick-out-of-range fee decay';
  } else if (cat.includes('lend')) {
    step2 =
      `Supply ${capStr} of ${assets.yieldAsset} into ${proto.name}'s core ${chain.primary} lending market (${tvlStr} TVL) ` +
      `and borrow <=35% LTV ${assets.cashAsset} to maintain health factor >=1.85 (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Maintain both supply and borrow legs on a ${chain.cadenceLabel} checkpoint, recycling borrowed ${assets.cashAsset} conservatively ` +
      `without recursive >2x leverage loops that spike liquidation risk (cost: ${chain.txGasRange}).`;
    riskSpecific = 'utilization-rate borrow APR spikes and oracle liquidation cascades';
  } else if (cat.includes('interest rate')) {
    step2 =
      `Split ${capStr} of ${assets.cashAsset} on ${proto.name} (${chain.primary}, ${tvlStr} TVL) into 80% fixed-rate PT/LP liquidity ` +
      `and 20% capped YT/rate-swap exposure to capture yield-trading multipliers (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Monitor implied versus underlying floating APR decay and roll maturities >=7 days before expiry on a ${chain.cadenceLabel} ` +
      `schedule so YT time-decay never erodes base principal (cost: ${chain.txGasRange}).`;
    riskSpecific = 'YT theta time-decay toward maturity and implied-yield compression';
  } else if (cat.includes('derivative') || cat.includes('perp') || cat.includes('synthet')) {
    step2 =
      `Deposit ${capStr} ${assets.cashAsset} margin on ${proto.name} (${chain.primary}) and open delta-neutral maker limit positions ` +
      `at <=2.5x leverage paired against spot or opposing funding legs (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Rotate resting limit orders and monitor open-interest duration on a ${chain.cadenceLabel} cadence, avoiding market-order ` +
      `wash churn so taker fees stay under 1.0% of principal across the epoch (cost: ${chain.txGasRange}).`;
    riskSpecific = 'adverse funding-rate flips and auto-deleveraging during volatility spikes';
  } else if (cat.includes('cdp') || cat.includes('stablecoin') || cat.includes('algo-stable') || cat.includes('reserve currency')) {
    step2 =
      `Lock ${capStr} of ${assets.yieldAsset} in ${proto.name} on ${chain.primary} at >=190% collateralization (or 1:1 PSM mint ` +
      `for wrappers) and stake minted stablecoins in its native savings/stability pool (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Audit collateral ratio and secondary DEX peg depth (${tvlStr} protocol TVL) on a ${chain.cadenceLabel} schedule, ` +
      `compounding stability rewards only when net yield exceeds gas (cost: ${chain.txGasRange}).`;
    riskSpecific = 'secondary-market stablecoin depeg (>0.5%) and collateral liquidation thresholds';
  } else if (cat.includes('basis trading')) {
    step2 =
      `Mint or deposit ${capStr} ${assets.cashAsset} into ${proto.name}'s delta-neutral basis pool on ${chain.primary} (${tvlStr} TVL), ` +
      `splitting 70% staked yield shares and 30% liquid receipt points tranche (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Monitor perp funding-rate spreads on a ${chain.cadenceLabel} schedule and pre-queue 7-day cooldown unstaking if 3-day ` +
      `average funding turns negative against reserve buffer (cost: ${chain.txGasRange}).`;
    riskSpecific = 'sustained negative perp funding inversions and 7-day unstaking cooldowns';
  } else if (cat.includes('rwa') || cat.includes('cedefi')) {
    step2 =
      `Confirm onboarding/whitelist terms on ${proto.name}, subscribe ${capStr} of ${assets.cashAsset} into its ${chain.primary} ${catRaw} ` +
      `NAV vault (${tvlStr} TVL), and hold receipt shares in self-custody (gas: ${chain.txGasRange}; time: 20 min).`;
    step3 =
      `Track NAV accrual versus secondary DEX exit liquidity and T+1 to T+7 redemption windows on a ${chain.cadenceLabel} ` +
      `schedule before adding size toward the ~${poolStr} est. pool (cost: ${chain.txGasRange}).`;
    riskSpecific = 'T+1 to T+7 NAV settlement queues and offchain custodian counterparty terms';
  } else if (cat.includes('leveraged farm')) {
    step2 =
      `Open a conservative <=1.6x leveraged correlated farm position with ${capStr} ${assets.yieldAsset} equity on ${proto.name} ` +
      `(${chain.primary}, ${tvlStr} TVL) keeping debt ratio well below liquidation (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Check borrow APR versus LP/points yield spread on a ${chain.cadenceLabel} schedule and deleverage promptly if debt ` +
      `utilization pushes net carry negative (cost: ${chain.txGasRange}).`;
    riskSpecific = 'borrow-rate spikes above LP yield and leveraged collateral drawdowns';
  } else if (cat.includes('yield') || cat.includes('farm')) {
    step2 =
      `Deposit ${capStr} of ${assets.yieldAsset} into ${proto.name}'s senior non-leveraged ${assets.vaultStandard} or PT/LP pool on ` +
      `${chain.primary} (${tvlStr} TVL) to accrue continuous epoch points (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Inspect underlying strategy adapter weights and harvest/roll maturities on a ${chain.cadenceLabel} cadence only when ` +
      `accrued rewards exceed 10x single-tx gas (cost: ${chain.txGasRange}).`;
    riskSpecific = 'downstream strategy adapter smart-contract risk and maturity roll slippage';
  } else if (cat.includes('option')) {
    step2 =
      `Allocate ${capStr} ${assets.cashAsset} into ${proto.name}'s conservative delta-hedged or low-delta (<=0.15) epoch vault on ` +
      `${chain.primary} ahead of weekly strike selection (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Roll settled vault shares across 4+ consecutive expiry epochs on a ${chain.cadenceLabel} cadence, queuing standard ` +
      `withdrawals prior to expiry cutoff when implied volatility compresses (cost: ${chain.txGasRange}).`;
    riskSpecific = 'short-gamma tail moves across sharp spot breakouts and epoch lock cutoffs';
  } else if (cat.includes('prediction')) {
    step2 =
      `Fund ${capStr} ${assets.cashAsset} on ${proto.name} (${chain.primary}) and post resting maker limit liquidity near mid-odds ` +
      `on unambiguous 30-60 day markets to earn maker + open-interest points (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Re-center unfilled limit spreads and hedge directional fills on a ${chain.cadenceLabel} cadence so capital turns over ` +
      `organically without binary all-or-nothing drawdowns (cost: ${chain.txGasRange}).`;
    riskSpecific = 'oracle resolution disputes and binary tail loss on unhedged outcome inventory';
  } else if (cat.includes('bridge') || cat.includes('cross chain')) {
    step2 =
      `Deposit ${capStr} ${assets.yieldAsset} into ${proto.name}'s canonical solver/LP pool on ${chain.primary} (${tvlStr} TVL) to earn ` +
      `time-weighted liquidity points rather than paying mercenary bridge fees (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Route scheduled organic cross-chain transfers across 2-3 supported chains on a ${chain.cadenceLabel} cadence to qualify ` +
      `for both LP retention and multi-chain bridge volume tiers (cost: ${chain.txGasRange}).`;
    riskSpecific = 'cross-chain message verification delays and relayer pool imbalance slippage';
  } else if (cat.includes('restak') || cat.includes('staking') || cat.includes('btc') || cat.includes('collateral market') || cat.includes('collateral management')) {
    step2 =
      `Delegate ${capStr} of ${assets.stakeAsset} collateral into ${proto.name}'s capped vault/operator pool on ${chain.primary} ` +
      `(${tvlStr} TVL) and retain receipt shares for stacked security + points yield (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Verify operator/vault cap headroom and slashing parameters on a ${chain.cadenceLabel} schedule, accounting for 7-14 day ` +
      `unbonding queues well ahead of liquidity needs (cost: ${chain.txGasRange}).`;
    riskSpecific = '7-14 day unbonding illiquidity, receipt token DEX discount, and operator slashing';
  } else if (cat === 'chain') {
    step2 =
      `Bridge ${capStr} of ${assets.cashAsset} onto ${proto.name} (${chain.primary}, ${tvlStr} TVL) and split across ` +
      `its flagship native money market and primary DEX LP to register ecosystem TVL (gas: ${chain.txGasRange}; time: 20 min).`;
    step3 =
      `Interact with >=3 distinct verified contracts on ${chain.primary} on a ${chain.cadenceLabel} schedule across 4+ calendar ` +
      `weeks to clear multi-month active-user anti-Sybil filters (cost: ${chain.txGasRange}).`;
    riskSpecific = 'canonical bridge exit delays and early ecosystem dApp smart-contract risk';
  } else if (cat.includes('insurance')) {
    step2 =
      `Underwrite ${capStr} ${assets.cashAsset} into ${proto.name}'s diversified senior cover pool on ${chain.primary} ` +
      `(${tvlStr} TVL) with capped per-protocol payout exposure (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Review active cover utilization, claim assessment queues, and lockup expiry dates on a ${chain.cadenceLabel} cadence ` +
      `while accruing underwriting premium + points (cost: ${chain.txGasRange}).`;
    riskSpecific = 'covered-event payout drawdowns and underwriting capital assessment lockups';
  } else if (cat.includes('governance') || cat.includes('locker')) {
    step2 =
      `Deposit ${capStr} of ${assets.yieldAsset} into ${proto.name} on ${chain.primary} (${tvlStr} TVL) using the shortest ` +
      `flexible or 4-8 week epoch lock tier rather than multi-year max locks (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Cast gauge/incentive votes every epoch on a ${chain.cadenceLabel} schedule to capture active voter multipliers and ` +
      `incentive distributions toward the ~${poolStr} est. pool (cost: ${chain.txGasRange}).`;
    riskSpecific = 'hard epoch lockup illiquidity and wrapper discount prior to unlock';
  } else if (cat.includes('launchpad') || cat.includes('payment') || cat.includes('card') || cat.includes('otc')) {
    step2 =
      `Commit ${capStr} ${assets.cashAsset} float into ${proto.name}'s ${chain.primary} channel/settlement pool (${tvlStr} TVL) ` +
      `and complete one verified routing or epoch allocation registration (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Maintain active settlement/routing participation on a ${chain.cadenceLabel} schedule across distinct calendar weeks ` +
      `to build non-Sybil usage history toward the ~${poolStr} est. reward pool (cost: ${chain.txGasRange}).`;
    riskSpecific = 'allocation lockups, channel/escrow liquidity tie-up, and settlement terms';
  } else if (cat.includes('index') || cat.includes('privacy') || cat.includes('ai') || cat.includes('dor')) {
    step2 =
      `Mint or stake ${capStr} of ${assets.yieldAsset} in ${proto.name}'s primary ${catRaw} pool on ${chain.primary} ` +
      `(${tvlStr} TVL) using compliant self-custody addresses to accrue epoch share (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Verify basket/pool nav tracking, relayer fees, and epoch checkpoints on a ${chain.cadenceLabel} schedule while targeting ` +
      `the ~${poolStr} est. reward pool without over-trading (cost: ${chain.txGasRange}).`;
    riskSpecific = `underlying ${catRaw.toLowerCase()} smart-contract risk and redemption spread slippage`;
  } else {
    step2 =
      `Deposit ${capStr} of ${assets.yieldAsset} into ${proto.name}'s flagship ${catRaw} ${assets.vaultStandard} on ${chain.primary} ` +
      `(${tvlStr} TVL) and hold shares continuously toward the ~${poolStr} est. pool (gas: ${chain.txGasRange}; time: 15 min).`;
    step3 =
      `Review pool utilization, cap headroom, and 7d TVL momentum (${(proto.change_7d ?? 0).toFixed(1)}%) on a ${chain.cadenceLabel} ` +
      `schedule, batching actions so total gas stays within ${estGasUsd.split(' ')[0]} (cost: ${chain.txGasRange}).`;
    riskSpecific = `underlying ${catRaw.toLowerCase()} contract concentration and withdrawal cap limits`;
  }

  const step4 =
    `Retain principal for >=${durationDays} days across multiple bi-weekly snapshot windows while capping ${proto.name} ` +
    `at <=15% of total farm portfolio to bound ${riskSpecific} (lock: ${durationDays}d; review: 5 min/wk).`;

  const step5 =
    `Because ${proto.name} records no token in DefiLlama snapshot, verify points/receipt balances strictly via official docs, ` +
    `revoke idle contract approvals or session permissions after exit, and skip unverified claim links (cost: $0-$2; time: 10 min).`;

  const steps = [step1, step2, step3, step4, step5].map(sanitizeStep);

  const chg = proto.change_7d;
  const trendNote =
    typeof chg === 'number' && chg <= -10
      ? ` Watch recent 7d TVL outflow (${chg.toFixed(1)}%) before scaling.`
      : typeof chg === 'number' && chg >= 15
        ? ` Fast 7d TVL inflow (+${chg.toFixed(1)}%) may dilute per-dollar points.`
        : '';

  const riskNote =
    `Cap exposure at <=15% of farm wallet (${capStr} target); primary exposure is ${riskSpecific} on ${chain.primary}.${trendNote}`;

  return {
    steps,
    minCapitalUsd,
    estGasUsd,
    durationDays,
    cadence: chain.cadenceLabel,
    riskNote,
  };
}
