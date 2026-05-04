# Arena Assault — Map Editor Workflow

## Overview

Maps are stored as JSON files in `public/maps/`. Both the game and the editor read from the same files, so saving in the editor immediately affects gameplay on next map load.

| Server | Command | URL |
|--------|---------|-----|
| Game | `npm start` | `localhost:3001` |
| Editor | `npm run editor` | `localhost:3002` |

---

## Starting the editor

```bash
npm run editor
```

Open `http://localhost:3002` in a browser. The game server does **not** need to be running to use the editor.

---

## Loading a map

1. Pick a map from the top-left dropdown (`arena`, `desert`, `city`, `blacksite`, `sandbox`).
2. Click **Load**.

The 3D viewport resets to that map's objects. The **Map** text field shows the current name.

---

## Navigating the viewport

| Action | Input |
|--------|-------|
| Orbit | Left-drag |
| Pan | Right-drag / Middle-drag |
| Zoom | Scroll wheel |
| Select object | Click it in the viewport or in the object list |

---

## Selecting and transforming objects

Click any object in the viewport or the **Objects** list on the left to select it.

The inspector (right panel) shows all editable properties for the selected object.

### Transform modes

| Key | Mode |
|-----|------|
| `W` | Move |
| `E` | Rotate |
| `R` | Scale |

Drag the coloured handles directly in the viewport, or type values into the **X Y Z / RX RY RZ / W H D** fields.

**Snap** is on by default (0.5 unit translate, 15° rotate, 0.25 scale). Uncheck the **Snap** toggle to move freely.

---

## Object types

### Box
Solid geometry. **W / H / D** set both the visual size and the collision AABB.

### Prop
A GLB model loaded from the asset pack. Pick the model in the **Model** dropdown.
- **W / H / D** control the uniform scale applied to the model.
- **Collision Box (CW / CH / CD)** — overrides the automatic mesh AABB with a manual box centred on the prop. Leave at `1 / 1 / 1` to use the GLB bounding box automatically.

### Destructible (Barrel)
Same as Prop but the object explodes when shot.
- **Trigger Radius** — blast radius in world units (default 2.2).
- Collision works the same as Prop.

### Ladder
Defines a climbable zone. The **bounds** (xMin/xMax/zMin/zMax/yMax) are what the game reads; the visible ladder shape in the editor is generated from **W / H / D**.

### Spawn
Invisible at runtime. Set **Spawn Type** to:
- `player` — player start position
- `enemy` — enemy spawn zone

---

## Changing collision box size

**Boxes** — edit **W / H / D** directly. Those values are the collision box.

**Props and Destructibles** — a **Collision Box** section appears at the bottom of the inspector when a prop or destructible is selected:

```
Collision Box
CW  [  2.0 ]   CH  [  2.0 ]   CD  [  2.0 ]
```

- Default `1 / 1 / 1` → uses the GLB mesh's bounding box automatically.
- Any other value → overrides with a manual axis-aligned box centred on the prop's position.
- Enable **Show Collision** to see the AABB ghost overlaid on the model while you adjust.

The saved JSON gains a `collider` entry only when you set a manual size:
```json
"collider": { "type": "box", "position": [10, 1, 0], "size": [2.0, 2.0, 2.0] }
```

---

## Filtering the object list

Use the **filter dropdown** above the object list to narrow what's shown:

| Filter | Shows |
|--------|-------|
| All | Every object |
| Boxes | `box` type only |
| Props | `prop` type only |
| Ladders | `ladder` type only |
| Destructibles | `destructible` type only |
| Spawns | `spawn` type only |
| Collidable | Any object with `collidable: true` |

The counter shows `shown / total`.

---

## Showing collision volumes

Toggle **Show Collision** in the right panel to overlay translucent blue AABB boxes on all collidable props and destructibles. Useful for verifying hit-boxes before saving.

---

## Adding objects

Click the **Create** buttons in the left panel:

| Button | Creates |
|--------|---------|
| Box | A 2×2×2 metal box at the origin |
| Prop | A GLB prop (first asset in the list) |
| Barrel | A destructible prop |
| Ladder | A 1.4×6×0.2 ladder zone |
| Spawn | A player spawn marker |

After adding, the object is selected and ready to move.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `W` / `E` / `R` | Switch transform mode |
| `Delete` / `Backspace` | Delete selected object |
| `Ctrl+D` | Duplicate selected object |

---

## Saving

### Save (overwrite)
Click **Save** to write the current state back to `public/maps/<name>.json`.  
The game picks up changes on the next browser refresh — no server restart needed.

### Save As (new file)
Click **Save As**, enter a new name (e.g. `arena_test`), and confirm.  
A new file is created at `public/maps/arena_test.json` without touching the original.

---

## Fullscreen

Click the **⛶** button in the top-right corner of the editor header to go fullscreen. Click it again or press `Escape` to exit.

---

## JSON format reference

Each map file lives at `public/maps/<id>.json` and follows this structure:

```json
{
  "version": 2,
  "id": "arena",
  "name": "COMBAT ARENA",
  "subtitle": "Industrial Training Facility",
  "theme": "arena",
  "arenaSize": 144,
  "fog": { "color": "#10242c", "density": 0.0054 },
  "background": "#10242c",
  "ground": { "type": "procedural", "material": "arenaGround" },
  "objects": [ ... ]
}
```

### Object schemas

**Box**
```json
{
  "id": "met_001",
  "type": "box",
  "label": "Arena / North Bunker Wall W",
  "position": [-6, 1.2, -50],
  "rotation": [0, 0, 0],
  "size": [0.4, 2.4, 9],
  "material": "metal",
  "collidable": true
}
```

**Prop**
```json
{
  "id": "prp_001",
  "type": "prop",
  "label": "Arena / Dumpster NW",
  "model": "/assets/models/shooter asset pack/Dumpster.glb",
  "position": [-10, 0, -51],
  "rotation": [0, 1.571, 0],
  "scale": [1.2, 1.2, 1.2],
  "collidable": true,
  "collider": { "type": "box", "position": [-10, 1, -51], "size": [2, 2, 2] }
}
```

**Destructible**
```json
{
  "id": "dst_001",
  "type": "destructible",
  "label": "Arena / Barrel NW",
  "model": "/assets/models/shooter asset pack/Exploding Barrel.glb",
  "position": [-28, 0, -28],
  "rotation": [0, 0, 0],
  "scale": [1.0, 1.0, 1.0],
  "triggerRadius": 2.2,
  "collidable": true
}
```

**Ladder**
```json
{
  "id": "ldr_001",
  "type": "ladder",
  "label": "Arena / Tower Ladder NE",
  "position": [58, 5.15, -54.75],
  "rotation": [0, 0, 0],
  "size": [2.8, 10.3, 2.1],
  "bounds": { "xMin": 56.6, "xMax": 59.4, "zMin": -55.8, "zMax": -53.7, "yMax": 10.3 }
}
```

**Spawn**
```json
{
  "id": "ldr_001",
  "type": "spawn",
  "label": "Player Spawn",
  "spawnType": "player",
  "position": [0, 0, 18],
  "rotation": [0, 0, 0],
  "size": [1.4, 0.1, 1.4]
}
```

### Material names

| Name | Appearance |
|------|-----------|
| `metal` | Blue-grey brushed metal |
| `crate` | Brown wood crate |
| `concrete` | Grey concrete |
| `sandstone` | Sandy tan stone |
| `blacksite` | Near-black dark metal |

### Ground material IDs

| ID | Used by |
|----|---------|
| `arenaGround` | arena |
| `sandGround` | desert |
| `asphaltGround` | city |
| `blacksiteFloor` | blacksite |

---

## Regenerating maps from source code

If you need to reset all four maps back to their original geometry (matching the legacy hard-coded scene.js builders):

```bash
node scripts/export-maps.mjs
```

This overwrites `arena.json`, `desert.json`, `city.json`, and `blacksite.json`. The `sandbox.json` and any custom maps are left untouched.

---

## How the game loads maps

1. `rebuildArena(mapId)` in `scene.js` fetches `/maps/<mapId>.json` via `mapLoader.js`.
2. If the file exists, the scene is built from JSON (fog, lights, ground, objects).
3. If the file is missing, the legacy hard-coded builder runs as a fallback.
4. The client caches the JSON for the lifetime of the browser tab — refresh to pick up new saves.
5. The server pre-loads the JSON when a match starts to derive enemy obstacle data from collidable boxes.
