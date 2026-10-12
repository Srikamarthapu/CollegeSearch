# M3 adviser integration review

Reviewed 2026-10-04 by static inspection of the adviser workspace, API, service, engine, retrieval code, and the adviser database policy/functions. This was not a rendered-browser or live Supabase review. No NVIDIA calls were made, and no production-serving permission or model quality is claimed.

## Findings and disposition

1. **Resolved — The disabled state hid existing history and its delete controls.** [AdviserWorkspace.tsx](../../app/adviser/AdviserWorkspace.tsx) now checks the authenticated account before selecting the disabled state. A verified user sees private history and delete controls with new conversations and sending disabled; a signed-out user can sign in to reach any saved history.

2. **Resolved — A history refresh failure could look like a failed send after the answer was saved.** A successful POST now completes the send flow and refreshes the conversation list independently. Refresh errors appear in the history area with copy that makes clear the reply was saved. Deletion refresh errors are reported separately too.

3. **Resolved — Deleting the active conversation silently cleared its unsent draft.** Deleting the current conversation now preserves the composer draft, clears only the stale conversation/request identity, and explains that the draft will start a new conversation if sent later.

4. **Resolved — The initialization guard could be re-enabled while an older effect request was still settling.** History requests now capture an effect generation. Cleanup increments the generation and aborts pending requests, so an earlier Strict Mode effect cannot update state or surface its abort error after the next effect starts.

5. **Resolved — Mobile history consumed too much vertical space and its collapsed state lacked a clear indicator.** The history sidebar now has an accessible mobile toggle (`historySummary`, `historyContent`, `historyHeading`) with `aria-expanded`, `aria-controls`, and a `ChevronDown` icon. It starts closed; responsive CSS owns the mobile collapse and desktop expansion. New conversation, send, open, and delete actions are guarded while the relevant history/send operation is busy.

## Verified boundaries

- The client requires a signed-in, verified, non-anonymous user, keys the session component by user ID, captures a Supabase session matching that expected ID, and aborts outstanding fetches at cleanup. The server validates the bearer token with Supabase, checks its signed subject and session ID, and checks the active session again in RLS and the reserve/commit database functions. User IDs are never accepted from the POST body.
- Provider/commit errors leave the composer draft in place. The request ID is reused for the same text and conversation, while the server hashes that body, rejects changed-body reuse, and returns a completed response without another inference. The server responses suppress provider diagnostics and set `Cache-Control: no-store`.
- The engine sends a minimized current message and structured prior preferences, not account fields, profile data, saved notes, or raw history. It validates the interpretation and ranking against fixed contracts; the model can select retrieved IDs but cannot author the displayed facts or citations. Retrieval checks database facts and passages against the local reviewed release before rendering.
- Source code has a fail-closed public gate: `NVIDIA_MODE=production`, `NVIDIA_PRODUCTION_AUTHORIZED=true`, `ADVISER_EVALUATION_PASSED=true`, a server key, storage/configuration, and bounded quotas must all be present. The environment flags are explicit owner-set gates; they do not independently prove NVIDIA's production permission or a successful human-reviewed evaluation. Keep public availability off until those are separately verified. The current provider/key status and evaluation boundary are recorded in [M3_PROVIDER.md](./M3_PROVIDER.md).
- Static accessibility review found labels and consent association, alert semantics for errors, a modal confirmation, focus movement to a completed answer, and an announced mobile history disclosure state. Visual layout, keyboard behavior, and screen-reader output remain subject to the parent task's rendered-browser QA.

## Checks

`node --test tests/adviser-*.test.ts` passed 33/33 after the workspace changes. `npm run typecheck`, `npx eslint app/adviser/AdviserWorkspace.tsx`, `node --check scripts/evaluate-nvidia-adviser.mjs`, and `npx eslint scripts/evaluate-nvidia-adviser.mjs` passed. The evaluator's default dry run reported three candidates and 24 synthetic cases with `liveProviderCalls: 0`; model cases remain unmeasured pending a key and explicit evaluation. No React DOM test runner is configured in the repository; responsive browser QA is handled by the parent task. These checks do not exercise the live Supabase deployment, browser account switching, NVIDIA endpoints, or production licensing.
