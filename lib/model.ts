// lib/model.ts
// "radar-2" scoring model for the token-launch radar board.
// One DefiLlama-style snapshot in, one ranked board out.
// Pure functions only: no network, no file access, no side effects.

export const MODEL_VERSION = "radar-2";
export const LIVE_LIMIT = 24;

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelConstants {
  benchmark_multiple: number;
  benchmark_n: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export interface RowModel {
  benchmark_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
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
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: RowModel;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface BoardSummaryRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  benchmark_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows: BoardSummaryRow[];
  live: LiveRow[];
}

export interface RadarResult {
  board: BoardRow[];
  radar: RadarData;
  data: RadarData;
  dashboard: RadarData;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateUtc(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  if (!DATE_RE.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year) return null;
  if (date.getUTCMonth() !== month - 1) return null;
  if (date.getUTCDate() !== day) return null;
  return date;
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  const listed = parseDateUtc(listedAt);
  const asOfDate = parseDateUtc(asOf);
  if (listed === null || asOfDate === null) return null;
  const diff = asOfDate.getTime() - listed.getTime();
  const days = Math.floor(diff / 86400000);
  return days < 0 ? 0 : days;
}

export function computeBenchmark(protocols: Protocol[]): { multiple: number; n: number } {
  const ratios: number[] = [];
  for (const p of protocols) {
    if (typeof p.mcap_usd === "number" && p.mcap_usd > 0 && typeof p.tvl_usd === "number" && p.tvl_usd > 0) {
      ratios.push(p.mcap_usd / p.tvl_usd);
    }
  }
  if (ratios.length === 0) return { multiple: 0.2, n: 0 };
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 === 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { multiple: round4(clamp(median, 0.05, 1.0)), n: ratios.length };
}

export function buildModelConstants(protocols: Protocol[]): ModelConstants {
  const bench = computeBenchmark(protocols);
  return {
    benchmark_multiple: bench.multiple,
    benchmark_n: bench.n,
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.6,
    maturity_range: 0.4,
    maturity_days: 1095,
    unknown_age_days: 365,
    breadth_per_chain: 0.02,
    breadth_max_chains: 5,
  };
}

export function growthMultiplier(change7d: number | null, constants: ModelConstants): { pct: number; multiplier: number } {
  const raw = typeof change7d === "number" && Number.isFinite(change7d) ? change7d : 0;
  const pct = clamp(raw, constants.growth_floor, constants.growth_cap);
  return { pct, multiplier: 1 + (pct / 100) * constants.growth_weight };
}

export function maturityMultiplier(age: number | null, constants: ModelConstants): number {
  const days = age === null ? constants.unknown_age_days : age;
  const capped = Math.min(Math.max(days, 0), constants.maturity_days);
  return constants.maturity_floor + (capped / constants.maturity_days) * constants.maturity_range;
}

export function breadthMultiplier(chains: string[], constants: ModelConstants): number {
  return 1 + constants.breadth_per_chain * Math.min(chains.length, constants.breadth_max_chains);
}

export function impliedValue(tvl: number, benchmarkMultiple: number, growth: number, maturity: number, breadth: number): number {
  return Math.max(1, Math.round(tvl * benchmarkMultiple * growth * maturity * breadth));
}

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const VERSION_SUFFIX_RE = / (?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED_RE = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX_RE = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isPreToken(protocol: Protocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

export function isRankable(protocol: Protocol): boolean {
  if (!isPreToken(protocol)) return false;
  if (protocol.category !== null && EXCLUDED_CATEGORIES.has(protocol.category)) return false;
  if (VERSION_SUFFIX_RE.test(protocol.name)) return false;
  if (WRAPPED_RE.test(protocol.name)) return false;
  if (EXCHANGE_PREFIX_RE.test(protocol.name)) return false;
  return true;
}

const L2_CHAINS = new Set([
  "arbitrum",
  "arbitrum nova",
  "optimism",
  "base",
  "polygon",
  "zksync era",
  "linea",
  "scroll",
  "blast",
  "ink",
  "mode",
  "fraxtal",
  "mantle",
  "starknet",
  "metis",
  "boba",
  "apechain",
  "abstract",
  "soneium",
  "unichain",
  "world chain",
  "zora",
  "shape",
  "berachain",
]);

export function gasFor(chain: string | null): string {
  if (chain === null) return "about $2 of gas";
  const name = chain.toLowerCase();
  if (name === "ethereum") return "about $8 of gas";
  if (name === "solana") return "about $0.05 of gas";
  if (name === "binance" || name === "bsc" || name === "binance smart chain") return "about $0.30 of gas";
  if (L2_CHAINS.has(name)) return "about $0.50 of gas";
  return "about $2 of gas";
}

export function capitalFor(tvl: number): number {
  if (tvl >= 5000000000) return 250;
  if (tvl >= 1000000000) return 150;
  if (tvl >= 100000000) return 100;
  return 50;
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export function categoryKey(category: string | null): string {
  if (category === null) return "default";
  const text = category.toLowerCase();
  if (text.includes("lend") || text.includes("cdp") || text.includes("collateral")) return "lend";
  if (text.includes("dex") || text.includes("leveraged farm")) return "dex";
  if (text.includes("yield")) return "yield";
  if (text.includes("bridge")) return "bridge";
  if (text.includes("staking") || text.includes("restak")) return "staking";
  if (text.includes("perpetual") || text.includes("derivative")) return "perpetual";
  if (text.includes("prediction")) return "prediction";
  if (text.includes("curator") || text.includes("allocator")) return "curator";
  if (text.includes("stable")) return "stable";
  if (text.includes("rwa")) return "rwa";
  if (text.includes("insurance")) return "insurance";
  if (text.includes("payment")) return "payment";
  return "default";
}

export function categoryAction(key: string, capital: number, name: string, chain: string): string {
  switch (key) {
    case "lend":
      return `Supply ${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    case "dex":
      return `Provide ${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    case "yield":
      return `Deposit ${capital} of USDC into ${name}'s main yield strategy on ${chain} and let it earn.`;
    case "bridge":
      return `Bridge ${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    case "staking":
      return `Stake ${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    case "perpetual":
      return `Deposit ${capital} of USDC as margin on ${name} and open one small hedge.`;
    case "prediction":
      return `Fund ${capital} and place one market position on ${name}.`;
    case "curator":
      return `Deposit ${capital} into a ${name} vault on ${chain} and keep the shares.`;
    case "stable":
      return `Mint or deposit ${capital} of the stable asset through ${name} on ${chain}.`;
    case "rwa":
      return `Mint ${capital} of the protocol's yield asset on ${chain} and hold it.`;
    case "insurance":
      return `Buy ${capital} of cover from ${name} on ${chain} and keep the policy.`;
    case "payment":
      return `Pay ${capital} through ${name} on ${chain} and keep the receipt.`;
    default:
      return `Deposit ${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

export function weeklyAction(key: string, name: string): string {
  switch (key) {
    case "lend":
      return `Top up the supply or borrow a small amount against it on ${name} once a week.`;
    case "dex":
      return `Swap a small amount in ${name}'s main pool once a week.`;
    case "yield":
      return `Harvest and re-deposit the yield ${name} pays once a week.`;
    case "bridge":
      return `Bridge a small amount through ${name} once a week.`;
    case "staking":
      return `Claim and restake the staking rewards ${name} pays once a week.`;
    case "perpetual":
      return `Open and close one small position on ${name} once a week.`;
    case "prediction":
      return `Place one small market position on ${name} once a week.`;
    case "curator":
      return `Check the vault allocation on ${name} and add a small deposit once a week.`;
    case "stable":
      return `Mint or redeem a small amount of the stable asset on ${name} once a week.`;
    case "rwa":
      return `Claim the yield ${name} pays and hold the receipt once a week.`;
    case "insurance":
      return `Check the policy on ${name} and renew or top it up once a week.`;
    case "payment":
      return `Make one small payment through ${name} once a week.`;
    default:
      return `Make one qualifying action on ${name} once a week, such as a deposit, a swap or a vote.`;
  }
}

export function formatStep(action: string, cost: string, time: string): string {
  let step = `${action} Cost: ${cost}. Time: ${time}.`;
  if (step.length > 600) step = step.slice(0, 596) + "...";
  if (step.length < 20) step = step + " Hold the position and check the protocol's own page.";
  return step;
}

export function buildFarmSteps(protocol: Protocol, age: number | null): string[] {
  const capital = capitalFor(protocol.tvl_usd);
  const chain = protocol.chains.length > 0 ? protocol.chains[0] : "its main chain";
  const gas = gasFor(protocol.chains.length > 0 ? protocol.chains[0] : null);
  const hold = holdDaysFor(age);
  const key = categoryKey(protocol.category);
  return [
    formatStep("Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.", gas, "5 minutes"),
    formatStep(categoryAction(key, capital, protocol.name, chain), `${capital} of capital and ${gas}`, "15 minutes to set up"),
    formatStep(weeklyAction(key, protocol.name), `${gas} a week`, "10 minutes a week"),
    formatStep(`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the ${capital} stays in the position`, `${hold} days`),
    formatStep("Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", "no fee to check, and never pay to claim", "10 minutes"),
    formatStep("Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.", "nothing but the log", "5 minutes"),
  ];
}

export function scoreProtocol(protocol: Protocol, asOf: string, constants: ModelConstants): BoardRow {
  const age = ageDays(protocol.listed_at, asOf);
  const growth = growthMultiplier(protocol.change_7d, constants);
  const maturity = maturityMultiplier(age, constants);
  const breadth = breadthMultiplier(protocol.chains, constants);
  const implied = impliedValue(protocol.tvl_usd, constants.benchmark_multiple, growth.multiplier, maturity, breadth);
  return {
    rank: 0,
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: [...protocol.chains],
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    gecko_id: protocol.gecko_id,
    symbol: protocol.symbol,
    token_status: "pre-token",
    age_days: age,
    implied_value_usd: implied,
    model: {
      benchmark_multiple: constants.benchmark_multiple,
      growth_pct: growth.pct,
      growth_multiplier: round4(growth.multiplier),
      maturity_multiplier: round4(maturity),
      breadth_multiplier: round4(breadth),
      age_days: age,
    },
    farm_steps: buildFarmSteps(protocol, age),
  };
}

export function buildBoardRows(snapshot: Snapshot, constants: ModelConstants): BoardRow[] {
  const bySlug = new Map<string, Protocol>();
  for (const p of snapshot.protocols) {
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, p);
  }
  const picked = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) picked.set(slug, p);
  }
  for (const p of bySlug.values()) {
    if (isRankable(p)) picked.set(p.slug, p);
  }
  const rows = [...picked.values()].map((p) => scoreProtocol(p, snapshot.as_of, constants));
  rows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

export function buildLiveRows(protocols: Protocol[]): LiveRow[] {
  const live = protocols.filter((p) => !isPreToken(p) && p.category !== "CEX");
  live.sort((a, b) => {
    const aMcap = typeof a.mcap_usd === "number" ? a.mcap_usd : 0;
    const bMcap = typeof b.mcap_usd === "number" ? b.mcap_usd : 0;
    if (bMcap !== aMcap) return bMcap - aMcap;
    return b.tvl_usd - a.tvl_usd;
  });
  return live.slice(0, LIVE_LIMIT).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
  }));
}

export function buildRadar(snapshot: Snapshot): RadarResult {
  const constants = buildModelConstants(snapshot.protocols);
  const board = buildBoardRows(snapshot, constants);
  const live = buildLiveRows(snapshot.protocols);
  const watchlistSet = new Set(snapshot.watchlist);
  const early = board.filter((row) => !watchlistSet.has(row.slug)).length;
  const rows: BoardSummaryRow[] = board.map((row) => ({
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: [...row.chains],
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    benchmark_multiple: row.model.benchmark_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: constants,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows,
    live,
  };
  return { board, radar, data: radar, dashboard: radar };
}

export function boardIssue(board: BoardRow[], snapshotOrWatchlist: Snapshot | string[]): string | null {
  const watchlist: string[] = Array.isArray(snapshotOrWatchlist) ? snapshotOrWatchlist : snapshotOrWatchlist.watchlist;
  const seen = new Set<string>();
  for (const row of board) seen.add(row.slug);
  for (const slug of watchlist) {
    if (!seen.has(slug)) return `watchlist slug missing from board: ${slug}`;
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) return `ranks are not sequential at position ${i + 1}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) {
      return `board is not sorted by implied value at rank ${board[i].rank}`;
    }
  }
  if (board.length >= 2) {
    const first = board[0].implied_value_usd;
    if (board.every((row) => row.implied_value_usd === first)) {
      return "all board rows share the same implied value";
    }
  }
  for (const row of board) {
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 0} farm steps`;
    }
    for (const step of row.farm_steps) {
      if (typeof step !== "string" || step.length < 20 || step.length > 600) {
        return `farm step for ${row.slug} is ${typeof step === "string" ? step.length : 0} characters`;
      }
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has an implied value that is not a positive integer`;
    }
  }
  return null;
}

export function dataScript(radarOrResult: RadarData | RadarResult): string {
  const radar = "radar" in radarOrResult ? radarOrResult.radar : radarOrResult;
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

function normalizeProtocol(raw: unknown): Protocol | null {
  if (!isPlainObject(raw)) return null;
  const slug = raw.slug;
  const name = raw.name;
  const tvl = raw.tvl_usd;
  if (typeof slug !== "string" || slug.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof tvl !== "number" || !Number.isFinite(tvl) || tvl < 0) return null;
  const category = typeof raw.category === "string" ? raw.category : null;
  const chains = Array.isArray(raw.chains) ? raw.chains.filter((c): c is string => typeof c === "string") : [];
  const change7d = typeof raw.change_7d === "number" && Number.isFinite(raw.change_7d) ? raw.change_7d : null;
  const mcap = typeof raw.mcap_usd === "number" && Number.isFinite(raw.mcap_usd) ? raw.mcap_usd : null;
  const listedAt = typeof raw.listed_at === "string" && parseDateUtc(raw.listed_at) !== null ? raw.listed_at : null;
  const geckoId = typeof raw.gecko_id === "string" ? raw.gecko_id : null;
  const symbol = typeof raw.symbol === "string" ? raw.symbol : null;
  return {
    slug,
    name,
    category,
    chains,
    tvl_usd: tvl,
    change_7d: change7d,
    mcap_usd: mcap,
    listed_at: listedAt,
    gecko_id: geckoId,
    symbol,
  };
}

export function parseSnapshot(text: string): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("snapshot is not valid JSON");
  }
  if (!isPlainObject(data)) throw new Error("snapshot is not an object");
  if (typeof data.as_of !== "string" || parseDateUtc(data.as_of) === null) {
    throw new Error("snapshot as_of is not a YYYY-MM-DD date");
  }
  if (typeof data.source !== "string") throw new Error("snapshot source is not a string");
  if (typeof data.floor_usd !== "number" || !Number.isInteger(data.floor_usd) || data.floor_usd <= 0) {
    throw new Error("snapshot floor_usd is not a positive integer");
  }
  if (!Array.isArray(data.protocols)) throw new Error("snapshot protocols is not an array");
  if (!Array.isArray(data.watchlist) || !data.watchlist.every((s) => typeof s === "string")) {
    throw new Error("snapshot watchlist is not an array of strings");
  }
  const protocols: Protocol[] = [];
  for (const raw of data.protocols) {
    const protocol = normalizeProtocol(raw);
    if (protocol === null) throw new Error("snapshot has a protocol without a valid slug, name or tvl_usd");
    protocols.push(protocol);
  }
  return {
    as_of: data.as_of,
    source: data.source,
    floor_usd: data.floor_usd,
    protocols,
    watchlist: [...(data.watchlist as string[])],
  };
}

