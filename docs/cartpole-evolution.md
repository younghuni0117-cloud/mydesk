# Cart-Pole Evolution Lab

The original cart-pole and its storage are independent. The rebuilt lab uses the
`mydesk.cartpole-evolution.v4.*` keys for training data. Previous results stay
under their original keys because link geometry and success criteria changed.

The rail constrains the 1 kg cart to translation. Planck rigid bodies use
uniform rectangular rods (width 0.022 m) with equal lengths of 0.65 m.
Successive masses are 0.12, 0.09, 0.07, 0.05 and
0.04 kg. Each rod's inertia about its center is
`mass * (length² + width²) / 12`. Passive revolute joints apply relative damping
of 0.001 N·m·s/rad. The only learned action is a bounded cart force of ±10 N.
Bodies share a 2D projection of separate hardware planes, so fixtures do not
self-collide. Four 5 ms physics steps are executed per 20 ms action.

Each level owns a separate 32-hidden-unit Actor-Critic policy. Inputs are
normalized cart position and velocity, plus sin, cos and scaled angular
velocity for each rod's absolute angle. The Worker gathers 1,536 or more
transitions from up to five worlds per PPO update. GAE is calculated with
separate streams and bootstraps time limits. The policy uses the existing MyDesk
tanh-Gaussian PPO implementation with clipped objective, entropy, value loss
and Adam. Episode duration is 25–60 simulation seconds, with a default of 30.

The deterministic evaluation uses eight fixed, near-down initial poses and
40 seconds per trial. All links must remain within ±10° of vertical for at least
20 consecutive seconds while the cart stays within ±2.4 m. Seven passes unlock
the next level. Automatic evaluation runs every five PPO updates and at the end
of a training batch. The latest completed policy, optimizer and metrics are
saved locally. Reload starts paused at a fresh rollout and does not carry over
unfinished physics episodes. Per-level reset retains one recoverable checkpoint.

Physical and integration tests:

```sh
node --test --test-isolation=none tests/cartpole-evolution.test.mjs
```

Under the previous 5-second hold criterion, Level 1
passed 8/8 fixed trials at update 750 with seed 8123 and at update 800 with seed
791 (sampled checkpoints). These runs started from randomized network weights
and near-down poses. Level 2 did not pass in the tested 1,000-update run. Series
lengths through Level 5 have validated numerical dynamics. Swing-up convergence
at higher levels remains unverified.

This GitHub Pages build uses browser-local storage and CPU execution.

Training runs independently of the view and stops after the requested number of
additional completed episodes. The last partial rollout is updated before saving.
The canvas runs a separate Planck world at normal speed, interpolating each
display frame between 20 ms policy steps. Training observation uses a frozen copy
of the newest completed policy at the beginning of each displayed episode.
Explicit model execution holds the selected snapshot and disables exploration.
The full rail stays fixed on screen. The model uses a fixed local drawing scale
in portrait and landscape.
