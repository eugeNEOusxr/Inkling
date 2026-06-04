using UnityEngine;
using UnityEngine.UI;

namespace WorldWeaver.Mobile
{
    /// <summary>
    /// Shared mobile UI helpers: scaling, safe area, touch-friendly sprites.
    /// </summary>
    public static class MobileUiFactory
    {
        static Sprite _uiSprite;

        public static Sprite UiSprite =>
            _uiSprite != null
                ? _uiSprite
                : (_uiSprite = Resources.GetBuiltinResource<Sprite>("UISprite.psd"));

        public static Canvas CreateOverlayCanvas(string name, int sortOrder = 100)
        {
            var canvasGo = new GameObject(name);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = sortOrder;

            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;

            canvasGo.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        public static RectTransform CreateSafeAreaRoot(Transform canvasTransform)
        {
            var safeGo = new GameObject("SafeArea");
            safeGo.transform.SetParent(canvasTransform, false);

            var rect = safeGo.AddComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            ApplySafeArea(rect);
            return rect;
        }

        public static void ApplySafeArea(RectTransform rect)
        {
            var safe = Screen.safeArea;
            var invX = 1f / Screen.width;
            var invY = 1f / Screen.height;

            rect.anchorMin = new Vector2(safe.xMin * invX, safe.yMin * invY);
            rect.anchorMax = new Vector2(safe.xMax * invX, safe.yMax * invY);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        public static Image CreateImage(RectTransform parent, Color color)
        {
            var go = new GameObject("Image", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var image = go.AddComponent<Image>();
            image.sprite = UiSprite;
            image.type = Image.Type.Sliced;
            image.color = color;
            image.raycastTarget = true;
            return image;
        }

        public static Text CreateText(RectTransform parent, string label, int fontSize, TextAnchor alignment)
        {
            var go = new GameObject("Text", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var text = go.AddComponent<Text>();
            text.text = label;
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = fontSize;
            text.alignment = alignment;
            text.color = Color.white;
            text.raycastTarget = false;
            return text;
        }
    }
}
