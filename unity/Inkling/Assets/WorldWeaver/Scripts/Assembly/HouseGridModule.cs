using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    public class HouseGridModule : IWorldWeaverModule
    {
        static readonly float[] SideOffsets = { -1f, 1f };

        public int Order => 30;

        public void Build(WorldWeaverBuildContext context)
        {
            if (context?.prefabs?.housePrefabs == null || context.prefabs.housePrefabs.Length == 0)
            {
                Debug.LogWarning("[WorldWeaver] No house prefabs assigned.");
                return;
            }

            if (context.layout == null) return;

            int houseIndex = 0;
            int maxHouses = Mathf.Max(1, context.layout.maxTotalHouses);

            for (int s = 0; s < context.streetSegments.Count; s++)
            {
                if (context.housesSpawned >= maxHouses) break;
                houseIndex = SpawnHousesAlongSegment(context, context.streetSegments[s], houseIndex, maxHouses);
            }
        }

        static int SpawnHousesAlongSegment(
            WorldWeaverBuildContext context,
            StreetSegment segment,
            int houseIndex,
            int maxHouses)
        {
            var layout = context.layout;
            float lateralOffset = segment.width * 0.5f
                + layout.sidewalkGapFromStreet
                + layout.sidewalkWidth
                + layout.houseOffsetFromSidewalk;

            int count = layout.housesPerBlockSide;
            if (count <= 0) return houseIndex;

            float start = -segment.length * 0.5f + layout.houseSpacing * 0.5f;
            float step = segment.length / count;

            for (int i = 0; i < count; i++)
            {
                if (context.housesSpawned >= maxHouses) break;

                float along = start + i * step;

                for (int s = 0; s < SideOffsets.Length; s++)
                {
                    if (context.housesSpawned >= maxHouses) break;

                    float side = SideOffsets[s];
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

                    if (context.InstantiatePrefab(
                            prefab,
                            context.HousesRoot,
                            position,
                            Quaternion.Euler(0f, faceStreet, 0f),
                            Vector3.one) != null)
                    {
                        context.housesSpawned++;
                    }
                }
            }

            return houseIndex;
        }
    }
}
