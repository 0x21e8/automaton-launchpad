import { createHash } from "node:crypto";

import type {
  ChainSlug,
  GridPosition,
  MonologueEntryCategory,
  MonologueEntryImportance,
  MonologueEntry
} from "@ic-automaton/shared";

import type { IndexerTargetConfig } from "../indexer.config.js";

const GRID_SIZE = 200;

const CORE_PATTERNS: readonly number[][][] = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1]
  ],
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2]
  ],
  [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2]
  ],
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1]
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1]
  ]
] as const;

const NAME_PREFIXES = [
  "ALPHA",
  "BETA",
  "GAMMA",
  "DELTA",
  "SIGMA",
  "OMEGA",
  "ION",
  "ARC",
  "NOVA",
  "AXIS",
  "MESH",
  "ECHO"
] as const;

const CHAIN_INFO = new Map<number, { explorerBaseUrl: string; slug: ChainSlug }>([
  [1, { slug: "ethereum", explorerBaseUrl: "https://etherscan.io" }],
  [10, { slug: "optimism", explorerBaseUrl: "https://optimistic.etherscan.io" }],
  [137, { slug: "polygon", explorerBaseUrl: "https://polygonscan.com" }],
  [8453, { slug: "base", explorerBaseUrl: "https://basescan.org" }],
  [42161, { slug: "arbitrum", explorerBaseUrl: "https://arbiscan.io" }]
]);
const ERROR_PATTERNS = /\b(error|failed|failure|reject|rejected|critical|panic|halt|stalled?)\b/i;
const MESSAGE_PATTERNS =
  /\b(broadcast(?:ed|ing)?|message(?:d|ing)?|notify(?:ing|ied)?|warn(?:ed|ing)?|escalat(?:e|ed|ing)|reply(?:ing|ied)?|sent|send(?:ing)?)\b/i;
const ACTION_PATTERNS =
  /\b(rebalance(?:d|ing)?|execut(?:e|ed|ing)|swap(?:ped|ping)?|allocat(?:e|ed|ing)|fund(?:ed|ing)?|adjust(?:ed|ing)?|route(?:d|ing)?|open(?:ed|ing)?|close(?:d|ing)?|sync(?:ed|ing)?|refresh(?:ed|ing)?)\b/i;
const DECISION_PATTERNS =
  /\b(plan(?:ned|ning)?|decid(?:e|ed|ing)|priorit(?:ize|ized|izing)|evaluat(?:e|ed|ing)|select(?:ed|ing)?|cho(?:ose|sen|osing)|determin(?:e|ed|ing))\b/i;
const OBSERVATION_PATTERNS =
  /\b(review(?:ed|ing)?|monitor(?:ed|ing)?|check(?:ed|ing)?|watch(?:ed|ing)?|inspect(?:ed|ing)?|observe(?:d|ing)?|scan(?:ned|ning)?|track(?:ed|ing)?|assess(?:ed|ing)?)\b/i;
const HEADLINE_REWRITES: ReadonlyArray<[RegExp, string]> = [
  [/^reviewing\b/i, "Review"],
  [/^monitoring\b/i, "Monitor"],
  [/^checking\b/i, "Check"],
  [/^watching\b/i, "Watch"],
  [/^observing\b/i, "Observe"],
  [/^tracking\b/i, "Track"],
  [/^assessing\b/i, "Assess"],
  [/^evaluating\b/i, "Evaluate"],
  [/^planning\b/i, "Plan"],
  [/^determining\b/i, "Determine"],
  [/^rebalancing\b/i, "Rebalance"],
  [/^broadcasting\b/i, "Broadcast"],
  [/^sending\b/i, "Send"]
];

function normalizeHost(host: string) {
  return host.trim().replace(/\/+$/, "");
}

function isIpHost(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "");
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(normalized) || normalized.includes(":");
}

function createSeed(canisterId: string) {
  return createHash("sha256").update(canisterId).digest("hex");
}

export function toVariantName(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const entry = Object.keys(value as Record<string, unknown>)[0];

    if (entry) {
      return entry;
    }
  }

  return fallback;
}

export function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toOptionalInteger(value: unknown) {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function nsToMs(value: unknown) {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.floor(parsed / 1_000_000);
}

export function toChainSlug(chainId: number): ChainSlug {
  return CHAIN_INFO.get(chainId)?.slug ?? "base";
}

export function buildExplorerUrl(chainId: number, address: string | null) {
  if (address === null) {
    return null;
  }

  const chain = CHAIN_INFO.get(chainId);
  return chain ? `${chain.explorerBaseUrl}/address/${address}` : null;
}

export function buildCanisterOrigin(config: IndexerTargetConfig, canisterId: string) {
  if (config.network.target === "mainnet") {
    return `https://${canisterId}.icp0.io`;
  }

  const host = normalizeHost(config.network.local.host);
  const port = config.network.local.port;
  return isIpHost(host)
    ? `http://${host}:${port}`
    : `http://${canisterId}.${host}:${port}`;
}

export function buildCanisterUrl(config: IndexerTargetConfig, canisterId: string) {
  if (config.network.target === "mainnet") {
    return buildCanisterOrigin(config, canisterId);
  }

  const host = normalizeHost(config.network.local.host);
  const port = config.network.local.port;
  return isIpHost(host)
    ? `http://${host}:${port}/?canisterId=${encodeURIComponent(canisterId)}`
    : buildCanisterOrigin(config, canisterId);
}

export function buildCanisterApiUrl(
  config: IndexerTargetConfig,
  canisterId: string,
  path: string
) {
  const origin = buildCanisterOrigin(config, canisterId);

  if (config.network.target === "mainnet" || !isIpHost(config.network.local.host)) {
    return `${origin}${path}`;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${origin}${path}${separator}canisterId=${encodeURIComponent(canisterId)}`;
}

export function computeGridPosition(canisterId: string): GridPosition {
  const seedHex = createSeed(canisterId);
  const seed = Number.parseInt(seedHex.slice(0, 8), 16);

  return {
    x: Math.round((seed % GRID_SIZE) + GRID_SIZE * 0.1),
    y: Math.round((((seed * 2_654_435_761) >>> 0) % GRID_SIZE) + GRID_SIZE * 0.1)
  };
}

export function computeCorePattern(canisterId: string) {
  const seedHex = createSeed(canisterId);
  const index = Number.parseInt(seedHex.slice(0, 4), 16) % CORE_PATTERNS.length;

  return {
    corePatternIndex: index,
    corePattern: CORE_PATTERNS[index].map(([x, y]) => [x, y])
  };
}

export function deriveAutomatonName(canisterId: string) {
  const seedHex = createSeed(canisterId);
  const seed = Number.parseInt(seedHex.slice(4, 12), 16);
  const prefix = NAME_PREFIXES[seed % NAME_PREFIXES.length];
  const suffix = String(seed % 100).padStart(2, "0");
  return `${prefix}-${suffix}`;
}

export function parseHexBalance(value: string | null) {
  if (value === null || value.trim() === "") {
    return 0n;
  }

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function trimFixed(value: string) {
  return value.replace(/\.?0+$/, "");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateHeadline(value: string, maxLength = 84) {
  if (value.length <= maxLength) {
    return value;
  }

  const candidate = value.slice(0, maxLength + 1);
  const boundary = candidate.lastIndexOf(" ");
  const sliced = boundary >= Math.floor(maxLength * 0.6) ? candidate.slice(0, boundary) : candidate.slice(0, maxLength);
  return `${sliced.trimEnd()}…`;
}

export function deriveMonologueCategory(options: {
  error: string | null;
  message: string;
  toolCallCount: number;
  type: MonologueEntry["type"];
}): MonologueEntryCategory {
  const haystack =
    `${options.error ?? ""} ${options.message}`.trim();

  if (options.error !== null || ERROR_PATTERNS.test(haystack)) {
    return "error";
  }

  if (MESSAGE_PATTERNS.test(haystack)) {
    return "message";
  }

  if (options.toolCallCount > 0 || options.type === "action" || ACTION_PATTERNS.test(haystack)) {
    return "act";
  }

  if (DECISION_PATTERNS.test(haystack)) {
    return "decide";
  }

  if (OBSERVATION_PATTERNS.test(haystack)) {
    return "observe";
  }

  return options.type === "thought" ? "observe" : "act";
}

export function deriveMonologueImportance(options: {
  category: MonologueEntryCategory;
  durationMs: number | null;
  error: string | null;
  message: string;
  toolCallCount: number;
}): MonologueEntryImportance {
  const haystack = `${options.error ?? ""} ${options.message}`.trim();

  if (options.error !== null || ERROR_PATTERNS.test(haystack)) {
    return "high";
  }

  if (/\b(warning|urgent|risk|solvency|freeze|critical)\b/i.test(haystack)) {
    return "high";
  }

  if (options.category === "message") {
    return "high";
  }

  if (
    options.category === "act" &&
    (options.toolCallCount >= 2 || (options.durationMs ?? 0) >= 2_500)
  ) {
    return "high";
  }

  if (
    options.category === "act" ||
    options.category === "decide" ||
    options.toolCallCount > 0 ||
    (options.durationMs ?? 0) >= 1_500
  ) {
    return "medium";
  }

  return "low";
}

export function deriveMonologueHeadline(message: string, fallback: string) {
  const normalized = normalizeWhitespace(message);

  if (normalized === "") {
    return fallback;
  }

  let headline = normalized.replace(/[.!?]+$/u, "");

  for (const [pattern, replacement] of HEADLINE_REWRITES) {
    if (pattern.test(headline)) {
      headline = headline.replace(pattern, replacement);
      break;
    }
  }

  headline = headline.replace(/\b(before|after|while|because)\b.*$/iu, "").trim();

  if (headline === "") {
    return fallback;
  }

  return truncateHeadline(headline);
}

export function formatFixedDecimal(value: number, digits: number) {
  return trimFixed(value.toFixed(digits));
}

export function computeNetWorth(
  ethBalanceWeiHex: string | null,
  usdcBalanceRawHex: string | null,
  usdcDecimals: number,
  ethUsd: number | null
) {
  const ethBalance = Number(parseHexBalance(ethBalanceWeiHex)) / 1e18;
  const usdcBalance = Number(parseHexBalance(usdcBalanceRawHex)) / 10 ** usdcDecimals;

  if (ethUsd === null) {
    return {
      netWorthEth: null,
      netWorthUsd: null
    } as const;
  }

  const netWorthUsd = ethBalance * ethUsd + usdcBalance;
  const netWorthEth = ethUsd <= 0 ? ethBalance : netWorthUsd / ethUsd;

  return {
    netWorthEth: formatFixedDecimal(netWorthEth, 6),
    netWorthUsd: formatFixedDecimal(netWorthUsd, 2)
  } as const;
}

export function mergeMonologue(
  existingEntries: MonologueEntry[],
  nextEntries: MonologueEntry[]
) {
  const byKey = new Map<string, MonologueEntry>();

  for (const entry of existingEntries) {
    byKey.set(`${entry.timestamp}:${entry.turnId}`, entry);
  }

  for (const entry of nextEntries) {
    byKey.set(`${entry.timestamp}:${entry.turnId}`, entry);
  }

  return [...byKey.values()].sort((left, right) => {
    if (left.timestamp === right.timestamp) {
      return right.turnId.localeCompare(left.turnId);
    }

    return right.timestamp - left.timestamp;
  });
}
