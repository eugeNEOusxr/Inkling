using UnityEngine;
using UnityEngine.EventSystems;
using WorldWeaver.Mobile;
using WorldWeaver.Navigation;

namespace WorldWeaver.Interaction
{
    /// <summary>
    /// Creates mobile HUD at runtime: touch joystick + Return to Menu button.
    /// </summary>
    public static class MobileHudBootstrap
    {
        public static void Ensure(ThirdPersonController player)
        {
            if (player == null) return;
            if (Object.FindFirstObjectByType<MobileInput>() != null) return;

            EnsureEventSystem();

            var canvas = MobileUiFactory.CreateOverlayCanvas("MobileHUD", 100);
            var safeArea = MobileUiFactory.CreateSafeAreaRoot(canvas.transform);

            CreateJoystick(safeArea, player);
            CreateBackButton(safeArea);
        }

        static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<EventSystem>() != null) return;

            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        static void CreateJoystick(RectTransform parent, ThirdPersonController player)
        {
            var bgGo = new GameObject("JoystickBackground", typeof(RectTransform));
            bgGo.transform.SetParent(parent, false);

            var bgRect = bgGo.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0f, 0f);
            bgRect.anchorMax = new Vector2(0f, 0f);
            bgRect.pivot = new Vector2(0.5f, 0.5f);
            bgRect.anchoredPosition = new Vector2(180f, 180f);
            bgRect.sizeDelta = new Vector2(220f, 220f);

            var bgImage = MobileUiFactory.CreateImage(bgRect, new Color(1f, 1f, 1f, 0.2f));
            bgImage.rectTransform.anchorMin = Vector2.zero;
            bgImage.rectTransform.anchorMax = Vector2.one;
            bgImage.rectTransform.offsetMin = Vector2.zero;
            bgImage.rectTransform.offsetMax = Vector2.zero;

            var knobGo = new GameObject("JoystickKnob", typeof(RectTransform));
            knobGo.transform.SetParent(bgGo.transform, false);
            var knobRect = knobGo.GetComponent<RectTransform>();
            knobRect.sizeDelta = new Vector2(88f, 88f);
            var knobImage = MobileUiFactory.CreateImage(knobRect, new Color(1f, 1f, 1f, 0.65f));

            var mobileInput = bgGo.AddComponent<MobileInput>();
            mobileInput.background = bgRect;
            mobileInput.knob = knobRect;
            mobileInput.player = player;
            mobileInput.maxRadius = 68f;
        }

        /// <summary>
        /// Mobile HUD for PR47 player — feeds PR47MobileInputBridge instead of legacy controller.
        /// </summary>
        public static void EnsurePr47(GameObject player)
        {
            if (player == null) return;
            if (Object.FindFirstObjectByType<MobileInput>() != null) return;

            var bridge = player.GetComponent<PR47.PR47MobileInputBridge>();
            if (bridge == null) return;

            EnsureEventSystem();

            var canvas = MobileUiFactory.CreateOverlayCanvas("MobileHUD", 100);
            var safeArea = MobileUiFactory.CreateSafeAreaRoot(canvas.transform);

            CreatePr47Joystick(safeArea, bridge);
            CreateBackButton(safeArea);
        }

        static void CreatePr47Joystick(RectTransform parent, PR47.PR47MobileInputBridge bridge)
        {
            var bgGo = new GameObject("JoystickBackground", typeof(RectTransform));
            bgGo.transform.SetParent(parent, false);

            var bgRect = bgGo.GetComponent<RectTransform>();
            bgRect.anchorMin = new Vector2(0f, 0f);
            bgRect.anchorMax = new Vector2(0f, 0f);
            bgRect.pivot = new Vector2(0.5f, 0.5f);
            bgRect.anchoredPosition = new Vector2(180f, 180f);
            bgRect.sizeDelta = new Vector2(220f, 220f);

            var bgImage = MobileUiFactory.CreateImage(bgRect, new Color(1f, 1f, 1f, 0.2f));
            bgImage.rectTransform.anchorMin = Vector2.zero;
            bgImage.rectTransform.anchorMax = Vector2.one;
            bgImage.rectTransform.offsetMin = Vector2.zero;
            bgImage.rectTransform.offsetMax = Vector2.zero;

            var knobGo = new GameObject("JoystickKnob", typeof(RectTransform));
            knobGo.transform.SetParent(bgGo.transform, false);
            var knobRect = knobGo.GetComponent<RectTransform>();
            knobRect.sizeDelta = new Vector2(88f, 88f);
            MobileUiFactory.CreateImage(knobRect, new Color(1f, 1f, 1f, 0.65f));

            var mobileInput = bgGo.AddComponent<MobileInput>();
            mobileInput.background = bgRect;
            mobileInput.knob = knobRect;
            mobileInput.pr47Bridge = bridge;
            mobileInput.maxRadius = 68f;
        }

        static void CreateBackButton(RectTransform parent)
        {
            var buttonGo = new GameObject("BackToMenuButton", typeof(RectTransform));
            buttonGo.transform.SetParent(parent, false);

            var rect = buttonGo.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(1f, 1f);
            rect.anchorMax = new Vector2(1f, 1f);
            rect.pivot = new Vector2(1f, 1f);
            rect.anchoredPosition = new Vector2(-32f, -32f);
            rect.sizeDelta = new Vector2(200f, 64f);

            var image = MobileUiFactory.CreateImage(rect, new Color(0.1f, 0.12f, 0.16f, 0.9f));
            image.rectTransform.anchorMin = Vector2.zero;
            image.rectTransform.anchorMax = Vector2.one;
            image.rectTransform.offsetMin = Vector2.zero;
            image.rectTransform.offsetMax = Vector2.zero;

            var button = buttonGo.AddComponent<UnityEngine.UI.Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(() => WorldWeaverLauncher.ReturnToMainMenu());

            var text = MobileUiFactory.CreateText(rect, "Menu", 26, TextAnchor.MiddleCenter);
            var textRect = text.rectTransform;
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;
        }
    }
}
