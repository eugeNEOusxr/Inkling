#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using WorldWeaver;
using WorldWeaver.Core;
using WorldWeaver.UI;

namespace WorldWeaver.Editor
{
    /// <summary>
    /// One-click Inkling project setup: scenes, build settings, ScriptableObject configs.
    /// </summary>
    public static class InklingProjectSetup
    {
        const string ScenesFolder = "Assets/WorldWeaver/Scenes";
        const string SettingsFolder = "Assets/WorldWeaver/Settings";
        const string ResourcesFolder = "Assets/WorldWeaver/Resources";
        const string MainMenuScenePath = ScenesFolder + "/MainMenuScene.unity";
        const string WorldWeaverScenePath = ScenesFolder + "/WorldWeaverScene.unity";
        const string PrefabSetPath = SettingsFolder + "/WorldWeaverPrefabSet.asset";
        const string LayoutPath = SettingsFolder + "/WorldWeaverLayout.asset";

        [MenuItem("Inkling/Setup/Initialize Project (Recommended)", false, 0)]
        public static void InitializeProject()
        {
            EnsureFolders();
            CreateDefaultSettingsAssets();
            InklingPrefabAutoAssign.AutoAssign(silent: true);
            CreateWorldWeaverScene();
            CreateMainMenuScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            var set = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(PrefabSetPath);
            var error = set != null ? set.Validate() : "Prefab set was not created.";

            if (error != null)
            {
                EditorUtility.DisplayDialog(
                    "Inkling Setup — Action Required",
                    "Scenes and settings were created, but prefab references are incomplete:\n\n" +
                    error + "\n\n" +
                    "Place your prefabs under Assets/WorldWeaver/Imported/ then run:\n" +
                    "Inkling → Setup → Auto-Assign Prefabs",
                    "OK");
            }
            else
            {
                EditorUtility.DisplayDialog(
                    "Inkling Setup Complete",
                    "MainMenuScene and WorldWeaverScene are ready.\n\n" +
                    "Open MainMenuScene and press Play to test.",
                    "OK");
            }
        }

        [MenuItem("Inkling/Setup/Create Main Menu Scene")]
        public static void CreateMainMenuSceneOnly()
        {
            EnsureFolders();
            CreateMainMenuScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
        }

        [MenuItem("Inkling/Setup/Create WorldWeaver Scene")]
        public static void CreateWorldWeaverSceneOnly()
        {
            EnsureFolders();
            CreateDefaultSettingsAssets();
            CreateWorldWeaverScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
        }

        [MenuItem("Inkling/Setup/Auto-Assign Prefabs")]
        public static void AutoAssignPrefabs() => InklingPrefabAutoAssign.AutoAssign(silent: false);

        [MenuItem("Inkling/Setup/Validate Prefab References")]
        public static void ValidatePrefabs() => InklingPrefabAutoAssign.ValidateAndReport();

        [MenuItem("Inkling/Setup/Add Scenes To Build Settings")]
        public static void AddScenesToBuildSettings()
        {
            EnsureFolders();

            var scenes = new[] { MainMenuScenePath, WorldWeaverScenePath };
            var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);

            foreach (var path in scenes)
            {
                if (!File.Exists(path)) continue;
                if (list.Exists(s => s.path == path)) continue;
                list.Add(new EditorBuildSettingsScene(path, true));
            }

            if (list.Count > 0)
            {
                var mainMenu = list.Find(s => s.path == MainMenuScenePath);
                if (mainMenu.path != null)
                {
                    list.Remove(mainMenu);
                    list.Insert(0, mainMenu);
                }
            }

            EditorBuildSettings.scenes = list.ToArray();
            Debug.Log("[Inkling] Build settings updated. MainMenuScene is index 0.");
        }

        public static void EnsureFolders()
        {
            CreateFolderIfMissing("Assets/WorldWeaver");
            CreateFolderIfMissing(ScenesFolder);
            CreateFolderIfMissing(SettingsFolder);
            CreateFolderIfMissing(ResourcesFolder);
            CreateFolderIfMissing("Assets/WorldWeaver/Imported");
            CreateFolderIfMissing("Assets/WorldWeaver/Prefabs");
        }

        static void CreateFolderIfMissing(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            var name = Path.GetFileName(path);
            if (!string.IsNullOrEmpty(parent) && !string.IsNullOrEmpty(name))
                AssetDatabase.CreateFolder(parent, name);
        }

        static void CreateDefaultSettingsAssets()
        {
            CreateAssetIfMissing<WorldWeaverPrefabSet>(PrefabSetPath);
            CreateAssetIfMissing<WorldWeaverLayoutConfig>(LayoutPath);

            var layout = AssetDatabase.LoadAssetAtPath<WorldWeaverLayoutConfig>(LayoutPath);
            if (layout != null)
            {
                layout.streetGridColumns = 2;
                layout.streetGridRows = 2;
                layout.blockSize = 16f;
                layout.housesPerBlockSide = 2;
                layout.maxTotalHouses = 12;
                layout.applyMobileDefaultsOnDevice = true;
                EditorUtility.SetDirty(layout);
            }

            CopySettingsToResources();
        }

        static void CopySettingsToResources()
        {
            CopyAsset(PrefabSetPath, ResourcesFolder + "/WorldWeaverPrefabSet.asset");
            CopyAsset(LayoutPath, ResourcesFolder + "/WorldWeaverLayout.asset");
        }

        static void CopyAsset(string sourcePath, string destPath)
        {
            if (!File.Exists(sourcePath)) return;
            if (File.Exists(destPath))
                AssetDatabase.DeleteAsset(destPath);
            AssetDatabase.CopyAsset(sourcePath, destPath);
        }

        static void CreateAssetIfMissing<T>(string path) where T : ScriptableObject
        {
            if (AssetDatabase.LoadAssetAtPath<T>(path) != null) return;
            AssetDatabase.CreateAsset(ScriptableObject.CreateInstance<T>(), path);
        }

        static void CreateWorldWeaverScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var light = Object.FindFirstObjectByType<Light>();
            if (light != null)
            {
                light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
                light.intensity = 1f;
                light.shadows = LightShadows.Soft;
            }

            var camera = Camera.main;
            if (camera != null)
            {
                camera.transform.position = new Vector3(0f, 8f, -12f);
                camera.transform.rotation = Quaternion.Euler(25f, 0f, 0f);
                camera.farClipPlane = 120f;
            }

            var managerGo = new GameObject("WorldWeaverManager");
            var manager = managerGo.AddComponent<WorldWeaverManager>();
            manager.prefabSet = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(PrefabSetPath);
            manager.layoutConfig = AssetDatabase.LoadAssetAtPath<WorldWeaverLayoutConfig>(LayoutPath);
            manager.mainCamera = camera;
            manager.worldRoot = managerGo.transform;
            manager.buildOnStart = true;
            manager.createMobileHud = true;
            manager.spreadBuildAcrossFrames = true;

            EnsureEventSystem();
            EditorSceneManager.SaveScene(scene, WorldWeaverScenePath);
            Debug.Log("[Inkling] Saved " + WorldWeaverScenePath);
        }

        static void CreateMainMenuScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var canvasGo = new GameObject("Canvas");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();

            var menuGo = new GameObject("MainMenu");
            menuGo.transform.SetParent(canvasGo.transform, false);
            var menuRect = menuGo.AddComponent<RectTransform>();
            menuRect.anchorMin = Vector2.zero;
            menuRect.anchorMax = Vector2.one;
            menuRect.offsetMin = Vector2.zero;
            menuRect.offsetMax = Vector2.zero;
            var menu = menuGo.AddComponent<MainMenuController>();

            CreateTitle(menuGo.transform);
            var button = CreateMenuButton(menuGo.transform, "WorldWeaverButton", "WorldWeaver", new Vector2(0.5f, 0.42f));
            menu.worldWeaverButton = button;

            var bootstrapGo = new GameObject("InklingMobileBootstrap");
            bootstrapGo.AddComponent<WorldWeaver.Mobile.InklingMobileBootstrap>();

            EnsureEventSystem();

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.AddComponent<Camera>().backgroundColor = new Color(0.07f, 0.08f, 0.11f);

            EditorSceneManager.SaveScene(scene, MainMenuScenePath);
            Debug.Log("[Inkling] Saved " + MainMenuScenePath);
        }

        static void CreateTitle(Transform parent)
        {
            var titleGo = new GameObject("Title");
            titleGo.transform.SetParent(parent, false);
            var titleRect = titleGo.AddComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 0.72f);
            titleRect.anchorMax = new Vector2(0.5f, 0.72f);
            titleRect.sizeDelta = new Vector2(480f, 72f);
            var titleText = titleGo.AddComponent<Text>();
            titleText.text = "Inkling";
            titleText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            titleText.fontSize = 42;
            titleText.alignment = TextAnchor.MiddleCenter;
            titleText.color = Color.white;
        }

        static Button CreateMenuButton(Transform parent, string name, string label, Vector2 anchor)
        {
            var buttonGo = new GameObject(name);
            buttonGo.transform.SetParent(parent, false);

            var rect = buttonGo.AddComponent<RectTransform>();
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.sizeDelta = new Vector2(320f, 72f);

            var image = buttonGo.AddComponent<Image>();
            image.color = new Color(0.18f, 0.48f, 0.92f, 1f);

            var button = buttonGo.AddComponent<Button>();
            button.targetGraphic = image;

            var textGo = new GameObject("Text");
            textGo.transform.SetParent(buttonGo.transform, false);
            var textRect = textGo.AddComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;

            var text = textGo.AddComponent<Text>();
            text.text = label;
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = 24;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;

            buttonGo.AddComponent<WorldWeaverMenuEntry>();
            return button;
        }

        static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }
    }
}
#endif
