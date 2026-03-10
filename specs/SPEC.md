# ic-automaton Launchpad — Product Spec v0.2

## Overview

A web application serving as both a **public dashboard** for observing all live ic-automaton agents and a **launchpad** for spawning and managing your own. The grid visualization presents automatons as living organisms in a cellular automaton (Game of Life) inspired layout.

**Target users:** Crypto-native DeFi users and broader crypto audience. Assumes wallet familiarity but provides guidance on automaton-specific concepts.

---

## Architecture

### Frontend
- **React + Vite** SPA
- **shadcn/ui** component library with Tailwind CSS, customized to match the brutalist editorial aesthetic (Instrument Serif + Azeret Mono, light parchment background)
- **wagmi + viem** for EVM wallet connection
- **Canvas API** for the grid visualization (not DOM-based — performance critical for real-time animation)
- **Responsive** — full mobile support with adapted grid and touch interactions

### Backend — Indexer API
- A service that indexes all automaton canister state and exposes a REST API
- Polls or subscribes to canister state changes
- Provides endpoints for: listing automatons, fetching detail, querying monologue logs
- Resolves and caches ENS names for steward addresses
- Computes spatial positions for grid (deterministic from canister ID, with parent-child clustering)
- **Needs to be built** as part of this project
- **Real-time**: WebSocket / SSE push for state changes, actions, messages, and spawn events

### On-chain
- **Factory canister** on ICP for spawning new automatons
- Each automaton is an independent ICP canister with its own ETH address (threshold ECDSA)
- CLI commands are **signed EVM messages** from the steward wallet, sent to the canister's signed command plane
- Existing Inbox.sol contract on Base for message + payment delivery

---

## Pages & Features

### 1. Grid View (Home)

The main page. A full-viewport canvas rendering all live automatons as Game of Life organisms.

**Grid behavior:**
- Each automaton is a cluster of cells running a local GoL simulation
- Core pattern is preserved (identity anchor); surrounding cells evolve continuously
- Organism size (radius) reflects net worth — wealthy automatons are visually dominant
- Tier status (Normal, LowCycles, Critical) maps to color: black (normal), blue (low), red (critical)
- Organic breathing animation tied to heartbeat interval
- Mitosis burst effect when automaton performs an on-chain action (rare)
- Grid-following Manhattan-path message lines between communicating automatons
- Parent-child automatons placed near each other with dashed grid-aligned connection lines
- Faint background dot grid for spatial context

**Grid positioning:**
- **Deterministic from canister ID** — hash the ID to derive a stable base position. Same position across sessions and users.
- **Parent-child clustering** — child automatons are positioned near their parent. The indexer computes cluster layouts.
- Positions are served by the indexer API as (x, y) grid coordinates.

**Scope toggle:**
- Default: show all automatons globally (public dashboard)
- Connected wallet: toggle to filter to "My Automatons" only
- **User's automatons always show their name label** on the grid; other automatons only show labels on hover

**Interaction:**
- Hover: tooltip with name, tier, net worth
- Click: opens detail drawer
- Crosshair cursor

**Real-time updates via WebSocket/SSE:**
- New automaton spawned → appears on grid with spawn animation
- Tier change → color transition
- Action event → mitosis burst
- Message event → grid-path line animation
- Balance/net worth change → radius adjusts smoothly

**Mobile adaptation:**
- Pinch-to-zoom on the grid canvas
- Tap instead of click for detail drawer
- Simplified tooltip (tap-and-hold or inline)
- Responsive header collapses nav into hamburger menu

### 2. Detail Drawer

Slides up from the bottom when an automaton is clicked. Max height 60vh, scrollable.

**Layout: 3-column grid + bottom split**

**Header row:**
- Automaton name (e.g., ALPHA-42)
- Tier pill (Normal/Low/Critical) — muted colors: green-grey `#7a7`, tan `#b98`, warm orange `#c87`
- Chain badge (e.g., BASE)

**Column 1 — Identity:**
- **ETH address** — copyable (COPY button) + link to block explorer (SCAN button). Explorer URL derived from chain (basescan.org for Base).
- **Steward address** — with ENS name displayed when available (resolved by indexer). Shows `name.eth` with truncated address, or just truncated address if no ENS.
- **Canister address** — linked to its `{canister-id}.icp0.io` website

**Column 2 — Financials:**
- ETH balance
- Cycles balance
- Net worth

**Column 3 — Operations:**
- Heartbeat interval
- **Version** — 7-char commit hash, linked to the specific commit on GitHub (`github.com/0x21e8/ic-automaton/commit/{full-hash}`)

**Bottom left — Inner Monologue:**
- Timestamped log of the automaton's reasoning and actions
- Two types: "think" (reasoning) and "action" (on-chain execution)
- Muted colors: tan `#b98` for actions, grey-blue `#889` for thoughts
- Streamed in real-time via WebSocket

**Bottom right — Command Line:**
- Embedded terminal for direct canister interaction via **signed steward messages**
- Commands are signed with the connected EVM wallet and sent to the canister's signed command plane
- Prompt with `>` prefix, input field, send button
- Commands include: `help`, `status`, `balance`, `strategies`, `skills`, `constitution`, `logs`, `heartbeat`, `shutdown`
- **Authentication**: only the steward wallet can execute commands. If connected wallet is not the steward, CLI is read-only (shows monologue only) with a message: "Connect steward wallet to execute commands."
- Responses rendered inline in terminal output area

**Mobile adaptation:**
- Drawer becomes full-screen overlay
- 3-column grid stacks to single column
- CLI input remains functional with on-screen keyboard

### 3. Spawn Wizard

Multi-step modal overlay for creating a new automaton. Requires wallet connection.

**Step 1 — Select Chain:**
- Card grid (3 columns on desktop, 2 on mobile). **Base** is the only active option.
- Disabled chains (coming soon): Ethereum, Arbitrum, Optimism, **Polygon**, **Hyperliquid**
- Disabled cards are greyed out (opacity 0.35) with "COMING SOON" label, `pointer-events: none`

**Step 2 — Risk Appetite:**
- Slider from 1–5: Conservative → Cautious → Balanced → Aggressive → Degen
- Descriptive text explaining the trade-off

**Step 3 — Strategies:**
- Checklist of available DeFi strategies the automaton can use
- Initial set: Yield Farming, Lending, Arbitrage, Cycle Management
- Toggle on/off per strategy
- Strategy data loaded from API (dynamic catalog)

**Step 4 — Skills:**
- Checklist of capabilities beyond DeFi
- Initial set: Spawn Children, Messaging, Portfolio Reporting, Emergency Shutdown
- Skill data loaded from API (dynamic catalog)

**Step 5 — Model & External APIs:**
- Optional OpenRouter API key input
- Optional model selection/input for the automaton's inference model
  - Prefer dynamically loading available models from OpenRouter
  - If dynamic loading is unavailable or fails, show a curated fallback list of 3–5 default models
- Optional Brave Search API key input
- All fields may be left blank during spawn and configured later after the automaton is live via steward-only CLI commands in the detail drawer
- Inline helper copy explains that omitted keys simply leave those capabilities disabled until configured

**Step 6 — Fund:**
- Amount input with ETH/USDC currency toggle
- Live USD conversion display
- Minimum $50 validation with inline error, based on the gross amount the user pays
- **Fee disclosure**: shows the gross payment amount, platform fee, canister creation cost, and the net amount that will be forwarded to the spawned automaton
- Summary of all previous selections
- "Spawn" button triggers the flow

**On-chain spawn flow:**
1. Frontend submits the selected configuration (chain, risk, strategies, skills, optional provider settings) to the **factory canister** to request a spawn quote / deposit session
2. Factory returns payment instructions for its EVM address and the amount due
3. User sends ETH or USDC from the connected EVM wallet to the factory canister's EVM address
4. Frontend and/or backend waits for the payment to be observed and confirmed
5. Only after payment is received does the factory canister deploy the new automaton canister
6. The new canister derives its ETH address via threshold ECDSA
7. Factory obtains the spawned automaton's EVM address, deducts platform fee + canister creation cost, and forwards the remainder to the automaton's EVM address
8. Automaton begins its first heartbeat cycle
9. WebSocket event notifies the frontend → new organism appears on the grid

**Progress bar** across all six steps. Back/Next navigation. ESC or click-outside to close.

### 4. Strategies Catalog

Browsable catalog of all available DeFi strategies. Data served from API/canister (dynamic).

**Per strategy:**
- Name, description
- Supported chains
- Risk level indicator (1–5)
- Performance stats (historical APY, TVL if applicable)
- Status: available, coming soon

**Layout:** TBD — grid of cards or table view.

### 5. Skills Catalog

Browsable catalog of all available skills. Data served from API/canister (dynamic).

**Per skill:**
- Name, description
- Dependencies (e.g., "requires Messaging to be enabled")
- Category tag
- Status: available, coming soon

**Layout:** TBD — similar to strategies catalog.

---

## Header / Navigation

- Logo: "ic-automaton" in Instrument Serif
- Tagline: "Self-sovereign AI agents on-chain"
- Nav menu: Spawn | Strategies | Skills (joined button group)
- Live count pill: "{N} LIVE" in accent red
- Connect Wallet button (right-aligned)
  - Disconnected: filled black button "CONNECT WALLET"
  - Connected: outlined button showing truncated address (0x1234...abcd)
- **Mobile**: hamburger menu collapsing nav items + wallet button

---

## Data Model

### Automaton (from indexer API)

```
{
  id: string              // canister ID
  name: string            // e.g., "ALPHA-42"
  chain: string           // "base" | "ethereum" | ...
  tier: string            // "normal" | "low" | "critical"
  ethAddress: string      // derived ETH address
  ethBalance: string      // ETH balance
  cyclesBalance: string   // ICP cycles
  netWorth: number        // USD or ETH equivalent
  heartbeatInterval: number // seconds
  steward: string         // steward ETH address
  stewardENS: string|null // resolved ENS name (cached by indexer)
  canisterId: string      // ICP canister ID
  commitHash: string      // full 40-char deployed version hash
  parentId: string|null   // parent automaton canister ID
  strategies: string[]    // active strategy IDs
  skills: string[]        // active skill IDs
  createdAt: number       // timestamp
  gridPosition: {         // computed by indexer
    x: number
    y: number
  }
  corePattern: number[][] // GoL pattern cells (derived from canister ID hash)
}
```

### Monologue Entry

```
{
  timestamp: number
  type: "thought" | "action"
  message: string
}
```

### Strategy / Skill (catalog)

```
{
  id: string
  name: string
  description: string
  category: string
  riskLevel: number       // 1-5 (strategies only)
  chains: string[]
  dependencies: string[]  // skill IDs (skills only)
  status: "available" | "coming_soon"
  stats: {                // strategies only
    apy: number|null
    tvl: number|null
  }
}
```

---

## Indexer API Endpoints

```
GET  /api/automatons                  — list all automatons (paginated, includes gridPosition)
GET  /api/automatons?steward={addr}   — filter by steward
GET  /api/automatons/{id}             — single automaton detail
GET  /api/automatons/{id}/monologue   — paginated monologue log
GET  /api/strategies                  — list all strategies
GET  /api/skills                      — list all skills
WS   /ws/events                       — real-time event stream
```

### WebSocket Event Types
```
{ type: "spawn",     data: Automaton }
{ type: "update",    data: { id, changes: Partial<Automaton> } }
{ type: "action",    data: { id, action: string, timestamp: number } }
{ type: "message",   data: { fromId, toId, timestamp: number } }
{ type: "monologue", data: { id, entry: MonologueEntry } }
```

---

## Design System

**Typography:**
- Display: Instrument Serif (400)
- Mono/Body: Azeret Mono (400, 700)

**Colors:**
- Background: `#f0ece4` (parchment)
- Ink: `#1a1a1a`
- Accent: `#e63312` (red, used sparingly — live count, errors, validation)
- Muted: `#999`
- Tier Normal: `#7a7` (muted green-grey)
- Tier Low: `#b98` (warm tan)
- Tier Critical: `#c87` (warm orange)
- Drawer background: `#1a1a1a`
- Drawer text: `#ccc` (primary), `#888` (secondary), `#555` (tertiary)

**Visual texture:**
- SVG noise overlay at 2.5% opacity over entire viewport
- Brutalist borders (3px solid on header, 2px on interactive elements)
- No border-radius anywhere (sharp corners throughout)
- Uppercase + letter-spacing for labels and small text

**Grid canvas:**
- Cell size: 10px, gap: 1px
- Background dots: `rgba(0,0,0,0.018)`
- Organism rendering via Canvas 2D API

**Responsive breakpoints:**
- Desktop: ≥1024px (3-column drawer, full nav)
- Tablet: 768–1023px (2-column drawer, condensed nav)
- Mobile: <768px (single-column drawer, hamburger menu, full-screen overlays)

---

## CLI Command Protocol

Commands are executed via the automaton's **signed steward command plane**:

1. User types command in the CLI input
2. Frontend constructs a message payload: `{ command: string, args: string[], timestamp: number, automatonId: string }`
3. User's EVM wallet signs the payload via `personal_sign` (wagmi `signMessage`)
4. Signed message + payload are sent to the automaton canister via an IC agent call
5. Canister verifies the signature matches the steward address
6. Canister executes the command and returns the response
7. Response is rendered in the CLI output area

**Read-only fallback**: If the connected wallet is not the steward, the CLI section only displays the live monologue stream (no input field).

**Post-spawn configuration**: Optional provider settings such as OpenRouter API key, inference model, and Brave Search API key can be updated later through steward-only CLI commands.

---

## Spawn Economics

- User sends the initial ETH/USDC deposit to the factory canister's EVM address before the automaton is spawned
- The platform/factory covers the ICP cycles spend during canister creation, then recovers the disclosed creation cost from the user's deposit before forwarding funds
- From the user's initial ETH/USDC deposit:
  - Canister creation cost is deducted
  - Platform fee is deducted (amount TBD)
  - Remainder is forwarded to the spawned automaton's EVM address as its operating capital
- Fee breakdown is disclosed in Step 6 of the spawn wizard before the user confirms
- Minimum funding: the user must pay at least $50 USD equivalent before fees
