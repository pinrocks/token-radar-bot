// Empirical-Bayes pre-token launch valuation model for token-radar-01.
// Derives category MCap/TVL multiples from traded protocols in the sealed DefiLlama snapshot,
// filters genuine pre-token candidates (protocols whose entry records no token in DefiLlama snapshot),
// and computes deterministic implied launch valuations and capital-efficiency metrics.

import { buildFarmPlan, type FarmPlan, type ValuationMetrics } from './farming.ts';

export interface SnapshotProtocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface CategoryCalibration {
  category: string;
  sample_count: number;
  raw_median_multiple: number;
  winsorized_median_multiple: number;
  p25_multiple: number;
  p75_multiple: number;
  empirical_weight: number;
  shrunk_multiple: number;
  total_peer_tvl_usd: number;
  total_peer_mcap_usd: number;
}

export interface TradedPeerRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_multiple: number;
  winsorized_multiple: number;
  change_7d: number | null;
  listed_at: string | null;
}

export interface WaterfallBreakdown {
  tvl_usd: number;
  category_multiple: number;
  category_base_usd: number;
  scale_factor: number;
  after_scale_usd: number;
  growth_factor: number;
  after_growth_usd: number;
  tenure_factor: number;
  after_tenure_usd: number;
  chain_factor: number;
  implied_value_usd: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  tenure_days: number | null;
  is_watchlist: boolean;
  tier: 'watchlist' | 'early';
  token_record_note: string;
  implied_value_usd: number;
  est_pool_usd: number;
  airdrop_pct: number;
  yield_per_1k_tvl: number;
  confidence_tier: 'High' | 'Medium' | 'Early';
  waterfall: WaterfallBreakdown;
  farm_steps: string[];
}

export interface PeerCompBrief {
  slug: string;
  name: string;
  symbol: string | null;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_multiple: number;
}

export interface RadarCandidateRow extends BoardRow {
  category_label: string;
  primary_chain: string;
  chain_count: number;
  category_multiple: number;
  effective_multiple: number;
  peer_sample_count: number;
  peer_match_mode: 'category' | 'blended_prior' | 'global_prior';
  peer_comp_slugs: string[];
  peer_comps: PeerCompBrief[];
  category_p25_multiple: number;
  category_p75_multiple: number;
  farm_plan: FarmPlan;
}

export interface ModelSpec {
  version: string;
  shrinkage_space: 'log-geometric';
  prior_strength_k: number;
  winsor_low_quantile: number;
  winsor_high_quantile: number;
  winsor_floor_multiple: number;
  winsor_cap_multiple: number;
  global_raw_median_multiple: number;
  global_winsorized_median_multiple: number;
  global_p25_multiple: number;
  global_p75_multiple: number;
  scale_pivot_usd: number;
  scale_exponent: number;
  scale_bounds: [number, number];
  growth_scale_pct: number;
  growth_max_swing: number;
  tenure_half_life_days: number;
  unknown_tenure_days: number;
  tenure_bounds: [number, number];
  chain_bonus_cap: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model_spec: ModelSpec;
  summary: {
    total_snapshot_protocols: number;
    watchlist_total: number;
    watchlist_covered: number;
    board_rows: number;
    early_gem_rows: number;
    traded_peer_rows: number;
    total_implied_fdv_usd: number;
    total_est_pool_usd: number;
    global_shrunk_prior_multiple: number;
  };
  categories: { category: string; count: number; shrunk_multiple: number }[];
  chains: { chain: string; count: number }[];
  tradedPeerSummary: CategoryCalibration[];
  tradedSample: TradedPeerRow[];
  rows: RadarCandidateRow[];
}

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

const DAY_MS = 86_400_000;
const MAX_IMPLIED_USD = 100_000_000_000_000;
const PRIOR_STRENGTH_K = 6;
const SCALE_PIVOT_USD = 50_000_000;
const SCALE_EXPONENT = -0.075;
const GROWTH_SCALE_PCT = 45;
const GROWTH_MAX_SWING = 0.28;
const TENURE_HALF_LIFE_DAYS = 420;
const UNKNOWN_TENURE_DAYS = 300;
const CHAIN_BONUS_CAP = 0.12;

const EXCLUDED_PRETOKEN_CATEGORIES = new Set([
  'CEX',
  'Canonical Bridge',
  'Restaked BTC',
  'Stablecoin Wrapper',
]);

const VERSION_SUFFIX_RE = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_BRAND_PREFIX_RE = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Okcoin|Bitfinex|Gemini|Crypto\.com|Gate\b)/i;
const DERIVATIVE_WORD_RE = /\b(?:wrapped|bridged)\b|\bstaked\s+(?:sol|eth|btc|near|ton|avax|sui|apt)\b/i;
const LST_RECEIPT_RE = /\blsts?\b|^st[a-z]{3,6}\b/i;
const WRAPPED_BRIDGE_SLUG_RE = /^(?:w[a-z]{2,6}|[a-z]{2,7}btc)$/i;

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const cmpAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Linearly interpolated quantile on an already-sorted ascending numeric array. */
export function sortedQuantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** Whole UTC days between listed_at and snapshot as_of, or null if unreported. */
export function computeTenureDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const endMs = Date.parse(`${asOf}T00:00:00Z`);
  const startMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) return null;
  return Math.max(0, Math.floor((endMs - startMs) / DAY_MS));
}

/** Calibrates empirical MCap/TVL multiples from traded non-CEX protocols with Empirical Bayes shrinkage. */
export function calibrateCategoryMultiples(protocols: readonly SnapshotProtocol[]): {
  byCategory: Map<string, CategoryCalibration>;
  tradedPeerSummary: CategoryCalibration[];
  tradedSample: TradedPeerRow[];
  globalRawMedian: number;
  globalWinsorizedMedian: number;
  globalP25: number;
  globalP75: number;
  winsorFloor: number;
  winsorCap: number;
} {
  const tradedRaw = protocols.filter(
    (p) => p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );

  const allRatios = tradedRaw.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const winsorFloor = allRatios.length > 0 ? round4(Math.max(0.03, sortedQuantile(allRatios, 0.15))) : 0.05;
  const winsorCap = allRatios.length > 0 ? round4(Math.min(1.65, Math.max(0.5, sortedQuantile(allRatios, 0.85)))) : 1.5;

  const winsorAll = allRatios.map((r) => clamp(r, winsorFloor, winsorCap)).sort((a, b) => a - b);
  const globalRawMedian = allRatios.length > 0 ? round4(sortedQuantile(allRatios, 0.5)) : 0.25;
  const globalWinsorizedMedian = winsorAll.length > 0 ? round4(sortedQuantile(winsorAll, 0.5)) : 0.25;
  const globalP25 = allRatios.length > 0 ? round4(sortedQuantile(allRatios, 0.25)) : 0.1;
  const globalP75 = allRatios.length > 0 ? round4(sortedQuantile(allRatios, 0.75)) : 0.85;

  const grouped = new Map<string, SnapshotProtocol[]>();
  const allCategories = new Set<string>(['Uncategorized']);
  for (const p of protocols) {
    if (p.category !== 'CEX') allCategories.add(p.category ?? 'Uncategorized');
  }
  for (const p of tradedRaw) {
    const cat = p.category ?? 'Uncategorized';
    const arr = grouped.get(cat);
    if (arr !== undefined) arr.push(p);
    else grouped.set(cat, [p]);
  }

  const byCategory = new Map<string, CategoryCalibration>();
  for (const cat of [...allCategories].sort(cmpAsc)) {
    const peers = grouped.get(cat) ?? [];
    const n = peers.length;
    if (n === 0) {
      byCategory.set(cat, {
        category: cat,
        sample_count: 0,
        raw_median_multiple: globalRawMedian,
        winsorized_median_multiple: globalWinsorizedMedian,
        p25_multiple: globalP25,
        p75_multiple: globalP75,
        empirical_weight: 0,
        shrunk_multiple: globalWinsorizedMedian,
        total_peer_tvl_usd: 0,
        total_peer_mcap_usd: 0,
      });
      continue;
    }

    const rawSorted = peers.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
    const winSorted = rawSorted.map((r) => clamp(r, winsorFloor, winsorCap)).sort((a, b) => a - b);
    const rawMed = sortedQuantile(rawSorted, 0.5);
    const winMed = sortedQuantile(winSorted, 0.5);
    const p25 = sortedQuantile(rawSorted, 0.25);
    const p75 = sortedQuantile(rawSorted, 0.75);
    const weight = n / (n + PRIOR_STRENGTH_K);
    // Geometric (log-space) Empirical Bayes shrinkage prevents single-peer ratio outliers from dominating.
    const shrunk = Math.exp(
      weight * Math.log(Math.max(0.01, winMed)) + (1 - weight) * Math.log(Math.max(0.01, globalWinsorizedMedian)),
    );

    let peerTvl = 0;
    let peerMcap = 0;
    for (const p of peers) {
      peerTvl += p.tvl_usd;
      peerMcap += p.mcap_usd as number;
    }

    byCategory.set(cat, {
      category: cat,
      sample_count: n,
      raw_median_multiple: round4(rawMed),
      winsorized_median_multiple: round4(winMed),
      p25_multiple: round4(p25),
      p75_multiple: round4(p75),
      empirical_weight: round4(weight),
      shrunk_multiple: round4(shrunk),
      total_peer_tvl_usd: peerTvl,
      total_peer_mcap_usd: peerMcap,
    });
  }

  const tradedPeerSummary = [...byCategory.values()]
    .filter((c) => c.sample_count > 0)
    .sort((a, b) => b.sample_count - a.sample_count || b.total_peer_mcap_usd - a.total_peer_mcap_usd || cmpAsc(a.category, b.category));

  const tradedSample: TradedPeerRow[] = tradedRaw
    .slice()
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd || cmpAsc(a.slug, b.slug))
    .map((p) => {
      const ratio = (p.mcap_usd as number) / p.tvl_usd;
      return {
        slug: p.slug,
        name: p.name,
        symbol: p.symbol,
        category: p.category ?? 'Uncategorized',
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd as number,
        mcap_tvl_multiple: round4(ratio),
        winsorized_multiple: round4(clamp(ratio, winsorFloor, winsorCap)),
        change_7d: p.change_7d,
        listed_at: p.listed_at,
      };
    });

  return {
    byCategory,
    tradedPeerSummary,
    tradedSample,
    globalRawMedian,
    globalWinsorizedMedian,
    globalP25,
    globalP75,
    winsorFloor,
    winsorCap,
  };
}

/** Classifies whether a snapshot entry belongs on the pre-token radar without hardcoded protocol overrides. */
export function classifyPreTokenCandidate(
  proto: SnapshotProtocol,
  watchlistSet: ReadonlySet<string>,
  floorUsd: number,
): { eligible: boolean; isWatchlist: boolean; tier: 'watchlist' | 'early' } {
  if (watchlistSet.has(proto.slug)) {
    return { eligible: true, isWatchlist: true, tier: 'watchlist' };
  }
  if (proto.tvl_usd >= floorUsd) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (proto.mcap_usd !== null || proto.gecko_id !== null || proto.symbol !== null) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  const cat = proto.category ?? '';
  if (EXCLUDED_PRETOKEN_CATEGORIES.has(cat)) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (VERSION_SUFFIX_RE.test(proto.name)) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (EXCHANGE_BRAND_PREFIX_RE.test(proto.name)) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (DERIVATIVE_WORD_RE.test(proto.name)) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (cat === 'Liquid Staking' && LST_RECEIPT_RE.test(proto.name)) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  if (cat === 'Bridge' && (WRAPPED_BRIDGE_SLUG_RE.test(proto.slug) || /\bbitcoin\b/i.test(proto.name))) {
    return { eligible: false, isWatchlist: false, tier: 'early' };
  }
  return { eligible: true, isWatchlist: false, tier: 'early' };
}

/** Computes implied launch FDV, waterfall steps, and farmer capital-efficiency metrics from snapshot fields. */
export function computeImpliedLaunchValue(
  proto: SnapshotProtocol,
  asOf: string,
  cal: CategoryCalibration,
  isWatchlist: boolean,
): { metrics: ValuationMetrics; waterfall: WaterfallBreakdown } {
  const tvl = Math.max(1, proto.tvl_usd);
  const catMult = cal.shrunk_multiple;

  // Sub-linear TVL elasticity: larger TVL increases dollar FDV (~TVL^0.925) while compressing MCap/TVL ratio slightly.
  const rawScale = Math.pow(tvl / SCALE_PIVOT_USD, SCALE_EXPONENT);
  const scaleFactor = clamp(rawScale, 0.72, 1.18);

  // Smooth bounded 7-day flow momentum via tanh: avoids cliff discontinuities on volatile weekly inflows.
  const delta7d = typeof proto.change_7d === 'number' && Number.isFinite(proto.change_7d) ? proto.change_7d : 0;
  const growthFactor = 1 + GROWTH_MAX_SWING * Math.tanh(delta7d / GROWTH_SCALE_PCT);

  // Tokenless operating tenure: smooth exponential saturation rewarding durable protocol liveness.
  const ageDays = computeTenureDays(asOf, proto.listed_at);
  const effectiveTenure = ageDays ?? UNKNOWN_TENURE_DAYS;
  const tenureFactor = 0.82 + 0.33 * (1 - Math.exp(-Math.max(0, effectiveTenure) / TENURE_HALF_LIFE_DAYS));

  // Multi-chain deployment breadth factor.
  const chainCount = Math.max(1, proto.chains.length);
  const chainFactor = 1 + Math.min(CHAIN_BONUS_CAP, 0.03 * Math.log2(chainCount));

  const categoryBaseUsd = Math.max(1, Math.round(tvl * catMult));
  const afterScaleUsd = Math.max(1, Math.round(tvl * catMult * scaleFactor));
  const afterGrowthUsd = Math.max(1, Math.round(tvl * catMult * scaleFactor * growthFactor));
  const afterTenureUsd = Math.max(1, Math.round(tvl * catMult * scaleFactor * growthFactor * tenureFactor));
  const rawImplied = Math.round(tvl * catMult * scaleFactor * growthFactor * tenureFactor * chainFactor);
  const impliedValueUsd = clamp(rawImplied, 1, MAX_IMPLIED_USD);

  // Initial community distribution float decreases smoothly with implied FDV scale (6.5% small-cap down to 3.5% mega-cap).
  const logFdvM = Math.log10(Math.max(1, impliedValueUsd / 1_000_000));
  const airdropPct = round2(clamp(6.8 - 0.85 * logFdvM, 3.5, 6.5));
  const estPoolUsd = Math.max(10_000, Math.round(impliedValueUsd * (airdropPct / 100)));
  const yieldPer1kTvl = round2((estPoolUsd / tvl) * 1000);

  let confidenceTier: 'High' | 'Medium' | 'Early' = 'Early';
  if (cal.sample_count >= 5 && ageDays !== null && ageDays >= 180 && tvl >= 25_000_000) {
    confidenceTier = 'High';
  } else if (cal.sample_count >= 2 || tvl >= 15_000_000 || isWatchlist) {
    confidenceTier = 'Medium';
  }

  const metrics: ValuationMetrics = {
    impliedValueUsd,
    estPoolUsd,
    airdropPct,
    yieldPer1kTvl,
    ageDays,
    isWatchlist,
    confidenceTier,
    categoryMultiple: round4(catMult),
    scaleFactor: round4(scaleFactor),
    growthFactor: round4(growthFactor),
    tenureFactor: round4(tenureFactor),
    chainFactor: round4(chainFactor),
  };

  const waterfall: WaterfallBreakdown = {
    tvl_usd: tvl,
    category_multiple: round4(catMult),
    category_base_usd: categoryBaseUsd,
    scale_factor: round4(scaleFactor),
    after_scale_usd: afterScaleUsd,
    growth_factor: round4(growthFactor),
    after_growth_usd: afterGrowthUsd,
    tenure_factor: round4(tenureFactor),
    after_tenure_usd: afterTenureUsd,
    chain_factor: round4(chainFactor),
    implied_value_usd: impliedValueUsd,
  };

  return { metrics, waterfall };
}

/** Builds both the gate-compliant board.json rows and the full RadarData payload for data.js. */
export function buildRadarDataset(snapshot: Snapshot): { boardRows: BoardRow[]; radarData: RadarData } {
  const watchlistSet = new Set(snapshot.watchlist);
  const calibration = calibrateCategoryMultiples(snapshot.protocols);
  const fallbackCal: CategoryCalibration = calibration.byCategory.get('Uncategorized') ?? {
    category: 'Uncategorized',
    sample_count: 0,
    raw_median_multiple: calibration.globalRawMedian,
    winsorized_median_multiple: calibration.globalWinsorizedMedian,
    p25_multiple: calibration.globalP25,
    p75_multiple: calibration.globalP75,
    empirical_weight: 0,
    shrunk_multiple: calibration.globalWinsorizedMedian,
    total_peer_tvl_usd: 0,
    total_peer_mcap_usd: 0,
  };

  const candidates: {
    proto: SnapshotProtocol;
    isWatchlist: boolean;
    tier: 'watchlist' | 'early';
    cal: CategoryCalibration;
    metrics: ValuationMetrics;
    waterfall: WaterfallBreakdown;
    farmPlan: FarmPlan;
  }[] = [];

  for (const proto of snapshot.protocols) {
    const cls = classifyPreTokenCandidate(proto, watchlistSet, snapshot.floor_usd);
    if (!cls.eligible) continue;
    const catKey = proto.category ?? 'Uncategorized';
    const cal = calibration.byCategory.get(catKey) ?? fallbackCal;
    const { metrics, waterfall } = computeImpliedLaunchValue(proto, snapshot.as_of, cal, cls.isWatchlist);
    const farmPlan = buildFarmPlan(proto, metrics);
    candidates.push({
      proto,
      isWatchlist: cls.isWatchlist,
      tier: cls.tier,
      cal,
      metrics,
      waterfall,
      farmPlan,
    });
  }

  candidates.sort(
    (a, b) =>
      b.metrics.impliedValueUsd - a.metrics.impliedValueUsd ||
      b.proto.tvl_usd - a.proto.tvl_usd ||
      cmpAsc(a.proto.slug, b.proto.slug),
  );

  const peersByCategory = new Map<string, PeerCompBrief[]>();
  const toBrief = (p: TradedPeerRow): PeerCompBrief => ({
    slug: p.slug,
    name: p.name,
    symbol: p.symbol,
    category: p.category,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    mcap_tvl_multiple: p.mcap_tvl_multiple,
  });
  for (const peer of calibration.tradedSample) {
    const list = peersByCategory.get(peer.category);
    if (list === undefined) {
      peersByCategory.set(peer.category, [toBrief(peer)]);
    } else if (list.length < 4) {
      list.push(toBrief(peer));
    }
  }
  const globalAnchorPeers = calibration.tradedSample.slice(0, 4).map(toBrief);

  const radarRows: RadarCandidateRow[] = candidates.map((item, idx) => {
    const rank = idx + 1;
    const catLabel = item.proto.category ?? 'Uncategorized';
    const primaryChain = item.proto.chains.length > 0 ? item.proto.chains[0]! : 'Multi-Chain';
    const catPeers = peersByCategory.get(catLabel) ?? [];
    let matchMode: 'category' | 'blended_prior' | 'global_prior' = 'global_prior';
    let comps: PeerCompBrief[] = globalAnchorPeers;
    if (catPeers.length >= 3) {
      matchMode = 'category';
      comps = catPeers.slice(0, 4);
    } else if (catPeers.length > 0) {
      matchMode = 'blended_prior';
      const seen = new Set(catPeers.map((c) => c.slug));
      comps = [...catPeers, ...globalAnchorPeers.filter((g) => !seen.has(g.slug))].slice(0, 4);
    }
    const effectiveMultiple = round4(item.metrics.impliedValueUsd / Math.max(1, item.proto.tvl_usd));
    return {
      rank,
      slug: item.proto.slug,
      name: item.proto.name,
      category: item.proto.category,
      category_label: catLabel,
      chains: item.proto.chains,
      primary_chain: primaryChain,
      chain_count: item.proto.chains.length,
      tvl_usd: item.proto.tvl_usd,
      change_7d: item.proto.change_7d,
      listed_at: item.proto.listed_at,
      tenure_days: item.metrics.ageDays,
      is_watchlist: item.isWatchlist,
      tier: item.tier,
      token_record_note: 'Records no token in DefiLlama snapshot',
      implied_value_usd: item.metrics.impliedValueUsd,
      category_multiple: item.waterfall.category_multiple,
      effective_multiple: effectiveMultiple,
      est_pool_usd: item.metrics.estPoolUsd,
      airdrop_pct: item.metrics.airdropPct,
      yield_per_1k_tvl: item.metrics.yieldPer1kTvl,
      confidence_tier: item.metrics.confidenceTier,
      peer_sample_count: item.cal.sample_count,
      peer_match_mode: matchMode,
      peer_comp_slugs: comps.map((c) => c.slug),
      peer_comps: comps,
      category_p25_multiple: item.cal.p25_multiple,
      category_p75_multiple: item.cal.p75_multiple,
      waterfall: item.waterfall,
      farm_steps: item.farmPlan.steps,
      farm_plan: item.farmPlan,
    };
  });

  const boardRows: BoardRow[] = radarRows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    tenure_days: r.tenure_days,
    is_watchlist: r.is_watchlist,
    tier: r.tier,
    token_record_note: r.token_record_note,
    implied_value_usd: r.implied_value_usd,
    est_pool_usd: r.est_pool_usd,
    airdrop_pct: r.airdrop_pct,
    yield_per_1k_tvl: r.yield_per_1k_tvl,
    confidence_tier: r.confidence_tier,
    waterfall: r.waterfall,
    farm_steps: r.farm_steps,
  }));

  const catCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  let watchlistCovered = 0;
  let earlyGemRows = 0;
  let totalImpliedFdvUsd = 0;
  let totalEstPoolUsd = 0;

  for (const r of radarRows) {
    catCounts.set(r.category_label, (catCounts.get(r.category_label) ?? 0) + 1);
    for (const ch of r.chains) {
      chainCounts.set(ch, (chainCounts.get(ch) ?? 0) + 1);
    }
    if (r.is_watchlist) watchlistCovered++;
    else earlyGemRows++;
    totalImpliedFdvUsd += r.implied_value_usd;
    totalEstPoolUsd += r.est_pool_usd;
  }

  const categories = [...catCounts.entries()]
    .map(([category, count]) => ({
      category,
      count,
      shrunk_multiple: (calibration.byCategory.get(category) ?? fallbackCal).shrunk_multiple,
    }))
    .sort((a, b) => b.count - a.count || cmpAsc(a.category, b.category));

  const chains = [...chainCounts.entries()]
    .map(([chain, count]) => ({ chain, count }))
    .sort((a, b) => b.count - a.count || cmpAsc(a.chain, b.chain));

  const modelSpec: ModelSpec = {
    version: 'eb-radar-v1.1',
    shrinkage_space: 'log-geometric',
    prior_strength_k: PRIOR_STRENGTH_K,
    winsor_low_quantile: 0.15,
    winsor_high_quantile: 0.85,
    winsor_floor_multiple: calibration.winsorFloor,
    winsor_cap_multiple: calibration.winsorCap,
    global_raw_median_multiple: calibration.globalRawMedian,
    global_winsorized_median_multiple: calibration.globalWinsorizedMedian,
    global_p25_multiple: calibration.globalP25,
    global_p75_multiple: calibration.globalP75,
    scale_pivot_usd: SCALE_PIVOT_USD,
    scale_exponent: SCALE_EXPONENT,
    scale_bounds: [0.72, 1.18],
    growth_scale_pct: GROWTH_SCALE_PCT,
    growth_max_swing: GROWTH_MAX_SWING,
    tenure_half_life_days: TENURE_HALF_LIFE_DAYS,
    unknown_tenure_days: UNKNOWN_TENURE_DAYS,
    tenure_bounds: [0.82, 1.15],
    chain_bonus_cap: CHAIN_BONUS_CAP,
  };

  const radarData: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: modelSpec.version,
    model_spec: modelSpec,
    summary: {
      total_snapshot_protocols: snapshot.protocols.length,
      watchlist_total: snapshot.watchlist.length,
      watchlist_covered: watchlistCovered,
      board_rows: radarRows.length,
      early_gem_rows: earlyGemRows,
      traded_peer_rows: calibration.tradedSample.length,
      total_implied_fdv_usd: totalImpliedFdvUsd,
      total_est_pool_usd: totalEstPoolUsd,
      global_shrunk_prior_multiple: calibration.globalWinsorizedMedian,
    },
    categories,
    chains,
    tradedPeerSummary: calibration.tradedPeerSummary,
    tradedSample: calibration.tradedSample,
    rows: radarRows,
  };

  return { boardRows, radarData };
}

/** Parses and validates the sealed DefiLlama snapshot JSON. */
export function parseSnapshot(jsonText: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new SnapshotValidationError('Input snapshot is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SnapshotValidationError('Input snapshot root must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.as_of)) {
    throw new SnapshotValidationError('Input snapshot missing valid YYYY-MM-DD as_of');
  }
  if (typeof obj.source !== 'string' || obj.source.length === 0) {
    throw new SnapshotValidationError('Input snapshot missing source string');
  }
  if (typeof obj.floor_usd !== 'number' || !Number.isSafeInteger(obj.floor_usd) || obj.floor_usd <= 0) {
    throw new SnapshotValidationError('Input snapshot missing positive integer floor_usd');
  }
  if (!Array.isArray(obj.protocols)) {
    throw new SnapshotValidationError('Input snapshot missing protocols array');
  }
  if (!Array.isArray(obj.watchlist) || obj.watchlist.some((w) => typeof w !== 'string')) {
    throw new SnapshotValidationError('Input snapshot missing string watchlist array');
  }

  const protocols: SnapshotProtocol[] = obj.protocols.map((entry, idx) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new SnapshotValidationError(`Protocol entry ${idx} is not an object`);
    }
    const rec = entry as Record<string, unknown>;
    if (
      typeof rec.slug !== 'string' ||
      rec.slug.length === 0 ||
      typeof rec.name !== 'string' ||
      rec.name.length === 0 ||
      typeof rec.tvl_usd !== 'number' ||
      !Number.isFinite(rec.tvl_usd)
    ) {
      throw new SnapshotValidationError(`Protocol entry ${idx} missing valid slug, name, or tvl_usd`);
    }
    return {
      slug: rec.slug,
      name: rec.name,
      category: typeof rec.category === 'string' && rec.category.length > 0 ? rec.category : null,
      chains: Array.isArray(rec.chains) ? rec.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: rec.tvl_usd,
      change_7d: typeof rec.change_7d === 'number' && Number.isFinite(rec.change_7d) ? rec.change_7d : null,
      mcap_usd: typeof rec.mcap_usd === 'number' && Number.isFinite(rec.mcap_usd) ? rec.mcap_usd : null,
      listed_at: typeof rec.listed_at === 'string' && rec.listed_at.length > 0 ? rec.listed_at : null,
      gecko_id: typeof rec.gecko_id === 'string' && rec.gecko_id.length > 0 ? rec.gecko_id : null,
      symbol: typeof rec.symbol === 'string' && rec.symbol.length > 0 ? rec.symbol : null,
    };
  });

  return {
    as_of: obj.as_of,
    source: obj.source,
    floor_usd: obj.floor_usd,
    protocols,
    watchlist: obj.watchlist as string[],
  };
}

/** Verifies every sealed gate invariant on boardRows before writing output artifacts. */
export function validateBoardRows(rows: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) {
    return `Board row count ${rows.length} outside allowed 100..4000 range`;
  }
  const validSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenSlugs = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) {
      return `Row ${i} has rank ${r.rank} instead of ${i + 1}`;
    }
    if (!validSlugs.has(r.slug)) {
      return `Row ${r.slug} is not present in snapshot.protocols`;
    }
    if (seenSlugs.has(r.slug)) {
      return `Duplicate slug ${r.slug} in board rows`;
    }
    seenSlugs.add(r.slug);
    if (!r.name || r.name.trim().length === 0) {
      return `Row ${r.slug} has empty name`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > MAX_IMPLIED_USD) {
      return `Row ${r.slug} has out-of-bounds implied_value_usd ${r.implied_value_usd}`;
    }
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `Non-monotonic implied_value_usd at rank ${r.rank} (${r.implied_value_usd} > ${rows[i - 1]!.implied_value_usd})`;
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `Row ${r.slug} has ${r.farm_steps?.length ?? 0} farm_steps (must be 3..12)`;
    }
    for (const step of r.farm_steps) {
      const trimmedLen = step.trim().length;
      if (trimmedLen < 20 || trimmedLen > 600) {
        return `Row ${r.slug} has farm step of trimmed length ${trimmedLen} (must be 20..600)`;
      }
    }
  }
  if (rows.length >= 2 && rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) {
    return 'All rows share an identical implied_value_usd';
  }
  const missingWatchlist = snapshot.watchlist.filter((slug) => !seenSlugs.has(slug));
  if (missingWatchlist.length > 0) {
    return `Missing ${missingWatchlist.length} watchlist slugs: ${missingWatchlist.slice(0, 5).join(', ')}`;
  }
  return null;
}

/** Formats the standalone offline script writing window.RADAR_DATA for dashboard/index.html. */
export function renderRadarDataScript(data: RadarData): string {
  return `window.RADAR_DATA = ${JSON.stringify(data)};\n`;
}
