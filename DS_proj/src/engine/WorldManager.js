// src/engine/WorldManager.js
import { seedStringToNumber } from '../utils/prng';
import WorkerPool from './WorkerPool';

// Enhanced noise functions for realistic terrain
function fract(x) {
  return x - Math.floor(x);
}

function hash2(x, y, seedNum) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seedNum * 101.7) * 43758.5453123;
  return fract(s);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seedNum = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const n00 = hash2(x0, y0, seedNum);
  const n10 = hash2(x0 + 1, y0, seedNum);
  const n01 = hash2(x0, y0 + 1, seedNum);
  const n11 = hash2(x0 + 1, y0 + 1, seedNum);
  const ix0 = lerp(n00, n10, fade(sx));
  const ix1 = lerp(n01, n11, fade(sx));
  return lerp(ix0, ix1, fade(sy));
}

function fractalNoise2D(x, y, seedNum = 0, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let freq = 1,
    amp = 1,
    sum = 0,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seedNum + i * 1000) * amp;
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return max === 0 ? 0 : sum / max;
}

// Multi-octave ridge noise for mountains
function ridgeNoise(x, y, seedNum) {
  return 1 - Math.abs(fractalNoise2D(x, y, seedNum, 1) * 2 - 1);
}

export default class WorldManager {
  constructor({
    chunkSize = 16,
    tileSize = 32,
    seed = 'nit-trichy-cse-2028',
    noiseConfig = {},
    poolOptions = {},
  } = {}) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
    this.seed = seed;
    this.seedNum = seedStringToNumber(seed);
    this.chunks = new Map();
    this.collisionMap = new Map();
    this.treeEntities = new Map();

    // Enhanced noise configuration for realistic terrain
    this.noiseConfig = {
      scale: 0.015, // Lower = larger features
      octaves: 5,
      lacunarity: 2.1,
      gain: 0.45,
      heightWeight: 1.2,
      moistureWeight: 0.8,
      temperatureWeight: 0.6,
      ...noiseConfig,
    };

    this.viewRadius = 4;
    this.generationQueue = new Map();
    this._generationId = 0;

    // WorkerPool initialization
    this.pool = null;
    this._initPool(poolOptions);
  }

  _initPool(poolOptions = {}) {
    try {
      const workerURL = new URL('../workers/chunkWorker.js', import.meta.url);
      this.pool = new WorkerPool(workerURL, {
        workers: poolOptions.workers || Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
        jobTimeoutMs: poolOptions.jobTimeoutMs || 15000,
        verbose: !!poolOptions.verbose,
      });
      console.log(`[WorldManager] WorkerPool initialized with ${this.pool.maxWorkers} workers`);
    } catch (err) {
      console.warn(
        '[WorldManager] WorkerPool initialization failed, using synchronous generation',
        err
      );
      this.pool = null;
    }
  }

  getPoolStats() {
    if (!this.pool) {
      return {
        hw: navigator.hardwareConcurrency || 4,
        maxWorkers: 0,
        idleWorkers: 0,
        queuedJobs: 0,
        pendingJobs: 0,
        activeJobs: 0,
      };
    }
    return this.pool.getStats();
  }

  setPoolSize(n) {
    if (!this.pool) {
      this._initPool({ workers: n, verbose: true, jobTimeoutMs: 15000 });
    } else {
      this.pool.resize(Math.max(1, n));
    }
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  setSeed(seed) {
    this.seed = seed;
    this.seedNum = seedStringToNumber(seed);
    this.chunks.clear();
    this.generationQueue.clear();
  }

  setNoiseConfig(cfg) {
    this.noiseConfig = { ...this.noiseConfig, ...cfg };
    this.chunks.clear();
    this.generationQueue.clear();
  }

  // Enhanced tile rendering with detailed textures
  _drawTile(ctx, tx, ty, tileType, tilePx, biomeData = {}) {
    const x = tx * tilePx;
    const y = ty * tilePx;

    // Advanced color palette with biome variations
    const colors = {
      // Water biomes
      deepOcean: '#0a1e3a',
      ocean: '#1a3a6a',
      shallowWater: '#2a5a9a',

      // Beach and coastal
      beach: '#f0e6b4',
      wetSand: '#e8d8a8',

      // Grasslands
      grass: '#5a9e5a',
      lushGrass: '#4a8e4a',
      dryGrass: '#6aae6a',

      // Forests
      forest: '#3a7a3a',
      denseForest: '#2a6a2a',
      autumnForest: '#8a6a3a',

      // Arid regions
      dirt: '#8b7355',
      dryDirt: '#9b8365',
      crackedEarth: '#a59375',

      // Mountains
      mountain: '#7a7a7a',
      highMountain: '#8a8a8a',
      snowCap: '#e8e8e8',

      // Special features
      road: '#5a5a5a',
      building: '#3a3a3a',
      ruin: '#4a4a4a',
    };

    let baseColor = colors.grass;
    let texturePattern = null;

    switch (tileType) {
      case 0: // Deep Ocean
        baseColor = colors.deepOcean;
        texturePattern = 'waves';
        break;
      case 1: // Ocean
        baseColor = colors.ocean;
        texturePattern = 'waves';
        break;
      case 2: // Shallow Water
        baseColor = colors.shallowWater;
        texturePattern = 'ripples';
        break;
      case 3: // Beach
        baseColor = colors.beach;
        texturePattern = 'sand';
        break;
      case 4: // Grass
        baseColor =
          biomeData.moisture > 0.7
            ? colors.lushGrass
            : biomeData.moisture < 0.3
            ? colors.dryGrass
            : colors.grass;
        texturePattern = 'grass';
        break;
      case 5: // Forest
        baseColor = biomeData.temperature > 0.7 ? colors.autumnForest : colors.forest;
        texturePattern = 'forest';
        break;
      case 6: // Dirt
        baseColor = colors.dirt;
        texturePattern = 'dirt';
        break;
      case 7: // Mountain
        baseColor = colors.mountain;
        texturePattern = 'rock';
        break;
      case 8: // Snow
        baseColor = colors.snowCap;
        texturePattern = 'snow';
        break;
      case 9: // Road
        baseColor = colors.road;
        texturePattern = 'road';
        break;
      case 10: // Building
        baseColor = colors.building;
        texturePattern = 'building';
        break;
      case 11: // Ruin
        baseColor = colors.ruin;
        texturePattern = 'ruin';
        break;
    }

    // Draw base tile
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, tilePx, tilePx);

    // Apply texture patterns
    this._applyTexture(ctx, x, y, tilePx, texturePattern, biomeData);

    // Subtle grid for debug clarity
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, tilePx, tilePx);
  }

  _applyTexture(ctx, x, y, size, pattern, biomeData) {
    ctx.save();

    switch (pattern) {
      case 'waves':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 2; i++) {
          const waveY = y + size * 0.7 + Math.sin(x * 0.1) * 2;
          ctx.fillRect(x + 2, waveY, size - 4, 1);
        }
        break;

      case 'ripples':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'sand':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(
            x + 2 + Math.random() * (size - 4),
            y + 2 + Math.random() * (size - 4),
            1,
            1
          );
        }
        break;

      case 'grass':
        ctx.fillStyle = 'rgba(106, 190, 106, 0.2)';
        if ((x + y) % 4 === 0) {
          ctx.fillRect(x + 4, y + 4, size - 8, 1);
        }
        break;

      case 'forest':
        ctx.fillStyle = 'rgba(40, 100, 40, 0.3)';
        ctx.fillRect(x, y, size, size);
        break;

      case 'dirt':
        ctx.fillStyle = 'rgba(101, 67, 33, 0.15)';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(
            x + 2 + Math.random() * (size - 4),
            y + 2 + Math.random() * (size - 4),
            1,
            1
          );
        }
        break;

      case 'rock':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        if ((x * y) % 7 === 0) {
          ctx.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
        }
        break;

      case 'snow':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 0; i < 2; i++) {
          ctx.fillRect(
            x + 2 + Math.random() * (size - 4),
            y + 2 + Math.random() * (size - 4),
            2,
            2
          );
        }
        break;

      case 'road':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x + size * 0.4, y + 2, size * 0.2, size - 4);
        break;
    }

    ctx.restore();
  }
  // Enhanced tree rendering with larger size
  _drawTree(ctx, x, y, size, treeType = 'oak', age = 1) {
    const trunkHeight = size * 1.2 * age; // Increased from 0.6 to 1.2
    const canopySize = size * 1.4 * age; // Increased from 0.8 to 1.4

    ctx.save();

    // Trunk - thicker
    ctx.fillStyle = treeType === 'pine' ? '#5d4037' : treeType === 'birch' ? '#d7ccc8' : '#8d6e63';
    ctx.fillRect(x - size * 0.12, y - trunkHeight, size * 0.24, trunkHeight); // Wider trunk

    // Canopy - larger
    switch (treeType) {
      case 'pine':
        ctx.fillStyle = '#2e7d32';
        // Triangular canopy - larger
        ctx.beginPath();
        ctx.moveTo(x, y - trunkHeight - canopySize);
        ctx.lineTo(x - canopySize / 1.8, y - trunkHeight); // Wider base
        ctx.lineTo(x + canopySize / 1.8, y - trunkHeight); // Wider base
        ctx.closePath();
        ctx.fill();
        break;

      case 'birch':
        ctx.fillStyle = '#a5d6a7';
        ctx.beginPath();
        ctx.arc(x, y - trunkHeight - canopySize / 2.5, canopySize / 1.8, 0, Math.PI * 2); // Larger radius
        ctx.fill();
        // Birch markings
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5; // Thicker markings
        for (let i = 0; i < 4; i++) {
          // More markings
          ctx.beginPath();
          ctx.moveTo(x - size * 0.08, y - trunkHeight + i * 10);
          ctx.lineTo(x + size * 0.08, y - trunkHeight + i * 10);
          ctx.stroke();
        }
        break;

      default: // Oak
        ctx.fillStyle = '#4caf50';
        ctx.beginPath();
        ctx.arc(x, y - trunkHeight - canopySize / 2.5, canopySize / 1.8, 0, Math.PI * 2); // Larger radius
        ctx.fill();
        break;
    }

    ctx.restore();

    // Return collision data for this tree
    // Note: x, y are local to chunk, caller will convert to world coords
    return {
      width: canopySize,
      height: trunkHeight + canopySize,
      type: 'tree',
    };
  }

  // Building rendering with different architectural styles
  _drawBuilding(ctx, x, y, width, height, style = 'medieval', condition = 1) {
    ctx.save();

    const isRuined = condition < 0.3;
    const baseColor = isRuined ? '#5d4037' : style === 'modern' ? '#37474f' : '#5d4037';

    // Building base
    ctx.fillStyle = baseColor;
    ctx.fillRect(x - width / 2, y - height, width, height);

    if (!isRuined) {
      // Roof
      ctx.fillStyle = style === 'modern' ? '#455a64' : '#d32f2f';
      if (style === 'medieval') {
        // Triangular roof
        ctx.beginPath();
        ctx.moveTo(x - width / 2, y - height);
        ctx.lineTo(x + width / 2, y - height);
        ctx.lineTo(x, y - height - width / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        // Flat roof for modern buildings
        ctx.fillRect(x - width / 2 - 2, y - height - 5, width + 4, 5);
      }

      // Door
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 3, y - 10, 6, 10);

      // Windows
      ctx.fillStyle = style === 'modern' ? '#81d4fa' : '#ffeb3b';
      if (style === 'medieval') {
        ctx.fillRect(x - width / 2 + 5, y - height + 15, 4, 4);
        ctx.fillRect(x + width / 2 - 9, y - height + 15, 4, 4);
      } else {
        // Grid windows for modern buildings
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            ctx.fillRect(x - width / 2 + 8 + i * 8, y - height + 15 + j * 12, 4, 4);
          }
        }
      }
    } else {
      // Ruined building - broken walls and openings
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(x - width / 2, y - height, width, height * 0.3);

      // Collapsed sections
      ctx.fillStyle = '#6d4c41';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - width / 2 + i * (width / 3), y - height * 0.7, width / 4, height * 0.4);
      }
    }

    ctx.restore();
  }

  _createCanvasForTiles(cx, cy, tiles, biomeData) {
    const size = this.chunkSize;
    const tilePx = this.tileSize;
    const canv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canv) return null;

    canv.width = size * tilePx;
    canv.height = size * tilePx;
    const ctx = canv.getContext('2d');

    // Generate terrain using multi-layer noise simulation
    if (!tiles || !biomeData) {
      const generated = this._generateChunkData(cx, cy);
      tiles = generated.tiles;
      biomeData = generated.biomeData;
    }

    // Draw all tiles with biome-aware rendering
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const idx = ty * size + tx;
        const tileBiome = {
          height: biomeData.height[idx],
          moisture: biomeData.moisture[idx],
          temperature: biomeData.temperature[idx],
        };
        this._drawTile(ctx, tx, ty, tiles[idx], tilePx, tileBiome);
      }
    }

    // Add environmental features (trees, buildings, etc.)
    this._decorateChunk(ctx, cx, cy, tiles, biomeData, tilePx);

    return { canvas: canv, tiles, biomeData };
  }

  _generateChunkData(cx, cy) {
    const size = this.chunkSize;
    const tiles = new Uint8Array(size * size);
    const heightMap = new Float32Array(size * size);
    const moistureMap = new Float32Array(size * size);
    const temperatureMap = new Float32Array(size * size);

    const scale = this.noiseConfig.scale;
    const octaves = this.noiseConfig.octaves;

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

        // Advanced biome determination
        // FIXED: Adjusted thresholds to create more land (70% land, 30% water)
        let tileType = 4; // Default to grass

        if (height < 0.12) {
          tileType = height < 0.06 ? 0 : height < 0.09 ? 1 : 2; // Deep ocean -> ocean -> shallow
        } else if (height < 0.16) {
          tileType = 3; // Beach
        } else if (height < 0.65) {
          if (moisture > 0.7) {
            tileType = 5; // Forest
          } else if (moisture < 0.3) {
            tileType = 6; // Dirt/arid
          } else {
            tileType = 4; // Grass
          }
        } else if (height < 0.82) {
          if (ridge > 0.6) {
            tileType = 7; // Mountain
          } else {
            tileType = temperature > 0.6 ? 6 : 4; // Dirt in warm areas, else grass
          }
        } else {
          tileType = height > 0.88 ? 8 : 7; // Snow caps on highest mountains
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
          height > 0.3 &&
          height < 0.6 &&
          moisture > 0.4
        ) {
          tileType = 9; // Road network
        } else if (featureNoise > 0.75 && height > 0.35 && height < 0.5) {
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
  // Enhanced decoration with collision tracking
  _decorateChunk(ctx, cx, cy, tiles, biomeData, tilePx) {
    const size = this.chunkSize;
    const rng = this._createChunkRNG(cx, cy);
    const chunkKey = this._key(cx, cy);
    const chunkTrees = [];

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const idx = ty * size + tx;
        const tileType = tiles[idx];
        // These world coordinates are used for collision data
        // const worldX = cx * size * tilePx + tx * tilePx + tilePx / 2;
        // const worldY = cy * size * tilePx + ty * tilePx + tilePx / 2;
        const featureRoll = rng();

        // Place environmental features based on tile type and biome
        switch (tileType) {
          case 5: // Forest - dense trees
            if (featureRoll < 0.3) {
              const treeType = featureRoll < 0.1 ? 'pine' : featureRoll < 0.2 ? 'birch' : 'oak';
              const localX = tx * tilePx + tilePx / 2;
              const localY = ty * tilePx + tilePx / 2;
              const worldTreeX = cx * this.chunkSize * tilePx + localX;
              const worldTreeY = cy * this.chunkSize * tilePx + localY;

              const treeCollision = this._drawTree(
                ctx,
                localX,
                localY,
                tilePx * 1.1,
                treeType,
                0.8 + featureRoll * 0.4
              );
              chunkTrees.push({
                ...treeCollision,
                x: worldTreeX,
                y: worldTreeY,
                id: `${chunkKey}_tree_${tx}_${ty}`,
                type: 'tree',
                collisionRadius: Math.max(treeCollision.width, treeCollision.height) * 0.4,
              });
            }
            break;

          case 4: // Grass - occasional trees
            if (featureRoll < 0.05 && biomeData.moisture[idx] > 0.5) {
              const localX = tx * tilePx + tilePx / 2;
              const localY = ty * tilePx + tilePx / 2;
              const worldTreeX = cx * this.chunkSize * tilePx + localX;
              const worldTreeY = cy * this.chunkSize * tilePx + localY;

              const treeCollision = this._drawTree(
                ctx,
                localX,
                localY,
                tilePx * 0.9,
                'oak',
                0.6 + featureRoll
              );
              chunkTrees.push({
                ...treeCollision,
                x: worldTreeX,
                y: worldTreeY,
                id: `${chunkKey}_tree_${tx}_${ty}`,
                type: 'tree',
                collisionRadius: Math.max(treeCollision.width, treeCollision.height) * 0.4,
              });
            }
            break;

          case 10: {
            // Building - NO collision, just decoration
            const buildingStyle = featureRoll < 0.5 ? 'medieval' : 'modern';
            const condition = 0.3 + featureRoll * 0.7;
            this._drawBuilding(
              ctx,
              tx * tilePx + tilePx / 2,
              ty * tilePx + tilePx / 2,
              tilePx * (buildingStyle === 'modern' ? 0.9 : 0.7),
              tilePx * (buildingStyle === 'modern' ? 1.2 : 0.8),
              buildingStyle,
              condition
            );
            // Note: Buildings don't have collision - player can walk through them
            break;
          }
          case 11: // Ruins
            this._drawBuilding(
              ctx,
              tx * tilePx + tilePx / 2,
              ty * tilePx + tilePx / 2,
              tilePx * 0.8,
              tilePx * 0.6,
              'medieval',
              0.2 + featureRoll * 0.3
            );
            break;
        }
      }
    }

    // Store collision data for this chunk - ONLY trees (not buildings for collision)
    // Filter to only include trees for collision detection
    const treeCollisions = chunkTrees.filter((obj) => obj.type === 'tree');
    this.collisionMap.set(chunkKey, treeCollisions);
    return chunkTrees;
  }

  _createChunkRNG(cx, cy) {
    // Create deterministic RNG for chunk decoration
    const seed = this.seedNum + cx * 131 + cy * 197;
    let state = seed;
    return () => {
      state = Math.imul(state, 1597334677) | 0;
      state = Math.imul(state, 1597334677) | 0;
      return (state & 0x7fffffff) / 0x7fffffff;
    };
  }

  _postProcessGeneratedChunk(cx, cy, data) {
    const rendered = this._createCanvasForTiles(cx, cy, data?.tiles, data?.biomeData);
    return {
      cx,
      cy,
      tiles: data?.tiles || new Uint8Array(this.chunkSize * this.chunkSize),
      biomeData: data?.biomeData || {},
      generatedAt: Date.now(),
      canvas: rendered ? rendered.canvas : null,
      _generationId: this._generationId++,
    };
  }

  async _generateChunkAsync(cx, cy) {
    const key = this._key(cx, cy);

    // Check if already generating
    if (this.generationQueue.has(key)) {
      return this.generationQueue.get(key);
    }

    // Check if already exists
    if (this.chunks.has(key)) {
      const existing = this.chunks.get(key);
      if (existing.canvas) return existing;
    }

    if (this.pool) {
      try {
        const generationPromise = (async () => {
          const args = {
            cx,
            cy,
            chunkSize: this.chunkSize,
            tileSize: this.tileSize,
            seedNum: this.seedNum,
            noiseConfig: this.noiseConfig,
          };

          const result = await this.pool.enqueue(args);
          const chunk = this._postProcessGeneratedChunk(cx, cy, result);
          this.chunks.set(key, chunk);
          this.generationQueue.delete(key);
          return chunk;
        })();

        this.generationQueue.set(key, generationPromise);
        return await generationPromise;
      } catch (err) {
        console.warn(`[WorldManager] Worker generation failed for chunk ${cx},${cy}:`, err);
        this.generationQueue.delete(key);
      }
    }

    // Fallback to synchronous generation
    const data = this._generateChunkData(cx, cy);
    const chunk = this._postProcessGeneratedChunk(cx, cy, data);
    this.chunks.set(key, chunk);
    return chunk;
  }

  getChunk(cx, cy) {
    const key = this._key(cx, cy);

    // Return existing chunk if available and valid
    if (this.chunks.has(key)) {
      const chunk = this.chunks.get(key);
      if (chunk.canvas) return chunk;
    }

    // Create placeholder and trigger async generation
    const placeholder = this._postProcessGeneratedChunk(cx, cy, null);
    this.chunks.set(key, placeholder);

    // Start async generation
    this._generateChunkAsync(cx, cy).catch((err) => {
      console.warn(`[WorldManager] Async generation failed for ${cx},${cy}:`, err);
    });

    return placeholder;
  }

  getChunksInRect(rect) {
    const tileTotal = this.chunkSize * this.tileSize;
    const minCx = Math.floor(rect.minX / tileTotal);
    const maxCx = Math.floor(rect.maxX / tileTotal);
    const minCy = Math.floor(rect.minY / tileTotal);
    const maxCy = Math.floor(rect.maxY / tileTotal);

    const chunks = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        chunks.push(this.getChunk(cx, cy));
      }
    }
    return chunks;
  }

  getTileAtWorld(x, y) {
    // FIXED: Proper coordinate conversion
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    const cx = Math.floor(tx / this.chunkSize);
    const cy = Math.floor(ty / this.chunkSize);
    const chunk = this.getChunk(cx, cy);
    const localX = tx - cx * this.chunkSize;
    const localY = ty - cy * this.chunkSize;

    if (!chunk || !chunk.tiles) return 4; // Default to grass if chunk not loaded
    if (localX < 0 || localX >= this.chunkSize || localY < 0 || localY >= this.chunkSize) {
      return 4; // Default to grass for out of bounds
    }
    return chunk.tiles[localY * this.chunkSize + localX] || 4;
  }

  // unloadFarChunks(centerCx, centerCy, radius) {
  //   const toRemove = [];
  //   for (const [key, chunk] of this.chunks) {
  //     const dx = Math.abs(chunk.cx - centerCx);
  //     const dy = Math.abs(chunk.cy - centerCy);

  //     if (dx > radius || dy > radius) {
  //       toRemove.push(key);
  //     }
  //   }

  //   for (const key of toRemove) {
  //     const chunk = this.chunks.get(key);
  //     if (chunk && chunk.canvas) {
  //       // Proper canvas cleanup
  //       chunk.canvas.width = 0;
  //       chunk.canvas.height = 0;
  //     }
  //     this.chunks.delete(key);
  //   }
  // }

  // Update unloadFarChunks to clear collision data
  unloadFarChunks(centerCx, centerCy, radius) {
    const toRemove = [];
    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.cx - centerCx);
      const dy = Math.abs(chunk.cy - centerCy);

      if (dx > radius || dy > radius) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.canvas) {
        chunk.canvas.width = 0;
        chunk.canvas.height = 0;
      }
      this.chunks.delete(key);
      this.collisionMap.delete(key); // Clear collision data
    }
  }

  // Memory management and cleanup
  dispose() {
    for (const chunk of this.chunks.values()) {
      if (chunk.canvas) {
        chunk.canvas.width = 0;
        chunk.canvas.height = 0;
      }
    }
    this.chunks.clear();
    this.generationQueue.clear();

    if (this.pool) {
      this.pool.terminate();
    }
  }

  // FIXED: Collision detection to ONLY check for trees from collisionMap
  checkCollision(x, y, radius, ignoreId = null) {
    // Get the chunk coordinates for the position
    const chunkX = Math.floor(x / (this.chunkSize * this.tileSize));
    const chunkY = Math.floor(y / (this.chunkSize * this.tileSize));

    // Check current chunk and surrounding chunks (3x3 grid for overlap safety)
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const checkChunkX = chunkX + offsetX;
        const checkChunkY = chunkY + offsetY;
        const chunkKey = this._key(checkChunkX, checkChunkY);

        if (this.collisionMap.has(chunkKey)) {
          const obstacles = this.collisionMap.get(chunkKey);

          for (const obstacle of obstacles) {
            if (ignoreId && obstacle.id === ignoreId) continue;

            const dx = obstacle.x - x;
            const dy = obstacle.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = radius + (obstacle.collisionRadius || obstacle.width * 0.5);

            if (distance < minDistance) {
              return {
                collided: true,
                obstacle,
                penetration: minDistance - distance,
                direction: {
                  x: dx / distance,
                  y: dy / distance,
                },
              };
            }
          }
        }
      }
    }
    return { collided: false };
  }

  _checkTerrainCollision(x, y, radius) {
    // Convert world coordinates to tile coordinates
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);

    // Check current tile and surrounding tiles
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const checkX = tileX + offsetX;
        const checkY = tileY + offsetY;

        const tileType = this.getTileAtWorld(checkX * this.tileSize, checkY * this.tileSize);

        // Define collision tiles
        const collisionTiles = [
          5, // Forest (trees)
          7, // Mountain
          8, // Snow Mountain
          10, // Building
          11, // Ruin
        ];

        if (collisionTiles.includes(tileType)) {
          const tileCenterX = checkX * this.tileSize + this.tileSize / 2;
          const tileCenterY = checkY * this.tileSize + this.tileSize / 2;

          const dx = tileCenterX - x;
          const dy = tileCenterY - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = radius + this.tileSize * 0.4; // Collision radius for tiles

          if (distance < minDistance) {
            return {
              collided: true,
              obstacle: {
                type: this._getTileName(tileType),
                tileType: tileType,
                x: tileCenterX,
                y: tileCenterY,
              },
              penetration: minDistance - distance,
              direction: {
                x: dx / distance,
                y: dy / distance,
              },
            };
          }
        }

        // Special case: Water tiles (deep ocean and ocean)
        if (tileType === 0 || tileType === 1) {
          const tileCenterX = checkX * this.tileSize + this.tileSize / 2;
          const tileCenterY = checkY * this.tileSize + this.tileSize / 2;

          const dx = tileCenterX - x;
          const dy = tileCenterY - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = radius + this.tileSize * 0.3;

          if (distance < minDistance) {
            return {
              collided: true,
              obstacle: {
                type: 'water',
                tileType: tileType,
                x: tileCenterX,
                y: tileCenterY,
              },
              penetration: minDistance - distance,
              direction: {
                x: dx / distance,
                y: dy / distance,
              },
            };
          }
        }
      }
    }

    return { collided: false };
  }

  _getTileName(tileType) {
    const names = {
      0: 'deep_ocean',
      1: 'ocean',
      2: 'shallow_water',
      3: 'beach',
      4: 'grass',
      5: 'forest',
      6: 'dirt',
      7: 'mountain',
      8: 'snow_mountain',
      9: 'road',
      10: 'building',
      11: 'ruin',
    };
    return names[tileType] || 'unknown';
  }

  // Enhanced logging for terrain generation
  logTerrainInfo(cx, cy) {
    const chunk = this.getChunk(cx, cy);
    if (!chunk || !chunk.tiles) return;

    const tileCounts = {};
    for (let i = 0; i < chunk.tiles.length; i++) {
      const tileType = chunk.tiles[i];
      tileCounts[tileType] = (tileCounts[tileType] || 0) + 1;
    }

    console.log(`🌍 Chunk (${cx},${cy}) Terrain Composition:`, tileCounts);
  }

  // Method to check what tile player is standing on
  getPlayerTileInfo(x, y) {
    const tileType = this.getTileAtWorld(x, y);
    const tileName = this._getTileName(tileType);

    // Log player position and terrain info
    const tileInfo = `Player at (${x.toFixed(1)}, ${y.toFixed(
      1
    )}) standing on: ${tileName} (type: ${tileType})`;
    console.log(tileInfo);

    return {
      tileType: tileType,
      tileName: tileName,
      isCollidable: [0, 1, 5, 7, 8, 10, 11].includes(tileType),
    };
  }

  getNearbyObstacles(x, y, radius) {
    const nearby = [];
    for (const [chunkKey, obstacles] of this.collisionMap) {
      for (const obstacle of obstacles) {
        const dx = obstacle.x - x;
        const dy = obstacle.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < radius) {
          nearby.push({
            ...obstacle,
            distance: distance,
          });
        }
      }
    }
    return nearby;
  }

  // Enhanced chunk clearing method
  clearChunk(cx, cy) {
    const key = this._key(cx, cy);
    console.log(`Clearing chunk ${cx},${cy} (key: ${key})`);

    // Remove from chunks cache
    if (this.chunks.has(key)) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.canvas) {
        // Properly cleanup canvas
        chunk.canvas.width = 0;
        chunk.canvas.height = 0;
      }
      this.chunks.delete(key);
      console.log(`Removed chunk ${cx},${cy} from cache`);
    }

    // Remove from generation queue
    if (this.generationQueue.has(key)) {
      this.generationQueue.delete(key);
      console.log(`Removed chunk ${cx},${cy} from generation queue`);
    }

    // Remove collision data
    if (this.collisionMap.has(key)) {
      this.collisionMap.delete(key);
      console.log(`Removed collision data for chunk ${cx},${cy}`);
    }

    return true;
  }
}

// // src/engine/WorldManager.js
// import { seedStringToNumber } from '../utils/prng';
// import WorkerPool from './WorkerPool';

// // Enhanced noise functions for realistic terrain
// function fract(x) {
//   return x - Math.floor(x);
// }

// function hash2(x, y, seedNum) {
//   const s = Math.sin(x * 127.1 + y * 311.7 + seedNum * 101.7) * 43758.5453123;
//   return fract(s);
// }

// function lerp(a, b, t) {
//   return a + (b - a) * t;
// }

// function fade(t) {
//   return t * t * (3 - 2 * t);
// }

// function valueNoise2D(x, y, seedNum = 0) {
//   const x0 = Math.floor(x);
//   const y0 = Math.floor(y);
//   const sx = x - x0;
//   const sy = y - y0;
//   const n00 = hash2(x0, y0, seedNum);
//   const n10 = hash2(x0 + 1, y0, seedNum);
//   const n01 = hash2(x0, y0 + 1, seedNum);
//   const n11 = hash2(x0 + 1, y0 + 1, seedNum);
//   const ix0 = lerp(n00, n10, fade(sx));
//   const ix1 = lerp(n01, n11, fade(sx));
//   return lerp(ix0, ix1, fade(sy));
// }

// function fractalNoise2D(x, y, seedNum = 0, octaves = 4, lacunarity = 2.0, gain = 0.5) {
//   let freq = 1,
//     amp = 1,
//     sum = 0,
//     max = 0;
//   for (let i = 0; i < octaves; i++) {
//     sum += valueNoise2D(x * freq, y * freq, seedNum + i * 1000) * amp;
//     max += amp;
//     amp *= gain;
//     freq *= lacunarity;
//   }
//   return max === 0 ? 0 : sum / max;
// }

// // Multi-octave ridge noise for mountains
// function ridgeNoise(x, y, seedNum) {
//   return 1 - Math.abs(fractalNoise2D(x, y, seedNum, 1) * 2 - 1);
// }

// // 🎯 PREMIUM COLLISION SYSTEM - COMPLETE REWRITE
// export default class WorldManager {
//   constructor({
//     chunkSize = 16,
//     tileSize = 32,
//     seed = 'nit-trichy-cse-2028',
//     noiseConfig = {},
//     poolOptions = {},
//   } = {}) {
//     this.chunkSize = chunkSize;
//     this.tileSize = tileSize;
//     this.seed = seed;
//     this.seedNum = seedStringToNumber(seed);
//     this.chunks = new Map();

//     // 🎯 ENHANCED COLLISION SYSTEM
//     this.collisionMap = new Map(); // For dynamic objects (trees, buildings)
//     this.terrainCollisionCache = new Map(); // For terrain collision data
//     this.collisionDebug = true; // Enable detailed collision logging

//     // Collision configuration
//     this.collisionConfig = {
//       // Tile-based collision settings
//       tileCollision: {
//         // FULL BLOCKING TILES (completely impassable)
//         blocking: [5, 7, 8, 10, 11], // Forest, Mountains, Buildings, Ruins
//         // PARTIAL BLOCKING TILES (can be traversed with penalty or special conditions)
//         partial: [0, 1], // Water (deep ocean, ocean)
//         // WALKABLE TILES
//         walkable: [2, 3, 4, 6, 9], // Shallow water, beach, grass, dirt, road

//         // Collision radii multipliers
//         blockingRadius: 0.45, // 45% of tile size for blocking tiles
//         partialRadius: 0.25, // 25% of tile size for partial blocking
//         waterSlowdown: 0.3, // 70% speed reduction in water

//         // Advanced collision detection
//         checkSurrounding: true, // Check surrounding tiles for better accuracy
//         maxCheckDistance: 2, // Check 2 tiles away in each direction
//       },

//       // Object-based collision settings
//       objectCollision: {
//         treeRadius: 0.4, // Trees collision radius multiplier
//         buildingRadius: 0.5, // Buildings collision radius multiplier
//         precision: 0.1, // Collision precision (lower = more accurate)
//       },
//     };

//     this.treeEntities = new Map();

//     // Enhanced noise configuration for realistic terrain
//     this.noiseConfig = {
//       scale: 0.015, // Lower = larger features
//       octaves: 5,
//       lacunarity: 2.1,
//       gain: 0.45,
//       heightWeight: 1.2,
//       moistureWeight: 0.8,
//       temperatureWeight: 0.6,
//       ...noiseConfig,
//     };

//     this.viewRadius = 4;
//     this.generationQueue = new Map();
//     this._generationId = 0;

//     // WorkerPool initialization
//     this.pool = null;
//     this._initPool(poolOptions);

//     console.log('🎯 Premium WorldManager initialized with enhanced collision system');
//   }

//   _initPool(poolOptions = {}) {
//     try {
//       const workerURL = new URL('../workers/chunkWorker.js', import.meta.url);
//       this.pool = new WorkerPool(workerURL, {
//         workers: poolOptions.workers || Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
//         jobTimeoutMs: poolOptions.jobTimeoutMs || 15000,
//         verbose: !!poolOptions.verbose,
//       });
//       console.log(`[WorldManager] WorkerPool initialized with ${this.pool.maxWorkers} workers`);
//     } catch (err) {
//       console.warn(
//         '[WorldManager] WorkerPool initialization failed, using synchronous generation',
//         err
//       );
//       this.pool = null;
//     }
//   }

//   getPoolStats() {
//     if (!this.pool) {
//       return {
//         hw: navigator.hardwareConcurrency || 4,
//         maxWorkers: 0,
//         idleWorkers: 0,
//         queuedJobs: 0,
//         pendingJobs: 0,
//         activeJobs: 0,
//       };
//     }
//     return this.pool.getStats();
//   }

//   setPoolSize(n) {
//     if (!this.pool) {
//       this._initPool({ workers: n, verbose: true, jobTimeoutMs: 15000 });
//     } else {
//       this.pool.resize(Math.max(1, n));
//     }
//   }

//   _key(cx, cy) {
//     return `${cx},${cy}`;
//   }

//   setSeed(seed) {
//     this.seed = seed;
//     this.seedNum = seedStringToNumber(seed);
//     this.chunks.clear();
//     this.generationQueue.clear();
//     this.collisionMap.clear();
//     this.terrainCollisionCache.clear();
//   }

//   setNoiseConfig(cfg) {
//     this.noiseConfig = { ...this.noiseConfig, ...cfg };
//     this.chunks.clear();
//     this.generationQueue.clear();
//     this.collisionMap.clear();
//     this.terrainCollisionCache.clear();
//   }

//   // Enhanced tile rendering with detailed textures
//   _drawTile(ctx, tx, ty, tileType, tilePx, biomeData = {}) {
//     const x = tx * tilePx;
//     const y = ty * tilePx;

//     // Advanced color palette with biome variations
//     const colors = {
//       // Water biomes
//       deepOcean: '#0a1e3a',
//       ocean: '#1a3a6a',
//       shallowWater: '#2a5a9a',

//       // Beach and coastal
//       beach: '#f0e6b4',
//       wetSand: '#e8d8a8',

//       // Grasslands
//       grass: '#5a9e5a',
//       lushGrass: '#4a8e4a',
//       dryGrass: '#6aae6a',

//       // Forests
//       forest: '#3a7a3a',
//       denseForest: '#2a6a2a',
//       autumnForest: '#8a6a3a',

//       // Arid regions
//       dirt: '#8b7355',
//       dryDirt: '#9b8365',
//       crackedEarth: '#a59375',

//       // Mountains
//       mountain: '#7a7a7a',
//       highMountain: '#8a8a8a',
//       snowCap: '#e8e8e8',

//       // Special features
//       road: '#5a5a5a',
//       building: '#3a3a3a',
//       ruin: '#4a4a4a',
//     };

//     let baseColor = colors.grass;
//     let texturePattern = null;

//     switch (tileType) {
//       case 0: // Deep Ocean
//         baseColor = colors.deepOcean;
//         texturePattern = 'waves';
//         break;
//       case 1: // Ocean
//         baseColor = colors.ocean;
//         texturePattern = 'waves';
//         break;
//       case 2: // Shallow Water
//         baseColor = colors.shallowWater;
//         texturePattern = 'ripples';
//         break;
//       case 3: // Beach
//         baseColor = colors.beach;
//         texturePattern = 'sand';
//         break;
//       case 4: // Grass
//         baseColor =
//           biomeData.moisture > 0.7
//             ? colors.lushGrass
//             : biomeData.moisture < 0.3
//             ? colors.dryGrass
//             : colors.grass;
//         texturePattern = 'grass';
//         break;
//       case 5: // Forest
//         baseColor = biomeData.temperature > 0.7 ? colors.autumnForest : colors.forest;
//         texturePattern = 'forest';
//         break;
//       case 6: // Dirt
//         baseColor = colors.dirt;
//         texturePattern = 'dirt';
//         break;
//       case 7: // Mountain
//         baseColor = colors.mountain;
//         texturePattern = 'rock';
//         break;
//       case 8: // Snow
//         baseColor = colors.snowCap;
//         texturePattern = 'snow';
//         break;
//       case 9: // Road
//         baseColor = colors.road;
//         texturePattern = 'road';
//         break;
//       case 10: // Building
//         baseColor = colors.building;
//         texturePattern = 'building';
//         break;
//       case 11: // Ruin
//         baseColor = colors.ruin;
//         texturePattern = 'ruin';
//         break;
//     }

//     // Draw base tile
//     ctx.fillStyle = baseColor;
//     ctx.fillRect(x, y, tilePx, tilePx);

//     // Apply texture patterns
//     this._applyTexture(ctx, x, y, tilePx, texturePattern, biomeData);

//     // Subtle grid for debug clarity
//     ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
//     ctx.lineWidth = 0.5;
//     ctx.strokeRect(x, y, tilePx, tilePx);
//   }

//   _applyTexture(ctx, x, y, size, pattern, biomeData) {
//     ctx.save();

//     switch (pattern) {
//       case 'waves':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
//         for (let i = 0; i < 2; i++) {
//           const waveY = y + size * 0.7 + Math.sin(x * 0.1) * 2;
//           ctx.fillRect(x + 2, waveY, size - 4, 1);
//         }
//         break;

//       case 'ripples':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
//         ctx.beginPath();
//         ctx.arc(x + size / 2, y + size / 2, size * 0.3, 0, Math.PI * 2);
//         ctx.fill();
//         break;

//       case 'sand':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
//         for (let i = 0; i < 3; i++) {
//           ctx.fillRect(
//             x + 2 + Math.random() * (size - 4),
//             y + 2 + Math.random() * (size - 4),
//             1,
//             1
//           );
//         }
//         break;

//       case 'grass':
//         ctx.fillStyle = 'rgba(106, 190, 106, 0.2)';
//         if ((x + y) % 4 === 0) {
//           ctx.fillRect(x + 4, y + 4, size - 8, 1);
//         }
//         break;

//       case 'forest':
//         ctx.fillStyle = 'rgba(40, 100, 40, 0.3)';
//         ctx.fillRect(x, y, size, size);
//         break;

//       case 'dirt':
//         ctx.fillStyle = 'rgba(101, 67, 33, 0.15)';
//         for (let i = 0; i < 4; i++) {
//           ctx.fillRect(
//             x + 2 + Math.random() * (size - 4),
//             y + 2 + Math.random() * (size - 4),
//             1,
//             1
//           );
//         }
//         break;

//       case 'rock':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
//         if ((x * y) % 7 === 0) {
//           ctx.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
//         }
//         break;

//       case 'snow':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
//         for (let i = 0; i < 2; i++) {
//           ctx.fillRect(
//             x + 2 + Math.random() * (size - 4),
//             y + 2 + Math.random() * (size - 4),
//             2,
//             2
//           );
//         }
//         break;

//       case 'road':
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
//         ctx.fillRect(x + size * 0.4, y + 2, size * 0.2, size - 4);
//         break;
//     }

//     ctx.restore();
//   }

//   // Enhanced tree rendering with larger size
//   _drawTree(ctx, x, y, size, treeType = 'oak', age = 1) {
//     const trunkHeight = size * 1.2 * age;
//     const canopySize = size * 1.4 * age;

//     ctx.save();

//     // Trunk - thicker
//     ctx.fillStyle = treeType === 'pine' ? '#5d4037' : treeType === 'birch' ? '#d7ccc8' : '#8d6e63';
//     ctx.fillRect(x - size * 0.12, y - trunkHeight, size * 0.24, trunkHeight);

//     // Canopy - larger
//     switch (treeType) {
//       case 'pine':
//         ctx.fillStyle = '#2e7d32';
//         // Triangular canopy - larger
//         ctx.beginPath();
//         ctx.moveTo(x, y - trunkHeight - canopySize);
//         ctx.lineTo(x - canopySize / 1.8, y - trunkHeight);
//         ctx.lineTo(x + canopySize / 1.8, y - trunkHeight);
//         ctx.closePath();
//         ctx.fill();
//         break;

//       case 'birch':
//         ctx.fillStyle = '#a5d6a7';
//         ctx.beginPath();
//         ctx.arc(x, y - trunkHeight - canopySize / 2.5, canopySize / 1.8, 0, Math.PI * 2);
//         ctx.fill();
//         // Birch markings
//         ctx.strokeStyle = '#ffffff';
//         ctx.lineWidth = 1.5;
//         for (let i = 0; i < 4; i++) {
//           ctx.beginPath();
//           ctx.moveTo(x - size * 0.08, y - trunkHeight + i * 10);
//           ctx.lineTo(x + size * 0.08, y - trunkHeight + i * 10);
//           ctx.stroke();
//         }
//         break;

//       default: // Oak
//         ctx.fillStyle = '#4caf50';
//         ctx.beginPath();
//         ctx.arc(x, y - trunkHeight - canopySize / 2.5, canopySize / 1.8, 0, Math.PI * 2);
//         ctx.fill();
//         break;
//     }

//     ctx.restore();

//     // Return detailed collision data for this tree
//     return {
//       x: x,
//       y: y - trunkHeight / 2, // Center collision on trunk
//       width: canopySize,
//       height: trunkHeight + canopySize,
//       type: 'tree',
//       treeType: treeType,
//       collisionRadius:
//         Math.max(canopySize, trunkHeight) * this.collisionConfig.objectCollision.treeRadius,
//     };
//   }

//   // Building rendering with different architectural styles
//   _drawBuilding(ctx, x, y, width, height, style = 'medieval', condition = 1) {
//     ctx.save();

//     const isRuined = condition < 0.3;
//     const baseColor = isRuined ? '#5d4037' : style === 'modern' ? '#37474f' : '#5d4037';

//     // Building base
//     ctx.fillStyle = baseColor;
//     ctx.fillRect(x - width / 2, y - height, width, height);

//     if (!isRuined) {
//       // Roof
//       ctx.fillStyle = style === 'modern' ? '#455a64' : '#d32f2f';
//       if (style === 'medieval') {
//         // Triangular roof
//         ctx.beginPath();
//         ctx.moveTo(x - width / 2, y - height);
//         ctx.lineTo(x + width / 2, y - height);
//         ctx.lineTo(x, y - height - width / 2);
//         ctx.closePath();
//         ctx.fill();
//       } else {
//         // Flat roof for modern buildings
//         ctx.fillRect(x - width / 2 - 2, y - height - 5, width + 4, 5);
//       }

//       // Door
//       ctx.fillStyle = '#5d4037';
//       ctx.fillRect(x - 3, y - 10, 6, 10);

//       // Windows
//       ctx.fillStyle = style === 'modern' ? '#81d4fa' : '#ffeb3b';
//       if (style === 'medieval') {
//         ctx.fillRect(x - width / 2 + 5, y - height + 15, 4, 4);
//         ctx.fillRect(x + width / 2 - 9, y - height + 15, 4, 4);
//       } else {
//         // Grid windows for modern buildings
//         for (let i = 0; i < 3; i++) {
//           for (let j = 0; j < 3; j++) {
//             ctx.fillRect(x - width / 2 + 8 + i * 8, y - height + 15 + j * 12, 4, 4);
//           }
//         }
//       }
//     } else {
//       // Ruined building - broken walls and openings
//       ctx.fillStyle = '#8d6e63';
//       ctx.fillRect(x - width / 2, y - height, width, height * 0.3);

//       // Collapsed sections
//       ctx.fillStyle = '#6d4c41';
//       for (let i = 0; i < 3; i++) {
//         ctx.fillRect(x - width / 2 + i * (width / 3), y - height * 0.7, width / 4, height * 0.4);
//       }
//     }

//     ctx.restore();

//     // Return building collision data
//     return {
//       x: x,
//       y: y - height / 2,
//       width: width,
//       height: height,
//       type: 'building',
//       style: style,
//       condition: condition,
//       collisionRadius:
//         Math.max(width, height) * this.collisionConfig.objectCollision.buildingRadius,
//     };
//   }

//   _createCanvasForTiles(cx, cy, tiles, biomeData) {
//     const size = this.chunkSize;
//     const tilePx = this.tileSize;
//     const canv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
//     if (!canv) return null;

//     canv.width = size * tilePx;
//     canv.height = size * tilePx;
//     const ctx = canv.getContext('2d');

//     // Generate terrain using multi-layer noise simulation
//     if (!tiles || !biomeData) {
//       const generated = this._generateChunkData(cx, cy);
//       tiles = generated.tiles;
//       biomeData = generated.biomeData;
//     }

//     // Draw all tiles with biome-aware rendering
//     for (let ty = 0; ty < size; ty++) {
//       for (let tx = 0; tx < size; tx++) {
//         const idx = ty * size + tx;
//         const tileBiome = {
//           height: biomeData.height[idx],
//           moisture: biomeData.moisture[idx],
//           temperature: biomeData.temperature[idx],
//         };
//         this._drawTile(ctx, tx, ty, tiles[idx], tilePx, tileBiome);
//       }
//     }

//     // Add environmental features (trees, buildings, etc.)
//     this._decorateChunk(ctx, cx, cy, tiles, biomeData, tilePx);

//     return { canvas: canv, tiles, biomeData };
//   }

//   _generateChunkData(cx, cy) {
//     const size = this.chunkSize;
//     const tiles = new Uint8Array(size * size);
//     const heightMap = new Float32Array(size * size);
//     const moistureMap = new Float32Array(size * size);
//     const temperatureMap = new Float32Array(size * size);

//     const scale = this.noiseConfig.scale;
//     const octaves = this.noiseConfig.octaves;

//     for (let ty = 0; ty < size; ty++) {
//       for (let tx = 0; tx < size; tx++) {
//         const worldX = cx * size + tx;
//         const worldY = cy * size + ty;
//         const idx = ty * size + tx;

//         // Generate multiple noise layers for realistic terrain
//         const height =
//           fractalNoise2D(
//             worldX * scale,
//             worldY * scale,
//             this.seedNum,
//             octaves,
//             this.noiseConfig.lacunarity,
//             this.noiseConfig.gain
//           ) * this.noiseConfig.heightWeight;

//         const moisture =
//           fractalNoise2D(
//             worldX * scale * 1.3,
//             worldY * scale * 1.3,
//             this.seedNum + 1000,
//             octaves - 1
//           ) * this.noiseConfig.moistureWeight;

//         const temperature =
//           fractalNoise2D(
//             worldX * scale * 0.8,
//             worldY * scale * 0.8,
//             this.seedNum + 2000,
//             octaves - 1
//           ) * this.noiseConfig.temperatureWeight;

//         const ridge = ridgeNoise(worldX * scale * 0.5, worldY * scale * 0.5, this.seedNum + 3000);

//         heightMap[idx] = height;
//         moistureMap[idx] = moisture;
//         temperatureMap[idx] = temperature;

//         // Advanced biome determination
//         let tileType = 4; // Default to grass

//         if (height < 0.15) {
//           tileType = height < 0.05 ? 0 : height < 0.1 ? 1 : 2; // Deep ocean -> ocean -> shallow
//         } else if (height < 0.2) {
//           tileType = 3; // Beach
//         } else if (height < 0.5) {
//           if (moisture > 0.7) {
//             tileType = 5; // Forest
//           } else if (moisture < 0.3) {
//             tileType = 6; // Dirt/arid
//           } else {
//             tileType = 4; // Grass
//           }
//         } else if (height < 0.75) {
//           if (ridge > 0.6) {
//             tileType = 7; // Mountain
//           } else {
//             tileType = temperature > 0.6 ? 6 : 4; // Dirt in warm areas, else grass
//           }
//         } else {
//           tileType = height > 0.85 ? 8 : 7; // Snow caps on highest mountains
//         }

//         // Add human infrastructure based on strategic noise
//         const featureNoise = fractalNoise2D(
//           worldX * scale * 4,
//           worldY * scale * 4,
//           this.seedNum + 4000,
//           2
//         );

//         if (
//           featureNoise > 0.65 &&
//           featureNoise < 0.67 &&
//           height > 0.3 &&
//           height < 0.6 &&
//           moisture > 0.4
//         ) {
//           tileType = 9; // Road network
//         } else if (featureNoise > 0.75 && height > 0.35 && height < 0.5) {
//           tileType = temperature > 0.5 ? 10 : 11; // Buildings or ruins based on climate
//         }

//         tiles[idx] = tileType;
//       }
//     }

//     return {
//       tiles,
//       biomeData: {
//         height: heightMap,
//         moisture: moistureMap,
//         temperature: temperatureMap,
//       },
//     };
//   }

//   // Enhanced decoration with premium collision tracking
//   _decorateChunk(ctx, cx, cy, tiles, biomeData, tilePx) {
//     const size = this.chunkSize;
//     const rng = this._createChunkRNG(cx, cy);
//     const chunkKey = this._key(cx, cy);
//     const chunkObjects = [];

//     for (let ty = 0; ty < size; ty++) {
//       for (let tx = 0; tx < size; tx++) {
//         const idx = ty * size + tx;
//         const tileType = tiles[idx];
//         const worldX = cx * size * tilePx + tx * tilePx + tilePx / 2;
//         const worldY = cy * size * tilePx + ty * tilePx + tilePx / 2;
//         const featureRoll = rng();

//         // Place environmental features based on tile type and biome
//         switch (tileType) {
//           case 5: // Forest - dense trees
//             if (featureRoll < 0.3) {
//               const treeType = featureRoll < 0.1 ? 'pine' : featureRoll < 0.2 ? 'birch' : 'oak';
//               const treeCollision = this._drawTree(
//                 ctx,
//                 tx * tilePx + tilePx / 2,
//                 ty * tilePx + tilePx / 2,
//                 tilePx * 1.1,
//                 treeType,
//                 0.8 + featureRoll * 0.4
//               );
//               chunkObjects.push({
//                 ...treeCollision,
//                 id: `${chunkKey}_tree_${tx}_${ty}`,
//                 tileX: tx,
//                 tileY: ty,
//               });
//             }
//             break;

//           case 4: // Grass - occasional trees
//             if (featureRoll < 0.05 && biomeData.moisture[idx] > 0.5) {
//               const treeCollision = this._drawTree(
//                 ctx,
//                 tx * tilePx + tilePx / 2,
//                 ty * tilePx + tilePx / 2,
//                 tilePx * 0.9,
//                 'oak',
//                 0.6 + featureRoll
//               );
//               chunkObjects.push({
//                 ...treeCollision,
//                 id: `${chunkKey}_tree_${tx}_${ty}`,
//                 tileX: tx,
//                 tileY: ty,
//               });
//             }
//             break;

//           case 10: {
//             // Building
//             const buildingStyle = featureRoll < 0.5 ? 'medieval' : 'modern';
//             const condition = 0.3 + featureRoll * 0.7;
//             const buildingCollision = this._drawBuilding(
//               ctx,
//               tx * tilePx + tilePx / 2,
//               ty * tilePx + tilePx / 2,
//               tilePx * (buildingStyle === 'modern' ? 0.9 : 0.7),
//               tilePx * (buildingStyle === 'modern' ? 1.2 : 0.8),
//               buildingStyle,
//               condition
//             );
//             chunkObjects.push({
//               ...buildingCollision,
//               id: `${chunkKey}_building_${tx}_${ty}`,
//               tileX: tx,
//               tileY: ty,
//             });
//             break;
//           }
//           case 11: {
//             // Ruins
//             const ruinCollision = this._drawBuilding(
//               ctx,
//               tx * tilePx + tilePx / 2,
//               ty * tilePx + tilePx / 2,
//               tilePx * 0.8,
//               tilePx * 0.6,
//               'medieval',
//               0.2 + featureRoll * 0.3
//             );
//             chunkObjects.push({
//               ...ruinCollision,
//               id: `${chunkKey}_ruin_${tx}_${ty}`,
//               tileX: tx,
//               tileY: ty,
//             });
//             break;
//           }
//         }
//       }
//     }

//     // Store collision data for this chunk
//     this.collisionMap.set(chunkKey, chunkObjects);

//     // Also cache terrain collision data for this chunk
//     this._cacheTerrainCollisionData(cx, cy, tiles);

//     return chunkObjects;
//   }

//   // 🎯 PREMIUM COLLISION SYSTEM - CORE METHODS

//   _cacheTerrainCollisionData(cx, cy, tiles) {
//     const chunkKey = this._key(cx, cy);
//     const collisionData = {
//       blockingTiles: [],
//       partialTiles: [],
//     };

//     for (let ty = 0; ty < this.chunkSize; ty++) {
//       for (let tx = 0; tx < this.chunkSize; tx++) {
//         const idx = ty * this.chunkSize + tx;
//         const tileType = tiles[idx];
//         const worldX = cx * this.chunkSize * this.tileSize + tx * this.tileSize + this.tileSize / 2;
//         const worldY = cy * this.chunkSize * this.tileSize + ty * this.tileSize + this.tileSize / 2;

//         if (this.collisionConfig.tileCollision.blocking.includes(tileType)) {
//           collisionData.blockingTiles.push({
//             x: worldX,
//             y: worldY,
//             tileType: tileType,
//             tileName: this._getTileName(tileType),
//             collisionRadius: this.tileSize * this.collisionConfig.tileCollision.blockingRadius,
//           });
//         } else if (this.collisionConfig.tileCollision.partial.includes(tileType)) {
//           collisionData.partialTiles.push({
//             x: worldX,
//             y: worldY,
//             tileType: tileType,
//             tileName: this._getTileName(tileType),
//             collisionRadius: this.tileSize * this.collisionConfig.tileCollision.partialRadius,
//           });
//         }
//       }
//     }

//     this.terrainCollisionCache.set(chunkKey, collisionData);
//   }

//   // 🎯 MAIN COLLISION DETECTION METHOD - COMPLETELY REWRITTEN
//   checkCollision(x, y, radius, ignoreId = null) {
//     // 1. First check terrain collision (tiles)
//     const terrainCollision = this._checkTerrainCollision(x, y, radius);
//     if (terrainCollision.collided) {
//       if (this.collisionDebug) {
//         console.log(
//           `🎯 TERRAIN COLLISION: ${terrainCollision.obstacle.type} at (${x.toFixed(1)}, ${y.toFixed(
//             1
//           )})`
//         );
//       }
//       return terrainCollision;
//     }

//     // 2. Then check object collision (trees, buildings)
//     const objectCollision = this._checkObjectCollision(x, y, radius, ignoreId);
//     if (objectCollision.collided) {
//       if (this.collisionDebug) {
//         console.log(
//           `🎯 OBJECT COLLISION: ${objectCollision.obstacle.type} at (${x.toFixed(1)}, ${y.toFixed(
//             1
//           )})`
//         );
//       }
//       return objectCollision;
//     }

//     return { collided: false };
//   }

//   _checkTerrainCollision(x, y, radius) {
//     // Get current tile coordinates
//     const tileX = Math.floor(x / this.tileSize);
//     const tileY = Math.floor(y / this.tileSize);

//     // Check surrounding tiles based on configuration
//     const checkDistance = this.collisionConfig.tileCollision.maxCheckDistance;

//     for (let offsetX = -checkDistance; offsetX <= checkDistance; offsetX++) {
//       for (let offsetY = -checkDistance; offsetY <= checkDistance; offsetY++) {
//         const checkTileX = tileX + offsetX;
//         const checkTileY = tileY + offsetY;

//         const tileType = this.getTileAtWorld(
//           checkTileX * this.tileSize,
//           checkTileY * this.tileSize
//         );

//         // Check if this tile type should cause collision
//         if (this.collisionConfig.tileCollision.blocking.includes(tileType)) {
//           const tileCenterX = checkTileX * this.tileSize + this.tileSize / 2;
//           const tileCenterY = checkTileY * this.tileSize + this.tileSize / 2;

//           const dx = tileCenterX - x;
//           const dy = tileCenterY - y;
//           const distance = Math.sqrt(dx * dx + dy * dy);
//           const minDistance =
//             radius + this.tileSize * this.collisionConfig.tileCollision.blockingRadius;

//           if (distance < minDistance) {
//             return {
//               collided: true,
//               obstacle: {
//                 type: this._getTileName(tileType),
//                 tileType: tileType,
//                 x: tileCenterX,
//                 y: tileCenterY,
//                 isTerrain: true,
//               },
//               penetration: minDistance - distance,
//               direction: {
//                 x: dx / distance,
//                 y: dy / distance,
//               },
//               collisionType: 'terrain',
//             };
//           }
//         }

//         // Check for partial collisions (water)
//         if (this.collisionConfig.tileCollision.partial.includes(tileType)) {
//           const tileCenterX = checkTileX * this.tileSize + this.tileSize / 2;
//           const tileCenterY = checkTileY * this.tileSize + this.tileSize / 2;

//           const dx = tileCenterX - x;
//           const dy = tileCenterY - y;
//           const distance = Math.sqrt(dx * dx + dy * dy);
//           const minDistance =
//             radius + this.tileSize * this.collisionConfig.tileCollision.partialRadius;

//           if (distance < minDistance) {
//             return {
//               collided: true,
//               obstacle: {
//                 type: this._getTileName(tileType),
//                 tileType: tileType,
//                 x: tileCenterX,
//                 y: tileCenterY,
//                 isTerrain: true,
//                 isWater: true,
//               },
//               penetration: minDistance - distance,
//               direction: {
//                 x: dx / distance,
//                 y: dy / distance,
//               },
//               collisionType: 'water',
//               slowdown: this.collisionConfig.tileCollision.waterSlowdown,
//             };
//           }
//         }
//       }
//     }

//     return { collided: false };
//   }

//   _checkObjectCollision(x, y, radius, ignoreId = null) {
//     // Get chunks that might contain collision objects near the position
//     const chunkX = Math.floor(x / (this.chunkSize * this.tileSize));
//     const chunkY = Math.floor(y / (this.chunkSize * this.tileSize));

//     // Check current chunk and surrounding chunks
//     for (let offsetX = -1; offsetX <= 1; offsetX++) {
//       for (let offsetY = -1; offsetY <= 1; offsetY++) {
//         const checkChunkX = chunkX + offsetX;
//         const checkChunkY = chunkY + offsetY;
//         const chunkKey = this._key(checkChunkX, checkChunkY);

//         if (this.collisionMap.has(chunkKey)) {
//           const objects = this.collisionMap.get(chunkKey);

//           for (const object of objects) {
//             if (ignoreId && object.id === ignoreId) continue;

//             const dx = object.x - x;
//             const dy = object.y - y;
//             const distance = Math.sqrt(dx * dx + dy * dy);
//             const minDistance = radius + (object.collisionRadius || object.width * 0.4);

//             if (distance < minDistance) {
//               return {
//                 collided: true,
//                 obstacle: {
//                   ...object,
//                   isObject: true,
//                 },
//                 penetration: minDistance - distance,
//                 direction: {
//                   x: dx / distance,
//                   y: dy / distance,
//                 },
//                 collisionType: 'object',
//               };
//             }
//           }
//         }
//       }
//     }

//     return { collided: false };
//   }

//   _createChunkRNG(cx, cy) {
//     // Create deterministic RNG for chunk decoration
//     const seed = this.seedNum + cx * 131 + cy * 197;
//     let state = seed;
//     return () => {
//       state = Math.imul(state, 1597334677) | 0;
//       state = Math.imul(state, 1597334677) | 0;
//       return (state & 0x7fffffff) / 0x7fffffff;
//     };
//   }

//   _postProcessGeneratedChunk(cx, cy, data) {
//     const rendered = this._createCanvasForTiles(cx, cy, data?.tiles, data?.biomeData);
//     return {
//       cx,
//       cy,
//       tiles: data?.tiles || new Uint8Array(this.chunkSize * this.chunkSize),
//       biomeData: data?.biomeData || {},
//       generatedAt: Date.now(),
//       canvas: rendered ? rendered.canvas : null,
//       _generationId: this._generationId++,
//     };
//   }

//   async _generateChunkAsync(cx, cy) {
//     const key = this._key(cx, cy);

//     // Check if already generating
//     if (this.generationQueue.has(key)) {
//       return this.generationQueue.get(key);
//     }

//     // Check if already exists
//     if (this.chunks.has(key)) {
//       const existing = this.chunks.get(key);
//       if (existing.canvas) return existing;
//     }

//     if (this.pool) {
//       try {
//         const generationPromise = (async () => {
//           const args = {
//             cx,
//             cy,
//             chunkSize: this.chunkSize,
//             tileSize: this.tileSize,
//             seedNum: this.seedNum,
//             noiseConfig: this.noiseConfig,
//           };

//           const result = await this.pool.enqueue(args);
//           const chunk = this._postProcessGeneratedChunk(cx, cy, result);
//           this.chunks.set(key, chunk);
//           this.generationQueue.delete(key);
//           return chunk;
//         })();

//         this.generationQueue.set(key, generationPromise);
//         return await generationPromise;
//       } catch (err) {
//         console.warn(`[WorldManager] Worker generation failed for chunk ${cx},${cy}:`, err);
//         this.generationQueue.delete(key);
//       }
//     }

//     // Fallback to synchronous generation
//     const data = this._generateChunkData(cx, cy);
//     const chunk = this._postProcessGeneratedChunk(cx, cy, data);
//     this.chunks.set(key, chunk);
//     return chunk;
//   }

//   getChunk(cx, cy) {
//     const key = this._key(cx, cy);

//     // Return existing chunk if available and valid
//     if (this.chunks.has(key)) {
//       const chunk = this.chunks.get(key);
//       if (chunk.canvas) return chunk;
//     }

//     // Create placeholder and trigger async generation
//     const placeholder = this._postProcessGeneratedChunk(cx, cy, null);
//     this.chunks.set(key, placeholder);

//     // Start async generation
//     this._generateChunkAsync(cx, cy).catch((err) => {
//       console.warn(`[WorldManager] Async generation failed for ${cx},${cy}:`, err);
//     });

//     return placeholder;
//   }

//   getChunksInRect(rect) {
//     const tileTotal = this.chunkSize * this.tileSize;
//     const minCx = Math.floor(rect.minX / tileTotal);
//     const maxCx = Math.floor(rect.maxX / tileTotal);
//     const minCy = Math.floor(rect.minY / tileTotal);
//     const maxCy = Math.floor(rect.maxY / tileTotal);

//     const chunks = [];
//     for (let cx = minCx; cx <= maxCx; cx++) {
//       for (let cy = minCy; cy <= maxCy; cy++) {
//         chunks.push(this.getChunk(cx, cy));
//       }
//     }
//     return chunks;
//   }

//   getTileAtWorld(x, y) {
//     const totalTilePx = this.tileSize;
//     const tx = Math.floor(x / totalTilePx);
//     const ty = Math.floor(y / totalTilePx);
//     const cx = Math.floor(tx / this.chunkSize);
//     const cy = Math.floor(ty / this.chunkSize);
//     const chunk = this.getChunk(cx, cy);
//     const localX = tx - cx * this.chunkSize;
//     const localY = ty - cy * this.chunkSize;

//     if (!chunk || !chunk.tiles) return 0;
//     return chunk.tiles[localY * this.chunkSize + localX];
//   }

//   unloadFarChunks(centerCx, centerCy, radius) {
//     const toRemove = [];
//     for (const [key, chunk] of this.chunks) {
//       const dx = Math.abs(chunk.cx - centerCx);
//       const dy = Math.abs(chunk.cy - centerCy);

//       if (dx > radius || dy > radius) {
//         toRemove.push(key);
//       }
//     }

//     for (const key of toRemove) {
//       const chunk = this.chunks.get(key);
//       if (chunk && chunk.canvas) {
//         chunk.canvas.width = 0;
//         chunk.canvas.height = 0;
//       }
//       this.chunks.delete(key);
//       this.collisionMap.delete(key);
//       this.terrainCollisionCache.delete(key);
//     }
//   }

//   // Memory management and cleanup
//   dispose() {
//     for (const chunk of this.chunks.values()) {
//       if (chunk.canvas) {
//         chunk.canvas.width = 0;
//         chunk.canvas.height = 0;
//       }
//     }
//     this.chunks.clear();
//     this.generationQueue.clear();
//     this.collisionMap.clear();
//     this.terrainCollisionCache.clear();

//     if (this.pool) {
//       this.pool.terminate();
//     }
//   }

//   _getTileName(tileType) {
//     const names = {
//       0: 'deep_ocean',
//       1: 'ocean',
//       2: 'shallow_water',
//       3: 'beach',
//       4: 'grass',
//       5: 'forest',
//       6: 'dirt',
//       7: 'mountain',
//       8: 'snow_mountain',
//       9: 'road',
//       10: 'building',
//       11: 'ruin',
//     };
//     return names[tileType] || 'unknown';
//   }

//   // Enhanced logging for terrain generation
//   logTerrainInfo(cx, cy) {
//     const chunk = this.getChunk(cx, cy);
//     if (!chunk || !chunk.tiles) return;

//     const tileCounts = {};
//     for (let i = 0; i < chunk.tiles.length; i++) {
//       const tileType = chunk.tiles[i];
//       tileCounts[tileType] = (tileCounts[tileType] || 0) + 1;
//     }

//     console.log(`🌍 Chunk (${cx},${cy}) Terrain Composition:`, tileCounts);
//   }

//   // 🎯 PREMIUM PLAYER TILE INFO WITH COLLISION DATA
//   getPlayerTileInfo(x, y) {
//     const tileType = this.getTileAtWorld(x, y);
//     const tileName = this._getTileName(tileType);

//     const isBlocking = this.collisionConfig.tileCollision.blocking.includes(tileType);
//     const isPartial = this.collisionConfig.tileCollision.partial.includes(tileType);
//     const isWalkable = this.collisionConfig.tileCollision.walkable.includes(tileType);

//     const collisionStatus = isBlocking ? 'BLOCKED' : isPartial ? 'SLOW' : 'WALKABLE';

//     console.log(`📍 Player at (${x.toFixed(1)}, ${y.toFixed(1)}) standing on: ${tileName}`);
//     console.log(`   Collision: ${collisionStatus} | Type: ${tileType}`);

//     return {
//       tileType: tileType,
//       tileName: tileName,
//       isBlocking: isBlocking,
//       isPartial: isPartial,
//       isWalkable: isWalkable,
//       collisionStatus: collisionStatus,
//     };
//   }

//   // 🎯 ENHANCED COLLISION DEBUGGING
//   enableCollisionDebug(enable = true) {
//     this.collisionDebug = enable;
//     console.log(`🎯 Collision Debug: ${enable ? 'ENABLED' : 'DISABLED'}`);
//   }

//   getCollisionStats() {
//     let totalObjects = 0;
//     let totalBlockingTiles = 0;
//     let totalPartialTiles = 0;

//     for (const [chunkKey, objects] of this.collisionMap) {
//       totalObjects += objects.length;
//     }

//     for (const [chunkKey, terrainData] of this.terrainCollisionCache) {
//       totalBlockingTiles += terrainData.blockingTiles.length;
//       totalPartialTiles += terrainData.partialTiles.length;
//     }

//     return {
//       totalChunks: this.chunks.size,
//       totalCollisionObjects: totalObjects,
//       totalBlockingTiles: totalBlockingTiles,
//       totalPartialTiles: totalPartialTiles,
//       collisionDebug: this.collisionDebug,
//     };
//   }

//   getNearbyObstacles(x, y, radius) {
//     const nearby = [];

//     // Check terrain obstacles
//     const tileX = Math.floor(x / this.tileSize);
//     const tileY = Math.floor(y / this.tileSize);

//     for (let offsetX = -2; offsetX <= 2; offsetX++) {
//       for (let offsetY = -2; offsetY <= 2; offsetY++) {
//         const checkTileX = tileX + offsetX;
//         const checkTileY = tileY + offsetY;
//         const tileType = this.getTileAtWorld(
//           checkTileX * this.tileSize,
//           checkTileY * this.tileSize
//         );

//         if (
//           this.collisionConfig.tileCollision.blocking.includes(tileType) ||
//           this.collisionConfig.tileCollision.partial.includes(tileType)
//         ) {
//           const tileCenterX = checkTileX * this.tileSize + this.tileSize / 2;
//           const tileCenterY = checkTileY * this.tileSize + this.tileSize / 2;

//           const dx = tileCenterX - x;
//           const dy = tileCenterY - y;
//           const distance = Math.sqrt(dx * dx + dy * dy);

//           if (distance < radius) {
//             nearby.push({
//               x: tileCenterX,
//               y: tileCenterY,
//               type: this._getTileName(tileType),
//               tileType: tileType,
//               distance: distance,
//               isTerrain: true,
//             });
//           }
//         }
//       }
//     }

//     // Check object obstacles
//     const chunkX = Math.floor(x / (this.chunkSize * this.tileSize));
//     const chunkY = Math.floor(y / (this.chunkSize * this.tileSize));

//     for (let offsetX = -1; offsetX <= 1; offsetX++) {
//       for (let offsetY = -1; offsetY <= 1; offsetY++) {
//         const checkChunkX = chunkX + offsetX;
//         const checkChunkY = chunkY + offsetY;
//         const chunkKey = this._key(checkChunkX, checkChunkY);

//         if (this.collisionMap.has(chunkKey)) {
//           const objects = this.collisionMap.get(chunkKey);

//           for (const object of objects) {
//             const dx = object.x - x;
//             const dy = object.y - y;
//             const distance = Math.sqrt(dx * dx + dy * dy);

//             if (distance < radius) {
//               nearby.push({
//                 ...object,
//                 distance: distance,
//                 isObject: true,
//               });
//             }
//           }
//         }
//       }
//     }

//     // Sort by distance
//     nearby.sort((a, b) => a.distance - b.distance);

//     return nearby;
//   }

//   // Enhanced chunk clearing method
//   clearChunk(cx, cy) {
//     const key = this._key(cx, cy);
//     console.log(`Clearing chunk ${cx},${cy} (key: ${key})`);

//     // Remove from chunks cache
//     if (this.chunks.has(key)) {
//       const chunk = this.chunks.get(key);
//       if (chunk && chunk.canvas) {
//         chunk.canvas.width = 0;
//         chunk.canvas.height = 0;
//       }
//       this.chunks.delete(key);
//       console.log(`Removed chunk ${cx},${cy} from cache`);
//     }

//     // Remove from generation queue
//     if (this.generationQueue.has(key)) {
//       this.generationQueue.delete(key);
//       console.log(`Removed chunk ${cx},${cy} from generation queue`);
//     }

//     // Remove collision data
//     if (this.collisionMap.has(key)) {
//       this.collisionMap.delete(key);
//       console.log(`Removed collision data for chunk ${cx},${cy}`);
//     }

//     // Remove terrain collision cache
//     if (this.terrainCollisionCache.has(key)) {
//       this.terrainCollisionCache.delete(key);
//       console.log(`Removed terrain collision cache for chunk ${cx},${cy}`);
//     }

//     return true;
//   }

//   // Add to WorldManager.js - Safe spawn position finder
//   findSafeSpawnPosition(centerX = 0, centerY = 0, searchRadius = 500, maxAttempts = 50) {
//     const safeTiles = [3, 4, 6, 9]; // beach, grass, dirt, road

//     for (let attempt = 0; attempt < maxAttempts; attempt++) {
//       // Try random position within search radius
//       const angle = Math.random() * Math.PI * 2;
//       const distance = Math.random() * searchRadius;
//       const x = centerX + Math.cos(angle) * distance;
//       const y = centerY + Math.sin(angle) * distance;

//       const tileType = this.getTileAtWorld(x, y);

//       if (safeTiles.includes(tileType)) {
//         console.log(
//           `🎯 Found safe spawn at (${x.toFixed(1)}, ${y.toFixed(1)}) on ${this._getTileName(
//             tileType
//           )}`
//         );
//         return { x, y, tileType, tileName: this._getTileName(tileType) };
//       }
//     }

//     // Fallback: try a spiral search pattern
//     console.log('🔍 Falling back to spiral search for safe spawn...');
//     for (let radius = 50; radius <= searchRadius; radius += 50) {
//       for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
//         const x = centerX + Math.cos(angle) * radius;
//         const y = centerY + Math.sin(angle) * radius;

//         const tileType = this.getTileAtWorld(x, y);

//         if (safeTiles.includes(tileType)) {
//           console.log(
//             `🎯 Found safe spawn via spiral at (${x.toFixed(1)}, ${y.toFixed(
//               1
//             )}) on ${this._getTileName(tileType)}`
//           );
//           return { x, y, tileType, tileName: this._getTileName(tileType) };
//         }
//       }
//     }

//     // Ultimate fallback
//     console.warn('⚠️ Could not find safe spawn position, using default');
//     return { x: 100, y: 100, tileType: 4, tileName: 'grass' };
//   }

//   // Add to WorldManager.js
//   analyzeWorldAround(x, y, radius = 500) {
//     console.log('🌍 WORLD ANALYSIS:');

//     let tileCounts = {};
//     let totalTiles = 0;

//     // Sample tiles in a grid pattern around the position
//     for (let sampleX = x - radius; sampleX <= x + radius; sampleX += 50) {
//       for (let sampleY = y - radius; sampleY <= y + radius; sampleY += 50) {
//         const tileType = this.getTileAtWorld(sampleX, sampleY);
//         const tileName = this._getTileName(tileType);

//         tileCounts[tileName] = (tileCounts[tileName] || 0) + 1;
//         totalTiles++;
//       }
//     }

//     console.log('Tile distribution around player:');
//     Object.entries(tileCounts).forEach(([tileName, count]) => {
//       const percentage = ((count / totalTiles) * 100).toFixed(1);
//       console.log(`  ${tileName}: ${count} tiles (${percentage}%)`);
//     });

//     return tileCounts;
//   }
// }
