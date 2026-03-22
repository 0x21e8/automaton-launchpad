import { useEffect, useMemo, useState } from "react";

import {
  buildCommandHelpRows,
  clearCommandSessionOutput,
  createCommandSessionState,
  describeCommandSessionAuth,
  setCommandSessionInput,
  stepCommandSessionHistory,
  submitCommandSessionInput,
  type CommandSessionContext,
  type CommandSessionState,
  type TerminalEntry
} from "./command-session-model";
import { fetchAutomatonContext } from "../api/automaton";
import { buildCliCommandPayload } from "../lib/cli-command-builder";
import { executeWalletCommand } from "../lib/wallet-command-executor";
import { findCommandDefinition } from "../lib/cli-command-registry";
import type { WalletSession } from "../wallet/useWalletSession";

export type { CommandSessionContext, TerminalEntry, TerminalEntryKind } from "./command-session-model";

export interface UseCommandSessionResult {
  entries: TerminalEntry[];
  inputValue: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  authLabel: string;
  helpRows: ReturnType<typeof buildCommandHelpRows>;
  setInputValue: (value: string) => void;
  submitInput: (rawInput?: string) => Promise<void>;
  clearOutput: () => void;
  stepHistory: (direction: "up" | "down") => void;
}

function reindexEntries(startId: number, entries: readonly TerminalEntry[]): TerminalEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    id: startId + index
  }));
}

export function useCommandSession(
  context: CommandSessionContext,
  walletSession: WalletSession | null = null
): UseCommandSessionResult {
  const [session, setSession] = useState<CommandSessionState>(() => createCommandSessionState(context));
  const [automatonContext, setAutomatonContext] = useState<CommandSessionContext["automatonContext"]>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSession(createCommandSessionState(context));
    setIsSubmitting(false);
  }, [context.automaton, context.viewerAddress]);

  useEffect(() => {
    if (context.automaton === null) {
      setAutomatonContext(null);
      return;
    }

    const controller = new AbortController();

    setAutomatonContext(null);

    void fetchAutomatonContext(context.automaton.canisterUrl, controller.signal)
      .then((nextAutomatonContext) => {
        if (!controller.signal.aborted) {
          setAutomatonContext(nextAutomatonContext);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAutomatonContext(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [context.automaton]);

  const helpRows = useMemo(() => buildCommandHelpRows(), []);
  const authLabel = useMemo(() => describeCommandSessionAuth(context), [context.automaton, context.viewerAddress]);

  async function submitInput(rawInput = session.inputValue) {
    const trimmed = rawInput.trim();

    if (trimmed === "") {
      return;
    }

    const payload = buildCliCommandPayload(trimmed, context.automaton?.canisterId ?? "wallet-command");
    const definition = payload === null ? null : findCommandDefinition(payload.command);

    if (
      definition !== null &&
      definition.transport === "wallet" &&
      context.viewerAddress !== null &&
      walletSession !== null
    ) {
      setIsSubmitting(true);

      try {
        const result = await executeWalletCommand(
          trimmed,
          {
            automaton: context.automaton,
            automatonContext,
            viewerAddress: context.viewerAddress
          },
          walletSession
        );

        if (result === null) {
          setSession((current) =>
            submitCommandSessionInput(
              current,
              {
                ...context,
                automatonContext
              },
              trimmed
            )
          );
          return;
        }

        setSession((current) => ({
          ...current,
          entries: [...current.entries, ...reindexEntries(current.entries.length + 1, result.entries)],
          history: [...current.history, trimmed],
          historyIndex: null,
          inputValue: ""
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Wallet command failed.";

        setSession((current) => ({
          ...current,
          entries: [
            ...current.entries,
            ...reindexEntries(current.entries.length + 1, [
              {
                id: 1,
                kind: "command",
                text: `> ${trimmed}`
              },
              {
                id: 2,
                kind: "error",
                text: message
              }
            ])
          ],
          history: [...current.history, trimmed],
          historyIndex: null,
          inputValue: ""
        }));
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    setSession((current) =>
      submitCommandSessionInput(
        current,
        {
          ...context,
          automatonContext
        },
        trimmed
      )
    );
  }

  return {
    entries: session.entries,
    inputValue: session.inputValue,
    isSubmitting,
    canSubmit: session.inputValue.trim().length > 0,
    authLabel,
    helpRows,
    setInputValue(value) {
      setSession((current) => setCommandSessionInput(current, value));
    },
    submitInput,
    clearOutput() {
      setSession((current) => clearCommandSessionOutput(current));
    },
    stepHistory(direction) {
      setSession((current) => stepCommandSessionHistory(current, direction));
    }
  };
}
