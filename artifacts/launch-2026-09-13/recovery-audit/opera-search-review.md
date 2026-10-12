# Opera search input: bounded source review

**Conclusion:** no demonstrated application race or supported patch from this evidence. Keep the first `ASU` → `U` result as an unreproduced input anomaly. Parent reports that repeating the same select-all / typeText(`ASU`) succeeded, followed by successful save, comparison, and reload. Native input/selection timing remains a plausible explanation, not an established cause.

The reviewed `app/CollegeCompassApp.tsx` last changed at `f34ff97`, matching the code baseline identified for private v7. No checkout changes, builds, browser calls, or Sites calls were made in this review.

## Actual data paths

- The only search field is controlled by `state.query`: `CollegeCompassApp.tsx:645-649` reads the complete `event.target.value`, truncates only beyond 120 characters, and passes it to the parent. The parent synchronously dispatches the string (`:1253-1255`); the reducer stores it unchanged (`:137-138`). There is no debounce, asynchronous input setter, per-character accumulator, composition transform, or selection-range manipulation on this field.
- `useDeferredValue(state.query)` (`:762`) feeds result calculation. It does not control the input or write `state.query`, so result lag alone cannot explain a visible final input of `U`.
- Saving invokes the saved-list provider and updates status (`:1033-1035`). Comparison only updates the separate `selected` state (`:1048-1058`). Neither writes the query. The comparison tray is outside the search subtree, and the SearchBox is not keyed by query or comparison, so the source does not intentionally remount the field for this change.
- The URL write effect serializes the current full `state.query` and `selected` together (`:893-918`). It calls `window.history.replaceState`; it does not call router navigation or dispatch input state. A final `q=U` therefore agrees with the controlled query state and does not by itself show that URL synchronization caused the truncation.
- Search keyboard handling (`:597-624`) handles arrows, Enter, and Escape. It neither intercepts letters nor implements select-all. Choosing a major or Clear search can write an empty string, but no search handler extracts the final character.

## Possible URL feedback, with its missing trigger

The URL restore effect reads `q` and queues a hydrate dispatch in a microtask (`:795-891`, particularly `:878-882`). This is the source path that could overwrite an edited query with a captured URL value. It runs on mount, on a `popstate` event, or when `collegeIds` / `stateOptions` identities change. Those two dependencies are memoized from the `colleges` prop. Save, comparison, and query changes do not themselves change those dependencies; the home/explore pages supply module-level projected college data. There is no evidence that a remount, data-prop replacement, or popstate occurred during the failing input attempt.

The installed vinext history shim was also checked. `node_modules/vinext/dist/shims/navigation.js:1790-1805` wraps replaceState: app-owned history writes perform metadata cleanup; external writes commit URL snapshots and notify navigation listeners. Neither branch dispatches popstate. The search component does not subscribe to useSearchParams. The shim evidence does not establish a query-to-restore feedback loop for ordinary typing with comparison active.

Thus an overwrite from the queued hydration path is a conditional hypothesis that requires an additional observed trigger, not a confirmed defect explaining this report. No speculative URL synchronization or input-state patch is proposed.

## Narrow supporting computation

A read-only invocation of the existing pure search function against current data returned:

- `Caltech`: 1 match, 110404 (California Institute of Technology).
- `ASU`: 1 match, 104151 (Arizona State University Campus Immersion).
- `U`: 0 matches.

This confirms that the observed zero-results screen is consistent with the final one-character query. It does not reveal why the input became `U`, and it is not browser input evidence.

## What distinguishes the remaining explanations

If the symptom returns during ordinary user typing or paste, record the field value after each input operation, selection/caret state before typing, and whether a navigation/popstate/remount occurred. Compare with the same sequence without an active comparison. The important distinction is whether the browser delivered `A`, `AS`, `ASU` and the app later overwrote it, versus the native operation itself repeatedly replacing the selected value or only delivering `U`.

The successful repeat, save/compare, and reload already reported should remain the current successful browser evidence. Keep the initial anomaly in the QA notes without elevating either a framework race or automation timing into a verified diagnosis.
