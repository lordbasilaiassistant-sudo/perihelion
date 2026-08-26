# ICV PERIHELION

Long-duration interstellar life-support simulation. You are sole crew of an
interstellar vehicle crossing from Earth to Proxima Centauri b. Keep the ship
alive: power, air, water, food, hull — and yourself.

Built with TypeScript + Three.js (WebGPU, WebGL2 fallback) + Rapier physics.
All simulation runs on a fixed 60Hz deterministic timestep with seeded RNG.

## Run

Double-click `PLAY.bat` (starts the server + opens the game), or:

```
npm install
npm run dev        # dev server, hot reload
npm run preview    # serves the production build (what PLAY.bat uses)
```

## The loop

- **06:00 wake** — checklist on TAB. Inspect scrubber, power, water.
- **MIRA** — your ship-intelligence drone follows you everywhere (even EVA).
  Press **E** on her to talk: greetings, live status commentary, mission lore,
  event reactions — spoken aloud (local Kokoro voice, no cloud) with typed
  subtitles. She reacts to repairs, harvests, workouts and crises.
- **Tend the garden** — plant / water / harvest lettuce racks (in the spin ring).
- **Exercise** — resistance treadmill or your muscles pay the bill.
- **Events roll all day** — filter clogs, power surges, micrometeorite strikes,
  hull punctures. Each one posts a repair task.
- **EVA** — don the suit at the locker (grab the toolkit first), cycle the
  airlock (close the outer hatch before re-pressurizing!), jet out, re-seat the
  damaged solar string.
- **Sleep** — at the bunk. Time skips to 06:00, autosaves, new checklist.

## Sound & atmosphere

- Generative ambient score (WebAudio): slow chord pads, echoing plucks, and a
  crisis layer that swells with ship alerts. Music ducks under MIRA's voice.
- All SFX are Kenney.nl CC0. Voices are generated locally by Kokoro-82M
  (`tools/gen-voices.mjs`) — no cloud, no keys.

## Physics notes

- Full Newtonian 6DOF in vacuum: momentum is conserved, inertia dampers can be
  toggled off with R (raw Newtonian mode).
- The habitat ring spins at ~9.5 RPM: ~0.5 g on the floor via radial gravity
  field. Loose objects feel it too. Coriolis is emergent (inertial simulation).
- The spoke shaft gravity ramps from 0 (hub) to full ring gravity — you fall
  outward onto the ring floor.
- Grab anything with LMB: force-spring to your hand, heavy things feel heavy.

## Debug systems

- **F3** — perf overlay: fps graph, frame breakdown, draw calls, sim state.
- **~** — console: `help`, `tp x y z`, `pos`, `spawn crate [mass]`,
  `give toolkit|filter|sealant`, `break wing|hull|filter|recycler|surge`,
  `fixall`, `time HH:MM`, `warp N`, `fov N`, `colliders`, `wireframe`, `god`,
  `save`, `day`, `face <anchor>`, `hover`, `garden-grow`, `suit`, `airlock`,
  `mira`.
- **V** — first/third person. **R** — inertia dampers. **LMB** — grab.
- Saves autosave on sleep + every 5 min (IndexedDB). `reset` wipes the save.

## Tests

```
npm test        # vitest — gravity fields, life-support sim, tasks, events, rng
npm run typecheck
```

## Credits

- Audio: Kenney.nl sci-fi sounds (CC0)
- Engine: three.js, Rapier, Vite, Vitest
