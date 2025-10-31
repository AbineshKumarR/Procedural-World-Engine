import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import HUDBadge from './components/HUDBadge';
import SimulationController from './engine/SimulationController';

export default function App() {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let startupTimer = null;
    const initSimulation = async () => {
      try {
        setLoadingProgress(10);

        simRef.current = new SimulationController(canvas, {
          chunkSize: 16,
          tileSize: 32,
          seed: 'nit-trichy-premium-experience-2028',

          entityPoolSize: 2500,
          rebuildInterval: 2,
          gridCellSize: 128,

          workerCount: Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
          verbose: process.env.NODE_ENV === 'development',

          indexType: 'grid',
        });

        setLoadingProgress(60);

        if (process.env.NODE_ENV === 'development') {
          window.sim = simRef.current;
        }

        simRef.current.start();
        setLoadingProgress(100);

        await new Promise((resolve) => setTimeout(resolve, 500));
        setAppReady(true);
      } catch (error) {
        console.error('Failed to initialize simulation:', error);
        setAppReady(false);
      }
    };

    const handleResize = () => {
      try {
        simRef.current?.onResize?.();
      } catch (err) {
        console.warn('Resize handler error:', err);
      }
    };

    window.addEventListener('resize', handleResize);

    const resizeTimer = setTimeout(handleResize, 100);
    startupTimer = setTimeout(() => {
      initSimulation();
    }, 0);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
      clearTimeout(startupTimer);

      try {
        simRef.current?.stop?.();
        simRef.current?.dispose?.();
      } catch (err) {
        console.warn('Cleanup error:', err);
      }

      simRef.current = null;
    };
  }, []);

  return (
    <div className="h-screen w-screen flex bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden relative">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-cyan-500/10 animate-pulse"
            style={{
              width: Math.random() * 4 + 1 + 'px',
              height: Math.random() * 4 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's',
              animationDuration: Math.random() * 10 + 5 + 's',
            }}
          />
        ))}
      </div>

      {/* Sidebar */}
      <div
        className={`transition-all duration-500 ease-in-out relative z-10 ${
          sidebarCollapsed ? 'w-0 opacity-0' : 'w-80 lg:w-96 opacity-100'
        } border-r border-cyan-500/20 bg-slate-800/90 backdrop-blur-xl overflow-hidden shadow-2xl`}
      >
        <Sidebar
          simRef={simRef}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((s) => !s)}
        />
      </div>

      {/* Main canvas area */}
      <main className="flex-1 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-purple-900/40 to-slate-900/80">
          <canvas
            ref={canvasRef}
            id="game-canvas"
            className="w-full h-full block"
            style={{
              display: 'block',
              background: 'transparent',
            }}
          />

          {/* Premium Loading Overlay */}
          {!appReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 backdrop-blur-sm">
              <div className="text-center p-8 rounded-2xl bg-slate-800/80 backdrop-blur-md border border-cyan-500/30 shadow-2xl">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-8 w-8 bg-cyan-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
                  NIT Trichy Premium Experience
                </h2>
                <p className="text-cyan-200 text-lg font-medium mb-4">
                  Initializing World Engine...
                </p>

                {/* Progress bar */}
                <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden mx-auto mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-slate-400 text-sm">{loadingProgress}%</p>

                <p className="text-slate-400 text-sm mt-4">
                  CSE - A 2028 | Data Structures Project
                </p>
              </div>
            </div>
          )}
        </div>

        {/* HUD Badge */}
        {appReady && <HUDBadge simRef={simRef} />}
      </main>

      {/* Right sidebar */}
      <aside className="w-80 xl:w-96 border-l border-cyan-500/20 bg-slate-800/80 backdrop-blur-xl hidden xl:block overflow-auto p-6 relative z-10 shadow-2xl">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-3">
              World Inspector
            </h2>
            <div className="text-sm text-slate-300 space-y-2">
              <p>Real-time visualization of spatial indexing structures and performance metrics.</p>
            </div>
          </div>

          <div className="bg-slate-700/50 rounded-xl p-4 border border-cyan-500/20">
            <h3 className="font-semibold text-cyan-100 mb-2">🎮 Controls</h3>
            <div className="text-xs text-slate-300 space-y-1">
              <p>
                <kbd className="bg-slate-600 px-1 rounded">WASD</kbd> Move Player
              </p>
              <p>
                <kbd className="bg-slate-600 px-1 rounded">SPACE</kbd> Shoot
              </p>
              <p>
                <kbd className="bg-slate-600 px-1 rounded">E</kbd> Melee Attack
              </p>
              <p>
                <kbd className="bg-slate-600 px-1 rounded">R</kbd> Reload
              </p>
              <p>
                <kbd className="bg-slate-600 px-1 rounded">1-3</kbd> Switch Weapons
              </p>
              <p>
                <kbd className="bg-slate-600 px-1 rounded">D</kbd> Toggle Debug
              </p>
            </div>
          </div>

          <div className="bg-slate-700/50 rounded-xl p-4 border border-purple-500/20">
            <h3 className="font-semibold text-purple-100 mb-2">🏆 Pro Tips</h3>
            <div className="text-xs text-slate-300 space-y-2">
              <p>• Find ammo crates to restock weapons</p>
              <p>• Use melee when zombies get too close</p>
              <p>• Different zombies have different strengths</p>
              <p>• Look for the NIT Trichy easter egg!</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="xl:hidden fixed top-4 left-4 z-50 p-3 bg-slate-800/90 backdrop-blur-sm rounded-xl border border-cyan-500/30 hover:bg-slate-700/80 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-6 h-6 text-cyan-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Footer credit */}
      <div className="absolute bottom-4 right-4 z-10 text-xs text-slate-400/60">
        NIT Trichy CSE - A 2028 | Premium Experience
      </div>
    </div>
  );
}
