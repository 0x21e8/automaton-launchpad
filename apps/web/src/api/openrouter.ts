import type { ProviderModelOption } from "../lib/default-models";

interface OpenRouterModelRecord {
  id?: string;
  name?: string;
  description?: string;
}

interface OpenRouterResponse {
  data?: OpenRouterModelRecord[];
}

function normalizeModel(record: OpenRouterModelRecord): ProviderModelOption | null {
  if (record.id === undefined || record.id.trim() === "") {
    return null;
  }

  const label =
    record.name?.trim() !== undefined && record.name.trim() !== ""
      ? record.name.trim()
      : record.id;

  return {
    id: record.id,
    label,
    description:
      record.description?.trim() !== undefined && record.description.trim() !== ""
        ? record.description.trim()
        : "Live OpenRouter catalog entry.",
    source: "dynamic"
  };
}

export async function fetchOpenRouterModels(
  signal?: AbortSignal
): Promise<ProviderModelOption[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Accept: "application/json"
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`OpenRouter catalog request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const models =
    payload.data
      ?.map((record) => normalizeModel(record))
      .filter((record): record is ProviderModelOption => record !== null) ?? [];

  if (models.length === 0) {
    throw new Error("OpenRouter returned an empty model catalog.");
  }

  return models
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, 8);
}
