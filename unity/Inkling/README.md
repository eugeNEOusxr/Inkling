# Inkling — Unity Mobile App

Production baseline for **Android/iOS**: main menu → WorldWeaver 3D world built from prefabs at runtime.

## Quick start

1. Open **`unity/Inkling`** in Unity Hub (Unity 6+).
2. **Inkling → Setup → Initialize Project (Recommended)** — once.
3. **Inkling → Setup → Auto-Assign Prefabs** — wire terrain, street, sidewalk, house, `muscular_avatar`.
4. Open **MainMenuScene** → **Play** (Editor) or **Build and Run** (device).

## Android flow

```
App launch → MainMenuScene
           → tap "WorldWeaver"
           → async scene transition (no freeze)
           → WorldWeaverManager builds world (1 module per frame on device)
           → muscular_avatar spawns with touch joystick + camera follow
           → tap "Menu" to return
```

## Mobile features

| Feature | Implementation |
|---------|----------------|
| Touch movement | UI joystick + left-screen drag fallback |
| Camera-relative controls | `ThirdPersonController` moves relative to camera forward |
| UI scaling | `CanvasScaler` 1080×1920, match 0.5 |
| Safe area | Notch/inset aware HUD via `MobileUiFactory` |
| Smooth scene loads | `SceneTransition` async load on device builds |
| No editor input on device | Keyboard/WASD only in Editor |
| Performance cap | 2×2 grid, max 12 houses on mobile |

## Prefabs (WorldWeaverPrefabSet)

Assign on `Assets/WorldWeaver/Settings/WorldWeaverPrefabSet.asset`:

- terrain, street, sidewalk, house(s), muscular_avatar

Validate: **Inkling → Setup → Validate Prefab References**

## Scenes

- `Assets/WorldWeaver/Scenes/MainMenuScene.unity` — build index **0**
- `Assets/WorldWeaver/Scenes/WorldWeaverScene.unity` — build index **1**

Re-create scenes anytime: **Inkling → Setup → Initialize Project**

## Architecture

```
WorldWeaverManager (auto on Start)
  Order 0  TerrainAssemblyModule
  Order 10 StreetNetworkModule
  Order 20 SidewalkAssemblyModule
  Order 30 HouseGridModule (capped by maxTotalHouses)
  Order 40 PlayerSpawnModule (CharacterController + ThirdPersonController)
  → MobileHudBootstrap (joystick + Menu button)
```

## Android build

Your existing Android pipeline is unchanged. Ensure **MainMenuScene** is first in **File → Build Settings**.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Button does nothing | Run **Initialize Project**; check Build Settings |
| Red prefab errors | **Auto-Assign Prefabs** or assign manually |
| Avatar won't move | Ensure EventSystem exists; use on-screen joystick |
| Load hitch | `spreadBuildAcrossFrames` enabled by default on device |
