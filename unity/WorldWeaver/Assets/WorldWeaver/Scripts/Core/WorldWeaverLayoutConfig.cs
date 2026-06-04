using UnityEngine;

namespace WorldWeaver.Core
{
    /// <summary>
    /// Tunable layout parameters for modular world assembly.
    /// Adjust in the Inspector or swap ScriptableObject assets for different layouts.
    /// </summary>
    [CreateAssetMenu(fileName = "WorldWeaverLayout", menuName = "WorldWeaver/Layout Config")]
    public class WorldWeaverLayoutConfig : ScriptableObject
    {
        [Header("Terrain")]
        public Vector3 terrainPosition = Vector3.zero;
        public Vector3 terrainScale = new Vector3(8f, 1f, 8f);

        [Header("Street Network")]
        [Min(1)] public int streetGridColumns = 3;
        [Min(1)] public int streetGridRows = 3;
        [Min(1f)] public float blockSize = 18f;
        [Min(0.5f)] public float streetWidth = 4f;
        public float streetYOffset = 0.02f;

        [Header("Sidewalks")]
        [Min(0.5f)] public float sidewalkWidth = 2f;
        [Min(0f)] public float sidewalkGapFromStreet = 0.15f;
        public float sidewalkYOffset = 0.05f;

        [Header("Houses")]
        [Min(1)] public int housesPerBlockSide = 3;
        [Min(1f)] public float houseSpacing = 5.5f;
        [Min(0f)] public float houseOffsetFromSidewalk = 2.5f;
        public float houseYOffset = 0f;

        [Header("Player Spawn")]
        public Vector3 playerSpawnPosition = new Vector3(0f, 0f, -6f);
        public float playerSpawnRotationY = 0f;

        public float WorldWidth => streetGridColumns * blockSize;
        public float WorldDepth => streetGridRows * blockSize;

        public Vector3 WorldCenter => new Vector3(
            (streetGridColumns - 1) * blockSize * 0.5f,
            0f,
            (streetGridRows - 1) * blockSize * 0.5f);
    }
}
