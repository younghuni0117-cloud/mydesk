# Robot Evolution Lab — free-standing lower body

## Scope

The primary structure is now a **floating pelvis, two thighs, two shins and two feet**. It learns standing through actual Planck contacts and six-action PPO. There is no world-to-robot revolute joint, pedestal or support force. The floor remains a static physical surface; the robot is free to translate, rotate, fall and respond to impulses. The old 1-Link and 2-Link anchored exercises remain selectable under **기초 실험**, with their policies and histories preserved.

The next structures/tasks (walking, fallen-state getting up, trunk, neck/head and arms) remain unimplemented. No pre-scripted walking/get-up animation or trained runtime fixture is supplied. Existing unsupported 2-Link recovery/Swing-up options are not presented as implemented; they remain separate future anchored exercises rather than the new robot's main development path.

## Physical structure

Default scale 1:

| Part | Mass | Shape |
| --- | --- | --- |
| Pelvis | 8 kg | 0.48 × 0.16 m |
| Each thigh | 3 kg | length 0.42 m, width 0.09 m |
| Each shin | 2 kg | length 0.42 m, width 0.075 m |
| Each foot | 0.8 kg | 0.30 × 0.08 m |

Total mass is **19.6 kg**. Gravity is **9.81 m/s²**. Body density produces these actual Planck masses and inertias; visual coloring does not change them. Size and mass scaling are independent settings. The root has three unactuated planar degrees of freedom. Six internal revolute joints give nine generalized degrees of freedom before contact constraints.

Per leg: hip limit −1.1..1.1 rad, knee −2.4..0.03 rad, ankle −0.7..0.7 rad. Knee extension is limited while flexion remains available. Hip and knee torque bounds default to ±60 N·m; ankle bounds are ±39 N·m. Each drive applies equal/opposite torques to the two connected dynamic bodies and includes relative-speed damping 0.25 N·m·s/rad. These are ideal torque actuators, not a calibrated commercial robot motor model.

The fixed timestep is 1/120 s with 4 physical substeps; action repeat is 4 (30 Hz). Floor friction defaults to 0.8 and is configurable. Both feet collide with the floor independently; robot self-collision is disabled in this initial lower-body model. Joint limits and contact impulses can dissipate energy. Reported net work is signed mechanical work, not battery consumption. The energy difference includes contact and limit losses; it is not labelled conservative ODE error.

An initial pose is constructed geometrically, with the lowest foot corner 2 mm above the floor to avoid overlap. All subsequent movement uses Planck forces, impulses and constraints. Constructor setup and checkpoint restoration set body transforms; training does not teleport or kinematically hold the pelvis/feet.

## Actual PPO and observations

The vector Actor-Critic implementation is generalized without changing the 2-Link defaults or checkpoint dimensions. The new policy has **28 actual-state inputs, 6 continuous torque outputs and 32 hidden units**. Inputs include pelvis sine/cosine, linear/angular velocities, height, six joint sine/cosine/speed triples, two independently measured foot-contact flags, CoM relative to the foot-center support region, and displacement from the initial position. No evaluation outcome, future contact or future disturbance is observed.

Defaults: rollout 1024; actor LR 0.0005; critic LR 0.002; 5 epochs; entropy weight 0.001; gamma 0.995; GAE lambda 0.95. Initial Gaussian log standard deviation is −2.3. PPO uses summed squashed-Gaussian joint log probability, clipped objective, entropy, actual gradients and independent Adam state. Finite-difference tests cover the larger actor's shared layer and output heads; old scalar and 2-action checkpoints remain dimension-checked.

Reward per action is:

- Base cost −0.5.
- `3 * clamp((pelvis_height/scale − 0.72)/0.25, 0, 1) * max(0, cos(pelvis_angle))`.
- Pelvis angle cost −0.8×angle².
- Linear/angular speed, CoM support-region offset and a small normalized torque cost.
- Failure penalty −3 if pelvis height <0.5×scale or absolute pelvis angle >1.1 rad.

The height threshold prevents prolonged low crouching from receiving the same incentive as standing upright. Reward terms are logged separately. Training timeout is six seconds with proper truncation bootstrap; physical falls are true termination.

Curriculum starts at root tilt ±0.025 rad and angular speed ±0.03 rad/s, with a slightly flexed easy initial leg pose. A measured probe can increase these to ±0.055 rad / ±0.08 rad/s and more flexed initial knees. Randomized training pushes occur once at 1–3 seconds, with signed impulse up to 0.5 N·s initially and 1.5 N·s at the harder stage. These change actual dynamics, not actions. The observer's manual 3 N·s push acts on its separate physical scene, not retroactively on a training rollout; the UI explains that distinction.

## Evaluation and measured learning

Two independent deterministic banks each contain 12 initial states. Final evaluation always uses the harder tilt/pose distribution, an eight-second horizon and an actual signed 1.2 N·s pelvis impulse at a case-specific fixed time. Success requires at least seven seconds of high, upright, near-start standing, final height >0.78×scale, pelvis angle RMS <0.18 rad, small final x/y velocity and an actual foot contact at the end. Falling terminates a failed evaluation. No reward total alone can declare success.

Measured from-scratch node experiment: 0% → 100% on the 12 primary and 12 confirmation conditions after 64 PPO updates. The browser experiment, including a mid-learning save/reload and four-update evaluation cadence, reached both banks at 72 updates / 73,728 environment actions. Contact warm-start impulses are not serialized; restored physical trajectories need not be bit-identical even though network/Adam/RNG/rollout state is preserved. These are default seeded results, not a learning guarantee for all scales, friction values, seeds or devices.

## Continue after achievement

Passing both banks sets a persistent **achievement record**, saves the actually validated policy and continues training. It does not disable training, stop the worker, suppress visibility resume or refuse a new training request. Training still pauses for the user, a hidden observer, errors or the explicit step budget.

Achievement history is separate from `validatedSuccess` for the current checkpoint. Later, potentially degraded candidates do not overwrite the successful snapshot or become falsely marked as success merely because an earlier policy passed. Best and successful policies remain protected in the archive. On pause, the UI now waits for a requested stable snapshot and its completed IndexedDB write before showing **이 기기에 저장됨**; this fixes a reproduced immediate-reload race.

## Persistence, comparison and compatibility

New keys append `free-biped-v1` and friction to the existing context. 1-Link and 2-Link context keys are unchanged. The DB name/schema stay unchanged. The larger vector network cannot silently load old dimensions. Snapshots include seven body poses/velocities, prior physical contact state, pending rollout, disturbance state, actor/critic/Adam/normalization/RNG state and curriculum.

New visitors and older lab-version visitors open the free biped by default. Existing learned pendulum data is not deleted. After selecting a structure in this version, its last-used choice is retained using configuration metadata. The existing confirmed all-learning reset still explicitly covers all structures and does not touch other MyDesk apps.

Comparison uses identical structure/physics/initial states and the same fixed impulse at the same time. Replay trajectories apply that impulse too, rather than showing an easier unpushed scene. Evaluation checks that network/Adam/RNG fingerprints remain unchanged. Display interpolation uses the seven actual body states and joint locations. The free biped has no independent pendulum ODE overlay; its trace is explicitly the actual pelvis angle.

## Verification

- Physics checks: all six joints connect dynamic bodies only, real mass, independent CoM free fall, real sole contact/penetration, and externally applied horizontal momentum. Free-fall reference is 0.0491 m over 0.1 s; measured approximately 0.0501 m. Impulse reference/measured horizontal momentum is 2 N·s.
- Unit tests cover 28-input/6-output gradients, shape rejection, distinct context keys, partial checkpoint state, achievement-vs-validation flags and actual PPO improvement to both banks. Existing physics, PPO, missions, records, 2-Link, calendar and navigation tests pass (eight test files).
- Browser test exercises contacts, free displacement after a push, all five physics checks, mid-learning restore, successful evaluation, at least two further PPO updates, pause/restart after success, policy comparison, legacy structure isolation and four Fold-style viewports.
- Old 2-Link browser learning, archive/migration/reset and render/cache recovery remain tested under the new default/continued-learning behavior. All 113 previous element IDs remain present.

Unrelated pending robotdog changes are not included. No backend or shared model data is changed. Walking, get-up and upper-body additions are future work.
