using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Assembly
{
    /// <summary>
    /// Lays out a connected grid of horizontal and vertical street segments.
    /// Intersections overlap naturally so the network stays connected.
    /// </summary>
    public class StreetNetworkModule : IWorldWeaverModule
    {
        public int Order => 10;

        public void Build(WorldWeaverBuildContext context)
        {
            var prefabs = context.prefabs;
            var layout = context.layout;

            if (prefabs.streetPrefab == null)
            {
                Debug.LogWarning("[WorldWeaver] Street prefab is not assigned.");
                return;
            }

            context.streetSegments.Clear();

            float horizontalLength = layout.streetGridColumns * layout.blockSize;
            float verticalLength = layout.streetGridRows * layout.blockSize;

            for (int row = 0; row < layout.streetGridRows; row++)
            {
                float z = row * layout.blockSize;
                var center = new Vector3(layout.WorldCenter.x, layout.streetYOffset, z);
                SpawnStreet(context, center, horizontalLength, layout.streetWidth, StreetAxis.Horizontal);
            }

            for (int col = 0; col < layout.streetGridColumns; col++)
            {
                float x = col * layout.blockSize;
                var center = new Vector3(x, layout.streetYOffset, layout.WorldCenter.z);
                SpawnStreet(context, center, verticalLength, layout.streetWidth, StreetAxis.Vertical);
            }
        }

        static void SpawnStreet(
            WorldWeaverBuildContext context,
            Vector3 center,
            float length,
            float width,
            StreetAxis axis)
        {
            context.streetSegments.Add(new StreetSegment
            {
                center = center,
                length = length,
                width = width,
                axis = axis
            });

            var prefabs = context.prefabs;
            var rotation = axis == StreetAxis.Horizontal
                ? Quaternion.identity
                : Quaternion.Euler(0f, 90f, 0f);

            var scale = axis == StreetAxis.Horizontal
                ? new Vector3(
                    length / Mathf.Max(0.01f, prefabs.streetPrefabLength),
                    1f,
                    width / Mathf.Max(0.01f, prefabs.streetPrefabWidth))
                : new Vector3(
                    width / Mathf.Max(0.01f, prefabs.streetPrefabWidth),
                    1f,
                    length / Mathf.Max(0.01f, prefabs.streetPrefabLength));

            context.InstantiatePrefab(
                prefabs.streetPrefab,
                context.StreetsRoot,
                center,
                rotation,
                scale);
        }
    }
}
