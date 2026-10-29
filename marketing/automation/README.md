# Klem social worker

This worker connects Klem's WhatsApp marketing controls to the connected Windsor
accounts. It has its own local database under `private/marketing/`, Klem-only
media storage and independent settings. ParkClean's account IDs are rejected.

## Before enabling

1. Verify Klem in Windsor's account inventory and complete an account-scoped read.
   Populate `accounts.json` with that exact connector ID/name, then use the same
   IDs for the bot's `KLEM_INSTAGRAM_ACCOUNT_ID` and `KLEM_FACEBOOK_PAGE_ID`.
   Both entries are intentionally unset until this check succeeds.
2. Put the existing Klem ingest key in `private/klem-marketing/connection.json`
   as `ingestKey`, mode 0600. Never copy ParkClean's credentials or commit keys.
3. Run `node scripts/klem-marketing-management.mjs enable` to sync the isolated
   `/internal/klem-management` API. Verify `status` and `scan` before running work.
   The server needs `KLEM_MANAGEMENT_ENABLED=1` and
   `KLEM_MANAGEMENT_REPLIES_ENABLED=1`; report invitation flags remain off.

## Execution

Use `scan`, then `prepare WORK_ID` and the returned current content revision.
Use `claim-generation SLOT` before creating an asset. Review the final Hebrew,
claims and image, save it with `save-draft`, and expose only the reviewed bytes
using `klem-instagram-media.mjs`. That CLI verifies the Klem Netlify site and the
hash-addressed public readback. `report WORK_ID` returns the exact draft to the
bot for approval. Do not describe planned or claimed work as finished content.

Immediately before publication, discover the current Windsor account and action
schema, read back the exact Klem identity/permissions, and bind a fresh evidence
file with `klem-instagram-agent.mjs bind FILE`. The evidence includes channel,
accountId, username, verifiedAt, canPublish and supported action IDs. Refresh the
server authorization, then `claim-publish SLOT FILE` returns the connector,
account and exact parameters. Execute only the confirmed content revision.
Record the provider outcome with `finish`; ambiguous outcomes are uncertain,
never blindly retried. Reconcile against native provider data before proceeding.
Facebook supports image posts via `facebook_organic/create_photo_post`;
Instagram image posts and stories use their discovered native actions. Video
requires separately verified provider readiness. Facebook stories/video and live
WhatsApp calls are unavailable.

The default mode requires review. Initial advertising caps are zero. The initial
Instagram draft calendar is Sunday/Tuesday/Thursday 09:00 plus a daily Story at
13:00, Israel time; it is a saved proposal calendar, not an active automation.
Managed Facebook image posts share the conservative daily/weekly feed limits.
No worker automation is created or resumed by these scripts. Execution requires
the Mac and Codex to be available. ParkClean's prior one-off publishing authority
and paused automations do not apply to Klem.

`library-sync` publishes only the content projection to the bot; credentials,
claims, local asset paths and generation instructions stay private. Stop, consent,
role checks, fresh authorization and exact draft approvals are enforced again by
the bot. No script sends unsolicited WhatsApp messages or submits templates.

## Validation

`node --test tests/*.test.cjs tests/*.test.mjs` and `node scripts/build.mjs` cover
website behavior and the worker. Social tests use synthetic accounts, mocked
provider calls and a temporary local ledger; they do not publish live posts.
