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

Verified 8 October 2026: klem.co.il is served by Netlify project `effervescent-bombolone-7970a6`. Its deployment history links production to `Rippleaitech/klem-website` main (published `aed7c31` before this update), and pull requests receive deploy previews. Merging to main is the production publishing path; verify the resulting deployment and live content after each merge.

## Handoff notes

- 23 September 2026: Local `main` and GitHub `main` matched at `6c521bc` before collaboration documentation was added.
- Collaborator access for Shai and setup on his device remain pending.
- `WORKLOG.md` is a historical work log; its “next planned” and local-only hosting notes may be outdated. Check current files and hosting before relying on them.

- 8 October 2026: Prepared service-area content on `codex/klem-service-area-content`, based on fetched `origin/main` at `aed7c31`. The previous collaboration branch remains intact (one documentation commit separate from main).
- Source: https://www.klemantina-group.co.il/ (read 8 October 2026; user confirmed ownership and requested copying its business information). Added Central Israel/Shfela coverage to homepage, About, Services, metadata, and Organization structured data; added committee management and supplier supervision, plus a sameAs link to the owned older site.
- Preserved current contact details and emergency-only 24/7 wording. The user confirmed Golomb 40, Givatayim as the current address on 8 October 2026. The homepage, Organization structured data, privacy page, and accessibility page already use that address. The older site’s Jabotinsky 1 address is outdated; external listings and the older website still need reconciliation. Apartment rental management and gate-opening app capabilities from the older site were not added because the current site's scope is narrower.
- No specific city coverage, pricing, testimonials, or results were invented. Old-domain redirects and Google Business Profile/Search Console changes remain pending; these require hosting/account access and confirmed migration details. The user authorized publication on 8 October 2026; deliver these changes through a reviewed pull request and verify production after merging.
- Validation: reviewed the complete HTML diff; `git diff --check` passed; parsed updated HTML and JSON-LD, checked unique IDs and one H1 per page, verified regional coverage and retained contact form/address. Browser layout and live deployment have not been verified. Existing untracked macOS `.DS_Store` files were left untouched.

- Pre-publication check (8 October 2026): fetched origin; task branch base matches current main. Only the three content pages and this README are intended for publication. Existing `.DS_Store` files are excluded.
