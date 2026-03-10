import type { AutomatonDetail } from "../../../../../packages/shared/src/automaton.js";

type CommandEntry = {
  kind: "system" | "response";
  text: string;
};

function isNotFoundError(errorMessage: string | null): boolean {
  return errorMessage?.toLowerCase().includes("not found") ?? false;
}

function buildReferenceEntries(
  automaton: AutomatonDetail | null,
  viewerAddress: string | null,
  canExecute: boolean,
  isLoading: boolean,
  errorMessage: string | null,
  selectedCanisterId: string | null
): CommandEntry[] {
  if (automaton === null) {
    if (isLoading) {
      return [
        {
          kind: "system",
          text: "Loading indexed command metadata."
        }
      ];
    }

    if (errorMessage !== null) {
      return [
        {
          kind: "system",
          text: isNotFoundError(errorMessage)
            ? selectedCanisterId === null
              ? "No indexed command surface is available for the selected automaton."
              : `No indexed command surface is available for ${selectedCanisterId}.`
            : `Command surface unavailable because the detail request failed: ${errorMessage}`
        }
      ];
    }

    return [
      {
        kind: "system",
        text: "Select an indexed automaton to inspect its recorded command surface."
      }
    ];
  }

  return [
    {
      kind: "system",
      text: `${automaton.name} command surface is shown as reference only.`
    },
    {
      kind: "response",
      text: "Launchpad does not execute, sign, or broadcast canister commands."
    },
    {
      kind: "response",
      text: `Recorded steward: ${automaton.steward.address}`
    },
    {
      kind: "response",
      text: "Indexed checks: status, balances, strategies, skills, constitution, recent turns."
    },
    {
      kind: "response",
      text:
        viewerAddress === null
          ? "Wallet detection is not active, so steward-only actions stay outside this UI."
          : canExecute
            ? "Detected wallet matches the recorded steward address, but live writes still happen outside this UI."
            : "Detected wallet does not match the recorded steward address."
    }
  ];
}

interface CommandLinePanelProps {
  automaton: AutomatonDetail | null;
  canExecute: boolean;
  errorMessage: string | null;
  isLoading: boolean;
  selectedCanisterId: string | null;
  viewerAddress: string | null;
}

export function CommandLinePanel({
  automaton,
  canExecute,
  errorMessage,
  isLoading,
  selectedCanisterId,
  viewerAddress
}: CommandLinePanelProps) {
  const entries = buildReferenceEntries(
    automaton,
    viewerAddress,
    canExecute,
    isLoading,
    errorMessage,
    selectedCanisterId
  );

  return (
    <section className="cli-section" aria-labelledby="command-line-heading">
      <div className="panel-heading">
        <h3 id="command-line-heading">Command Surface</h3>
        <span className="panel-note">Inspection only</span>
      </div>

      <div className="cli-output" role="log">
        {entries.map((entry, index) => (
          <div className={`cli-line is-${entry.kind}`} key={`${entry.text}-${index}`}>
            {entry.text}
          </div>
        ))}
      </div>

      <p className="cli-readonly">
        {automaton === null
          ? "This panel stays read-only and becomes populated after a detail load succeeds."
          : "Use external wallet or canister tooling for live write access when it is required."}
      </p>
    </section>
  );
}
