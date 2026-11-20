# Robot Evolution Lab — Phase 2

This update implements real CPU PPO for **mission 1: small-angle balance** on the independently validated Planck pendulum. It also provides a compact Fold cover/inner-screen layout. Recovery, Swing-up learning, curriculum, multi-link growth, cloud acceleration and side-by-side policy replay remain later phases. Their manual starting-angle presets are retained under physical experiments; they are not presented as trained missions.

## Actual learning path

- `evolution-ppo.mjs`: independent 3→16→1 tanh-hidden actor and independent 3→16→1 critic, 81 parameters each; sampled Gaussian latent actions transformed with tanh into bounded normalized torque; transformed log-probabilities include the Jacobian.
- `evolution-training.mjs`: observations are physical sin(theta), cos(theta), omega/6; commanded torque is normalized action × configured torque limit. The action is held for four control intervals (30 actions/s at the default 120 Hz control interval). The actual Planck constraints still use eight internal substeps per interval.
- No PD gains, action demonstrations, expert policies, hardcoded balancing trajectories, or old robot policies are used. Initial network weights are random. The RK4 reference never controls the body.
- GAE uses gamma=0.99 and lambda=0.95. True failure termination zeros the value bootstrap; time truncation keeps the final-state value but cuts cross-episode advantage recursion.
- PPO uses 1024 environment transitions per rollout, shuffled minibatches of 64, up to 6 epochs, clipping=0.2, actor/log-sigma Adam LR=0.001, critic LR=0.002, and independently clipped gradient norms. Epochs stop early if measured approximate KL exceeds 0.03.
- The bounded-action entropy and its reparameterization gradients use a 5-point Gaussian-Hermite approximation. The reported differential entropy is for normalized continuous torque, so negative values do not by themselves mean a failed policy.
- All gradients are explicitly backpropagated. Adam first/second moments and step indices are updated and saved. This is a small custom JavaScript CPU engine, not a cosmetic animation or a server-side trained policy.

## Rewards and episode rules

At each environment transition:

`reward = 1 - 8*wrapped_angle² - 0.1*angular_velocity² - 0.01*normalized_action² - (5 if failure else 0)`.

Each term's actual contribution is accumulated and displayed per environment step. A training episode starts at a uniform random angle within approximately ±5° and angular velocity within ±0.1 rad/s. It fails past 0.35 rad; otherwise the episode is truncated at 6 seconds. PPO receives neither evaluation outcomes nor future information in its observations. Curriculum and automatic reward adjustment are not implemented in this phase.

## Fixed evaluation and automatic success

The primary bank contains 12 deterministic held-out initial states from fixed independent seeds; the confirmation bank contains another 12. Both use the same configured physics and an 8-second horizon. Policy actions are deterministic means transformed with tanh. Evaluation does not change network weights, optimizer or training RNG.

A case must last 8 seconds, never exceed 12°, have angle RMS ≤4°, finish within 3°, and finish with |angular velocity| ≤0.3 rad/s. The fixed bank is evaluated every four PPO updates. Only a 12/12 primary result followed by a 12/12 confirmation result stops training as a mission success. A reward increase or a single successful episode is insufficient. The next mission is not entered automatically.

The live training picture is explicitly labeled as a **separate real-time Planck observation of the latest policy**. The training worker collects faster-than-real-time experience independently. Model execution freezes the best evaluated policy, runs real physics, and also evaluates the fixed bank without updating weights. The view does not replay predefined movements.

## Worker, CPU and visibility

Physics, rendering and training schedules are separate. Training operates in small measured wall-time slices with yields between them; faster devices process more transitions per slice. The normal per-slice budget is 10 ms, reduced to 6 ms for lower-core devices. PPO optimization yields between minibatches, evaluations between cases, and detailed UI metrics are throttled to approximately 10 Hz. Hidden views stop both training and live observation. Visibility restoration resumes only a run that was automatically paused, not a user-paused or successful run. Browser hardware and background scheduling vary; there is no 60 FPS guarantee.

## Independent persistence

`evolution-storage.mjs` owns IndexedDB database `mydesk.evolution.v1`, store `checkpoints`. It never modifies existing robot/calendar/mindmap storage or the shared backend. Data is separated by physical configuration. It contains actor, critic, learned standard deviation, Adam states, RNGs, fixed observation/reward scaling, last advantage-normalization statistics, episodes, steps, update count, physics settings, current episode state, evaluation results, bounded metrics history, best policy and completion state.

Completed PPO updates and explicit pauses trigger saves; persistence does not depend only on page exit. Each envelope has a schema version and an FNV checksum. Loading validates the network and optimizer; a bad latest record falls back to its previous complete record, then a valid protected success checkpoint. Best and success records have separate keys and are not automatically deleted. Storage errors are visible and the current tab can still learn.

The physics warm-start impulse cache is not serialized; a resumed partial episode reconstructs its physical state. Network/optimizer/RNG state is preserved, but bit-for-bit continuation of a constraint solver trajectory is not claimed. Full long-term metric archival, checkpoint pinning UI and side-by-side historical trajectory replay are Phase 4 work; this phase retains up to 2000 update records and displays the latest 500.

## Fold layout

The main workspace is sized with dynamic viewport height. The simulation, four physical values, training/model/pause buttons, six learning metrics, learning chart and settings button fit together. Cover widths use stacked compact rows; inner-screen widths use side-by-side panels. The sidebar becomes a drawer up to 1100 CSS pixels or on a coarse pointer. Only the new evolution page gains this shell condition; other existing pages keep their former rules. Advanced controls and physical experiments use an explicitly opened dialog with its own scrolling.

Browser tests cover 1440×1000, 320×650, 356×640, 390×844, 768×1024, 960×540 and 1024×768 CSS viewports. This verifies representative layouts, not a claim of testing physical Fold 8 hardware or every browser zoom/browser-toolbar configuration.

## Verification

- Every actor parameter's backprop derivative is checked against finite differences.
- Log probability, bounded random action sampling, transformed density normalization, entropy and entropy derivatives are verified.
- GAE termination, truncation bootstrap and cross-episode separation are checked with explicit expected values.
- Clipped PPO objective gradients are compared with finite differences on both advantage signs and both sides of the clip range.
- Actual actor/critic weight changes and exact network/Adam/RNG serialization are checked.
- Four independently seeded training runs improve primary evaluation from 0% to 100% and also achieve 100% on the separate confirmation bank; `evolution-phase2-results.json` records the measured trials.
- Browser verification uses real workers and real IndexedDB: pause/hidden/resume behavior, automatic success stop, reload restore, corrupted-checkpoint recovery, immutable evaluation and seven no-page-scroll layouts. Existing app storage is seeded and verified untouched.
- Physics, navigation, calendar, cartpole and existing robot unit regression suites pass. The existing robot's actual PPO worker, three basic tasks and storage flow also pass their browser regression with mocked live data.

## Changed files

- New: `evolution-ppo.mjs`, `evolution-training.mjs`, `evolution-storage.mjs`, `tests/evolution-ppo.test.mjs`, `scripts/verify-evolution-ppo.cjs`, this report and `evolution-phase2-results.json`.
- Updated: `evolution-core.mjs` (optional diagnostic calculation bypass; same physical integration), `evolution-worker.mjs`, `evolution.js`, `evolution.css`, `robot-evolution.html`, `scripts/verify-evolution.cjs` (current verifier entrypoint), `shell.js` (drawer opt-in only for this page), historical Phase 1 report link.
- Existing robot, dog, calendar, restaurant, blog, navigation database and credentials are unchanged. Pre-existing pending robotdog edits are not included in the commit.
