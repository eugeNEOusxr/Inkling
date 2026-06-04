using UnityEngine;
using UnityEngine.SceneManagement;
using WorldWeaver.UI;

namespace WorldWeaver.Navigation
{
    /// <summary>
    /// Loads WorldWeaverScene and returns to MainMenuScene. Uses async transitions on device builds.
    /// </summary>
    public static class WorldWeaverLauncher
    {
        public const string WorldWeaverSceneName = WorldWeaver.WorldWeaverManager.SceneName;

        public static bool IsLoading { get; private set; }

        public static void ResetLoadingState() => IsLoading = false;

        public static void Launch()
        {
            if (IsLoading || SceneTransition.IsBusy) return;

            if (!CanLoad(WorldWeaverSceneName))
                return;

            IsLoading = true;

            if (UseAsyncTransition())
                SceneTransition.Load(WorldWeaverSceneName);
            else
                SceneManager.LoadScene(WorldWeaverSceneName, LoadSceneMode.Single);
        }

        public static void ReturnToMainMenu(string mainMenuSceneName = MainMenuController.DefaultSceneName)
        {
            if (SceneTransition.IsBusy) return;

            if (!CanLoad(mainMenuSceneName))
                return;

            IsLoading = false;

            if (UseAsyncTransition())
                SceneTransition.Load(mainMenuSceneName);
            else
                SceneManager.LoadScene(mainMenuSceneName, LoadSceneMode.Single);
        }

        static bool CanLoad(string sceneName)
        {
            if (Application.CanStreamedLevelBeLoaded(sceneName))
                return true;

            Debug.LogError(
                $"[Inkling] Scene \"{sceneName}\" is not in Build Settings. " +
                "Run Inkling → Setup → Initialize Project.");
            return false;
        }

        static bool UseAsyncTransition()
        {
#if UNITY_EDITOR
            return false;
#else
            return Application.isMobilePlatform;
#endif
        }
    }
}
