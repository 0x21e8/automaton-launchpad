#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RALPH_DIR="$ROOT_DIR/ralph"
MILESTONES_JSON="$RALPH_DIR/milestones.json"
STATE_JSON="$RALPH_DIR/state.json"
PROMPT_TEMPLATE="$ROOT_DIR/prompt.md"
ROLLING_HANDOFF="$RALPH_DIR/notes/rolling-handoff.md"
REPORTS_DIR="$RALPH_DIR/reports"
CHECKLIST_REPORTS_DIR="$REPORTS_DIR/checklists"
RUNS_DIR="$RALPH_DIR/runs"

mkdir -p "$REPORTS_DIR" "$CHECKLIST_REPORTS_DIR" "$RUNS_DIR" "$RALPH_DIR/notes"

if [[ ! -f "$STATE_JSON" ]]; then
  cat > "$STATE_JSON" <<'EOF'
{
  "completed": [],
  "attempts": {},
  "last_run": null
}
EOF
fi

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

setup_project_node() {
  local nvmrc_file="$ROOT_DIR/.nvmrc"
  [[ -f "$nvmrc_file" ]] || return 0

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  local nvm_sh="$NVM_DIR/nvm.sh"
  [[ -s "$nvm_sh" ]] || die "Project requires nvm, but $nvm_sh was not found"

  # shellcheck source=/dev/null
  . "$nvm_sh"
  nvm use --silent >/dev/null
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 && return 0
  printf 'Missing required command: %s\n' "$command_name" >&2
  printf 'Install it and retry, or stop the loop item as blocked.\n' >&2
  return 1
}

check_runner_prereqs() {
  local missing=0
  local command_name

  for command_name in python3 shasum codex; do
    if ! require_command "$command_name"; then
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

check_validation_prereqs() {
  local item_json="$1"
  local missing=0

  while IFS= read -r command_name; do
    [[ -n "$command_name" ]] || continue
    if ! require_command "$command_name"; then
      missing=1
    fi
  done < <(python3 - "$item_json" <<'PY'
import json
import shlex
import sys

item = json.loads(sys.argv[1])
builtins = {"test", "[", ":"}
seen = []

for command in item["validations"]:
    parts = shlex.split(command, posix=True)
    if not parts:
        continue
    program = parts[0]
    if program in builtins or program in seen:
        continue
    seen.append(program)
    print(program)
PY
)

  [[ "$missing" -eq 0 ]]
}

run_in_project_env() {
  local cmd="$1"
  (
    cd "$ROOT_DIR"
    setup_project_node
    eval "$cmd"
  )
}

checksum_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    printf 'MISSING\n'
  fi
}

resolve_repo_path() {
  local raw_path="$1"
  python3 - "$ROOT_DIR" "$raw_path" <<'PY'
import sys
from pathlib import Path

root_dir = Path(sys.argv[1]).resolve()
raw_path = Path(sys.argv[2])

if raw_path.is_absolute():
    print(raw_path.resolve())
else:
    print((root_dir / raw_path).resolve())
PY
}

json_value() {
  local json_payload="$1"
  local key="$2"
  python3 - "$json_payload" "$key" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
value = payload[sys.argv[2]]

if isinstance(value, (dict, list)):
    print(json.dumps(value))
elif value is None:
    print("")
else:
    print(value)
PY
}

json_query() {
  python3 - "$@" <<'PY'
import json
import sys

mode = sys.argv[1]
state_path = sys.argv[2]
milestones_path = sys.argv[3]

with open(state_path, "r", encoding="utf-8") as f:
    state = json.load(f)
with open(milestones_path, "r", encoding="utf-8") as f:
    milestones = json.load(f)

completed = set(state.get("completed", []))

if mode == "next":
    for milestone in milestones:
        if milestone["id"] not in completed:
            print(milestone["id"])
            break
    else:
        print("")
elif mode == "list":
    for milestone in milestones:
        status = "completed" if milestone["id"] in completed else "pending"
        print(f'{milestone["id"]}\t{status}\t{milestone["title"]}')
elif mode == "get":
    wanted = sys.argv[4]
    for milestone in milestones:
        if milestone["id"] == wanted:
            print(json.dumps(milestone))
            break
    else:
        raise SystemExit(f"Unknown milestone: {wanted}")
else:
    raise SystemExit(f"Unknown mode: {mode}")
PY
}

checklist_query() {
  python3 - "$@" <<'PY'
import json
import re
import sys
from pathlib import Path

DEFAULT_READS = [
    "specs/SPEC.md",
    "specs/SPEC-INDEXER.md",
    "mocks/mock-9.html",
    "ralph/notes/rolling-handoff.md",
]

DEFAULT_VALIDATIONS = [
    "npm run lint",
    "npm run build",
    "npm run test",
    "npm run lint:factory",
    "npm run test:factory",
]


def slugify(text, limit=48):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:limit].rstrip("-") or "item"


def load_config(checklist_path):
    config_path = checklist_path.with_suffix(".loop.json")
    if not config_path.exists():
        return {}, config_path
    return json.loads(config_path.read_text(encoding="utf-8")), config_path


def normalize_lines(raw_lines):
    cleaned = []
    for line in raw_lines:
        stripped = line.rstrip()
        if not stripped:
            continue
        cleaned.append(re.sub(r"^\s+", "", stripped))
    return cleaned


def parse_items(checklist_path):
    config, config_path = load_config(checklist_path)
    lines = checklist_path.read_text(encoding="utf-8").splitlines()
    section_heading = "Unsectioned"
    section_number = 0
    sequence = 0
    items = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("## "):
            section_heading = line[3:].strip()
            match = re.match(r"(\d+)\.\s*(.+)", section_heading)
            section_number = int(match.group(1)) if match else section_number + 1
            i += 1
            continue

        match = re.match(r"^-\s\[( |x|X)\]\s(.+)$", line)
        if not match:
            i += 1
            continue

        sequence += 1
        checked = match.group(1).lower() == "x"
        title = match.group(2).strip()

        detail_lines = []
        j = i + 1
        while j < len(lines):
            candidate = lines[j]
            if candidate.startswith("## "):
                break
            if re.match(r"^-\s\[( |x|X)\]\s", candidate):
                break
            detail_lines.append(candidate)
            j += 1

        section_prefix = f"S{section_number:02d}" if section_number else f"S{sequence:02d}"
        item_id = f"{section_prefix}-{slugify(title)}"
        override = config.get("items", {}).get(item_id, {})
        reads = override.get("reads", config.get("reads", DEFAULT_READS))
        validations = override.get("validations", config.get("validations", DEFAULT_VALIDATIONS))
        notes = normalize_lines(detail_lines)

        items.append(
            {
                "id": item_id,
                "title": title,
                "goal": "\n".join([title, *notes]).strip(),
                "reads": [str(checklist_path.relative_to(root_dir)), *reads],
                "validations": validations,
                "section": section_heading,
                "status": "completed" if checked else "pending",
                "checklist_path": str(checklist_path),
                "checklist_config_path": str(config_path) if config_path.exists() else "",
                "line_number": i + 1,
                "notes": notes,
                "source_type": "checklist",
            }
        )
        i = j

    return items, config_path


mode = sys.argv[1]
checklist_path = Path(sys.argv[2]).resolve()
root_dir = Path(sys.argv[3]).resolve()
items, config_path = parse_items(checklist_path)

if mode == "export":
    print(json.dumps(items, indent=2))
elif mode == "next":
    for item in items:
        if item["status"] != "completed":
            print(item["id"])
            break
    else:
        print("")
elif mode == "list":
    for item in items:
        print(f'{item["id"]}\t{item["status"]}\t{item["section"]}\t{item["title"]}')
elif mode == "get":
    wanted = sys.argv[4]
    for item in items:
        if item["id"] == wanted:
            print(json.dumps(item))
            break
    else:
        raise SystemExit(f"Unknown checklist item: {wanted}")
else:
    raise SystemExit(f"Unknown mode: {mode}")
PY
}

mark_complete() {
  local item_id="$1"
  local source_type="${2:-milestone}"
  python3 - "$STATE_JSON" "$item_id" "$source_type" <<'PY'
import json
import sys

state_path = sys.argv[1]
item_id = sys.argv[2]
source_type = sys.argv[3]
with open(state_path, "r", encoding="utf-8") as f:
    state = json.load(f)

completed = state.setdefault("completed", [])
if item_id not in completed:
    completed.append(item_id)

attempts = state.setdefault("attempts", {})
attempts[item_id] = attempts.get(item_id, 0) + 1
state["last_run"] = {"id": item_id, "source": source_type, "status": "completed"}

with open(state_path, "w", encoding="utf-8") as f:
    json.dump(state, f, indent=2)
    f.write("\n")
PY
}

mark_failed_attempt() {
  local item_id="$1"
  local reason="$2"
  local source_type="${3:-milestone}"
  python3 - "$STATE_JSON" "$item_id" "$reason" "$source_type" <<'PY'
import json
import sys

state_path = sys.argv[1]
item_id = sys.argv[2]
reason = sys.argv[3]
source_type = sys.argv[4]
with open(state_path, "r", encoding="utf-8") as f:
    state = json.load(f)

attempts = state.setdefault("attempts", {})
attempts[item_id] = attempts.get(item_id, 0) + 1
state["last_run"] = {"id": item_id, "source": source_type, "status": "failed", "reason": reason}

with open(state_path, "w", encoding="utf-8") as f:
    json.dump(state, f, indent=2)
    f.write("\n")
PY
}

mark_checklist_complete() {
  local checklist_path="$1"
  local item_id="$2"
  python3 - "$checklist_path" "$item_id" <<'PY'
import re
import sys
from pathlib import Path


def slugify(text: str, limit: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:limit].rstrip("-") or "item"


checklist_path = Path(sys.argv[1])
wanted = sys.argv[2]
lines = checklist_path.read_text(encoding="utf-8").splitlines()
section_number = 0
sequence = 0

for index, line in enumerate(lines):
    if line.startswith("## "):
        heading = line[3:].strip()
        match = re.match(r"(\d+)\.\s*(.+)", heading)
        section_number = int(match.group(1)) if match else section_number + 1
        continue

    match = re.match(r"^-\s\[( |x|X)\]\s(.+)$", line)
    if not match:
        continue

    sequence += 1
    title = match.group(2).strip()
    section_prefix = f"S{section_number:02d}" if section_number else f"S{sequence:02d}"
    item_id = f"{section_prefix}-{slugify(title)}"
    if item_id != wanted:
        continue

    if match.group(1).lower() != "x":
        lines[index] = re.sub(r"^-\s\[ \]", "- [x]", line, count=1)
        checklist_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    break
else:
    raise SystemExit(f"Unknown checklist item: {wanted}")
PY
}

render_prompt() {
  local item_json="$1"
  local output_file="$2"
  local report_file="$3"
  python3 - "$PROMPT_TEMPLATE" "$ROLLING_HANDOFF" "$item_json" "$output_file" "$STATE_JSON" "$report_file" <<'PY'
import json
import sys
from pathlib import Path

prompt_template = Path(sys.argv[1]).read_text(encoding="utf-8").rstrip()
handoff = Path(sys.argv[2]).read_text(encoding="utf-8").rstrip()
item = json.loads(sys.argv[3])
output_file = Path(sys.argv[4])
state = json.loads(Path(sys.argv[5]).read_text(encoding="utf-8"))
report_file = sys.argv[6]

source_type = item.get("source_type", "milestone")
completed = state.get("completed", [])

if source_type == "milestone":
    lines = [
        prompt_template,
        "",
        "---",
        "",
        "## Current Milestone Payload",
        "",
        f"- MILESTONE_ID: `{item['id']}`",
        f"- TITLE: {item['title']}",
        f"- GOAL: {item['goal']}",
        "",
        "### Required Reads",
    ]

    for read in item["reads"]:
        lines.append(f"- `{read}`")

    lines.extend([
        "",
        "### Required Validation Commands",
    ])

    for command in item["validations"]:
        lines.append(f"- `{command}`")

    lines.extend([
        "",
        "### Already Completed Milestones",
    ])

    if completed:
        for completed_id in completed:
            lines.append(f"- `{completed_id}`")
    else:
        lines.append("- none")

    lines.extend([
        "",
        "## Rolling Handoff Content",
        "",
        handoff,
        "",
        "## Session-specific instructions",
        "",
        f"- Write the milestone report to `{report_file}`.",
        f"- Append a new section to `ralph/notes/rolling-handoff.md` for `{item['id']}`.",
        "- Do not mark milestone completion anywhere except via the required report/handoff updates. The external runner decides completion after validation.",
        "- If you are blocked, say `BLOCKED` and explain why in both the report and final response.",
        "- If you complete the milestone, say `COMPLETED` and summarize validations run.",
    ])
else:
    lines = [
        "# Ralph Loop Checklist Prompt",
        "",
        "You are executing exactly one checklist item in a checklist-based implementation loop.",
        "",
        "## Mission",
        "",
        "Complete exactly the current checklist item. Do not start future checklist items unless a tiny amount of forward-compatible setup is strictly required to keep the current item correct and testable.",
        "",
        "## Non-negotiable operating rules",
        "",
        "- Read every file listed in the current checklist item's `reads` set before editing.",
        "- Treat the checklist item and the locked specs it references as the source of truth.",
        "- Treat `ralph/notes/rolling-handoff.md` as required context from prior sessions.",
        "- Keep the existing stack and validation entrypoints intact.",
        "- If a required package, CLI, or environment prerequisite is missing, install it using the normal project/toolchain path or stop and record a blocker.",
        "- Do not add ad hoc workarounds, no-op validations, or fake success paths.",
        "- If a required validation fails, either fix it inside the item scope or stop and record a blocker.",
        "",
        "## Required outputs before you finish",
        "",
        f"1. `{report_file}`",
        "2. `ralph/notes/rolling-handoff.md`",
        "",
        "## Required report format",
        "",
        "```md",
        f"# {item['id']} {item['title']}",
        "",
        "## Outcome",
        "- completed work",
        "",
        "## Files Changed",
        "- path",
        "",
        "## Validation Run",
        "- command: result",
        "",
        "## Learnings",
        "- decisions or discoveries that affect later work",
        "",
        "## References for Next Items",
        "- file paths, commands, or contracts future sessions must read/use",
        "",
        "## Open Issues",
        "- blockers, caveats, or follow-up items",
        "```",
        "",
        "## Current Checklist Item",
        "",
        f"- ITEM_ID: `{item['id']}`",
        f"- CHECKLIST: `{item['checklist_path']}`",
        f"- SECTION: {item['section']}",
        f"- TITLE: {item['title']}",
        f"- GOAL: {item['goal']}",
        "",
        "### Required Reads",
    ]

    for read in item["reads"]:
        lines.append(f"- `{read}`")

    lines.extend([
        "",
        "### Required Validation Commands",
    ])

    for command in item["validations"]:
        lines.append(f"- `{command}`")

    lines.extend([
        "",
        "## Rolling Handoff Content",
        "",
        handoff,
        "",
        "## Session-specific instructions",
        "",
        f"- Write the checklist item report to `{report_file}`.",
        f"- Append a new dated section to `ralph/notes/rolling-handoff.md` for `{item['id']}`.",
        "- Do not mark the checklist item complete in the markdown file yourself. The external runner will update the checkbox only after validations pass.",
        "- If you are blocked, say `BLOCKED` and explain why in both the report and final response.",
        "- If you complete the item, say `COMPLETED` and summarize validations run.",
    ])

output_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

run_validations() {
  local item_json="$1"
  local log_file="$2"
  while IFS= read -r cmd; do
    printf '==> %s\n' "$cmd" | tee -a "$log_file"
    if ! run_in_project_env "$cmd" >>"$log_file" 2>&1; then
      return 1
    fi
  done < <(python3 - "$item_json" <<'PY'
import json
import sys

item = json.loads(sys.argv[1])
for command in item["validations"]:
    print(command)
PY
)
}

run_codex_item() {
  local item_json="$1"
  local item_id="$2"
  local report_file="$3"
  local source_type="$4"

  local before_report before_handoff
  before_report="$(checksum_file "$report_file")"
  before_handoff="$(checksum_file "$ROLLING_HANDOFF")"

  local run_stamp run_dir prompt_file events_file last_message_file validation_log
  run_stamp="$(date +%Y%m%d-%H%M%S)"
  run_dir="$RUNS_DIR/${run_stamp}-${item_id}"
  mkdir -p "$run_dir"

  prompt_file="$run_dir/prompt.md"
  events_file="$run_dir/events.jsonl"
  last_message_file="$run_dir/last-message.txt"
  validation_log="$run_dir/validation.log"

  render_prompt "$item_json" "$prompt_file" "$report_file"

  if ! check_runner_prereqs; then
    mark_failed_attempt "$item_id" "missing_prerequisite" "$source_type"
    die "Missing runner prerequisite for $item_id. Install the required tool and retry."
  fi

  if ! check_validation_prereqs "$item_json"; then
    mark_failed_attempt "$item_id" "missing_prerequisite" "$source_type"
    die "Missing validation prerequisite for $item_id. Install the required tool and retry."
  fi

  printf 'Running %s in fresh Codex session\n' "$item_id"
  printf 'Run dir: %s\n' "$run_dir"

  local codex_cmd=(
    codex exec
    --skip-git-repo-check
    --ephemeral
    --full-auto
    --json
    -C "$ROOT_DIR"
    -o "$last_message_file"
  )

  if [[ -n "${CODEX_MODEL:-}" ]]; then
    codex_cmd+=( -m "$CODEX_MODEL" )
  fi

  if ! (
    cd "$ROOT_DIR"
    setup_project_node
    "${codex_cmd[@]}" - < "$prompt_file" | tee "$events_file"
  ); then
    mark_failed_attempt "$item_id" "codex_exec_failed" "$source_type"
    die "Codex exec failed for $item_id. See $run_dir"
  fi

  local after_report after_handoff
  after_report="$(checksum_file "$report_file")"
  after_handoff="$(checksum_file "$ROLLING_HANDOFF")"

  [[ "$after_report" != "$before_report" ]] || {
    mark_failed_attempt "$item_id" "report_not_updated" "$source_type"
    die "Loop item report was not updated: $report_file"
  }
  [[ "$after_handoff" != "$before_handoff" ]] || {
    mark_failed_attempt "$item_id" "handoff_not_updated" "$source_type"
    die "Rolling handoff was not updated: $ROLLING_HANDOFF"
  }

  : > "$validation_log"
  if ! run_validations "$item_json" "$validation_log"; then
    mark_failed_attempt "$item_id" "validation_failed" "$source_type"
    die "Validation failed for $item_id. See $validation_log"
  fi

  printf '%s completed and validated.\n' "$item_id"
  printf 'Report: %s\n' "$report_file"
  printf 'Validation log: %s\n' "$validation_log"
}

show_status() {
  printf 'Ralph loop status\n'
  printf 'Root: %s\n' "$ROOT_DIR"
  printf 'State: %s\n\n' "$STATE_JSON"
  json_query list "$STATE_JSON" "$MILESTONES_JSON" | while IFS=$'\t' read -r id status title; do
    printf '%-4s %-10s %s\n' "$id" "$status" "$title"
  done
}

show_checklist_status() {
  local checklist_path="$1"
  printf 'Ralph checklist status\n'
  printf 'Root: %s\n' "$ROOT_DIR"
  printf 'Checklist: %s\n\n' "$checklist_path"
  checklist_query list "$checklist_path" "$ROOT_DIR" | while IFS=$'\t' read -r id status section title; do
    printf '%-56s %-10s %s :: %s\n' "$id" "$status" "$section" "$title"
  done
}

run_next_until_done() {
  local next_id
  while true; do
    next_id="$(json_query next "$STATE_JSON" "$MILESTONES_JSON")"
    [[ -n "$next_id" ]] || break
    run_milestone "$next_id"
  done

  printf 'All milestones completed.\n'
}

run_checklist_until_done() {
  local checklist_path="$1"
  local next_id
  while true; do
    next_id="$(checklist_query next "$checklist_path" "$ROOT_DIR")"
    [[ -n "$next_id" ]] || break
    run_checklist_item "$checklist_path" "$next_id"
  done

  printf 'All checklist items completed.\n'
}

run_milestone() {
  local milestone_id="$1"
  local milestone_json
  milestone_json="$(json_query get "$STATE_JSON" "$MILESTONES_JSON" "$milestone_id")"

  local report_file="$REPORTS_DIR/$milestone_id.md"
  run_codex_item "$milestone_json" "$milestone_id" "$report_file" "milestone"
  mark_complete "$milestone_id" "milestone"
}

run_checklist_item() {
  local checklist_path="$1"
  local item_id="$2"
  local item_json
  item_json="$(checklist_query get "$checklist_path" "$ROOT_DIR" "$item_id")"

  local report_file="$CHECKLIST_REPORTS_DIR/$item_id.md"
  run_codex_item "$item_json" "$item_id" "$report_file" "checklist"
  mark_checklist_complete "$checklist_path" "$item_id"
  mark_complete "$item_id" "checklist"
}

export_checklist_json() {
  local checklist_path="$1"
  local output_file="${2:-}"
  if [[ -n "$output_file" ]]; then
    checklist_query export "$checklist_path" "$ROOT_DIR" > "$output_file"
    printf 'Exported checklist JSON to %s\n' "$output_file"
  else
    checklist_query export "$checklist_path" "$ROOT_DIR"
  fi
}

command="${1:-next}"

case "$command" in
  status)
    show_status
    ;;
  next)
    run_next_until_done
    ;;
  run)
    milestone_id="${2:-}"
    [[ -n "$milestone_id" ]] || die "Usage: $0 run <MILESTONE_ID>"
    run_milestone "$milestone_id"
    ;;
  checklist)
    checklist_command="${2:-}"
    checklist_path="${3:-}"
    case "$checklist_command" in
      status)
        [[ -n "$checklist_path" ]] || die "Usage: $0 checklist status <CHECKLIST.md>"
        checklist_path="$(resolve_repo_path "$checklist_path")"
        show_checklist_status "$checklist_path"
        ;;
      next)
        [[ -n "$checklist_path" ]] || die "Usage: $0 checklist next <CHECKLIST.md>"
        checklist_path="$(resolve_repo_path "$checklist_path")"
        run_checklist_until_done "$checklist_path"
        ;;
      run)
        item_id="${4:-}"
        [[ -n "$checklist_path" && -n "$item_id" ]] || die "Usage: $0 checklist run <CHECKLIST.md> <ITEM_ID>"
        checklist_path="$(resolve_repo_path "$checklist_path")"
        run_checklist_item "$checklist_path" "$item_id"
        ;;
      export)
        output_file="${4:-}"
        [[ -n "$checklist_path" ]] || die "Usage: $0 checklist export <CHECKLIST.md> [OUTPUT.json]"
        checklist_path="$(resolve_repo_path "$checklist_path")"
        export_checklist_json "$checklist_path" "$output_file"
        ;;
      *)
        die "Usage: $0 checklist <status|next|run|export> <CHECKLIST.md> [ITEM_ID|OUTPUT.json]"
        ;;
    esac
    ;;
  *)
    cat <<EOF
Usage:
  $0 status
  $0 next                               # run pending milestones until failure or completion
  $0 run <MILESTONE_ID>
  $0 checklist status <CHECKLIST.md>
  $0 checklist next <CHECKLIST.md>      # run pending checklist items until failure or completion
  $0 checklist run <CHECKLIST.md> <ITEM_ID>
  $0 checklist export <CHECKLIST.md> [OUTPUT.json]

Environment:
  CODEX_MODEL=<model>   Optional model override for codex exec

Checklist mode:
  - Parses top-level markdown checkbox items into runnable loop items.
  - Uses <CHECKLIST>.loop.json when present to override default reads/validations.
  - Marks the checkbox complete only after the run and validations succeed.
EOF
    exit 1
    ;;
esac
