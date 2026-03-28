import TWEEN from "@tweenjs/tween.js";
import { Howl, Howler } from "howler";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module";

import audioManager from "./audio/AudioManager";
import { createUI } from "./GUI";
import { Physics } from "./Physics";
import { Player } from "./Player";
import { numberWithCommas } from "./util";
import { World } from "./World";
import { ParticleSystem } from "./Particles";
import { BlockID } from "./Block";
import { BlockFactory } from "./Block/BlockFactory";
import { PlayerModel } from "./PlayerModel";

const vertexShader = `
  varying vec3 worldPosition;
  void main() {
      vec4 mPosition = modelMatrix * vec4( position, 1.0 );
      worldPosition = mPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const fragmentShader = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;

  varying vec3 worldPosition;

  void main() {

    float h = normalize( worldPosition + offset ).y;
    gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( h, exponent ), 0.0 ) ), 1.0 );

  }
`;

export default class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private orbitCamera!: THREE.PerspectiveCamera;

  private controls!: OrbitControls;
  private stats!: any;
  private clock!: THREE.Clock;

  private sunSettings = {
    distance: 400,
    cycleLength: 600,
  };

  private sky!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sun!: THREE.DirectionalLight;
  private sunHelper!: THREE.DirectionalLightHelper;
  private shadowHelper!: THREE.CameraHelper;
  private world!: World;
  private player!: Player;
  private physics!: Physics;
  private particleSystem!: ParticleSystem;
  private playerModel!: PlayerModel;

  private isLeftClickDown = false;
  private isRightClickDown = false;
  private lastBreakTime = 0;
  private lastPlaceTime = 0;
  private lastPunchTime = 0;

  private previousTime = 0;
  private lastShadowUpdate = 0;

  private dayColor = new THREE.Color(0xc0d8ff);
  private nightColor = new THREE.Color(0x10121e);
  private sunsetColor = new THREE.Color(0xcc7a00);

  constructor() {
    this.previousTime = performance.now();
    this.clock = new THREE.Clock();
    this.initMainMenu();
  }

  initMainMenu() {
    const mainMenu = document.getElementById("main-menu");
    const loadingScreen = document.getElementById("loading");
    const startGameButton = document.getElementById("start-game");
    startGameButton?.addEventListener("click", () => {
      if (mainMenu) mainMenu.style.display = "none";
      if (loadingScreen) loadingScreen.style.display = "block";
      audioManager.play("gui.button.press");

      // Attempt to go fullscreen and lock to landscape on mobile
      if (window.matchMedia("(pointer: coarse), (max-width: 1024px)").matches) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().then(() => {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch((err) => console.warn(err));
            }
          }).catch(err => console.warn("Fullscreen request failed", err));
        }
      }

      this.initScene();
      this.initStats();
      this.initListeners();
      this.initAudio();
    });

    const githubButton = document.getElementById("github");
    githubButton?.addEventListener("click", () => {
      audioManager.play("gui.button.press");
      window.open("https://github.com/0kzh/minicraft");
    });

    const websiteButton = document.getElementById("website");
    websiteButton?.addEventListener("click", () => {
      audioManager.play("gui.button.press");
      window.open("https://kelvinzhang.com");
    });
  }

  initStats() {
    this.stats = new (Stats as any)();
    document.body.appendChild(this.stats.dom);
  }

  initScene() {
    this.scene = new THREE.Scene();

    this.orbitCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight
    );
    this.orbitCamera.position.set(-32, 64, -32);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x80abfe);

    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(
      this.orbitCamera,
      this.renderer.domElement
    );
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // Skybox
    const uniforms = {
      topColor: { type: "c", value: new THREE.Color(0xa0c0ff) },
      bottomColor: { type: "c", value: new THREE.Color(0xffffff) },
      offset: { type: "f", value: 99 },
      exponent: { type: "f", value: 0.3 },
    };

    const skyGeo = new THREE.SphereGeometry(4000, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: uniforms,
      side: THREE.BackSide,
    });

    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    this.scene.fog = new THREE.Fog(0x80a0e0, 50, 100);
    this.scene.fog.color.copy(uniforms.bottomColor.value);

    this.sun = new THREE.DirectionalLight();
    // this.sun.position.set(50, 50, 50);
    this.sun.intensity = 1.5;
    this.sun.castShadow = true;

    // Set the size of the sun's shadow box
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.camera.near = 0.1;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.005;
    this.sun.shadow.mapSize = new THREE.Vector2(512, 512);

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sunHelper = new THREE.DirectionalLightHelper(this.sun);
    this.sunHelper.visible = false;
    this.scene.add(this.sunHelper);

    this.shadowHelper = new THREE.CameraHelper(this.sun.shadow.camera);
    this.shadowHelper.visible = false;
    this.scene.add(this.shadowHelper);

    const ambient = new THREE.AmbientLight();
    ambient.intensity = 0.2;
    this.scene.add(ambient);

    this.world = new World(0, this.scene);
    this.scene.add(this.world);

    this.player = new Player(this.scene);
    this.physics = new Physics(this.scene);
    this.particleSystem = new ParticleSystem(this.scene);

    this.playerModel = new PlayerModel();
    this.scene.add(this.playerModel);

    // First person arm
    this.player.camera.add(this.playerModel.rightArm);
    this.playerModel.rightArm.position.set(0.4, -0.4, -0.5); // position relative to camera
    this.playerModel.rightArm.rotation.set(1.5, 0.5, 0);

    this.updateSunPosition(0);

    createUI(
      this.world,
      this.player,
      this.physics,
      this.scene,
      this.renderer,
      this.sunSettings,
      this.sunHelper,
      this.shadowHelper
    );

    this.draw();
  }

  initAudio() {
    const sound = new Howl({
      src: ["./audio/ambient.mp3"],
      loop: true,
    });
    sound.play();
  }

  breakBlock() {
    if (this.player.selectedCoords) {
      const blockX = Math.round(this.player.selectedCoords.x);
      const blockY = Math.round(this.player.selectedCoords.y);
      const blockZ = Math.round(this.player.selectedCoords.z);

      const blockId = this.world.getBlock(blockX, blockY, blockZ)?.block;

      if (blockId) {
        const material = BlockFactory.getBlock(blockId).material;
        this.particleSystem.spawn(new THREE.Vector3(blockX, blockY, blockZ), material);
      }

      this.world.removeBlock(
        blockX,
        blockY,
        blockZ
      );

      this.lastBreakTime = performance.now();
    }
  }

  placeBlock() {
    if (this.player.blockPlacementCoords && this.player.activeBlockId != null && this.player.activeBlockId !== BlockID.Air) {
      const blockPos = new THREE.Vector3(
        Math.round(this.player.blockPlacementCoords.x),
        Math.round(this.player.blockPlacementCoords.y),
        Math.round(this.player.blockPlacementCoords.z)
      );

      // Use bounding boxes for collision check
      const blockBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(blockPos.x + 0.5, blockPos.y + 0.5, blockPos.z + 0.5),
        new THREE.Vector3(1, 1, 1)
      );

      const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(
          this.player.position.x,
          this.player.position.y - this.player.height / 2,
          this.player.position.z
        ),
        new THREE.Vector3(this.player.radius * 2, this.player.height, this.player.radius * 2)
      );

      if (playerBox.intersectsBox(blockBox)) return;

      this.world.addBlock(
        blockPos.x,
        blockPos.y,
        blockPos.z,
        this.player.activeBlockId
      );

      this.lastPlaceTime = performance.now();
    }
  }

  onMouseDown(event: MouseEvent) {
    if (this.player.controls.isLocked) {
      if (event.button === 0) {
        // Left click
        this.isLeftClickDown = true;
        this.lastPunchTime = performance.now();
        this.breakBlock();
      } else if (event.button === 2) {
        // Right click
        this.isRightClickDown = true;
        this.lastPunchTime = performance.now();
        this.placeBlock();
      }
    }
  }

  initListeners() {
    window.addEventListener("resize", this.onWindowResize.bind(this), false);
    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    document.addEventListener("mouseup", (event: MouseEvent) => {
      if (event.button === 0) {
        this.isLeftClickDown = false;
      } else if (event.button === 2) {
        this.isRightClickDown = false;
      }
    }, false);

    // Mobile Action Listeners
    const btnLeftClick = document.getElementById("btn-left-click");
    const btnRightClick = document.getElementById("btn-right-click");
    const btnJump = document.getElementById("btn-jump");

    if (btnLeftClick) {
      btnLeftClick.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.isLeftClickDown = true;
        this.lastPunchTime = performance.now();
        this.breakBlock();
      });
      btnLeftClick.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.isLeftClickDown = false;
      });
    }

    if (btnRightClick) {
      btnRightClick.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.isRightClickDown = true;
        this.lastPunchTime = performance.now();
        this.placeBlock();
      });
      btnRightClick.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.isRightClickDown = false;
      });
    }

    if (btnJump) {
      btnJump.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.player.spacePressed = true;
      });
      btnJump.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.player.spacePressed = false;
      });
    }

    // Mobile Movement Listeners (Joystick)
    const joystickPad = document.getElementById("mobile-joystick");
    const joystickKnob = document.getElementById("joystick-knob");

    if (joystickPad && joystickKnob) {
      let touchId: number | null = null;
      let center = new THREE.Vector2();

      const resetJoystick = () => {
        touchId = null;
        joystickKnob.style.transform = `translate(-50%, -50%)`;
        this.player.joystickInput.set(0, 0);
      };

      joystickPad.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (touchId === null) {
          const touch = e.changedTouches[0];
          touchId = touch.identifier;
          const rect = joystickPad.getBoundingClientRect();
          center.set(rect.left + rect.width / 2, rect.top + rect.height / 2);

          let dx = touch.clientX - center.x;
          let dy = touch.clientY - center.y;

          const maxDist = rect.width / 2;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
          }

          joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          this.player.joystickInput.set(dx / maxDist, dy / maxDist);
        }
      });

      joystickPad.addEventListener("touchmove", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            const touch = e.changedTouches[i];
            const rect = joystickPad.getBoundingClientRect();
            let dx = touch.clientX - center.x;
            let dy = touch.clientY - center.y;

            const maxDist = rect.width / 2;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > maxDist) {
              dx = (dx / dist) * maxDist;
              dy = (dy / dist) * maxDist;
            }

            joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            this.player.joystickInput.set(dx / maxDist, dy / maxDist);
          }
        }
      });

      joystickPad.addEventListener("touchend", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            resetJoystick();
          }
        }
      });

      joystickPad.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            resetJoystick();
          }
        }
      });
    }

    // Touch camera rotation
    let cameraTouchId: number | null = null;
    let lastTouchPos = new THREE.Vector2();

    document.addEventListener("touchstart", (e) => {
      // Ignore if clicking UI
      if ((e.target as HTMLElement).closest('#ui')) return;

      if (cameraTouchId === null) {
        const touch = e.changedTouches[0];
        cameraTouchId = touch.identifier;
        lastTouchPos.set(touch.clientX, touch.clientY);

        // Emulate pointer lock so we stay in first person
        if (!this.player.controls.isLocked) {
          this.player.controls.lock();
        }
      }
    }, { passive: false });

    document.addEventListener("touchmove", (e) => {
      if (cameraTouchId !== null && this.player.controls.isLocked) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === cameraTouchId) {
            const touch = e.changedTouches[i];

            const dx = touch.clientX - lastTouchPos.x;
            const dy = touch.clientY - lastTouchPos.y;

            lastTouchPos.set(touch.clientX, touch.clientY);

            // Adjust sensitivity as needed
            const sensitivity = 0.005;

            // The PointerLockControls uses camera.rotation directly but exposes a more complex internal rotation mapping.
            // A simpler way to update the rotation through its public interface without triggering events manually
            // is to modify the camera directly if it's not overriding it strictly.
            // Alternatively, rotate the camera itself, taking into account Euler limits.

            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(this.player.camera.quaternion);

            euler.y -= dx * sensitivity;
            euler.x -= dy * sensitivity;

            // Clamp pitch
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

            this.player.camera.quaternion.setFromEuler(euler);
          }
        }
      }
    }, { passive: false });

    const stopCameraTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === cameraTouchId) {
          cameraTouchId = null;
        }
      }
    };

    document.addEventListener("touchend", stopCameraTouch, { passive: false });
    document.addEventListener("touchcancel", stopCameraTouch, { passive: false });
  }

  onWindowResize() {
    this.orbitCamera.aspect = window.innerWidth / window.innerHeight;
    this.orbitCamera.updateProjectionMatrix();
    this.player.camera.aspect = window.innerWidth / window.innerHeight;
    this.player.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateSkyColor() {
    const elapsedTime = this.clock.getElapsedTime();
    const cycleDuration = this.sunSettings.cycleLength; // Duration of a day in seconds
    const cycleTime = elapsedTime % cycleDuration;

    let topColor: THREE.Color;
    let bottomColor: THREE.Color;

    if (cycleTime < cycleDuration / 2) {
      // Day time
      topColor = this.dayColor
        .clone()
        .lerp(this.nightColor, cycleTime / (cycleDuration / 2));
      this.sun.intensity = 1 - cycleTime / (cycleDuration / 2); // Sun intensity decreases as the day progresses
    } else {
      // Night time
      topColor = this.nightColor
        .clone()
        .lerp(
          this.dayColor,
          (cycleTime - cycleDuration / 2) / (cycleDuration / 2)
        );
      this.sun.intensity =
        (cycleTime - cycleDuration / 2) / (cycleDuration / 2); // Sun intensity increases as the night progresses
    }

    const dayStart = 0;
    const sunsetStart = cycleDuration * 0.4; // Start sunset at 40% of the cycle
    const nightStart = cycleDuration * 0.5; // Start night at 50% of the cycle
    const sunriseStart = cycleDuration * 0.9; // Start sunrise at 90% of the cycle

    if (cycleTime >= dayStart && cycleTime < sunsetStart) {
      // Day time
      bottomColor = this.dayColor
        .clone()
        .lerp(
          this.sunsetColor,
          (cycleTime - dayStart) / (sunsetStart - dayStart)
        );
    } else if (cycleTime >= sunsetStart && cycleTime < nightStart) {
      // Sunset
      bottomColor = this.sunsetColor
        .clone()
        .lerp(
          this.nightColor,
          (cycleTime - sunsetStart) / (nightStart - sunsetStart)
        );
    } else if (cycleTime >= nightStart && cycleTime < sunriseStart) {
      // Night time
      bottomColor = this.nightColor
        .clone()
        .lerp(
          this.sunsetColor,
          (cycleTime - nightStart) / (sunriseStart - nightStart)
        );
    } else {
      // Sunrise
      bottomColor = this.sunsetColor
        .clone()
        .lerp(
          this.dayColor,
          (cycleTime - sunriseStart) / (cycleDuration - sunriseStart)
        );
    }

    this.sky.material.uniforms.topColor.value = topColor;
    this.sky.material.uniforms.bottomColor.value = bottomColor;

    // Desaturate the fog slightly
    this.scene.fog?.color.copy(topColor).multiplyScalar(0.2);

    if (
      performance.now() - this.lastShadowUpdate <
      this.sunSettings.cycleLength
    )
      return;

    const sunAngle =
      ((2 * Math.PI) / cycleDuration) * (cycleTime + cycleDuration / 6); // Calculate the angle of the sun based on the cycle time with a phase shift of T/4
    this.updateSunPosition(sunAngle);

    this.lastShadowUpdate = performance.now();
  }

  updateSunPosition(angle: number) {
    const sunX = this.sunSettings.distance * Math.cos(angle); // Calculate the X position of the sun
    const sunY = this.sunSettings.distance * Math.sin(angle); // Calculate the Y position of the sun
    this.sun.position.set(sunX, sunY, this.player.camera.position.z); // Update the position of the sun
    this.sun.position.add(this.player.camera.position);

    this.sun.target.position.copy(this.player.camera.position);
    this.sun.target.updateMatrixWorld();

    this.sunHelper.update();
    this.shadowHelper.update();
  }

  draw() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.previousTime) / 1000;

    requestAnimationFrame(() => {
      this.draw();
    });

    this.updateSkyColor();

    this.physics.update(deltaTime, this.player, this.world);
    this.world.update(this.player);
    this.particleSystem.update(deltaTime);

    // Continuous block breaking
    if (this.isLeftClickDown && currentTime - this.lastBreakTime > 250) {
      if (this.player.controls.isLocked) {
        this.lastPunchTime = performance.now();
        this.breakBlock();
      }
    }

    // Continuous block placing
    if (this.isRightClickDown && currentTime - this.lastPlaceTime > 250) {
      if (this.player.controls.isLocked) {
        this.lastPunchTime = performance.now();
        this.placeBlock();
      }
    }

    // Update player model visibility and position
    if (this.player.activeBlockId != null && this.player.activeBlockId !== BlockID.Air) {
      const blockMaterial = BlockFactory.getBlock(this.player.activeBlockId).material;
      // Handle array of materials (e.g. Grass block)
      if (Array.isArray(blockMaterial)) {
        this.playerModel.heldItem.material = blockMaterial;
      } else {
        this.playerModel.heldItem.material = blockMaterial;
      }
      this.playerModel.heldItem.visible = true;
    } else {
      this.playerModel.heldItem.visible = false;
    }

    if (this.player.controls.isLocked) {
      // First person view
      this.playerModel.visible = false; // Hide 3rd person model
      this.playerModel.rightArm.visible = true; // Show 1st person arm

      this.player.camera.add(this.playerModel.rightArm);

      const velocityLength = Math.sqrt(
        this.player.velocity.x * this.player.velocity.x +
        this.player.velocity.z * this.player.velocity.z
      );

      // Base position and bobbing effect
      let bobbingY = 0;
      let bobbingX = 0;
      if (velocityLength > 0.1) {
        bobbingY = Math.sin(currentTime / 75) * 0.05;
        bobbingX = Math.cos(currentTime / 150) * 0.05;
      }
      this.playerModel.rightArm.position.set(0.4 + bobbingX, -0.4 + bobbingY, -0.5);

      // Base rotation and punching effect
      let punchRotationX = 0;
      if (currentTime - this.lastPunchTime < 200) {
        punchRotationX = -Math.sin(((currentTime - this.lastPunchTime) / 200) * Math.PI) * 0.5;
      }

      this.playerModel.rightArm.rotation.set(1.5 + punchRotationX, 0.5, 0);
    } else {
      // Third person / Orbit view
      this.playerModel.visible = true;

      // Move right arm back to body
      this.playerModel.add(this.playerModel.rightArm);
      this.playerModel.rightArm.position.set(-0.375, 1.5, 0);
      this.playerModel.rightArm.rotation.set(0, 0, 0);

      // sync position with player
      this.playerModel.position.copy(this.player.position);
      this.playerModel.position.y -= this.player.height; // set to feet

      // get Y rotation from player's camera to face correct direction
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.player.camera.quaternion);
      this.playerModel.rotation.y = euler.y;

      // Update animation based on velocity
      const velocityLength = Math.sqrt(
        this.player.velocity.x * this.player.velocity.x +
        this.player.velocity.z * this.player.velocity.z
      );
      this.playerModel.updateAnimation(currentTime / 1000, velocityLength, this.player.isSprinting);
    }

    // update triangle count
    const triangleCount = document.getElementById("triangle-count");
    if (triangleCount) {
      triangleCount.innerHTML = `triangles: ${numberWithCommas(
        this.renderer.info.render.triangles
      )}`;
    }

    const renderCalls = document.getElementById("render-calls");
    if (renderCalls) {
      renderCalls.innerHTML = `draw calls: ${numberWithCommas(
        this.renderer.info.render.calls
      )}`;
    }

    // if (this.controls) {
    //   this.controls.autoRotate = false;
    //   this.controls.autoRotateSpeed = 2.0;
    // }

    if (this.stats) this.stats.update();

    if (this.controls) this.controls.update();

    TWEEN.update();

    this.renderer.render(
      this.scene,
      this.player.controls.isLocked ? this.player.camera : this.orbitCamera
    );

    this.previousTime = currentTime;
  }
}
