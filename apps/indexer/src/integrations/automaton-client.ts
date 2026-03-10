import {
  Actor,
  HttpAgent,
  type ActorMethod,
  type ActorSubclass
} from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";

import type { IndexerTargetConfig } from "../indexer.config.js";
import { buildCanisterApiUrl } from "../lib/automaton-derived.js";

export interface PromptLayerViewResponse {
  content: string;
  is_mutable: boolean;
  layer_id: number;
  updated_at_ns: [] | [bigint];
  updated_by_turn: [] | [string];
  version: [] | [number];
}

export interface SkillRecordResponse {
  allowed_canister_calls: Array<{
    call_type: { Query?: null; Update?: null };
    canister_id: string;
    method: string;
  }>;
  description: string;
  enabled: boolean;
  instructions: string;
  mutable: boolean;
  name: string;
}

export interface StrategyTemplateResponse {
  actions: Array<{
    action_id: string;
    call_sequence: Array<{
      inputs: unknown[];
      name: string;
      outputs: unknown[];
      role: string;
      selector_hex: string;
      state_mutability: string;
    }>;
    postconditions: string[];
    preconditions: string[];
    risk_checks: string[];
  }>;
  constraints_json: string;
  contract_roles: Array<{
    address: string;
    codehash: [] | [string];
    role: string;
    source_ref: string;
  }>;
  created_at_ns: bigint;
  key: {
    chain_id: bigint;
    primitive: string;
    protocol: string;
    template_id: string;
  };
  status: {
    Active?: null;
    Deprecated?: null;
    Draft?: null;
    Revoked?: null;
  };
  updated_at_ns: bigint;
}

interface AutomatonMetadataActor {
  get_prompt_layers: ActorMethod<[], PromptLayerViewResponse[]>;
  list_skills: ActorMethod<[], SkillRecordResponse[]>;
  list_strategy_templates: ActorMethod<[[] | [unknown], number], StrategyTemplateResponse[]>;
}

export interface HttpBuildInfoResponse {
  commit?: string;
}

export interface HttpEvmConfigResponse {
  automaton_address?: string | null;
  chain_id?: number;
  inbox_contract_address?: string | null;
}

export interface HttpSchedulerConfigResponse {
  base_tick_secs?: number;
  default_turn_interval_secs?: number;
  ticks_per_turn_interval?: number;
}

export interface HttpStewardStatusResponse {
  active_steward?: {
    address?: string;
    chain_id?: number;
    enabled?: boolean;
  } | null;
  next_nonce?: number;
}

export interface HttpWalletBalanceResponse {
  age_secs?: number | null;
  bootstrap_pending?: boolean;
  eth_balance_wei_hex?: string | null;
  freshness_window_secs?: number;
  is_stale?: boolean;
  last_error?: string | null;
  last_synced_at_ns?: number | null;
  status?: string | Record<string, null>;
  usdc_balance_raw_hex?: string | null;
  usdc_contract_address?: string | null;
  usdc_decimals?: number;
}

export interface HttpTurnRecordResponse {
  created_at_ns?: number;
  duration_ms?: number | null;
  error?: string | null;
  id?: string;
  inner_dialogue?: string | null;
  input_summary?: string;
  state_from?: string | Record<string, null>;
  state_to?: string | Record<string, null>;
  tool_call_count?: number;
}

export interface HttpSnapshotResponse {
  cycles?: {
    burn_rate_cycles_per_day?: number | null;
    estimated_freeze_time_ns?: number | null;
    liquid_cycles?: number;
    total_cycles?: number;
  };
  prompt_layers?: Array<{
    content?: string;
  }>;
  recent_turns?: HttpTurnRecordResponse[];
  runtime?: {
    last_error?: string | null;
    last_transition_at_ns?: number;
    loop_enabled?: boolean;
    soul?: string;
    state?: string | Record<string, null>;
  };
  scheduler?: {
    enabled?: boolean;
    last_tick_error?: string | null;
    survival_tier?: string | Record<string, null>;
  };
}

export interface IdentityConfigRead {
  buildInfo: HttpBuildInfoResponse;
  canisterId: string;
  evmConfig: HttpEvmConfigResponse;
  promptLayers: PromptLayerViewResponse[];
  schedulerConfig: HttpSchedulerConfigResponse;
  skills: SkillRecordResponse[];
  stewardStatus: HttpStewardStatusResponse;
  strategies: StrategyTemplateResponse[];
}

export interface RuntimeFinancialRead {
  canisterId: string;
  snapshot: HttpSnapshotResponse;
  walletBalance: HttpWalletBalanceResponse;
}

export interface RecentTurnsRead {
  canisterId: string;
  recentTurns: HttpTurnRecordResponse[];
}

export interface AutomatonClient {
  readIdentityConfig(canisterId: string): Promise<IdentityConfigRead>;
  readRuntimeFinancial(canisterId: string): Promise<RuntimeFinancialRead>;
  readRecentTurns(canisterId: string): Promise<RecentTurnsRead>;
}

function createAutomatonMetadataIdl() {
  return ({ IDL: candid }: { IDL: typeof IDL }) => {
    const CanisterCallType = candid.Variant({
      Query: candid.Null,
      Update: candid.Null
    });
    const CanisterCallPermission = candid.Record({
      canister_id: candid.Text,
      method: candid.Text,
      call_type: CanisterCallType
    });
    const SkillRecord = candid.Record({
      name: candid.Text,
      description: candid.Text,
      instructions: candid.Text,
      enabled: candid.Bool,
      mutable: candid.Bool,
      allowed_canister_calls: candid.Vec(CanisterCallPermission)
    });
    const StrategyTemplateKey = candid.Record({
      protocol: candid.Text,
      primitive: candid.Text,
      chain_id: candid.Nat64,
      template_id: candid.Text
    });
    const TemplateStatus = candid.Variant({
      Draft: candid.Null,
      Active: candid.Null,
      Deprecated: candid.Null,
      Revoked: candid.Null
    });
    const ContractRoleBinding = candid.Record({
      role: candid.Text,
      address: candid.Text,
      source_ref: candid.Text,
      codehash: candid.Opt(candid.Text)
    });
    const AbiTypeSpec = candid.Rec();
    const AbiFunctionSpec = candid.Record({
      role: candid.Text,
      name: candid.Text,
      selector_hex: candid.Text,
      inputs: candid.Vec(AbiTypeSpec),
      outputs: candid.Vec(AbiTypeSpec),
      state_mutability: candid.Text
    });
    AbiTypeSpec.fill(
      candid.Record({
        name: candid.Text,
        kind: candid.Text,
        components: candid.Vec(AbiTypeSpec)
      })
    );
    const ActionSpec = candid.Record({
      action_id: candid.Text,
      call_sequence: candid.Vec(AbiFunctionSpec),
      preconditions: candid.Vec(candid.Text),
      postconditions: candid.Vec(candid.Text),
      risk_checks: candid.Vec(candid.Text)
    });
    const StrategyTemplate = candid.Record({
      key: StrategyTemplateKey,
      status: TemplateStatus,
      contract_roles: candid.Vec(ContractRoleBinding),
      actions: candid.Vec(ActionSpec),
      constraints_json: candid.Text,
      created_at_ns: candid.Nat64,
      updated_at_ns: candid.Nat64
    });
    const PromptLayerView = candid.Record({
      layer_id: candid.Nat8,
      is_mutable: candid.Bool,
      content: candid.Text,
      updated_at_ns: candid.Opt(candid.Nat64),
      updated_by_turn: candid.Opt(candid.Text),
      version: candid.Opt(candid.Nat32)
    });

    return candid.Service({
      get_prompt_layers: candid.Func([], [candid.Vec(PromptLayerView)], ["query"]),
      list_skills: candid.Func([], [candid.Vec(SkillRecord)], ["query"]),
      list_strategy_templates: candid.Func(
        [candid.Opt(StrategyTemplateKey), candid.Nat32],
        [candid.Vec(StrategyTemplate)],
        ["query"]
      )
    });
  };
}

export class LiveAutomatonClient implements AutomatonClient {
  private agentPromise?: Promise<HttpAgent>;
  private readonly actorCache = new Map<string, ActorSubclass<AutomatonMetadataActor>>();

  constructor(private readonly config: IndexerTargetConfig) {}

  async readIdentityConfig(canisterId: string): Promise<IdentityConfigRead> {
    const actor = await this.getActor(canisterId);
    const [
      buildInfo,
      evmConfig,
      stewardStatus,
      schedulerConfig,
      promptLayers,
      skills,
      strategies
    ] = await Promise.all([
      this.requestJson<HttpBuildInfoResponse>(canisterId, "/api/build-info"),
      this.requestJson<HttpEvmConfigResponse>(canisterId, "/api/evm/config"),
      this.requestJson<HttpStewardStatusResponse>(canisterId, "/api/steward/status"),
      this.requestJson<HttpSchedulerConfigResponse>(canisterId, "/api/scheduler/config"),
      actor.get_prompt_layers(),
      actor.list_skills(),
      actor.list_strategy_templates([], 100)
    ]);

    return {
      canisterId,
      buildInfo,
      evmConfig,
      stewardStatus,
      schedulerConfig,
      promptLayers,
      skills,
      strategies
    };
  }

  async readRuntimeFinancial(canisterId: string): Promise<RuntimeFinancialRead> {
    const [snapshot, walletBalance] = await Promise.all([
      this.requestJson<HttpSnapshotResponse>(canisterId, "/api/snapshot"),
      this.requestJson<HttpWalletBalanceResponse>(canisterId, "/api/wallet/balance")
    ]);

    return {
      canisterId,
      snapshot,
      walletBalance
    };
  }

  async readRecentTurns(canisterId: string): Promise<RecentTurnsRead> {
    const snapshot = await this.requestJson<HttpSnapshotResponse>(canisterId, "/api/snapshot");

    return {
      canisterId,
      recentTurns: snapshot.recent_turns ?? []
    };
  }

  private async getAgent() {
    this.agentPromise ??= (async () => {
      const host =
        this.config.network.target === "mainnet"
          ? "https://icp-api.io"
          : `http://${this.config.network.local.host}:${this.config.network.local.port}`;
      const agent = await HttpAgent.create({
        host
      });

      if (this.config.network.target === "local") {
        await agent.fetchRootKey();
      }

      return agent;
    })();

    return this.agentPromise;
  }

  private async getActor(canisterId: string) {
    const cached = this.actorCache.get(canisterId);

    if (cached) {
      return cached;
    }

    const agent = await this.getAgent();
    const actor = Actor.createActor<AutomatonMetadataActor>(
      createAutomatonMetadataIdl() as unknown as Parameters<typeof Actor.createActor>[0],
      {
      agent,
      canisterId
      }
    );

    this.actorCache.set(canisterId, actor);

    return actor;
  }

  private async requestJson<T>(canisterId: string, path: string): Promise<T> {
    const response = await fetch(buildCanisterApiUrl(this.config, canisterId, path), {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Canister HTTP request failed for ${canisterId} ${path}: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as T;
  }
}
