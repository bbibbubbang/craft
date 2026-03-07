import * as THREE from "three";

export class PlayerModel extends THREE.Group {
  head: THREE.Mesh;
  body: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  heldItem: THREE.Mesh;

  constructor() {
    super();

    // Material
    const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 }); // Simple green for now
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
    const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x0000ff });

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMaterial);
    this.head.position.y = 1.75; // 1.5 + 0.25
    this.add(this.head);

    // Body
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), material);
    this.body.position.y = 1.125; // 0.875 + 0.25
    this.add(this.body);

    // Left Arm Group (pivot at shoulder)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.375, 1.5, 0); // 1.25 + 0.25
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMaterial);
    leftArmMesh.position.y = -0.375; // Adjust mesh relative to pivot
    this.leftArm.add(leftArmMesh);
    this.add(this.leftArm);

    // Right Arm Group (pivot at shoulder)
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.375, 1.5, 0); // 1.25 + 0.25
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMaterial);
    rightArmMesh.position.y = -0.375; // Adjust mesh relative to pivot
    this.rightArm.add(rightArmMesh);

    // Held Item
    this.heldItem = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xffffff }) // dummy material
    );
    this.heldItem.position.set(0, -0.65, 0.125); // move up slightly
    this.rightArm.add(this.heldItem);

    this.add(this.rightArm);

    // Left Leg Group (pivot at hip)
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(0.125, 0.75, 0); // 0.5 + 0.25
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), pantsMaterial);
    leftLegMesh.position.y = -0.375; // Adjust mesh relative to pivot
    this.leftLeg.add(leftLegMesh);
    this.add(this.leftLeg);

    // Right Leg Group (pivot at hip)
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.125, 0.75, 0); // 0.5 + 0.25
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), pantsMaterial);
    rightLegMesh.position.y = -0.375; // Adjust mesh relative to pivot
    this.rightLeg.add(rightLegMesh);
    this.add(this.rightLeg);
  }

  updateAnimation(time: number, speed: number, isSprinting: boolean) {
    if (speed > 0.1) {
      const swingSpeed = isSprinting ? 15 : 10;
      const angle = Math.sin(time * swingSpeed) * 0.5;

      this.leftArm.rotation.x = angle;
      this.rightArm.rotation.x = -angle;
      this.leftLeg.rotation.x = -angle;
      this.rightLeg.rotation.x = angle;
    } else {
      // Return to idle
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
    }
  }
}
