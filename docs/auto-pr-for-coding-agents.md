# Auto-PR for coding agents

This guide is for a coding agent that works for the owner (GitHub user `reh3376`). In the auto-PR flow the agent pushes to a development branch and a GitHub Actions workflow opens the pull request to `main`. The guide explains how to work inside that flow, how to review an existing setup without changing it, and how to propose the flow for a repository that lacks it.

In the forge repository the flow is `.github/workflows/auto-pr.yml`, and `CLAUDE.md` ("How work is done here (A-8)", steps 4 to 6) makes it part of the workflow. Where this guide and those files disagree, those files win. Every setting quoted here was read on 2026-11-24; section 9 says where.

> **The one rule.** The owner reviews and approves every pull request, so the owner is never its author. The workflow opens the pull request under a bot or machine identity (today `github-actions[bot]`). The agent never opens a pull request itself: no `gh pr create`, no API call, no button on github.com. The agent's `gh` and `git` are logged in as the owner, so anything the agent opens is authored by the owner, and GitHub does not let an author approve their own pull request.

| Section | What it covers |
|---|---|
| [1](#1-the-one-rule) | The rule, what breaks when it is broken, and how to recover |
| [2](#2-how-the-flow-works-in-forge) | The flow end to end: branch, push, workflow, identity, permissions, CI, merge |
| [3](#3-reviewing-an-existing-setup-read-only) | A read-only checklist for an existing setup, and what to report |
| [4](#4-implementing-it-in-a-repository-that-lacks-it) | The workflow (copied exactly), line by line; the settings and branch protection the owner turns on |
| [5](#5-the-bot-identity-and-the-machine-account-option-fb-047) | `github-actions[bot]`, its limits, and the machine-account option of FB-047 |
| [6](#6-signing) | What "signed" means here; signed commits (not in force) |
| [7](#7-what-the-agent-must-never-do) | What the agent must never do |
| [8](#8-checklists-and-troubleshooting) | A checklist for each push; a troubleshooting table |
| [9](#9-what-was-verified-and-where) | What was verified and where; what was not |

## 1. The one rule

GitHub's rule is plain: "Pull request authors cannot approve their own pull requests" (GitHub Docs, "Approving a pull request with required reviews"). The owner is the reviewer, so the owner cannot be the author.

The trap is that the agent works with the owner's credentials. Check which account the agent's `gh` uses:

```bash
gh api user --jq .login      # on the owner's machine this prints: reh3376
```

Whatever the agent opens with those credentials is authored by `reh3376`. That covers every route:

- `gh pr create`, in any form;
- the REST call `POST /repos/{owner}/{repo}/pulls` (for example through `gh api`), or any GraphQL mutation that creates a pull request;
- the "Create pull request" button on github.com, or browser automation that clicks it;
- any skill, plugin, script or command that opens a pull request when the branch has none. In Claude Code the `/ship` skill is one: it opens a pull request if the branch has none. Do not run it in a repository that uses this flow. `CLAUDE.md` already sets aside every plugin step that runs `gh pr create`.

The agent pushes. The workflow opens. Nothing else opens a pull request.

### What breaks when the owner is the author

| Effect | Why, in forge |
|---|---|
| The owner cannot approve it | GitHub's rule above. |
| Nobody else can satisfy the review | `main` requires one approving review and a review from Code Owners (`required_approving_review_count: 1`, `require_code_owner_reviews: true`). `.github/CODEOWNERS` line 2, `* @reh3376`, makes the owner the only code owner of every path. |
| The only way in is an administrator bypass, which merges unreviewed code | `enforce_admins` is off on `main`, and by default protection rules "do not apply to people with admin permissions to the repository" (GitHub Docs, "About protected branches"). Pull requests 7 and 159 were opened under the owner's account and merged by the owner with no review recorded. |
| The workflow does not open the right pull request | `auto-pr.yml` exits as soon as any open pull request exists for the branch (lines 47 to 51), so the owner's pull request blocks the bot's. |
| The pull request has no model label, no identity line and no reviewer request | The workflow adds those (lines 57 to 78); a hand-opened pull request has none of them. |

### Recovering

1. Confirm the author. The REST form works when GitHub's GraphQL API is failing (it returned HTTP 503 several times on 2026-11-24, which breaks `gh pr list` and `gh pr view`):

   ```bash
   gh api repos/reh3376/forge/pulls/<n> --jq '{author: .user.login, type: .user.type, state}'
   ```

   `reh3376` with type `User` means the owner is the author. `github-actions[bot]` with type `Bot` is correct.

2. Stop. Push nothing more to the branch. Tell the owner the pull request number, how it was opened, and the commands in steps 3 and 4. Closing a pull request needs the owner's word.

3. On the owner's word, close it and keep the branch:

   ```bash
   gh pr close <n> --repo reh3376/forge --comment "Opened under the owner's account by mistake. The auto-PR workflow opens it again as github-actions[bot]."
   ```

   Never add `--delete-branch` (`-d`). It deletes the local and the remote branch.

4. Let the workflow open it again by re-running its run for the branch's current head:

   ```bash
   git fetch origin
   git rev-parse origin/reh3376_dev01
   gh run list --repo reh3376/forge --workflow auto-pr.yml --branch reh3376_dev01 --limit 1 --json databaseId,headSha,conclusion
   gh run rerun <databaseId> --repo reh3376/forge
   ```

   Use the run whose `headSha` equals the branch head. A re-run uses "the same `GITHUB_SHA` (commit SHA) and `GITHUB_REF` (git ref) of the original event", and a run can be re-run "up to 30 days after its initial run" (GitHub Docs, "Re-running workflows and jobs"). The workflow finds no open pull request and opens one with `GITHUB_TOKEN`, so the author is `github-actions[bot]`. If there is no such run, or it is older than 30 days, the next push opens the pull request.

5. Check the new one: `gh api repos/reh3376/forge/pulls/<new n> --jq .user.login` prints `github-actions[bot]`. Report the new number to the owner.

## 2. How the flow works in forge

| Step | What happens | Where |
|---|---|---|
| 1. Commit | The agent commits on `reh3376_dev01`, never on `main`. Each commit carries a `Co-Authored-By:` trailer that names the model; the workflow reads it. | `CLAUDE.md` A-8 step 1; `auto-pr.yml` line 58 |
| 2. Gate 2 | The agent stops before pushing and waits for the owner's `go` (or keywords). | `CLAUDE.md` A-8 step 3; `docs/gates-for-coding-agents.md` |
| 3. Push | `git push origin reh3376_dev01`. The push starts two workflows on the same commit: `CI` (`ci.yml`, on push to any branch) and `Auto PR to main` (`auto-pr.yml`, on push to any branch except `main`). | `ci.yml` lines 9 to 13; `auto-pr.yml` lines 16 to 19 |
| 4. One run per branch | The auto-PR runs of one branch never overlap (`concurrency` group `auto-pr-<branch>`, `cancel-in-progress: false`). The run of a second push made while the first run is opening the pull request waits, then finds the pull request and does nothing. | `auto-pr.yml` lines 26 to 28 |
| 5. Already open? | If an open pull request from the branch to `main` exists, the run logs `An open PR already exists for reh3376_dev01 -> main; nothing to do.` and ends. | lines 47 to 51 |
| 6. Anything to open? | If the pushed commit is already in `main`, the run logs `reh3376_dev01 has no commits beyond main; nothing to open.` and ends. | lines 52 to 55 |
| 7. Open | Otherwise it names the model from the trailers, creates or updates the label `model:<slug>` (PR 181 carries `model:claude-opus-5-5`), takes the title from the latest commit's subject, writes a body naming the model, the pusher and the PR identity, requests the pusher as reviewer, and opens the pull request. | lines 57 to 78 |
| 8. Identity | The token is `secrets.MODEL_PR_TOKEN` if that secret is set, else `secrets.GITHUB_TOKEN`. forge has no Actions secrets, so every pull request opens as `github-actions[bot]`. Pull requests 176 to 182 all show that author. | line 40; `gh api repos/reh3376/forge/actions/secrets` returns `total_count: 0` |
| 9. Review | The pusher (`github.actor`, which is `reh3376` because the agent pushes with the owner's credentials) is requested as reviewer; on PR 181 the event is `review_requested` by `github-actions[bot]` for `reh3376`. The owner approves; GitHub allows it because the author is the bot. | line 44 and lines 74 to 77; `gh api repos/reh3376/forge/issues/181/events` |
| 10. Merge | The owner merges with a merge commit (`Merge pull request #181 from reh3376/reh3376_dev01`) and tells the agent "pr N merged". | `CLAUDE.md` A-8 step 5 |
| 11. Sync | The agent confirms the merge, brings the branch up to `main`, confirms no pull request is open, and starts the next item. | below |

The body the workflow writes ends with "Replace this body with the sprint summary before review." Editing the body (`gh pr edit <n> --body-file <file>`) does not change the author. Edit it only when the owner's rules for the repository ask for it.

### Permissions it needs

- **In the workflow** (`auto-pr.yml` lines 21 to 24): `contents: read` (checkout and `git log`), `pull-requests: write` (open the pull request, request the reviewer) and `issues: write` (the label; GitHub lists the label endpoints under both the Issues and the Pull requests permission). Every permission the block does not name is set to `none` ("If you specify the access for any of these permissions, all of those that are not specified are set to `none`", GitHub Docs, "Workflow syntax").
- **In the repository** (Settings, Actions, General, "Workflow permissions"): "Allow GitHub Actions to create and approve pull requests" must be on. For a repository in a personal account the default is that "workflows are not allowed to create or approve pull requests" (GitHub Docs, "Managing GitHub Actions settings for a repository"). forge reads `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`: the token is read-only by default, and the workflow raises only what it needs.
- **Allowed actions**: forge allows only selected actions (GitHub-owned, verified creators, and the two third-party patterns its CI uses). The auto-PR workflow uses only `actions/checkout`, which is GitHub-owned.

### Why CI runs on `push`

GitHub Docs, "Triggering a workflow" ("Triggering a workflow from a workflow"): "events triggered by the `GITHUB_TOKEN` will not create a new workflow run". For `pull_request` events with the `opened`, `synchronize` or `reopened` activity types, a pull request created or updated with `GITHUB_TOKEN` creates workflow runs in an **approval-required** state, which a user with write access can start with **Approve workflows to run**. A personal access token or a GitHub App installation token instead of `GITHUB_TOKEN` lets those runs start without the prompt.

forge copes by running CI on `push` (`ci.yml` lines 9 to 11). The four required checks on `main` (`hub-python`, `hub-go`, `mes-module`, `secrets-scan`) are jobs of the push run of the branch's head commit, and they attach to the pull request. `ci.yml` also triggers on `pull_request` to `main`, for pull requests from forks, and each job carries a job-level `if` (lines 25, 55, 96, 157):

```yaml
if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name != github.repository
```

A pull request from a branch of the same repository already ran its jobs on the push, so a `pull_request` run for it would run nothing. In practice the bot's pull request does create that `pull_request` run, in the approval-required state, with no jobs. It is FB-175. Observed on 2026-11-24: on PR 182 the run read `action_required` while the pull request was open, and changed to `failure` one second after the merge (merged 17:00:12, run updated 17:00:13); the runs of PRs 177 to 181 show the same `failure`. It is not a required check and does not block a merge. The header comment of `ci.yml` (lines 3 to 6) says such pull requests "do not fire pull_request events"; that is out of date, and FB-175 records it.

### When the owner says "pr N merged"

```bash
gh api repos/reh3376/forge/pulls/<n> --jq '{merged, merged_by: .merged_by.login, merge_commit_sha}'
git fetch origin
git merge --ff-only origin/main      # on reh3376_dev01
gh api 'repos/reh3376/forge/pulls?state=open&head=reh3376:reh3376_dev01' --jq 'length'    # must print 0
```

forge's history matches this: after PR 181, the next commit on `reh3376_dev01` (`2a2c2f6e`) sits directly on the merge commit `21ef3a78`, so the branch was fast-forwarded to `main`. If `--ff-only` refuses, the branch holds commits that are not on `main`: stop and report. Do not rebase, reset or force-push without the owner's word. Then follow the rest of `CLAUDE.md` step 5 (for example, `this change` in `BACKLOG-DONE.md` becomes the commit and the pull request).

## 3. Reviewing an existing setup (read-only)

Run these checks without changing anything. Replace `OWNER/REPO` with the repository. The branch-protection and secrets reads need admin access, which the owner's `gh` login has.

| # | Check | Command | forge on 2026-11-24 | If it differs |
|---|---|---|---|---|
| 1 | The workflow exists and triggers on push to every branch but the base | `sed -n '14,28p' .github/workflows/auto-pr.yml` | `on: push: branches-ignore: [main]` | No workflow: the repository lacks the flow (section 4). Another trigger (`pull_request`, `schedule`, a branch list that leaves out the development branch): report it. |
| 2 | Its permissions | same file, `permissions:` | `contents: read`, `pull-requests: write`, `issues: write` | Missing: the job gets the repository default, read-only in forge, and cannot open a pull request. `write-all` or extra write permissions: report as broader than needed. |
| 3 | Its PR step | same file, the `run:` block | checks for an open PR, opens one; no approve, no merge | Any `gh pr review --approve`, `gh pr merge` or auto-merge step: report at once. A workflow must never approve or merge. |
| 4 | Its token | the `GH_TOKEN` line | `secrets.MODEL_PR_TOKEN \|\| secrets.GITHUB_TOKEN` | Any other secret: ask the owner whose account it belongs to. If it is the owner's, the owner is the author again (section 5). |
| 5 | Actions may create pull requests | `gh api repos/OWNER/REPO/actions/permissions/workflow` | `"default_workflow_permissions":"read","can_approve_pull_request_reviews":true` | `false`: the bot cannot open pull requests and the workflow run fails. The owner turns the setting on (section 4.4). |
| 6 | Actions are enabled and `actions/checkout` is allowed | `gh api repos/OWNER/REPO/actions/permissions` and `.../actions/permissions/selected-actions` | `enabled: true`, `allowed_actions: selected`, `github_owned_allowed: true` | Disabled, or GitHub-owned actions not allowed: the workflow cannot run. |
| 7 | Which secrets exist (names only) | `gh api repos/OWNER/REPO/actions/secrets --jq '[.secrets[].name]'` | `[]` | A `MODEL_PR_TOKEN`: pull requests open under that token's account. Check the author of the next pull request. |
| 8 | Branch protection of the base | `gh api repos/OWNER/REPO/branches/main/protection` | see the table below | Compare with section 4.4 and report each difference. |
| 9 | Signed commits required | `gh api repos/OWNER/REPO/branches/main/protection/required_signatures` | `"enabled": false` | `true`: every commit on the branch must be signed and verified (section 6). |
| 10 | Rulesets | `gh api repos/OWNER/REPO/rulesets` and `gh api repos/OWNER/REPO/rules/branches/main` | one ruleset, `forge-rulz`, `enforcement: disabled`; no active rules on `main` (`[]`) | An active ruleset adds to branch protection: read its rules (`gh api repos/OWNER/REPO/rulesets/<id>`) and report them. |
| 11 | Code owners | `cat .github/CODEOWNERS` | `* @reh3376` and three narrower paths, all `@reh3376` | No file: "Require review from Code Owners" has no owner to ask. The owner as the only code owner is what makes section 1 strict. |
| 12 | Who authored the last pull requests | `gh pr list --repo OWNER/REPO --state merged --limit 5 --json number,author,headRefName,baseRefName` | `author.login: app/github-actions`, `is_bot: true` (REST: `github-actions[bot]`) | `reh3376`: find out how it was opened and report (section 1). |
| 13 | Recent workflow runs | `gh run list --repo OWNER/REPO --workflow auto-pr.yml --limit 5` | all `success` | A failure: read the log (`gh run view <id> --log`) and report the cause. |
| 14 | The agent's own login | `gh api user --jq .login` | `reh3376` | Confirms that anything the agent opens is the owner's. |

Branch protection of `main` today:

| Field | Value | What it means for the flow |
|---|---|---|
| `required_status_checks.contexts` | `hub-python`, `hub-go`, `mes-module`, `secrets-scan` | Jobs of the CI push run; they must pass. |
| `required_status_checks.strict` | `true` | "The branch must be up to date with the base branch before merging." |
| `required_approving_review_count` | `1` | One approval. |
| `require_code_owner_reviews` | `true` | The approval must be the owner's (CODEOWNERS). |
| `dismiss_stale_reviews` | `true` | A push to an approved pull request dismisses the approval (`CLAUDE.md` A-8 step 6). |
| `require_last_push_approval` | `false` | Must stay off while the agent pushes as the owner (section 4.4). |
| `required_signatures.enabled` | `false` | Signed commits are not required. |
| `enforce_admins.enabled` | `false` | The owner, as administrator, can bypass the rules. |
| `required_conversation_resolution.enabled` | `true` | Every review comment must be resolved before merging. |
| `required_linear_history`, `allow_force_pushes`, `allow_deletions` | all `false` | Merge commits are allowed; no force-push to or deletion of `main`. |

What to report instead of changing anything: one message to the owner that lists each finding, what it means for the flow, the change the agent proposes, and a plain statement that nothing was changed.

## 4. Implementing it in a repository that lacks it

### 4.1 Who decides

Adding a workflow, changing repository settings or branch protection, and creating secrets, tokens, accounts or apps are the owner's decisions. The agent writes the proposal: the workflow file, the settings and the commands below. It changes nothing on GitHub. The owner turns the settings on. The workflow file reaches the repository through the owner's normal review, never by a direct push to the base branch.

### 4.2 The workflow, copied exactly from forge

This is `.github/workflows/auto-pr.yml` in forge as of commit `2a2c2f6e`, unchanged:

```yaml
# Auto-open a pull request to main whenever a non-main branch is pushed and no
# open PR exists for it yet. Idempotent: later pushes to the same branch are no-ops.
#
# Author identity
# - If the repo secret MODEL_PR_TOKEN is set (a fine-grained PAT for the model's
#   machine account, e.g. "reh3376-claude", with Contents: read and Pull
#   requests: write on this repo), the PR is opened AS that account and
#   pull_request workflows fire normally.
# - Otherwise it is opened with GITHUB_TOKEN as github-actions[bot]; such PRs do
#   not trigger other pull_request workflows (CI still runs on the push).
# In both cases the body names the model detected from the commits'
# Co-Authored-By trailers and the human who pushed, and the pusher is requested
# as reviewer so they can approve.
name: Auto PR to main

on:
  push:
    branches-ignore:
      - main

permissions:
  contents: read
  pull-requests: write
  issues: write

concurrency:
  group: auto-pr-${{ github.ref_name }}
  cancel-in-progress: false

jobs:
  open-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Open PR if none is open for this branch
        env:
          GH_TOKEN: ${{ secrets.MODEL_PR_TOKEN || secrets.GITHUB_TOKEN }}
          USING_MODEL_TOKEN: ${{ secrets.MODEL_PR_TOKEN != '' }}
          BRANCH: ${{ github.ref_name }}
          BASE: main
          PUSHER: ${{ github.actor }}
        run: |
          set -euo pipefail
          open_count=$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq 'length')
          if [ "$open_count" -gt 0 ]; then
            echo "An open PR already exists for $BRANCH -> $BASE; nothing to do."
            exit 0
          fi
          if git merge-base --is-ancestor "$GITHUB_SHA" "origin/$BASE"; then
            echo "$BRANCH has no commits beyond $BASE; nothing to open."
            exit 0
          fi

          # Model attribution from Co-Authored-By trailers on the new commits.
          model=$(git log "origin/$BASE..$GITHUB_SHA" --format='%(trailers:key=Co-Authored-By,valueonly)' \
            | grep -iE 'claude|gpt|gemini|copilot|codex|llama|mistral' | head -1 | sed -E 's/ *<.*//' || true)
          [ -z "$model" ] && model="unknown model"
          slug=$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed -E 's/-+/-/g; s/^-|-$//g')

          if [ "$USING_MODEL_TOKEN" = "true" ]; then
            identity="the model's account (MODEL_PR_TOKEN)"
          else
            identity="github-actions[bot] (set repo secret MODEL_PR_TOKEN to open PRs as the model's account)"
          fi

          title=$(git log -1 --pretty=%s "$GITHUB_SHA")
          body=$(printf '**Opened by:** %s · **pushed by:** @%s · **PR identity:** %s\n\nAuto-opened on push to `%s`. Replace this body with the sprint summary before review.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n' "$model" "$PUSHER" "$identity" "$BRANCH")

          gh label create "model:$slug" --color 5319E7 --description "PR authored with $model" --force >/dev/null 2>&1 || true
          args=(--base "$BASE" --head "$BRANCH" --title "$title" --body "$body" --label "model:$slug")
          # Request the pusher as reviewer unless they would be the PR author.
          if [ "$USING_MODEL_TOKEN" = "true" ] || [ "$PUSHER" != "$(gh api user --jq .login 2>/dev/null || echo '')" ]; then
            args+=(--reviewer "$PUSHER")
          fi
          gh pr create "${args[@]}" || gh pr create --base "$BASE" --head "$BRANCH" --title "$title" --body "$body"
```

### 4.3 Line by line

| Lines | What they do |
|---|---|
| 1 to 13 | Comments. They say how the author is chosen; the example account name in them is only an example. |
| 14 | The workflow's name in the Actions list: `Auto PR to main`. |
| 16 to 19 | Runs on every push to any branch except `main`. "When a pattern matches the `branches-ignore` or `tags-ignore` pattern, the workflow will not run" (GitHub Docs, "Workflow syntax"). A push to `main`, such as the owner's merge, never starts it. |
| 21 to 24 | The token's permissions for this workflow; all others are `none`. |
| 26 to 28 | One run per branch at a time. `cancel-in-progress: false` lets a run that is opening a pull request finish; the next run waits and then finds the pull request. GitHub keeps at most one run waiting per group; a newer waiting run replaces an older one. |
| 31 to 32 | One job, `open-pr`, on a GitHub-hosted Linux runner. |
| 34 to 36 | Checks out the repository with full history (`fetch-depth: 0`), needed by `git merge-base` and `git log origin/main..` below. |
| 40 | `GH_TOKEN` for the `gh` CLI: `MODEL_PR_TOKEN` if set, else `GITHUB_TOKEN`. An unset secret evaluates to an empty string, so `\|\|` falls through to `GITHUB_TOKEN`. |
| 41 | `USING_MODEL_TOKEN` is the text `true` when the secret is set. |
| 42 to 44 | The branch pushed, the base (`main`), and the pusher (`github.actor`). |
| 46 | Fail on any error, unset variable or failed pipe. |
| 47 to 51 | Idempotence: if an open pull request from this branch to `main` exists, stop. Every later push to a branch with an open pull request is a no-op here. |
| 52 to 55 | If the pushed commit is already in `main` (the branch was just fast-forwarded to it), there is nothing to open. |
| 58 to 60 | Reads the `Co-Authored-By` trailers of the new commits, keeps the first one that matches a list of model names, and drops the email. With no match the model is `unknown model`. |
| 61 | Turns the model name into a label slug, such as `claude-opus-5-5`. |
| 63 to 67 | The identity line for the body: the model's account, or `github-actions[bot]` with a hint about `MODEL_PR_TOKEN`. |
| 69 | The title is the subject line of the latest commit. |
| 70 | The body: model, pusher, identity, the branch, a request to replace the body with a summary, and the attribution line. |
| 72 | Creates the label `model:<slug>`, or updates it if it exists (`--force`); errors are ignored. |
| 73 | The arguments: base, head, title, body, label. |
| 74 to 77 | Requests the pusher as reviewer unless the pusher would be the author. With `GITHUB_TOKEN` the condition holds in practice: on PR 181 the reviewer request was made. |
| 78 | Opens the pull request. If that fails (for example on the label or the reviewer), it tries once more with base, head, title and body only. |

To use it in another repository, change only what is specific to forge: `BASE: main` and `branches-ignore: - main` if the base branch has another name, and the body text if the repository has no "sprint summary". Keep the open-PR check, the permissions block and the token line as they are.

On the first push of a branch that adds this file, the workflow runs from that branch. GitHub Docs ("Events that trigger workflows", `push`) says this "includes workflows that are not merged into the default branch". So the branch that adds the workflow opens its own pull request, provided the setting in 4.4 is on.

### 4.4 Repository settings the owner turns on

| Setting | Where in GitHub | API (owner runs it) |
|---|---|---|
| Actions enabled, and GitHub-owned actions allowed | Settings, Actions, General, "Actions permissions" | read: `gh api repos/OWNER/REPO/actions/permissions` |
| Workflow permissions: read by default; "Allow GitHub Actions to create and approve pull requests" on | Settings, Actions, General, "Workflow permissions" | `gh api -X PUT repos/OWNER/REPO/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true` |

The REST reference describes `can_approve_pull_request_reviews` as "Whether GitHub Actions can approve pull requests" and warns "Enabling this can be a security risk." The settings page describes one setting that lets `GITHUB_TOKEN` "create and approve pull requests", with no separate switch for creating only. In forge the field reads `true` and the bot creates pull requests. That the API field and the checkbox are the same setting is inferred from this; the documentation does not say it outright. The flow needs only creation, so no workflow may contain an approval step (section 3, check 3).

Branch protection that fits the flow (Settings, "Branches" in the "Code, planning, and automation" section, "Add classic branch protection rule" or "Edit"):

| Option (label in GitHub) | Value | Why |
|---|---|---|
| Require a pull request before merging; Require approvals | on, 1 | The owner's review is the gate. |
| Require review from Code Owners | on, with a CODEOWNERS file naming the owner | The approval that counts is the owner's. |
| Dismiss stale pull request approvals when new commits are pushed | on | A push after approval needs a new approval; it backs up the rule never to push while the pull request is open. |
| Require approval of the most recent reviewable push | **off** | It requires "that the most recent reviewable push must be approved by someone other than the person who pushed it". The agent pushes with the owner's credentials, so the owner is always the last pusher and could never approve. |
| Require status checks to pass before merging; Require branches to be up to date before merging | on, with the CI jobs that run on `push` | The checks come from the push run. |
| Require conversation resolution before merging | on (forge) | Optional for the flow. |
| Require signed commits | off today (section 6) | Turn on only after every committer signs. |
| Do not allow bypassing the above settings | off today in forge | With it on, the owner could not merge a pull request the owner authored even by bypass, which enforces section 1 on GitHub's side. It also stops every other administrator bypass, so it is the owner's call. |

The API equivalent is `PUT /repos/{owner}/{repo}/branches/{branch}/protection`; its full request body is not reproduced here. Read the result with `GET` (section 3, check 8).

### 4.5 CI that works with bot-opened pull requests

A pull request opened with `GITHUB_TOKEN` does not start CI normally (section 2). Run CI on `push` and make the required checks jobs of that run, as forge does (`ci.yml` lines 9 to 13 and the job-level `if`). Do not rely on `pull_request` workflows unless the pull request is opened with a personal access token or a GitHub App token (section 5).

## 5. The bot identity and the machine-account option (FB-047)

### `github-actions[bot]` today

- It is the author of every pull request the workflow opens with `GITHUB_TOKEN`. In `gh pr list --json author` it appears as `app/github-actions` with `is_bot: true`; in the REST API as `github-actions[bot]` with type `Bot`.
- Its pull request events start no ordinary `pull_request` runs: they are created in the approval-required state (section 2, FB-175).
- It is not the model's own account. The body and the label name the model; the trailer on each commit is the source.
- The owner can approve its pull requests, which is the point.

### The machine-account option

FB-047 in `BACKLOG.md` proposes a separate machine account for the model, with a token stored as the repository secret `MODEL_PR_TOKEN`. The workflow already supports it (line 40): with the secret set, pull requests open as that account and `pull_request` workflows run without approval. GitHub's terms allow a machine account: it is "set up by an individual human who accepts the Terms on behalf of the Account", and "the owner of the Account is ultimately responsible for the machine's actions" (GitHub Terms of Service, B.3).

**The token must never belong to the owner's account.** If `MODEL_PR_TOKEN` held a token of `reh3376`, the workflow would open every pull request as `reh3376`, and the owner would be the author again. After the secret is set, check the author of the next pull request (`gh api repos/OWNER/REPO/pulls/<n> --jq .user.login`). If it is the owner's login, stop and report.

What it needs from the owner: a second GitHub account, invited to the repository as a collaborator with write access (creating a pull request needs "write access to the head or the source branch", GitHub REST docs, "Create a pull request"); a token of that account; and `gh secret set MODEL_PR_TOKEN` (or Settings, "Secrets and variables", Actions, "New repository secret"). All of it is the owner's to do. The agent never creates the account, the token or the secret.

**A finding about the token type.** FB-047 and the workflow's comment name a *fine-grained* personal access token. GitHub lists, under "Fine-grained personal access tokens limitations": "Using fine-grained personal access token to contribute to repositories where the user is an outside or repository collaborator." forge is owned by a personal account, so a machine account can only be a repository collaborator on it. A fine-grained token of a machine account is therefore expected not to work for forge. This was not tried. The options:

| Option | Author on the pull request | `pull_request` workflows | Needs from the owner | Notes |
|---|---|---|---|---|
| `GITHUB_TOKEN` (today) | `github-actions[bot]` | approval-required, no jobs (FB-175) | the Actions setting | Nothing else to manage. |
| Fine-grained token of a machine account (FB-047 as written) | the machine account | would run | account, collaborator access, token, secret | Listed by GitHub as a gap for repository collaborators; expected not to work here. |
| Classic token of a machine account | the machine account | run | account, collaborator access, classic token, secret | `public_repo` "Limits access to public repositories" with read and write to code; `repo` is broader. A classic token is not limited to one repository: it reaches every repository the machine account can. Whether `public_repo` alone suffices to open a pull request was not verified. |
| GitHub App installation token | the app's bot identity | run | create an app, install it on this repository only, store its client ID as an Actions variable and its private key as a secret, and add a token step to the workflow (`actions/create-github-app-token@v3`, inputs `client-id` and `private-key`) | No second account. The exact login the app's pull requests show was not verified. |

With any token other than `GITHUB_TOKEN`, forge's `ci.yml` would start its `pull_request` run for the pull request without approval, and the job-level `if` would skip every job in it. That is inferred from the `if`, not observed.

## 6. Signing

### 6.1 "The pull request is signed": what it means here

The owner's requirement is that the agent "must sign the pr": the pull request carries an identity that is not the owner's, so the owner can approve it. In this flow that is:

- the author is the bot identity (`github-actions[bot]` today, or a machine account or app under section 5), never `reh3376`;
- the body's first line says who did what, for example `**Opened by:** Claude Opus 5.5 · **pushed by:** @reh3376 · **PR identity:** github-actions[bot] (…)`;
- the label `model:<slug>` names the model.

The model's name comes from the `Co-Authored-By:` trailer, so every commit carries one. Without it the pull request says `unknown model`.

### 6.2 Signed commits: what is and is not required today

Signing a commit is a different thing: a cryptographic signature on the commit, shown as "Verified" on GitHub.

| Item | State on 2026-11-24 | How it was read |
|---|---|---|
| `main` requires signed commits | **No** (`required_signatures.enabled: false`) | `gh api repos/reh3376/forge/branches/main/protection/required_signatures` |
| A ruleset requiring signatures | **No.** The one ruleset, `forge-rulz`, is disabled and has no signature rule | `gh api repos/reh3376/forge/rulesets/15087594` |
| Commits pushed to `reh3376_dev01` | Unsigned (`verified: false`, `reason: "unsigned"` on `044b9be3`) | `gh api repos/reh3376/forge/commits/<sha> --jq .commit.verification` |
| Merge commits made with the merge button | Verified, committer `web-flow` (`21ef3a78`) | the same call |
| Local signing configuration in the repository | `commit.gpgsign` and `gpg.format` not set | `git config --get commit.gpgsign` |
| Sign-off on web commits | Not required (`web_commit_signoff_required: false`) | `gh api repos/reh3376/forge --jq .web_commit_signoff_required` |

Nothing requires a signature today. An unsigned commit is not a fault in forge.

### 6.3 Setting up signed commits (NOT IN FORCE; the owner's decision)

If the owner wants signed commits, this is the order. The agent proposes it; the owner creates the key, adds it to the account and turns the rule on.

1. **A key.** An SSH key (or a GPG key) on the machine the agent commits from.
2. **Add it to the GitHub account as a signing key.** Settings, "SSH and GPG keys", "New SSH key", type "signing"; or `gh ssh-key add <key.pub> --type signing`. GitHub may ask the CLI for an additional scope; which one was not verified.
3. **Tell git to sign.** Without `--global` the setting applies to this repository only:

   ```bash
   git config gpg.format ssh
   git config user.signingkey <path to the public key>
   git config commit.gpgsign true
   ```

   GitHub Docs ("Telling Git about your signing key") give the same commands with `--global`. A single commit can be signed with `git commit -S -m "..."`.
4. **Match the email to the account.** For GPG keys GitHub checks that the committer email "is a verified email address on the user's account" (GitHub Docs, "Using a verified email address in your GPG key"); the same expectation for SSH keys was not confirmed. First check which account GitHub attributes the commits to: `gh api repos/reh3376/forge/commits/<sha> --jq .committer.login`. The key goes on that account, or the commit email changes to a verified email of the account that holds the key.
5. **Prove it on one commit** before requiring anything: push one signed commit and read `gh api repos/reh3376/forge/commits/<sha> --jq .commit.verification`, which should show `verified: true`.
6. **Only then require it**: "Require signed commits" in the branch protection rule, or `gh api -X POST repos/reh3376/forge/branches/main/protection/required_signatures`. The consequences, from GitHub Docs ("About protected branches"):
   - "contributors and bots can only push commits that have been signed and verified to the branch";
   - "unsigned commits on the head branch can block a squash merge, even though GitHub would sign the final squash commit";
   - for rebase and merge, GitHub "can't sign" the rewritten commits; forge merges with merge commits, which GitHub signs (observed: `21ef3a78` is verified);
   - an unsigned commit already pushed has to be rewritten ("rebase the commit to include a verified signature"), which means a force-push to the development branch, the owner's decision.
7. The auto-PR workflow makes no commits, so signing changes nothing in it.

### 6.4 Sign-off is a third thing

A sign-off is a `Signed-off-by:` trailer added with `git commit --signoff`, affirming that the commit complies with the repository's rules or licence (such as a Developer Certificate of Origin). The repository setting "Require contributors to sign off on web-based commits" (Settings, "Commits") covers only commits made on github.com. It is off in forge, and nothing in forge asks for sign-offs.

## 7. What the agent must never do

| Never | Why |
|---|---|
| Open a pull request: `gh pr create`, `POST /repos/{owner}/{repo}/pulls`, a GraphQL mutation, the github.com button, a skill that opens one | It is authored by the owner (section 1). |
| Push to the branch while its pull request is open | `CLAUDE.md` A-8 step 6. The protection of `main` has `dismiss_stale_reviews: true`, so the push dismisses an approval. |
| Push to `main` directly | With `enforce_admins` off, the owner's credentials may bypass protection and put unreviewed code on `main`. |
| Merge (`gh pr merge`, above all `--admin`), enable auto-merge (`--auto`), approve (`gh pr review --approve`), or approve waiting workflow runs | With the owner's credentials an approval by the agent counts as the owner's code-owner review. Every one of these is the owner's act. |
| Comment on or review a pull request without the owner's word | It appears under the owner's name, in public. |
| Change a workflow, a repository setting, branch protection, a ruleset, a secret, a variable or Actions permissions without the owner's word | `CLAUDE.md`: the owner's word is needed for these. |
| Create a token, an account, an app or a signing key, or put any token of the owner's account into a secret | Section 5: the owner's token makes the owner the author again. |
| Close a pull request with `--delete-branch`, force-push, or rewrite pushed history | The branch is reused for every item. |

## 8. Checklists and troubleshooting

### For each push

Before the push:

- [ ] On the development branch: `git rev-parse --abbrev-ref HEAD` prints `reh3376_dev01`.
- [ ] No pull request is open for it: `gh api 'repos/reh3376/forge/pulls?state=open&head=reh3376:reh3376_dev01' --jq 'length'` prints `0`. If not, stop (section 7).
- [ ] Each new commit carries a `Co-Authored-By:` trailer naming the model.
- [ ] The checks of `CLAUDE.md` A-8 step 2 have run, and the owner has answered Gate 2.

The push: `git push origin reh3376_dev01`. Nothing else.

After the push:

- [ ] The auto-PR run succeeded: `gh run list --repo reh3376/forge --workflow auto-pr.yml --branch reh3376_dev01 --limit 1`.
- [ ] The pull request exists and its author is the bot: `gh api 'repos/reh3376/forge/pulls?state=open&head=reh3376:reh3376_dev01' --jq '.[] | {number, author: .user.login}'` shows `github-actions[bot]`.
- [ ] The CI push run is green: `gh run list --repo reh3376/forge --workflow ci.yml --branch reh3376_dev01 --event push --limit 1`, or `gh pr checks <n>`.
- [ ] Tell the owner the number and the link, then push nothing more until the owner says "pr N merged".

### Troubleshooting

| Symptom | How to verify | What to do |
|---|---|---|
| No pull request appeared | `gh run list --workflow auto-pr.yml --branch <branch> --limit 3`, then `gh run view <id> --log \| grep -E 'nothing to (do\|open)\|error'` | `An open PR already exists`: a pull request is open; check its author (section 1). `has no commits beyond main`: nothing new was pushed. A failed run: read the error; a refusal to create the pull request points to the Actions setting (section 3, check 5). No run at all: the push went to `main`, the workflow file is missing on the branch, or Actions are disabled. Report; change nothing. |
| The pull request shows the owner as author | `gh api repos/reh3376/forge/pulls/<n> --jq .user.login` prints `reh3376` | Section 1, "Recovering". If `MODEL_PR_TOKEN` is set, its token may be the owner's (section 5): report it. |
| Required checks did not run or stay pending | `gh run list --workflow ci.yml --branch <branch> --event push --limit 2`; `gh pr checks <n>` | The checks come from the push run, not from the pull request. A later push cancels an earlier CI run of the same branch (`ci.yml` lines 18 to 20). A failed check: report the cause to the owner. Do not push a fix while the pull request is open without the owner's word. |
| The pull request says the branch is out of date | `gh pr view <n> --json mergeStateStatus` shows `BEHIND` (REST: `gh api repos/reh3376/forge/pulls/<n> --jq .mergeable_state`) | `main` moved after the branch was cut (for example a change made on github.com). `strict: true` requires the branch to be up to date. Report it. The owner can update the branch from the pull request page, or tell the agent to merge `main` into the branch and push, which dismisses an existing approval. |
| A second CI run, event `pull_request`, with no jobs; `action_required`, later `failure` | `gh api 'repos/reh3376/forge/actions/runs?event=pull_request&per_page=5' --jq '.workflow_runs[] \| {id, conclusion, created_at, updated_at}'`; `gh api repos/reh3376/forge/actions/runs/<id>/jobs --jq .total_count` prints `0` | Expected (FB-175, section 2). It is the approval-required run that a pull request opened with `GITHUB_TOKEN` creates; it turns to `failure` when the pull request is merged. Do not approve it. It is not a required check. |
| `gh pr list` or `gh pr view` fails with HTTP 503 | the error names `api.github.com/graphql` | Use the REST forms in this guide (`gh api repos/...`). |
| The pull request is `BLOCKED` | `gh pr view <n> --json mergeStateStatus,reviewDecision` | Normal until the owner approves and the required checks pass. Nothing to do. |

## 9. What was verified and where

Checked on 2026-11-24 with `gh` 2.88.1, against the forge repository and GitHub's documentation.

| Item | Where it was verified |
|---|---|
| The workflow: trigger, permissions, concurrency, token line, the open-PR and ancestor checks, model trailer, label, reviewer, fallback | `.github/workflows/auto-pr.yml` lines 1 to 78; the copy in 4.2 is the file at commit `2a2c2f6e`, compared byte for byte |
| CI runs on `push` and on `pull_request`; the job-level `if`; the header comment; CI concurrency | `.github/workflows/ci.yml` lines 1 to 20, 25, 55, 96, 157 |
| Code owners | `.github/CODEOWNERS` lines 2 and 5 to 7 |
| Push to `reh3376_dev01`; the workflow opens the PR; never open a PR as the owner; "pr N merged"; never push while the PR is open | `CLAUDE.md` lines 58 to 60 |
| FB-047 (identity, `MODEL_PR_TOKEN`, `action_required`) and FB-175 (the second run) | `BACKLOG.md` lines 70 and 127; no closed auto-PR entry in `BACKLOG-DONE.md` |
| Workflow permissions `read`, Actions may approve/create PRs `true` | `gh api repos/reh3376/forge/actions/permissions/workflow` |
| Actions enabled, selected actions, GitHub-owned allowed, two third-party patterns | `gh api repos/reh3376/forge/actions/permissions` and `.../selected-actions` |
| Branch protection of `main` (every field in section 3) and required signatures `false` | `gh api repos/reh3376/forge/branches/main/protection` and `.../protection/required_signatures` |
| One ruleset `forge-rulz`, disabled; no active rules on `main` | `gh api repos/reh3376/forge/rulesets`, `.../rulesets/15087594`, `.../rules/branches/main` |
| No Actions secrets (`MODEL_PR_TOKEN` not set) | `gh api repos/reh3376/forge/actions/secrets` |
| Repository: public; merge, squash and rebase allowed; auto-merge off; web commit sign-off off | `gh api repos/reh3376/forge` |
| Authors of PRs 176 to 182 (`github-actions[bot]`); PRs 7 and 159 authored and merged by the owner with no review; PR 181 label, reviewer request by the bot, approval by the owner | `gh pr list --state merged`, `gh api repos/reh3376/forge/pulls/<n>`, `.../pulls/<n>/reviews`, `.../issues/181/events`, `search/issues?q=repo:reh3376/forge+is:pr+author:reh3376` |
| The auto-PR run for PR 181 printed the PR URL; `PUSHER` was `reh3376`; the body's first line as quoted in 6.1 | `gh run view 45437568221 --log`; `gh api repos/reh3376/forge/pulls/181 --jq .body` |
| `mergeStateStatus` values `BEHIND` ("The head ref is out of date") and `BLOCKED` | GitHub GraphQL reference, "Pulls", enum `MergeStateStatus` |
| The jobless `pull_request` run: `action_required` while PR 182 was open, `failure` one second after its merge; earlier ones `failure` | `gh api repos/reh3376/forge/actions/runs/45442866006`, `.../runs?event=pull_request`, `.../runs/45437614858/jobs` |
| Commit `044b9be3` unsigned; merge commit `21ef3a78` verified, committer `web-flow`; no local signing configuration | `gh api repos/reh3376/forge/commits/<sha>`; `git log --format=%G?`; `git config --get` |
| The branch is fast-forwarded to `main` after a merge | `git log -1 --format=%p 2a2c2f6e` prints `21ef3a78` |
| `gh` flags: `pr close --comment/--delete-branch`, `run rerun`, `run list --workflow/--branch/--event`, `pr edit --body-file`, `pr merge --admin/--auto`, `pr review --approve`, `label create --force`, `pr create --label/--reviewer`, `ssh-key add --type signing`, `secret set`, `api -X/-f/-F` | `--help` of each command, `gh` 2.88.1 |
| Authors cannot approve their own PRs; stale approvals dismissed on push | GitHub Docs, "Approving a pull request with required reviews" |
| `GITHUB_TOKEN` events create no new runs; `pull_request` opened/synchronize/reopened runs are approval-required; PAT or App token as the alternative | GitHub Docs, "Triggering a workflow", section "Triggering a workflow from a workflow"; "GITHUB_TOKEN" concept page |
| The setting "Allow GitHub Actions to create and approve pull requests", its place and default; selected actions | GitHub Docs, "Managing GitHub Actions settings for a repository" |
| `GET`/`PUT /repos/{owner}/{repo}/actions/permissions/workflow`, its two fields, "Enabling this can be a security risk" | GitHub REST docs, "GitHub Actions permissions" |
| Branch protection options and their labels, the place in Settings, code-owner and last-push rules, strict checks, signed commits and merge methods, admin bypass | GitHub Docs, "About protected branches" and "Managing a branch protection rule" |
| `GET`/`POST`/`DELETE .../protection/required_signatures`; `GET .../protection/enforce_admins` | GitHub REST docs, "Protected branches" |
| `POST /repos/{owner}/{repo}/pulls` needs write access to the head branch; Pull requests (write) for it and for requested reviewers; label endpoints under Issues and Pull requests | GitHub REST docs, "Pulls" and "Permissions required for fine-grained personal access tokens" |
| Code owners auto-requested, any one owner's approval suffices, must have write access | GitHub Docs, "About code owners" |
| `branches-ignore`; unspecified permissions set to `none`; concurrency, one running and one waiting | GitHub Docs, "Workflow syntax" |
| `push` runs include workflows not yet on the default branch | GitHub Docs, "Events that trigger workflows" |
| Unset secret evaluates to an empty string; where to create a repository secret; `gh secret set` | GitHub Docs, "Using secrets in GitHub Actions" |
| Re-run uses the same `GITHUB_SHA`/`GITHUB_REF`; 30 days; the original actor's privileges | GitHub Docs, "Re-running workflows and jobs" |
| Fine-grained token limits (resource owner; the collaborator gap); where to create one | GitHub Docs, "Managing your personal access tokens" |
| `public_repo` and `repo` scopes | GitHub Docs, "Scopes for OAuth apps" |
| `actions/create-github-app-token@v3`, `client-id`, `private-key`, client ID as a variable | GitHub Docs, "Making authenticated API requests with a GitHub App in a GitHub Actions workflow" |
| Machine accounts | GitHub Terms of Service, B.3 |
| Signing: statuses, GitHub signs web commits, rebase-and-merge cannot be signed; git configuration; `git commit -S`; adding a signing key; the GPG email rule; sign-off policy | GitHub Docs, "About commit signature verification", "Telling Git about your signing key", "Signing commits", "Adding a new SSH key to your GitHub account", "Using a verified email address in your GPG key", "Managing the commit signoff policy for your repository" |

Not verified:

- That a fine-grained token of a machine account fails on forge: taken from GitHub's list of gaps, not tried. Whether the classic `public_repo` scope alone is enough to open a pull request.
- The login a GitHub App's pull requests show.
- That the API field `can_approve_pull_request_reviews` and the checkbox are one setting (inferred, section 4.4); the exact error the workflow prints when the setting is off.
- That the SSH signing key must match a verified committer email (documented for GPG only); which extra `gh` scope `gh ssh-key add --type signing` asks for.
- That the jobless `pull_request` run turns to `failure` because the pull request was merged: the timing on PRs 181 and 182 shows it, but GitHub's documentation does not say it.
- The request body of `PUT .../branches/{branch}/protection`: not reproduced. The value the REST field `mergeable_state` takes for an out-of-date branch.
- No setting, workflow, secret or pull request was changed to test any of this.
