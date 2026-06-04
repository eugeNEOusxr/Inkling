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
            WirePlayerController(player);
        }

        void WirePlayerController(GameObject player)
        {
            if (player == null) return;

            var controller = player.GetComponent<ThirdPersonController>();
            if (controller == null)
                controller = player.AddComponent<ThirdPersonController>();

            var cam = _mainCamera != null ? _mainCamera : Camera.main;
            if (cam != null)
                controller.cameraTransform = cam.transform;
        }
    }
}
