# Robot Evolution Lab — Phase 5a: 2-Link balance

## Implemented boundary

This update adds a **2-Link, 2-motor anchored robot** with actual coupled Planck rigid-body dynamics and an independent 6-observation / 2-action PPO. It is the first validated part of the multi-link phase. The 3-Link robot, free biped and humanoid remain unimplemented. The 2-Link mission selector currently supports balance only; recovery and Swing-up remain available on 1-Link. There is no implicit policy transfer, scripted motion, stabilizing PD controller or preloaded trained policy.

All 96 existing HTML IDs and prior controls remain present. The structure selector is above the observer. A compact second-joint readout, second manual torque slider, second-link initial pose fields and engineering specifications appear only for 2-Link. Settings expand with the page; they do not introduce an internal scrolling window. Fold cover, inner portrait and inner landscape sizes are checked for horizontal overflow. Some vertical scrolling remains so functionality is not removed to force it into a single screen.

## Physical model and units

Both links use the existing configurable length, mass and width. Defaults are **1 m, 1 kg and 0.06 m per link**: 2 m and 2 kg total. Gravity is 9.81 m/s². Each has a uniform rectangular-rod inertia `m*(L²+width²)/12` about its center. Each motor is bounded to ±6 N·m by default. Joint damping is 0.02 N·m·s/rad, evaluated using the base angular speed and the inter-link **relative** angular speed. The base motor acts on link 1; motor 2 applies equal and opposite torques to both bodies. It does not independently torque link 2 without reaction on link 1.

The base is fixed to the world. The inter-link revolute joint connects the upper endpoint of link 1 to the lower endpoint of link 2. Adjacent bodies do not collide with each other. No anatomical angle limits or motor/electrical dynamics are claimed. A static floor is present below the full downward reach, and the pedestal is scenery rather than a controller. Initial body linear velocities are generated from both angular velocities through forward kinematics.

Angles q1 and q2 are **absolute clockwise angles from vertical upright**. The inter-link joint angle is q2−q1. Independent generalized torques are Q1 = τbase−τmiddle and Q2 = τmiddle. The independent Lagrange equation uses

`M = [[I + m*r² + m*L², m*L*r*cos(q1-q2)], [m*L*r*cos(q1-q2), I + m*r²]]`

and Coriolis terms `[m*L*r*sin(q1-q2)*w2², -m*L*r*sin(q1-q2)*w1²]`, with both gravity moments and relative-joint damping. RK4 is implemented independently of Planck; no RK4 result feeds the controller or physical state.

At the ±5° balance evaluation range, static base gravity torque is at most approximately 1.71 N·m and middle torque approximately 0.43 N·m. Default ±6 N·m actuators therefore have useful authority for this small-angle task. At horizontal extension the base gravity moment can reach 19.62 N·m, so these defaults do **not** demonstrate static holding at all angles or 2-Link Swing-up. Such missions require separate design and validation.

The control/physics interval remains configurable, default 1/120 s with 8 substeps (1/960 s). The policy acts every 4 control steps (30 Hz by default). Render interpolation is separate from physics and changes only the displayed frame.

## Actual PPO

`evolution-vector-ppo.mjs` implements a 24-unit shared tanh hidden layer, two continuous tanh-Gaussian output heads and a separate scalar critic. The observation is `[sin(q1), cos(q1), w1/6, sin(q2), cos(q2), w2/6]`, calculated from actual physical state. Actions are two normalized motor torques. Joint log probability is the **sum** of both squashed-Gaussian log probabilities. GAE, truncation bootstrap, PPO clipping, summed entropy, critic loss, exact backpropagation and independent Adam states are used. Both output heads and their shared hidden gradients are finite-difference tested.

Defaults: rollout 1024; learning rate 0.0007; value learning rate 0.002; clip 0.2; entropy weight 0.002; 8 epochs; minibatch 64; gamma 0.99; lambda 0.95. These are newly initialized weights for this robot. The original scalar PPO implementation and its old checkpoint shape are retained; architecture mismatches are rejected in both directions.

Training reward is `1 − 4*(q1_error²+q2_error²) − 0.05*(w1²+w2²) − 0.005*(a1²+a2²) − 5_if_failure`. Episode failure occurs if either link exceeds 0.35 rad. A six-second timeout is a truncation and bootstraps the value. Curriculum starts with independently randomized angles within ±3° and speeds ±0.05 rad/s; a separate successful probe expands these to ±5° and ±0.075 rad/s. There is no deterministic coordination between joints.

## Success and fair comparison

The final fixed primary and disjoint confirmation banks each have 12 independently generated two-angle initial conditions, with absolute initial angles of 1–5° and angular speeds ±0.075 rad/s. They remain fixed while curriculum changes. Both links must remain within 12°, the combined angle RMS must be ≤4°, each final angle ≤3° and each final speed ≤0.3 rad/s over 8 seconds. All 24 conditions must pass before automatic success stop. Training reward alone does not determine success.

The existing policy archive/trajectory comparison now dispatches to the selected model and policy architecture. Both-link trajectories are generated through actual simulation, then replayed with both joint angles interpolated. The two evaluation banks never update weights, Adam state or random generators. Comparison remains restricted to an identical physical/structure context.

## Storage compatibility

The database remains `mydesk.evolution.v1`, schema 2. Existing **1-Link context keys remain byte-for-byte identical**. New 2-Link keys add the `two-link-v1` structure marker. Checkpoint verification instantiates the appropriate network architecture. Both-link snapshots include second-link angle/speed, pending two-action rollout, actor/critic/Adam/normalization/RNG state and curriculum. Old 1-Link snapshots and schema-1 migration remain tested. Reset explicitly covers all structures, missions and parameter contexts only in Robot Evolution Lab; it does not touch the original robot, calendar or other MyDesk databases.

## Validation results

Independent physical benchmark (1 second, initial angles 0.3/−0.2 rad, nonzero initial angular speeds and applied torques):

- 1/60 → 1/240 s refinement reduces maximum angle error from about 0.06243 to 0.01639 rad (fine error ≈0.939°).
- Fine relative energy residual ≈1.433%; maximum joint separation ≈0.0477 mm, below a declared 0.1 mm constraint tolerance. The finite solver is not claimed to be an exact ODE solution.
- Mass/inertia, motor-2 action/reaction, gravity coupling, timestep convergence and energy/constraint checks pass.

Actual seeded browser PPO improves from 0% to **100% on both 12-case banks** after 28 updates / 28,672 environment steps in the tested default run. Intermediate save/reload preserves its network fingerprint. This is a measured default benchmark, not a guarantee for arbitrary user parameter sets or hardware.

Unit coverage includes physical validation, exact vector-network gradients, joint log probability, scalar/vector shape rejection, structure-isolated keys, partial-rollout restoration and actual training/evaluation. Browser coverage exercises motor 2, all five physical checks, learning/success stop, reaccess, side-by-side comparison, switching back to the unchanged 1-Link missions and four Fold-style viewports.

Existing 1-Link physics/PPO/mission/record tests and calendar/navigation unit regressions pass. Existing browser mission regressions still pass recovery (44 updates) and Swing-up (52 updates). The archive/migration/long-history/reset regression also passes with the new dispatcher. Pending robotdog edits are excluded from this change.

## Files and next steps

New: `evolution-two-core.mjs`, `evolution-vector-ppo.mjs`, `evolution-two-training.mjs`, `evolution-model.mjs`, `evolution-engine.mjs`, `evolution-two-view.mjs`, the dedicated unit/browser tests and this report.

Updated: observer UI, renderer dispatch, worker dispatch, comparison dispatch, storage architecture verification/context keys, dependency cache tags and prior test phase assertions.

Next: independently validate a 3-Link model and appropriately sized new policy, or separately design 2-Link recovery/Swing-up. Neither is presented as already implemented.
