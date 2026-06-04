using UnityEngine;

namespace WorldWeaver.Core
{
    [CreateAssetMenu(fileName = "WorldWeaverLayout", menuName = "WorldWeaver/Layout Config")]
    public class WorldWeaverLayoutConfig : ScriptableObject
    {
        [Header("Terrain")]
        public Vector3 terrainPosition = Vector3.zero;
        public Vector3 terrainScale = new Vector3(8f, 1f, 8f);

        [Header("Street Network")]
        [Min(1)] public int streetGridColumns = 2;
        [Min(1)] public int streetGridRows = 2;
        [Min(1f)] public float blockSize = 16f;
        [Min(0.5f)] public float streetWidth = 4f;
        public float streetYOffset = 0.02f;

        [Header("Sidewalks")]
        [Min(0.5f)] public float sidewalkWidth = 2f;
        [Min(0f)] public float sidewalkGapFromStreet = 0.15f;
        public float sidewalkYOffset = 0.05f;

        [Header("Houses")]
        [Min(1)] public int housesPerBlockSide = 2;
        [Min(1f)] public float houseSpacing = 5.5f;
        [Min(0f)] public float houseOffsetFromSidewalk = 2.5f;
        public float houseYOffset = 0f;
        [Tooltip("Hard cap on spawned houses for mobile performance.")]
        [Min(1)] public int maxTotalHouses = 12;

        [Header("Player Spawn")]
        public Vector3 playerSpawnPosition = new Vector3(0f, 0f, -6f);
        public float playerSpawnRotationY = 0f;

        [Header("Mobile")]
        public bool applyMobileDefaultsOnDevice = true;

        public float WorldWidth => streetGridColumns * blockSize;
        public float WorldDepth => streetGridRows * blockSize;

        public Vector3 WorldCenter => new Vector3(
            (streetGridColumns - 1) * blockSize * 0.5f,
            0f,
            (streetGridRows - 1) * blockSize * 0.5f);

        public void ApplyMobileDefaultsIfNeeded()
        {
            if (!applyMobileDefaultsOnDevice) return;
#if UNITY_EDITOR
            return;
#else
            if (!Application.isMobilePlatform) return;

            streetGridColumns = Mathf.Min(streetGridColumns, 2);
            streetGridRows = Mathf.Min(streetGridRows, 2);
            housesPerBlockSide = Mathf.Min(housesPerBlockSide, 2);
            maxTotalHouses = Mathf.Min(maxTotalHouses, 12);
#endif
        }

        public void GetWorldBounds(out Vector3 min, out Vector3 max)
        {
            var center = WorldCenter;
            var halfWidth = WorldWidth * 0.5f + blockSize * 0.25f;
            var halfDepth = WorldDepth * 0.5f + blockSize * 0.25f;
            min = new Vector3(center.x - halfWidth, 0f, center.z - halfDepth);
            max = new Vector3(center.x + halfWidth, 0f, center.z + halfDepth);
        }
    }
}
