import type { ChainSlug } from "./automaton.js";

export const CATALOG_ENTRY_STATUSES = [
  "available",
  "coming_soon"
] as const;

export type CatalogEntryStatus = (typeof CATALOG_ENTRY_STATUSES)[number];
export type StrategyRiskLevel = 1 | 2 | 3 | 4 | 5;

export interface StrategyCatalogStats {
  apy: number | null;
  tvl: number | null;
}

export interface StrategyCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  chains: ChainSlug[];
  riskLevel: StrategyRiskLevel;
  stats: StrategyCatalogStats;
  status: CatalogEntryStatus;
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  dependencies: string[];
  category: string;
  status: CatalogEntryStatus;
}

export interface CatalogResponse<TEntry> {
  items: TEntry[];
  updatedAt: number;
}

export type StrategyCatalogResponse = CatalogResponse<StrategyCatalogEntry>;
export type SkillCatalogResponse = CatalogResponse<SkillCatalogEntry>;
