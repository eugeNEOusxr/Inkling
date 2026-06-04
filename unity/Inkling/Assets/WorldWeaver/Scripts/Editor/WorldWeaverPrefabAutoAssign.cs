#if UNITY_EDITOR
namespace WorldWeaver.Editor
{
    public static class WorldWeaverPrefabAutoAssign
    {
        [UnityEditor.MenuItem("WorldWeaver/Setup/Auto-Assign Prefabs From Project")]
        public static void AutoAssign() => InklingPrefabAutoAssign.AutoAssign(silent: false);
    }
}
#endif
