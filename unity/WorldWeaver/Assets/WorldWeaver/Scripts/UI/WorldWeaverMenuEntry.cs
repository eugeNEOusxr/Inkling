using UnityEngine;
using UnityEngine.UI;
using WorldWeaver.Navigation;

namespace WorldWeaver.UI
{
    /// <summary>
    /// Lightweight icon/button entry for launching WorldWeaver from any canvas.
    /// Attach to a UI Button or wire OnClick to LaunchWorldWeaver().
    /// </summary>
    public class WorldWeaverMenuEntry : MonoBehaviour
    {
        [SerializeField] Button launchButton;
        [SerializeField] bool useAsyncLoad;

        void Awake()
        {
            if (launchButton == null)
                launchButton = GetComponent<Button>();

            if (launchButton != null)
                launchButton.onClick.AddListener(LaunchWorldWeaver);
        }

        void OnDestroy()
        {
            if (launchButton != null)
                launchButton.onClick.RemoveListener(LaunchWorldWeaver);
        }

        public void LaunchWorldWeaver()
        {
            if (useAsyncLoad)
                WorldWeaverLauncher.LaunchAsync();
            else
                WorldWeaverLauncher.Launch();
        }
    }
}
