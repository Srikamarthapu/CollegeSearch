# CollegeSearch planner, profile and navigation audit

September 13, 2026. This follows the private release review. The school-launch goal remains open; this report does not replace the acceptance ledger in `docs/launch/readiness.md`.

## Observed baseline

1. **Mobile navigation — failed at 568 × 320.** The fixed dialog started at y=66 and ended at y=558. Its 490px client and scroll heights were equal, scrollTop remained 0 after scrolling, and body scrolling was locked. The last navigation links could not be reached in the viewport. Screenshot `01-mobile-menu-before.png` was opened and inspected.
2. **Planner form exit — failed keyboard focus.** Open Add a task, activate Discard form with Enter. The form closed and `document.activeElement.tagName` was BODY. Screenshot `02-planner-focus-before.png` was opened and inspected.
3. **Profile confirmation — failed keyboard focus.** Open the applicant profile, activate Clear profile, then Keep profile. Both replacements left focus on BODY. The final clear action was not activated. Screenshot `03-profile-confirmation-before.png` was opened and inspected.

The baseline screenshots came from the private hosted application at source 52c8b25618120d979aeb8785663054457dd7a11e. These observations were recorded before applying the current fixes.

## Changes under verification

- Cap mobile navigation to the available viewport and allow internal scrolling.
- Give planner save, discard, complete, uncomplete, remove review/cancel, validation errors and backup review clear focus destinations. Fall back to the tracker heading if a requested destination is unavailable, including a full 100-task tracker. Storage changes do not move focus; delayed persistence preserves focus if the user has moved elsewhere.
- Include college, task and date in the accessible names of repeated task controls.
- Make the long backup preview a named, focusable scroll region; keep the list semantics inside it.
- Move profile confirmation focus to Keep profile and back to Clear profile. Delayed clearing does not take focus from another control.
- Announce the selected campus on manual navigation and clear that announcement on resumed playback. Automatic slide changes remain silent.
- Describe an edited task as updated rather than added.

## Verification boundaries

Final browser results and screenshots are appended below after execution. Existing regression coverage validates storage and account ownership; this patch does not change database, authentication, network or source-data behavior. No destructive browser account/profile action, screen-reader audio test, actual school-device rehearsal or large-scale capacity test is claimed.

## Executed results

All screenshots named below were opened and visually inspected after capture. Local verification used the production build on 127.0.0.1:4173.

| Step | Result | Evidence |
|---|---|---|
| 1. Navigate on a short mobile screen | Passed at 568 × 320. Dialog top 66, bottom 308; client height 240, content height 490. Wheel scrolling reached scrollTop 250 and My deadlines was visible. Selecting the current page restored focus to Open navigation. | `04-mobile-menu-after.png` |
| 2. Leave or correct a planner form | Invalid submit focused the error summary. Discard focused Add a task. Updating the existing task focused its Edit button and announced “Task updated”. | Browser DOM/AX observations |
| 3. Complete/reopen/review removal | Completion focused the Completed tasks summary. Reopening focused the moved task checkbox. Removal review focused Keep task; cancelling returned to Remove. No final destructive remove click was exercised. | `05-planner-completion-focus.png` |
| 4. Review and restore backups | Downloaded the original one-task JSON and inspected its actual contents. Loaded a valid 100-task synthetic fixture. Review heading received focus; PageDown moved the focused 280px preview to scrollTop 260 (2280px content height). Restore returned focus to Restore backup. Restored the original backup afterward and verified one completed task remained after reload. | `06-backup-keyboard-preview.png`, `planner-original-backup.json`, `planner-100-fixture.json` |
| 5. Edit a full tracker | At 100 entries, Add a task was disabled. Edit → Discard focused the tracker heading rather than the disabled button. | `07-full-tracker-focus.png` |
| 6. Review profile clearing | Clear profile focused Keep profile after rendering. Keep profile returned focus to Clear profile. Existing sample GPA/activity notes remained. Final clear was not activated. | `08-profile-confirmation-after.png` |
| 7. Prepare a counselor brief | Actual downloaded text contains GPA 3.7, original 4.0 scale, Unweighted, synthetic activities, and uncertainty/privacy caveats. The focusable preview scrolled with PageDown. | `09-brief-preview.png`, `applicant-brief-download.txt` |
| 8. Reflow and carousel feedback | Expanded profile had clientWidth=scrollWidth=305 at a 320px viewport. Washington caption remained readable at 320px. Manual selection set the status to “Washington, 3 of 5”; Play cleared it. | `10-mobile-carousel.png` |
| 9. Runtime and release checks | Build, typecheck, lint and 306/306 regression tests passed after final source edits. No warning/error console entries were captured in the verification tab. | `build.log`, `typecheck.log`, `lint.log`, `tests.log` |

An intermediate scroll-cap-only fix still swallowed wheel input because Lenis intercepted nested scrolling. The final patch excludes the menu, deadline preview and profile brief from Lenis; the measured successful menu scroll above is from that correction. This is why a layout measurement alone was not accepted as a passing navigation test.

The download event helper timed out, but the actual JSON appeared in Downloads and its contents were inspected, copied to the evidence folder and successfully used in the app's restore flow. No claim depends on the helper's event result.

### Still unverified

- Actual 200% page/text zoom: the in-app browser's keyboard zoom shortcut did not change measured viewport or heading geometry. Narrow reflow is established; zoom is not.
- VoiceOver/screen-reader spoken announcements and additional browser/device coverage. DOM status and keyboard focus were inspected, not screen-reader audio.
- Reduced-motion behavior was inspected in the code (media query, disabled autoplay, suppressed transitions), but no new OS-preference run was performed.
- Final irreversible clear/remove actions and lock-delayed focus paths were reviewed in code; their full browser matrix remains.
- This work does not establish SMTP delivery, support/operator identity, operational alerts, database restoration or school-wide capacity.
