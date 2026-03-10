import {
  type ChainOption,
  chainOptions
} from "../spawn-state";

interface ChainStepProps {
  value: ChainOption["id"];
  onChange: (value: "base") => void;
}

export function ChainStep({ value, onChange }: ChainStepProps) {
  return (
    <section className="spawn-step">
      <p className="section-label">Step 1</p>
      <h3 className="spawn-step-title">Select Chain</h3>
      <p className="spawn-step-copy">
        Base is the only active launch target in this milestone. The other
        networks stay visible so the wizard keeps the locked roadmap shape.
      </p>

      <div className="spawn-card-grid">
        {chainOptions.map((option) => {
          const isSelected = option.id === value;

          return (
            <button
              className={`spawn-card${isSelected ? " is-selected" : ""}${
                option.active ? "" : " is-disabled"
              }`}
              disabled={!option.active}
              key={option.id}
              onClick={() => {
                if (option.id === "base") {
                  onChange(option.id);
                }
              }}
              type="button"
            >
              <span className="spawn-card-title">{option.label}</span>
              <span className="spawn-card-copy">{option.description}</span>
              {!option.active ? (
                <span className="spawn-card-badge">Coming soon</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
