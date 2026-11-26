---
name: git-workflow
description: Apply a safe, linear Git workflow when starting feature work, creating branches, committing changes, rebasing feature branches onto the main branch, fast-forwarding, pushing, and cleaning up local branches. Use when the user asks for Git workflow guidance, branch-based development, commit/rebase/merge/push operations, branch cleanup, or help publishing changes safely.
---

# Git Workflow

User instructions and existing authorization take precedence over this skill's workflow defaults, within host permissions and higher-priority instructions. If a skill rule causes a pause, permission request, unfinished work, or deviation, link the exact `SKILL.md`, quote the rule, and explain its relevance; distinguish a requirement from your interpretation.

Use this workflow to keep `main` linear and avoid overwriting remote work. Prefer explicit checks and fast-forward operations over implicit merges.

## Core Model

Select only the stages needed for the user's requested endpoint: branch creation, local commit, branch push, PR preparation, or landing and publication. Loading this skill does not authorize later stages. A branch-only request ends after creating the local branch at the requested starting state; a local-commit-only request ends after the focused commit. Preserve prior authorization without asking again.

For a full request to land and publish on `main`, the default workflow is:

1. Update local `main` from remote.
2. Create a feature branch from updated `main`.
3. Develop and commit on the feature branch.
4. Before publishing, update `main` from remote again.
5. Rebase the feature branch onto updated `main`.
6. Verify the result.
7. Move `main` forward with a fast-forward merge from the feature branch.
8. Push `main`.
9. Delete the local feature branch after the successful push.

Do not rebase `main` onto the feature branch. Rebase the feature branch onto `main`, then fast-forward `main` if the user wants changes landed directly on `main`.

The command examples assume the primary branch is `main` and the remote is `origin`. Discover both names from repository configuration before changing state; substitute the actual names without asking the user when they are unambiguous. If a later action needs authorization, first finish the authorized preparation so the user can review the concrete result.

## Starting Work

Inspect status and the requested starting state before creating a branch. For branch creation from the current checkout, create the branch there without updating or switching the base. Use the following sequence only when starting from the updated remote primary branch is appropriate for the authorized task:

```bash
git status --short --branch
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b <branch-name>
```

Use the repository's branch naming convention when one exists. If no convention exists, prefer a short descriptive branch name, such as `codex/<task-slug>`.

If the worktree is dirty, inspect ownership and overlap before switching. Continue safely in place or use an isolated worktree when that preserves the requested starting state; ask only if conflicting changes require a user choice. Do not stash, reset, or overwrite user changes without authorization.

## Committing Feature Work

Before staging, inspect the worktree:

```bash
git status --short
git diff --stat
```

Stage only files related to the task. Exclude generated artifacts, caches, secrets, local env files, and unrelated user changes unless the user explicitly wants them included.

```bash
git add <paths>
git diff --cached --stat
git commit -m "<concise imperative message>"
```

Prefer one focused commit per coherent task unless the user asks for a different commit structure.

## Rebasing Before Landing

After committing on the feature branch, update `main` again and rebase the feature branch onto it:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout <feature-branch>
git rebase main
```

If conflicts occur, resolve them intentionally, run relevant checks, then continue:

```bash
git status --short
git rebase --continue
```

Do not use `git rebase --abort`, `git reset --hard`, or destructive checkout commands unless the user explicitly approves or asks for that operation.

## Verifying Before Landing

After a successful rebase, run the checks that match the change:

```bash
git status --short --branch
git diff --stat main...HEAD
```

Run project tests, linters, build checks, or focused smoke checks when they are available and relevant. If verification fails, fix the problem on the feature branch, commit the fix, and rebase again if `main` moved meanwhile.

## Landing On Main

When the user wants the changes on `main`, use a fast-forward merge:

```bash
git checkout main
git merge --ff-only <feature-branch>
```

If fast-forward fails, do not create an automatic merge commit. Fetch/pull `main`, rebase the feature branch again, verify, then retry the fast-forward.

## Pushing

Before pushing:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Push `main` only after confirming it contains the intended commits:

```bash
git push origin main
```

If push is rejected because the remote advanced, fetch and inspect ancestry first. If local `main` can still fast-forward, update it and rebase the task branch as above. If local `main` already contains unpublished task commits and diverges from `origin/main`, preserve both tips and prepare a separate task branch from `origin/main`, replay only the task's commits, and verify. Publish that branch's `HEAD` to the primary branch only if direct publication is already authorized. Do not repeatedly try an impossible `pull --ff-only`, reset local `main`, or force-push it. Report any remaining local reconciliation separately. After one recovery attempt, pause further publication on another race or the same rejection and report the concrete state.

If the remote rejects direct pushes because `main` is protected, stop and report that a pull request or repository-specific review flow is required. Do not bypass branch protection.

## Cleaning Up Local Branches

After `main` has been pushed successfully and contains the feature branch commits, delete the local feature branch:

```bash
git branch -d <feature-branch>
```

Only delete the local feature branch after all of these are true:

- The feature branch was created for the current task.
- `main` was fast-forwarded to include the feature branch commits.
- `git push origin main` succeeded.
- The current branch is not the feature branch being deleted.

Use `git branch -d`, not `git branch -D`, so Git refuses deletion if the branch has not been merged. Do not delete remote branches unless the user explicitly requests remote branch cleanup.

## Safety Rules

- Use `git pull --ff-only` for `main`.
- Use `git merge --ff-only` to land feature branches onto `main`.
- Rebase feature branches, not `main`.
- Never force-push `main`.
- Delete only the current task's local feature branch when the authorized full landing workflow and the cleanup conditions above are satisfied.
- Never stage generated artifacts, secrets, caches, or unrelated changes unless explicitly requested.
- Do not rewrite, reset, or discard user changes without explicit approval.
- Report the requested endpoint, exact commit hashes, and pushed branch names when applicable. For publication, verify the remote target hash, local commit relationship, and final worktree status; distinguish successful publication from any remaining local reconciliation.
