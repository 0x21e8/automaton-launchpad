import { describe, expect, it, vi } from "vitest";

import {
  mergeWalletProviders,
  selectPreferredWalletProvider,
  type WalletProviderOption
} from "./eip6963";

function createProvider(
  id: string,
  name: string,
  kind: WalletProviderOption["kind"] = "eip6963",
  provider = {
    request: vi.fn()
  }
): WalletProviderOption {
  return {
    icon: null,
    id,
    kind,
    name,
    provider,
    rdns: `${name.toLowerCase()}.wallet`
  };
}

describe("eip6963 wallet helpers", () => {
  it("prefers rich EIP-6963 metadata over the legacy window.ethereum fallback", () => {
    const sharedProvider = {
      request: vi.fn()
    };
    const legacyProvider = createProvider(
      "legacy:window.ethereum",
      "Injected wallet",
      "legacy",
      sharedProvider
    );
    const eip6963Provider = createProvider(
      "eip6963:metamask",
      "MetaMask",
      "eip6963",
      sharedProvider
    );

    const mergedProviders = mergeWalletProviders([legacyProvider], eip6963Provider);

    expect(mergedProviders).toHaveLength(1);
    expect(mergedProviders[0]).toMatchObject({
      id: "eip6963:metamask",
      kind: "eip6963",
      name: "MetaMask"
    });
  });

  it("falls back to the first detected provider when the preferred id is absent", () => {
    const providers = [
      createProvider("eip6963:metamask", "MetaMask"),
      createProvider("eip6963:rabby", "Rabby")
    ];

    expect(
      selectPreferredWalletProvider(providers, "eip6963:unknown")?.id
    ).toBe("eip6963:metamask");
    expect(
      selectPreferredWalletProvider(providers, "eip6963:rabby")?.name
    ).toBe("Rabby");
  });
});
