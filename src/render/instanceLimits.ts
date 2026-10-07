/**
 * How many instances each pooled `InstancedMesh` can hold.
 *
 * Its own module, with no `three` import, for one reason: the offline map
 * generator has to check these numbers, and `tools/mapgen/buildCityMaps.ts`
 * should not have to load the renderer to find out what they are. Two copies
 * of a cap that must agree is exactly the kind of thing that drifts and then
 * fails as a dropped tile nobody can account for.
 *
 * WHY THESE NUMBERS
 *
 * An `InstancedMesh` allocates its buffers up front, so the cap is a real
 * memory decision rather than a guard value — but a cheap one. Each slot is a
 * 4x4 matrix and an RGB triple, so 64 bytes plus 12; a thousand slots across
 * five terrain types is well under a megabyte. The caps are therefore set
 * comfortably above the largest authored map rather than snugly around it,
 * because the failure mode of being too small is far worse than the cost of
 * being too large.
 *
 * The campaign's biggest board is Panaji at 743 tiles, whose largest single
 * terrain class is 457 land tiles. Both caps below are set above that, with
 * room for a board half as large again.
 *
 * `tests/levels.test.ts` checks every shipped map against these, so a new
 * board that outgrows them fails the suite rather than the player's session.
 */

/** Per terrain type, per map. Checked by the generator and enforced in `TerrainMeshManager.loadMap`. */
export const MAX_TERRAIN_INSTANCES_PER_TYPE = 800;

/**
 * Per element type.
 *
 * Has to exceed the count of any single terrain class, because a player can
 * legitimately fill every valid tile with one element — 457 Houses on Panaji's
 * land, or 155 Breakwaters on its open water. It also absorbs the slot churn
 * `ElementMeshManager` documents: a destroyed instance's slot is reused, but a
 * rebuild-and-breach cycle can still walk the index upward.
 *
 * This was 400, which was comfortably above every board in the campaign until
 * Panaji grew to 457 land tiles. Exceeding it throws, and the throw happens
 * inside session setup, so the symptom was the game hanging on the loading
 * splash rather than anything that pointed at a full buffer. The cap is now
 * sized off the real maximum rather than off the largest board that happened
 * to exist when it was written.
 */
export const MAX_ELEMENT_INSTANCES_PER_TYPE = 700;

/**
 * Hazard overlay tiles live at once, damage reveals and severity previews
 * together.
 *
 * This one is sized against the whole board rather than one terrain class,
 * because a severe storm can damage most of a map at once while a preview is
 * also showing. Running out here is not a crash — `HazardOverlayManager`
 * silently stops drawing — which is worse in a way, because the player simply
 * cannot see where the water got through and has no reason to suspect the
 * display rather than their own defences.
 */
export const MAX_HAZARD_OVERLAY_INSTANCES = 1000;
