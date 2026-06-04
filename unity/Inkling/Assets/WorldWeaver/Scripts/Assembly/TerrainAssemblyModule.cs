using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    public class TerrainAssemblyModule : IWorldWeaverModule
    {
        public int Order => 0;

        public void Build(WorldWeaverBuildContext context)
        {
            if (context?.prefabs == null || context.layout == null) return;

            var prefab = context.prefabs.terrainPrefab;
            if (prefab == null)
            {
                Debug.LogWarning("[WorldWeaver] Terrain prefab is not assigned.");
                return;
            }

            var layout = context.layout;
            var position = layout.terrainPosition + layout.WorldCenter;
            context.InstantiatePrefab(
                prefab,
                context.TerrainRoot,
                position,
                Quaternion.identity,
                layout.terrainScale);
        }
    }
}
