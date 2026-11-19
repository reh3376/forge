#!/usr/bin/env bash
# Decide whether a CI job has anything to check (BACKLOG FB-173).
#
#   changed-paths.sh <job name> <path prefix>...
#
# Writes run=true or run=false to $GITHUB_OUTPUT and says why, on the log and in the
# job summary. The job itself always runs and reports, because it is a required check
# on main: only its expensive steps are skipped when nothing it checks has changed.
#
# What is compared:
#   a pull request      its base commit .. HEAD
#   a push to main      the commit main was at before the push .. HEAD (a merge: the whole PR)
#   a push elsewhere    where the branch left main .. HEAD (the whole branch, not only the
#                       last push, so an earlier commit on the branch is never missed)
#
# It fails open: whenever the comparison cannot be made, the job runs in full.
set -u

job="$1"
shift

out="${GITHUB_OUTPUT:-/dev/null}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

decide() {
  echo "run=$1" >>"$out"
  echo "$job: $2"
  echo "**$job**: $2" >>"$summary"
  exit 0
}

zero="0000000000000000000000000000000000000000"
base=""
case "${EVENT_NAME:-}" in
  pull_request) base="${PR_BASE_SHA:-}" ;;
  push)
    if [ "${REF_NAME:-}" = "main" ]; then
      base="${BEFORE_SHA:-}"
    else
      base="$(git merge-base origin/main HEAD 2>/dev/null || true)"
    fi
    ;;
esac

if [ -z "$base" ] || [ "$base" = "$zero" ]; then
  decide true "running in full: no commit to compare against."
fi
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  decide true "running in full: the commit to compare against ($base) is not in this checkout."
fi
if ! files="$(git diff --name-only "$base" HEAD 2>/dev/null)"; then
  decide true "running in full: the changed files could not be listed."
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue
  for prefix in "$@"; do
    case "$file" in
      "$prefix"*) decide true "running: $file changed (under $prefix)." ;;
    esac
  done
done <<<"$files"

count="$(printf '%s\n' "$files" | grep -c . || true)"
decide false "nothing to check: none of the $count changed file(s) is under $(printf '%s, ' "$@" | sed 's/, $//'). The steps below are skipped."
