# CollegeSearch redesign research

Research checked September 5, 2026. This memo informs implementation; its product recommendations are design judgments, not findings from a student usability study. The repository review covered `README.md`, `package.json`, the college data types, and the discovery interface source. Visual and interaction verification belongs in the separate browser audit.

## What “AI-slop design” means here

The useful definition is **interchangeable visual choices plus insufficient product judgment and verification**. The problem goes beyond whether a site uses a particular color or shape.

- InterfaceKit describes generated interfaces that look finished while their content, state coverage, behavior, and purpose remain unresolved. This is a contemporary practitioner's definition, not a formal standard. [InterfaceKit, updated June 27, 2026](https://blog.interfacekit.io/what-is-ai-slop-ui-design)
- In NN/G's evaluation of real design scenarios, broad prompts often produced generic visual styles and inappropriate priorities. More explicit context improved results, but polished prototypes still required validation and refinement. This supports designing around actual research tasks and inspecting real states, not judging the homepage screenshot alone. [NN/G, published October 24, 2025; reviewed August 19, 2026](https://www.nngroup.com/articles/ai-prototyping/)
- Contemporary “anti-slop” writing repeatedly identifies arbitrary purple/cyan gradients, glass effects, identical feature-card grids, hover bounce everywhere, and interchangeable copy as recognizable symptoms. These are useful diagnostics, not universal prohibitions: a card or gradient with a clear product role can be appropriate. [SmoothUI, June 24, 2026](https://smoothui.dev/blog/ai-design-slop), [UIscanner, July 4, 2026](https://uiscanner.com/blog/what-is-ai-slop-ui)

For CollegeSearch, the strongest antidote is a recognizable **student research desk**: readable university identities, comparable facts, saved work, useful next steps, and sources where students need them. Avoid “unlock your future” copy, unsupported rankings, imagined personalized odds, ornamental dashboards, and feature promises that cannot be exercised.

## Direction for this product

1. **Make searching the opening task.** Keep the introduction short enough for real colleges and filters to appear early. A large marketing hero that pushes the research tools away does not earn its space. Lead with what a student can do: find colleges, understand costs and fields, save a shortlist, compare.
2. **Use a coherent editorial system.** A warm paper surface, dark readable ink, one confident action color, modest corner radii, ruled sections, and a deliberate headline/body hierarchy fit a research product. Use the colleges' verified marks as identity. Apply accent color to selection and navigation rather than every container. This is a proposed direction, not a research-derived universal palette.
3. **Give results a consistent reading order.** College and location first; useful cost and admission context next; field evidence and actions after. Align repeated metrics so students can scan across schools. Do not turn every fact into its own nested card. Keep result counts, active filters, clear-all, sort, save, and compare behavior obvious.
4. **Reveal complexity progressively.** Put field, place, and cost in the primary filter area; keep more specialized constraints available. Show selected filters as removable controls. Empty results should explain what can be changed and offer a working recovery action.
5. **Make a shortlist useful between visits.** Saved colleges should support the next research step, not just render hearts. Local notes, a simple research checklist, and an export or print path would add real value without inventing new institutional facts. Keep browser-only and account-synced work clearly distinguished. A student should understand whether notes travel to another device.
6. **Treat explanations as part of the interface.** Average net price, published tuition, graduation rates, and earnings answer different questions. Preserve period labels and definitions near the values; keep the full source trail one step away. Do not let an attractive simplification imply a personalized cost estimate or current exact-major availability.
7. **Use motion as feedback.** Brief state transitions may clarify that a college was saved or added to comparison. Reading, scrolling, searching, and selecting should stay immediate. Essential text should not wait for typewriter effects, scroll reveals, or per-card stagger sequences.

## The previously discussed GitHub libraries

Public repository and licensing information was rechecked; these recommendations do not assume access to paid or private libraries.

| Library | Verified capability / licensing | Recommendation for this app |
| --- | --- | --- |
| [Lenis](https://github.com/darkroomengineering/lenis) | Smooth scrolling with React support; MIT. Its documentation explains native scrolling behavior, nested-scroll handling, and configuration tradeoffs. [License](https://raw.githubusercontent.com/darkroomengineering/lenis/main/LICENSE) | Already installed (`1.3.25`). Retain only a restrained, reduced-motion-aware integration. Preserve native touch interaction, modal scrolling, anchor navigation, and keyboard focus. Do not increase the duration of routine research navigation. |
| [GSAP](https://github.com/greensock/GSAP) | Animation timelines and plugins. Its current no-charge license permits ordinary websites and commercial applications, with restrictions on competing visual animation builders. It is not the MIT license. [Official license](https://gsap.com/community/standard-license/) | Do not add another animation engine for simple hover, selection, or disclosure feedback: Motion is already installed. Consider GSAP only if a specific complex explanatory interaction earns it. |
| [React Bits](https://github.com/DavidHDev/react-bits) | Animated React components, including lists and content transitions. The current license is MIT + Commons Clause, permits use inside applications, requires notices, and restricts redistribution of the components themselves. [Component index](https://www.reactbits.dev/get-started/index), [license](https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md) | Reference small interaction patterns and adapt sparingly. Audit keyboard behavior, reduced motion, contrast, and dependencies before copying a component. Avoid importing the showcase aesthetic wholesale. No need for spotlight cards, cursor effects, rotating text, glass surfaces, or animated backgrounds in a dense research flow. |
| [ShaderGradient](https://github.com/ruucm/shadergradient) | Moving gradients rendered through React/Three.js; the official README lists MIT licensing and React/Fiber compatibility requirements. | Do not add it to the research interface. An ambient moving canvas currently answers no student research question. A flat or static subtle surface has lower operational complexity and leaves attention on the schools. |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | MIT-licensed React renderer for Three.js. Its official README pairs Fiber 9 with React 19. The official performance guide discusses battery cost and on-demand rendering. [Performance guide source](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/advanced/scaling-performance.mdx) | Reserve for a future verified spatial task, such as a genuinely useful campus model. The current dataset has no campus geometry. A 3D globe, decorative campus, or animated background would add complexity without strengthening today's comparisons. |

Selecting only the libraries that serve the task is consistent with the user's earlier adoption criteria: stack, license, accessibility, mobile performance, and purpose. Using all five would not itself improve design quality.

## Student-benefit boundaries from this checkout

- The dataset is a reviewed **50-college cohort**, not every US institution. Make that coverage explicit without burying students in release engineering details.
- The current college type has institutional observations, broad-field evidence, and an official website URL. It does not establish exact program catalogs, application deadlines, scholarship eligibility, campus housing, campus culture, or personal admission chances. Do not create authoritative-looking values for those gaps.
- Broad-field evidence describes dated bachelor-program indicators and institution-wide award shares. Keep the current distinction from exact current majors and major-level admission rates.
- The current README documents browser saves, separate account saves, comparison URLs, preference matching, and historical institutional admission rates. The redesign should connect these useful features into a visible sequence: discover → save → compare → investigate remaining questions.
- Source integrity is a valuable differentiator, but source-pipeline language in the opening hero is currently more technical than a first-year applicant needs. Explain the benefit in ordinary words and retain deep provenance in the detail/source pages.

## Acceptance checks for the redesign

- Search by university, alias, field, and location; exercise keyboard suggestions, clear search, no-results recovery, combined filters, and URL restoration.
- Save/un-save across discovery, profile, and saved pages; verify refresh persistence and the visible storage scope. If notes or checklists are added, test their persistence and export content.
- Compare two through four colleges, handle the selection limit and empty state, and verify direct/shared comparison URLs.
- Inspect the landing page, results, profile, compare, saved work, match, and source pages on desktop and narrow mobile. Check overflow, sticky controls, long university names, missing data, readable focus indicators, and all primary actions.
- Prefer at least 44px touch targets for primary controls as a product comfort target; WCAG 2.2 AA's minimum target-size criterion is 24×24 CSS pixels with defined exceptions. Do not confuse those two thresholds. [W3C SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Respect reduced-motion preferences and avoid nonessential scroll-linked movement. W3C's animation-from-interactions criterion is Level AAA; applying its guidance is still useful for this student-facing product. [W3C SC 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
- Run the repository's type, lint, production build, and meaningful existing tests, then verify fresh-load browser console and the complete student flow. Claims about live account functionality require configured-service evidence beyond local code checks.
