using UnityEngine;
using UnityEngine.UI;
using WorldWeaver.Mobile;
using WorldWeaver.Navigation;

namespace WorldWeaver.UI
{
    /// <summary>
    /// Main menu: single WorldWeaver entry point for the mobile app.
    /// </summary>
    public class MainMenuController : MonoBehaviour
    {
        public const string DefaultSceneName = "MainMenuScene";

        [Header("WorldWeaver Entry")]
        public Button worldWeaverButton;

        void Awake()
        {
            WorldWeaverLauncher.ResetLoadingState();
            EnsureMobileBootstrap();
            ConfigureCanvas();
            BindWorldWeaverButton();
        }

        void OnDestroy()
        {
            if (worldWeaverButton != null)
                worldWeaverButton.onClick.RemoveListener(OnWorldWeaverClicked);
        }

        void EnsureMobileBootstrap()
        {
            if (FindFirstObjectByType<InklingMobileBootstrap>() != null) return;
            var go = new GameObject("InklingMobileBootstrap");
            go.transform.SetParent(transform.root, false);
            go.AddComponent<InklingMobileBootstrap>();
        }

        void ConfigureCanvas()
        {
            var canvas = GetComponentInParent<Canvas>();
            if (canvas == null) return;

            var scaler = canvas.GetComponent<CanvasScaler>();
            if (scaler == null) return;

            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;
        }

        void BindWorldWeaverButton()
        {
            if (worldWeaverButton == null)
                worldWeaverButton = FindWorldWeaverButton();

            if (worldWeaverButton != null)
                worldWeaverButton.onClick.AddListener(OnWorldWeaverClicked);
            else
                Debug.LogWarning("[Inkling] No WorldWeaver button found on MainMenuController.");
        }

        static Button FindWorldWeaverButton()
        {
            var menu = Object.FindFirstObjectByType<MainMenuController>();
            if (menu == null) return null;

            var buttons = menu.GetComponentsInChildren<Button>(true);
            foreach (var button in buttons)
            {
                if (button.gameObject.name == "WorldWeaverButton")
                    return button;
            }

            return null;
        }

        public void OnWorldWeaverClicked()
        {
            if (SceneTransition.IsBusy || WorldWeaverLauncher.IsLoading) return;
            WorldWeaverLauncher.Launch();
        }
    }
}
