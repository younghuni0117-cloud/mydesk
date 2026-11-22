# Spot model provenance

Source: https://github.com/google-deepmind/mujoco_menagerie/tree/370c43965323c0944b433b202aac5058b5f907a9/boston_dynamics_spot

Pinned commit: `370c43965323c0944b433b202aac5058b5f907a9`

Original OBJ topology, coordinates and vertex normals are retained, converted by the proper rotation `(x,y,z) -> (x,z,-y)` and packed as Float32 positions/normals and Uint32 triangle indices, gzip-compressed. No mesh simplification, proportions edits or procedural replacement shapes. The arm is not imported. See SOURCE-spot.xml and LICENSE.

Browser physics uses the imported joint transforms/axes/ranges, COMs, masses and inertia tensors with MyDesk’s existing reduced articulated solver. Collision support points are sampled from the original collision hulls; this is not the MuJoCo solver or hardware identification. Motor gains/limits are simulation values.
