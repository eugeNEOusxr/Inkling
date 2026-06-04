using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using WorldWeaver.Assembly;
using WorldWeaver.Core;
using WorldWeaver.Interaction;
using WorldWeaver.Navigation;

namespace WorldWeaver
{
    /// <summary>
    /// Runtime orchestrator for WorldWeaverScene. Builds the world in deterministic order on Start.
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
        public bool createMobileHud = true;
        [Tooltip("Spread world build across frames on mobile to reduce load hitches.")]
        public bool spreadBuildAcrossFrames = true;

        readonly List<IWorldWeaverModule> _modules = new List<IWorldWeaverModule>();
        WorldWeaverBuildContext _context;
        bool _built;
        Coroutine _buildRoutine;

        public WorldWeaverBuildContext Context => _context;
        public bool IsBuilt => _built;

        void Awake()
        {
            WorldWeaverLauncher.ResetLoadingState();
            ResolveConfiguration();
            RegisterDefaultModules();
        }

        void Start()
        {
            if (!buildOnStart) return;

            if (ShouldSpreadBuild())
                _buildRoutine = StartCoroutine(BuildWorldAsync());
            else
                BuildWorld();
        }

        void OnDestroy()
        {
            if (_buildRoutine != null)
                StopCoroutine(_buildRoutine);
        }

        bool ShouldSpreadBuild()
        {
            if (!spreadBuildAcrossFrames) return false;
#if UNITY_EDITOR
            return false;
#else
            return Application.isMobilePlatform;
#endif
        }

        void ResolveConfiguration()
        {
            if (prefabSet == null)
                prefabSet = WorldWeaverPrefabSet.LoadDefault();

            if (layoutConfig == null)
                layoutConfig = Resources.Load<WorldWeaverLayoutConfig>("WorldWeaverLayout");

            layoutConfig?.ApplyMobileDefaultsIfNeeded();
        }

        void RegisterDefaultModules()
        {
            _modules.Clear();
            _modules.Add(new TerrainAssemblyModule());
            _modules.Add(new StreetNetworkModule());
            _modules.Add(new SidewalkAssemblyModule());
            _modules.Add(new HouseGridModule());
            _modules.Add(new PlayerSpawnModule(mainCamera != null ? mainCamera : Camera.main));
        }

        public void RegisterModule(IWorldWeaverModule module)
        {
            if (module == null) return;
            _modules.Add(module);
            _modules.Sort((a, b) => a.Order.CompareTo(b.Order));
        }

        public void SetModules(IEnumerable<IWorldWeaverModule> modules)
        {
            _modules.Clear();
            if (modules != null)
                _modules.AddRange(modules.Where(m => m != null).OrderBy(m => m.Order));
        }

        [ContextMenu("Build World")]
        public void BuildWorld()
        {
            if (!TryPrepareBuild(out var error))
            {
                Debug.LogError("[WorldWeaver] " + error);
                return;
            }

            RunModulesImmediate();
            CompleteBuild();
        }

        IEnumerator BuildWorldAsync()
        {
            if (!TryPrepareBuild(out var error))
            {
                Debug.LogError("[WorldWeaver] " + error);
                yield break;
            }

            for (int i = 0; i < _modules.Count; i++)
            {
                _modules[i].Build(_context);
                yield return null;
            }

            CompleteBuild();
        }

        bool TryPrepareBuild(out string error)
        {
            error = null;
            ResolveConfiguration();

            if (prefabSet == null)
            {
                error = "Assign WorldWeaverPrefabSet on WorldWeaverManager or place it in Resources.";
                return false;
            }

            if (layoutConfig == null)
            {
                error = "Assign WorldWeaverLayoutConfig on WorldWeaverManager or place it in Resources.";
                return false;
            }

            error = prefabSet.Validate();
            if (error != null)
            {
                error += " Run Inkling → Setup → Auto-Assign Prefabs.";
                return false;
            }

            if (clearPreviousBuild)
                ClearWorld();

            if (worldRoot == null)
                worldRoot = transform;

            if (mainCamera == null)
                mainCamera = Camera.main;

            _context = new WorldWeaverBuildContext
            {
                worldRoot = worldRoot,
                prefabs = prefabSet,
                layout = layoutConfig
            };

            return true;
        }

        void RunModulesImmediate()
        {
            for (int i = 0; i < _modules.Count; i++)
                _modules[i].Build(_context);
        }

        void CompleteBuild()
        {
            FinalizePlayerSetup();
            _built = true;
            Debug.Log("[WorldWeaver] World assembled successfully.");
        }

        void FinalizePlayerSetup()
        {
            if (_context?.spawnedPlayer == null) return;

            // PR47 uses Input System + ThirdPersonCamera; mobile HUD still useful for touch move
            var pr47 = _context.spawnedPlayer.GetComponent<PR47.ThirdPersonController>();
            if (pr47 != null)
            {
                if (createMobileHud)
                    MobileHudBootstrap.EnsurePr47(_context.spawnedPlayer);
                return;
            }

            var controller = _context.spawnedPlayer.GetComponent<Interaction.ThirdPersonController>();
            if (controller == null) return;

            if (mainCamera != null)
                controller.cameraTransform = mainCamera.transform;

            if (createMobileHud)
                MobileHudBootstrap.Ensure(controller);
        }

        [ContextMenu("Clear World")]
        public void ClearWorld()
        {
            if (worldRoot == null) return;

            for (int i = worldRoot.childCount - 1; i >= 0; i--)
                Destroy(worldRoot.GetChild(i).gameObject);

            TouchMovementInput.Reset();
            _context = null;
            _built = false;
        }
    }
}
