import { useEffect, useState } from "react";
import type { Eip1193RequestArgs } from "../lib/wallet-transport";

interface Eip1193Provider {
  request<T = unknown>(args: Eip1193RequestArgs): Promise<T>;
  on?(event: "accountsChanged" | "chainChanged" | "disconnect", handler: (...args: any[]) => void): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged" | "disconnect",
    handler: (...args: any[]) => void
  ): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

function normalizeAddress(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatAddress(address: string | null): string {
  if (address === null) {
    return "Wallet not detected";
  }

  return `Wallet detected ${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 16);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export interface WalletSession {
  address: string | null;
  chainId: number | null;
  hasProvider: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  errorMessage: string | null;
  walletLabel: string;
  request: <T = unknown>(args: Eip1193RequestArgs) => Promise<T>;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWalletSession(): WalletSession {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const provider = typeof window === "undefined" ? undefined : window.ethereum;
  const hasProvider = provider !== undefined;

  useEffect(() => {
    if (provider === undefined) {
      return;
    }

    let mounted = true;

    void provider.request<string[]>({ method: "eth_accounts" }).then((accounts) => {
      if (!mounted) {
        return;
      }

      setAddress(normalizeAddress(accounts[0] ?? null));
    });

    void provider.request<string>({ method: "eth_chainId" }).then((nextChainId) => {
      if (!mounted) {
        return;
      }

      setChainId(readChainId(nextChainId));
    });

    const handleAccountsChanged = (...args: any[]) => {
      setAddress(normalizeAddress((args[0] as unknown[] | undefined)?.[0] ?? null));
    };

    const handleChainChanged = (...args: any[]) => {
      setChainId(readChainId(args[0] ?? null));
    };

    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    provider.on?.("disconnect", handleDisconnect);

    return () => {
      mounted = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [provider]);

  async function connect() {
    if (provider === undefined) {
      setErrorMessage("No injected EVM wallet provider was detected.");
      return;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const accounts = await provider.request<string[]>({
        method: "eth_requestAccounts"
      });
      const nextChainId = await provider.request<string>({ method: "eth_chainId" });

      setAddress(normalizeAddress(accounts[0] ?? null));
      setChainId(readChainId(nextChainId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnect() {
    setAddress(null);
    setChainId(null);
    setErrorMessage(null);
  }

  async function request<T = unknown>(args: Eip1193RequestArgs): Promise<T> {
    if (provider === undefined) {
      throw new Error("No injected EVM wallet provider was detected.");
    }

    return provider.request<T>(args);
  }

  return {
    address,
    chainId,
    hasProvider,
    isConnecting,
    isConnected: address !== null,
    errorMessage,
    walletLabel: formatAddress(address),
    request,
    connect,
    disconnect
  };
}
