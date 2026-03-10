export type ProviderModelSource = "dynamic" | "fallback";

export interface ProviderModelOption {
  id: string;
  label: string;
  description: string;
  source: ProviderModelSource;
}

export const defaultModelOptions: ProviderModelOption[] = [
  {
    id: "openrouter/auto",
    label: "OpenRouter Auto",
    description:
      "OpenRouter routes to a broadly available default when you want minimal provider tuning.",
    source: "fallback"
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude Sonnet",
    description:
      "Balanced reasoning profile for longer planning loops and post-spawn operator prompts.",
    source: "fallback"
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    description:
      "Lower-latency generalist model suited to tighter heartbeat budgets and routine CLI tasks.",
    source: "fallback"
  },
  {
    id: "google/gemini-2.0-flash",
    label: "Gemini Flash",
    description:
      "Fast multimodal-capable fallback for lightweight inference when OpenRouter catalog loading fails.",
    source: "fallback"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description:
      "Open-weight fallback option for stewards who want a capable default before adding Brave search.",
    source: "fallback"
  }
];
