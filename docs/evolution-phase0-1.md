# Robot Evolution Lab — Phase 0 / Phase 1

Historical Phase 1 report. The subsequent implemented PPO and Fold layout are documented in [Phase 2](evolution-phase2.md).

## Scope and repository review

The new page is `robot-evolution.html`, menu ID `robot-evolution`, label **로봇 강화학습2**, directly after `robot` under the existing experiments folder. The existing robot page is retained. This delivery implements Phase 0 and Phase 1 only: **no PPO, learning episodes, reward, success rate, or learned movement is fabricated**.

MyDesk is a static GitHub Pages site. HTML pages use pinned ES modules, `style.css` and `shell.js`; `navigation-data.mjs` provides fallback navigation and `site-navigation.mjs` retrieves the existing shared navigation row. No framework, bundler or package manager is required. Existing Planck 1.5.1 is vendored in `vendor/planck.mjs` with its MIT license and package integrity recorded in `vendor/README.md`. It is reused without editing it or adding a second physics dependency.

The old robot imports its own `robot-core`, `robot-learning` and `robot-ppo` modules and has existing local/cloud persistence. The dog and swing are independent experiments. The new module imports none of these implementations and does not read, write, migrate or delete any existing storage key. Pre-existing uncommitted robotdog work is outside this change and is left untouched.

Only the navigation data gains an item. Shared navigation is updated with an optimistic revision check and a narrow JSON insertion; the fingerprint of all original items is checked after insertion. No blog, calendar, restaurant, model, authentication, menu permission or password row is changed.

## Files

- `robot-evolution.html`: page, initial condition controls, explicit unimplemented PPO notice.
- `evolution-core.mjs`: actual Planck world, fixture and revolute joint; physical frame interface; independent RK4 reference and verification.
- `evolution-worker.mjs`: fixed-time physics worker, manual torque input, reset/start/pause/step/validation protocol.
- `evolution-view.mjs`: Canvas 2D renderer reading only physical frames; skin does not modify mass or inertia.
- `evolution.js`: UI, worker lifecycle, measurements and last-15-second physical comparison graph.
- `evolution.css`: existing site colors/font conventions and PC/mobile layout.
- `navigation-data.mjs`: one additional fallback navigation item.
- `tests/evolution-physics.test.mjs`: numerical and actual-contact tests.
- `scripts/verify-evolution.cjs`: browser/worker, parameter, lifecycle, mobile and data isolation tests.
- `docs/evolution-phase1-results.json`: reproducible numerical results.
- This document: scope, engineering rationale, limits and next implementation plan.

## Physical model and parameters

These are explicit benchmark parameters, not estimates of a commercial robot.

| Quantity | Default | Rationale |
| --- | --- | --- |
| Uniform rod length | 1 m | Simple measurable benchmark; 0.3–2 m configurable |
| Rod mass | 1 kg | Fixed physical mass from fixture density; 0.2–5 kg configurable |
| Collision width | 0.06 m | Finite rectangular rigid body, not a massless line |
| Fixture density | 16.6667 kg/m² | mass / (length × width), Planck 2D fixture density |
| CoM | half length from pivot | Uniform rectangle; renderer reads actual world center |
| CoM inertia | 0.0836333 kg·m² | m(L²+w²)/12, checked against Planck fixture |
| Pivot inertia | 0.3336333 kg·m² | CoM inertia + m(L/2)² |
| Gravity | 9.81 m/s² downward | World gravity, not a rendering effect |
| Maximum actuator torque | ±6 N·m | Peak gravity moment is 4.905 N·m, giving 1.22× quasi-static authority |
| Viscous pivot damping | 0.02 N·m·s/rad | Explicit torque term; may be set to zero for conservation tests |
| Controller interval | 1/120 s | Fixed simulation time, independent of rendering |
| Planck substeps | 8 per interval | 1/960 s default constraint solve reduces projection energy loss |
| Constraint iterations | 12 velocity / 8 position | Fixed and documented |
| Initial angle / speed | +5° / 0 rad/s | An initial condition, not a stabilizing controller |

Angle is zero upright and positive clockwise. Positive commanded torque is clockwise; Planck uses the corresponding negative body torque. The revolute joint fixes translation, allows full rotation and has **no joint motor speed controller**. The actuator directly applies bounded body torque. Damping is a separate passive torque. A static anchor represents a pedestal fixed to ground. Ground height is `−L−0.2 m`, leaving 0.2 m under the downward link. Putting the pivot at floor level would obstruct full swing and make the future Swing-up mission inconsistent with this mechanism. The pedestal is visual scenery; the actual world joint provides the anchor constraint.

The 6 N·m default is sufficient to oppose gravity at every angle, so future Swing-up difficulty must be calibrated separately; a smaller torque bound can create an underactuated dynamic task. No motor response delay, speed-dependent torque envelope or hardware energy efficiency is claimed in Phase 1.

## Independent dynamics and accounting

The reference is a separate RK4 integration of:

`I_pivot * theta_ddot = m*g*(L/2)*sin(theta) + torque - damping*theta_dot`.

It receives only the same initial state and bounded torque command; it never steers the Planck body. The graph shows actual Planck angle error versus this reference, **not learning reward**. Continuous angle tracking avoids false 360° differences when Planck normalizes angles. Pose error is separately wrapped relative to upright.

Mechanical energy is `0.5*I_pivot*omega² + m*g*(CoM_y + L/2)`. Actuator work and dissipated damping energy are integrated at every physical substep. Residual is mechanical energy minus initial energy minus actuator work plus damping loss. Remaining constraint-projection energy drift is measured rather than hidden. Contacts and joint reactions come from actual Planck contact/joint data. The default free-rotation setup does not normally touch the floor; a separate collision test puts a real static fixture against the link.

The initial single-step implementation lost significant energy during large motion. Eight fixed internal substeps were introduced in response to measured ODE differences. This improves accuracy but does not make a constrained game physics solver identical to an analytical integrator. Long near-upright trajectories are sensitive to small integration errors; the benchmark windows and tolerances are explicit.

## Runtime and state

Physics runs in a dedicated module worker. Commands use a small independent protocol suitable for a future training engine adapter. Frames are sent roughly 30 times per second. Canvas renders interpolated **physical** frames with requestAnimationFrame; it does not generate a prescribed movement. Rendering frequency can fall with device load; 60 FPS is a target, not a guarantee. Catch-up work is bounded to avoid blocking and wall-clock debt can be dropped on slow devices, causing simulation time to lag rather than using a variable physics step. Reset generations prevent stale worker frames from overwriting a new experiment.

States distinguish ready, running physics, user pause, visibility auto-pause and error. Hidden-page events pause the worker. Returning resumes only a visibility-paused run, not a user-paused one. Errors stop the worker and require a valid reset. The three mission choices only set angles 5°, 45° and 170°. No success event or automatic mission advance is implemented.

Phase 1 deliberately does not persist a training state that does not exist. Current settings and the last 15 seconds of physics traces are session-only. IndexedDB, policy/optimizer persistence, checkpoints, long-term learning records, automatic mission success and two-policy comparison remain future work and are explicitly unimplemented.

## Verification

Detailed measured results are in `evolution-phase1-results.json`.

- Fixture mass, CoM, inertia and pivot constraint are checked across mass/length combinations.
- Zero-gravity torque direction and magnitude are checked against `tau/I` and saturation.
- Short unstable motion and stable oscillation are compared against independent RK4.
- A horizontal starting rod is compared for 2 seconds with a fixed coarse/fine time-step convergence test.
- Default large-amplitude comparison: approximately 1.047° maximum angle difference and 1.510% maximum energy residual over 2 seconds at 1/120 s × 8 substeps.
- Fine comparison: approximately 0.526° and 0.760% at 1/240 s × 8; fixed criteria are <0.04 rad angle error, <2% energy residual, and <1e−5 m anchor displacement.
- Damping loss and externally supplied work are independently checked.
- Real fixtures produce collision/contact events.
- Browser tests exercise the actual worker, no pre-scripted motion, torque, parameters, reset, pause/resume, validation and five viewports; live APIs are mocked.
- Existing robot core/control/recovery, calendar, cartpole and navigation unit suites are run. Existing robot browser testing uses its real PPO worker with mocked shared data.
- Existing tracked file hashes, including pending dog work, are compared to the pre-change snapshot; only the intended navigation file is excluded.

## Phase 2 plan (not implemented)

Use an independent CPU TypedArray Actor-Critic module rather than importing the old robot learner or adding TensorFlow.js to the whole site. Evaluate the small-network implementation against finite-difference gradients before enabling training. Initial observation dimension is 3 (`sin(theta), cos(theta), omega` with training-only normalization); action dimension is 1 bounded torque. A Gaussian policy with an explicitly accounted bounded-action transformation must provide correct sampled action log probability and entropy treatment.

Implement rollout buffers with explicit termination vs truncation, bootstrapped value targets, GAE, PPO clipped policy objective, value loss, entropy regularization, gradient norm and Adam state. Test these math components separately, including weight changes and evaluation immutability. Start with an independent balance policy, fixed held-out seeds and repeated evaluation. Training improvements alone cannot mark success. Curriculum and later missions follow only after the first policy passes fixed evaluation criteria. Independent IndexedDB version/integrity checks and protected best/success checkpoints will be introduced in their requested phase. No pretrained sequence, PD demonstration or prescribed successful trajectory will substitute for PPO.
