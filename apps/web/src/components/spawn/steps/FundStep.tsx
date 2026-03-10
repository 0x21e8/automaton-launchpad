import type { SpawnAsset } from "../../../../../../packages/shared/src/spawn.js";

import type { FundingPreview } from "../spawn-state";

interface FundSummary {
  chain: string;
  risk: string;
  strategies: number;
  skills: number;
  providerModel: string;
  braveConfigured: boolean;
}

interface FundStepProps {
  asset: SpawnAsset;
  grossAmountInput: string;
  preview: FundingPreview;
  validationMessage: string;
  summary: FundSummary;
  onAssetChange: (asset: SpawnAsset) => void;
  onGrossAmountChange: (value: string) => void;
}

export function FundStep({
  asset,
  grossAmountInput,
  preview,
  validationMessage,
  summary,
  onAssetChange,
  onGrossAmountChange
}: FundStepProps) {
  return (
    <section className="spawn-step">
      <p className="section-label">Step 6</p>
      <h3 className="spawn-step-title">Fund</h3>
      <p className="spawn-step-copy">
        The minimum check is applied to the gross amount the user pays. Platform
        fee and creation cost are disclosed separately before spawn.
      </p>

      <div className="fund-shell">
        <label className="spawn-field fund-field">
          <span className="spawn-field-label">Gross payment</span>
          <div className="fund-input-wrap">
            <input
              className="spawn-input fund-input"
              inputMode="decimal"
              onChange={(event) => {
                onGrossAmountChange(event.currentTarget.value);
              }}
              placeholder="0.00"
              type="number"
              value={grossAmountInput}
            />
            <div
              aria-label="Funding asset"
              className="fund-asset-toggle"
              role="group"
            >
              <button
                className={`fund-currency${asset === "eth" ? " is-active" : ""}`}
                onClick={() => {
                  onAssetChange("eth");
                }}
                type="button"
              >
                ETH
              </button>
              <button
                className={`fund-currency${asset === "usdc" ? " is-active" : ""}`}
                onClick={() => {
                  onAssetChange("usdc");
                }}
                type="button"
              >
                USDC
              </button>
            </div>
          </div>
        </label>

        <p className="fund-usd-copy">
          Approximate gross payment value: ${preview.grossUsd.toFixed(2)} USD
        </p>
        <p
          className={`fund-validation${preview.minimumMet ? "" : " has-error"}`}
          role="status"
        >
          {validationMessage}
        </p>

        <div className="fund-breakdown">
          <div className="fund-breakdown-row">
            <span>Gross payment</span>
            <strong>{preview.grossDisplay}</strong>
          </div>
          <div className="fund-breakdown-row">
            <span>Platform fee</span>
            <strong>{preview.platformFeeDisplay}</strong>
          </div>
          <div className="fund-breakdown-row">
            <span>Creation cost</span>
            <strong>{preview.creationCostDisplay}</strong>
          </div>
          <div className="fund-breakdown-row is-total">
            <span>Net forwarded to automaton</span>
            <strong>{preview.netForwardDisplay}</strong>
          </div>
        </div>

        <div className="fund-summary">
          <p className="section-label">Spawn summary</p>
          <div className="fund-summary-grid">
            <div className="fund-summary-row">
              <span>Chain</span>
              <strong>{summary.chain}</strong>
            </div>
            <div className="fund-summary-row">
              <span>Risk</span>
              <strong>{summary.risk}</strong>
            </div>
            <div className="fund-summary-row">
              <span>Strategies</span>
              <strong>{summary.strategies} selected</strong>
            </div>
            <div className="fund-summary-row">
              <span>Skills</span>
              <strong>{summary.skills} selected</strong>
            </div>
            <div className="fund-summary-row">
              <span>Model</span>
              <strong>{summary.providerModel}</strong>
            </div>
            <div className="fund-summary-row">
              <span>Brave Search</span>
              <strong>
                {summary.braveConfigured ? "Configured" : "Disabled for now"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
