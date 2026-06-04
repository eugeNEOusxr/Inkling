using UnityEngine;

namespace WorldWeaver.Interaction
{
    /// <summary>
    /// Ensures the player has a CharacterController (preferred) or Rigidbody for movement.
    /// </summary>
    public static class PlayerPhysicsSetup
    {
        public static CharacterController EnsureCharacterController(GameObject player)
        {
            if (player == null) return null;

            var existing = player.GetComponent<CharacterController>();
            if (existing != null) return existing;

            if (player.GetComponent<Rigidbody>() != null)
                return null;

            var controller = player.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.35f;
            controller.center = new Vector3(0f, 0.9f, 0f);
            controller.slopeLimit = 45f;
            controller.stepOffset = 0.3f;
            return controller;
        }
    }
}
