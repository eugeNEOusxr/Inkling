using UnityEngine;

namespace WorldWeaver.Mobile
{
    /// <summary>
    /// Applies device-friendly defaults when the app starts. Attach to a GameObject in MainMenuScene.
    /// </summary>
    public class InklingMobileBootstrap : MonoBehaviour
    {
        [SerializeField] int targetFrameRate = 60;
        [SerializeField] bool preventScreenSleep = true;

        static bool _initialized;

        void Awake()
        {
            if (_initialized) return;
            _initialized = true;

            Application.targetFrameRate = targetFrameRate;
            if (preventScreenSleep)
                Screen.sleepTimeout = SleepTimeout.NeverSleep;

            QualitySettings.vSyncCount = 0;
        }
    }
}
