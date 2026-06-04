using UnityEngine;
using WorldWeaver.Core;
using WorldWeaver.Interaction;

namespace WorldWeaver.Assembly
{
    public class PlayerSpawnModule : IWorldWeaverModule
    {
        public int Order => 40;

        readonly Camera _mainCamera;

        public PlayerSpawnModule(Camera mainCamera)
        {
            _mainCamera = mainCamera;
        }

        public void Build(WorldWeaverBuildContext context)
        {
            if (context?.prefabs == null || context.layout == null) return;

            var prefab = context.prefabs.playerPrefab;
            if (prefab == null)
            {
                Debug.LogWarning("[WorldWeaver] Player prefab is not assigned.");
                return;
            }

            var layout = context.layout;
            var spawnPos = layout.playerSpawnPosition + layout.WorldCenter;
            var rotation = Quaternion.Euler(0f, layout.playerSpawnRotationY, 0f);

            var player = context.InstantiatePrefab(
                prefab,
                context.PlayerRoot,
                spawnPos,
                rotation,
                Vector3.one);

            context.spawnedPlayer = player;
            WirePlayer(player, layout, _mainCamera);
        }

        static void WirePlayer(GameObject player, WorldWeaverLayoutConfig layout, Camera mainCamera)
        {
            if (player == null) return;

            layout.GetWorldBounds(out var min, out var max);
            var cam = mainCamera != null ? mainCamera : Camera.main;

            // PR47 animated controller (preferred when present on prefab)
            var pr47 = player.GetComponent<PR47.ThirdPersonController>();
            if (pr47 != null)
            {
                PR47.PR47SceneBootstrap.SetupPlayer(player, cam, min, max);
                PR47.PR47SceneBootstrap.SetupCamera(cam, player.transform);
                return;
            }

            // Legacy WorldWeaver controller fallback
            PlayerPhysicsSetup.EnsureCharacterController(player);

            var controller = player.GetComponent<ThirdPersonController>();
            if (controller == null)
                controller = player.AddComponent<ThirdPersonController>();

            controller.SetWorldBounds(min, max);

            if (cam != null)
                controller.cameraTransform = cam.transform;
        }
    }
}
