using UnityEngine;
using UnityEngine.SceneManagement;

namespace WorldWeaver.Navigation
{
    /// <summary>
    /// Loads WorldWeaverScene from anywhere in the app (main menu button, code, etc.).
    /// </summary>
    public static class WorldWeaverLauncher
    {
        public const string WorldWeaverSceneName = WorldWeaverManager.SceneName;

        public static bool IsLoading { get; private set; }

        public static void ResetLoadingState() => IsLoading = false;

        public static void Launch()
        {
            if (IsLoading) return;

            if (!Application.CanStreamedLevelBeLoaded(WorldWeaverSceneName))
            {
                Debug.LogError(
                    $"[WorldWeaver] Scene \"{WorldWeaverSceneName}\" is not in Build Settings. " +
                    "Use WorldWeaver → Setup → Add Scenes To Build Settings in the Unity menu.");
                return;
            }

            IsLoading = true;
            SceneManager.LoadScene(WorldWeaverSceneName, LoadSceneMode.Single);
        }

        public static void LaunchAsync()
        {
            if (IsLoading) return;

            if (!Application.CanStreamedLevelBeLoaded(WorldWeaverSceneName))
            {
                Debug.LogError(
                    $"[WorldWeaver] Scene \"{WorldWeaverSceneName}\" is not in Build Settings. " +
                    "Use WorldWeaver → Setup → Add Scenes To Build Settings in the Unity menu.");
                return;
            }

            IsLoading = true;
            var op = SceneManager.LoadSceneAsync(WorldWeaverSceneName, LoadSceneMode.Single);
            op.completed += _ => IsLoading = false;
        }

        public static void ReturnToMainMenu(string mainMenuSceneName = MainMenuController.DefaultSceneName)
        {
            if (!Application.CanStreamedLevelBeLoaded(mainMenuSceneName))
            {
                Debug.LogError($"[WorldWeaver] Main menu scene \"{mainMenuSceneName}\" is not in Build Settings.");
                return;
            }

            IsLoading = false;
            SceneManager.LoadScene(mainMenuSceneName, LoadSceneMode.Single);
        }
    }
}
