using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    /// <summary>
    /// Places houses along sidewalk edges using a simple grid spacing pattern.
    /// Expand later by swapping this module for procedural lot selection.
    /// </summary>
    public class HouseGridModule : IWorldWeaverModule
    {
        public int Order => 30;

        public void Build(WorldWeaverBuildContext context)
        {
            if (context.prefabs.housePrefabs == null || context.prefabs.housePrefabs.Length == 0)
            {
                Debug.LogWarning("[WorldWeaver] No house prefabs assigned.");
                return;
            }

            int houseIndex = 0;

            foreach (var segment in context.streetSegments)
            {
                houseIndex = SpawnHousesAlongSegment(context, segment, houseIndex);
            }
        }

        static int SpawnHousesAlongSegment(
            WorldWeaverBuildContext context,
            StreetSegment segment,
            int houseIndex)
        {
            var layout = context.layout;
            float lateralOffset = segment.width * 0.5f
                + layout.sidewalkGapFromStreet
                + layout.sidewalkWidth
                + layout.houseOffsetFromSidewalk;

            int count = layout.housesPerBlockSide;
            if (count <= 0) return houseIndex;

            float start = -segment.length * 0.5f + layout.houseSpacing * 0.5f;
            float step = segment.length / Mathf.Max(1, count);

            for (int i = 0; i < count; i++)
            {
                float along = start + i * step;

                foreach (var side in new[] { -1f, 1f })
                {
                    var lateral = segment.axis == StreetAxis.Horizontal
                        ? new Vector3(0f, 0f, side * lateralOffset)
                        : new Vector3(side * lateralOffset, 0f, 0f);

                    var alongOffset = segment.axis == StreetAxis.Horizontal
                        ? new Vector3(along, 0f, 0f)
                        : new Vector3(0f, 0f, along);

                    var position = segment.center + lateral + alongOffset;
                    position.y = layout.houseYOffset;

                    var faceStreet = segment.axis == StreetAxis.Horizontal
                        ? (side > 0f ? 180f : 0f)
                        : (side > 0f ? 90f : 270f);

                    var prefab = context.prefabs.PickHousePrefab(houseIndex++);
                    if (prefab == null) continue;

                    context.InstantiatePrefab(
                        prefab,
                        context.HousesRoot,
                        position,
                        Quaternion.Euler(0f, faceStreet, 0f),
                        Vector3.one);
                }
            }

            return houseIndex;
        }
    }
}
