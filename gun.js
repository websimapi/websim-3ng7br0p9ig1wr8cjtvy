import * as THREE from "three";

const PROJECTILE_SPEED = 1.5;
const PROJECTILE_LIFETIME = 2000; // in ms
const PROJECTILE_DAMAGE = 10;
const FIRE_RATE = 200; // ms between shots

const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const projectileGeometry = new THREE.SphereGeometry(0.1, 8, 8);

export class Gun {
    constructor(scene, room, camera) {
        this.scene = scene;
        this.room = room;
        this.camera = camera;
        this.projectiles = new Map();
        this.lastShotTime = 0;
    }

    fire() {
        const now = Date.now();
        if (now - this.lastShotTime < FIRE_RATE) {
            return;
        }
        this.lastShotTime = now;

        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        const startPosition = new THREE.Vector3();
        this.camera.getWorldPosition(startPosition);
        
        // Move start position slightly in front of camera
        startPosition.add(direction.clone().multiplyScalar(1.5));

        // Send fire event to other players
        this.room.send({
            type: "fire",
            shooterId: this.room.clientId,
            position: { x: startPosition.x, y: startPosition.y, z: startPosition.z },
            direction: { x: direction.x, y: direction.y, z: direction.z },
        });
    }

    createProjectile(data) {
        const { shooterId, position, direction } = data;
        const projectileId = `proj-${Date.now()}-${Math.random()}`;

        const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
        projectileMesh.position.set(position.x, position.y, position.z);
        
        const velocity = new THREE.Vector3(direction.x, direction.y, direction.z).normalize().multiplyScalar(PROJECTILE_SPEED);

        this.scene.add(projectileMesh);

        const projectile = {
            id: projectileId,
            mesh: projectileMesh,
            velocity: velocity,
            shooterId: shooterId,
            spawnTime: Date.now(),
        };

        this.projectiles.set(projectileId, projectile);
    }

    update(otherPlayers) {
        const now = Date.now();
        for (const [id, projectile] of this.projectiles.entries()) {
            // Move projectile
            projectile.mesh.position.add(projectile.velocity);

            // Check lifetime
            if (now - projectile.spawnTime > PROJECTILE_LIFETIME) {
                this.scene.remove(projectile.mesh);
                this.projectiles.delete(id);
                continue;
            }

            // Check for collision if this client is the shooter
            if (projectile.shooterId === this.room.clientId) {
                for (const targetId in otherPlayers) {
                    if (targetId === this.room.clientId) continue;

                    const targetPlayer = otherPlayers[targetId];
                    const distance = projectile.mesh.position.distanceTo(targetPlayer.position);

                    if (distance < 1.5) { // Hitbox radius
                        this.room.requestPresenceUpdate(targetId, {
                            type: 'damage',
                            amount: PROJECTILE_DAMAGE,
                            from: this.room.clientId
                        });
                        
                        // Remove projectile on hit
                        this.scene.remove(projectile.mesh);
                        this.projectiles.delete(id);
                        break; 
                    }
                }
            }
        }
    }
}