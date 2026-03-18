import { useEffect, useState } from "react";
import type { CreateSpawnSessionRequest } from "@ic-automaton/shared";

import { fetchOpenRouterModels } from "../../api/openrouter";
import {
  describeSpawnSessionProgress,
  formatSpawnSessionStateLabel,
  useSpawnSession
} from "../../hooks/useSpawnSession";
import {
  defaultModelOptions,
  type ProviderModelOption
} from "../../lib/default-models";
import {
  buildProviderSummary,
  chainOptions,
  createInitialSpawnWizardState,
  describeFundingValidation,
  getActiveChainLabel,
  getFundingPreview,
  getSelectedModel,
  getRiskProfile,
  skillCatalog,
  strategyCatalog,
  toggleSelection,
  TOTAL_SPAWN_STEPS,
  type SpawnWizardState
} from "./spawn-state";
import { ChainStep } from "./steps/ChainStep";
import { FundStep } from "./steps/FundStep";
import { ProviderConfigStep } from "./steps/ProviderConfigStep";
import { RiskStep } from "./steps/RiskStep";
import { SkillsStep } from "./steps/SkillsStep";
import { StrategiesStep } from "./steps/StrategiesStep";

interface SpawnWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSpawned?: (canisterId: string) => void;
  viewerAddress: string | null;
}

const stepTitles = [
  "Select chain",
  "Risk appetite",
  "Strategies",
  "Skills",
  "Provider config",
  "Fund"
] as const;

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: "UTC"
  }).format(value);
}

function formatNullableValue(value: string | null): string {
  return value ?? "pending";
}

export function SpawnWizard({
  isOpen,
  onClose,
  onSpawned,
  viewerAddress
}: SpawnWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<SpawnWizardState>(
    createInitialSpawnWizardState()
  );
  const [reportedCompletionSessionId, setReportedCompletionSessionId] = useState<
    string | null
  >(null);
  const [modelOptions, setModelOptions] =
    useState<ProviderModelOption[]>(defaultModelOptions);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelStatusMessage, setModelStatusMessage] = useState(
    "Using curated fallback models until the live catalog is requested."
  );
  const spawnSession = useSpawnSession();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();

    setIsLoadingModels(true);
    setModelStatusMessage("Loading live OpenRouter models.");

    void fetchOpenRouterModels(controller.signal)
      .then((models) => {
        setModelOptions(models);
        setModelStatusMessage("Loaded live OpenRouter models.");
      })
      .catch(() => {
        setModelOptions(defaultModelOptions);
        setModelStatusMessage(
          "OpenRouter catalog unavailable, using curated fallback models."
        );
      })
      .finally(() => {
        setIsLoadingModels(false);
      });

    return () => {
      controller.abort();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const fundingPreview = getFundingPreview(state);
  const validationMessage = describeFundingValidation(fundingPreview);
  const hasTrackedSession = spawnSession.sessionId !== null;
  const activeSession = spawnSession.session;
  const paymentInstructions = spawnSession.paymentInstructions;
  const canSubmit =
    viewerAddress !== null &&
    state.chain === "base" &&
    fundingPreview.minimumMet &&
    fundingPreview.grossAmount > 0 &&
    !spawnSession.isCreating;

  useEffect(() => {
    if (
      activeSession?.state !== "complete" ||
      activeSession.automatonCanisterId === null ||
      activeSession.sessionId === reportedCompletionSessionId
    ) {
      return;
    }

    onSpawned?.(activeSession.automatonCanisterId);
    setReportedCompletionSessionId(activeSession.sessionId);
  }, [activeSession, onSpawned, reportedCompletionSessionId]);

  function resetWizard() {
    setStepIndex(0);
    setState(createInitialSpawnWizardState());
    setModelOptions(defaultModelOptions);
    setModelStatusMessage(
      "Using curated fallback models until the live catalog is requested."
    );
    setIsLoadingModels(false);
  }

  function closeWizard() {
    if (!hasTrackedSession) {
      resetWizard();
    }

    onClose();
  }

  function advanceStep() {
    setStepIndex((current) =>
      current < TOTAL_SPAWN_STEPS - 1 ? current + 1 : current
    );
  }

  function retreatStep() {
    setStepIndex((current) => (current > 0 ? current - 1 : current));
  }

  function resetTrackedSession() {
    spawnSession.reset();
    resetWizard();
  }

  function buildCreateRequest(): CreateSpawnSessionRequest | null {
    if (viewerAddress === null) {
      return null;
    }

    return {
      stewardAddress: viewerAddress,
      asset: state.asset,
      grossAmount: state.grossAmountInput,
      config: {
        chain: state.chain,
        risk: state.risk,
        strategies: [...state.strategies],
        skills: [...state.skills],
        openRouterApiKey:
          state.openRouterApiKey.trim() === "" ? null : state.openRouterApiKey.trim(),
        model: getSelectedModel(state),
        braveSearchApiKey:
          state.braveSearchApiKey.trim() === ""
            ? null
            : state.braveSearchApiKey.trim()
      }
    };
  }

  function handleSubmit() {
    if (!canSubmit || hasTrackedSession) {
      return;
    }

    const request = buildCreateRequest();

    if (request === null) {
      return;
    }

    void spawnSession.create(request);
  }

  return (
    <div
      aria-hidden={!isOpen}
      className={`spawn-overlay${isOpen ? " is-open" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeWizard();
        }
      }}
    >
      <section
        aria-label="Spawn automaton wizard"
        aria-modal="true"
        className="spawn-wizard"
        role="dialog"
      >
        <button
          aria-label="Close spawn wizard"
          className="spawn-close"
          onClick={closeWizard}
          type="button"
        >
          &times;
        </button>

        <header className="spawn-header">
          <div>
            <p className="section-label">Spawn wizard</p>
            <h2 className="spawn-heading">Spawn Automaton</h2>
          </div>
          <div className="spawn-header-meta">
            <span>
              Step {stepIndex + 1} of {TOTAL_SPAWN_STEPS}
            </span>
            <strong>{stepTitles[stepIndex]}</strong>
          </div>
        </header>

        <div className="spawn-progress">
          <div
            className="spawn-progress-fill"
            style={{
              width: `${((stepIndex + 1) / TOTAL_SPAWN_STEPS) * 100}%`
            }}
          />
        </div>

        <div className="spawn-body">
          {stepIndex === 0 ? (
            <ChainStep
              onChange={(chain) => {
                setState((current) => ({
                  ...current,
                  chain
                }));
              }}
              value={state.chain}
            />
          ) : null}

          {stepIndex === 1 ? (
            <RiskStep
              onChange={(risk) => {
                setState((current) => ({
                  ...current,
                  risk
                }));
              }}
              value={state.risk}
            />
          ) : null}

          {stepIndex === 2 ? (
            <StrategiesStep
              catalog={strategyCatalog}
              onToggle={(id) => {
                setState((current) => ({
                  ...current,
                  strategies: toggleSelection(current.strategies, id)
                }));
              }}
              selectedIds={state.strategies}
            />
          ) : null}

          {stepIndex === 3 ? (
            <SkillsStep
              catalog={skillCatalog}
              onToggle={(id) => {
                setState((current) => ({
                  ...current,
                  skills: toggleSelection(current.skills, id)
                }));
              }}
              selectedIds={state.skills}
            />
          ) : null}

          {stepIndex === 4 ? (
            <ProviderConfigStep
              braveSearchApiKey={state.braveSearchApiKey}
              customModelId={state.customModelId}
              isLoadingModels={isLoadingModels}
              modelOptions={modelOptions}
              modelStatusMessage={modelStatusMessage}
              onBraveSearchApiKeyChange={(value) => {
                setState((current) => ({
                  ...current,
                  braveSearchApiKey: value
                }));
              }}
              onCustomModelChange={(value) => {
                setState((current) => ({
                  ...current,
                  customModelId: value
                }));
              }}
              onOpenRouterApiKeyChange={(value) => {
                setState((current) => ({
                  ...current,
                  openRouterApiKey: value
                }));
              }}
              onSelectedModelChange={(value) => {
                setState((current) => ({
                  ...current,
                  selectedModelId: value
                }));
              }}
              openRouterApiKey={state.openRouterApiKey}
              selectedModelId={state.selectedModelId}
            />
          ) : null}

          {stepIndex === 5 ? (
            <FundStep
              asset={state.asset}
              grossAmountInput={state.grossAmountInput}
              onAssetChange={(asset) => {
                setState((current) => ({
                  ...current,
                  asset
                }));
              }}
              onGrossAmountChange={(grossAmountInput) => {
                setState((current) => ({
                  ...current,
                  grossAmountInput
                }));
              }}
              preview={fundingPreview}
              summary={{
                chain:
                  chainOptions.find((option) => option.id === state.chain)?.label ??
                  getActiveChainLabel(state.chain),
                risk: getRiskProfile(state.risk).label,
                strategies: state.strategies.length,
                skills: state.skills.length,
                providerModel: buildProviderSummary(state),
                braveConfigured: state.braveSearchApiKey.trim() !== ""
              }}
              validationMessage={validationMessage}
            />
          ) : null}

          {activeSession !== null ? (
            <section className="spawn-session-status" aria-live="polite">
              <div className="spawn-session-header">
                <div>
                  <p className="section-label">Factory session data</p>
                  <h3 className="spawn-step-title">Factory Session Reference</h3>
                </div>
                <span className="spawn-session-pill">
                  {formatSpawnSessionStateLabel(activeSession.state)}
                </span>
              </div>

              <p className="spawn-step-copy">
                {describeSpawnSessionProgress(activeSession)}
              </p>

              <div className="spawn-session-grid">
                <div className="spawn-session-row">
                  <span>Session ID</span>
                  <strong>{activeSession.sessionId}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Payment status</span>
                  <strong>{formatSpawnSessionStateLabel(activeSession.paymentStatus)}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Quoted payment</span>
                  <strong>{spawnSession.formatAmount()}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Expires</span>
                  <strong>{formatTimestamp(activeSession.expiresAt)}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Escrow address</span>
                  <strong>
                    {formatNullableValue(paymentInstructions?.paymentAddress ?? null)}
                  </strong>
                </div>
                <div className="spawn-session-row">
                  <span>Quote terms</span>
                  <strong>{activeSession.quoteTermsHash}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Retry</span>
                  <strong>{activeSession.retryable ? "Available" : "Not available"}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Refund</span>
                  <strong>{activeSession.refundable ? "Available" : "Not available"}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Automaton canister</span>
                  <strong>{formatNullableValue(activeSession.automatonCanisterId)}</strong>
                </div>
                <div className="spawn-session-row">
                  <span>Automaton EVM</span>
                  <strong>{formatNullableValue(activeSession.automatonEvmAddress)}</strong>
                </div>
              </div>

              <div className="spawn-session-actions">
                <button
                  className="spawn-nav-button"
                  disabled={!activeSession.retryable || spawnSession.isMutating}
                  onClick={() => {
                    void spawnSession.retry();
                  }}
                  type="button"
                >
                  Retry Spawn
                </button>
                <button
                  className="spawn-nav-button"
                  disabled={!activeSession.refundable || spawnSession.isMutating}
                  onClick={() => {
                    void spawnSession.refund();
                  }}
                  type="button"
                >
                  Claim Refund
                </button>
              </div>

              <p className="spawn-session-meta">
                {spawnSession.isCreating
                  ? "Creating factory session reference."
                  : spawnSession.isMutating
                    ? "Submitting factory session action."
                    : spawnSession.isRefreshing
                      ? "Refreshing factory session state from the indexer."
                      : "Factory session data is mirrored here when the indexer reports it."}
              </p>

              {spawnSession.error !== null ? (
                <p className="spawn-session-error" role="alert">
                  {spawnSession.error}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="spawn-footer">
          {hasTrackedSession ? (
            <>
              <button className="spawn-nav-button" onClick={closeWizard} type="button">
                Close
              </button>
              <button
                className="spawn-nav-button is-primary"
                disabled={spawnSession.isCreating || spawnSession.isMutating}
                onClick={resetTrackedSession}
                type="button"
              >
                New Session
              </button>
            </>
          ) : (
            <>
              <button
                className="spawn-nav-button"
                disabled={stepIndex === 0}
                onClick={retreatStep}
                type="button"
              >
                Back
              </button>
              <button
                className="spawn-nav-button is-primary"
                disabled={stepIndex === TOTAL_SPAWN_STEPS - 1 ? !canSubmit : false}
                onClick={
                  stepIndex === TOTAL_SPAWN_STEPS - 1 ? handleSubmit : advanceStep
                }
                type="button"
              >
                {stepIndex === TOTAL_SPAWN_STEPS - 1 ? "Spawn" : "Next"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
