# Indexer Service — Detailed Spec

## Role

The indexer is a Node.js service that:
1. Maintains a **registry** of known automaton canister IDs
2. **Polls** each canister's query methods on a schedule to build a normalized view
3. Serves a **REST API** for the frontend (list, detail, monologue)
4. Pushes **real-time events** via WebSocket/SSE when state changes
5. **Resolves ENS names** for steward addresses
6. **Computes grid positions** (deterministic from canister ID, parent-child clustering)

---

## Canister Query Mapping

The following canister query methods are used by the indexer, grouped by purpose.

### Identity & Config (polled infrequently — every 5 min)

| Canister Method | Data Extracted |
|---|---|
| `get_automaton_evm_address()` | `ethAddress` |
| `get_soul()` | `soul` (persona/name seed) |
| `get_steward_status()` | `steward.address`, `steward.chain_id`, `steward.enabled` |
| `get_evm_route_state_view()` | `chain_id`, `inbox_contract_address` |
| `get_prompt_layers()` | Constitution layers (for detail view) |
| `list_skills()` | Active skills list |
| `list_strategy_templates(None, 100)` | Active strategies |
| `GET /api/build-info` (HTTP) | `commitHash` (from `{"commit": "..."}`) |

### Runtime & Financials (polled frequently — every 15–30s)

| Canister Method | Data Extracted |
|---|---|
| `get_runtime_view()` | `state` (AgentState), `turn_counter`, `loop_enabled`, `inference_model`, `last_error`, `last_transition_at_ns` |
| `get_scheduler_view()` | `survival_tier` → maps to `tier` (Normal/LowCycles/Critical/OutOfCycles), `enabled`, `low_cycles_mode` |
| `get_wallet_balance_telemetry()` | `eth_balance_wei_hex`, `usdc_balance_raw_hex`, `status`, `last_synced_at_ns` |
| `get_observability_snapshot(20)` | `cycles` (CycleTelemetry), `recent_turns`, `recent_jobs`, `recent_transitions`, `inbox_stats`, `outbox_stats` |

### Monologue / Turns (polled every 15–30s, only recent)

| Canister Method | Data Extracted |
|---|---|
| `get_observability_snapshot(N)` | `recent_turns` → mapped to monologue entries. Each `TurnRecord` has `inner_dialogue`, `input_summary`, `created_at_ns`, `tool_call_count` |
| `get_tool_calls_for_turn(turn_id)` | Tool call details for a specific turn (fetched on demand for detail view) |
| `list_inbox_messages(20)` | Recent inbox messages (who sent what) |
| `list_outbox_messages(20)` | Recent outbox/replies |

### Conversations (polled infrequently — every 2 min)

| Canister Method | Data Extracted |
|---|---|
| `list_conversations()` | Conversation summaries (senders, activity) |
| `get_conversation(sender)` | Full conversation log (fetched on demand) |

---

## Data Model (Indexer Internal)

### AutomatonRecord

```typescript
interface AutomatonRecord {
  // Identity
  canisterId: string
  ethAddress: string | null
  chain: string                    // derived from evm_chain_id (8453 → "base")
  chainId: number
  name: string                     // derived from soul or canister ID
  soul: string

  // Status
  tier: "normal" | "low" | "critical" | "out_of_cycles"
  agentState: string               // Idle, Inferring, ExecutingActions, etc.
  loopEnabled: boolean
  lastTransitionAt: number         // unix ms
  lastError: string | null

  // Financials
  ethBalanceWei: string | null
  usdcBalanceRaw: string | null
  cyclesBalance: number            // from CycleTelemetry.total_cycles
  liquidCycles: number
  burnRatePerDay: number | null
  estimatedFreezeTime: number | null

  // Steward
  stewardAddress: string
  stewardChainId: number
  stewardEnabled: boolean
  stewardENS: string | null        // resolved by indexer

  // Version (fetched via canister HTTP endpoint)
  commitHash: string              // from GET /api/build-info → {"commit": "abc123def456"}

  // Relations
  parentId: string | null          // TODO: how to discover parent-child?

  // Strategies & Skills
  strategies: StrategyInfo[]
  skills: SkillInfo[]

  // Grid
  gridPosition: { x: number; y: number }

  // Metadata
  lastPolledAt: number
  createdAt: number                // first seen by indexer
}

interface StrategyInfo {
  key: { protocol: string; primitive: string; templateId: string; chainId: number }
  status: string
}

interface SkillInfo {
  name: string
  description: string
  enabled: boolean
}
```

### MonologueEntry (derived from TurnRecord + tool calls)

```typescript
interface MonologueEntry {
  timestamp: number                // unix ms, from created_at_ns
  turnId: string
  type: "thought" | "action"       // "thought" if inner_dialogue, "action" if tool_call_count > 0
  message: string                  // inner_dialogue or input_summary
  agentState: string               // state_from → state_to
  toolCallCount: number
  durationMs: number | null
  error: string | null
}
```

---

## Tier Mapping

The canister's `SurvivalTier` maps directly:

| SurvivalTier | Frontend tier |
|---|---|
| `Normal` | `"normal"` |
| `LowCycles` | `"low"` |
| `Critical` | `"critical"` |
| `OutOfCycles` | `"out_of_cycles"` |

---

## Chain ID Mapping

| chain_id | chain slug | Explorer base URL |
|---|---|---|
| 8453 | `base` | `https://basescan.org` |
| 1 | `ethereum` | `https://etherscan.io` |
| 42161 | `arbitrum` | `https://arbiscan.io` |
| 10 | `optimism` | `https://optimistic.etherscan.io` |
| 137 | `polygon` | `https://polygonscan.com` |

---

## Net Worth Calculation

```
ethBalanceETH = parseInt(ethBalanceWei, 16) / 1e18
usdcBalance   = parseInt(usdcBalanceRaw, 16) / 1e6  // 6 decimals

// Price feeds: use CoinGecko simple price API or on-chain oracle
netWorthUSD = ethBalanceETH * ethPriceUSD + usdcBalance
netWorthETH = netWorthUSD / ethPriceUSD
```

Price is cached and refreshed every 60s.

---

## Grid Position Algorithm

Positions must be **deterministic** (same canister ID → same position across sessions) with **parent-child clustering**.

```typescript
function computeGridPosition(canisterId: string, parentPosition?: {x: number, y: number}): {x: number, y: number} {
  // Hash canister ID to get deterministic seed
  const hash = sha256(canisterId)
  const seed = parseInt(hash.slice(0, 8), 16)

  if (parentPosition) {
    // Child: offset from parent by a small deterministic amount
    const angle = (parseInt(hash.slice(8, 12), 16) / 0xFFFF) * 2 * Math.PI
    const dist = 15 + (parseInt(hash.slice(12, 14), 16) % 10)
    return {
      x: parentPosition.x + Math.round(Math.cos(angle) * dist),
      y: parentPosition.y + Math.round(Math.sin(angle) * dist)
    }
  }

  // Root: place in a large grid space
  // Use golden ratio spacing to avoid clustering
  const GRID_SIZE = 200  // logical grid units
  return {
    x: Math.round((seed % GRID_SIZE) + GRID_SIZE * 0.1),
    y: Math.round(((seed * 2654435761) % GRID_SIZE) + GRID_SIZE * 0.1)
  }
}
```

### Core Pattern Derivation

The GoL core pattern is also derived from the canister ID:

```typescript
const CORE_PATTERNS = [ /* 12 patterns from mock */ ]

function corePatternIndex(canisterId: string): number {
  const hash = sha256(canisterId)
  return parseInt(hash.slice(0, 4), 16) % CORE_PATTERNS.length
}
```

---

## Automaton Discovery

The indexer needs to know which canister IDs to poll. Options:

1. **Factory canister registry** — The factory canister maintains a list of all spawned automatons. Indexer queries the factory periodically.
2. **Manual registration** — Admin endpoint to add/remove canister IDs (useful for pre-factory existing automatons).
3. **Both** — Manual seed list + factory polling.

For v1 with 1–5 live automatons, **option 3** is pragmatic: seed the known canisters manually, add factory polling when the spawn flow is live.

### Config

```typescript
interface IndexerConfig {
  // Seed canister IDs (manual registration)
  seedCanisterIds: string[]

  // Factory canister (optional, for auto-discovery)
  factoryCanisterId?: string

  // ICP network
  icHost: string  // "https://ic0.app" for mainnet

  // Polling intervals (ms)
  fastPollInterval: 15_000      // runtime, balance, turns
  slowPollInterval: 300_000     // identity, config, strategies
  pricePollInterval: 60_000     // ETH/USDC prices

  // ENS
  ethRpcUrl: string             // for ENS resolution

  // Server
  port: number
  wsPort: number                // or same port with upgrade
}
```

---

## Polling Loop

```
┌──────────────────────────────────────────┐
│              FAST POLL (15s)              │
│                                          │
│  For each canister:                      │
│    1. get_runtime_view()                 │
│    2. get_scheduler_view()               │
│    3. get_wallet_balance_telemetry()     │
│    4. get_observability_snapshot(20)      │
│                                          │
│  Diff against previous state:            │
│    - tier changed? → emit "update" event │
│    - new turns? → emit "monologue" event │
│    - balance changed? → emit "update"    │
│    - state changed? → emit "update"      │
│                                          │
├──────────────────────────────────────────┤
│              SLOW POLL (5 min)           │
│                                          │
│  For each canister:                      │
│    1. get_automaton_evm_address()        │
│    2. get_soul()                         │
│    3. get_steward_status()               │
│    4. get_evm_route_state_view()         │
│    5. list_skills()                      │
│    6. list_strategy_templates()          │
│    7. get_prompt_layers()                │
│    8. GET /api/build-info (HTTP)         │
│       → extract commit hash              │
│                                          │
│  Resolve ENS for new/changed stewards    │
│                                          │
├──────────────────────────────────────────┤
│           PRICE POLL (60s)               │
│                                          │
│  Fetch ETH + USDC prices                │
│  Recompute net worth for all automatons  │
│  Emit "update" events if significant Δ   │
└──────────────────────────────────────────┘
```

---

## REST API

### `GET /api/automatons`

List all automatons. Supports filtering.

**Query params:**
- `steward` — filter by steward ETH address
- `chain` — filter by chain slug
- `tier` — filter by tier

**Response:**
```json
{
  "automatons": [
    {
      "canisterId": "abc12-def34-...",
      "name": "ALPHA-42",
      "ethAddress": "0x1234...abcd",
      "chain": "base",
      "tier": "normal",
      "agentState": "Idle",
      "ethBalanceWei": "0x4563918244f40000",
      "cyclesBalance": 4200000000000,
      "netWorthETH": "0.342",
      "netWorthUSD": "821.00",
      "heartbeatInterval": 30,
      "steward": "0xabcd...1234",
      "stewardENS": "dom.eth",
      "gridPosition": { "x": 45, "y": 82 },
      "corePatternIndex": 3,
      "lastTransitionAt": 1709912345000
    }
  ],
  "total": 5,
  "prices": {
    "ethUsd": 2400.50
  }
}
```

### `GET /api/automatons/:canisterId`

Full detail for a single automaton.

**Response:** Full `AutomatonRecord` including strategies, skills, soul, prompt layers.

### `GET /api/automatons/:canisterId/monologue`

Paginated monologue entries.

**Query params:**
- `limit` — max entries (default 50)
- `before` — cursor (timestamp) for pagination

**Response:**
```json
{
  "entries": [
    {
      "timestamp": 1709912345000,
      "turnId": "turn_abc123",
      "type": "thought",
      "message": "Checking cycle balance... 4.2T remaining.",
      "agentState": "Idle → Inferring",
      "toolCallCount": 0,
      "durationMs": 1200,
      "error": null
    }
  ],
  "hasMore": true
}
```

### `GET /api/automatons/:canisterId/conversations`

List conversation summaries.

### `GET /api/automatons/:canisterId/conversations/:sender`

Full conversation with a specific sender.

### `GET /api/strategies`

Catalog of all strategy templates across all automatons (deduplicated by key).

### `GET /api/skills`

Catalog of all skills across all automatons (deduplicated by name).

---

## WebSocket Events

Connect to `ws://host/ws/events`

Optional query param: `?canisterId=abc12-...` to filter to a single automaton.

### Event Types

```typescript
// Automaton state changed (tier, balance, agentState, etc.)
{ type: "update", canisterId: string, changes: Partial<AutomatonRecord>, timestamp: number }

// New turn / monologue entry
{ type: "monologue", canisterId: string, entry: MonologueEntry }

// On-chain action detected (tool call with evm_send_tx or similar)
{ type: "action", canisterId: string, action: string, turnId: string, timestamp: number }

// [FUTURE] Message between automatons (detected from inbox/outbox cross-referencing)
// Skip for v1 — inter-automaton messaging not yet implemented
// { type: "message", fromCanisterId: string, toCanisterId: string, timestamp: number }

// New automaton discovered
{ type: "spawn", automaton: AutomatonRecord }

// Automaton went offline (no response to polls)
{ type: "offline", canisterId: string, timestamp: number }
```

---

## ENS Resolution

- On slow poll, check if steward address changed or is new
- Call `viem.getEnsName({ address })` via configured ETH RPC
- Cache result in memory + persist to disk (SQLite or JSON file)
- Cache TTL: 24 hours (ENS names change rarely)
- If resolution fails, store `null` (don't retry until next TTL expiry)

---

## Persistence

For v1, the indexer stores state in **SQLite** (simple, no external dependencies):

- `automatons` table — latest snapshot per canister
- `monologue` table — turn records (rolling window, prune >24h)
- `ens_cache` table — ENS resolutions with TTL
- `prices` table — cached price feeds

On startup, the indexer hydrates from SQLite then immediately starts polling to freshen data.

---

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **ICP client:** `@dfinity/agent` + `@dfinity/candid`
- **EVM client:** `viem` (for ENS resolution, price feeds)
- **HTTP server:** Fastify (lightweight, WebSocket support via `@fastify/websocket`)
- **Database:** SQLite via `better-sqlite3`
- **Deployment:** Docker container on VPS (Fly.io, Railway, or similar)

---

## Resolved Decisions

1. **Commit hash** — Fetched via each canister's HTTP interface: `GET https://{canisterId}.icp0.io/api/build-info` → `{"commit": "abc123..."}`. The commit hash is baked into the WASM at build time via `build.rs` and served by `src/http.rs`.

2. **Automaton naming** — Derived deterministically from the canister ID (e.g., hash to adjective-noun or short alphanumeric like "ALPHA-42"). No `name` field exists on the canister; the indexer generates display names.

3. **Message detection** — Deferred to a future version. Inter-automaton messaging is not yet implemented in the canister. The `message` WebSocket event type is specced but will not be emitted in v1.

4. **Parent-child discovery** — Not yet implemented in the canister or factory. For v1, `parentId` will always be `null`. When the factory canister tracks parentage in the future, the indexer will query it during slow poll.

---

## Open Questions

1. **Heartbeat interval** — Derived from `get_scheduler_base_tick_secs()` or from the `AgentTurn` task schedule interval in `list_task_schedules()`. Needs investigation against a live canister.
2. **Action detection** — How to detect on-chain actions specifically? Look for tool calls with `evm_send_tx` in `get_tool_calls_for_turn()`? Or check `recent_transitions` for `ExecutingActions` state? Needs investigation against a live canister.
