import type { AutomatonDetail } from "@ic-automaton/shared";
import type { AutomatonContext } from "../api/automaton";
import { buildCliCommandPayload, tokenizeCommandInput } from "./cli-command-builder";
import type { TerminalEntry } from "../hooks/command-session-model";
import type { WalletTransport } from "./wallet-transport";
import {
  bigintToHex,
  encodeErc20TransferData,
  parseDecimalAmount
} from "./wallet-transaction-helpers";

export type WalletCommandTransport = WalletTransport;

export interface WalletCommandContext {
  automaton: AutomatonDetail | null;
  automatonContext?: AutomatonContext | null;
  viewerAddress: string | null;
}

export interface WalletCommandExecutionResult {
  entries: TerminalEntry[];
}

interface ParsedCommand {
  command: string;
  flags: Set<string>;
  optionValue: string | null;
  positionals: string[];
}

function createEntry(id: number, kind: TerminalEntry["kind"], text: string): TerminalEntry {
  return {
    id,
    kind,
    text
  };
}

function parseCommand(rawInput: string): ParsedCommand | null {
  const payload = buildCliCommandPayload(rawInput, "wallet-command");

  if (payload === null) {
    return null;
  }

  const tokens = tokenizeCommandInput(rawInput.trim());
  const [command, ...rest] = tokens;
  const flags = new Set<string>();
  const positionals: string[] = [];
  let optionValue: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "-m") {
      optionValue = rest[index + 1] ?? null;
      if (optionValue !== null) {
        index += 1;
      }
      continue;
    }

    if (token.startsWith("-")) {
      flags.add(token);
      continue;
    }

    positionals.push(token);
  }

  return {
    command: command.toLowerCase(),
    flags,
    optionValue,
    positionals
  };
}

function encodeUtf8Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function formatAssetAmount(amount: string, asset: "ETH" | "USDC"): string {
  return `${amount} ${asset}`;
}

function resolveAutomatonRecipient(context: WalletCommandContext): string | null {
  return (
    context.automatonContext?.evmConfig.inbox_contract_address?.trim() ??
    context.automaton?.ethAddress?.trim() ??
    null
  );
}

function resolveDonationRecipient(context: WalletCommandContext): string | null {
  return context.automatonContext?.evmConfig.automaton_address?.trim() ?? context.automaton?.ethAddress?.trim() ?? null;
}

function buildWalletCommandError(startId: number, rawInput: string, message: string): TerminalEntry[] {
  return [
    createEntry(startId, "command", `> ${rawInput.trim()}`),
    createEntry(startId + 1, "error", message)
  ];
}

export async function executeWalletCommand(
  rawInput: string,
  context: WalletCommandContext,
  transport: WalletCommandTransport
): Promise<WalletCommandExecutionResult | null> {
  const parsed = parseCommand(rawInput);

  if (parsed === null) {
    return null;
  }

  if (context.viewerAddress === null) {
    return {
      entries: buildWalletCommandError(
        1,
        rawInput,
        "Wallet required for this command. Connect a wallet first."
      )
    };
  }

  if (parsed.command === "send") {
    const message = parsed.optionValue ?? parsed.positionals.join(" ");
    if (message.trim() === "") {
      return {
        entries: buildWalletCommandError(1, rawInput, "Message required for send.")
      };
    }

    const destination = resolveAutomatonRecipient(context);
    if (destination === null) {
      return {
        entries: buildWalletCommandError(
          1,
          rawInput,
          "No automaton address is available for send."
        )
      };
    }

    const txHash = await transport.request<string>({
      method: "eth_sendTransaction",
      params: [
        {
          from: context.viewerAddress,
          to: destination,
          data: encodeUtf8Hex(message),
          value: bigintToHex(0n)
        }
      ]
    });

    return {
      entries: [
        createEntry(1, "command", `> ${rawInput.trim()}`),
        createEntry(2, "response", `Message transaction submitted: ${txHash}`),
        createEntry(3, "response", `Destination: ${destination}`),
        createEntry(4, "response", `Payload: ${message}`)
      ]
    };
  }

  if (parsed.command === "donate") {
    const rawAmount = parsed.positionals[0] ?? "";
    if (rawAmount.trim() === "") {
      return {
        entries: buildWalletCommandError(1, rawInput, "Donation amount required.")
      };
    }

    const useUsdc = parsed.flags.has("--usdc");
    const decimals = useUsdc ? context.automatonContext?.walletBalance.usdc_decimals ?? 6 : 18;
    const amount = parseDecimalAmount(rawAmount, decimals);

    if (amount === null) {
      return {
        entries: buildWalletCommandError(1, rawInput, `Invalid donation amount: ${rawAmount}`)
      };
    }

    const destination = useUsdc
      ? context.automatonContext?.walletBalance.usdc_contract_address?.trim() ?? null
      : resolveDonationRecipient(context);

    if (destination === null) {
      return {
        entries: buildWalletCommandError(
          1,
          rawInput,
          useUsdc
            ? "No USDC contract address is available for donate --usdc."
            : "No automaton address is available for donate."
        )
      };
    }

    if (useUsdc) {
      const recipient = resolveDonationRecipient(context);
      const data = encodeErc20TransferData(recipient ?? destination, amount);

      if (data === null) {
        return {
          entries: buildWalletCommandError(
            1,
            rawInput,
            "Invalid automaton address for donate --usdc."
          )
        };
      }

      const txHash = await transport.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: context.viewerAddress,
            to: destination,
            data,
            value: bigintToHex(0n)
          }
        ]
      });

      return {
        entries: [
          createEntry(1, "command", `> ${rawInput.trim()}`),
          createEntry(2, "response", `Donation transaction submitted: ${txHash}`),
          createEntry(3, "response", `Destination: ${destination}`),
          createEntry(
            4,
            "response",
            `Amount: ${formatAssetAmount(rawAmount.trim(), "USDC")}`
          )
        ]
      };
    }

    const txHash = await transport.request<string>({
      method: "eth_sendTransaction",
      params: [
        {
          from: context.viewerAddress,
          to: destination,
          value: bigintToHex(amount)
        }
      ]
    });

    return {
      entries: [
        createEntry(1, "command", `> ${rawInput.trim()}`),
        createEntry(2, "response", `Donation transaction submitted: ${txHash}`),
        createEntry(3, "response", `Destination: ${destination}`),
        createEntry(4, "response", `Amount: ${formatAssetAmount(rawAmount.trim(), useUsdc ? "USDC" : "ETH")}`)
      ]
    };
  }

  return null;
}
