// src/components/Sidebar.jsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PoolControl from './PoolControl';
import FPSChart from './FPSChart';
import ExperimentPanel from './ExperimentalPanel';

export default function Sidebar({ simRef }) {
  const sim = simRef?.current;
  const [seedInput, setSeedInput] = useState(sim ? sim.world?.seed ?? '1234' : '1234');
  const [entitySpawnCount, setEntitySpawnCount] = useState(200);
  const [rebuildAfterClear, setRebuildAfterClear] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);

  useEffect(() => {
    if (!sim) return;
    setSeedInput(sim.world?.seed ?? '1234');
  }, [simRef]);

  function applySeed() {
    if (!sim) return;
    sim.setSeed(seedInput);
    try {
      sim.world.chunks.clear();
    } catch (e) {}
    sim.centerCameraOnPlayer();
  }

  function onSpawn() {
    if (!sim) return;
    sim.spawnEntities(Number(entitySpawnCount || 0));
  }

  function onClearCurrentChunk() {
    if (!sim) return;
    const player = sim.entities.get(sim.playerId);
    if (!player) {
      alert('No player entity found');
      return;
    }
    const tileTotal = sim.world.chunkSize * sim.world.tileSize;
    const cx = Math.floor(player.x / tileTotal);
    const cy = Math.floor(player.y / tileTotal);
    if (!confirm(`Clear all entities in chunk ${cx},${cy}?`)) return;
    const removed = sim.clearEntitiesInChunk(cx, cy);
    if (rebuildAfterClear) {
      const all = sim.entities.allActive ? sim.entities.allActive() : [];
      try {
        sim.indexManager.rebuild(all);
      } catch (err) {
        console.warn('rebuild after clear failed', err);
      }
    }
    alert(`Removed ${removed} entities from chunk ${cx},${cy}`);
  }

  function onRecenter() {
    if (!sim) return;
    sim.centerCameraOnPlayer(1);
  }

  return (
    <aside className="w-96 p-5 bg-gradient-to-b from-slate-900 to-slate-800 text-white h-full overflow-auto border-r border-white/5">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Procedural World Engine</h1>
        <div className="text-xs text-slate-400 mt-1">
          Live experiment lab — switch indexes, measure performance, visualize behaviour.
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center">
          <div className="text-sm font-medium">Project Info</div>
          <button onClick={() => setInfoOpen((s) => !s)} className="text-xs text-slate-300">
            {infoOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        <AnimatePresence>
          {infoOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 bg-slate-800 p-3 rounded"
            >
              <div className="text-xs text-slate-300 mb-2">
                Aim: Simulate & analyze Quadtree vs Spatial Hash Grid in a 2D infinite
                procedurally-generated world.
              </div>
              <div className="text-xs text-slate-400">
                Use the controls to change seed, spawn entities, toggle indexes and run experiments.
                The HUD (top-right) shows FPS, chunks and entity count.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <section className="mb-4 bg-slate-800 p-3 rounded">
        <label className="text-xs text-slate-300 mb-2 block">Seed (press Apply)</label>
        <div className="flex gap-2">
          <input
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            className="flex-1 p-2 rounded bg-slate-700 text-sm"
          />
          <button onClick={applySeed} className="px-3 py-2 bg-indigo-600 rounded">
            Apply
          </button>
        </div>
      </section>

      <section className="mb-4 bg-slate-800 p-3 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-300">Entities</div>
          <div className="text-xs text-slate-400">Spawn/Reset</div>
        </div>
        <div className="flex gap-2">
          <input
            value={entitySpawnCount}
            onChange={(e) => setEntitySpawnCount(e.target.value)}
            type="number"
            className="w-28 p-2 rounded bg-slate-700 text-sm"
          />
          <button onClick={onSpawn} className="px-3 py-2 bg-emerald-500 rounded">
            Spawn
          </button>
          <button
            onClick={() => {
              if (sim) {
                /* keep Reset placeholder for now */
              }
            }}
            className="px-3 py-2 bg-slate-600 rounded"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="mb-4 bg-slate-800 p-3 rounded">
        <div className="flex mb-2 items-center justify-between">
          <div className="text-sm text-slate-300">Chunk Tools</div>
          <div className="text-xs text-slate-400">Controls</div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rebuildAfterClear}
              onChange={(e) => setRebuildAfterClear(e.target.checked)}
            />
            <span className="text-xs">Rebuild index after clear</span>
          </label>

          <div className="flex gap-2">
            <button onClick={onClearCurrentChunk} className="flex-1 py-2 bg-red-600 rounded">
              Clear Current Chunk
            </button>
            <button onClick={onRecenter} className="py-2 px-3 bg-sky-600 rounded">
              Recenter
            </button>
          </div>

          <div className="text-xs text-slate-400 mt-2">
            Clears entities whose center lies in the player current chunk; Recenter centers camera
            on player.
          </div>
        </div>
      </section>

      {/* Data Structure selector (updated — BVH added) */}
      <section className="mb-4 bg-slate-800 p-3 rounded">
        <label className="text-xs text-slate-300 mb-2 block">Chunk Size (Tiles)</label>
        <select
          value={sim?.world?.chunkSize || 16}
          onChange={(e) => {
            if (sim?.world) {
              sim.world.chunkSize = Number(e.target.value);
              sim.world.chunks.clear();
              sim.world.collisionMap.clear();
              console.log(`Chunk size changed to ${e.target.value}x${e.target.value}`);
            }
          }}
          className="w-full p-2 rounded bg-slate-700 text-sm"
        >
          <option value="8">8x8 Tiles (Small)</option>
          <option value="16">16x16 Tiles (Default)</option>
        </select>
        <div className="text-xs text-slate-400 mt-1">Controls terrain detail level</div>
      </section>

      <section className="mb-4 bg-slate-800 p-3 rounded">
        <label className="text-xs text-slate-300 mb-2 block">Data Structure</label>
        <select
          value={sim?.indexManager?.type || 'grid'}
          onChange={(e) => sim?.setIndexType && sim.setIndexType(e.target.value)}
          className="w-full p-2 rounded bg-slate-700 text-sm"
        >
          <option value="grid">Spatial Hash Grid</option>
          <option value="quadtree">Quadtree</option>
          <option value="kdtree">KD-Tree</option>
          <option value="bvh">Bounding Volume Hierarchy (NEW)</option>
        </select>
        <div className="text-xs text-slate-400 mt-1">
          4 Unique Data Structures for comprehensive analysis!
        </div>
      </section>

      <section className="mb-4">
        <PoolControl world={sim?.world} />
      </section>

      <section className="mb-4">
        <FPSChart simRef={simRef} />
      </section>

      <section className="mb-4">
        <ExperimentPanel simRef={simRef} />
      </section>

      {/* Teacher Demo Controls - added as requested */}
      <section className="mb-4">
        <div className="bg-slate-700/50 rounded-xl p-4 border border-cyan-500/20">
          <h3 className="font-semibold text-cyan-100 mb-3">🔬 Teacher Demo Controls</h3>

          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex justify-between items-center">
              <span>Log DS Details</span>
              <kbd className="bg-slate-600 px-2 py-1 rounded">L</kbd>
            </div>

            <div className="flex justify-between items-center">
              <span>Test Spatial Queries</span>
              <kbd className="bg-slate-600 px-2 py-1 rounded">K</kbd>
            </div>

            <div className="flex justify-between items-center">
              <span>Terrain Info</span>
              <span className="text-cyan-400">Auto-logged</span>
            </div>

            <div className="flex justify-between items-center">
              <span>Collision Detection</span>
              <span className="text-green-400">ACTIVE</span>
            </div>

            <div className="flex justify-between items-center">
              <span>Zombie Attacks</span>
              <span className="text-green-400">ACTIVE</span>
            </div>
          </div>

          <button
            onClick={() => sim?.logDataStructureDetails && sim.logDataStructureDetails()}
            className="w-full mt-3 bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 rounded-lg transition-colors"
          >
            📊 Log Current DS Status
          </button>
        </div>
      </section>

      <section className="mb-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Advanced</div>
          <button onClick={() => setAdvancedOpen((s) => !s)} className="text-xs text-slate-300">
            {advancedOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        <AnimatePresence>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 overflow-hidden"
            >
              <AdvancedPanel sim={sim} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mt-8 text-xs text-slate-500">
        Tip: tune pool size and index params while watching the HUD performance.
      </div>
    </aside>
  );
}

function AdvancedPanel({ sim }) {
  const [gridCellSize, setGridCellSize] = useState(sim?.indexManager?.gridCellSize ?? 128);
  const [quadtreeCapacity, setQuadtreeCapacity] = useState(
    sim?.indexManager?.quadtreeCapacity ?? 6
  );
  const [quadtreeMaxDepth, setQuadtreeMaxDepth] = useState(
    sim?.indexManager?.quadtreeMaxDepth ?? 8
  );
  const [bvhCapacity, setBVHCapacity] = useState(sim?.indexManager?.bvhCapacity ?? 16);

  function apply() {
    if (!sim) return;
    sim.setGridCellSize(Number(gridCellSize));
    sim.setQuadtreeParams(Number(quadtreeCapacity), Number(quadtreeMaxDepth));
    sim.setBVHParams(Number(bvhCapacity));
    alert('Advanced params applied.');
  }

  return (
    <div className="mt-2 bg-slate-700 p-3 rounded">
      <div className="text-xs text-slate-300 mb-2">Spatial Index Params</div>

      <div className="flex flex-col gap-2">
        <label className="text-xs">Grid Cell Size (px)</label>
        <input
          value={gridCellSize}
          onChange={(e) => setGridCellSize(e.target.value)}
          type="number"
          className="p-2 rounded bg-slate-800 text-sm"
        />

        <label className="text-xs">Quadtree Capacity (entities)</label>
        <input
          value={quadtreeCapacity}
          onChange={(e) => setQuadtreeCapacity(e.target.value)}
          type="number"
          className="p-2 rounded bg-slate-800 text-sm"
        />

        <label className="text-xs">Quadtree Max Depth</label>
        <input
          value={quadtreeMaxDepth}
          onChange={(e) => setQuadtreeMaxDepth(e.target.value)}
          type="number"
          className="p-2 rounded bg-slate-800 text-sm"
        />

        <label className="text-xs">BVH Node Capacity</label>
        <input
          value={bvhCapacity}
          onChange={(e) => setBVHCapacity(e.target.value)}
          type="number"
          className="p-2 rounded bg-slate-800 text-sm"
        />

        <div className="flex gap-2 mt-3">
          <button onClick={apply} className="px-3 py-2 bg-indigo-600 rounded">
            Apply
          </button>
          <button
            onClick={() => {
              setGridCellSize(sim?.indexManager?.gridCellSize ?? 128);
              setQuadtreeCapacity(sim?.indexManager?.quadtreeCapacity ?? 6);
              setQuadtreeMaxDepth(sim?.indexManager?.quadtreeMaxDepth ?? 8);
              setBVHCapacity(sim?.indexManager?.bvhCapacity ?? 16);
            }}
            className="px-3 py-2 bg-slate-600 rounded"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
