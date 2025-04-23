---
name: git-commit
description: Use when user asks to commit current work, create smart/logical commit groups, organize staged/unstaged changes, or push current branch while preserving existing working-tree boundaries.
---

# Smart Commits (opencode)

Turn the current working tree into one or more coherent commits, then push when a valid upstream exists. This skill is for committing existing work, not for feature implementation.

## Core Rules

- Never edit product code/docs only to make commit flow easier.
- Never stash, reset, checkout-away, overwrite, or revert unrelated user changes.
- Respect scope boundaries from user request (path/topic/change-set exclusions).
- Stage exact files or hunks intentionally; avoid broad staging unless the whole tree was inspected and belongs to one commit.
- Prefer simple Conventional Commit subjects only. Use exactly one `-m` flag for the commit title. Do not add a commit body unless the user explicitly asks for one.
- Never use multiple `-m` flags, `-F`, commit templates, or an editor to create a body by default.
- Push only when destination is clearly configured and safe.

## Workflow

1. Inspect repository state:

    ```bash
    git status --short
    git branch --show-current
    git remote -v
    git rev-parse --abbrev-ref --symbolic-full-name "@{u}"
    git diff --stat
    git diff --cached --stat
    ```

2. Read representative diffs to understand intent across staged, unstaged, untracked, renamed, and deleted files.

3. Build commit groups by product intent (not file extension):
    - foundational/config first, then dependent behavior
    - source + directly coupled tests together
    - docs separate only when independently meaningful
    - generated files only if part of requested deliverable

4. Run the narrowest meaningful quality gates before committing code changes (project-native checks first).

5. Commit one group at a time:

    ```bash
    git add <specific-files-or-hunks>
    git commit -m "<type>(<scope>): <subject>"
    ```

    Keep the message as a single paragraph/title. Do not append a second `-m`.

6. After each commit, re-check:

    ```bash
    git status --short
    ```

7. Push:

    ```bash
    git push
    ```

    If upstream is missing but remote/branch are clearly correct:

    ```bash
    git push -u origin <branch>
    ```

## Grouping Guidance

Good:

1. `refactor(auth): extract token validation helper`
2. `feat(users): add email verification endpoint`
3. `test(users): cover email verification flow`

Bad:

1. `chore: update files`
2. `docs: update docs and app code`
3. `test: update tests` (for unrelated behaviors)

## opencode-specific Execution Notes

- Follow repo policy before commit/push: inspect `git status`, relevant `git diff`, and `git log --oneline -10` when needed.
- Do not amend/force-push/skip hooks unless user explicitly requests.
- If commit fails (hook/check), diagnose and fix only task-related root cause, then create a new valid commit.
- Use the active shell's syntax. In this environment the shell is usually bash, so keep dependent git commands in one `&&` chain when useful; do not use PowerShell assignment syntax unless the active shell is PowerShell.
- If repository has no remote/upstream, leave commits local and report that explicitly.

## Final Response Contract

Always report:

1. Commits created (hash + message)
2. Push result (success/skipped + reason)
3. Validation/checks run (or exact blocker)
4. Remaining uncommitted or explicitly out-of-scope files

If the tree is already clean, confirm no new commit was needed and reference latest relevant commit.
