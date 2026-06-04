using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using WorldWeaver.Assembly;
using WorldWeaver.Core;
using WorldWeaver.Navigation;

namespace WorldWeaver
{
    /// <summary>
    /// Runtime orchestrator: stores prefab references, runs assembly modules,
    /// and builds the playable world when WorldWeaverScene loads.
    /// </summary>
    public class WorldWeaverManager : MonoBehaviour
    {
        public const string SceneName = "WorldWeaverScene";

        [Header("Configuration")]
        public WorldWeaverPrefabSet prefabSet;
        public WorldWeaverLayoutConfig layoutConfig;

        [Header("Scene References")]
        public Transform worldRoot;
        public Camera mainCamera;

        [Header("Build Options")]
        public bool buildOnStart = true;
        public bool clearPreviousBuild = true;

        readonly List<IWorldWeaverModule> _modules = new List<IWorldWeaverModule>();
        WorldWeaverBuildContext _context;
        bool _built;

        public WorldWeaverBuildContext Context => _context;
        public bool IsBuilt => _built;

        void Awake()
        {
            WorldWeaverLauncher.ResetLoadingState();
            RegisterDefaultModules();
        }

        void Start()
        {
            if (buildOnStart)
                BuildWorld();
        }

        void RegisterDefaultModules()
        {
            _modules.Clear();
            _modules.Add(new TerrainAssemblyModule());
            _modules.Add(new StreetNetworkModule());
            _modules.Add(new SidewalkAssemblyModule());
            _modules.Add(new HouseGridModule());
            _modules.Add(new PlayerSpawnModule(mainCamera));
        }

        /// <summary>
        /// Register a custom module for procedural expansion.
        /// Call before BuildWorld().
        /// </summary>
        public void RegisterModule(IWorldWeaverModule module)
        {
            _modules.Add(module);
            _modules.Sort((a, b) => a.Order.CompareTo(b.Order));
        }

        /// <summary>
        /// Replace all modules (advanced procedural pipelines).
        /// </summary>
        public void SetModules(IEnumerable<IWorldWeaverModule> modules)
        {
            _modules.Clear();
            _modules.AddRange(modules.OrderBy(m => m.Order));
        }

        [ContextMenu("Build World")]
        public void BuildWorld()
        {
            if (prefabSet == null)
            {
                Debug.LogError("[WorldWeaver] Assign a WorldWeaverPrefabSet on WorldWeaverManager.");
                return;
            }

            if (layoutConfig == null)
            {
                Debug.LogError("[WorldWeaver] Assign a WorldWeaverLayoutConfig on WorldWeaverManager.");
                return;
            }

            if (!prefabSet.HasRequiredPrefabs)
            {
                Debug.LogError("[WorldWeaver] Prefab set is missing one or more required prefab references.");
                return;
            }

            if (clearPreviousBuild)
                ClearWorld();

            if (worldRoot == null)
                worldRoot = transform;

            _context = new WorldWeaverBuildContext
            {
                worldRoot = worldRoot,
                prefabs = prefabSet,
                layout = layoutConfig
            };

            foreach (var module in _modules)
                module.Build(_context);

            _built = true;
            Debug.Log($"[WorldWeaver] World assembled with {_modules.Count} modules.");
        }

        [ContextMenu("Clear World")]
        public void ClearWorld()
        {
            if (worldRoot == null) return;

            for (int i = worldRoot.childCount - 1; i >= 0; i--)
                Destroy(worldRoot.GetChild(i).gameObject);

            _context = null;
            _built = false;
        }
    }
}
