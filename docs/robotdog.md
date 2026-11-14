# Q-02: Spot-style 3D quadruped with arm

Page: `robotdog.html`. This remains an independent experiment: no existing biped/swing physics, policy, reward or learner is imported. Site navigation and the pinned Three.js vendor module are shared infrastructure.

## Reference and mechanism

The user supplied Spot photographs and explicitly requested an upper arm. The procedural model now follows the long, low yellow chassis, continuous black sensor stripe, rounded yellow upper legs, thin open black lower links, recessed motor housings and folded yellow/black arm. It is an approximation based on those pictures, not an official CAD asset or validated hardware replica. No proprietary model files, textures or logos were downloaded.

The four legs retain 3 independently actuated axes each: abduction/adduction, hip pitch, knee flexion. Experimental dimensions are a body of 88 × 30 × 22 cm, 40/41 cm upper/lower links, 6.5 cm lateral hip offsets and 3.2 cm contact radius. Leg limits are ±0.8, −1.75..1.4, and 0.08..2.8 radians. Simulation torque caps are 55/85/85 N·m; these are model settings, not a claim about the manufacturer's motor ratings.

The upper arm has six axes (base yaw, shoulder pitch, elbow flexion, elbow roll, wrist pitch, wrist roll) and a separate gripper. Its links are 42/36/23 cm followed by the tool. Fold/reach/raise presets and seven sliders set **manual** targets. The leg policy still outputs only 12 leg targets. Arm movement is displayed continuously; the arm's 8 kg configuration-dependent mass center changes body gravity moments and diagonal inertia. Chassis mass is modeled as 32.7 kg, giving 40.7 kg with the arm. The arm does not learn grasping and has no object/contact manipulation solver in this iteration.

## Physical terrain and lightweight dynamics

`robotdog-terrain.mjs` supplies the same analytic height and normal to display, foot contact and chassis contact:

- `flat`: level experiment floor;
- `hills`: continuous hills and transverse slope;
- `rough`: superposed continuous bumps.

The displayed terrain is a 96 × 64 height-field patch; it shifts around a moving robot without changing the camera's orbit or zoom. Contacts resolve along the actual ground normal with tangent friction. Spawn height/orientation avoid placing feet inside the selected terrain. Body height rewards and failure thresholds are measured above local ground, not global Y. Four underbody points approximate chassis collision.

The physics runs at a fixed 120 Hz: floating-body translation/rotation, bounded PD-driven joint dynamics, analytic foot Jacobians, compliant contact, gravity and friction. Arm FK is cached when it is stationary. This is still a reduced interactive model, not a full rigid-body-tree/inverse-dynamics or certified hardware simulator. There is no predefined gait, translation animation or injected propulsive force. Assembly pose and manual arm movement are explicitly separated from learning results.

## Frame rate and graphic cost

Display scheduling changes from a 30 fps cap to a **60 fps target**, with physics independent of rendering. Material batching halves measured draw calls (156 → 78) even after adding the arm and non-flat floor. Initial scene: 23,412 triangles and 68 cached geometries. Pixel ratio remains capped at 1.5; AA is requested only on larger fine-pointer devices. Static scenes do not continually redraw. No shadow maps, postprocessing, runtime CDN loads, environment maps or large image textures are used. Pose/FK updates occur at draw time instead of every high-refresh RAF. Actual displayed frame rate depends on the browser/device.

Horizontal orbit direction is reversed for mouse and one-finger touch. Right-button pan, wheel zoom, pinch zoom and camera presets remain available.

## Learning and persistence

A 40-input, 8-hidden, 12-output tanh leg policy (436 weights) uses body state, joint states, four contacts and the velocity command. The velocity setting is accepted throughout UI, worker, physics and evaluation up to **10 m/s**; it is a command range, not a guarantee that the mechanism reaches it.

Independent CEM still samples eight candidates, selects two elites and adopts a candidate only after improvement on the same two held-out seeds. Both rollout and validation receive the selected terrain and manual arm pose. Rewards measure upright local-ground height, velocity tracking and real forward progress; falls, side slip, yaw, excessive motion and effort have costs. Stationary goals get no forward-progress bonus. Worker yielding and approximately 4 Hz graph updates remain in place. Training scenes interpolate recorded physics; model execution uses real fixed-step dynamics.

`mydesk.robotdog.v1` is retained. Old weights, attempt totals and history survive loading. `rigVersion: 2` and a context key distinguish new records by body version, target, terrain, episode duration and arm targets, preventing incompatible rewards from being joined into one graph. A changed mechanism requires re-evaluation; previous scores are not presented as new results. There is no cloud model upload. Reset asks for confirmation, preserves the chosen environment and affects only this experiment. Biped, calendar, blogs and menu data are unaffected by this update.

## Navigation

The existing shared `robotdog` item immediately follows `robot`. The already-visible swing link is explicitly stored after it for compatibility with old navigation code. The original menu-item fingerprint, excluding those two entries, remains `9a9c39c3e90d5debd57bd036c2488b62`. This iteration makes no menu/database changes.

## Verification

- `node --test tests/robotdog.test.mjs tests/navigation.test.mjs`: 12 bounded leg joints, link lengths, transforms, analytic Jacobians, gravity/contact/torque limits, finite seeded episodes, policy search/held-out improvement, terrain slopes/normals vs finite differences, distinct physical terrain responses, arm reach/limits/mass moment, 10 m/s command propagation, old-cache weights/count/history preservation and isolation from existing apps.
- `scripts/verify-robotdog.cjs`: actual WebGL and worker, arm and gripper control, three terrains, camera reversal and retained zoom/orbit, 60 fps configuration and reduced draw budget, 100 real trials at the 10 m/s command, graphs, reload persistence, separate device, confirmed reset, existing-robot sentinel preservation, four viewports and drawer behavior. Shared REST APIs are mocked to avoid writes to unrelated live data.
