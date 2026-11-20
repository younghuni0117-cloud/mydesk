# Robot Evolution Lab — Phase 3

## Delivered scope

Three independent PPO missions are available: balance, recovery from a larger tilt, and Swing-up from near downward. The original Planck physics experiment, torque slider and zero command, initial-condition presets, parameter editor, single-step/reset, engineering overlay, ODE graph, physical verification, all PPO statistics, reward contributions, checkpoint restoration and evaluation remain available. This update does not add multi-link robots or a shared policy between missions.

The former fixed viewport clipped content and required a separate modal to reach many controls. The page now uses compact natural flow: smaller gaps and padding, visible manual run/step/reset buttons, a directly accessible torque panel, and inline expandable settings with an expand-all action. Advanced content expands the page and uses the browser scrollbar. Nothing is removed to force every control into one screen. Cover displays may need some scrolling; inner displays use two columns. Existing control IDs are compared against the previous version, and browser tests exercise expanded controls.

## Missions and physical state

| Mission | Training horizon | Fixed evaluation horizon | Final initial angles | Success |
| --- | --- | --- | --- | --- |
| Balance | 6 s | 8 s | Existing approximately ±1.4–5° bank | Existing full-horizon 12° max, 4° RMS, 3° final, 0.3 rad/s final |
| Recovery | 10 s | 10 s | Random sign, 30–60° | Reach a 2 s stable interval beginning by 6 s, and remain stable for the last 2 s; final angle ≤5°, speed ≤0.3 rad/s |
| Swing-up | 14 s | 14 s | Random sign, 165–180° | Reach a 2 s stable interval beginning by 10 s, and remain stable for the last 2 s; final angle ≤5°, speed ≤0.3 rad/s |

A stable interval means angle error <8° and speed <0.4 rad/s. Recovery and Swing-up do **not** terminate simply because the link has fallen. Their timeout is a truncation with value bootstrapping. All missions require 12/12 fixed evaluation cases and another 12/12 confirmation cases before automatic success stop. There is no automatic switch to the next mission.

The new learning still uses the actual Planck rigid body and bounded torques, not a recorded maneuver, a PD demonstration or policy reuse. Each mission gets a separate newly initialized Actor-Critic and optimizer unless restoring its own checkpoint. Default torque is still ±6 N·m on the 1 m, 1 kg rod; it exceeds the 4.905 N·m peak gravity moment. These default conditions permit direct dynamic lifting; success here does not prove success with underpowered actuators or different masses/lengths.

An initial-state consistency issue was found during verification: nonzero angular velocity must also give the center of mass the matching tangential linear velocity. The constructor and checkpoint restoration now set both. The zero-initial-speed Phase 1 benchmarks remain unchanged. A real saved Phase 2 balance policy is included as a test-only fixture and still passes both fixed evaluation banks without changing its weights. It is never imported as a runtime initial policy.

## Rewards

Balance retains its Phase 2 reward and fixed evaluation rules. Recovery/Swing-up use:

`2*cos(angle_error) - 0.03*angular_velocity² - 0.005*normalized_action² + stability_bonus_if_stable`.

The initial stability bonus is 1. A bounded automatic response may increase it up to 2 after measured long-term stagnation with very little stable-state experience. Contributions are recorded individually. Evaluation success thresholds remain independent of reward weights, and the evaluator's reward accounting does not use adaptive training weights.

## Curriculum

Recovery stages cover 0–10°, 10–25°, 20–45° and 30–60°. Swing-up stages cover 0–15°, 15–45°, 40–90°, 90–135° and 150–180°. Twenty percent of new-mission episodes sample an easier near-upright state to preserve stabilization experience. This changes only initial conditions, never actions.

Every four PPO updates, a separate curriculum probe evaluates the current stage. With ≥80% probe success and at least 4096 steps since the previous change, the next stage is selected. Before/after indices, angle ranges, steps and reason are saved and displayed. The final primary/confirmation banks do not change as the curriculum changes. A policy can generalize beyond its current stage and pass the final banks before visiting every stage; fixed final success is sufficient and the UI reports the actual stage rather than inventing completed training.

## Diagnosis and safe responses

Fixed evaluation and probe performance are inspected together, not just Policy Loss or training reward. A 48-update interval without meaningful fixed-evaluation improvement can produce a **qualified stagnation inference**, not a definitive root-cause claim. Measured improvement in the current-stage probe also resets this timer; repeatedly obtaining the same probe result does not indefinitely hide final-evaluation stagnation.

At intervals of at least 24 updates, measured KL >0.08 may reduce actor learning rate (floor 0.0001). Otherwise long stagnation can raise the stability bonus (ceiling 2) when stable experience is scarce, or raise the entropy coefficient (ceiling 0.01). Every actual change records its previous value, new value and reason. No unbounded search or promise of recovery is made.

Before a PPO update, its valid network and Adam state are kept. A nonfinite update restores that state and logs the rollback. After more than two such recoveries the worker stops with an error. This safeguard is tested by injecting a nonfinite update. A zero torque limit is rejected for training with an explicit reason, while it remains usable for manual physics. Broader physical-feasibility inference is not asserted from torque magnitude alone: low peak torque does not by itself prove a dynamic Swing-up impossible.

## Storage compatibility and lifecycle

Mission ID prefixes independent IndexedDB contexts. The existing balance context string is unchanged, so old checkpoints, optimizer state and counts remain accessible. Restore rejects copying a checkpoint into another mission. New snapshots additionally retain curriculum, reward weights, diagnosis changes and event history. Networks and checkpoints from the other missions are not deleted on selection changes.

Training, preview and fixed-policy execution pause when the document is hidden or the simulation canvas scrolls entirely out of view. Visibility restoration resumes only an automatically paused run. User pause and mission success do not auto-resume. Model execution and the real-time learning preview use a mission-appropriate physical initial state and horizon; recovery/Swing-up previews are not cut off at the balance failure angle. Rendering interpolates the real rigid body's angle and reconstructs its fixed-length geometry.

Current metrics are sent at a bounded rate, and historical update records keep compact numeric summaries rather than duplicating the entire event history in every row. Best/success checkpoints remain protected. Full policy selection/comparison UI and long-term archival are still Phase 4 work.

## Verification

- Physics, PPO gradient/log-probability/GAE tests and new mission tests pass.
- New tests cover fall continuation, proper truncation bootstrap, independent storage keys, old balance restoration, curriculum/evaluation separation, bounded logged adjustments and rollback from an invalid gradient update.
- Controlled from-scratch runs for both new missions improve from 0% to 100% on primary and confirmation banks; detailed results are in `evolution-phase3-results.json`. These are default benchmark results, not a guarantee for every parameter set, random seed or learning budget.
- Browser tests use actual workers and IndexedDB, save/reload mid-learning, complete both new missions, switch away and back, verify existing controls and expand-all behavior, and inspect four Fold-style viewports. The Phase 2 browser regression also passes with the new naturally scrollable layout.
- Existing calendar, cartpole, navigation and robot basics unit regressions pass; the old robot's actual PPO browser flow is also checked with live APIs mocked.

## Changed files

New: `evolution-missions.mjs`, `tests/evolution-missions.test.mjs`, `tests/fixtures/evolution-phase2-balance.json`, `scripts/verify-evolution-missions.cjs`, this report and `evolution-phase3-results.json`.

Updated: the evolution core/training/worker/storage/UI/style/page, its existing physics/browser tests, and the historical Phase 2 report link. Existing robot/dog, menu data, calendar, blogs, backend rows and credentials are unchanged. Pre-existing pending robotdog edits are not committed with this work.
