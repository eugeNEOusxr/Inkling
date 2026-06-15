import * as THREE from "three";

/**
 * Third-person avatar + follow camera.
 */
export function createThirdPersonController(scene, camera) {
  const avatar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x5a7ab0 })
  );
  body.position.y = 1.05;
  avatar.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8c4a8 })
  );
  head.position.y = 1.85;
  avatar.add(head);
  avatar.position.set(0, 0, 4);
  scene.add(avatar);

  const velocity = new THREE.Vector3();
  const moveSpeed = 4.2;
  const camLook = new THREE.Vector3(0, 1.2, 0);
  let yaw = 0;

  function update(dt, input) {
    const { moveX, moveZ } = input;
    if (moveX !== 0 || moveZ !== 0) {
      yaw = Math.atan2(moveX, moveZ);
      avatar.rotation.y = yaw;
      velocity.set(Math.sin(yaw) * moveSpeed, 0, Math.cos(yaw) * moveSpeed);
    } else {
      velocity.set(0, 0, 0);
    }
    avatar.position.addScaledVector(velocity, dt);
    avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, -18, 18);
    avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, -6, 32);

    const camPos = avatar.position.clone().add(new THREE.Vector3(0, 3.2, 5.5));
    camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
    const look = avatar.position.clone().add(camLook);
    camera.lookAt(look);
  }

  return { avatar, update, getPosition: () => avatar.position.clone() };
}
