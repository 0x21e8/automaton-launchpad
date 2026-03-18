import type { SkillCatalogEntry } from "../../../../../../packages/shared/src/catalog.js";

interface SkillsStepProps {
  catalog: SkillCatalogEntry[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function SkillsStep({
  catalog,
  selectedIds,
  onToggle
}: SkillsStepProps) {
  return (
    <section className="spawn-step">
      <p className="section-label">Step 4</p>
      <h3 className="spawn-step-title">Skills</h3>
      <p className="spawn-step-copy">
        Skills define what the automaton can do beyond pure DeFi execution. All
        options remain optional and can be combined freely in the mock flow.
      </p>

      <div className="spawn-checklist">
        {catalog.map((skill) => {
          const checked = selectedIds.includes(skill.id);

          return (
            <button
              aria-pressed={checked}
              className={`spawn-check-item${checked ? " is-checked" : ""}`}
              key={skill.id}
              onClick={() => {
                onToggle(skill.id);
              }}
              type="button"
            >
              <span className="spawn-check-mark">{checked ? "×" : ""}</span>
              <span className="spawn-check-body">
                <span className="spawn-check-title">{skill.name}</span>
                <span className="spawn-check-copy">{skill.description}</span>
              </span>
              <span className="spawn-check-meta">{skill.category}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
