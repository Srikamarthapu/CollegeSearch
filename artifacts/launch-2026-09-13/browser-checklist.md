# Browser verification — September 13, 2026

Target: local production build at http://127.0.0.1:4173, CollegeSearch identity verified, connected to the dedicated hosted CollegeSearch database. Synthetic QA records only. A browser result here does not prove the deployed website works.

## Passed observations

- Fresh signed-out session exposes working browser-save controls. Fixed the SDK's no-session error being incorrectly treated as a verification failure.
- Notebook text, checklist and manual category survive navigation and reload. Export explicitly includes current-tab draft work without silently committing it.
- Two tabs: tab A kept its unsaved text when tab B saved different text; UI showed a conflict, disabled ordinary save, offered both copies, and explicit replacement succeeded.
- JSON backup includes research for colleges removed from the shortlist. Restore preview identified one existing notebook to keep and one new notebook to add; restore added one without overwriting the existing one or altering the shortlist.
- Optional GPA 3.7 / 4.0, unweighted and synthetic activities persisted locally. No GPA or activities appeared in the matching URL. Guest profile was absent from account scope.
- Student deadline task with a synthetic date survived reload and moved to completed. Unchecked source was labeled student-entered and not verified.
- Real synthetic account sign-in, explicit guest shortlist import, independently verified hosted save, and sign-out passed. Guest research/profile were not imported. Import deliberately removes confirmed guest college saves after transferring them to the account; the UI now explains this.
- Guest ASU research remained accessible on its college profile after the guest shortlist was imported and emptied.
- Account deletion review exposed consequences, required typed confirmation, disabled submission while blank, and allowed cancel. Actual deletion API and ownership tests passed separately; the final destructive browser click was not performed.
- 320px viewport: planner, applicant profile and account settings fit without document overflow. Long account-name header initially overflowed; compact avatar and wrapping account identity fixed it (document client and scroll width both 305 px excluding the scrollbar).
- Mobile menu opened, Escape closed it and returned focus to Open navigation; navigation selected a destination and closed the menu.

## Findings fixed during final browser pass

- Long signed-in account labels overflowed the 320px header; fixed and retested.
- Backup and saved collection siblings reused the account scope as the same React key, which duplicated backup controls on identity transition. Assigned distinct sibling keys; final rebuilt sign-in transition shows exactly one backup region and confirmed account saves. Sign-out also passed.

## Explicitly unexercised / remaining

- Actual email confirmation and recovery delivery require custom SMTP. Google is hidden while disabled.
- School Wi-Fi/devices, additional browser engines, enlarged text and full reduced-motion matrix. Hosted Worker and core account flows are covered by the later private-hosted verification below.
- Full browser planner restore, applicant brief/clear, expired-session and concurrent account-write matrix; automated tests cover their bounded logic, not those complete browser journeys.
- Do not claim WCAG conformance or large-scale readiness from these observations.

Screenshots in `browser/` are supporting captures. `planner-desktop.png` predates its width fix and is retained as historical evidence, not the final layout.

## Private hosted verification

On https://college-compass-students.kamarthapusri.chatgpt.site, version 2: CollegeSearch identity, existing synthetic account sign-in, account shortlist reload and sign-out passed. The freshly opened hosted tab reported no browser console warnings/errors across these flows. The exact hosted HTTP deletion/isolation matrix passed 6/6 and cleaned its test accounts. The synthetic browser QA account was removed separately after sign-out. The private access check returned 401 without app content.

Desktop home at a measured 1265px content width had equal document and scroll width. Carousel controls selected UCLA with matching photo/credit and autoplay subsequently advanced to another campus. `home-desktop.png` records the current layout.

Final version 3 passed all 15 hosted smoke checks after the optional image-service correction and after the rollback exercise. External image URLs and invalid widths were rejected. The final Worker log review found zero error-level events after the last deployment; the deliberately invalid image probes completed normally. `deployment.json`, `rollback-exercise.json`, and `runtime-log-review.json` preserve the limits and exact release identity.
