# Robot Evolution Lab — blank observer startup fix

A clean production visit rendered normally on 390px and 960px mobile viewports. A mixed-cache reproduction (Phase 4 HTML with current JavaScript) produced `Cannot set properties of null (setting 'onchange')`, no worker frame and completely transparent canvas pixels. The controller was binding controls that did not exist in the cached markup before initialization could finish.

The HTML and controller now share an explicit `render6` shell release marker. A controller encountering older markup navigates once to a cache-busted copy of the same page, preserving its parameters/hash and all IndexedDB data. It does not initialize against the incompatible shell. A retry marker prevents an automatic reload loop if a proxy still returns old markup. Dependency query tags are refreshed consistently.

The actual default Planck physical state is drawn before awaiting IndexedDB and the selected initial physical state is drawn while loading its checkpoint. This is an explicitly labelled initial model preview, not a trained-policy animation or a substitute for PPO. It does not write a new policy while a saved policy is still being read. Manual reset/step/run controls wait for initialization.

A small classic startup script runs separately from the module dependency graph. Import failures and initialization errors provide an actionable status and a **화면 다시 불러오기** button. A slow-start message appears after ten seconds if initialization has not returned a frame. Retry changes only the page URL; no storage/cache-clearing API or learning-reset function is invoked. Normal operation hides the retry control.

`scripts/verify-evolution-render.cjs` checks actual blue robot pixels in the canvas, not just element visibility. It exercises Phase 4 and Phase 5 cached HTML, a real saved historical policy and preserved network fingerprint, delayed IndexedDB, module download failure/retry, and Fold cover/inner viewport sizes. Independent browser regressions exercise real 1-Link/2-Link PPO and checkpoint/trajectory persistence. New UI adds only a normally hidden retry button; other controls and physics/reward/learning algorithms are unchanged.

The reproduced cache mismatch explains one concrete blank-screen path. It does not assert that the user's device/browser state was directly inspected. No existing user learning data was read remotely or deleted; browser tests use isolated contexts and mocked data APIs.
