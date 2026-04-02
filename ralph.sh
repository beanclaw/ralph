#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool codex|amp] [max_iterations]

set -e

# -----------------------------
# Output / UX helpers
# -----------------------------

RALPH_COLOR="${RALPH_COLOR:-auto}"     # auto | always | never
RALPH_VERBOSE="${RALPH_VERBOSE:-1}"    # 0 | 1 (default on: this script is intentionally chatty)
RALPH_SLEEP_SECONDS="${RALPH_SLEEP_SECONDS:-2}"
RALPH_BANNER="${RALPH_BANNER:-mule}"   # none | mule
RALPH_BANNER_EACH_ITER="${RALPH_BANNER_EACH_ITER:-0}" # 0 | 1
MULE_ART_LINES=8

is_tty() { [[ -t 1 ]]; }

colors_enabled() {
  case "$RALPH_COLOR" in
    always) return 0 ;;
    never) return 1 ;;
    *) is_tty ;;
  esac
}

if colors_enabled; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_MAGENTA=$'\033[35m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_DIM=""
  C_BOLD=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BLUE=""
  C_MAGENTA=""
  C_CYAN=""
fi

ts() { date "+%Y-%m-%d %H:%M:%S"; }

log() { printf "%s\n" "$*"; }
info() { printf "%s%s%s %s\n" "${C_CYAN}${C_BOLD}" "[info]" "${C_RESET}" "$*"; }
warn() { printf "%s%s%s %s\n" "${C_YELLOW}${C_BOLD}" "[warn]" "${C_RESET}" "$*"; }
err() { printf "%s%s%s %s\n" "${C_RED}${C_BOLD}" "[err ]" "${C_RESET}" "$*"; }

hr() {
  printf "%s\n" "${C_DIM}===============================================================${C_RESET}"
}

progress_bar() {
  # progress_bar <current> <total> [width]
  local current="$1"
  local total="$2"
  local width="${3:-28}"

  if [[ "$total" -le 0 ]]; then
    printf "%s" "[----------------------------]"
    return 0
  fi

  local filled=$(( (current * width) / total ))
  local empty=$(( width - filled ))

  local bar="["
  local i
  for ((i=0; i<filled; i++)); do bar+="#"; done
  for ((i=0; i<empty; i++)); do bar+="-"; done
  bar+="]"
  printf "%s" "$bar"
}

sleep_with_progress() {
  local seconds="$1"
  local i
  for ((i=seconds; i>0; i--)); do
    if is_tty; then
      local elapsed=$((seconds - i + 1))
      local msg
      msg="$(mule_message)"
      local frame=$((elapsed % 2))
      printf "\r\033[2K%s%s%s %s %s %s\n" \
        "${C_DIM}" "[wait]" "${C_RESET}" \
        "$(progress_bar "$elapsed" "$seconds" 16)" \
        "${C_DIM}${i}s${C_RESET}" \
        "${C_YELLOW}${msg}${C_RESET}"
      while IFS= read -r line; do
        printf "\033[2K%s%s%s\n" "${C_MAGENTA}" "$line" "${C_RESET}"
      done < <(mule_art_frame "$frame")
      printf "\033[%dA" "$((MULE_ART_LINES + 1))"
      sleep 1
    else
      sleep "$seconds"
      return 0
    fi
  done
  if is_tty; then
    printf "\033[%dB" "$((MULE_ART_LINES + 1))"
    printf "\r\033[2K"
  fi
}

print_banner_mule() {
  log "${C_BOLD}"
  log "${C_YELLOW}  ____    /\\     _       ____   _   _${C_RESET}"
  log "${C_MAGENTA} |  _ \\  /  \\   | |     |  _ \\ | | | |${C_RESET}"
  log "${C_CYAN} | |_) |/ /\\ \\  | |     | |_) || |_| |${C_RESET}"
  log "${C_BLUE} |  _ </ ____ \\ | |___  |  __/ |  _  |${C_RESET}"
  log "${C_GREEN} |_| \\_/_/    \\_\\|_____| |_|    |_| |_|${C_RESET}"
  log "${C_DIM}        R . A . L . P . H${C_RESET}"
  log "${C_DIM}        PRESS F7 TO GO ON${C_RESET}"
}

MULE_MESSAGES=(
  "gathering resources"
  "harvesting fields"
  "trading goods"
  "surveying land"
  "irrigating plots"
  "mining ore"
  "plowing soil"
  "auctioning mules"
  "bartering supplies"
  "hauling cargo"
  "building outpost"
  "tending barns"
  "checking prices"
  "routing shipments"
  "prospecting"
  "rationing"
  "balancing markets"
  "setting downposts"
  "mapping terrain"
  "stabling mules"
  "loading wagons"
  "negotiating trades"
)

mule_message() {
  local count="${#MULE_MESSAGES[@]}"
  if [[ "$count" -eq 0 ]]; then
    printf "%s" "gathering"
    return 0
  fi
  local idx=$((RANDOM % count))
  printf "%s" "${MULE_MESSAGES[$idx]}"
}

mule_art_frame() {
  local frame="$1"
  if [[ "$frame" -eq 0 ]]; then
    cat <<'EOF'
          ___
      ---   ---
   -               -___
   -               ____|
    -----------
    | |         | |
   { }       { }
   ----   ----
EOF
  else
    cat <<'EOF'
          ___
      ---   ---
   -               -___
   -               ____|
    -----------
     | |       | |
    { }     { }
    ----   ----
EOF
  fi
}

print_mule_status() {
  local msg
  msg="$(mule_message)"
  log "${C_YELLOW}${msg}${C_RESET}"
  while IFS= read -r line; do
    log "${C_MAGENTA}${line}${C_RESET}"
  done < <(mule_art_frame $((RANDOM % 2)))
}

print_banner() {
  case "$RALPH_BANNER" in
    none) return 0 ;;
    mule) print_banner_mule ;;
    *)
      # Default to mule if misconfigured.
      print_banner_mule
      ;;
  esac
}

# Parse arguments
TOOL="codex"  # Default to Codex CLI
MAX_ITERATIONS=200

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      # Assume it's max_iterations if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "codex" && "$TOOL" != "amp" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'codex' or 'amp'."
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FALLBACK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$FALLBACK_ROOT")"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# Codex CLI defaults (override via env vars)
CODEX_SANDBOX="${CODEX_SANDBOX:-danger-full-access}" # read-only | workspace-write | danger-full-access
CODEX_APPROVAL="${CODEX_APPROVAL:-never}"            # untrusted | on-failure | on-request | never
CODEX_PROFILE="${CODEX_PROFILE:-}"                   # optional: config profile name from ~/.codex/config.toml
CODEX_SKIP_GIT_REPO_CHECK="${CODEX_SKIP_GIT_REPO_CHECK:-1}"  # 1 = skip trust check (default), 0 = require trusted dir
# 1 = pass Codex's explicit sandbox/approval bypass flag (for externally sandboxed, non-interactive automation)
CODEX_DANGEROUS_BYPASS="${CODEX_DANGEROUS_BYPASS:-1}"
RALPH_PUSH_ON_COMMIT="${RALPH_PUSH_ON_COMMIT:-0}"          # 1 = auto-push on per-story commits (default off; push occurs at completion)
RALPH_MERGE_MAIN_ON_COMPLETE="${RALPH_MERGE_MAIN_ON_COMPLETE:-1}" # 1 = merge completed feature branch into default and push

get_default_branch() {
  local d
  d="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
  if [[ -z "$d" ]]; then
    d="$(git -C "$REPO_ROOT" remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF; exit}')"
  fi
  [[ -n "$d" ]] || d="main"
  printf "%s" "$d"
}

get_feature_branch_from_prd() {
  if [[ -f "$PRD_FILE" ]]; then
    jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || true
  fi
}

story_ids_passed() {
  if [[ ! -f "$PRD_FILE" ]]; then
    return 0
  fi
  jq -r '.userStories[] | select(.passes == true) | .id' "$PRD_FILE" 2>/dev/null | sort -u || true
}

ensure_run_branch() {
  local default_branch="$1"
  local feature_branch="$2"

  info "Ensuring start from default branch: $default_branch"
  git -C "$REPO_ROOT" fetch origin >/dev/null 2>&1 || true
  git -C "$REPO_ROOT" checkout "$default_branch"
  git -C "$REPO_ROOT" pull --ff-only origin "$default_branch" >/dev/null 2>&1 || true

  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$feature_branch"; then
    info "Using existing feature branch: $feature_branch"
    git -C "$REPO_ROOT" checkout "$feature_branch"
  else
    info "Creating feature branch from $default_branch: $feature_branch"
    git -C "$REPO_ROOT" checkout -b "$feature_branch"
  fi
}

commit_if_dirty() {
  local msg="$1"
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
    git -C "$REPO_ROOT" add -A
    git -C "$REPO_ROOT" commit -m "$msg"
    return 0
  fi
  return 1
}

archive_run_snapshot() {
  # archive_run_snapshot <tag>
  local tag="$1"
  local runs_dir="$SCRIPT_DIR/runs"
  local ts folder branch_short commit_sha run_json
  ts="$(date +%Y-%m-%d_%H%M)"
  branch_short="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
  commit_sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

  mkdir -p "$runs_dir"

  # Deterministic base name: timestamp + tag + sanitized branch
  local branch_slug
  branch_slug="$(printf "%s" "$branch_short" | tr '/[:space:]' '--' | tr -cd '[:alnum:]_.-')"
  folder="${runs_dir}/${ts}_${tag}-${branch_slug}"

  # Ensure uniqueness if a collision occurs in the same minute.
  if [[ -e "$folder" ]]; then
    local n=2
    while [[ -e "${folder}-${n}" ]]; do
      n=$((n + 1))
    done
    folder="${folder}-${n}"
  fi

  mkdir -p "$folder"

  if [[ -f "$PRD_FILE" ]]; then
    cp "$PRD_FILE" "$folder/prd.json"
  fi
  if [[ -f "$PROGRESS_FILE" ]]; then
    cp "$PROGRESS_FILE" "$folder/progress.txt"
  fi

  run_json="$folder/run.json"
  cat > "$run_json" <<EOF
{
  "tag": "${tag}",
  "archivedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": "${branch_short}",
  "commit": "${commit_sha}",
  "status": "${tag}"
}
EOF

  info "Archived run snapshot to: $folder"

  # If archived successfully, clear root artifacts so next run starts clean.
  if [[ -f "$folder/prd.json" && -f "$PRD_FILE" ]]; then
    rm -f "$PRD_FILE"
    info "Removed root PRD after archival: $PRD_FILE"
  fi
  if [[ -f "$folder/progress.txt" && -f "$PROGRESS_FILE" ]]; then
    rm -f "$PROGRESS_FILE"
    info "Removed root progress log after archival: $PROGRESS_FILE"
  fi
}

print_prd_status() {
  if [[ ! -f "$PRD_FILE" ]]; then
    warn "No PRD found at: $PRD_FILE"
    warn "Create one from prd.json.example before running Ralph."
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1; then
    warn "jq is not installed; cannot summarize PRD progress."
    return 0
  fi

  local total done todo
  total="$(jq '.userStories | length' "$PRD_FILE" 2>/dev/null || echo 0)"
  done="$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo 0)"
  todo="$(( total - done ))"

  local pct="0"
  if [[ "$total" -gt 0 ]]; then
    pct="$(( (done * 100) / total ))"
  fi

  local bar
  bar="$(progress_bar "$done" "$total" 24)"
  log "${C_BOLD}PRD${C_RESET} ${C_DIM}($(basename "$PRD_FILE"))${C_RESET}  ${C_GREEN}${done}${C_RESET}/${C_BOLD}${total}${C_RESET} complete  ${C_DIM}${bar} ${pct}%${C_RESET}"

  # Next story (lowest numeric priority, then id)
  local next
  next="$(jq -r '
    .userStories
    | map(select(.passes == false))
    | sort_by(.priority, .id)
    | .[0] // empty
    | "\(.id)\t\(.priority)\t\(.title)"' "$PRD_FILE" 2>/dev/null || true)"

  if [[ -n "$next" ]]; then
    local id prio title
    id="$(printf "%s" "$next" | cut -f1)"
    prio="$(printf "%s" "$next" | cut -f2)"
    title="$(printf "%s" "$next" | cut -f3-)"
    log "${C_BOLD}Next${C_RESET}  ${C_MAGENTA}${id}${C_RESET}  ${C_DIM}(priority ${prio})${C_RESET}  ${title}"
  else
    log "${C_BOLD}Next${C_RESET}  ${C_GREEN}none${C_RESET} ${C_DIM}(all stories pass)${C_RESET}"
  fi
}

print_git_status() {
  if ! command -v git >/dev/null 2>&1; then return 0; fi
  local branch last
  branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  last="$(git -C "$REPO_ROOT" log -1 --oneline 2>/dev/null || echo "")"
  if [[ -n "$branch" ]]; then
    log "${C_BOLD}Git${C_RESET}   ${C_DIM}branch:${C_RESET} ${C_BLUE}${branch}${C_RESET}"
  fi
  if [[ -n "$last" ]]; then
    log "${C_DIM}      last:${C_RESET} ${last}"
  fi
  if [[ "$RALPH_VERBOSE" == "1" ]]; then
    local dirty
    dirty="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$dirty" == "0" ]]; then
      log "${C_DIM}      status:${C_RESET} ${C_GREEN}clean${C_RESET}"
    else
      log "${C_DIM}      status:${C_RESET} ${C_YELLOW}${dirty} changed file(s)${C_RESET}"
    fi
  fi
}

print_post_iteration_debug() {
  [[ "$RALPH_VERBOSE" == "1" ]] || return 0

  hr
  info "Post-iteration snapshot ($(ts))"
  print_git_status

  if [[ -f "$PROGRESS_FILE" ]]; then
    log "${C_BOLD}Progress log tail${C_RESET} ${C_DIM}($(basename "$PROGRESS_FILE"))${C_RESET}"
    tail -n 24 "$PROGRESS_FILE" 2>/dev/null || true
  fi
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    # Archive the previous run
    DATE=$(date +%Y-%m-%d)
    # Strip "ralph/" prefix from branch name for folder
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
    
    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"
    
    # Reset progress file for new run
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

DEFAULT_BRANCH="$(get_default_branch)"
FEATURE_BRANCH="$(get_feature_branch_from_prd)"
if [[ -z "$FEATURE_BRANCH" ]]; then
  err "PRD is missing branchName; cannot continue."
  exit 1
fi
ensure_run_branch "$DEFAULT_BRANCH" "$FEATURE_BRANCH"

hr
info "Starting Ralph ($(ts))"
print_banner
log "${C_BOLD}Tool${C_RESET}  ${C_MAGENTA}${TOOL}${C_RESET}  ${C_DIM}max iterations:${C_RESET} ${MAX_ITERATIONS}"
if [[ "$TOOL" == "codex" ]]; then
  log "${C_BOLD}Codex${C_RESET} ${C_DIM}profile:${C_RESET} ${CODEX_PROFILE:-"(none)"}  ${C_DIM}sandbox:${C_RESET} ${CODEX_SANDBOX:-"(from profile/default)"}  ${C_DIM}approval:${C_RESET} ${CODEX_APPROVAL:-"(from profile/default)"}  ${C_DIM}bypass:${C_RESET} ${CODEX_DANGEROUS_BYPASS}"
fi
log "${C_BOLD}Repo${C_RESET}  ${REPO_ROOT}"
log "${C_BOLD}Ralph${C_RESET} ${SCRIPT_DIR}"
print_git_status
print_prd_status
hr

for i in $(seq 1 $MAX_ITERATIONS); do
  iter_start="$(date +%s)"
  log ""
  if [[ "$RALPH_BANNER_EACH_ITER" == "1" ]]; then
    print_banner
  fi
  log "${C_BOLD}${C_MAGENTA}Ralph Iteration ${i}${C_RESET} ${C_DIM}of ${MAX_ITERATIONS}${C_RESET}  $(progress_bar "$i" "$MAX_ITERATIONS" 22)  ${C_DIM}tool:${C_RESET} ${C_MAGENTA}${TOOL}${C_RESET}"
  hr
  print_prd_status
  print_git_status
  hr

  PRE_ITER_HEAD="$(git -C "$REPO_ROOT" rev-parse --verify HEAD 2>/dev/null || echo "")"
  PASSED_BEFORE="$(story_ids_passed)"

  # Run the selected tool with the ralph prompt
  if [[ "$TOOL" == "codex" ]]; then
    # Codex CLI: non-interactive execution. Kept sandboxed by default; tune via CODEX_* env vars or ~/.codex/config.toml.
    CODEX_CMD=(codex --cd "$REPO_ROOT" --add-dir "$SCRIPT_DIR")
    LAST_MESSAGE_FILE="$(mktemp -t ralph_last_message.XXXXXX)"
    if [[ -n "$CODEX_PROFILE" ]]; then
      CODEX_CMD+=(--profile "$CODEX_PROFILE")
    fi

    if [[ "$CODEX_DANGEROUS_BYPASS" == "1" ]]; then
      # Bypass mode is mutually exclusive with explicit approval/sandbox flags.
      CODEX_CMD+=(--dangerously-bypass-approvals-and-sandbox)
    else
      # Prefer explicit env overrides. Otherwise, if no profile is set, use safe defaults.
      SANDBOX_ARG="$CODEX_SANDBOX"
      if [[ -z "$SANDBOX_ARG" && -z "$CODEX_PROFILE" ]]; then
        SANDBOX_ARG="danger-full-access"
      fi
      if [[ -n "$SANDBOX_ARG" ]]; then
        CODEX_CMD+=(--sandbox "$SANDBOX_ARG")
      fi

      APPROVAL_ARG="$CODEX_APPROVAL"
      if [[ -z "$APPROVAL_ARG" && -z "$CODEX_PROFILE" ]]; then
        APPROVAL_ARG="never"
      fi
      if [[ -n "$APPROVAL_ARG" ]]; then
        CODEX_CMD+=(--ask-for-approval "$APPROVAL_ARG")
      fi
    fi

    # Force color since output is piped through tee (non-tty).
    EXEC_ARGS=(exec)
    if [[ "$CODEX_SKIP_GIT_REPO_CHECK" == "1" ]]; then
      EXEC_ARGS+=(--skip-git-repo-check)
    fi
    EXEC_ARGS+=(--color always --output-last-message "$LAST_MESSAGE_FILE" -)
    CODEX_CMD+=("${EXEC_ARGS[@]}")

    print_mule_status
    info "Invoking Codex ($(ts))"
    OUTPUT=$(
      {
        echo "# Ralph Paths"
        echo ""
        echo "- Repo root: $REPO_ROOT"
        echo "- Ralph dir (PRD/progress live here): $SCRIPT_DIR"
        echo "- PRD: $PRD_FILE"
        echo "- Progress log: $PROGRESS_FILE"
        echo ""
        echo "---"
        echo ""
        cat "$SCRIPT_DIR/CODEX.md"
      } | "${CODEX_CMD[@]}" 2>&1 | tee /dev/stderr
    ) || true
  else
    print_mule_status
    info "Invoking Amp ($(ts))"
    OUTPUT=$(cat "$SCRIPT_DIR/prompt.md" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  fi

  iter_end="$(date +%s)"
  iter_secs="$(( iter_end - iter_start ))"
  hr
  info "Iteration ${i} finished in ${iter_secs}s ($(ts))"

  PASSED_AFTER="$(story_ids_passed)"
  NEWLY_COMPLETED="$(comm -13 <(printf "%s
" "$PASSED_BEFORE" | sed '/^$/d' | sort -u) <(printf "%s
" "$PASSED_AFTER" | sed '/^$/d' | sort -u) || true)"
  if [[ -n "$NEWLY_COMPLETED" ]]; then
    CURRENT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
    if [[ "$CURRENT_BRANCH" != "$FEATURE_BRANCH" ]]; then
      info "Switching back to feature branch for per-story commit: $FEATURE_BRANCH"
      git -C "$REPO_ROOT" checkout "$FEATURE_BRANCH"
    fi

    STORY_LIST="$(printf "%s" "$NEWLY_COMPLETED" | paste -sd ', ' -)"
    if commit_if_dirty "feat: complete story ${STORY_LIST}"; then
      info "Committed completed story work on $FEATURE_BRANCH: $STORY_LIST"
      if [[ "$RALPH_PUSH_ON_COMMIT" == "1" ]]; then
        git -C "$REPO_ROOT" push -u origin "$FEATURE_BRANCH" || warn "Per-story push failed on $FEATURE_BRANCH"
      fi
    else
      info "Story marked complete in PRD, but no uncommitted changes were found."
    fi
  fi

  # Check for completion signal (Codex: only final assistant message)
  COMPLETE_FOUND="0"
  if [[ "$TOOL" == "codex" && -n "${LAST_MESSAGE_FILE:-}" && -f "$LAST_MESSAGE_FILE" ]]; then
    if grep -q "<promise>COMPLETE</promise>" "$LAST_MESSAGE_FILE"; then
      COMPLETE_FOUND="1"
    fi
  else
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
      COMPLETE_FOUND="1"
    fi
  fi

  if [[ "$COMPLETE_FOUND" == "1" ]]; then
    print_post_iteration_debug
    log ""
    log "${C_GREEN}${C_BOLD}Ralph completed all tasks!${C_RESET}"
    log "${C_DIM}Completed at iteration ${i} of ${MAX_ITERATIONS}.${C_RESET}"

    CURRENT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
    if [[ "$CURRENT_BRANCH" != "$FEATURE_BRANCH" ]]; then
      info "Switching to feature branch before finalize: $FEATURE_BRANCH"
      git -C "$REPO_ROOT" checkout "$FEATURE_BRANCH"
    fi

    info "Pushing feature branch to origin: $FEATURE_BRANCH"
    git -C "$REPO_ROOT" push -u origin "$FEATURE_BRANCH" || warn "Failed to push feature branch $FEATURE_BRANCH"

    if [[ "$RALPH_MERGE_MAIN_ON_COMPLETE" == "1" ]]; then
      info "Switching to default branch: $DEFAULT_BRANCH"
      if git -C "$REPO_ROOT" checkout "$DEFAULT_BRANCH"; then
        info "Merging feature branch into $DEFAULT_BRANCH"
        if git -C "$REPO_ROOT" merge --no-ff "$FEATURE_BRANCH" -m "merge: $FEATURE_BRANCH into $DEFAULT_BRANCH (Ralph auto-merge)"; then
          info "Pushing updated $DEFAULT_BRANCH to origin"
          git -C "$REPO_ROOT" push origin "$DEFAULT_BRANCH" || warn "Failed to push $DEFAULT_BRANCH to origin"
        else
          warn "Auto-merge into $DEFAULT_BRANCH failed; resolve manually"
        fi
      else
        warn "Failed to checkout default branch $DEFAULT_BRANCH"
      fi
    fi

    archive_run_snapshot "completed"

    [[ -n "${LAST_MESSAGE_FILE:-}" ]] && rm -f "$LAST_MESSAGE_FILE" || true
    exit 0
  fi
  
  print_post_iteration_debug
  log "${C_DIM}Iteration ${i} complete. Continuing...${C_RESET}"
  [[ -n "${LAST_MESSAGE_FILE:-}" ]] && rm -f "$LAST_MESSAGE_FILE" || true
  sleep_with_progress "$RALPH_SLEEP_SECONDS"
done

log ""
err "Ralph reached max iterations (${MAX_ITERATIONS}) without completing all tasks."
log "Check: ${PROGRESS_FILE}"
exit 1