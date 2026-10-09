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

This is a static HTML, CSS, and JavaScript website. Pages include `index.html`, `about.html`, `services.html`, `faq.html`, `accessibility.html`, and `privacy.html`. The managed-building pages are `project-hadar.html`, `project-ariel-sharon.html`, and `project-aloni-borochov.html`. Shared styling and behavior live in `style.css` and `script.js`; media lives in `images/` and `videos/`.

For a local preview, run `python3 -m http.server 8000` from the project folder and open `http://localhost:8000`. Stop the server when finished.

## Publishing

Verified 8 October 2026: klem.co.il is served by Netlify project `effervescent-bombolone-7970a6`. Its deployment history links production to `Rippleaitech/klem-website` main (published `aed7c31` before this update), and pull requests receive deploy previews. Merging to main is the production publishing path; verify the resulting deployment and live content after each merge.

## Handoff notes

### OpenAI Ads and GA4 — 10 October 2026

- The two websites run in parallel. Preserve the older domain, website, GA4 property `558024694`, and its stream `16069287956` / `G-LJTD1YVE8K`; do not redirect or migrate it.
- Created a separate property `Klementina | klem.co.il | GA4` (`558318396`) in account `KLEM` (`411260682`), accessed through `info@klemantina-group.co.il`. Reporting time zone is Israel and currency ILS. The new web stream is `16098594561`, measurement ID `G-4JVRVNQNTD`.
- Added `analytics.js` to all nine pages. It initializes the new tag only on `klem.co.il` or `www.klem.co.il`, excluding local development and Netlify previews. Google Signals and ad personalization are disabled in this tag configuration. Added a factual Google Analytics disclosure to the privacy page.
- OpenAI Ads Manager has no verified native GA4 connection. Saved campaign tracking parameters: `utm_source=openai&utm_medium=cpc&utm_campaign=klementina_building_management&utm_id={campaign_id}&utm_content={ad_id}&utm_source_platform=openai`. Removed the ad URL's old `klementina_test` UTM values; destination remains `https://klem.co.il/services`. The ad-group and ad-level tracking fields are empty, so campaign settings apply.
- This measures website visits and interactions in GA4. UTMs do not import OpenAI spend or send conversions back to Ads Manager. No OpenAI measurement pixel or Conversions API was installed. No contact-form event was marked as a GA4 key event.
- Saved the `OpenAI Ads – Clementina` detailed report (`16098616801`) in the new property. Its session source/medium filter is `^openai / cpc$`, with session campaign as the default dimension; it includes sessions, engagement, and key-event metrics. Report URL: https://analytics.google.com/analytics/web/?authuser=4#/a411260682p558318396/reports/explorer?r=16098616801
- The user explicitly approved uploading and merging the GA4 tag and privacy-notice change on 10 October 2026. Publish through a reviewed pull request; confirm production deployment and received GA4 events afterward.
- Validate production delivery and GA4 Realtime after deployment. Use a distinct `klementina_tracking_validation` campaign for test visits so they can be separated from actual ad traffic.

### Search content update — 10 October 2026

- Prepared on `codex/search-content`. Added three static project pages using existing descriptions and photo assignments. The homepage cards retain their design and now link to those pages. Project photo galleries retain image enlargement, keyboard dismissal, and focus restoration; ordinary image links also work without JavaScript.
- Added eight Hebrew FAQ answers covering services, coverage, price factors, switching providers, payments, maintenance requests, emergencies, and contact. Pricing and switching text is general preparation guidance; no prices, contract terms, response-time guarantees, reviews, or new project claims were added.
- Kept the current palette, typeface, spacing, header, navigation, and accessibility controls. The homepage service line is now inside the H1 while retaining the existing visual hierarchy. Added FAQ links, page metadata, business structured data, and all four new pages to the sitemap.
- Current-site business details are consistent. Use the following confirmed details when updating external profiles: business name `קלמנטינה — ניהול ואחזקה` / `KLEMENTINA`; website `https://klem.co.il/`; address `גולומב 40, גבעתיים`; phone `03-9153556`; email `info@klemantina-group.co.il`; WhatsApp `058-7222680`; service area Central Israel and Shfela. The WhatsApp number is intentionally different from the office phone. Describe 24/7 availability as emergency-only, not regular office opening hours.
- Google Business Profile updates are explicitly deferred by the user as of 10 October 2026; leave that profile unchanged. Old-site Wix changes remain pending account access. When that work resumes, replace the old site's outdated address with Golomb 40, Givatayim, and align the business name, current website link, phone, and service-area wording. Do not invent street-level project addresses, precise service boundaries, or opening hours. A full old-domain redirect requires a separately confirmed migration plan.
- Google Search Console setup is explicitly deferred by the user. Google Analytics remains unconnected pending account sign-in or a measurement ID. No placeholder tracking ID was installed.
- Validation: all nine pages parsed with one H1, valid JSON-LD, unique IDs, balanced HTML, and existing local links/assets/fragment targets; sitemap contains nine unique pages. JavaScript syntax and diff checks passed. Desktop and phone previews checked, including project navigation, gallery enlargement/Escape/focus restoration, FAQ, and the menu. The user authorized publication on 10 October 2026. Publish through a reviewed pull request to main and verify the resulting Netlify deployment and live pages.

- 23 September 2026: Local `main` and GitHub `main` matched at `6c521bc` before collaboration documentation was added.
- Collaborator access for Shai and setup on his device remain pending.
- `WORKLOG.md` is a historical work log; its “next planned” and local-only hosting notes may be outdated. Check current files and hosting before relying on them.

- 8 October 2026: Prepared service-area content on `codex/klem-service-area-content`, based on fetched `origin/main` at `aed7c31`. The previous collaboration branch remains intact (one documentation commit separate from main).
- Source: https://www.klemantina-group.co.il/ (read 8 October 2026; user confirmed ownership and requested copying its business information). Added Central Israel/Shfela coverage to homepage, About, Services, metadata, and Organization structured data; added committee management and supplier supervision, plus a sameAs link to the owned older site.
- Preserved current contact details and emergency-only 24/7 wording. The user confirmed Golomb 40, Givatayim as the current address on 8 October 2026. The homepage, Organization structured data, privacy page, and accessibility page already use that address. The older site’s Jabotinsky 1 address is outdated; external listings and the older website still need reconciliation. Apartment rental management and gate-opening app capabilities from the older site were not added because the current site's scope is narrower.
- No specific city coverage, pricing, testimonials, or results were invented. Old-domain redirects and Google Business Profile/Search Console changes remain pending; these require hosting/account access and confirmed migration details. The user authorized publication on 8 October 2026; deliver these changes through a reviewed pull request and verify production after merging.
- Validation: reviewed the complete HTML diff; `git diff --check` passed; parsed updated HTML and JSON-LD, checked unique IDs and one H1 per page, verified regional coverage and retained contact form/address. Browser layout and live deployment have not been verified. Existing untracked macOS `.DS_Store` files were left untouched.

- Pre-publication check (8 October 2026): fetched origin; task branch base matches current main. Only the three content pages and this README are intended for publication. Existing `.DS_Store` files are excluded.
