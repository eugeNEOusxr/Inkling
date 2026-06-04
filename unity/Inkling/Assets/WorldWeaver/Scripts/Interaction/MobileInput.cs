using UnityEngine;
using UnityEngine.EventSystems;

namespace WorldWeaver.Interaction
{
    /// <summary>
    /// UI touch joystick — feeds legacy ThirdPersonController or PR47MobileInputBridge.
    /// </summary>
    public class MobileInput : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public RectTransform background;
        public RectTransform knob;
        public ThirdPersonController player;
        public PR47.PR47MobileInputBridge pr47Bridge;
        public float maxRadius = 68f;

        Vector2 _pointerOrigin;
        bool _active;

        public void OnPointerDown(PointerEventData eventData)
        {
            _active = true;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                background, eventData.position, eventData.pressEventCamera, out _pointerOrigin);
            OnDrag(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (!_active || background == null) return;

            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                background, eventData.position, eventData.pressEventCamera, out var local);

            var delta = local - _pointerOrigin;
            if (delta.magnitude > maxRadius)
                delta = delta.normalized * maxRadius;

            if (knob != null)
                knob.anchoredPosition = delta;

            var input = new Vector2(delta.x / maxRadius, -delta.y / maxRadius);

            if (pr47Bridge != null)
                pr47Bridge.SetMoveInput(input);
            else if (player != null)
                player.SetMoveInput(input);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            _active = false;
            if (knob != null)
                knob.anchoredPosition = Vector2.zero;

            if (pr47Bridge != null)
                pr47Bridge.SetMoveInput(Vector2.zero);
            else
                player?.SetMoveInput(Vector2.zero);
        }
    }
}
