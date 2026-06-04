#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using WorldWeaver.Core;

namespace WorldWeaver.Editor
{
    /// <summary>
    /// Attempts to auto-fill WorldWeaverPrefabSet from common imported asset names.
    /// </summary>
    public static class WorldWeaverPrefabAutoAssign
    {
        [MenuItem("WorldWeaver/Setup/Auto-Assign Prefabs From Project")]
        public static void AutoAssign()
        {
            const string settingsPath = "Assets/WorldWeaver/Settings/WorldWeaverPrefabSet.asset";
            var set = AssetDatabase.LoadAssetAtPath<WorldWeaverPrefabSet>(settingsPath);
            if (set == null)
            {
                Debug.LogError("[WorldWeaver] Create settings first via WorldWeaver → Setup → Create All Scenes And Settings.");
                return;
            }

            set.terrainPrefab = FindPrefab(set.terrainPrefab, "terrain", "ground", "Terrain");
            set.streetPrefab = FindPrefab(set.streetPrefab, "street", "road", "Street");
            set.sidewalkPrefab = FindPrefab(set.sidewalkPrefab, "sidewalk", "walkway", "Sidewalk");
            set.playerPrefab = FindPrefab(set.playerPrefab, "muscular_avatar", "Muscular_Avatar", "player", "Player");

            if (set.housePrefabs == null || set.housePrefabs.Length == 0)
            {
                var houses = FindAllPrefabs("house", "House");
                if (houses.Length > 0)
                    set.housePrefabs = houses;
            }

            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            Debug.Log("[WorldWeaver] Prefab auto-assign complete. Review WorldWeaverPrefabSet in the Inspector.");
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
