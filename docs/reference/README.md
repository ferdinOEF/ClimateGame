# Reference material

`hazard_vfx_prototype.html` is the reference mock-up for the hazard visuals: a
2D canvas preview of the Cyclone, Flood and Cyclone + flood finale
animations on hex tiles, supplied with the hazard-visuals brief. The game
matches its timing, colours and behaviour, not its code.

**How it arrived.** It reached the session part-way through:
- The first phases (the Maya layout, roads, and the depth model) were built
  from the brief's written description.
- The storm script was then re-timed to the prototype.

**What the game takes from it:**
- **Cyclone (about 26 s):**
  - a calm, approach (4 s), landfall (10 s) and recede (18 s) phase;
  - the surge rises from 8 s to its peak at 16 s and is gone by 24 s;
  - the spiral drifts in over 2–18 s, then a little inland, fading;
  - lightning only while the storm is above 70%, one strike every 2.5–5.5 s;
  - shake only above 70%;
  - darkness up to about 35%.
- **Flood (about 38 s):**
  - rain from 4 s;
  - the swell starts upstream at 8 s and travels down at 0.8 s a tile
    (shortened on Panaji's longer channel), rising over about 6–8 s, with a
    pale crest at its front;
  - dark-blue overflow with white flecks; no brown;
  - khazans fill teal.
- **Finale (about 40 s):**
  - storm and rain from 4 s, the pincer at 12 s, recede at 29 s;
  - the backwater is surge × 0.28 × (riverIndex / mouthIndex)^1.6;
  - surge water is light turquoise-blue (#3c96c8), river overflow dark navy
    (#123e7d), and the two together indigo (#5846a0).
- **Maya's lines.** One for each phase, adapted from its script.

**Where the game differs, and why:**
- **The depth on land is the resolver's, not the prototype's formula.** The
  water on a tile is exactly what decided whether its house fell
  (`core/hazard.ts`).
- **The swell's step is shortened.** Panaji's channel is 29 tiles, against
  the prototype's 11, so the whole trip stays under about 9 s.
- **The draw-back before landfall is the brief's, not the prototype's** (the
  prototype has none). It is limited to the shallows within two tiles of land.

The earlier `docs/design/khazan_hazard_prototype.html` is a different, older
khazan flood demo.
