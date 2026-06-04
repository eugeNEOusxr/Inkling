using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    /// <summary>
    /// Places sidewalk segments along both sides of every street segment.
    /// </summary>
    public class SidewalkAssemblyModule : IWorldWeaverModule
    {
        public int Order => 20;

        public void Build(WorldWeaverBuildContext context)
        {
            var prefab = context.prefabs.sidewalkPrefab;
            if (prefab == null)
            {
                Debug.LogWarning("[WorldWeaver] Sidewalk prefab is not assigned.");
                return;
            }

            foreach (var segment in context.streetSegments)
                SpawnSidewalksForSegment(context, segment);
        }

        static void SpawnSidewalksForSegment(WorldWeaverBuildContext context, StreetSegment segment)
        {
            var layout = context.layout;
            var prefabs = context.prefabs;
            float lateralOffset = segment.width * 0.5f + layout.sidewalkGapFromStreet + layout.sidewalkWidth * 0.5f;

            foreach (var side in new[] { -1f, 1f })
            {
                var offset = segment.axis == StreetAxis.Horizontal
                    ? new Vector3(0f, 0f, side * lateralOffset)
                    : new Vector3(side * lateralOffset, 0f, 0f);

                var position = segment.center + offset;
                position.y = layout.sidewalkYOffset;

                var rotation = segment.axis == StreetAxis.Horizontal
                    ? Quaternion.identity
                    : Quaternion.Euler(0f, 90f, 0f);

                var scale = segment.axis == StreetAxis.Horizontal
                    ? new Vector3(
                        segment.length / Mathf.Max(0.01f, prefabs.sidewalkPrefabLength),
                        1f,
                        layout.sidewalkWidth / Mathf.Max(0.01f, prefabs.sidewalkPrefabWidth))
                    : new Vector3(
                        layout.sidewalkWidth / Mathf.Max(0.01f, prefabs.sidewalkPrefabWidth),
                        1f,
                        segment.length / Mathf.Max(0.01f, prefabs.sidewalkPrefabLength));

                context.InstantiatePrefab(
                    prefab: prefabs.sidewalkPrefab,
                    parent: context.SidewalksRoot,
                    position: position,
                    rotation: rotation,
                    scale: scale);
            }
        }
    }
}
