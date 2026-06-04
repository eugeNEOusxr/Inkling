using UnityEngine;
using UnityEngine.UI;
using WorldWeaver.Navigation;

namespace WorldWeaver.UI
{
    /// <summary>
    /// Main menu controller. Wire the WorldWeaver button in the Inspector
    /// or let this script auto-bind a child button named "WorldWeaverButton".
    /// </summary>
    public class MainMenuController : MonoBehaviour
    {
        public const string DefaultSceneName = "MainMenuScene";

        [Header("WorldWeaver Entry")]
        public Button worldWeaverButton;

        void Awake()
        {
            WorldWeaverLauncher.ResetLoadingState();

            if (worldWeaverButton == null)
                worldWeaverButton = FindWorldWeaverButton();

            if (worldWeaverButton != null)
                worldWeaverButton.onClick.AddListener(OnWorldWeaverClicked);
            else
                Debug.LogWarning("[WorldWeaver] No WorldWeaver button assigned on MainMenuController.");
        }

        void OnDestroy()
        {
            if (worldWeaverButton != null)
                worldWeaverButton.onClick.RemoveListener(OnWorldWeaverClicked);
        }

        Button FindWorldWeaverButton()
        {
            var buttons = GetComponentsInChildren<Button>(true);
            foreach (var button in buttons)
            {
                if (button.gameObject.name == "WorldWeaverButton")
                    return button;
            }

            return null;
        }

        public void OnWorldWeaverClicked()
        {
            WorldWeaverLauncher.Launch();
        }
    }
}
