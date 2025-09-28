import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Movement constants
const BASE_SPEED = 0.08;
const GRAVITY = 0.01;
const JUMP_FORCE = 0.25;
const MOBILE_SPEED_MULTIPLIER = 1.0;
const FLY_SPEED = 0.2;

export class PlayerControls {
  constructor(scene, room, options = {}) {
    this.scene = scene;
    this.room = room;
    this.camera = options.camera || new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = options.renderer;
    this.domElement = this.renderer ? this.renderer.domElement : document.body;
    this.playerModel = options.playerModel;
    this.lastPosition = new THREE.Vector3();
    this.isMoving = false;
    
    // Player state
    this.velocity = new THREE.Vector3();
    this.canJump = true;
    this.keysPressed = new Set();
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.isFlying = false;
    this.pov = 'third'; // 'first' or 'third'
    this.speedMultiplier = 1.0;
    
    // Mobile control variables
    this.joystick = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchSensitivity = 0.005;
    this.moveVector = { x: 0, z: 0 };
    this.jumpButtonPressed = false;
    this.moveForward = 0;
    this.moveRight = 0;
    
    // Initial player position
    const initialPos = options.initialPosition || {};
    this.playerX = initialPos.x || (Math.random() * 10) - 5;
    this.playerY = initialPos.y || 50; // SPAWN IN THE SKY
    this.playerZ = initialPos.z || (Math.random() * 10) - 5;
    
    // Set initial player model position if it exists
    if (this.playerModel) {
      this.playerModel.position.set(this.playerX, this.playerY, this.playerZ);
      this.lastPosition.set(this.playerX, this.playerY, this.playerZ);
    }
    
    // Set camera to third-person perspective
    this.camera.position.set(this.playerX, this.playerY + 2, this.playerZ + 5);
    this.camera.lookAt(this.playerX, this.playerY + 1, this.playerZ);
    // Store the initial camera offset (relative to player's target position)
    this.cameraOffset = new THREE.Vector3();
    this.cameraOffset.copy(this.camera.position).sub(new THREE.Vector3(this.playerX, this.playerY + 1, this.playerZ));
    
    // Initialize controls based on device
    this.initializeControls();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // If room is provided, initialize multiplayer presence
    if (this.room) {
      // Initialize player presence in the room
      this.room.updatePresence({
        x: this.playerX,
        y: this.playerY,
        z: this.playerZ,
        rotation: 0,
        moving: false,
        isFlying: false,
        health: 100, // Initialize health
        connectedAt: Date.now() // Add connection timestamp
      });
    }
    
    this.enabled = true; // Add enabled flag for chat input
  }
  
  initializeControls() {
    if (this.isMobile) {
      this.initializeMobileControls();
    } else {
      this.initializeDesktopControls();
    }
  }
  
  initializeDesktopControls() {
    // Use OrbitControls for third-person view
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.9; // Prevent going below ground
    this.controls.minDistance = 3; // Minimum zoom distance
    this.controls.maxDistance = 10; // Maximum zoom distance
    
    // Increase sensitivity for Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      this.controls.rotateSpeed = 2.0; // Double sensitivity for Safari
    }
    
    // Add instructions for desktop
    const instructionsDiv = document.createElement("div");
    instructionsDiv.className = "instructions";
    instructionsDiv.innerHTML = "Click to begin. <br>Use WASD to move, Space to jump.";
    document.getElementById('game-container').appendChild(instructionsDiv);
    
    // Hide instructions on first click
    document.addEventListener('click', () => {
      if (document.querySelector(".instructions")) {
        document.querySelector(".instructions").style.display = 'none';
      }
    }, { once: true });
    
    // Update camera offset when controls change
    this.controls.addEventListener('change', () => {
      this.cameraOffset.copy(this.camera.position).sub(this.controls.target);
    });
  }
  
  initializeMobileControls() {
    // Setup camera position first with safe values
    this.camera.position.set(this.playerX, this.playerY + 2, this.playerZ + 5);
    this.camera.lookAt(this.playerX, this.playerY + 1, this.playerZ);
    
    // Initialize OrbitControls for camera rotation (similar to desktop)
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.9; // Prevent going below ground
    this.controls.minDistance = 3; // Minimum zoom distance
    this.controls.maxDistance = 10; // Maximum zoom distance
    
    // Store the initial camera offset for mobile too
    this.cameraOffset = new THREE.Vector3();
    this.cameraOffset.copy(this.camera.position).sub(new THREE.Vector3(this.playerX, this.playerY + 1, this.playerZ));
    
    // Update camera offset when controls change
    this.controls.addEventListener('change', () => {
      this.cameraOffset.copy(this.camera.position).sub(this.controls.target);
    });
    
    // Add joystick container for mobile
    const joystickContainer = document.getElementById('joystick-container');
    
    // Add jump button for mobile
    const jumpButton = document.getElementById('jump-button');
    
    // Jump button event listeners
    document.getElementById('jump-button').addEventListener('touchstart', (event) => {
      this.jumpButtonPressed = true;
      if (this.isFlying) {
        this.velocity.y = JUMP_FORCE;
      } else if (this.canJump) {
        this.velocity.y = JUMP_FORCE;
        this.canJump = false;
      }
      event.preventDefault();
    });
    
    document.getElementById('jump-button').addEventListener('touchend', (event) => {
      this.jumpButtonPressed = false;
      if(this.isFlying) {
        this.velocity.y = 0;
      }
      event.preventDefault();
    });
    
    // Initialize joystick with improved behavior
    this.joystick = nipplejs.create({
      zone: document.getElementById('joystick-container'),
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'rgba(255, 255, 255, 0.5)',
      size: 120
    });
    
    // Joystick move event with better movement handling
    this.joystick.on('move', (evt, data) => {
      const force = Math.min(data.force, 1); // Normalize force between 0 and 1
      const angle = data.angle.radian;
      
      // Calculate movement values using the joystick - fixed direction mapping
      this.moveForward = -Math.sin(angle) * force * BASE_SPEED * 5; 
      this.moveRight = Math.cos(angle) * force * BASE_SPEED * 5;    
    });
    
    // Joystick end event
    this.joystick.on('end', () => {
      console.log('Joystick released');
      this.moveForward = 0;
      this.moveRight = 0;
    });
  }
  
  setupEventListeners() {
    // Listen for key events (for desktop controls)
    document.addEventListener("keydown", (e) => {
      this.keysPressed.add(e.key.toLowerCase());
      
      // Handle jump with spacebar
      if (e.key === " " && this.canJump) {
        this.velocity.y = JUMP_FORCE;
        this.canJump = false;
      }

      if (e.key.toLowerCase() === 'v') {
        this.togglePOV();
      }
    });

    document.addEventListener("keyup", (e) => {
      this.keysPressed.delete(e.key.toLowerCase());
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.renderer) {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    });
  }

  togglePOV() {
    this.pov = this.pov === 'third' ? 'first' : 'third';
    const crosshair = document.querySelector('.crosshair');

    if (this.pov === 'first') {
        if (this.playerModel) {
            this.playerModel.visible = false;
        }
        this.controls.minDistance = 0;
        this.controls.maxDistance = 0.1; 
        if(crosshair) crosshair.style.display = 'block';

        // Snap camera to first person position
        this.camera.position.copy(this.controls.target);
        this.controls.update();

    } else { // 'third'
        if (this.playerModel) {
            this.playerModel.visible = true;
        }
        this.controls.minDistance = 3;
        this.controls.maxDistance = 10;
        if(crosshair) crosshair.style.display = 'none';

        // Restore camera position. OrbitControls will handle this smoothly if we just set the distances.
        // But let's give it a good starting point.
        const offset = new THREE.Vector3(0, 2, 5); // A default offset
        const newCameraPos = this.controls.target.clone().add(offset);
        this.camera.position.copy(newCameraPos);
        this.controls.update();
    }
  }

  teleport(x, y, z) {
    if (this.playerModel) {
        this.playerModel.position.set(x, y, z);
    }
    this.velocity.set(0, 0, 0); // Reset velocity to prevent falling issues
  }

  setFlying(isFlying) {
    this.isFlying = isFlying;
    if (!isFlying) {
      // When stopping flight, let gravity take over.
    } else {
      // When starting flight, cancel downward velocity.
      this.velocity.y = 0;
    }
  }

  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = multiplier;
  }
  
  processMovement() {
    // Skip movement processing if controls are disabled (e.g. when chat is open)
    if (!this.enabled) return;
    
    // Get current position
    let x = this.playerModel ? this.playerModel.position.x : this.camera.position.x;
    let y = this.playerModel ? this.playerModel.position.y : (this.camera.position.y - 1.2);
    let z = this.playerModel ? this.playerModel.position.z : this.camera.position.z;
    
    // Create movement vector
    const moveDirection = new THREE.Vector3();
    
    if (this.isMobile) {
      if (this.moveForward !== 0 || this.moveRight !== 0) {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        
        moveDirection.addScaledVector(forward, -this.moveForward); // Reversed direction
        moveDirection.addScaledVector(right, this.moveRight);
        moveDirection.normalize().multiplyScalar(BASE_SPEED * MOBILE_SPEED_MULTIPLIER); // Standardized speed
      }
    } else {
      if (this.keysPressed.has("w") || this.keysPressed.has("arrowup")) {
        moveDirection.z = 1; 
      } else if (this.keysPressed.has("s") || this.keysPressed.has("arrowdown")) {
        moveDirection.z = -1; 
      }
      
      if (this.keysPressed.has("a") || this.keysPressed.has("arrowleft")) {
        moveDirection.x = 1; 
      } else if (this.keysPressed.has("d") || this.keysPressed.has("arrowright")) {
        moveDirection.x = -1; 
      }
    }
    
    if (!this.isMobile && moveDirection.length() > 0) {
      moveDirection.normalize();
    }
    
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; 
    cameraDirection.normalize();
    
    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(this.camera.up, cameraDirection).normalize();
    
    const movement = new THREE.Vector3();
    if (!this.isMobile) {
      if (moveDirection.z !== 0) {
        movement.add(cameraDirection.clone().multiplyScalar(moveDirection.z));
      }
      if (moveDirection.x !== 0) {
        movement.add(rightVector.clone().multiplyScalar(moveDirection.x));
      }
      
      if (movement.length() > 0) {
        movement.normalize().multiplyScalar((this.isFlying ? FLY_SPEED : BASE_SPEED) * this.speedMultiplier);
      }
    } else {
      movement.copy(moveDirection);
      if(movement.length() > 0) {
          movement.normalize().multiplyScalar((this.isFlying ? FLY_SPEED : BASE_SPEED * MOBILE_SPEED_MULTIPLIER) * this.speedMultiplier);
      }
    }

    if (this.isFlying) {
      this.velocity.x = movement.x;
      this.velocity.z = movement.z;

      if (!this.isMobile) {
        this.velocity.y = 0;
        if (this.keysPressed.has(" ")) {
          this.velocity.y = FLY_SPEED;
        }
        if (this.keysPressed.has("shift")) {
          this.velocity.y = -FLY_SPEED;
        }
      }
      // Mobile vertical fly is handled by jump button events setting velocity.y

    } else {
      this.velocity.y -= GRAVITY;
      this.velocity.x = movement.x;
      this.velocity.z = movement.z;
    }
    
    let newX = x + this.velocity.x;
    let newY = y + this.velocity.y;
    let newZ = z + this.velocity.z;
    
    if (!this.isFlying) {
        const collidableMeshes = this.scene.children.filter(child =>
            child.userData.isBarrier && child.visible);

        const playerHeight = 1.8;
        const playerRadius = 0.4;
        const playerSize = new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2);

        // Create player's AABB for the next frame
        const playerBox = new THREE.Box3();
        playerBox.setFromCenterAndSize(
            new THREE.Vector3(newX, newY + playerHeight / 2, newZ),
            playerSize
        );
        
        let onGround = false;

        for (const mesh of collidableMeshes) {
            const meshBox = new THREE.Box3().setFromObject(mesh);
            if (playerBox.intersectsBox(meshBox)) {
                // Collision detected, find axis of least penetration to resolve
                const overlap = new THREE.Vector3();
                const centerPlayer = new THREE.Vector3();
                const centerMesh = new THREE.Vector3();
                playerBox.getCenter(centerPlayer);
                meshBox.getCenter(centerMesh);

                overlap.x = (playerSize.x / 2 + meshBox.getSize(new THREE.Vector3()).x / 2) - Math.abs(centerPlayer.x - centerMesh.x);
                overlap.y = (playerSize.y / 2 + meshBox.getSize(new THREE.Vector3()).y / 2) - Math.abs(centerPlayer.y - centerMesh.y);
                overlap.z = (playerSize.z / 2 + meshBox.getSize(new THREE.Vector3()).z / 2) - Math.abs(centerPlayer.z - centerMesh.z);

                // Find minimum overlap
                if (overlap.x < overlap.y && overlap.x < overlap.z) {
                    // Resolve X
                    const sign = Math.sign(centerPlayer.x - centerMesh.x);
                    newX += overlap.x * sign;
                    this.velocity.x = 0;
                } else if (overlap.y < overlap.z) {
                    // Resolve Y
                    const sign = Math.sign(centerPlayer.y - centerMesh.y);
                    newY += overlap.y * sign;
                    if (this.velocity.y < 0 && sign > 0) { // Landing on top
                        onGround = true;
                    }
                    this.velocity.y = 0;
                } else {
                    // Resolve Z
                    const sign = Math.sign(centerPlayer.z - centerMesh.z);
                    newZ += overlap.z * sign;
                    this.velocity.z = 0;
                }
                
                // Recalculate playerBox after resolution to handle multiple collisions
                 playerBox.setFromCenterAndSize(
                    new THREE.Vector3(newX, newY + playerHeight / 2, newZ),
                    playerSize
                );
            }
        }
        
        if (onGround) {
            this.canJump = true;
        }

        // Ground collision
        if (newY <= 0) {
            newY = 0;
            this.velocity.y = 0;
            this.canJump = true;
        }
    }
    
    const isMovingNow = movement.length() > 0 || Math.abs(this.velocity.y) > 0.01;
    this.isMoving = isMovingNow;
    
    if (this.playerModel) {
      this.playerModel.position.set(newX, newY, newZ);
      
      if (movement.length() > 0) {
        const angle = Math.atan2(movement.x, movement.z);
        this.playerModel.rotation.y = angle;
        
        const leftLeg = this.playerModel.getObjectByName("leftLeg");
        const rightLeg = this.playerModel.getObjectByName("rightLeg");
        
        if (leftLeg && rightLeg) {
          const walkSpeed = 5; 
          const walkAmplitude = 0.3;
          leftLeg.rotation.x = Math.sin(this.time * walkSpeed) * walkAmplitude;
          rightLeg.rotation.x = Math.sin(this.time * walkSpeed + Math.PI) * walkAmplitude;
        }
      } else {
        const leftLeg = this.playerModel.getObjectByName("leftLeg");
        const rightLeg = this.playerModel.getObjectByName("rightLeg");
        
        if (leftLeg && rightLeg) {
          leftLeg.rotation.x = 0;
          rightLeg.rotation.x = 0;
        }
      }
      
      const newTarget = new THREE.Vector3(this.playerModel.position.x, this.playerModel.position.y + 1, this.playerModel.position.z);
      if (this.controls) {
        this.controls.target.copy(newTarget);
      }
      this.camera.position.copy(newTarget).add(this.cameraOffset);
      
      if (this.room && (
          Math.abs(this.lastPosition.x - newX) > 0.01 ||
          Math.abs(this.lastPosition.y - newY) > 0.01 ||
          Math.abs(this.lastPosition.z - newZ) > 0.01 ||
          this.isMoving !== this.wasMoving
        )) {
        this.room.updatePresence({
          x: newX,
          y: newY,
          z: newZ,
          rotation: this.playerModel.rotation.y,
          moving: this.isMoving
        });
        
        this.lastPosition.set(newX, newY, newZ);
        this.wasMoving = this.isMoving;
      }
    } else {
      this.camera.position.set(newX, newY + 1.2, newZ);
    }
    
    if (this.isMobile && this.controls) {
      this.controls.target.set(newX, newY + 1, newZ);
      this.controls.update();
    } else if (!this.isMobile && this.controls) {
      this.controls.update();
    }
  }
  
  update() {
    const now = performance.now();
    this.time = (now * 0.01) % 1000; // Use performance.now() for consistent timing
    
    if (this.enabled) {
      this.processMovement();
    }
    
    // Always update controls even when movement is disabled
    if (this.controls) {
      this.controls.update();
    }
  }
  
  getCamera() {
    return this.camera;
  }
  
  getPlayerModel() {
    return this.playerModel;
  }
}