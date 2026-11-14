# Q-01: independent 3D quadruped prototype

Page: `robotdog.html`. This is a new experiment, with its own mechanics, learner, worker, view and local storage. It imports no existing robot/swing physics, policies, rewards or learning modules. Site navigation and the existing pinned Three.js vendor module are shared infrastructure only.

## Mechanism and rendering

Four independently articulated legs, each with hip abduction/adduction, sagittal hip rotation and knee flexion: 12 actuated DOFs. Chassis is 58 × 28 × 16 cm, with 23.5/24.5 cm leg segments, a 5.5 cm lateral hip link and 2.5 cm rubber contact radius. The graphic model is built from scratch: beveled body shell, layered battery/controller covers, vents, front camera pair, ranging head, separate motor barrels and caps, links, braces, cable conduits, hubs and rubber feet. Visual parts share 15 geometries and materials. The measured initial view has 6,438 triangles and 156 draw calls; there are no remote model/texture downloads, real-time shadow maps, image textures, postprocessing or HDR environments. The already-vendored Three.js 0.160.1 module and its MIT license are reused.

Pixel ratio is capped at 1.5; antialiasing is requested only on larger fine-pointer screens. The view renders at most 30 times per second and stops redrawing a stationary inspection scene. Device viewport/fold widths use a menu drawer and keep main actions reachable; touch orbit/pinch and desktop orbit/pan/wheel cameras are available.

## Reduced physical model

`robotdog-core.mjs` uses SI units with +X forward, +Y up, +Z left. A 12 kg floating chassis has three translational and three rotational dynamics. Articulated leg joints have torque-limited PD targets, bounded speed, damping, inertias and gravity terms. Forward kinematics and analytic foot Jacobians couple compliant foot contact/friction to joints and body forces/moments at 120 Hz. Belly contact and fall termination are simplified. This is a reduced interactive model, not a full rigid-body tree/inverse-dynamics or validated hardware simulator. There is no prescribed gait, body translation animation or injected propulsive force. Initial REST angles are an assembly pose and reset state, never presented as learned motion.

## Actual learning, not a staged demonstration

A 40-input, 8-hidden, 12-output tanh policy (436 weights) observes body height/orientation/velocities, 12 joint angles/velocities, four contacts and a target speed. Outputs are bounded target angle offsets from the assembly pose; PD motors create motion through contact dynamics.

The independent CEM learner samples eight candidate policy episodes per batch, uses two elites to update its search distribution and accepts a new execution policy only if it improves the mean reward on the same two held-out seeds. Trial counts represent actual completed simulations. Rewards measure upright height, velocity tracking and real forward progress; falls, side slip, yaw, excessive movement and effort incur costs. Stationary goals get no forward-progress bonus and penalize drift. Graphs contain actual per-goal trailing ten-trial rewards and fixed-condition model validation scores.

Learning runs in one worker, yielding at least 12 ms between episodes and more when a trial is expensive. The 3D training view interpolates recorded physical frames, avoiding a duplicate simulation. The optional model execution uses real fixed-step simulation with the current policy. Graph redraws are capped near 4 Hz; physics and display rates are separate.

## Persistence and scope

Only `mydesk.robotdog.v1` is written. It contains the versioned weights, count and at most 500 graph records. Reset explicitly confirms and affects only this key. Corrupt models are rejected. Other robot models, calendar, blogs, menus and credentials are untouched by this experiment. Training is device-local for this draft; there is no login or model cloud synchronization.

The shared navigation gets one new visible link `robotdog` immediately after `robot`, under the same parent. The already-visible swing link is also made explicit after robotdog, because older navigation code otherwise automatically inserts swing immediately after robot and pushes the dog down. No new swing feature is added. All previously stored menu item data and relative order are verified unchanged (original fingerprint `9a9c39c3e90d5debd57bd036c2488b62` after excluding these two explicit entries). No database schema change is needed.

## Verification

- `node --test tests/robotdog.test.mjs tests/navigation.test.mjs`: link lengths/mirroring, all 12 bounded joints, inverse transforms, analytic Jacobian vs finite differences, gravity/contact/torque bounds, deterministic episodes, real reward-driven optimization and held-out acceptance, device-local data isolation and corrupt cache handling.
- `scripts/verify-robotdog.cjs`: real WebGL/worker, 100 actual learning trials, execution, pause, perturbation, camera changes, graphs, saved state after reload, a separate device, confirmed reset, old robot-data sentinel preserved, no inherited robot-learning modules, four viewport sizes including folded/tablet/landscape, drawer behavior and graphics budgets. Shared REST APIs are mocked to prevent test writes.
