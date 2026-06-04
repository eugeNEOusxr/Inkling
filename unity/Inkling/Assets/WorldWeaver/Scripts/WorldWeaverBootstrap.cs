using UnityEngine;
using WorldWeaver.Core;
using WorldWeaver.Spawning;

namespace WorldWeaver
{
    /// <summary>
    /// Scene entry: load catalog, build neighborhood, spawn word houses.
    /// </summary>
    public class WorldWeaverBootstrap : MonoBehaviour
    {
        public DistrictContext district;
        public NeighborhoodBuilder builder;
        public WordHouseSpawner spawner;
        public Camera mainCamera;

        void Start()
        {
            var json = district != null ? district.catalogJson : null;
            if (json == null)
            {
                Debug.LogError("[WorldWeaver] Assign catalog JSON on DistrictContext.");
                return;
            }

            var catalog = WordCatalog.Load(json);
            if (district != null)
                district.districtDisplayName = catalog.districtName;

            var bounds = new Bounds(Vector3.zero, new Vector3(24f, 1f, 32f));
            builder?.BuildBaseTerrain(bounds);

            var spawns = WordCatalog.SpawnPositions(catalog);
            spawner?.SpawnAll(spawns);
        }

        void Update()
        {
#if UNITY_EDITOR
            if (spawner == null || mainCamera == null) return;
            if (Input.GetMouseButtonUp(0))
            {
                var ray = mainCamera.ScreenPointToRay(Input.mousePosition);
                spawner.TryPick(ray, mainCamera);
            }
#endif
        }
    }
}
