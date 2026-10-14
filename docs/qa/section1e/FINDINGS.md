# Section 1e: why she glitched, and what was done

Method, and its limit. The page runs at about 1.5 fps here (software GL, the whole city on screen), and a photograph of her box takes about 3 seconds, so a 60 fps recording is not possible on this machine: the frame diffs below catch a pixel that changes when nothing should (the reduced-motion pass), not a flicker at 60 fps. The cause was found from the counters and from isolating her in a page of her own (`stability-before.*`, `stability-after.*`, `tools/mayaStability.ts`, `tools/mayaPerf.ts`).

## The causes, which were real

| | Cause | Real? | Evidence |
|---|---|---|---|
| a | The layout observer on the whole container | **Real.** The main cause of the work, and of any stutter that came with it. | The map's name labels write their `class` on every frame: 480 writes in 16 frames (30 a frame; `DIV.map-label`, `locality rank-1`, `rank-2`), none of them in the observer's list of per-frame elements. So the observer fired on every frame (about 2 hits a second at 1.5 fps, one per frame), marked her layout dirty every time, and her layout (a read of every HUD rectangle, with its forced style and layout) ran about once a frame: **1.0 to 1.2 layouts a second at 1.5 fps, so 60 a second on a real display**, plus a layout every 250 ms regardless. After: **0 layouts a second while she is idle, and about 0.35 a second while a line is up, when something in the HUD actually changed (the HUD is looked at 2.5 times a second, and laid out only if it differs).** The observer now watches only the HUD elements her bubble must clear, one by one. |
| b | Hop and fade class toggling (remove, forced reflow, add) | Not real while she was docked. | 0 hop restarts a second in every state before the change. It ran only on a move of more than 60 px, and she is now never moved. The whole mechanism is removed. |
| c | The hair and body re-rastered by CSS animations on SVG children | **Real.** | The page of her alone, at 1920x1080: 48.3 fps with her animations, **60.2 fps with them switched off** (an empty page is 60). Every animated child of one 425-node SVG (the torso's breathing, the head's 0.6-unit nod, the blink) repainted the drawing every frame. The nod was a fraction of a pixel at her size and only shimmered; it is removed. The hair, legs, shirt and arms are now pictures drawn once, each its own compositor layer, and only a transform on a layer animates (the arms, the shirt's breathing). |
| d | `filter: drop-shadow` on the animated figure | **Real.** | The same page: 48.3 fps shipped, **53.0 fps with the filter removed**. A filter on a figure that animates is run again every frame. The shadow is baked into each picture; nothing is filtered live. |
| e | Pivots after the viewBox changed | Not a cause in Chromium: every pivot was in the crop's units (checked in Section 1c). Removed anyway. | The layers now turn about percentages of their own box, which hold in every browser (a unit test checks each against the art's pivot). This also takes away the Firefox and Safari risk of `transform-box: view-box` with a non-zero viewBox origin, for her body and arms. |
| f | Sub-pixel placement | **Real, a small part.** | Before: her box was 78.375 x 205.906 px (a tiered `calc()`), at an integer y. After: **54 x 142 px at 12, 926: whole pixels**, set by one fixed CSS rule (`left`/`bottom` from `--maya-home`), never written by script. The box is a whole number at every size (unit-tested; checked in the layout test at 105 cases). |
| g | The clip-path wrapper, `overflow: visible` clipping arms | Not real. | Every arm pose is inside her box (a test over every CSS rotation and shortening); nothing was clipped. The clip is gone with the single SVG. |

The reduced-motion pass (her animations off, so no pixel of her may change between photographs) found a change in her warning state **before** (1 of 1 photographs) and **none in any of the seven states after**.

## What changed

- She never moves. Her home is the bottom-left corner, `HOME_MARGIN` = 12 px in from both edges, by a CSS rule. `goTo`, `goHome`, the `anchor` field and every `anchor:` in a line, the `away` and `hopping` classes, the hop and fade animations and the `jump` state are deleted. A warning keeps its words and its camera glide, and no longer moves her.
- Her bubble is the only thing placed: beside her (right, else above), clear of the HUD, only when the page is resized or a HUD element it must clear changes. If something would cover her home, it moves: the street-map switch and credit now stand to her right (`--maya-reserve`).
- 30% smaller: `MAYA_SCALE` 0.45 to 0.315, the one constant. Her badge and minimise button keep a minimum size and her text stays at 12 px.
- Her figure is a stack of layers: 73 nodes (was 425), five pictures and two small SVGs (the face and the props).

## Legibility at her new size

At 1920x1080 she is 54 x 142 px; her face is about 17 x 24 px. Her face, hair, shirt, belt, boots, the binoculars (grey, with the blue lens rims) and her raised arm read. Her eyes, brows and mouth are single pixels: neutral, worried and alarmed read as different, but only just. The fingers do not read at all (the hands are about 6 px), and nor does the vial's cap. On a 2x screen (`maya-zoom-dpr2.png`) all of it is clear. See `maya-zoom-1920x1080.png`. **I did not change the scale.** If the face is too small to read, 0.45 (the size before) is one number.
