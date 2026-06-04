using UnityEngine;
using UnityEngine.EventSystems;

namespace WorldWeaver.Interaction
{
    /// <summary>
    /// Fallback touch-drag movement on the left side of the screen when no joystick is active.
    /// </summary>
    public static class TouchMovementInput
    {
        const float MinDragPixels = 16f;

        static int _activeFingerId = -1;
        static Vector2 _startPosition;

        public static Vector2 Read(float screenWidthFraction = 0.5f)
        {
            if (Input.touchCount == 0)
            {
                _activeFingerId = -1;
                return Vector2.zero;
            }

            for (int i = 0; i < Input.touchCount; i++)
            {
                var touch = Input.GetTouch(i);
                if (_activeFingerId >= 0 && touch.fingerId != _activeFingerId)
                    continue;

                if (_activeFingerId < 0)
                {
                    if (touch.phase != TouchPhase.Began)
                        continue;

                    if (touch.position.x > Screen.width * screenWidthFraction)
                        continue;

                    if (IsOverUi(touch.fingerId, touch.position))
                        continue;

                    _activeFingerId = touch.fingerId;
                    _startPosition = touch.position;
                    continue;
                }

                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                {
                    _activeFingerId = -1;
                    return Vector2.zero;
                }

                var delta = touch.position - _startPosition;
                if (delta.magnitude < MinDragPixels)
                    return Vector2.zero;

                return new Vector2(delta.x, -delta.y).normalized;
            }

            return Vector2.zero;
        }

        static bool IsOverUi(int fingerId, Vector2 position)
        {
            if (EventSystem.current == null) return false;
            return EventSystem.current.IsPointerOverGameObject(fingerId);
        }

        public static void Reset()
        {
            _activeFingerId = -1;
        }
    }
}
