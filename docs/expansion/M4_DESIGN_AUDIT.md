# M4 rendered design and release audit

Scope: students explore the 100-college collection, inspect evidence, compare options, use Find my fit, and keep saved colleges/deadlines together. Preserve the existing blue campus-pin brand and compact navigation. The adviser remains unavailable for new answers until provider evaluation and production authorization are complete.

## Finding ledger

| ID | Evidence / step | Finding | Disposition |
| --- | --- | --- | --- |
| D01 | Step 1, `outputs/m4-audit/01-adviser-default.jpg` | The adviser heading and fit-tool navigation touch the viewport edge; `page-shell` supplies height but no content gutters. | Add a bounded shared navigation container and responsive page gutters; rendered retest pending. |
| D02 | Step 1, same screenshot | Unavailable state clearly says “In preparation” and offers working preference/search/compare/planner paths. | Keep the honest state; do not imply model evaluation has happened. |
| D03–D06 | Static integration review, `M3_REVIEW.md` | Provider-off history access, refresh-error classification, draft preservation on deletion, and Strict Mode request lifetime. | Assigned for implementation and focused retest before release. |

## Current-run walkthrough

1. Opened the native Next preview at `/adviser` in the in-app browser and inspected the screenshot above. Status and alternatives are clear; mobile gutters require correction.

## Limits

This report records observed rendered states separately from SQL and unit-test evidence. A local screenshot does not establish live Auth delivery, provider quality, or public-launch readiness. Provider calls remain disabled and no model call has been made.

## Adviser fixture verification

The ignored `work/adviser-ui-fixture` imports the real workspace, logo, save button and styles. Only account, fetch, and saved-list providers are replaced with in-memory synthetic fixtures. Its yellow QA banner clearly distinguishes it from the native app. This is UI evidence, not a live model or Auth test.

2. Desktop 1280px: inspected the conversation hierarchy and rendered source-bound cards (`03-adviser-answer-desktop.jpg`, `07-adviser-final-desktop.jpg`). Consent blocked sending until checked. Source years/populations remain attached, profile/compare links use the correct IDs, and the save button changed to Saved.
3. Mobile 390px: inspected recommendation wrapping and cost labels (`04-adviser-answer-390.jpg`). History took too much space above the conversation; added a collapsed mobile disclosure with an accessible toggle. Desktop history remains visible.
4. Narrow 320px: provider failure preserved the editable draft and retry button (`05-adviser-failure-320.jpg`). Document width did not exceed the viewport. Exhausted allowance disabled sending while leaving the draft editable and free tools linked.
5. A successful synthetic reply followed by a history-fetch failure kept the answer visible and reported “Your reply was saved” separately, with a working retry control.
6. Provider-disabled state exposed private history and deletion controls without a Send button. The history could be selected; account-bound data remains protected by the independent SQL/API checks.
7. The deletion dialog fitted the 320px viewport and focused Keep history (`06-delete-dialog-320.jpg`). Deleting only disposable in-memory fixture history removed the transcript and retained the unsent draft. Switching the synthetic account cleared that draft.

D01 corrected in CSS; native-app retest still pending the final build. D03–D06 fixed and reviewed in `M3_REVIEW.md`. The mobile disclosure was added from rendered evidence. The original unstyled fixture screenshot `02-adviser-fixture-desktop.jpg` predates the blue theme/font imports and is not accepted design evidence. Native production checks and final screenshots follow below.

8. Native Next build, desktop: D01 gutters are fixed (`08-native-adviser-desktop.jpg`). The newly added guest history sign-in was rendered as a large nested card and competed with the primary preference action. Replaced it with a quiet, separated history sign-in link; recheck after the deployment build. This keeps previously saved history accessible without adding another prominent call to action.

9. Native explorer: the location filter mixed full state names with newly introduced abbreviations (DC, FL, IA, ID, KS, LA, ME, MN, MO, RI, TN, UT). Completed the shared state-name map so both visible filters and typed state-name searches cover the expanded catalog. Skeleton loading remains clean and the explorer still has only five primary navigation items.

10. Native explorer → comparison → My colleges: found Appalachian State through search, saved it locally, compared it with Boise State, and opened the combined planner. Both new catalog entries show source periods and honest monogram fallbacks. At 390px, the comparison uses readable stacked college summaries, the five-item mobile navigation opens correctly, and the saved college appears beside the Deadlines section (`11-comparison-desktop.jpg`, `12-comparison-390.jpg`, `13-planner-390.jpg`). No horizontal overflow observed. The explorer screenshot `09-explore-desktop.jpg` captures the real skeleton state; `10-explore-loaded-desktop.jpg` captures the requested crossfade mid-transition.
