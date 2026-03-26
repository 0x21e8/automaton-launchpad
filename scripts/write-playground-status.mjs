import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusFilePath =
  normalizeOptionalString(process.env.PLAYGROUND_STATUS_FILE) ??
  path.join(rootDir, "tmp", "playground-status.json");

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function parseOptionalBoolean(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `invalid boolean value ${JSON.stringify(value)}; expected true/false-style input`
  );
}

function parseOptionalTimestamp(value, now) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "") {
    return null;
  }

  if (normalized === "now") {
    return now;
  }

  if (/^[+-]\d+$/.test(normalized)) {
    return now + Number.parseInt(normalized, 10) * 1_000;
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  throw new Error(
    `invalid timestamp value ${JSON.stringify(value)}; expected epoch ms, ISO-8601, "now", or +/-seconds`
  );
}

function readExistingStatus(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return typeof existing === "object" && existing !== null ? existing : {};
}

const now = Date.now();
const existingStatus = readExistingStatus(statusFilePath);
const nextStatus = {
  ...existingStatus
};

const environmentVersion = process.env.PLAYGROUND_STATUS_ENVIRONMENT_VERSION;
if (environmentVersion !== undefined) {
  nextStatus.environmentVersion = normalizeOptionalString(environmentVersion);
}

const maintenance = parseOptionalBoolean(process.env.PLAYGROUND_STATUS_MAINTENANCE);
if (maintenance !== undefined) {
  nextStatus.maintenance = maintenance;
}

if (process.env.PLAYGROUND_STATUS_MESSAGE !== undefined) {
  nextStatus.message = normalizeOptionalString(process.env.PLAYGROUND_STATUS_MESSAGE);
}

const lastResetAt = parseOptionalTimestamp(process.env.PLAYGROUND_STATUS_LAST_RESET_AT, now);
if (lastResetAt !== undefined) {
  nextStatus.lastResetAt = lastResetAt;
}

const nextResetAt = parseOptionalTimestamp(process.env.PLAYGROUND_STATUS_NEXT_RESET_AT, now);
if (nextResetAt !== undefined) {
  nextStatus.nextResetAt = nextResetAt;
}

const updatedAt = parseOptionalTimestamp(process.env.PLAYGROUND_STATUS_UPDATED_AT ?? "now", now);
nextStatus.updatedAt = updatedAt;

fs.mkdirSync(path.dirname(statusFilePath), { recursive: true });
fs.writeFileSync(statusFilePath, `${JSON.stringify(nextStatus, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ statusFilePath, status: nextStatus }, null, 2)}\n`);
