import type { Eip1193RequestArgs } from "../lib/wallet-transport";

export interface InjectedWalletProvider {
  request<T = unknown>(args: Eip1193RequestArgs): Promise<T>;
  on?(event: "accountsChanged" | "chainChanged" | "disconnect", handler: (...args: any[]) => void): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged" | "disconnect",
    handler: (...args: any[]) => void
  ): void;
}

export interface Eip6963ProviderInfo {
  icon: string;
  name: string;
  rdns: string;
  uuid: string;
}

export interface WalletProviderOption {
  icon: string | null;
  id: string;
  kind: "eip6963" | "legacy";
  name: string;
  provider: InjectedWalletProvider;
  rdns: string;
}

interface Eip6963ProviderAnnouncement {
  detail?: {
    info?: Partial<Eip6963ProviderInfo>;
    provider?: InjectedWalletProvider;
  };
}

declare global {
  interface Window {
    ethereum?: InjectedWalletProvider;
  }
}

function isProvider(value: unknown): value is InjectedWalletProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    typeof value.request === "function"
  );
}

function createLegacyWalletProvider(
  provider: InjectedWalletProvider
): WalletProviderOption {
  return {
    icon: null,
    id: "legacy:window.ethereum",
    kind: "legacy",
    name: "Injected wallet",
    provider,
    rdns: "legacy.window.ethereum"
  };
}

function createEip6963WalletProvider(
  info: Eip6963ProviderInfo,
  provider: InjectedWalletProvider
): WalletProviderOption {
  return {
    icon: info.icon.trim() === "" ? null : info.icon,
    id: `eip6963:${info.uuid}`,
    kind: "eip6963",
    name: info.name.trim() === "" ? "Injected wallet" : info.name,
    provider,
    rdns: info.rdns.trim() === "" ? "unknown.provider" : info.rdns
  };
}

function normalizeAnnouncement(
  event: Event
): WalletProviderOption | null {
  const detail = (event as Eip6963ProviderAnnouncement).detail;
  const info = detail?.info;
  const provider = detail?.provider;

  if (
    !info ||
    typeof info.uuid !== "string" ||
    typeof info.name !== "string" ||
    typeof info.icon !== "string" ||
    typeof info.rdns !== "string" ||
    !isProvider(provider)
  ) {
    return null;
  }

  return createEip6963WalletProvider(
    {
      icon: info.icon,
      name: info.name,
      rdns: info.rdns,
      uuid: info.uuid
    },
    provider
  );
}

export function mergeWalletProviders(
  currentProviders: readonly WalletProviderOption[],
  nextProvider: WalletProviderOption
): WalletProviderOption[] {
  const providers = [...currentProviders];
  const existingIndex = providers.findIndex(
    (candidate) =>
      candidate.id === nextProvider.id || candidate.provider === nextProvider.provider
  );

  if (existingIndex === -1) {
    providers.push(nextProvider);
    return providers;
  }

  const existing = providers[existingIndex];

  if (existing.kind === "eip6963" && nextProvider.kind === "legacy") {
    return providers;
  }

  providers[existingIndex] = nextProvider;
  return providers;
}

export function selectPreferredWalletProvider(
  providers: readonly WalletProviderOption[],
  preferredProviderId: string | null
): WalletProviderOption | null {
  if (providers.length === 0) {
    return null;
  }

  if (preferredProviderId !== null) {
    const preferredProvider = providers.find(
      (provider) => provider.id === preferredProviderId
    );

    if (preferredProvider) {
      return preferredProvider;
    }
  }

  return providers[0] ?? null;
}

export function observeWalletProviders(
  onChange: (providers: WalletProviderOption[]) => void
) {
  if (typeof window === "undefined") {
    onChange([]);
    return () => undefined;
  }

  let providers: WalletProviderOption[] = [];

  const emit = () => {
    onChange([...providers]);
  };

  const legacyProvider = window.ethereum;
  if (legacyProvider) {
    providers = mergeWalletProviders(
      providers,
      createLegacyWalletProvider(legacyProvider)
    );
  }

  const handleAnnounce = (event: Event) => {
    const announcedProvider = normalizeAnnouncement(event);

    if (announcedProvider === null) {
      return;
    }

    providers = mergeWalletProviders(providers, announcedProvider);
    emit();
  };

  window.addEventListener(
    "eip6963:announceProvider",
    handleAnnounce as EventListener
  );

  emit();
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => {
    window.removeEventListener(
      "eip6963:announceProvider",
      handleAnnounce as EventListener
    );
  };
}
