import Renderer from './Renderer';
import Camera from './Camera';
import InputHandler from './InputHandler';
import EntityPool from './EntityPool';
import WorldManager from './WorldManager';
import PerfMeter from '../utils/perf';
import IndexManager from '../spatial/IndexManager';
import PerfRecorder from '../utils/recorder';
import { mulberry32, seedStringToNumber } from '../utils/prng';

const PHYSICS_STEP = 1000 / 60;
const MAX_ACCUM = PHYSICS_STEP * 5;

export default class SimulationController {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.input = new InputHandler(canvas);
    this.renderer = new Renderer(canvas);
    this.camera = new Camera();

    this._initializeWeapons();

    this.entities = new EntityPool(config.entityPoolSize || 5000);
    this.world = new WorldManager({
      chunkSize: config.chunkSize || 16,
      tileSize: config.tileSize || 32,
      seed: config.seed || 'nit-trichy-premium-2028',
      poolOptions: {
        workers: config.workerCount,
        verbose: !!config.verbose,
      },
    });

    this.perf = new PerfMeter();
    this.queryTime = 0;
    this.running = false;
    this._raf = null;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this.debug = config.debug || false;

    this.indexManager = new IndexManager({
      type: config.indexType || 'grid',
      gridCellSize: config.gridCellSize || 128,
      quadtreeCapacity: config.quadtreeCapacity || 8,
      quadtreeMaxDepth: config.quadtreeMaxDepth || 6,
      kdtreeCapacity: config.kdtreeCapacity || 16,
    });

    this.rebuildInterval = config.rebuildInterval || 1;
    this._frameCount = 0;

    this.insertedEntityIds = new Set();
    this.prevPositions = new Map();

    this.recentSamples = [];
    this.recorder = new PerfRecorder();
    this.experimentRunning = false;
    this.currentExperiment = null;

    this.gameState = 'playing';
    this.score = 0;
    this.zombiesKilled = 0;
    this.collectiblesFound = 0;
    this.gameTime = 0;
    this.nitTrichyEasterEggFound = false;

    this.player = null;
    this.playerId = null;

    this.benchmarkPresets = this._initializeBenchmarkPresets();

    this._initializeGameWorld();

    this._loop = this._loop.bind(this);

    if (typeof this.camera.zoom === 'undefined') {
      this.camera.zoom = 1.5;
    }

    console.log('Premium SimulationController initialized with 3 data structures');
  }

  _initializeWeapons() {
    this.weapons = {
      current: 'pistol',
      available: {
        pistol: {
          name: 'Pistol',
          damage: 25,
          fireRate: 300,
          range: 400,
          projectileSpeed: 600,
          ammo: 30,
          maxAmmo: 30,
          color: '#ff4444',
          unlockScore: 0,
        },
        shotgun: {
          name: 'Shotgun',
          damage: 15,
          fireRate: 800,
          range: 200,
          projectileSpeed: 500,
          ammo: 8,
          maxAmmo: 8,
          spread: 0.3,
          color: '#ff6b35',
          unlockScore: 500,
        },
        rifle: {
          name: 'Rifle',
          damage: 40,
          fireRate: 500,
          range: 600,
          projectileSpeed: 800,
          ammo: 20,
          maxAmmo: 20,
          color: '#4ecdc4',
          unlockScore: 1000,
        },
      },
    };

    this.meleeWeapon = {
      name: 'Combat Knife',
      damage: 50,
      range: 40,
      cooldown: 500,
    };

    this.lastMeleeTime = 0;
  }

  _initializeBenchmarkPresets() {
    return {
      uniform_100: {
        name: 'Uniform Distribution - 100 Entities',
        entityCount: 100,
        preset: 'uniform',
        description: 'Evenly distributed entities across the entire world',
      },
      uniform_1000: {
        name: 'Uniform Distribution - 1000 Entities',
        entityCount: 1000,
        preset: 'uniform',
        description: 'Stress test with evenly distributed entities',
      },
      uniform_4000: {
        name: 'Uniform Distribution - 4000 Entities',
        entityCount: 4000,
        preset: 'uniform',
        description: 'Heavy load test with uniform distribution',
      },
      clustered_500: {
        name: 'Clustered Distribution - 500 Entities',
        entityCount: 500,
        preset: 'cluster',
        description: 'Entities grouped in tight clusters',
      },
      line_300: {
        name: 'Line Distribution - 300 Entities',
        entityCount: 300,
        preset: 'line',
        description: 'Entities arranged in long thin lines',
      },
      mixed_800: {
        name: 'Mixed Distribution - 800 Entities',
        entityCount: 800,
        preset: 'mixed',
        description: 'Combination of clusters and sparse areas',
      },
    };
  }

  _initializeGameWorld() {
    this.createPlayer();
    this.spawnInitialGameElements();
    this.centerCameraOnPlayer();
  }
  createPlayer() {
    const player = this.entities.acquire();
    let spawnX = 0;
    let spawnY = 0;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      spawnX = (Math.random() - 0.5) * 400;
      spawnY = (Math.random() - 0.5) * 400;

      const tileType = this.world.getTileAtWorld(spawnX, spawnY);
      const tileName = this.world._getTileName(tileType);

      const safeTiles = [3, 4, 6, 9]; 
      if (safeTiles.includes(tileType)) {
        console.log(
          `🎯 Player spawned on safe ground: ${tileName} at (${spawnX.toFixed(1)}, ${spawnY.toFixed(
            1
          )})`
        );
        break;
      }

      attempts++;

      if (attempts === maxAttempts) {
        console.warn('⚠️ Could not find safe spawn position after 50 attempts, using default');
        spawnX = 100;
        spawnY = 100;
      }
    }

    player.x = spawnX;
    player.y = spawnY;
    player.vx = 0;
    player.vy = 0;
    player.r = 12;
    player.type = 'player';
    player.health = 100;
    player.maxHealth = 100;
    player.speed = 350;
    player.lastShotTime = 0;
    player.lastMeleeTime = 0;
    player.color = '#FFD166';
    player.active = true;
    player.weapon = 'pistol';
    player.ammo = this.weapons.available.pistol.ammo;
    player.direction = { x: 0, y: -1 };
    player.invulnerable = false;
    player.lastHitTime = 0;

    this.player = player;
    this.playerId = player.id;

    this.world.getPlayerTileInfo(player.x, player.y);

    this._maybeInsertEntityInIndex(player);

    return player;
  }
  spawnInitialGameElements() {
    for (let i = 0; i < 8; i++) {
      this.spawnZombie();
    }

    for (let i = 0; i < 5; i++) {
      this.spawnCollectible();
    }

    this.spawnNITEasterEgg();

    for (let i = 0; i < 3; i++) {
      this.spawnAmmoCrate();
    }
  }
  spawnZombie(nearPlayer = true) {
    const player = this.player;
    if (!player) return null;

    const zombie = this.entities.acquire();

    const types = [
      {
        name: 'Walker',
        health: 40,
        speed: 60,
        color: '#4a7c59',
        damage: 10,
        score: 50,
        scale: 1.0,
      },
      { name: 'Brute', health: 80, speed: 40, color: '#8b4513', damage: 15, score: 75, scale: 1.2 },
      {
        name: 'Runner',
        health: 25,
        speed: 100,
        color: '#ff6b6b',
        damage: 5,
        score: 100,
        scale: 0.9,
      },
    ];

    const zombieType = types[Math.floor(Math.random() * types.length)];

    if (nearPlayer) {
      let spawnX, spawnY;
      let attempts = 0;

      do {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 200;
        spawnX = player.x + Math.cos(angle) * distance;
        spawnY = player.y + Math.sin(angle) * distance;
        attempts++;
      } while (this.world.getTileAtWorld(spawnX, spawnY) <= 2 && attempts < 20);

      zombie.x = spawnX;
      zombie.y = spawnY;
    } else {
      let spawnX, spawnY;
      let attempts = 0;

      do {
        spawnX = (Math.random() - 0.5) * 2000;
        spawnY = (Math.random() - 0.5) * 2000;
        attempts++;
      } while (this.world.getTileAtWorld(spawnX, spawnY) <= 2 && attempts < 20);

      zombie.x = spawnX;
      zombie.y = spawnY;
    }

    zombie.vx = 0;
    zombie.vy = 0;
    zombie.r = 8 * zombieType.scale;
    zombie.type = 'zombie';
    zombie.zombieType = zombieType.name;
    zombie.health = zombieType.health;
    zombie.maxHealth = zombieType.health;
    zombie.speed = zombieType.speed;
    zombie.damage = zombieType.damage;
    zombie.scoreValue = zombieType.score;
    zombie.lastAttackTime = 0;
    zombie.color = zombieType.color;
    zombie.active = true;

    this._maybeInsertEntityInIndex(zombie);
    return zombie;
  }

  spawnCollectible() {
    const player = this.player;
    if (!player) return null;

    const collectible = this.entities.acquire();

    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 300;
    collectible.x = player.x + Math.cos(angle) * distance;
    collectible.y = player.y + Math.sin(angle) * distance;
    collectible.vx = 0;
    collectible.vy = 0;
    collectible.r = 6;
    collectible.type = 'collectible';
    collectible.color = '#ffd700';
    collectible.collected = false;
    collectible.active = true;
    collectible.glow = true;
    collectible.glowPhase = Math.random() * Math.PI * 2;

    this._maybeInsertEntityInIndex(collectible);
    return collectible;
  }

  spawnAmmoCrate() {
    const player = this.player;
    if (!player) return null;

    const crate = this.entities.acquire();

    const angle = Math.random() * Math.PI * 2;
    const distance = 200 + Math.random() * 400;
    crate.x = player.x + Math.cos(angle) * distance;
    crate.y = player.y + Math.sin(angle) * distance;
    crate.vx = 0;
    crate.vy = 0;
    crate.r = 10;
    crate.type = 'ammoCrate';
    crate.color = '#8B4513';
    crate.collected = false;
    crate.active = true;
    crate.weaponType = Object.keys(this.weapons.available)[
      Math.floor(Math.random() * Object.keys(this.weapons.available).length)
    ];
    crate.ammoAmount = 15;

    this._maybeInsertEntityInIndex(crate);
    return crate;
  }

  spawnNITEasterEgg() {
    const easterEgg = this.entities.acquire();

    easterEgg.x = 250 + Math.random() * 100;
    easterEgg.y = -180 + Math.random() * 100;
    easterEgg.vx = 0;
    easterEgg.vy = 0;
    easterEgg.r = 8;
    easterEgg.type = 'nitEgg';
    easterEgg.color = '#8B0000';
    easterEgg.collected = false;
    easterEgg.active = true;
    easterEgg.glow = true;
    easterEgg.glowColor = '#FF0000';
    easterEgg.glowPhase = 0;

    this._maybeInsertEntityInIndex(easterEgg);
    return easterEgg;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _loop() {
    if (!this.running) return;

    this._raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    let frameTime = Math.min(now - this._lastTime, 1000);
    this._lastTime = now;
    this._accumulator += frameTime;

    if (this._accumulator > MAX_ACCUM) {
      this._accumulator = MAX_ACCUM;
    }

    this.input.updateMouseWorldPosition(this.camera, this.canvas);

    this._applyInputToPlayer();

    while (this._accumulator >= PHYSICS_STEP) {
      this._update(PHYSICS_STEP);
      this._accumulator -= PHYSICS_STEP;
    }

    const alpha = this._accumulator / PHYSICS_STEP;
    this._render(alpha);

    this.perf.recordFrame(frameTime);
    this._recordSample();

    this.gameTime += frameTime;
  }

  _applyInputToPlayer() {
    if (this.gameState !== 'playing') return;

    const player = this.player;
    if (!player) return;

    let intendedVx = 0;
    let intendedVy = 0;

    if (this.input.isDown('ArrowLeft') || this.input.isDown('a')) intendedVx = -player.speed;
    if (this.input.isDown('ArrowRight') || this.input.isDown('d')) intendedVx = player.speed;
    if (this.input.isDown('ArrowUp') || this.input.isDown('w')) intendedVy = -player.speed;
    if (this.input.isDown('ArrowDown') || this.input.isDown('s')) intendedVy = player.speed;

    if (this.input.isDown('p')) {
      this.debugPlayerPosition();
    }

    const bypassCollision = this.input.isDown('Shift');

    if (bypassCollision) {
      player.vx = intendedVx;
      player.vy = intendedVy;
      console.log('🔓 Collision bypass enabled (Shift held)');
    } else {
      const newX = player.x + intendedVx * (1 / 60);
      const newY = player.y + intendedVy * (1 / 60);

      const collision = this.world.checkCollision(newX, newY, player.r);

      player.vx = intendedVx;
      player.vy = intendedVy;

      if (collision.collided) {
        const obstacle = collision.obstacle;
        const obstaclePos = `(${obstacle.x?.toFixed(1) || '?'}, ${obstacle.y?.toFixed(1) || '?'})`;
        const playerPos = `(${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;

        console.log(`🎯 COLLISION DETECTED!`);
        console.log(`   Data Structure: ${this.indexManager.type.toUpperCase()}`);
        console.log(`   Obstacle Type: ${obstacle.type || 'unknown'}`);
        console.log(`   Player Position: ${playerPos}`);
        console.log(`   Obstacle Position: ${obstaclePos}`);
        console.log(`   Obstacle ID: ${obstacle.id || 'N/A'}`);

        if (collision.penetration) {
          console.log(`   Penetration Depth: ${collision.penetration.toFixed(2)}`);
        }
      }
    }

    const mouseDirection = this.input.getMouseDirectionFrom(player.x, player.y);
    player.direction = mouseDirection;

    if (intendedVx !== 0 && intendedVy !== 0) {
      intendedVx *= 0.707;
      intendedVy *= 0.707;
    }

    let finalVx = intendedVx;
    let finalVy = intendedVy;

    if (intendedVx !== 0) {
      const testX = player.x + intendedVx * (1 / 60);
      const collisionX = this.world.checkCollision(testX, player.y, player.r);
      if (collisionX.collided) {
        finalVx = 0;
      }
    }

    if (intendedVy !== 0) {
      const testY = player.y + intendedVy * (1 / 60);
      const collisionY = this.world.checkCollision(player.x, testY, player.r);
      if (collisionY.collided) {
        finalVy = 0;
      }
    }

    player.vx = finalVx;
    player.vy = finalVy;

    const currentWeapon = this.weapons.available[player.weapon];
    if (
      this.input.isDown(' ') &&
      performance.now() - player.lastShotTime > currentWeapon.fireRate
    ) {
      if (player.ammo > 0) {
        this._shootProjectile(player);
        player.lastShotTime = performance.now();
        player.ammo--;
        console.log(`🔫 Shot fired! ${player.weapon} ammo: ${player.ammo}`);
      } else {
        console.log('*click* Out of ammo!');
      }
    }

    if (
      this.input.isDown('e') &&
      performance.now() - player.lastMeleeTime > this.meleeWeapon.cooldown
    ) {
      this._meleeAttack(player);
      player.lastMeleeTime = performance.now();
    }

    if (this.input.isDown('1') && this._canUseWeapon('pistol')) {
      player.weapon = 'pistol';
      player.ammo = this.weapons.available.pistol.ammo;
    }
    if (this.input.isDown('2') && this._canUseWeapon('shotgun')) {
      player.weapon = 'shotgun';
      player.ammo = this.weapons.available.shotgun.ammo;
    }
    if (this.input.isDown('3') && this._canUseWeapon('rifle')) {
      player.weapon = 'rifle';
      player.ammo = this.weapons.available.rifle.ammo;
    }

    if (this.input.isDown('r')) {
      this._reloadWeapon(player);
    }

    if (this.input.isDown('l')) {
      this.logDataStructureDetails();
    }

    if (this.input.isDown('k')) {
      this._testSpatialQueries();
    }
  }

  _canUseWeapon(weaponType) {
    return this.score >= this.weapons.available[weaponType].unlockScore;
  }

  _shootProjectile(player) {
    const weapon = this.weapons.available[player.weapon];

    if (weapon) {
      if (player.weapon === 'shotgun') {
        for (let i = 0; i < 5; i++) {
          this._createProjectile(player, weapon, i - 2);
        }
      } else {
        this._createProjectile(player, weapon);
      }
    }
  }

  _createProjectile(player, weapon, spreadOffset = 0) {
    const projectile = this.entities.acquire();
    const spawnDistance = player.r + 20;
    projectile.x = player.x + player.direction.x * spawnDistance;
    projectile.y = player.y + player.direction.y * spawnDistance;
    projectile.r = weapon === 'shotgun' ? 2 : 3;
    projectile.type = 'projectile';
    projectile.color = weapon.color;
    projectile.speed = weapon.projectileSpeed;
    projectile.lifetime = (weapon.range / weapon.projectileSpeed) * 1000;
    projectile.spawnTime = performance.now();
    projectile.damage = weapon.damage;
    projectile.weaponType = player.weapon;
    projectile.active = true;

    // Calculate direction with mouse aiming and spread
    let angle = Math.atan2(player.direction.y, player.direction.x);
    if (weapon.spread) {
      angle += (Math.random() - 0.5) * weapon.spread + spreadOffset * 0.1;
    }

    projectile.vx = Math.cos(angle) * projectile.speed;
    projectile.vy = Math.sin(angle) * projectile.speed;

    this._maybeInsertEntityInIndex(projectile);
  }

  _meleeAttack(player) {
    const meleeRange = this.meleeWeapon.range;
    const attackAngle = Math.atan2(player.direction.y, player.direction.x);

    this._createMeleeEffect(player, attackAngle);

    const entities = this.entities.allActive();
    let hitCount = 0;

    for (const entity of entities) {
      if (entity.type === 'zombie') {
        const dx = entity.x - player.x;
        const dy = entity.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < meleeRange) {
          const angleToZombie = Math.atan2(dy, dx);
          const angleDiff = Math.abs(angleToZombie - attackAngle);

          if (angleDiff < Math.PI / 2 || angleDiff > (3 * Math.PI) / 2) {
            entity.health -= this.meleeWeapon.damage;
            hitCount++;

            entity.vx += Math.cos(angleToZombie) * 100;
            entity.vy += Math.sin(angleToZombie) * 100;

            this._createBloodEffect(entity.x, entity.y);

            if (entity.health <= 0) {
              this.entities.release(entity);
              this.insertedEntityIds.delete(entity.id);
              this.prevPositions.delete(entity.id);
              this.zombiesKilled++;
              this.score += 30;
            }
          }
        }
      }
    }
  }

  _createMeleeEffect(player, angle) {
    const effect = this.entities.acquire();
    effect.x = player.x + Math.cos(angle) * 25;
    effect.y = player.y + Math.sin(angle) * 25;
    effect.r = 15;
    effect.type = 'meleeEffect';
    effect.color = '#FFFFFF';
    effect.lifetime = 100;
    effect.spawnTime = performance.now();
    effect.active = true;

    this._maybeInsertEntityInIndex(effect);
  }

  _createBloodEffect(x, y) {
    for (let i = 0; i < 3; i++) {
      const blood = this.entities.acquire();
      blood.x = x + (Math.random() - 0.5) * 10;
      blood.y = y + (Math.random() - 0.5) * 10;
      blood.r = 2 + Math.random() * 3;
      blood.type = 'blood';
      blood.color = '#8B0000';
      blood.lifetime = 1000 + Math.random() * 1000;
      blood.spawnTime = performance.now();
      blood.vx = (Math.random() - 0.5) * 50;
      blood.vy = (Math.random() - 0.5) * 50;
      blood.active = true;

      this._maybeInsertEntityInIndex(blood);
    }
  }

  _reloadWeapon(player) {
    const weapon = this.weapons.available[player.weapon];
    if (player.ammo < weapon.maxAmmo) {
      player.ammo = weapon.maxAmmo;
      player.lastShotTime = performance.now() + 1000;
    }
  }

  _update(dtMs) {
    if (this.gameState !== 'playing') return;

    const dt = dtMs / 1000;
    const entities = this.entities.allActive();
    const player = this.player;

    for (const entity of entities) {
      this._updateEntity(entity, dt, player);
    }

    this._handleCollisions();

    if (Math.random() < 0.005) {
      this.spawnZombie(false);
    }

    if (player && this._frameCount % 60 === 0) {
      this._logNearbyObjects(player);
    }

    if (player) {
      this.camera.follow?.(player.x, player.y);

      const tileTotal = this.world.chunkSize * this.world.tileSize;
      const centerCx = Math.floor(player.x / tileTotal);
      const centerCy = Math.floor(player.y / tileTotal);
      this.world.unloadFarChunks(centerCx, centerCy, this.world.viewRadius + 1);
    }

    this._updateSpatialIndex(entities);

    this._runPerformanceQueries(entities);
  }

  _updateEntity(entity, dt, player) {
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;

    switch (entity.type) {
      case 'zombie':
        this._updateZombie(entity, dt, player);
        break;
      case 'projectile':
        this._updateProjectile(entity, dt);
        break;
      case 'blood':
        this._updateBlood(entity, dt);
        break;
      case 'impact':
      case 'meleeEffect':
        this._updateEffect(entity, dt);
        break;
    }

    if (entity.type !== 'projectile' && entity.type !== 'blood') {
      entity.vx *= 0.95;
      entity.vy *= 0.95;
    }
  }

  _updateZombie(zombie, dt, player) {
    if (!player) return;

    const dx = player.x - zombie.x;
    const dy = player.y - zombie.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 400) {
      if (dist > 25) {
        const speed = zombie.speed * (dist < 100 ? 0.5 : 1);
        zombie.vx = (dx / dist) * speed;
        zombie.vy = (dy / dist) * speed;
      } else {
        zombie.vx = 0;
        zombie.vy = 0;

        const now = performance.now();
        if (now - zombie.lastAttackTime > 1500) {
          zombie.lastAttackTime = now;
        }
      }
    } else {
      if (Math.random() < 0.02) {
        zombie.vx = (Math.random() - 0.5) * 20;
        zombie.vy = (Math.random() - 0.5) * 20;
      }
    }
  }

  _updateProjectile(projectile, dt) {
    if (performance.now() - projectile.spawnTime > projectile.lifetime) {
      this.entities.release(projectile);
      this.insertedEntityIds.delete(projectile.id);
      this.prevPositions.delete(projectile.id);
    }
  }

  _updateBlood(blood, dt) {
    if (performance.now() - blood.spawnTime > blood.lifetime) {
      this.entities.release(blood);
      this.insertedEntityIds.delete(blood.id);
      this.prevPositions.delete(blood.id);
    }
  }

  _updateEffect(effect, dt) {
    if (performance.now() - effect.spawnTime > effect.lifetime) {
      this.entities.release(effect);
      this.insertedEntityIds.delete(effect.id);
      this.prevPositions.delete(effect.id);
    }
  }

  _handleCollisions() {
    const entities = this.entities.allActive();
    const player = this.player;

    for (const entity of entities) {
      if (entity.type === 'projectile') {
        for (const target of entities) {
          if (target.type === 'zombie' && this._checkCollision(entity, target)) {
            target.health -= entity.damage;

            this._createImpactEffect(entity.x, entity.y, entity.weaponType);
            this._createBloodEffect(target.x, target.y);

            console.log(`🎯 HIT: ${entity.weaponType} hit zombie for ${entity.damage} damage!`);

            if (target.health <= 0) {
              this.entities.release(target);
              this.insertedEntityIds.delete(target.id);
              this.prevPositions.delete(target.id);
              this.zombiesKilled++;
              this.score += target.scoreValue;
            }

            this.entities.release(entity);
            this.insertedEntityIds.delete(entity.id);
            this.prevPositions.delete(entity.id);
            break;
          }
        }
      }

      if (entity.type === 'projectile') {
        const terrainCollision = this.world.checkCollision(entity.x, entity.y, entity.r);
        if (terrainCollision.collided && terrainCollision.obstacle.type !== 'tree') {
          this._createImpactEffect(entity.x, entity.y, entity.weaponType);
          this.entities.release(entity);
          this.insertedEntityIds.delete(entity.id);
          this.prevPositions.delete(entity.id);
        }
      }

      if (entity.type === 'collectible' && !entity.collected && player) {
        if (this._checkCollision(entity, player)) {
          entity.collected = true;
          this.collectiblesFound++;
          this.score += 100;

          if (Math.random() < 0.3) {
            player.ammo = Math.min(player.ammo + 10, this.weapons.available[player.weapon].maxAmmo);
          } else if (Math.random() < 0.2 && player.health < player.maxHealth) {
            player.health = Math.min(player.health + 20, player.maxHealth);
          }

          this.entities.release(entity);
          this.insertedEntityIds.delete(entity.id);
          this.prevPositions.delete(entity.id);

          setTimeout(() => this.spawnCollectible(), 3000);
        }
      }

      if (entity.type === 'ammoCrate' && !entity.collected && player) {
        if (this._checkCollision(entity, player)) {
          entity.collected = true;
          this.weapons.available[entity.weaponType].ammo += entity.ammoAmount;

          this.entities.release(entity);
          this.insertedEntityIds.delete(entity.id);
          this.prevPositions.delete(entity.id);

          setTimeout(() => this.spawnAmmoCrate(), 5000);
        }
      }

      if (entity.type === 'nitEgg' && !entity.collected && player) {
        if (this._checkCollision(entity, player)) {
          entity.collected = true;
          this.nitTrichyEasterEggFound = true;
          this.score += 1000;

          Object.keys(this.weapons.available).forEach((weapon) => {
            this.weapons.available[weapon].ammo = this.weapons.available[weapon].maxAmmo;
          });
          player.health = player.maxHealth;
          player.ammo = this.weapons.available[player.weapon].maxAmmo;

          this.entities.release(entity);
          this.insertedEntityIds.delete(entity.id);
          this.prevPositions.delete(entity.id);

          this._showEasterEggMessage();
        }
      }

      if (entity.type === 'zombie' && player && !player.invulnerable) {
        if (this._checkCollision(entity, player)) {
          const now = performance.now();
          if (now - entity.lastAttackTime > 1500) {
            player.health -= entity.damage;
            entity.lastAttackTime = now;
            player.invulnerable = true;
            player.lastHitTime = now;

            console.log(`😵 ZOMBIE ATTACK! Player health: ${player.health}`);

            const dx = player.x - entity.x;
            const dy = player.y - entity.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            player.vx += (dx / distance) * 200;
            player.vy += (dy / distance) * 200;

            if (player.health <= 0) {
              player.health = 0;
              this.gameState = 'gameOver';
              console.log('💀 GAME OVER - Player died!');
            }
          }
        }
      }
    }

    if (player && player.invulnerable && performance.now() - player.lastHitTime > 1000) {
      player.invulnerable = false;
    }
  }

  _checkCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < a.r + b.r;
  }

  _showEasterEggMessage() {
    console.log('🎉 NIT TRICHY CSE - A 2028 EASTER EGG FOUND! 🎉');
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(
        '🎉 NIT TRICHY CSE - A 2028 EASTER EGG! 🎉\n\nCongratulations! You found the hidden collectible!\nAll weapons unlocked and fully loaded!'
      );
    }
  }

  _createImpactEffect(x, y, weaponType) {
    const effect = this.entities.acquire();
    effect.x = x;
    effect.y = y;
    effect.r = weaponType === 'shotgun' ? 8 : 5;
    effect.type = 'impact';
    effect.color = this.weapons.available[weaponType].color;
    effect.lifetime = 200;
    effect.spawnTime = performance.now();
    effect.active = true;

    this._maybeInsertEntityInIndex(effect);
  }

  _updateSpatialIndex(entities) {
    this._frameCount++;

    const idxType = this.indexManager.type;

    if (idxType === 'grid') {
      for (const entity of entities) {
        this._maybeUpdateEntityInIndex(entity);
      }

      if (this._frameCount % this.rebuildInterval === 0) {
        this.indexManager.rebuild(entities);
        this.insertedEntityIds.clear();
        for (const entity of entities) {
          this.insertedEntityIds.add(entity.id);
          this.prevPositions.set(entity.id, { x: entity.x, y: entity.y });
        }
      }
    } else {
      if (this._frameCount % this.rebuildInterval === 0) {
        this.indexManager.rebuild(entities);
      }
    }
  }

  _runPerformanceQueries(entities) {
    const t0 = performance.now();
    let totalCandidates = 0;

    for (const entity of entities) {
      const range = {
        minX: entity.x - 100,
        minY: entity.y - 100,
        maxX: entity.x + 100,
        maxY: entity.y + 100,
      };
      const candidates = this.indexManager.queryRange(range);
      totalCandidates += candidates.length;
    }

    const t1 = performance.now();
    this.queryTime = t1 - t0;
    this.lastCandidateCount = totalCandidates;
  }

  _render(alpha) {
    this.renderer.render(this.camera, this.world, this.entities, {
      debug: this.debug,
      alpha,
      queryTime: this.queryTime,
      fps: this.perf.getFPS(),
      indexManager: this.indexManager,
      gameState: this.gameState,
      score: this.score,
      playerHealth: this.player?.health || 0,
      collectiblesFound: this.collectiblesFound,
      zombiesKilled: this.zombiesKilled,
      world: this.world,
      entities: this.entities,
      playerId: this.playerId,
      input: this.input,
    });
  }

  _recordSample() {
    const sample = {
      t: performance.now(),
      fps: this.perf.getFPS(),
      queryTime: this.queryTime,
      entityCount: this.entities.countActive?.(),
      chunks: this.world.chunks.size,
      indexType: this.indexManager.type,
      score: this.score,
      experiment: this.currentExperiment?.name || 'normal',
    };

    this.recentSamples.push(sample);

    if (this.recorder?.running) {
      this.recorder.record(sample);
    }
  }

  _maybeInsertEntityInIndex(entity) {
    if (!this.indexManager) return;

    const idxType = this.indexManager.type;
    if (idxType === 'grid' && !this.insertedEntityIds.has(entity.id)) {
      if (typeof this.indexManager.insert === 'function') {
        this.indexManager.insert(entity);
      }
      this.insertedEntityIds.add(entity.id);
      this.prevPositions.set(entity.id, { x: entity.x, y: entity.y });
    }
  }

  _maybeUpdateEntityInIndex(entity) {
    if (!this.indexManager || this.indexManager.type !== 'grid') return;

    const prev = this.prevPositions.get(entity.id);
    const moved = !prev || Math.abs(prev.x - entity.x) > 0.1 || Math.abs(prev.y - entity.y) > 0.1;

    if (moved) {
      if (!this.insertedEntityIds.has(entity.id)) {
        if (typeof this.indexManager.insert === 'function') {
          this.indexManager.insert(entity);
        }
        this.insertedEntityIds.add(entity.id);
      } else {
        if (typeof this.indexManager.update === 'function') {
          this.indexManager.update(entity);
        }
      }
      this.prevPositions.set(entity.id, { x: entity.x, y: entity.y });
    }
  }
  spawnEntities(count = 100, preset = 'uniform') {
    console.log(`👥 SPAWNING ${count} entities with ${preset} distribution`);
    console.log(`   Current DS: ${this.indexManager.type}`);
    console.log(`   Before: ${this.entities.countActive()} entities`);

    // Actual spawning logic...
    const player = this.player;
    const center = player ? { x: player.x, y: player.y } : { x: 0, y: 0 };

    for (let i = 0; i < count; i++) {
      const entity = this.entities.acquire();

      let x, y;
      switch (preset) {
        case 'cluster': {
          const clusterCenterX = center.x + (Math.random() - 0.5) * 500;
          const clusterCenterY = center.y + (Math.random() - 0.5) * 500;
          x = clusterCenterX + (Math.random() - 0.5) * 50;
          y = clusterCenterY + (Math.random() - 0.5) * 50;
          break;
        }
        case 'line': {
          const lineAngle = Math.random() * Math.PI;
          const lineLength = 300;
          const t = Math.random() * 2 - 1;
          x = center.x + Math.cos(lineAngle) * t * lineLength;
          y = center.y + Math.sin(lineAngle) * t * lineLength;
          break;
        }
        case 'mixed':
          if (Math.random() < 0.6) {
            const clusterX = center.x + (Math.random() - 0.5) * 300;
            const clusterY = center.y + (Math.random() - 0.5) * 300;
            x = clusterX + (Math.random() - 0.5) * 80;
            y = clusterY + (Math.random() - 0.5) * 80;
          } else {
            x = center.x + (Math.random() - 0.5) * 1000;
            y = center.y + (Math.random() - 0.5) * 1000;
          }
          break;
        default: // uniform
          x = center.x + (Math.random() - 0.5) * 1000;
          y = center.y + (Math.random() - 0.5) * 1000;
      }

      entity.x = x;
      entity.y = y;
      entity.vx = (Math.random() - 0.5) * 50;
      entity.vy = (Math.random() - 0.5) * 50;
      entity.r = 4 + Math.random() * 8;
      entity.type = 'particle';
      entity.color = `hsl(${Math.random() * 360}, 70%, 60%)`;
      entity.active = true;

      this._maybeInsertEntityInIndex(entity);
    }

    console.log(`   After: ${this.entities.countActive()} entities`);
    console.log(`   Index rebuilt with new entities`);

    // Log DS performance after spawning
    setTimeout(() => {
      this.logDataStructureDetails();
    }, 500);
  }

  // PREMIUM: Run comprehensive benchmark experiments
  async runExperiment(config) {
    if (this.experimentRunning) {
      throw new Error('Experiment already running');
    }

    this.experimentRunning = true;
    this.currentExperiment = config;

    const results = {
      config,
      runs: [],
      summary: {},
    };

    try {
      console.log(`🚀 Starting experiment: ${config.name}`);
      console.log(`Data Structure: ${config.indexType}, Entities: ${config.entityCount}`);

      // Save current state
      const originalIndexType = this.indexManager.type;
      const originalEntities = this.entities.allActive().map((e) => ({ ...e }));

      // Clear existing entities
      this.clearAllEntities();

      // Set up experiment conditions
      this.setIndexType(config.indexType);
      if (config.gridCellSize) this.setGridCellSize(config.gridCellSize);
      if (config.quadtreeCapacity)
        this.setQuadtreeParams(config.quadtreeCapacity, config.quadtreeMaxDepth);

      // Spawn entities for the experiment
      this.spawnEntities(config.entityCount, config.preset);

      // Warmup period
      console.log('🔥 Warming up...');
      await new Promise((resolve) => {
        let warmupFrames = 0;
        const warmupInterval = setInterval(() => {
          warmupFrames++;
          if (warmupFrames >= (config.warmup || 180)) {
            // 3 seconds at 60fps
            clearInterval(warmupInterval);
            resolve();
          }
        }, 16);
      });

      // Recording period
      console.log('📊 Recording performance data...');
      this.startRecording();

      await new Promise((resolve) => {
        let recordingFrames = 0;
        const recordingInterval = setInterval(() => {
          recordingFrames++;
          if (recordingFrames >= (config.duration || 600)) {
            // 10 seconds at 60fps
            clearInterval(recordingInterval);
            resolve();
          }
        }, 16);
      });

      const samples = this.stopRecording();
      results.runs = samples;

      // Calculate summary statistics
      const fpsValues = samples.map((s) => s.fps).filter((f) => f > 0);
      const queryTimes = samples.map((s) => s.queryTime).filter((q) => q > 0);

      results.summary = {
        averageFPS: fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length,
        minFPS: Math.min(...fpsValues),
        maxFPS: Math.max(...fpsValues),
        averageQueryTime: queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length,
        maxQueryTime: Math.max(...queryTimes),
        totalFrames: samples.length,
        entityCount: config.entityCount,
      };

      console.log('✅ Experiment completed:', results.summary);

      // Export results
      this._exportExperimentResults(results);

      // Restore original state
      this.clearAllEntities();
      originalEntities.forEach((entity) => {
        const newEntity = this.entities.acquire();
        Object.assign(newEntity, entity);
        this._maybeInsertEntityInIndex(newEntity);
      });
      this.setIndexType(originalIndexType);

      return results;
    } catch (error) {
      console.error('Experiment failed:', error);
      throw error;
    } finally {
      this.experimentRunning = false;
      this.currentExperiment = null;
    }
  }

  _exportExperimentResults(results) {
    // Create comprehensive CSV
    const csvContent = this._convertToCSV(results);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${results.config.name}_${results.config.indexType}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log(`📁 Exported results to: ${a.download}`);
  }

  _convertToCSV(results) {
    const headers = [
      'timestamp',
      'fps',
      'queryTime',
      'entityCount',
      'chunks',
      'indexType',
      'experiment',
    ];
    const csv = [headers.join(',')];

    results.runs.forEach((sample) => {
      const row = [
        sample.t,
        sample.fps,
        sample.queryTime,
        sample.entityCount,
        sample.chunks,
        sample.indexType,
        sample.experiment,
      ];
      csv.push(row.join(','));
    });

    // Add summary section
    csv.push('');
    csv.push('SUMMARY');
    csv.push(`Average FPS,${results.summary.averageFPS}`);
    csv.push(`Min FPS,${results.summary.minFPS}`);
    csv.push(`Max FPS,${results.summary.maxFPS}`);
    csv.push(`Average Query Time,${results.summary.averageQueryTime}`);
    csv.push(`Max Query Time,${results.summary.maxQueryTime}`);
    csv.push(`Total Frames,${results.summary.totalFrames}`);
    csv.push(`Entity Count,${results.summary.entityCount}`);

    return csv.join('\n');
  }

  // ENHANCED: Run all benchmark presets
  async runAllBenchmarks() {
    const benchmarks = Object.values(this.benchmarkPresets);
    const allResults = [];

    for (const benchmark of benchmarks) {
      for (const indexType of ['grid', 'quadtree', 'kdtree']) {
        console.log(`🏃 Running ${benchmark.name} with ${indexType}`);

        try {
          const result = await this.runExperiment({
            ...benchmark,
            indexType,
            warmup: 180,
            duration: 600,
          });
          allResults.push(result);
        } catch (error) {
          console.error(`Failed to run ${benchmark.name} with ${indexType}:`, error);
        }

        // Small delay between runs
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this._exportBenchmarkSummary(allResults);
    return allResults;
  }

  _exportBenchmarkSummary(allResults) {
    const summary = allResults.map((result) => ({
      experiment: result.config.name,
      dataStructure: result.config.indexType,
      entityCount: result.config.entityCount,
      averageFPS: result.summary.averageFPS,
      averageQueryTime: result.summary.averageQueryTime,
    }));

    const csvContent = [
      'Experiment,Data Structure,Entity Count,Average FPS,Average Query Time',
      ...summary.map(
        (s) =>
          `${s.experiment},${s.dataStructure},${s.entityCount},${s.averageFPS.toFixed(
            2
          )},${s.averageQueryTime.toFixed(3)}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_summary_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log('📊 Benchmark summary exported');
  }

  clearEntitiesInChunk(cx, cy) {
    const tilePx = this.world.tileSize;
    const chunkPx = this.world.chunkSize * tilePx;
    const minX = cx * chunkPx;
    const minY = cy * chunkPx;
    const maxX = minX + chunkPx;
    const maxY = minY + chunkPx;

    const toRemove = [];
    const entities = this.entities.allActive();

    for (const entity of entities) {
      if (entity.type === 'player' || entity.id === this.playerId) continue;
      if (entity.x >= minX && entity.x < maxX && entity.y >= minY && entity.y < maxY) {
        toRemove.push(entity);
      }
    }

    for (const entity of toRemove) {
      this.entities.release(entity);
      this.insertedEntityIds.delete(entity.id);
      this.prevPositions.delete(entity.id);
    }

    const chunkKey = this.world._key(cx, cy);
    if (this.world.chunks.has(chunkKey)) {
      const chunk = this.world.chunks.get(chunkKey);
      if (chunk && chunk.canvas) {
        chunk.canvas.width = 0;
        chunk.canvas.height = 0;
      }
      this.world.chunks.delete(chunkKey);
    }

    this.indexManager.rebuild(this.entities.allActive());

    return toRemove.length;
  }

  clearAllEntities() {
    const entities = this.entities.allActive();
    for (const entity of entities) {
      if (entity.type !== 'player') {
        this.entities.release(entity);
      }
    }
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
    this.indexManager.rebuild(this.entities.allActive());
  }

  getMetrics() {
    return {
      fps: this.perf.getFPS(),
      queryTime: this.queryTime || 0,
      entityCount: this.entities.countActive?.(),
      lastCandidateCount: this.lastCandidateCount || 0,
      indexType: this.indexManager.type,
      chunksLoaded: this.world.chunks.size,
      recentSamples: this.recentSamples.slice(-200),
      poolStats: this.getPoolStats(),
      gameStats: {
        score: this.score,
        zombiesKilled: this.zombiesKilled,
        collectiblesFound: this.collectiblesFound,
        playerHealth: this.player?.health || 0,
        gameTime: this.gameTime,
      },
      experimentRunning: this.experimentRunning,
      currentExperiment: this.currentExperiment,
    };
  }

  getPoolStats() {
    return (
      this.world.getPoolStats?.() || {
        hw: navigator.hardwareConcurrency || 4,
        maxWorkers: 0,
        idleWorkers: 0,
        queuedJobs: 0,
        pendingJobs: 0,
      }
    );
  }

  setPoolSize(n) {
    if (this.world.setPoolSize) {
      this.world.setPoolSize(Math.max(1, Math.floor(n)));
    }
  }

  centerCameraOnPlayer(zoom = null) {
    const player = this.player;
    if (!player) return false;

    if (typeof this.camera.follow === 'function') {
      this.camera.follow(player.x, player.y);
    } else if (typeof this.camera.setCenter === 'function') {
      this.camera.setCenter(player.x, player.y);
    } else {
      this.camera.x = player.x;
      this.camera.y = player.y;
    }

    if (zoom !== null) {
      if (typeof this.camera.setZoom === 'function') {
        this.camera.setZoom(zoom);
      } else {
        this.camera.zoom = zoom;
      }
    }

    return true;
  }

  onResize() {
    this.renderer.onResize();
  }

  toggleDebug() {
    this.debug = !this.debug;
  }

  togglePause() {
    this.gameState = this.gameState === 'playing' ? 'paused' : 'playing';
  }

  restartGame() {
    this.clearAllEntities();
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
    this.indexManager.clear?.();

    this.gameState = 'playing';
    this.score = 0;
    this.zombiesKilled = 0;
    this.collectiblesFound = 0;
    this.gameTime = 0;
    this.nitTrichyEasterEggFound = false;

    this.player = null;
    this.playerId = null;

    this._initializeWeapons();
    this._initializeGameWorld();
  }

  // Data Structure Management
  setIndexType(type) {
    if (!['grid', 'quadtree', 'kdtree', 'bvh'].includes(type)) {
      console.warn(`Invalid index type: ${type}. Using 'grid' instead.`);
      type = 'grid';
    }

    this.indexManager.setType(type);
    this.insertedEntityIds.clear();
    this.prevPositions.clear();

    console.log(`Data Structure changed to: ${type}`);
  }

  setGridCellSize(size) {
    this.indexManager.setGridCellSize(Math.max(1, size));
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
  }

  setQuadtreeParams(capacity, maxDepth) {
    this.indexManager.setQuadtreeParams(Math.max(1, capacity), Math.max(1, maxDepth));
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
  }

  setKDTreeParams(capacity) {
    this.indexManager.setKDTreeParams(Math.max(1, capacity));
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
  }

  setRebuildInterval(n) {
    this.rebuildInterval = Math.max(1, Math.floor(n));
  }

  // World management
  setSeed(seed) {
    this.world.setSeed(seed);
  }

  setNoiseConfig(cfg) {
    this.world.setNoiseConfig(cfg);
  }

  startRecording() {
    this.recorder.start();
  }

  stopRecording() {
    this.recorder.stop();
    return this.recorder.getSamples();
  }

  exportRecording(filename = 'experiment.csv') {
    this.recorder.exportCSV(filename);
  }

  dispose() {
    this.stop();
    this.renderer.dispose?.();
    this.world.dispose?.();
    this.input.dispose?.();
    this.entities.dispose?.();

    if (this.indexManager.dispose) {
      this.indexManager.dispose();
    }
  }

  logDataStructureDetails() {
    console.log('🔍 ===== DATA STRUCTURE ANALYSIS =====');

    // Safe property access with fallbacks
    const dsType = this.indexManager?.type?.toUpperCase() || 'UNKNOWN';
    const entityCount = this.entities?.countActive?.() || 0;
    const queryTime = this.queryTime || 0;
    const fps = this.perf?.getFPS?.() || 0;

    console.log(`📊 Current DS: ${dsType}`);
    console.log(`👥 Active Entities: ${entityCount}`);
    console.log(`🎯 Query Time: ${queryTime.toFixed(2)}ms`);
    console.log(`⚡ FPS: ${fps.toFixed(1)}`);

    // Log spatial index statistics safely
    try {
      this._logSpatialIndexStats();
    } catch (error) {
      console.log(`❌ Error logging spatial stats: ${error.message}`);
    }

    console.log('=====================================');
  }

  _logSpatialIndexStats() {
    const entities = this.entities.allActive();

    switch (this.indexManager.type) {
      case 'grid':
        this._logGridStats(entities);
        break;
      case 'quadtree':
        this._logQuadtreeStats(entities);
        break;
      case 'kdtree':
        this._logKDTreeStats(entities);
        break;
      case 'bvh':
        this._logBVHStats(entities);
        break;
    }
  }

  _logGridStats(entities) {
    // FIX: Properly access grid properties
    const grid = this.indexManager.grid;
    if (!grid) {
      console.log(`🔲 GRID: No grid instance found`);
      return;
    }

    // Get cell size safely - handle both number and object cases
    let cellSize = 128; // default
    if (typeof grid.cellSize === 'number') {
      cellSize = grid.cellSize;
    } else if (grid.cellSize && typeof grid.cellSize === 'object') {
      // If it's an object, try to get a numeric value
      cellSize = grid.cellSize.value || grid.cellSize.size || 128;
    }

    // Calculate grid dimensions safely
    const worldSize = 10000; // Your world size
    const gridWidth = Math.ceil(worldSize / cellSize);
    const gridHeight = Math.ceil(worldSize / cellSize);
    const totalCells = gridWidth * gridHeight;

    // Count occupied cells
    const occupiedCells = new Set();
    entities.forEach((entity) => {
      const cellX = Math.floor(entity.x / cellSize);
      const cellY = Math.floor(entity.y / cellSize);
      occupiedCells.add(`${cellX},${cellY}`);
    });

    // Calculate occupancy rate safely
    const occupancyRate = totalCells > 0 ? (occupiedCells.size / totalCells) * 100 : 0;

    console.log(`🔲 GRID: ${occupiedCells.size}/${totalCells} cells occupied`);
    console.log(`   Cell Size: ${cellSize}px`);
    console.log(`   Grid Dimensions: ${gridWidth}x${gridHeight}`);
    console.log(`   Occupancy Rate: ${occupancyRate.toFixed(1)}%`);
  }

  _logQuadtreeStats(entities) {
    const tree = this.indexManager.quadtree;
    if (!tree || !tree.root) {
      console.log(`🌳 QUADTREE: No tree or root found`);
      return;
    }

    let nodeCount = 0;
    let leafCount = 0;
    let maxDepth = 0;

    // Safe tree traversal
    const traverse = (node, depth = 0) => {
      if (!node) return;

      nodeCount++;
      maxDepth = Math.max(maxDepth, depth);

      if (node.isLeaf) {
        leafCount++;
      } else {
        // Check if child nodes exist before traversing
        if (node.nw) traverse(node.nw, depth + 1);
        if (node.ne) traverse(node.ne, depth + 1);
        if (node.sw) traverse(node.sw, depth + 1);
        if (node.se) traverse(node.se, depth + 1);
      }
    };

    traverse(tree.root);

    // Get capacity safely
    const capacity = tree.capacity || 8;
    const entitiesPerLeaf = leafCount > 0 ? entities.length / leafCount : 0;

    console.log(`🌳 QUADTREE: ${nodeCount} nodes, ${leafCount} leaves`);
    console.log(`   Max Depth: ${maxDepth}`);
    console.log(`   Capacity: ${capacity}`);
    console.log(`   Entities per leaf: ${entitiesPerLeaf.toFixed(1)} avg`);
  }

  _logKDTreeStats(entities) {
    const tree = this.indexManager.kdtree;
    if (!tree) {
      console.log(`📐 KD-TREE: No tree instance found`);
      return;
    }

    // Safe property access
    const entityCount = tree.entities ? tree.entities.length : 0;
    const capacity = tree.capacity || 16;
    const hasRoot = !!tree.root;

    console.log(`📐 KD-TREE: ${entityCount} entities indexed`);
    console.log(`   Capacity: ${capacity}`);
    console.log(`   Balanced: ${hasRoot ? 'Yes' : 'No'}`);
  }

  _testSpatialQueries() {
    const entities = this.entities.allActive();
    if (entities.length === 0) {
      console.log('🧪 No entities to test spatial queries on');
      return;
    }

    console.log('🧪 TESTING SPATIAL QUERIES...');

    // Test query around player
    const player = this.player;
    if (player) {
      const range = {
        minX: player.x - 200,
        minY: player.y - 200,
        maxX: player.x + 200,
        maxY: player.y + 200,
      };

      const t0 = performance.now();
      const candidates = this.indexManager.queryRange(range);
      const t1 = performance.now();

      console.log(`🔍 Query around player (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
      console.log(`   Found ${candidates.length} entities in ${(t1 - t0).toFixed(2)}ms`);
      console.log(`   Query area: ${range.minX.toFixed(0)} to ${range.maxX.toFixed(0)}`);

      // Count entity types in query
      const typeCounts = {};
      candidates.forEach((entity) => {
        typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
      });
      console.log(`   Entity types:`, typeCounts);
    }

    // Test query in a random area
    const randomX = (Math.random() - 0.5) * 1000;
    const randomY = (Math.random() - 0.5) * 1000;
    const randomRange = {
      minX: randomX - 100,
      minY: randomY - 100,
      maxX: randomX + 100,
      maxY: randomY + 100,
    };

    const t2 = performance.now();
    const randomCandidates = this.indexManager.queryRange(randomRange);
    const t3 = performance.now();

    console.log(`🔍 Random query at (${randomX.toFixed(1)}, ${randomY.toFixed(1)})`);
    console.log(`   Found ${randomCandidates.length} entities in ${(t3 - t2).toFixed(2)}ms`);
  }

  _logBVHStats(entities) {
    const bvh = this.indexManager.bvh;
    const stats = bvh.getStats();

    console.log(`🎯 BVH: ${stats.nodeCount} nodes, ${stats.leafCount} leaves`);
    console.log(`   Max Depth: ${stats.maxDepth}`);
    console.log(`   Capacity: ${bvh.capacity}`);
    console.log(`   Entities per leaf: ${stats.averageEntitiesPerLeaf.toFixed(1)} avg`);
    console.log(`   Balance Factor: ${stats.balanceFactor.toFixed(2)}`);
    console.log(`   Total Entities: ${stats.totalEntitiesInLeaves}`);
  }

  // Add BVH parameter setting
  setBVHParams(capacity) {
    this.indexManager.setBVHParams(Math.max(1, capacity));
    this.insertedEntityIds.clear();
    this.prevPositions.clear();
  }

  // Add to SimulationController.js
  debugPlayerPosition() {
    if (!this.player) return;

    const player = this.player;
    const tileInfo = this.world.getPlayerTileInfo(player.x, player.y);

    console.log('🎯 PLAYER POSITION DEBUG:');
    console.log(`   World: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
    console.log(`   Tile: ${tileInfo.tileName} (${tileInfo.tileType})`);
    console.log(`   Collision Status: ${tileInfo.collisionStatus}`);
    console.log(`   Velocity: (${player.vx.toFixed(1)}, ${player.vy.toFixed(1)})`);

    // Check nearby obstacles
    const nearby = this.world.getNearbyObstacles(player.x, player.y, 100);
    console.log(`   Nearby obstacles: ${nearby.length}`);
    nearby.forEach((obs) => {
      console.log(`     - ${obs.type} at distance ${obs.distance.toFixed(1)}`);
    });
  }

  _logNearbyObjects(player) {
    // Query spatial index for nearby entities
    const queryRadius = player.r + 100;
    const nearby = this.world.getNearbyObstacles(player.x, player.y, queryRadius);

    // Always log to show DS is working
    console.log(`📍 COLLISION QUERY (${this.indexManager.type.toUpperCase()}):`);
    console.log(`   Player at (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
    console.log(`   Query radius: ${queryRadius.toFixed(1)} units`);
    console.log(`   Found ${nearby.length} objects nearby`);

    if (nearby.length > 0) {
      nearby.slice(0, 5).forEach((obj, idx) => {
        console.log(`   ${idx + 1}. ${obj.type || 'unknown'}`);
        console.log(`      Position: (${obj.x?.toFixed(1) || '?'}, ${obj.y?.toFixed(1) || '?'})`);
        console.log(`      Distance: ${obj.distance?.toFixed(1) || '?'} units`);
        console.log(`      ID: ${obj.id || 'N/A'}`);
        console.log(`      Collision Radius: ${obj.collisionRadius?.toFixed(1) || '?'}`);
      });
    } else {
      console.log(`   (No trees/obstacles nearby in this area)`);
    }
  }
}
