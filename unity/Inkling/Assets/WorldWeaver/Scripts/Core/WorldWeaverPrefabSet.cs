using UnityEngine;

namespace WorldWeaver.Core
{
    /// <summary>
    /// Inspector-assigned prefab references for runtime world assembly.
    /// Drag your imported street, sidewalk, terrain, house, and player prefabs here.
    /// </summary>
    [CreateAssetMenu(fileName = "WorldWeaverPrefabSet", menuName = "WorldWeaver/Prefab Set")]
    public class WorldWeaverPrefabSet : ScriptableObject
    {
        [Header("Environment")]
        [Tooltip("Base terrain mesh prefab (e.g. terrain object).")]
        public GameObject terrainPrefab;

        [Tooltip("Street segment prefab — scaled to fit each road piece.")]
        public GameObject streetPrefab;

        [Tooltip("Sidewalk segment prefab — placed along street edges.")]
        public GameObject sidewalkPrefab;

        [Header("Structures")]
        [Tooltip("One or more house prefabs; chosen round-robin when spawning.")]
        public GameObject[] housePrefabs;

        [Header("Player")]
        [Tooltip("Player character prefab (e.g. muscular_avatar).")]
        public GameObject playerPrefab;

        [Header("Prefab Footprint (for scaling)")]
        [Tooltip("Native length of the street prefab along its forward axis.")]
        public float streetPrefabLength = 1f;

        [Tooltip("Native width of the street prefab across its lateral axis.")]
        public float streetPrefabWidth = 1f;

        [Tooltip("Native length of the sidewalk prefab along its forward axis.")]
        public float sidewalkPrefabLength = 1f;

        [Tooltip("Native width of the sidewalk prefab across its lateral axis.")]
        public float sidewalkPrefabWidth = 1f;

        public bool HasRequiredPrefabs =>
            terrainPrefab != null &&
            streetPrefab != null &&
            sidewalkPrefab != null &&
            housePrefabs != null && housePrefabs.Length > 0 &&
            playerPrefab != null;

        public GameObject PickHousePrefab(int index)
        {
            if (housePrefabs == null || housePrefabs.Length == 0) return null;
            return housePrefabs[index % housePrefabs.Length];
        }

        public static WorldWeaverPrefabSet LoadDefault()
        {
            return Resources.Load<WorldWeaverPrefabSet>("WorldWeaverPrefabSet");
        }

        public string Validate()
        {
            if (terrainPrefab == null) return "Missing terrain prefab.";
            if (streetPrefab == null) return "Missing street prefab.";
            if (sidewalkPrefab == null) return "Missing sidewalk prefab.";
            if (housePrefabs == null || housePrefabs.Length == 0) return "Missing house prefab(s).";
            if (playerPrefab == null) return "Missing player prefab (muscular_avatar).";
            return null;
        }
    }
}
