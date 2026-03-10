import type { MonologueEntry } from "../../../../../packages/shared/src/automaton.js";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(timestamp);
}

interface MonologuePanelProps {
  entries: readonly MonologueEntry[];
  errorMessage: string | null;
  isLoading: boolean;
  selectedCanisterId: string | null;
}

function isNotFoundError(errorMessage: string | null): boolean {
  return errorMessage?.toLowerCase().includes("not found") ?? false;
}

export function MonologuePanel({
  entries,
  errorMessage,
  isLoading,
  selectedCanisterId
}: MonologuePanelProps) {
  const emptyCopy = isLoading
    ? "Loading indexed turns."
    : errorMessage !== null
      ? isNotFoundError(errorMessage)
        ? selectedCanisterId === null
          ? "No indexed monologue is available for the selected automaton."
          : `No indexed monologue is available for ${selectedCanisterId}.`
        : "Monologue is unavailable until the detail request succeeds."
      : "No indexed turns yet. Recent activity appears after the next successful poll.";

  return (
    <section className="log-section" aria-labelledby="monologue-heading">
      <div className="panel-heading">
        <h3 id="monologue-heading">Inner Monologue</h3>
        <span className="panel-note">Polling-backed history</span>
      </div>

      <div className="log-feed">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <article className="log-line" key={entry.turnId}>
              <span className="log-time">{formatTime(entry.timestamp)}</span>
              <span className={`log-type is-${entry.type}`}>
                {entry.type === "thought" ? "think" : "action"}
              </span>
              <div className="log-copy">
                <p>{entry.message}</p>
                <span>
                  {entry.agentState}
                  {entry.durationMs === null ? "" : ` · ${entry.durationMs}ms`}
                </span>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-copy">{emptyCopy}</p>
        )}
      </div>
    </section>
  );
}
