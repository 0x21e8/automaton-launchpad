import type { AutomatonDetail } from "@ic-automaton/shared";
import { useEffect, useState } from "react";

import { fetchAutomatonDetail } from "../api/indexer";
import { subscribeToRealtimeEvents } from "../api/ws";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown automaton detail error.";
}

export function useAutomatonDetail(canisterId: string | null) {
  const [automaton, setAutomaton] = useState<AutomatonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (canisterId === null) {
      setAutomaton(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    setIsLoading(true);
    setError(null);

    void fetchAutomatonDetail(canisterId, controller.signal)
      .then((detail) => {
        setAutomaton(detail);
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setAutomaton(null);
        setError(getErrorMessage(nextError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [canisterId, refreshToken]);

  useEffect(() => {
    if (canisterId === null) {
      return;
    }

    return subscribeToRealtimeEvents(
      {
        canisterId
      },
      {
        onEvent(event) {
          if (event.type === "monologue") {
            setAutomaton((current) => {
              if (current === null || current.canisterId !== event.canisterId) {
                return current;
              }

              return {
                ...current,
                monologue: [...current.monologue, event.entry]
              };
            });
            return;
          }

          setRefreshToken((current) => current + 1);
        }
      }
    );
  }, [canisterId]);

  return {
    automaton,
    isLoading,
    error,
    refresh() {
      setRefreshToken((current) => current + 1);
    }
  };
}
