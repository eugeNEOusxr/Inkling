#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Editor
{
    public static class InklingPrefabAutoAssign
    {
        const string PrefabSetPath = "Assets/WorldWeaver/Settings/WorldWeaverPrefabSet.asset";
        const string ResourcesPrefabSetPath = "Assets/WorldWeaver/Resources/WorldWeaverPrefabSet.asset";

        public static void AutoAssign(bool silent)
        {
            InklingProjectSetup.EnsureFolders();

            var set = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(PrefabSetPath);
            if (set == null)
            {
                AssetDatabase.CreateAsset(ScriptableObject.CreateInstance<WorldWeaverPrefabSet>(), PrefabSetPath);
                set = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(PrefabSetPath);
            }

            set.terrainPrefab = FindPrefab(set.terrainPrefab, "terrain", "Terrain");
            set.streetPrefab = FindPrefab(set.streetPrefab, "street", "Street", "road");
            set.sidewalkPrefab = FindPrefab(set.sidewalkPrefab, "sidewalk", "Sidewalk", "walkway");
            set.playerPrefab = FindPrefab(set.playerPrefab, "PlayerAvatar", "muscular_avatar", "Muscular_Avatar", "muscular avatar");

            if (set.housePrefabs == null || set.housePrefabs.Length == 0)
            {
                var houses = FindAllPrefabs("house", "House");
                if (houses.Length > 0)
                    set.housePrefabs = houses;
            }

            EditorUtility.SetDirty(set);
            SyncResourcesCopy(set);
            AssetDatabase.SaveAssets();

            if (!silent)
            {
                var error = set.Validate();
                if (error != null)
                    Debug.LogWarning("[Inkling] Auto-assign incomplete: " + error);
                else
                    Debug.Log("[Inkling] All prefab references assigned.");
            }
        }

        public static void ValidateAndReport()
        {
            var set = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(PrefabSetPath);
            if (set == null)
            {
                Debug.LogError("[Inkling] No WorldWeaverPrefabSet found. Run Inkling → Setup → Initialize Project.");
                return;
            }

            var error = set.Validate();
            if (error != null)
                Debug.LogError("[Inkling] " + error);
            else
                Debug.Log("[Inkling] All prefab references are assigned.");
        }

        static void SyncResourcesCopy(WorldWeaverPrefabSet set)
        {
            if (AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(ResourcesPrefabSetPath) != null)
                AssetDatabase.DeleteAsset(ResourcesPrefabSetPath);

            AssetDatabase.CopyAsset(PrefabSetPath, ResourcesPrefabSetPath);
        }

        static GameObject FindPrefab(GameObject current, params string[] keywords)
        {
            if (current != null) return current;

            var guids = AssetDatabase.FindAssets("t:Prefab");
            foreach (var guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var name = System.IO.Path.GetFileNameWithoutExtension(path);
                foreach (var keyword in keywords)
                {
                    if (name.IndexOf(keyword, System.StringComparison.OrdinalIgnoreCase) >= 0)
                        return AssetDatabase.LoadAssetAtPath<GameObject>(path);
                }
            }

            return null;
        }

        static GameObject[] FindAllPrefabs(params string[] keywords)
        {
            var results = new System.Collections.Generic.List<GameObject>();
            var guids = AssetDatabase.FindAssets("t:Prefab");
            foreach (var guid in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var name = System.IO.Path.GetFileNameWithoutExtension(path);
                foreach (var keyword in keywords)
                {
                    if (name.IndexOf(keyword, System.StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                        if (prefab != null && !results.Contains(prefab))
                            results.Add(prefab);
                        break;
                    }
                }
            }

            return results.ToArray();
        }
    }
}
#endif
