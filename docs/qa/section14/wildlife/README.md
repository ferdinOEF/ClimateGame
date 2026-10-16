# Section 14 — wildlife module

Calm-year ambience: a common kingfisher, an egret and a smooth-coated otter
from mangrove tiles; small fish and prawns jumping in khazan ponds. Ambience
only — no text, no labels, no claims. Code: `src/render/wildlife/`
(self-contained; not yet wired into the game — the integrator does that).

## Triangle counts

From `tests/wildlife.test.ts` (it prints them) and `WildlifeDirector.triangleCounts`:

| Model | Triangles | Notes |
|---|---|---|
| Kingfisher | 2,816 | body, head, neck, bill, eyes, tail, 2 legs, 2 wings (arm + hand + 6 primaries each) |
| Egret | 2,988 | body, S-neck tube (re-shaped per frame), head, bill, eyes, tail, 2 IK legs with toes, 2 wings |
| Otter | 1,348 | body, head, ears, eyes, tail, 4 short legs |
| Fish | 624 | one merged mesh (body, forked tail, dorsal fin) |
| Prawn | 1,370 | one merged mesh (segmented curled body, fan tail, rostrum, eyes, antennae, legs) |
| Fish in the kingfisher's bill | 624 | same fish geometry |
| Perch twig | 112 | |

Splashes: pooled rings (6) and droplets (one 40-instance InstancedMesh).

## The models

All are built procedurally from swept sections (`kit.ts`: an ellipse swept
along a body, an aerofoil swept along a wing, a thin lens along a feather, a
circle along a bone), smooth-shaded, vertex-coloured, `MeshStandardMaterial`
lit by the scene's own lights. No textures, no sprites.

- **Kingfisher** (colours from `docs/design/birds/common-kingfisher.svg`): big
  head with fine pale-blue barring on the crown; long straight black dagger
  bill (≈ 2× head radius, asserted in the test); orange patch from the lores
  through below and behind the eye; white neck-side patch; white throat;
  orange underparts; darker-blue wings with pale flecks; bright cyan stripe
  down the back; short blue tail; small red-orange feet.
  Rig: body → neck → head (bill, eyes, fish); tail; legs; wings with a
  shoulder hinge, a wrist fold and six separate primaries.
- **Egret** (colours from `docs/design/birds/egret.svg`): white with faint grey
  shading; long S-neck (one tube re-shaped along a curve every frame); small
  head; orange-yellow dagger bill; yellow eye; long black legs whose visible
  joint bends backward (two-bone IK, asserted in the test); black feet.
- **Otter**: brown, pale throat and cheeks, broad flat head, small ears,
  thick tapering tail.
- **Fish**: small, silver, countershaded. **Prawn**: pale, curled, banded, fan tail, long antennae.

## The moments

At most one at a time, the next one 6–10 s after the last ended, chosen at
random among the kinds whose source is on screen and clear of every avoid
rect.

- **Kingfisher** (mangrove): appears on a bare twig at the tile's
  camera-facing edge; head turns now and then, quick bobs, tail flicks.
  Dives head first, wings tucked → splash ring + droplets → under for half a
  second → bursts out with a small silver fish in its bill → flies up and
  towards the camera with fast shallow beats and short glides, banking into
  the turn. The twig fades once it has left.
- **Egret** (mangrove): wades slowly along the near edge — 3–4 steps, each
  with the foot lifted on a backward-bending joint (IK keeps planted feet
  still), the neck pulling back then thrusting forward, a small body bob.
  Then a crouch and push, wings opening into slow deep beats, legs swinging
  back to trail straight behind, the neck folding into the flight S — and it
  flies towards the camera.
- **Otter** (mangrove water): surfaces with a ring, raises its head and looks
  around, then dives (back rolls over, tail last) with a ring and droplets.
- **Fish / prawns** (khazan): 1–2 fish or 1–3 prawns jump in arcs with a
  splash ring and droplets where they leave and re-enter. Launch points lie
  within 60 % of the pond radius and landings within it (asserted over 120
  moments), so they never come from the paddy half.

**Flight towards the camera**: a cubic Bézier re-anchored to the camera every
frame (panning mid-flight still ends in front of the lens), approaching from
the side so the bird is seen three-quarter, banked from its heading's rate of
change. True perspective growth plus a slight extra scale-up (up to +30 %).
The climb is mostly kept out of the body's pitch, so the player sees the
bird's back and spread wings, not its belly. It fades out at 1.4×–1.03× the
end distance, far in front of the near plane. The end point is chosen on the
side of the screen clear of the avoid rects; if the bird's projected bounds
would still enter one, it fades out in ~0.25 s and the moment ends. The same
check fades a perched or wading bird if a rect comes over it.

**Blob shadow**: a soft vertex-alpha disc on the water under each bird,
shown only while the bird is within ~0.55 world units of the surface.

**Storms** (`setCalm(false)`): any bird out flushes — fast beats, up and away
from the camera, fading within 1.1–1.5 s; with no bird out, a kingfisher and
an egret burst from an on-screen mangrove instead; the otter dives at once;
nothing new starts until `setCalm(true)`.

## API

```ts
import { WildlifeDirector } from "@render/wildlife";

const wildlife = new WildlifeDirector({
  scene, camera,
  viewport: () => ({ width: canvas.clientWidth, height: canvas.clientHeight }),
  avoidRects: () => [mayaRect, ...hudRects, ...openCardRects], // canvas-relative CSS px
  // random?: () => number   (seedable, for tests)
});
wildlife.setSources({
  mangroves:   [{ x, y, z }],          // tile centre; y = the water surface there
  khazanPonds: [{ x, y, z, radius }],  // centre + radius of the POND (blue) half only
});
wildlife.setEnabled(quality !== "low" && !reducedMotion); // false hides everything
wildlife.setCalm(!storm && !resultCard);                   // false flushes, then nothing
wildlife.tick(performance.now());                          // every frame
wildlife.forceMoment("kingfisher" | "egret" | "otter" | "fish" | "prawn", sourceIndex?); // QA
wildlife.triangleCounts;                                   // per model
wildlife.dispose();
```

`busy`, `current` and `momentLog` are there for QA and tests.

## Performance

Everything is created once; `tick()` rewrites transforms, opacities and the
egret's neck vertices through preallocated scratch objects (no `new` in the
hot path). Measured in Node: ~7 µs a tick during a kingfisher moment, ~26 µs
during an egret moment (the neck re-shape), ~1 µs otherwise. The internal
clock advances at most 50 ms a frame, so a background tab never
fast-forwards a moment. About 25–30 draw calls while a bird is on screen
(each bird part and primary is its own mesh), none when idle.

## Review tools

- `tools/wildlifePreview.html` (Vite: `/tools/wildlifePreview.html`): model
  close-ups on a neutral background with the game's sun and hemisphere light,
  and a mock board (water, a mangrove tile, a khazan tile, the game's 58°
  camera at distance 9) running the real director in fake time.
- `npx tsx tools/wildlifeShots.ts [prefix]`: writes the JPEGs in this folder —
  each model close-up, and frames of each moment picked from the moment's own
  timeline (plus a `-crop` close-up of each, since at the game's zoom the
  animals are small until a bird approaches the camera).

## Limitations (candid)

- Rendered here with Chromium's software GL only; no real-GPU frame rates,
  no Firefox/WebKit.
- The mock board is not the game board: the integrator must check the real
  mangrove tile (where the twig, the wading egret and the otter sit relative
  to the canopy and roots) and that a source's `y` is the water surface.
  The dive, the wading feet and the otter rely on the tile's own top surface
  hiding whatever is below the water; nothing clips them otherwise.
- At the game's zoom the perched kingfisher (~0.15 units) and the fish
  (~0.12) are a few pixels until a bird flies towards the camera — by design
  ("small, realistic"), but the jumps read mostly as splash rings.
- The models are procedural and stylised-realistic, not sculpted: the
  kingfisher's folded wing is a little blocky at the shoulder, the egret's
  flight wing shows a small step at the wrist, and the otter is simple
  (it is mostly seen as a head and back at the waterline).
- Fading uses material opacity with depth writes on; for the brief fade a
  bird's own overlapping parts can show sorting artefacts.
