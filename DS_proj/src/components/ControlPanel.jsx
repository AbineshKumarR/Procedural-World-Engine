import React, { useState, useEffect } from 'react';

export default function ControlPanel({ simRef }) {
  const [seed, setSeed] = useState('1234');
  const [scale, setScale] = useState('0.08');
  const [octaves, setOctaves] = useState('3');

  const [spawnCount, setSpawnCount] = useState('300');
  const [running, setRunning] = useState(true);
  const [debug, setDebug] = useState(false);

  // index controls
  const [indexType, setIndexType] = useState('grid');
  const [cellSize, setCellSize] = useState('128');
  const [qtCapacity, setQtCapacity] = useState('6');
  const [qtMaxDepth, setQtMaxDepth] = useState('8');
  const [rebuildInterval, setRebuildInterval] = useState('1');

  useEffect(() => {
    if (!simRef.current) return;
    // sync initial values
    setIndexType(simRef.current.indexManager.type || 'grid');
  }, [simRef]);

  const applySeed = () => {
    if (!simRef.current) return;
    simRef.current.setSeed(seed);
    // clear chunk caches for immediate effect
    simRef.current.world.chunks.clear();
  };

  const applyNoise = () => {
    if (!simRef.current) return;
    simRef.current.setNoiseConfig({ scale: Number(scale), octaves: Number(octaves) });
    simRef.current.world.chunks.clear();
  };

  const spawn = () => {
    if (!simRef.current) return;
    simRef.current.spawnEntities(Number(spawnCount) || 0);
  };

  const toggleRun = () => {
    if (!simRef.current) return;
    if (running) simRef.current.stop();
    else simRef.current.start();
    setRunning(!running);
  };

  const toggleDebug = () => {
    if (!simRef.current) return;
    simRef.current.toggleDebug();
    setDebug(!debug);
  };

  const applyIndex = () => {
    if (!simRef.current) return;
    simRef.current.setIndexType(indexType);
    // apply params right away depending on type
    if (indexType === 'grid') {
      simRef.current.setGridCellSize(Number(cellSize) || 128);
    } else {
      simRef.current.setQuadtreeParams(Number(qtCapacity) || 6, Number(qtMaxDepth) || 8);
    }
  };

  const applyRebuildInterval = () => {
    if (!simRef.current) return;
    simRef.current.setRebuildInterval(Number(rebuildInterval) || 1);
  };

  const clearChunks = () => {
    if (!simRef.current) return;
    simRef.current.world.chunks.clear();
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 p-3 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Procedural World Engine</h2>

        <div className="mb-3">
          <label className="text-sm text-slate-300 block mb-1">Seed</label>
          <div className="flex gap-2">
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="flex-1 p-2 rounded bg-slate-900 border border-slate-700"
            />
            <button onClick={applySeed} className="px-3 py-2 bg-indigo-600 rounded">
              Apply
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-sm text-slate-300 block mb-1">Noise (scale & octaves)</label>
          <div className="flex gap-2">
            <input
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className="w-1/2 p-2 rounded bg-slate-900 border border-slate-700"
              placeholder="scale (eg. 0.08)"
            />
            <input
              value={octaves}
              onChange={(e) => setOctaves(e.target.value)}
              className="w-1/2 p-2 rounded bg-slate-900 border border-slate-700"
              placeholder="octaves (eg. 3)"
            />
          </div>
          <button onClick={applyNoise} className="mt-2 w-full py-2 bg-emerald-500 rounded">
            Apply Noise
          </button>
        </div>

        <div className="mb-2">
          <label className="text-sm text-slate-300 block mb-1">Spawn Entities</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={spawnCount}
              onChange={(e) => setSpawnCount(e.target.value)}
              className="flex-1 p-2 rounded bg-slate-900 border border-slate-700"
            />
            <button onClick={spawn} className="px-3 py-2 bg-amber-500 rounded">
              Spawn
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={toggleRun} className="flex-1 py-2 bg-yellow-500 rounded">
            {running ? 'Pause' : 'Start'}
          </button>
          <button onClick={toggleDebug} className="flex-1 py-2 bg-slate-700 rounded">
            {debug ? 'Hide Debug' : 'Show Debug'}
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          Use the Advanced panel below to change spatial-index internals and rebuild frequency.
        </div>
      </div>

      {/* Advanced section */}
      <details className="bg-slate-800 p-3 rounded-lg">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced: Spatial Index & Performance
        </summary>

        <div className="mt-3 space-y-3">
          <div>
            <label className="text-sm text-slate-300 block mb-1">Index Type</label>
            <select
              value={indexType}
              onChange={(e) => setIndexType(e.target.value)}
              className="w-full p-2 rounded bg-slate-900 border border-slate-700"
            >
              <option value="grid">Spatial Hash Grid (incremental)</option>
              <option value="quadtree">Quadtree (rebuild)</option>
            </select>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-400">Grid cell size</label>
                <input
                  value={cellSize}
                  onChange={(e) => setCellSize(e.target.value)}
                  className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Quadtree cap</label>
                <input
                  value={qtCapacity}
                  onChange={(e) => setQtCapacity(e.target.value)}
                  className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Quadtree max depth</label>
                <input
                  value={qtMaxDepth}
                  onChange={(e) => setQtMaxDepth(e.target.value)}
                  className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                />
              </div>
            </div>
            <button onClick={applyIndex} className="mt-2 w-full py-2 bg-indigo-600 rounded">
              Apply Index Settings
            </button>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-1">Rebuild Interval (frames)</label>
            <div className="flex gap-2">
              <input
                value={rebuildInterval}
                onChange={(e) => setRebuildInterval(e.target.value)}
                className="flex-1 p-2 rounded bg-slate-900 border border-slate-700"
              />
              <button onClick={applyRebuildInterval} className="px-3 py-2 bg-slate-600 rounded">
                Set
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              1 = rebuild every frame; increase to amortize rebuild costs.
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={clearChunks} className="flex-1 py-2 bg-red-600 rounded">
              Clear Chunks
            </button>
            <button
              onClick={() => {
                if (simRef.current) simRef.current.indexManager.clear();
              }}
              className="flex-1 py-2 bg-slate-700 rounded"
            >
              Clear Index
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
