// src/engine/Renderer.js
export default class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this._lastSize = { w: 0, h: 0 };
    this.cssSize = { w: 0, h: 0 };
    this._chunkCache = new Map();
    this.onResize();
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.dpr;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${Math.round(rect.width)}px`;
      this.canvas.style.height = `${Math.round(rect.height)}px`;

      try {
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'low';
      } catch (e) {}
    }

    this._lastSize = { w, h };
    this.cssSize = { w: rect.width, h: rect.height };
  }

  render(camera, world, entitiesContainer, opts = {}) {
    const ctx = this.ctx;
    const canvas = this.canvas;

    // Ensure proper sizing
    this.onResize();

    // Clear canvas with optimized background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera transform for world rendering
    ctx.save();
    try {
      this._applyCameraTransform(ctx, camera, canvas);

      // CRITICAL: Render world chunks first
      const chunksDrawn = this._renderWorldChunks(ctx, world, camera, opts);

      // Render entities on top of world
      this._renderEntities(ctx, entitiesContainer);

      // Draw player's mouse aim while the camera transform is active (so it's in world space)
      // Use entitiesContainer to find the player (fallback to opts.entities if provided)
      const player = entitiesContainer?.get?.(opts.playerId) || opts.entities?.get?.(opts.playerId);
      this._drawMouseAim(ctx, player, opts.input);

      // Debug information with collision visualization
      if (opts.debug) {
        this._renderDebugInfo(ctx, chunksDrawn, opts);
        this._renderCollisionDebug(ctx, opts);
      }
    } finally {
      ctx.restore();
    }

    // Render HUD and UI elements (untransformed)
    this._renderHUD(ctx, canvas, opts);

    // Render debug overlays if enabled
    if (opts.debug && opts.indexManager) {
      this._renderDebugOverlays(ctx, canvas, opts);
    }
  }

  _applyCameraTransform(ctx, camera, canvas) {
    if (camera && typeof camera.applyTransform === 'function') {
      camera.applyTransform(ctx, canvas);
    } else {
      const center = camera?.getCenter?.() || { x: 0, y: 0 };
      const zoom = camera?.zoom || 1;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-center.x, -center.y);
    }
  }

  _renderWorldChunks(ctx, world, camera, opts) {
    if (!world || !world.chunks) return 0;

    let chunksDrawn = 0;
    const tileSize = world.tileSize || 1;
    const chunkSize = world.chunkSize || 1;
    const chunkPx = chunkSize * tileSize;

    try {
      // Get visible chunks based on camera view
      const visibleChunks = this._getVisibleChunks(world, camera);

      for (const chunk of visibleChunks) {
        if (!chunk || !chunk.canvas) continue;

        const x = chunk.cx * chunkPx;
        const y = chunk.cy * chunkPx;

        try {
          // Draw the chunk canvas at world coordinates
          ctx.drawImage(chunk.canvas, x, y, chunkPx, chunkPx);
          chunksDrawn++;
        } catch (drawErr) {
          if (opts.debug) {
            console.warn('[Renderer] Failed to draw chunk:', chunk.cx, chunk.cy, drawErr);
          }
        }
      }
    } catch (err) {
      if (opts.debug) {
        console.warn('[Renderer] Error in chunk rendering:', err);
      }
    }

    return chunksDrawn;
  }

  _getVisibleChunks(world, camera) {
    const tileSize = world.tileSize || 1;
    const chunkSize = world.chunkSize || 1;
    const chunkPx = chunkSize * tileSize;

    const center = camera?.getCenter?.() || { x: 0, y: 0 };
    const zoom = camera?.zoom || 1;
    const viewWidth = this.cssSize.w / zoom;
    const viewHeight = this.cssSize.h / zoom;

    // Calculate visible world bounds
    const bounds = {
      minX: center.x - viewWidth / 2,
      minY: center.y - viewHeight / 2,
      maxX: center.x + viewWidth / 2,
      maxY: center.y + viewHeight / 2,
    };

    return world.getChunksInRect?.(bounds) || [];
  }

  _renderEntities(ctx, entitiesContainer) {
    if (!entitiesContainer) return;

    const entities =
      entitiesContainer.allActive?.() ||
      (Array.isArray(entitiesContainer) ? entitiesContainer : []);

    for (const entity of entities) {
      if (this._isEntityVisible(entity, ctx)) {
        this._drawEntity(ctx, entity);
      }
    }
  }

  _isEntityVisible(entity, ctx) {
    if (!entity || typeof entity.x !== 'number' || typeof entity.y !== 'number') {
      return false;
    }

    // Simple visibility check based on entity radius
    const radius = entity.r || 5;
    return true; // For now, draw all entities
  }

  _drawEntity(ctx, entity) {
    const { x, y, r = 5, type } = entity;

    switch (type) {
      case 'player':
        this._drawPlayer(ctx, entity);
        break;
      case 'zombie':
        this._drawZombie(ctx, entity);
        break;
      case 'collectible':
        this._drawCollectible(ctx, entity);
        break;
      case 'projectile':
        this._drawProjectile(ctx, entity);
        break;
      case 'impact':
        this._drawImpact(ctx, entity);
        break;
      case 'meleeEffect':
        this._drawMeleeEffect(ctx, entity);
        break;
      case 'blood':
        this._drawBlood(ctx, entity);
        break;
      case 'ammoCrate':
        this._drawAmmoCrate(ctx, entity);
        break;
      case 'nitEgg':
        this._drawNITEgg(ctx, entity);
        break;
      default:
        this._drawGenericEntity(ctx, entity);
    }

    // Draw velocity vector for debug
    if ((entity.vx || entity.vy) && entity.type === 'player') {
      this._drawVelocityVector(ctx, entity);
    }
  }

  _drawPlayer(ctx, player) {
    const { x, y, r, direction, invulnerable } = player;

    ctx.save();

    // Player body - ALWAYS use the player's color (FIXED COLOR ISSUE)
    ctx.fillStyle = player.color || '#FFD166';

    // Flash effect when invulnerable (only time color should change)
    if (invulnerable) {
      const flash = Math.sin(performance.now() / 100) > 0;
      if (flash) {
        ctx.fillStyle = '#FFFFFF'; // Flash white when hit
      }
    }

    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator
    ctx.strokeStyle = '#073b4c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + direction.x * (r + 8), y + direction.y * (r + 8));
    ctx.stroke();

    // Health bar
    if (player.health !== undefined && player.maxHealth !== undefined) {
      this._drawHealthBar(ctx, x, y, r, player.health, player.maxHealth);
    }

    ctx.restore();
  }

  _drawZombie(ctx, zombie) {
    const { x, y, r, zombieType } = zombie;

    // Body
    ctx.beginPath();
    ctx.fillStyle = zombie.color || '#4a7c59';
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Eyes - different styles based on zombie type
    ctx.fillStyle = '#000000';
    if (zombieType === 'Brute') {
      // Angry eyes for brutes
      ctx.fillRect(x - 4, y - 3, 2, 4);
      ctx.fillRect(x + 2, y - 3, 2, 4);
    } else if (zombieType === 'Runner') {
      // Wide eyes for runners
      ctx.fillRect(x - 3, y - 2, 2, 2);
      ctx.fillRect(x + 1, y - 2, 2, 2);
    } else {
      // Normal eyes for walkers
      ctx.fillRect(x - 3, y - 2, 2, 2);
      ctx.fillRect(x + 1, y - 2, 2, 2);
    }

    // Mouth
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.arc(x, y + 2, r * 0.5, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // Health bar for zombies
    if (zombie.health !== undefined && zombie.maxHealth !== undefined) {
      this._drawHealthBar(ctx, x, y, r, zombie.health, zombie.maxHealth, true);
    }
  }

  _drawCollectible(ctx, collectible) {
    if (collectible.collected) return;

    const { x, y, r, glow, glowPhase } = collectible;

    // Glow effect
    if (glow) {
      const glowSize = r + Math.sin(performance.now() * 0.01 + (glowPhase || 0)) * 2;
      ctx.beginPath();
      ctx.fillStyle = collectible.color + '40';
      ctx.arc(x, y, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main collectible
    ctx.beginPath();
    ctx.fillStyle = collectible.color || '#ffd700';
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle effect
    ctx.fillStyle = '#ffffff';
    const time = performance.now() * 0.01;
    ctx.fillRect(x + Math.cos(time) * 3, y + Math.sin(time) * 3, 1, 1);
    ctx.fillRect(x + Math.sin(time) * 2, y - Math.cos(time) * 2, 1, 1);
  }

  _drawAmmoCrate(ctx, crate) {
    if (crate.collected) return;

    const { x, y, r } = crate;

    // Crate body
    ctx.fillStyle = crate.color || '#8B4513';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    // Crate details
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);

    // Ammo symbol
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x - 2, y - 4, 4, 8);
  }

  _drawNITEgg(ctx, egg) {
    if (egg.collected) return;

    const { x, y, r, glow, glowColor } = egg;

    // Glow effect
    if (glow) {
      const glowSize = r + Math.sin(performance.now() * 0.005) * 3;
      ctx.beginPath();
      ctx.fillStyle = (glowColor || '#FF0000') + '60';
      ctx.arc(x, y, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Egg body
    ctx.beginPath();
    ctx.fillStyle = egg.color || '#8B0000';
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // NIT text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NIT', x, y);
  }

  _drawProjectile(ctx, projectile) {
    const { x, y, r } = projectile;

    ctx.beginPath();
    ctx.fillStyle = projectile.color;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Trail effect
    ctx.beginPath();
    ctx.strokeStyle = projectile.color + '80';
    ctx.lineWidth = 1;
    ctx.moveTo(x - projectile.vx * 0.02, y - projectile.vy * 0.02);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  _drawImpact(ctx, impact) {
    const progress = (performance.now() - impact.spawnTime) / impact.lifetime;
    const alpha = 1 - progress;
    const size = impact.r * (1 + progress * 0.5);

    ctx.beginPath();
    ctx.fillStyle = impact.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
    ctx.arc(impact.x, impact.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMeleeEffect(ctx, effect) {
    const progress = (performance.now() - effect.spawnTime) / effect.lifetime;
    const alpha = 1 - progress;
    const size = effect.r * (1 - progress);

    ctx.beginPath();
    ctx.strokeStyle = effect.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
    ctx.lineWidth = 2;
    ctx.arc(effect.x, effect.y, size, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawBlood(ctx, blood) {
    const progress = (performance.now() - blood.spawnTime) / blood.lifetime;
    const alpha = 1 - progress;

    ctx.beginPath();
    ctx.fillStyle = blood.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
    ctx.arc(blood.x, blood.y, blood.r, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGenericEntity(ctx, entity) {
    const { x, y, r } = entity;

    ctx.beginPath();
    ctx.fillStyle = entity.color || 'rgba(255, 100, 100, 0.9)';
    ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
    ctx.fill();
  }

  _drawHealthBar(ctx, x, y, r, health, maxHealth, isEnemy = false) {
    const barWidth = r * 2;
    const barHeight = 4;
    const healthPercent = Math.max(0, health) / maxHealth;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - barWidth / 2, y - r - 8, barWidth, barHeight);

    // Health fill - different colors for player vs enemies
    let healthColor;
    if (isEnemy) {
      healthColor = healthPercent > 0.6 ? '#4ade80' : healthPercent > 0.3 ? '#fbbf24' : '#ef4444';
    } else {
      healthColor = healthPercent > 0.6 ? '#4ade80' : healthPercent > 0.3 ? '#fbbf24' : '#ef4444';
    }

    ctx.fillStyle = healthColor;
    ctx.fillRect(x - barWidth / 2, y - r - 8, barWidth * healthPercent, barHeight);
  }

  _drawVelocityVector(ctx, entity) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.moveTo(entity.x, entity.y);
    ctx.lineTo(entity.x + entity.vx * 0.1, entity.y + entity.vy * 0.1);
    ctx.stroke();
  }

  _renderDebugInfo(ctx, chunksDrawn, opts) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.font = `${12 * this.dpr}px monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(`Chunks: ${chunksDrawn}`, 10 * this.dpr, 20 * this.dpr);

    if (opts.queryTime !== undefined) {
      ctx.fillText(`Query: ${opts.queryTime.toFixed(2)}ms`, 10 * this.dpr, 40 * this.dpr);
    }

    ctx.restore();
  }

  _renderHUD(ctx, canvas, opts) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const player = opts.entities?.get?.(opts.playerId);
    if (!player) return;

    const pad = 8;
    const boxW = 350;
    const boxH = 110;
    const x = pad;
    const y = canvas.height - boxH - pad;

    // HUD background with premium styling
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x, y, boxW, boxH);

    // HUD border with gradient effect
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxW, boxH);

    // Text styling
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

    // Game stats
    ctx.fillText(`Score: ${opts.score || 0}`, x + 10, y + 18);
    ctx.fillText(`Health: ${player.health || 0}%`, x + 10, y + 36);
    ctx.fillText(`Zombies: ${opts.zombiesKilled || 0}`, x + 10, y + 54);
    ctx.fillText(`Collectibles: ${opts.collectiblesFound || 0}`, x + 10, y + 72);

    // Weapon info
    const weapon = player.weapon || 'pistol';
    const weaponData = player.weaponData || {};
    ctx.fillText(`Weapon: ${weapon.toUpperCase()}`, x + 150, y + 18);
    ctx.fillText(`Ammo: ${player.ammo || 0}`, x + 150, y + 36);

    // Weapon unlock status
    if (weaponData.unlockScore && (opts.score || 0) < weaponData.unlockScore) {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
      ctx.fillText(`Need ${weaponData.unlockScore} pts`, x + 150, y + 54);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    }

    // Controls help
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px Arial';
    ctx.fillText('WASD: Move | SPACE: Shoot | E: Melee | R: Reload | 1-3: Weapons', x + 10, y + 95);

    // Performance stats
    const fps = opts && opts.fps ? Math.round(opts.fps) : '-';
    const qt = opts && opts.queryTime ? opts.queryTime.toFixed(2) : '-';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '12px Arial';
    ctx.fillText(`FPS: ${fps}`, x + 280, y + 18);
    ctx.fillText(`Query: ${qt}ms`, x + 280, y + 36);
    ctx.fillText(`Entities: ${opts.entities?.countActive?.() || 0}`, x + 280, y + 54);

    // Game state message
    if (opts.gameState === 'gameOver') {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('GAME OVER - Press R to restart', canvas.width / 2 - 150, 40);
    }
  }

  _renderDebugOverlays(ctx, canvas, opts) {
    try {
      if (opts.indexManager && typeof opts.indexManager.debugDraw === 'function') {
        ctx.save();
        this._applyCameraTransform(ctx, opts.camera, canvas);
        opts.indexManager.debugDraw(ctx, canvas, opts.camera);
        ctx.restore();
      }
    } catch (err) {
      console.warn('[Renderer] Debug overlay rendering failed:', err);
    }
  }

  // Performance optimization methods
  clearCache() {
    this._chunkCache.clear();
  }

  dispose() {
    this.clearCache();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _renderCollisionDebug(ctx, opts) {
    if (!opts.world || !opts.playerId) return;

    const player = opts.entities?.get?.(opts.playerId);
    if (!player) return;

    // Draw collision query range
    const queryRadius = player.r + 50; // Player radius + search radius
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, queryRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Get nearby obstacles from the data structure
    const nearby = opts.world.getNearbyObstacles(player.x, player.y, queryRadius);

    // Draw detected obstacles
    ctx.save();
    for (const obstacle of nearby) {
      const dx = obstacle.x - player.x;
      const dy = obstacle.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < queryRadius) {
        // Draw obstacle bounds
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const radius = obstacle.collisionRadius || 15;
        ctx.arc(obstacle.x, obstacle.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw connection line from player to obstacle
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(obstacle.x, obstacle.y);
        ctx.stroke();

        // Draw distance label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${distance.toFixed(0)}`,
          (player.x + obstacle.x) / 2,
          (player.y + obstacle.y) / 2 - 10
        );
        ctx.fillText(`${obstacle.type}`, obstacle.x, obstacle.y - obstacle.collisionRadius - 5);
      }
    }
    ctx.restore();

    // Show data structure being used
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(
      `DS: ${opts.indexManager?.type || 'unknown'}`,
      player.x - queryRadius - 20,
      player.y - queryRadius
    );
    ctx.fillText(
      `Nearby: ${nearby.length} objects`,
      player.x - queryRadius - 20,
      player.y - queryRadius + 15
    );
    ctx.restore();
  }

  // Draw player's mouse aim (world-space) — expects input.getMouseDirectionFrom(x,y) to exist
  _drawMouseAim(ctx, player, input) {
    if (!player || !input || typeof input.getMouseDirectionFrom !== 'function') return;

    const mouseDir = input.getMouseDirectionFrom(player.x, player.y);
    if (!mouseDir || typeof mouseDir.x !== 'number' || typeof mouseDir.y !== 'number') return;

    const aimLength = 40;

    ctx.save();

    // Draw aim line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + mouseDir.x * aimLength, player.y + mouseDir.y * aimLength);
    ctx.stroke();

    // Draw aim circle
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.beginPath();
    ctx.arc(
      player.x + mouseDir.x * aimLength,
      player.y + mouseDir.y * aimLength,
      3,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.restore();
  }

  _generateChunkData(cx, cy) {
    const size = this.chunkSize;
    const tiles = new Uint8Array(size * size);
    const heightMap = new Float32Array(size * size);
    const moistureMap = new Float32Array(size * size);
    const temperatureMap = new Float32Array(size * size);

    const scale = this.noiseConfig.scale;
    const octaves = this.noiseConfig.octaves;

    // 🎯 FIX: Generate more land by adjusting height thresholds
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const worldX = cx * size + tx;
        const worldY = cy * size + ty;
        const idx = ty * size + tx;

        // Generate multiple noise layers for realistic terrain
        const height =
          fractalNoise2D(
            worldX * scale,
            worldY * scale,
            this.seedNum,
            octaves,
            this.noiseConfig.lacunarity,
            this.noiseConfig.gain
          ) * this.noiseConfig.heightWeight;

        const moisture =
          fractalNoise2D(
            worldX * scale * 1.3,
            worldY * scale * 1.3,
            this.seedNum + 1000,
            octaves - 1
          ) * this.noiseConfig.moistureWeight;

        const temperature =
          fractalNoise2D(
            worldX * scale * 0.8,
            worldY * scale * 0.8,
            this.seedNum + 2000,
            octaves - 1
          ) * this.noiseConfig.temperatureWeight;

        const ridge = ridgeNoise(worldX * scale * 0.5, worldY * scale * 0.5, this.seedNum + 3000);

        heightMap[idx] = height;
        moistureMap[idx] = moisture;
        temperatureMap[idx] = temperature;

        // 🎯 FIXED TERRAIN GENERATION - Create more land
        let tileType = 4; // Default to grass

        // Adjusted height thresholds to create more land
        if (height < 0.15) {
          // Was 0.25 - now more land
          tileType = height < 0.08 ? 0 : height < 0.12 ? 1 : 2; // Deep ocean -> ocean -> shallow
        } else if (height < 0.18) {
          // Was 0.28 - now more beach
          tileType = 3; // Beach
        } else if (height < 0.6) {
          // Expanded land area
          if (moisture > 0.7) {
            tileType = 5; // Forest
          } else if (moisture < 0.3) {
            tileType = 6; // Dirt/arid
          } else {
            tileType = 4; // Grass
          }
        } else if (height < 0.8) {
          // Adjusted mountain range
          if (ridge > 0.6) {
            tileType = 7; // Mountain
          } else {
            tileType = temperature > 0.6 ? 6 : 4; // Dirt in warm areas, else grass
          }
        } else {
          tileType = height > 0.9 ? 8 : 7; // Snow caps on highest mountains
        }

        // Add human infrastructure based on strategic noise
        const featureNoise = fractalNoise2D(
          worldX * scale * 4,
          worldY * scale * 4,
          this.seedNum + 4000,
          2
        );

        if (
          featureNoise > 0.65 &&
          featureNoise < 0.67 &&
          height > 0.2 && // Adjusted for new height ranges
          height < 0.6 &&
          moisture > 0.4
        ) {
          tileType = 9; // Road network
        } else if (featureNoise > 0.75 && height > 0.25 && height < 0.5) {
          // Adjusted heights
          tileType = temperature > 0.5 ? 10 : 11; // Buildings or ruins based on climate
        }

        tiles[idx] = tileType;
      }
    }

    return {
      tiles,
      biomeData: {
        height: heightMap,
        moisture: moistureMap,
        temperature: temperatureMap,
      },
    };
  }
}
