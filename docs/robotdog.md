# Robotdog Q-04 — Spot-inspired quadruped, shared PPO policy

`robotdog.html` is independent of the existing 2D robot, evolution lab, swing, calendar, mindmap and blogs. No navigation/database rows or other experiments' storage are changed.

## Mechanism and visual reference

References inspected for this update:

- Official Spot anatomy, hip axes and knee flexion: https://dev.bostondynamics.com/docs/concepts/about_spot.html
- Its front/side drawings: https://dev.bostondynamics.com/_images/frontview.png and https://dev.bostondynamics.com/_images/sideview.png
- Public ROS model at a pinned revision: https://github.com/rai-opensource/spot_description/blob/156d1802bfb117f219dbfce7597d283d5fabc968/spot_description/urdf/spot_macro.xacro

The public model supplies reference joint spacing, axes and link lengths; no manufacturer mesh, texture or logo is bundled. Our procedural yellow/black shell is an approximation. The front is a shallow central grille with two vertical groups of flush sensor panels. The back-mounted arm, its controls, its rendering and its 8 kg mass contribution are removed. `robotdog-arm.mjs` is not imported by the new app; keeping that legacy file avoids breaking a previously cached page.

Each leg is a real Three.js parent/child chain: body → X abduction → lateral carrier → Z hip pitch → upper link → Z knee flexion → one solid lower link → rubber foot. The lower link deliberately has no double/open rail. The same sequence calculates the physical foot positions and analytic contact Jacobian. Mesh orientation is no longer inferred with a shortest-arc quaternion from two endpoints, which discarded the hinge roll and could flip/twist the covers.

Coordinates are SI units, +X forward, +Y up, +Z left (converted from the reference model's Z-up convention). Chassis shell: 0.88 × 0.22 × 0.30 m. Hip roots: X ±0.29785 m, Z ±0.055 m; lateral carrier 0.110945 m. Upper/lower link: 0.3205/0.330 m; foot radius 0.034 m. Total simulated mass is 32.7 kg; gravity 9.81 m/s². Motor caps are 45/45/115 N·m, following the public model's settings, not a claim of certified hardware ratings. Knees flex only 0.245..2.79 rad. Pitch limits are -1.4..1.25 rad; conservative inward/outward abduction limits are mirrored by side to reduce legs crossing the body. These simulator limits intentionally differ from the robot's full hardware envelope.

## Physics and its limits

This remains a lightweight reduced model: floating-body motion, independently integrated joint inertia/PD control, contact Jacobians and normal/friction forces on a shared analytic height field. It is **not** a full articulated rigid-body-tree solver or a hardware-transfer simulator. Distributed hull/upper-leg/lower-leg/foot collision samples and post-step position projection remove residual compliant penetration. Render-time interpolated traces receive the same clearance correction so nonlinear joint interpolation cannot put the feet through the floor. The clearance margin is 4 mm. Projection/contact is physical constraint handling, not a programmed get-up or gait controller.

There are no stored walk/get-up animations or injected forward propulsion. Actions control 12 bounded PD target positions. Physics runs at 120 Hz; policy decisions and PPO environment steps run at 30 Hz in both training and live execution. Training is in a module Worker. Observation/render loops and learning are separate. Training observation replays actual recorded simulation traces; live Model Run continuously evaluates the saved policy in physics.

Terrain height and normals are shared by sensors, contacts and the 128 × 96 grass mesh. Seven choices: flat meadow, hills, bumpy meadow, uphill, downhill, low rounded steps, ridge. Steps use smoothed risers in the height field; these are not independently simulated stones or masonry objects. A local patch follows movement without resetting camera orbit/zoom. The procedural grass texture does not require external images. No shadow maps, postprocessing or runtime CDN library are used. Measured initial scene: ~33,034 triangles, 52 draw calls. Rendering targets 60 fps when active, with pixel ratio capped at 1.25 on coarse pointers and 1.5 otherwise; static scenes do not continuously redraw. Actual frame rate depends on the device.

## Real PPO, one robot

`robotdog-ppo.mjs` implements its own multi-output Actor/Critic, stochastic tanh-Gaussian sampling, joint log probabilities, GAE, PPO clipped objective, Value Loss, transformed entropy gradients, gradient clipping and Adam. Exact network gradients are checked against finite differences. This code does not import another experiment's physics, reward, learner or conceptual task controllers.

The actor has 68 observations, 24 tanh hidden units and 12 continuous actions; the critic uses the same input dimensions with one value output. Observations: local height, projected up direction, local linear/angular velocity, 12 angles, 12 angular velocities, four actual contact flags, previous 12 actions, three command values, six goal bits and nine current terrain-height probes. No evaluation outcome or future simulator state is an observation.

The six goals are balance, forward walking, backward walking, turning, get-up and push resistance. These use **one shared actor weight array**, not six separately loaded models. Selecting a goal changes the command/observation. “여러 목표 함께 학습” cycles goals evenly between episodes. Target speed accepts 0.1–10 m/s as a command range, not a guaranteed achievable speed.

Rewards combine local height × uprightness, command tracking, actual signed progress, recovery-potential change, stability and small effort/action-change costs. Walking has a standing-still cost. A success flag requires the corresponding real goal: distance for walking, yaw change for turning, sustained upright recovery for get-up, and stable standing for balance/push. A positive reward alone is not success. Get-up begins side-lying and does not end immediately for being down. Time limits are truncations and bootstrap value; true failure termination does not bootstrap. Training does not stop merely because a task succeeds.

PPO updates after ≥256 collected control transitions, normally with four epochs and 64-sample minibatches, with KL early stopping. Partial final rollouts ≥32 samples may also update. The current actor keeps learning; the integrated execution policy is adopted only after a higher average reward on two fixed seeds per relevant goal with bounded per-goal score regression. This lightweight screening is not comprehensive validation and does not guarantee every skill improves or that all six skills are mastered. Recent reward, fixed-condition validation reward, per-goal experience, actual loss/entropy/KL and update/step counts come from the engine.

## Persistence and lifecycle

New key: `mydesk.robotdog.ppo.v2`. Previous `mydesk.robotdog.v1` CEM bytes are left untouched. The changed observation size/control mechanism means CEM weights are not silently treated as compatible PPO weights. The new key stores the current actor/critic, three Adam states, RNG, update/step counts, integrated weights, goal/terrain settings, skill counts and up to 1,000 history points. An unfinished rollout buffer can be resampled after interruption; no full unfinished episode is promised to resume exactly. No cloud model upload is introduced.

Periodic checkpoints and pause/stop checkpoints save during use, not only at unload. Manual pause stops learning as well as observation. Hidden pages pause the worker between small work chunks; returning resumes only if the user had not paused. Reset asks confirmation and initializes only the new PPO key, retaining legacy CEM and all other app data. A stale HTML form is refreshed via a versioned URL rather than clearing storage.

## Compact Fold layout

Page/stage titles, arm controls, foot contact lamps and decorative captions are removed. Contact state still exists internally for physics and PPO. The fourth telemetry value is actual PPO update count. Push strength and its button are immediately above the robot. Essential training/run/pause actions, selectors and a compact chart remain visible; skill and help/settings sections expand only when needed. The navigation hamburger/shortcuts remain available.

Basic closed-panel layout is checked at 320×740, 360×740, 390×844, 768×1024, 960×600 and 1440×900 CSS pixels. Expanded help/skill sections use normal page scrolling. Device browser bars and accessibility font enlargement may change usable height.

## Verification

- `node --test tests/robotdog.test.mjs tests/navigation.test.mjs tests/evolution-ppo.test.mjs`: exact link geometry and finite-difference Jacobians for all sides; gravity/no injected propulsion; seven terrain normals; 100 N·s pushes and recovery with bounded joints/finite physics and no sampled penetration; honest success conditions; deterministic episodes; MLP finite-difference gradients; probability/clipping/GAE; actual PPO weight and optimizer updates; RNG/checkpoint restore; one actor learning all goals; old app/legacy data preservation. Existing evolution PPO and navigation regression remain separate and unchanged.
- `scripts/verify-robotdog.cjs`: actual WebGL and module Worker; 32 independently posed mesh/physics comparisons (including body rotation and extreme joint angles), one lower-link mesh per leg, no arm scene nodes, seven terrains, six goals without swapping weights, real PPO updates, pause/resume/stop, reload with optimizer retained, 35 N·s push, grass/render budget, six layouts and menu drawer, reset confirmation and existing-data sentinels. REST requests are mocked so tests do not modify shared MyDesk data.

Short tests establish numerical/functional correctness. They do not establish reliable long-horizon walking or get-up competence; those require substantially more training and broader evaluations.
