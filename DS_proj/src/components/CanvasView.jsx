import React, { useRef, useEffect } from 'react';
import SimulationController from '../engine/SimulationController';

export default function CanvasView({ simRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // notify sim about resize if running
      if (simRef.current && simRef.current.onResize) simRef.current.onResize();
    };

    resize();
    window.addEventListener('resize', resize);

    // create controller and keep a reference in parent via simRef.current
    const controller = new SimulationController(canvas);
    simRef.current = controller;
    controller.start();

    return () => {
      window.removeEventListener('resize', resize);
      controller.stop();
      // optional cleanup
      if (simRef) simRef.current = null;
    };
  }, [simRef]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}
