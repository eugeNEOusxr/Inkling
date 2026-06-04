using System.Collections.Generic;
using UnityEngine;

namespace WorldWeaver.Core
{
    public enum StreetAxis
    {
        Horizontal,
        Vertical
    }

    public struct StreetSegment
    {
        public Vector3 center;
        public float length;
        public float width;
        public StreetAxis axis;
    }

    /// <summary>
    /// Shared state passed between assembly modules during a build pass.
    /// </summary>
    public class WorldWeaverBuildContext
    {
        public Transform worldRoot;
        public WorldWeaverPrefabSet prefabs;
        public WorldWeaverLayoutConfig layout;

        public readonly List<StreetSegment> streetSegments = new List<StreetSegment>();
        public GameObject spawnedPlayer;

        Transform _terrainRoot;
        Transform _streetsRoot;
        Transform _sidewalksRoot;
        Transform _housesRoot;
        Transform _playerRoot;

        public Transform TerrainRoot => GetOrCreate(ref _terrainRoot, "Terrain");
        public Transform StreetsRoot => GetOrCreate(ref _streetsRoot, "Streets");
        public Transform SidewalksRoot => GetOrCreate(ref _sidewalksRoot, "Sidewalks");
        public Transform HousesRoot => GetOrCreate(ref _housesRoot, "Houses");
        public Transform PlayerRoot => GetOrCreate(ref _playerRoot, "Player");

        Transform GetOrCreate(ref Transform cached, string name)
        {
            if (cached != null) return cached;
            var go = new GameObject(name);
            go.transform.SetParent(worldRoot, false);
            cached = go.transform;
            return cached;
        }

        public GameObject InstantiatePrefab(
            GameObject prefab,
            Transform parent,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale)
        {
            if (prefab == null) return null;
            var instance = Object.Instantiate(prefab, position, rotation, parent);
            instance.transform.localScale = scale;
            return instance;
        }
    }
}
