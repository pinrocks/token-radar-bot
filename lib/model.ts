// TypeScript bridge and strict schema validator for token-radar-01 Round 2.
// Delegates all econometric valuation, OOS cross-validation, 200-refit bootstrap,
// and costed DeFi farming calculations to ../dashboard/model.js so Node (board.json / data.js)
// and Browser (<script src="model.js">) execute one identical model.

import { createRequire } from 'node:module';

const requireModule = createRequire(import.meta.url);
const RadarModel = requireModule('../dashboard/model.js') as RadarModelApi;

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

export interface TradedAnchor {
  slug: string;
  name: string;
  symbol: string;
  gecko_id: string | null;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_multiple: number;
  change_7d: number | null;
  listed_at: string | null;
  merged_slugs: string[];
  merged_count: number;
}

export interface NearestComp {
  slug: string;
  name: string;
  symbol: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_multiple: number;
  merged_count: number;
  same_category: boolean;
  distance: number;
}

export interface DepositFarmPlan {
  deposit_usd: number;
  weeks: number;
  as_of: string;
  midpoint_date: string;
  review_date: string;
  mechanism_id: string;
  mechanism_label: string;
  kyc_gated: boolean;
  primary_chain: string;
  execution_chain: string;
  low_fee_alt_chain: string | null;
  chain_tier: string;
  tx_count: number;
  airdrop_bps: number;
  equiv_fdv_bps: number;
  campaign_pool_usd: number;
  dilution_share: number;
  season_weight: number;
  gross_airdrop_usd: number;
  gas_bridge_usd: number;
  execution_drag_usd: number;
  gross_opp_cost_usd: number;
  native_yield_offset_usd: number;
  opp_cost_usd: number;
  total_cost_usd: number;
  net_ev_usd: number;
  net_roi_pct: number;
  breakeven_bps: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  verdict_reason: string;
  risk_note: string;
  farm_steps: string[];
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
  age_days: number | null;
  is_watchlist: boolean;
  implied_value_usd: number;
  p10_value_usd: number;
  p90_value_usd: number;
  rank_best: number;
  rank_worst: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  net_farm_ev_usd: number;
  breakeven_bps: number;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  category_label: string;
  chains: string[];
  primary_chain: string;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  is_watchlist: boolean;
  cohort: 'watchlist' | 'discovery';
  token_record_note: string;
  implied_value_usd: number;
  median_mcap_usd: number;
  implied_tvl_multiple: number;
  p10_value_usd: number;
  p50_value_usd: number;
  p90_value_usd: number;
  rank_best: number;
  rank_worst: number;
  decomposition: {
    base_curve_usd: number;
    category_factor: number;
    growth_factor: number;
    seasoning_factor: number;
    season_score: number;
  };
  nearest_comps: NearestComp[];
  default_farm: DepositFarmPlan;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  defaults: {
    deposit_usd: number;
    weeks: number;
    deposit_presets: number[];
    horizon_presets: number[];
    usdc_benchmark_apr: number;
    bootstrap_refits: number;
  };
  econometrics: Record<string, unknown>;
  summary: {
    total_snapshot_protocols: number;
    watchlist_total: number;
    watchlist_covered: number;
    board_rows: number;
    sub_floor_discovery_rows: number;
    traded_anchor_families: number;
    total_implied_value_usd: number;
    verdict_counts: { FARM: number; THIN: number; SKIP: number };
  };
  categories: { category: string; count: number; anchor_count: number; category_factor: number }[];
  chains: { chain: string; count: number }[];
  anchors: TradedAnchor[];
  rows: RadarRow[];
}

interface RadarModelApi {
  MODEL_VERSION: string;
  scoreSnapshot: (
    snapshot: Snapshot,
    opts?: { deposit_usd?: number; weeks?: number; bootstrap_refits?: number },
  ) => { boardRows: BoardRow[]; radarData: RadarData };
  buildDepositFarmPlan: (
    proto: SnapshotProtocol | RadarRow,
    valuation: number | { implied_value_usd: number },
    opts?: { deposit_usd?: number; weeks?: number; as_of?: string },
  ) => DepositFarmPlan;
}

const MAX_IMPLIED_USD = 100_000_000_000_000;

export function parseSnapshot(rawJson: string): Snapshot {
  const parsed = JSON.parse(rawJson) as Partial<Snapshot>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Snapshot JSON must be an object');
  }
  if (typeof parsed.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.as_of)) {
    throw new Error('Snapshot missing valid YYYY-MM-DD as_of');
  }
  if (!Array.isArray(parsed.protocols) || parsed.protocols.length === 0) {
    throw new Error('Snapshot protocols must be a non-empty array');
  }
  if (!Array.isArray(parsed.watchlist)) {
    throw new Error('Snapshot watchlist must be an array');
  }
  return {
    as_of: parsed.as_of,
    source: typeof parsed.source === 'string' ? parsed.source : 'DefiLlama snapshot',
    floor_usd: typeof parsed.floor_usd === 'number' && Number.isFinite(parsed.floor_usd) ? parsed.floor_usd : 50_000_000,
    protocols: parsed.protocols,
    watchlist: parsed.watchlist,
  };
}

export function buildRadarDataset(snapshot: Snapshot): { boardRows: BoardRow[]; radarData: RadarData } {
  return RadarModel.scoreSnapshot(snapshot);
}

export function validateBoardRows(rows: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4_000) {
    return `Row count ${rows.length} outside [100, 4000]`;
  }
  const validSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenSlugs = new Set<string>();
  const distinctValues = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `Row ${i} has rank ${r.rank}, expected ${i + 1}`;
    if (!r.slug || /\s/.test(r.slug) || !validSlugs.has(r.slug)) {
      return `Invalid or unknown protocol slug: ${r.slug}`;
    }
    if (seenSlugs.has(r.slug)) return `Duplicate slug: ${r.slug}`;
    seenSlugs.add(r.slug);

    if (!r.name || r.name.trim().length === 0) return `Empty name for ${r.slug}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > MAX_IMPLIED_USD) {
      return `Invalid implied_value_usd ${r.implied_value_usd} for ${r.slug}`;
    }
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `implied_value_usd ascended at rank ${r.rank} (${r.slug})`;
    }
    if (r.p10_value_usd > r.implied_value_usd || r.p90_value_usd < r.implied_value_usd) {
      return `Confidence interval [${r.p10_value_usd}, ${r.p90_value_usd}] fails to bracket implied_value_usd for ${r.slug}`;
    }
    if (r.rank_best > r.rank || r.rank_worst < r.rank) {
      return `Bootstrap rank band [${r.rank_best}, ${r.rank_worst}] fails to bracket rank ${r.rank} for ${r.slug}`;
    }
    distinctValues.add(r.implied_value_usd);

    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 6 || r.farm_steps.length > 8) {
      return `farm_steps count ${r.farm_steps?.length} outside [6, 8] for ${r.slug}`;
    }
    for (const step of r.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 45 || trimmed.length > 420) {
        return `farm_steps item length ${trimmed.length} outside [45, 420] for ${r.slug}`;
      }
    }
  }

  if (distinctValues.size < 2) {
    return 'All rows share identical implied_value_usd';
  }
  for (const wlSlug of snapshot.watchlist) {
    if (!seenSlugs.has(wlSlug)) {
      return `Missing watchlist slug: ${wlSlug}`;
    }
  }
  return null;
}

export function renderRadarDataScript(radarData: RadarData): string {
  const safeJson = JSON.stringify(radarData).replace(/<\//g, '<\\/');
  return `window.RADAR_DATA = ${safeJson};\n`;
}

export { RadarModel };
