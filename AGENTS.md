# KLEM collaboration instructions

- Read `README.md` for setup and handoff context. Treat `WORKLOG.md` as historical, not a verified statement of current deployment or unfinished work.
- At the beginning of an editing session, inspect the working tree, current branch, and remotes. Fetch shared updates when available and report whether the working branch is behind or diverged. If fetching fails, say so; do not claim the copy is current.
- Preserve uncommitted work. On a clean `main`, update with a fast-forward only. Do not automatically reset, discard, stash, switch away from unfinished work, or resolve ambiguous conflicting changes by overwriting them.
- For a new change, use a separate `codex/` branch based on up-to-date `main`. Continue an existing task branch when appropriate. Use separate working copies or worktrees for concurrent tasks.
- Before sharing, inspect the diff, perform checks appropriate to the change, and record lasting decisions, checks, and remaining work in the README handoff notes. Do not commit credentials, local environment files, or unrelated changes.
- When asked to share work, commit the intended files, push the task branch, and create a pull request if possible. Clearly distinguish local, pushed, and merged changes. Do not force-push shared history.
- Verify the hosting/deployment setup before publishing or merging changes that might trigger deployment. A local preview does not prove the live site has changed.
