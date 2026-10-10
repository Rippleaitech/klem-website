# Klementina visitor studio

Custom session replay at `/visitors/`, with rrweb 2.1.7 as the recorder/player and private Netlify Blobs storage. No hosted session-replay provider receives these recordings. Netlify still processes hosting/network metadata; the app does not store IP addresses or form contents.

## Build and test

Use Node 22+ and the pinned pnpm version in package.json:

```
pnpm install --frozen-lockfile
node --test tests/*.test.cjs tests/*.test.mjs
node scripts/build.mjs
node scripts/dev.mjs
```

Local preview: `http://127.0.0.1:8888/?klem_replay_test=1&utm_source=qa&utm_medium=test&utm_campaign=replay_validation`. Local dashboard password: `local-preview-only`. The local server binds only to loopback, holds data in memory, and simulates form acceptance without sending an enquiry. Never deploy `scripts/dev.mjs`. Only `dist/` is published. The normal static Python preview does not provide recording APIs.

## First deployment

1. Run `node scripts/create-replay-access.mjs`. It creates a private file outside the repository with a generated password, salted scrypt password hash, and independent signing secret. Save the password in the owner's password manager.
2. Set `REPLAY_ADMIN_HASH` and `REPLAY_SECRET` in this Netlify project's environment settings, with Functions scope (or all scopes when individual scopes are unavailable). Prefer separate credentials for Production and Deploy Previews. Never put them in netlify.toml, GitHub, the client bundle, or a URL.
3. Publish through the normal reviewed PR to main. Netlify installs pinned dependencies, runs `node scripts/build.mjs`, serves `dist/`, and deploys five functions. Settings changes need a new deployment.
4. Verify `/api/replay/start` returns `enabled: true`, unauthenticated `/api/replay/admin` returns 401, the owner can sign in, and one labelled consented test visit appears with playback. Confirm Netlify's `replay-cleanup` is scheduled hourly.
5. Keep the test flag on the initial test URL. It persists for that tab. Production collection runs only on klem.co.il/www.klem.co.il. Previews require the explicit test flag and server-enforced test labels. Production and preview stores are isolated using trusted Netlify function context, not the requested hostname or client input.

Without valid private settings the dashboard fails closed and recording is not activated; the unified privacy banner remains available for analytics and advertising. `REPLAY_SECRET` rotation revokes all admin cookies and upload tokens; changing the password hash revokes future password logins but existing cookies last at most eight hours unless the secret is also rotated.

## Data and limits

- Hebrew opt-in prompt; decline does not create an identifier or session. Consent choice and anonymous browser ID last up to 30 days; anonymous session IDs are per browser tab, reused across page loads with a 30-minute inactivity check and a two-hour upload-token lifetime. No fingerprinting or personal identity lookup.
- Playback is separate per page, with a chronological page picker. Reloads count as additional page recordings. Fifteen-minute recording limit per page, 240 batches per page, 500 batches per session, 300 newly recorded sessions per UTC day, bounded bodies, and Netlify edge rate limits. These are practical safeguards, not a guaranteed hosting spend cap or bot detector.
- Same-origin API; HMAC-signed upload tokens; admin password checked with scrypt; signed HttpOnly/Secure/SameSite=Strict session cookie; all data APIs private and uncached; no public replay share links. The static login shell is public and contains no visitor data.
- Form inputs masked in the browser and again at ingestion. Contenteditable/private areas and status messages masked. Iframes, video and canvas are blocked; the original hero video is not replayed. URL query strings/fragments, opaque ad click IDs, raw referrer paths, plugin events and custom free-text events are dropped. Campaign labels allow only limited characters; do not put personal information in campaign names.
- `replay-session` is a hidden Netlify form field. With consent, it connects a saved enquiry to the visit ID shown in the dashboard. The form's personal fields remain in Netlify Forms; they are not copied into replay storage. `lead_submitted` is the browser's report of the existing successful form response, not an independently reconciled server-side lead or proof of a genuine customer.
- Numbered immutable batches make retries idempotent; gaps are shown. Up to five network failures/eight queued batches stop capture. Unsaved activity can be lost during abrupt navigation, offline use, blocking, closing the browser, or withdrawal. We do not promise every visit, every click, or exact attention time.
- The dashboard date and times use Asia/Jerusalem. Test visits are hidden by default; non-test does not imply a verified human or potential customer. Source is recorded campaign/referrer attribution, not proof of ad delivery. Direct/unknown includes missing attribution.
- Recordings become unreadable at 30 days and are physically deleted by the hourly cleanup. Each run handles up to 100 expired/deleted visits per store; large backlogs or hosting outages may delay physical deletion. The production cleanup also purges the separate preview store. Check function logs if cleanup fails.
- Delete creates a tombstone immediately, rejecting in-flight upload tokens, then removes recording batches. Tombstones are cleaned by the next scheduled run. Already saved enquiry references in Netlify Forms have their own lifecycle.
- At most 200 visits/day and 1,000 batches/visit are returned by the dashboard, with an explicit partial-data warning. No cross-device visitor merging, cross-tab sequence stitching, heatmaps or AI interpretation in this first version.

## Verification performed

Automated tests cover existing lead tracking, authentication and cookie flags, invalid signatures/expiry, same-origin and consent gates, unavailable configuration, sensitive-input/URL sanitization, idempotent retries, multi-page storage, malformed/oversized uploads, deletion, expiry, Israel date boundaries and preview isolation. Local browser testing covers decline, opt-in, typing dummy fields, form success, multi-page navigation and playback under the production Content Security Policy. A mutation-array regression test protects visual updates during privacy sanitization. `scripts/check-local-replay.mjs` checks the resulting local recordings for the dummy sensitive values. Live hosting/storage verification must be completed after configuration; local memory tests do not validate Netlify Blobs by themselves.


## Unified privacy preferences (version 2)

`privacy-preferences.js` runs before `analytics.js` on each public page. All optional purposes default off. One Hebrew banner offers equally styled accept/reject actions and independent analytics, replay and advertising settings. Preferences expire after 30 days; old replay-only approvals are not migrated. The permanent privacy button permits withdrawal. Google is loaded only after analytics approval, and withdrawal disables Google, removes its first-party cookies and reloads to remove its automatic listeners. Advertising attribution storage and conversion beacons require advertising approval. Earlier actions are never queued for later consent. Preview hosts never send production Google/OpenAI events.

The preference receipt records version, timestamp and choices locally. Replay start requires a current version-2 receipt and stores its replay consent timestamp alongside session metadata. Retain this version of the banner and tests with the source history as process evidence. This is evidence of the website consent process, not an independently verified signature from a visitor. Storage-blocked browsers retain choices only until navigation.

The interface currently offers advertising measurement only, not remarketing audiences. New marketing purposes require an updated disclosure and appropriate new choice. Before production launch, review the controller's notice/contact details, provider processing agreements, overseas transfers, retention justification and rights-request process with counsel. These code changes do not establish legal compliance by themselves.
