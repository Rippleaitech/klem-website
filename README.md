# KLEM — klem.co.il

Clementina property management website. Shared code: https://github.com/Rippleaitech/klem-website

## Working together

Each person uses their own GitHub account and their own working copy. Repository access and a local Codex project must be set up separately on each computer. This repository is public as of 23 September 2026; write access is still required to share changes.

### First-time setup for Shai

1. Accept the owner's GitHub collaborator invitation.
2. Install Git and Codex, and sign in using your own accounts.
3. Clone `https://github.com/Rippleaitech/klem-website.git` into a folder on your computer and open that folder as a local project in Codex.
4. Ask Codex to read `AGENTS.md` and this guide, check the latest GitHub version, and summarize the project.

Alternatively, configure a Codex cloud environment connected to this repository. Cloud tasks use separate working environments; their changes still need to be reviewed and merged.

### Start each session

Ask Codex: **“Get the latest changes from GitHub, preserve any unfinished local work, and summarize what changed before we start.”**

### Finish and share

Ask Codex: **“Review my changes, update the project handoff notes, and upload this work on a branch with a pull request.”**

After review, merge the pull request into `main`. The other person can then get the latest `main`. An uploaded branch is available on GitHub but is not yet part of `main`.

Use separate branches for simultaneous work. If both people change the same content, reconcile the changes before merging. Never overwrite the other person's work or force-push the shared main branch.

Local saves do not automatically reach GitHub. Uploaded work remains available when your computer is off. Chats are separate; put lasting decisions and unfinished work in project files.

## Website files and preview

This is a static HTML, CSS, and JavaScript website. Pages include `index.html`, `about.html`, `services.html`, `accessibility.html`, and `privacy.html`. Shared styling and behavior live in `style.css` and `script.js`; media lives in `images/` and `videos/`.

For a local preview, run `python3 -m http.server 8000` from the project folder and open `http://localhost:8000`. Stop the server when finished.

## Publishing

The hosting provider and deployment process have not been verified during collaboration setup. Uploading code and publishing a website are separate operations, although a host can be configured to publish automatically after a merge. Confirm the actual deployment settings before merging changes intended only for review.

## Handoff notes

- 23 September 2026: Local `main` and GitHub `main` matched at `6c521bc` before collaboration documentation was added.
- Collaborator access for Shai and setup on his device remain pending.
- `WORKLOG.md` is a historical work log; its “next planned” and local-only hosting notes may be outdated. Check current files and hosting before relying on them.
