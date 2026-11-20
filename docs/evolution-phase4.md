# Robot Evolution Lab — Phase 4

## Scope and preservation

This phase adds long-term local learning records, a protected policy archive, deterministic side-by-side comparison, separate trajectory persistence and an explicitly confirmed all-learning reset. The three independent real PPO missions and all prior control IDs remain available. No other MyDesk data, API rows, navigation configuration or old robot implementation is modified. Pre-existing robotdog work is excluded from this commit.

## Durable state and upgrade

The existing `mydesk.evolution.v1` IndexedDB database is upgraded **in place** from schema 1 to schema 2. The `checkpoints` store and its context keys remain compatible. Additional `policies`, `metrics` and `trajectories` stores have a context index. No data is deleted during upgrade. A real historical Phase 2 policy is tested through a schema-1 upgrade with identical network and Adam fingerprints.

The latest snapshot includes Actor/Critic weights, Adam moments and counters, stochastic generator states, fixed observation/reward scales and advantage normalization statistics, environment/episode counts and current state, a pending rollout, mission/curriculum/diagnostic state and evaluation results. Old snapshots without a rollout remain readable. When pausing **during** a PPO minibatch update, persistence uses the pre-update complete snapshot and rollout; resuming after reload reruns that update rather than claiming a partially applied update is complete. Continuous in-tab pause retains the original generator for continuation.

A checkpoint is written at each completed PPO update, each completed evaluation, pause and mission success. Only the most recent four history rows are repeated after the initial migration save. The separate metrics store retains every completed update indefinitely, upserting later evaluation information by update index. Unchanged metric rows are not rewritten. The graph can show all history or recent 5,000 / 20,000 / 50,000 steps. Only rendering is sampled to at most 600 points; persisted history is not thinned. Older Phase 3 histories already discarded before this update cannot be reconstructed.

## Policy archive and protection

Archive entries include the network/optimizer/normalization state, context, update/step counts and evaluation metadata. Initially stored policies, currently best policies, successful policies and manually preserved policies are protected. Ordinary periodic snapshots are selected every eight PPO updates; only their newest 20 entries are retained per context. Pruning an ordinary policy also removes its cached first-case trajectory. Manual preservation pauses learning and captures a safe state. Legacy best networks can be imported as **comparison-only** records; their original full environment state is not invented.

Policy records, latest snapshots and trajectories are versioned and checksummed. Corrupt latest snapshots fall back to the previous normal snapshot or successful snapshot. Corrupt archive entries and trajectories are not offered/replayed. The checksum detects accidental corruption, not adversarial modification. Quota/write failures are shown rather than reported as saved. Browser storage is local and subject to browser clearing/eviction; this phase does not add cross-device/server synchronization.

## Fair policy comparison

Comparison pauses learning and runs a separate worker. Both policies must have the identical mission and physical context. Each is evaluated on the same fixed 12-case bank through actual Planck dynamics with deterministic policy actions. The complete network/optimizer fingerprint is checked before/after; no gradient update or stochastic training sample is taken. Comparison does not trigger mission-success selection or modify learning performance records.

The two canvases replay the same first evaluation initial condition. They interpolate recorded physical states only for display. Metrics show full-bank success, pose RMS and time within the target-angle tolerance; recovery time is a conditional average of cases with a stable recovery interval. First-case torque RMS and signed actuator work are also shown. Signed work is not battery energy. An early failure's shorter trajectory holds its final state while the other trajectory continues; each duration is retained in the stored frames. The simulation remains a 1-Link ideal torque actuator, not a humanoid or motor/electrical model.

Policy checkpoints and trajectories are different IndexedDB records. Valid cached trajectories are reused after reload only when physical context and the full network fingerprint match. Comparison/replay stops when hidden. A new mission/context clears the previous comparison display.

## All-learning reset

The settings panel includes **모든 학습 데이터 초기화**. A confirmation explicitly covers **every mission and physical context in Robot Evolution Lab**, including protected checkpoints and trajectories. Cancellation makes no change. Confirmation terminates the learning/comparison workers, invalidates pending responses, waits for the local save queue, clears the four module stores atomically and creates a fresh policy for the currently selected mission/physics. The unrelated original robot, calendar, mindmap and robotdog stores are untouched.

A module-local BroadcastChannel stops older active tabs. A reset epoch is stored in the checkpoint transaction: older module sessions cannot write their old policies back after reset even if a broadcast is missed. Other stopped tabs ask for a reload. This is not a collaborative multi-device training feature.

## Verification

- Physics/ODE, PPO gradients and objective, mission/curriculum and old-policy restoration regressions.
- New unit coverage: partial-rollout continuation reproduces the next update, protected retention, lossless metric merging and display sampling, identical-condition real-dynamics comparison with unchanged Actor/Critic/Adam/RNG states, incompatible-context rejection.
- `scripts/verify-evolution-archive.cjs`: real browser PPO training, manual preservation, side-by-side comparison, saved replay after reload, 2,105-row history beyond the old rolling cap, reset cancellation and confirmation across missions, schema-1 upgrade, other-app localStorage sentinels and Fold cover/inner layouts.
- `scripts/verify-evolution-storage.cjs`: retention of 20 ordinary + 4 protected records, 41 complete metric points, checksum corruption rejection, stale writer rejection and stopping another actively learning tab during reset. These stress records are synthetic and confined to a fresh browser context.
- Existing PPO browser regression: balance improves from 0% to 100% in both primary and confirmation banks; actual restore, visibility pause, manual pause, evaluation immutability, corrupt-latest recovery and seven layouts pass.
- Existing mission browser regression: recovery and Swing-up improve from 0% to 100% on the two banks, with independent restoration and prior controls preserved. Observed runs use default parameters and deterministic seeds; they are not a promise of success for arbitrary physics.
- Existing calendar and navigation unit regressions pass. The calendar swipe/browser regression and original robot PPO check are run before deployment.

## Changed implementation

New: `evolution-records.mjs`, `evolution-comparison.mjs`, `evolution-comparison-worker.mjs`, `tests/evolution-records.test.mjs`, `scripts/verify-evolution-archive.cjs`, `scripts/verify-evolution-storage.cjs`, this report.

Updated: `evolution-storage.mjs`, `evolution-training.mjs`, `evolution-worker.mjs`, `evolution.js`, `evolution.css`, `robot-evolution.html`, mission dependency cache tags and existing browser script schema/phase assertions.

Next: Phase 5 independently validated 2-Link dynamics and an appropriately dimensioned new PPO policy. No multi-link learning is presented as implemented here.
