import type { ProviderModelOption } from "../../../lib/default-models";

interface ProviderConfigStepProps {
  openRouterApiKey: string;
  selectedModelId: string;
  customModelId: string;
  braveSearchApiKey: string;
  modelOptions: ProviderModelOption[];
  isLoadingModels: boolean;
  modelStatusMessage: string;
  onOpenRouterApiKeyChange: (value: string) => void;
  onSelectedModelChange: (value: string) => void;
  onCustomModelChange: (value: string) => void;
  onBraveSearchApiKeyChange: (value: string) => void;
}

export function ProviderConfigStep({
  openRouterApiKey,
  selectedModelId,
  customModelId,
  braveSearchApiKey,
  modelOptions,
  isLoadingModels,
  modelStatusMessage,
  onOpenRouterApiKeyChange,
  onSelectedModelChange,
  onCustomModelChange,
  onBraveSearchApiKeyChange
}: ProviderConfigStepProps) {
  return (
    <section className="spawn-step">
      <p className="section-label">Step 5</p>
      <h3 className="spawn-step-title">Model &amp; External APIs</h3>
      <p className="spawn-step-copy">
        OpenRouter and Brave are optional. Leave either field blank to keep that
        capability disabled until you configure it later from the steward CLI.
      </p>

      <div className="provider-stack">
        <label className="spawn-field">
          <span className="spawn-field-label">OpenRouter API key</span>
          <input
            className="spawn-input"
            onChange={(event) => {
              onOpenRouterApiKeyChange(event.currentTarget.value);
            }}
            placeholder="sk-or-..."
            type="password"
            value={openRouterApiKey}
          />
        </label>

        <label className="spawn-field">
          <span className="spawn-field-label">Inference model</span>
          <select
            className="spawn-select"
            onChange={(event) => {
              onSelectedModelChange(event.currentTarget.value);
            }}
            value={selectedModelId}
          >
            <option value="">No model selected</option>
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
                {model.source === "fallback" ? " (fallback)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="spawn-field">
          <span className="spawn-field-label">Manual model override</span>
          <input
            className="spawn-input"
            onChange={(event) => {
              onCustomModelChange(event.currentTarget.value);
            }}
            placeholder="anthropic/claude-..."
            type="text"
            value={customModelId}
          />
        </label>

        <p className="spawn-inline-note">
          {isLoadingModels
            ? "Loading live OpenRouter models."
            : modelStatusMessage}
        </p>

        <ul className="provider-model-list">
          {modelOptions.slice(0, 4).map((model) => (
            <li key={model.id}>
              <strong>{model.label}</strong>
              <span>{model.description}</span>
            </li>
          ))}
        </ul>

        <label className="spawn-field">
          <span className="spawn-field-label">Brave Search API key</span>
          <input
            className="spawn-input"
            onChange={(event) => {
              onBraveSearchApiKeyChange(event.currentTarget.value);
            }}
            placeholder="brv-..."
            type="password"
            value={braveSearchApiKey}
          />
        </label>
      </div>
    </section>
  );
}
