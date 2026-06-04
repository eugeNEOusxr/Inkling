using UnityEngine;

namespace WorldWeaver.Interaction
{
    /// <summary>
    /// Third-person movement with CharacterController, camera-relative input, and touch support.
    /// </summary>
    public class ThirdPersonController : MonoBehaviour
    {
        public Transform cameraTransform;
        public float moveSpeed = 4.2f;
        public float rotationSpeed = 12f;
        public Vector3 cameraOffset = new Vector3(0f, 3.2f, 5.5f);
        public Vector3 lookOffset = new Vector3(0f, 1.2f, 0f);
        public float gravity = -18f;

        [Header("World Bounds")]
        public bool clampToBounds = true;
        public Vector3 boundsMin = new Vector3(-30f, 0f, -10f);
        public Vector3 boundsMax = new Vector3(30f, 0f, 40f);

        CharacterController _controller;
        Vector2 _moveInput;
        bool _hasJoystickInput;
        float _verticalVelocity;

        public void SetMoveInput(Vector2 input)
        {
            _moveInput = Vector2.ClampMagnitude(input, 1f);
            _hasJoystickInput = _moveInput.sqrMagnitude > 0.0001f;
        }

        public void SetWorldBounds(Vector3 min, Vector3 max)
        {
            boundsMin = min;
            boundsMax = max;
            clampToBounds = true;
        }

        void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (_controller == null && GetComponent<Rigidbody>() == null)
                _controller = PlayerPhysicsSetup.EnsureCharacterController(gameObject);
        }

        void OnEnable()
        {
            if (cameraTransform == null && Camera.main != null)
                cameraTransform = Camera.main.transform;
        }

        void Update()
        {
            var dt = Time.deltaTime;
            var input = ResolveMoveInput();

            if (input.sqrMagnitude > 0.01f)
            {
                var worldDir = InputToWorldDirection(input);
                if (worldDir.sqrMagnitude > 0.01f)
                {
                    var targetRotation = Quaternion.LookRotation(worldDir);
                    transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, rotationSpeed * dt);

                    if (_controller != null)
                        _controller.Move(worldDir * (moveSpeed * dt));
                    else
                        transform.position += worldDir * (moveSpeed * dt);
                }
            }

            if (_controller != null)
                ApplyGravity(dt);

            ClampPosition();
            UpdateCamera(dt);
        }

        Vector2 ResolveMoveInput()
        {
            if (_hasJoystickInput)
                return _moveInput;

            var touchInput = TouchMovementInput.Read();
            if (touchInput.sqrMagnitude > 0.01f)
                return touchInput;

#if UNITY_EDITOR
            return new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
#else
            return Vector2.zero;
#endif
        }

        Vector3 InputToWorldDirection(Vector2 input)
        {
            if (cameraTransform == null)
                return new Vector3(input.x, 0f, input.y).normalized;

            var forward = cameraTransform.forward;
            forward.y = 0f;
            if (forward.sqrMagnitude < 0.001f)
                forward = Vector3.forward;
            forward.Normalize();

            var right = Vector3.Cross(Vector3.up, forward);
            return (right * input.x + forward * input.y).normalized;
        }

        void ApplyGravity(float dt)
        {
            if (_controller.isGrounded && _verticalVelocity < 0f)
                _verticalVelocity = -2f;

            _verticalVelocity += gravity * dt;
            _controller.Move(Vector3.up * (_verticalVelocity * dt));
        }

        void ClampPosition()
        {
            if (!clampToBounds) return;

            var pos = transform.position;
            pos.x = Mathf.Clamp(pos.x, boundsMin.x, boundsMax.x);
            pos.z = Mathf.Clamp(pos.z, boundsMin.z, boundsMax.z);
            transform.position = pos;
        }

        void UpdateCamera(float dt)
        {
            if (cameraTransform == null) return;

            var target = transform.position + cameraOffset;
            cameraTransform.position = Vector3.Lerp(cameraTransform.position, target, 1f - Mathf.Pow(0.001f, dt));
            cameraTransform.LookAt(transform.position + lookOffset);
        }
    }
}
