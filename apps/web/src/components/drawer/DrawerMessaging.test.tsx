import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AutomatonDetail } from "../../../../../packages/shared/src/automaton.js";
import { AutomatonDrawer } from "./AutomatonDrawer";
import { CommandLinePanel } from "./CommandLinePanel";
import { MonologuePanel } from "./MonologuePanel";

function createAutomatonDetail(): AutomatonDetail {
  return {
    agentState: "idle",
    canisterId: "txyno-ch777-77776-aaaaq-cai",
    canisterUrl: "http://txyno-ch777-77776-aaaaq-cai.localhost:8000/",
    chain: "base",
    chainId: 8453,
    childIds: [],
    corePattern: null,
    corePatternIndex: 0,
    createdAt: 1_700_000_000_000,
    cyclesBalance: 2_000_000_000_000,
    ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    ethBalanceWei: "1000000000000000000",
    explorerUrl: "https://basescan.org/address/0x1234567890abcdef1234567890abcdef12345678",
    financials: {
      burnRatePerDay: null,
      cyclesBalance: 2_000_000_000_000,
      estimatedFreezeTime: null,
      ethBalanceWei: "1000000000000000000",
      liquidCycles: 2_000_000_000_000,
      netWorthEth: "1.0",
      netWorthUsd: "2500",
      usdcBalanceRaw: "0"
    },
    gridPosition: {
      x: 0,
      y: 0
    },
    heartbeatIntervalSeconds: 60,
    lastPolledAt: 1_700_000_100_000,
    lastTransitionAt: 1_700_000_050_000,
    monologue: [],
    name: "Atlas",
    netWorthEth: "1.0",
    netWorthUsd: "2500",
    parentId: null,
    promptLayers: ["base constitution"],
    runtime: {
      agentState: "idle",
      heartbeatIntervalSeconds: 60,
      lastError: null,
      lastTransitionAt: 1_700_000_050_000,
      loopEnabled: true
    },
    skills: [
      {
        description: "Uses search",
        enabled: true,
        name: "search"
      }
    ],
    soul: "Tends the treasury.",
    steward: {
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      chainId: 8453,
      enabled: true,
      ensName: null
    },
    strategies: [
      {
        key: {
          chainId: 8453,
          primitive: "swap",
          protocol: "uniswap",
          templateId: "swap-usdc"
        },
        status: "active"
      }
    ],
    tier: "normal",
    usdcBalanceRaw: "0",
    version: {
      commitHash: "0123456789abcdef0123456789abcdef01234567",
      shortCommitHash: "0123456"
    }
  };
}

describe("drawer messaging", () => {
  it("distinguishes a missing indexed automaton from a generic detail failure", () => {
    const missingMarkup = renderToStaticMarkup(
      <AutomatonDrawer
        automaton={null}
        errorMessage="Automaton not found"
        isLoading={false}
        isOpen
        onClose={() => {}}
        selectedCanisterId="txyno-ch777-77776-aaaaq-cai"
        viewerAddress={null}
      />
    );

    expect(missingMarkup).toContain("Indexed automaton not found");
    expect(missingMarkup).toContain(
      "No indexed detail is available for txyno-ch777-77776-aaaaq-cai."
    );

    const failureMarkup = renderToStaticMarkup(
      <AutomatonDrawer
        automaton={null}
        errorMessage="Request failed with 503."
        isLoading={false}
        isOpen
        onClose={() => {}}
        selectedCanisterId="txyno-ch777-77776-aaaaq-cai"
        viewerAddress={null}
      />
    );

    expect(failureMarkup).toContain("Detail load failed");
    expect(failureMarkup).toContain(
      "Inspection data is unavailable until the detail request succeeds."
    );
  });

  it("renders the command panel as inspection-only reference text", () => {
    const markup = renderToStaticMarkup(
      <CommandLinePanel
        automaton={createAutomatonDetail()}
        canExecute
        errorMessage={null}
        isLoading={false}
        selectedCanisterId="txyno-ch777-77776-aaaaq-cai"
        viewerAddress="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      />
    );

    expect(markup).toContain("Command Surface");
    expect(markup).toContain("Inspection only");
    expect(markup).toContain(
      "Launchpad does not execute, sign, or broadcast canister commands."
    );
    expect(markup).not.toContain("Send");
    expect(markup).not.toContain("enter command");
  });

  it("labels empty monologue state as polling-backed indexed history", () => {
    const markup = renderToStaticMarkup(
      <MonologuePanel
        entries={[]}
        errorMessage={null}
        isLoading={false}
        selectedCanisterId="txyno-ch777-77776-aaaaq-cai"
      />
    );

    expect(markup).toContain("Polling-backed history");
    expect(markup).toContain(
      "No indexed turns yet. Recent activity appears after the next successful poll."
    );
  });
});
