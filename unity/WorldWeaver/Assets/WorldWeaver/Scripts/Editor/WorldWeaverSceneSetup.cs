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
    public static class WorldWeaverSceneSetup
    {
        const string ScenesFolder = "Assets/WorldWeaver/Scenes";
        const string SettingsFolder = "Assets/WorldWeaver/Settings";
        const string PrefabsFolder = "Assets/WorldWeaver/Prefabs";
        const string MainMenuScenePath = ScenesFolder + "/MainMenuScene.unity";
        const string WorldWeaverScenePath = ScenesFolder + "/WorldWeaverScene.unity";

        [MenuItem("WorldWeaver/Setup/Create All Scenes And Settings")]
        public static void CreateAll()
        {
            EnsureFolders();
            CreateDefaultSettingsAssets();
            CreateWorldWeaverScene();
            CreateMainMenuScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog(
                "WorldWeaver Setup",
                "Created MainMenuScene, WorldWeaverScene, and default settings.\n\n" +
                "Next: assign your imported prefabs on WorldWeaverPrefabSet " +
                "(Assets/WorldWeaver/Settings/WorldWeaverPrefabSet.asset).",
                "OK");
        }

        [MenuItem("WorldWeaver/Setup/Create WorldWeaver Scene")]
        public static void CreateWorldWeaverSceneOnly()
        {
            EnsureFolders();
            CreateDefaultSettingsAssets();
            CreateWorldWeaverScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
        }

        [MenuItem("WorldWeaver/Setup/Create Main Menu Scene")]
        public static void CreateMainMenuSceneOnly()
        {
            EnsureFolders();
            CreateMainMenuScene();
            AddScenesToBuildSettings();
            AssetDatabase.SaveAssets();
        }

        [MenuItem("WorldWeaver/Setup/Add Scenes To Build Settings")]
        public static void AddScenesToBuildSettings()
        {
            EnsureFolders();

            var scenes = new[]
            {
                MainMenuScenePath,
                WorldWeaverScenePath
            };

            var existing = EditorBuildSettings.scenes;
            var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(existing);

            foreach (var path in scenes)
            {
                if (!File.Exists(path)) continue;
                if (list.Exists(s => s.path == path)) continue;
                list.Add(new EditorBuildSettingsScene(path, true));
            }

            EditorBuildSettings.scenes = list.ToArray();
            Debug.Log("[WorldWeaver] Build settings updated.");
        }

        static void EnsureFolders()
        {
            CreateFolderIfMissing("Assets/WorldWeaver");
            CreateFolderIfMissing(ScenesFolder);
            CreateFolderIfMissing(SettingsFolder);
            CreateFolderIfMissing(PrefabsFolder);
            CreateFolderIfMissing("Assets/WorldWeaver/Imported");
            CreateFolderIfMissing("Assets/WorldWeaver/Data");
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
            CreateAssetIfMissing<WorldWeaverPrefabSet>(SettingsFolder + "/WorldWeaverPrefabSet.asset");
            CreateAssetIfMissing<WorldWeaverLayoutConfig>(SettingsFolder + "/WorldWeaverLayout.asset");
        }

        static void CreateAssetIfMissing<T>(string path) where T : ScriptableObject
        {
            if (AssetDatabase.LoadAssetAtPath<T>(path) != null) return;
            var asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
        }

        static void CreateWorldWeaverScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var light = Object.FindFirstObjectByType<Light>();
            if (light != null)
            {
                light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
                light.intensity = 1.1f;
            }

            var camera = Camera.main;
            if (camera != null)
            {
                camera.transform.position = new Vector3(0f, 8f, -12f);
                camera.transform.rotation = Quaternion.Euler(25f, 0f, 0f);
            }

            var managerGo = new GameObject("WorldWeaverManager");
            var manager = managerGo.AddComponent<WorldWeaverManager>();

            var prefabSet = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(
                SettingsFolder + "/WorldWeaverPrefabSet.asset");
            var layout = AssetDatabase.LoadAssetAtPath<WorldWeaverLayoutConfig>(
                SettingsFolder + "/WorldWeaverLayout.asset");

            manager.prefabSet = prefabSet;
            manager.layoutConfig = layout;
            manager.mainCamera = camera;
            manager.worldRoot = managerGo.transform;

            if (Object.FindFirstObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            EditorSceneManager.SaveScene(scene, WorldWeaverScenePath);
            Debug.Log($"[WorldWeaver] Saved {WorldWeaverScenePath}");
        }

        static void CreateMainMenuScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var canvasGo = new GameObject("Canvas");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>();

            var menuGo = new GameObject("MainMenu");
            menuGo.transform.SetParent(canvasGo.transform, false);
            var menuRect = menuGo.AddComponent<RectTransform>();
            menuRect.anchorMin = Vector2.zero;
            menuRect.anchorMax = Vector2.one;
            menuRect.offsetMin = Vector2.zero;
            menuRect.offsetMax = Vector2.zero;
            menuGo.AddComponent<MainMenuController>();

            var titleGo = new GameObject("Title");
            titleGo.transform.SetParent(menuGo.transform, false);
            var titleRect = titleGo.AddComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0.5f, 0.75f);
            titleRect.anchorMax = new Vector2(0.5f, 0.75f);
            titleRect.sizeDelta = new Vector2(400f, 60f);
            var titleText = titleGo.AddComponent<Text>();
            titleText.text = "Inkling";
            titleText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            titleText.fontSize = 36;
            titleText.alignment = TextAnchor.MiddleCenter;
            titleText.color = Color.white;

            CreateMenuButton(menuGo.transform, "WorldWeaverButton", "WorldWeaver", new Vector2(0.5f, 0.45f));

            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.AddComponent<Camera>().backgroundColor = new Color(0.08f, 0.09f, 0.12f);

            EditorSceneManager.SaveScene(scene, MainMenuScenePath);
            Debug.Log($"[WorldWeaver] Saved {MainMenuScenePath}");
        }

        static void CreateMenuButton(Transform parent, string name, string label, Vector2 anchor)
        {
            var buttonGo = new GameObject(name);
            buttonGo.transform.SetParent(parent, false);

            var rect = buttonGo.AddComponent<RectTransform>();
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.sizeDelta = new Vector2(220f, 48f);

            var image = buttonGo.AddComponent<Image>();
            image.color = new Color(0.2f, 0.45f, 0.85f, 1f);

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
            text.fontSize = 22;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;

            buttonGo.AddComponent<WorldWeaverMenuEntry>();
        }
    }
}
#endif
