import * as THREE from "three";

export class ParticleSystem {
  private particles: {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
  }[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(
    position: THREE.Vector3,
    material: THREE.Material | THREE.Material[]
  ) {
    const numParticles = 10 + Math.random() * 10;
    const size = 0.15;

    for (let i = 0; i < numParticles; i++) {
      const geometry = new THREE.BoxGeometry(size, size, size);

      let mat = material;
      if (Array.isArray(material)) {
        // if material is an array, pick random one or clone array
        mat = material;
      }

      const mesh = new THREE.Mesh(geometry, mat);

      // Random position around the center of the block
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.8,
        position.y + (Math.random() - 0.5) * 0.8,
        position.z + (Math.random() - 0.5) * 0.8
      );

      // Random velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 4,
        (Math.random() - 0.5) * 4
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5, // 0.5s ~ 1s
      });
    }
  }

  update(deltaTime: number) {
    const gravity = -9.8;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += deltaTime;

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        // Do not dispose material as it's shared with blocks
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity.y += gravity * deltaTime;
      p.mesh.position.addScaledVector(p.velocity, deltaTime);

      // Rotate particles slightly
      p.mesh.rotation.x += p.velocity.x * deltaTime;
      p.mesh.rotation.y += p.velocity.y * deltaTime;
      p.mesh.rotation.z += p.velocity.z * deltaTime;

      // shrink scale over time
      const scale = 1 - (p.life / p.maxLife);
      p.mesh.scale.set(scale, scale, scale);
    }
  }
}
