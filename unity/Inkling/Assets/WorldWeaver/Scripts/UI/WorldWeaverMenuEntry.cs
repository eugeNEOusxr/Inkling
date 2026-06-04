using UnityEngine;
using UnityEngine.UI;
using WorldWeaver.Navigation;

namespace WorldWeaver.UI
{
    public class WorldWeaverMenuEntry : MonoBehaviour
    {
        [SerializeField] Button launchButton;

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
            if (SceneTransition.IsBusy) return;
            WorldWeaverLauncher.Launch();
        }
    }
}
