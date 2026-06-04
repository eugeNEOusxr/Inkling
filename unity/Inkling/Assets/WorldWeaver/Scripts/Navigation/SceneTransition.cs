using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using WorldWeaver.Mobile;

namespace WorldWeaver.Navigation
{
    /// <summary>
    /// Async scene loading with a lightweight overlay to avoid mobile hitches.
    /// </summary>
    public class SceneTransition : MonoBehaviour
    {
        const float MinDisplaySeconds = 0.15f;

        static SceneTransition _instance;
        Canvas _canvas;
        Image _overlay;
        bool _busy;

        public static bool IsBusy => _instance != null && _instance._busy;

        public static void Load(string sceneName)
        {
            EnsureInstance();
            _instance.StartCoroutine(_instance.LoadRoutine(sceneName));
        }

        static void EnsureInstance()
        {
            if (_instance != null) return;

            var go = new GameObject("SceneTransition");
            DontDestroyOnLoad(go);
            _instance = go.AddComponent<SceneTransition>();
            _instance.BuildOverlay();
        }

        void BuildOverlay()
        {
            _canvas = MobileUiFactory.CreateOverlayCanvas("TransitionOverlay", 1000);
            _canvas.transform.SetParent(transform, false);

            var panel = new GameObject("Overlay", typeof(RectTransform));
            panel.transform.SetParent(_canvas.transform, false);
            var rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            _overlay = MobileUiFactory.CreateImage(rect, new Color(0.04f, 0.05f, 0.07f, 0.92f));
            _overlay.rectTransform.anchorMin = Vector2.zero;
            _overlay.rectTransform.anchorMax = Vector2.one;
            _overlay.rectTransform.offsetMin = Vector2.zero;
            _overlay.rectTransform.offsetMax = Vector2.zero;
            _overlay.gameObject.SetActive(false);
        }

        IEnumerator LoadRoutine(string sceneName)
        {
            if (_busy) yield break;
            _busy = true;

            _overlay.gameObject.SetActive(true);
            var shownAt = Time.unscaledTime;

            var op = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);
            if (op == null)
            {
                _overlay.gameObject.SetActive(false);
                _busy = false;
                yield break;
            }

            op.allowSceneActivation = false;

            while (op.progress < 0.9f)
                yield return null;

            var elapsed = Time.unscaledTime - shownAt;
            if (elapsed < MinDisplaySeconds)
                yield return new WaitForSecondsRealtime(MinDisplaySeconds - elapsed);

            op.allowSceneActivation = true;

            while (!op.isDone)
                yield return null;

            _overlay.gameObject.SetActive(false);
            _busy = false;
            WorldWeaverLauncher.ResetLoadingState();
        }
    }
}
