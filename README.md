# ⚡ Conduct2Shock

A comic, low-poly arena game. Get your rivals wet, stick lightning rods on them, and let the storm pick the best conductor.

## How it plays

- Getting people **wet** or sticking **🔩 lightning rods** on them raises their **⚡ conductance**, shown above every head and on
  the scoreboard. Metal umbrellas and decoy ducks count too.
- Every ~20 seconds a **storm** rolls in: an angry thundercloud swoops over the top conductor, a 5-second countdown runs, and
  lightning strikes whoever (or whatever) conducts best. Ties are random; if everybody is bone dry it picks someone at random.
  The bolt chains to wet people standing close by.
- Electric weapons do damage that scales with the target's conductance. Zapping a dry person is a fizzle; zapping a soaked one
  with three rods on them is a K.O.
- Hold **R** to shake yourself dry like a wet dog (it also flings rods off). Stepping in the fountain or the ocean soaks you instantly.
- 3-minute match, most K.O.s wins. Everyone respawns after a few seconds.

### The arsenal

| Key | Item | What it does |
| --- | --- | --- |
| 1 | 🎈 Water Balloon | Throw. Soaks on splash, splashes neighbours. |
| 2 | 🔩 Lightning Rod | Throw. Clanks on and sticks for ~14s, +18% each (max 3). |
| 3 | 🔫 Taser | Close range. Damage × conductance. |
| 4 | 🐍 Electric Eel | Throw. Slaps for damage × conductance, then flops around. |
| 5 | 💦 Super Soaker | Hold. A steady stream of wet. |
| 6 | 🪣 Bucket Dump | Melee. Drenches everyone in front of you. |
| 7 | 🌩️ Pocket Storm | Throw. A grumpy mini cloud that zaps the best conductor near it after 2s (that can be you). |
| 8 | 🦆 Decoy Duck | Place. A rubber duck wearing a rod: 70% conductance, so the storm may fry it instead of you. |
| 9 | ☂️ Metal Umbrella | Hold. Blocks thrown stuff… but it's metal, so +30% conductance while open. |
| 0 | 🚿 Sprinkler | Throw. Waters an area for 7 seconds. |

Controls: **WASD** move · **mouse** aim · **click** use / hold · **1–0** or **scroll** switch · **Space** / right-click dash ·
**R** shake · **M** mute.

### Comic bits

Getting zapped strobes you between a blinding-yellow negative and an x-ray that shows your skeleton (jaw chattering, hair standing
on end, starfish pose); a storm strike makes the skeleton jump clean out of your body and flail before hopping back in, then leaves
you charred and smoking with a frizzed afro. Soaked characters turn blue, hug themselves, shiver, drip and mutter "brrr".
K.O.s send the hat flying with X-eyes, tongue out and stars circling. Bots taunt, panic ("MOMMY!") when they're the top conductor,
and drop a decoy duck and run when the storm comes for them.

Everything is built in code: low-poly models are three.js primitives with toon shading and ink outlines, animation is procedural,
and all sound effects and music are synthesized with the Web Audio API.

## Development

```sh
bun install
bun run dev
```

`bun run build` makes the production bundle. The game lives in `src/game/` (engine, models, effects, audio) and
`src/components/Game.tsx` (menu and HUD). In the browser console `window.__c2s` is the engine (`__c2s.stormIn = 1` summons a storm).

This project is connected to [Lovable](https://lovable.dev/projects/284897c7-48f3-491e-9550-90c592771e73); pushes to `main` sync back into the editor.
