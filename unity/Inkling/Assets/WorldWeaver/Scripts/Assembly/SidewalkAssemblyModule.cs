using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    public class SidewalkAssemblyModule : IWorldWeaverModule
    {
        static readonly float[] SideOffsets = { -1f, 1f };

        public int Order => 20;

        public void Build(WorldWeaverBuildContext context)
        {
            if (context?.prefabs == null || context.layout == null) return;

            if (context.prefabs.sidewalkPrefab == null)
            {
                Debug.LogWarning("[WorldWeaver] Sidewalk prefab is not assigned.");
                return;
            }

            for (int i = 0; i < context.streetSegments.Count; i++)
                SpawnSidewalksForSegment(context, context.streetSegments[i]);
        }

        static void SpawnSidewalksForSegment(WorldWeaverBuildContext context, StreetSegment segment)
        {
            var layout = context.layout;
            var prefabs = context.prefabs;
            float lateralOffset = segment.width * 0.5f + layout.sidewalkGapFromStreet + layout.sidewalkWidth * 0.5f;

            for (int s = 0; s < SideOffsets.Length; s++)
            {
                float side = SideOffsets[s];
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
                    prefabs.sidewalkPrefab,
                    context.SidewalksRoot,
                    position,
                    rotation,
                    scale);
            }
        }
    }
}
