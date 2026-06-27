# Game Assets — Folder Contract

Everything here is **data-driven**. To add content, drop a folder in the right
place and (in dev) refresh — the manifest re-scans automatically. No code changes.

## Characters → `characters/<id>/`

| File             | Required | Purpose                                  |
| ---------------- | -------- | ---------------------------------------- |
| `model.glb`      | ✅       | The rigged character mesh.               |
| `animations.glb` | optional | Extra animation clips (idle/walk/etc.).  |
| `icon.png`       | ✅       | Selection-grid thumbnail.                |
| `config.json`    | ✅       | Stats + animation clip name map.         |

Example `config.json`:

```json
{
  "name": "Recruit",
  "description": "Balanced all-rounder.",
  "health": 10,
  "speed": 5.0,
  "sprintMultiplier": 1.6,
  "jumpHeight": 1.4,
  "scale": 1.0,
  "animations": {
    "idle": "Idle",
    "walk": "Walk",
    "run": "Run",
    "jump": "Jump",
    "fall": "Fall",
    "land": "Land",
    "aim": "Aim",
    "shoot": "Shoot",
    "reload": "Reload",
    "death": "Death",
    "victory": "Victory"
  }
}
```

## Weapons → `weapons/<id>/`

| File          | Required | Purpose                   |
| ------------- | -------- | ------------------------- |
| `weapon.glb`  | ✅       | The weapon mesh.          |
| `icon.png`    | ✅       | Selection-grid thumbnail. |
| `config.json` | ✅       | Stats + attachment point. |

Example `config.json`:

```json
{
  "name": "Standard Rifle",
  "description": "Reliable automatic rifle.",
  "damage": 2,
  "fireRate": 600,
  "magazine": 30,
  "reloadSpeed": 2.2,
  "projectileSpeed": 120,
  "recoil": 0.4,
  "spread": 0.02,
  "range": 80,
  "attachment": {
    "position": [0.2, -0.15, 0.4],
    "rotation": [0, 0, 0],
    "scale": 1.0
  }
}
```

## Maps → `maps/<id>/`

Maps are procedural + data-driven. Provide a `config.json` (and optional
`preview.png`) describing seed, size, palette, fog, sky and prop density.

> Until you upload character/weapon folders, the selection grids show an
> empty/locked state and the in-game avatar uses a neutral engine capsule.
