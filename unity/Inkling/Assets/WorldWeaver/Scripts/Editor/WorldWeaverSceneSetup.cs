#if UNITY_EDITOR
namespace WorldWeaver.Editor
{
    /// <summary>
    /// Legacy menu aliases — use Inkling/Setup instead.
    /// </summary>
    public static class WorldWeaverSceneSetup
    {
        [UnityEditor.MenuItem("WorldWeaver/Setup/Create All Scenes And Settings")]
        public static void CreateAll() => InklingProjectSetup.InitializeProject();

        [UnityEditor.MenuItem("WorldWeaver/Setup/Create WorldWeaver Scene")]
        public static void CreateWorldWeaverSceneOnly() => InklingProjectSetup.CreateWorldWeaverSceneOnly();

        [UnityEditor.MenuItem("WorldWeaver/Setup/Create Main Menu Scene")]
        public static void CreateMainMenuSceneOnly() => InklingProjectSetup.CreateMainMenuSceneOnly();

        [UnityEditor.MenuItem("WorldWeaver/Setup/Add Scenes To Build Settings")]
        public static void AddScenesToBuildSettings() => InklingProjectSetup.AddScenesToBuildSettings();
    }
}
#endif
