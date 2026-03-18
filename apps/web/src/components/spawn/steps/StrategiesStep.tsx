import type { StrategyCatalogEntry } from "../../../../../../packages/shared/src/catalog.js";

interface StrategiesStepProps {
  catalog: StrategyCatalogEntry[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function StrategiesStep({
  catalog,
  selectedIds,
  onToggle
}: StrategiesStepProps) {
  return (
    <section className="spawn-step">
      <p className="section-label">Step 3</p>
      <h3 className="spawn-step-title">Strategies</h3>
      <p className="spawn-step-copy">
        The strategy catalog is mocked locally in this milestone, but the UI is
        shaped like the later API-driven checklist surface.
      </p>

      <div className="spawn-checklist">
        {catalog.map((strategy) => {
          const checked = selectedIds.includes(strategy.id);

          return (
            <button
              aria-pressed={checked}
              className={`spawn-check-item${checked ? " is-checked" : ""}`}
              key={strategy.id}
              onClick={() => {
                onToggle(strategy.id);
              }}
              type="button"
            >
              <span className="spawn-check-mark">{checked ? "×" : ""}</span>
              <span className="spawn-check-body">
                <span className="spawn-check-title">{strategy.name}</span>
                <span className="spawn-check-copy">{strategy.description}</span>
              </span>
              <span className="spawn-check-meta">Risk {strategy.riskLevel}/5</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
