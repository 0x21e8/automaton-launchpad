import type { RealtimeEvent } from "@ic-automaton/shared";

import { buildIndexerWebsocketUrl } from "./indexer";

export interface RealtimeSubscriptionFilter {
  canisterId?: string;
  sessionId?: string;
}

export interface RealtimeSubscriptionHandlers {
  onEvent?: (event: RealtimeEvent) => void;
  onError?: (error: Error) => void;
}

export function subscribeToRealtimeEvents(
  filter: RealtimeSubscriptionFilter,
  handlers: RealtimeSubscriptionHandlers
): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return () => {};
  }

  let disposed = false;
  let opened = false;
  const socket = new WebSocket(
    buildIndexerWebsocketUrl("/ws/events", {
      canisterId: filter.canisterId,
      sessionId: filter.sessionId
    })
  );

  socket.addEventListener("open", () => {
    opened = true;

    if (disposed) {
      socket.close();
    }
  });

  socket.addEventListener("message", (event) => {
    if (disposed) {
      return;
    }

    try {
      const payload = JSON.parse(String(event.data)) as RealtimeEvent;
      handlers.onEvent?.(payload);
    } catch (error) {
      handlers.onError?.(
        error instanceof Error ? error : new Error("Failed to decode realtime event.")
      );
    }
  });

  socket.addEventListener("error", () => {
    if (!disposed) {
      handlers.onError?.(new Error("Realtime connection error."));
    }
  });

  return () => {
    disposed = true;

    if (opened || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}
