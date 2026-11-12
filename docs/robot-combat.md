# Robot combat model v10

One 141-input / 24-hidden / 36-output PPO actor covers balance, recovery, walk,
punch, kick, defense and fighting. Obstacle clearance and running are retired.
The former running observation slot remains zero so existing learned weights and
other skills retain their meaning; retired attempt counts remain historical metadata. Targets,
velocities and limited residual torques feed the same bounded PD actuators.
There are no attack/guard/get-up animations or scripted robot joint sequences.

Combat uses two 13-body, 12-joint actors in one Planck solver. Their negative
collision groups are distinct, so opponents collide; projected limbs of the
same actor do not self-collide. The right actor is physically mirrored, including
joint limits, local foot shapes, motor torque signs and canonical observations.
The opponent is observed through 32 virtual state features; these are not a
camera reconstruction or an occlusion model. Terrain sensors remain intact.

Combat bodies are bullets. Physics uses twelve substeps per 1/60-second tick,
with joint angle limits, bounded torque and a torque/speed envelope. Learned
target rates can reach 1,440 degrees/s; combat actuator no-load limit is 24rad/s.
Only hand-region forearm contacts and foot contacts qualify as robot strikes.
Closing velocity is sampled before solving; normal impulse is read after solving.
Damage depends on both and on the struck region, capped at 30 per impact.
A limb/target cooldown prevents one continuing contact from scoring repeatedly.
Actual solver impulses provide recoil; the hit effect adds no force.

Health starts at 100. Health exhaustion ends the match immediately. A persistent
low pelvis/body-ground contact starts a down count. Each count is exactly two
simulation seconds, independent of the drawing rate; count ten ends the match.
One second of stable foot-supported standing clears it. There is no invulnerability,
automatic separation or attack prohibition during a down. Both failures draw;
a time limit uses remaining health plus a small effective-damage tie breaker.

Bag/limited drills use a physical pendulum, with randomized environmental
impulses for the moving-target drill. Sparring restricts one opponent arm and
reduces leg action range, without prescribing motion. Self-play samples the
champion and up to three previous champions as frozen training opponents.
Observation/match execution always uses identical current weights and physical
conditions on both sides; skins only affect drawing. Official combat validation
uses fixed seeds, drill types and a zero-policy baseline opponent, so it is a
repeatable baseline rather than proof of strength against all trained policies.
Future evaluation can add a frozen trained-opponent benchmark set.

The authorized reset uses model version 10 / physics 7 / reward 11 and 4,524
weights. Browser v9 caches are retired. The shared row constraint rejects old
clients; blog, calendar, menus, credentials and permissions are untouched.

Validation: `node tests/robot-combat70.test.mjs`, existing control/terrain/recovery/
PPO regression tests, and `scripts/verify-robot-combat.cjs` (all REST writes mocked).
`seed-robot-combat.mjs` generates a zero-attempt model; it performs no network writes.
