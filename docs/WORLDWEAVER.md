# WorldWeaver

WorldWeaver is Inkling’s **word-as-place** neighborhood: each house is a vocabulary entry you can walk to and open on mobile.

## Two runtimes (same data contract)

| Runtime | Location | Status |
|---------|----------|--------|
| **Inkling (Android / web)** | `src/worldweaver/neighborhood/` | Runnable prototype — Three.js inside WordWeaver |
| **Unity** | `unity/WorldWeaver/` | Script scaffold — open in Unity 6+ for native builds |

Inkling’s shell is **Tauri + WebView + Three.js**. The **District** tab under WordWeaver launches the neighborhood today. The Unity folder mirrors architecture for a future native WorldWeaver app or embedded player.

## How to try it

1. Open Inkling → **WordWeaver** tab.
2. Tap **District** in the segment bar.
3. Drag the joystick to walk; **tap a house** for word, definition, example, and date added.

Data: `public/data/word-neighborhood.json` (cached in `localStorage` after first load).

## Data schema

```json
{
  "version": 1,
  "districtName": "Inkling Lane",
  "spawn": { "gridCols": 4, "blockSpacing": 5.5, "streetWidth": 3.2 },
  "words": [
    {
      "id": "curiosity",
      "word": "Curiosity",
      "hash": "#Curiosity",
      "definition": "...",
      "example": "...",
      "addedAt": "2026-03-01"
    }
  ]
}
```

Houses are **not** hand-placed in the scene. `spawnHousesFromCatalog()` assigns sidewalk positions from the word list.

## Module map (web)

- `wordCatalog.js` — load/save catalog, spawn positions
- `assetRegistry.js` — builtin + external asset IDs (GLB/GLTF/FBX slots)
- `prefabLoader.js` — GLTF import → prefab group
- `neighborhoodBuilder.js` — roads, sidewalks, streetlights, spawn houses
- `wordHouse.js` + `wordLabel.js` — low-poly house + hashtag label (TMP equivalent)
- `thirdPersonController.js` + `mobileWalkControls.js` — walk + follow camera
- `housePanel.js` — detail UI
- `NeighborhoodScene.js` — scene lifecycle, tap pick, Android-friendly renderer settings

## Expansion-ready design (not implemented yet)

Planned layers for a later **WorldWeaver platform** (no multiplayer / accounts / networking in this phase):

```
DistrictContext          — owner id, district id, visibility (private / public)
NeighborhoodBuilder      — procedural base mesh + spawn graph
AssetRegistry + Prefabs  — Blender / Meshy / GLB / GLTF / FBX → reusable prefabs
PlacementSystem          — user-placed decor & buildings (future)
DecorationSystem       — attachments to house slots (future)
SharedDistrictService    — read-only public districts (future, local-first stub in Unity)
```

Single-player prototype only: one default district from JSON.

## Unity setup

The mobile Unity app lives at **`unity/Inkling/`**.

1. Open `unity/Inkling` in Unity Hub (Unity 6+).
2. **Inkling → Setup → Initialize Project (Recommended)**.
3. Import prefabs to `Assets/WorldWeaver/Imported/` and run **Inkling → Setup → Auto-Assign Prefabs**.
4. Open **MainMenuScene** → Play → tap **WorldWeaver**.

See `unity/Inkling/README.md` for architecture, build settings, and Android/iOS notes.

## Adding words

Edit `public/data/word-neighborhood.json` and reload (clear `inkling:ww-neighborhood-catalog-v1` in devtools to force refetch).

## Performance (Android)

- `devicePixelRatio` capped at 1.5
- Lambert materials, no shadow maps on houses
- Low-poly primitives only in the default neighborhood
