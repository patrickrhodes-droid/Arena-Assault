# Arena Assault — Claude Instructions

## Git workflow

After completing any set of changes, always commit and push to the remote repository (GitHub). Do not wait to be asked.

- Stage all modified files with `git add -A`
- Write a concise but descriptive commit message summarising what changed and why
- Include the co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Push immediately after committing: `git push`

If a push fails (e.g. remote has diverged), pull with rebase first, resolve any conflicts, then push.

## Project overview

Arena Assault is a multiplayer 3D browser shooter built with Three.js on the client and Node.js + Socket.IO on the server. Key files:

- `server.js` — authoritative game server (enemy AI, damage validation, XP, weapon drops)
- `public/src/main.js` — game loop and top-level wiring
- `public/src/config.js` / `public/src/gameConstants.js` — shared constants imported by both client and server
- `public/src/combat.js` — bullet physics, hit detection, particles
- `public/src/player.js` — local player input, movement, firing
- `public/src/enemies.js` — enemy AI (soldiers, dogs, boss, miniboss)
- `public/src/scene.js` — Three.js scene setup, character heads, weapon models, HDR skies
- `public/src/mapLoader.js` — JSON map loading and procedural lighting
- `public/src/audio.js` — Web Audio synthesis + file-based SFX
- `public/src/ui.js` — HUD, kill feed, XP screen, lobby screens
- `public/src/network.js` — Socket.IO client event handlers
- `public/src/story.js` — campaign cutscenes and character select
- `public/src/features.js` — multi-kill announcer, career stats
- `public/maps/*.json` — map definitions (arena, desert, city, blacksite)

## Conventions

- Weapons are defined in `WEAPON_DEFS` (config.js) and ordered in `WEAPON_ORDER` (gameConstants.js) — both client and server import from gameConstants.js so changes propagate to both.
- Boss damage multipliers live in `server.js` inside the `bulletHit` handler.
- HDR sky textures are preloaded at startup via `preloadHDRSkies()` in scene.js and applied from cache.
- All character head GLBs live in `public/assets/models/` — add to `characterHeadDefs` in scene.js to register.
- The ground plane is 4000×4000 units so the skybox isn't visible below walls when jumping.
