// src/engine/InputHandler.js
export default class InputHandler {
  constructor(canvas) {
    this.keys = new Map();
    this.mouse = {
      x: 0,
      y: 0,
      down: false,
      worldX: 0,
      worldY: 0,
    };
    this.canvas = canvas;

    this._preventDefaults = new Set([
      ' ',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'w',
      'a',
      's',
      'd',
      'e',
      'r',
      '1',
      '2',
      '3',
    ]);

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    // Add event listeners
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mouseup', this._onMouseUp);

    console.log('InputHandler initialized with mouse support');
  }

  _onKeyDown(event) {
    if (this._preventDefaults.has(event.key)) {
      event.preventDefault();
    }

    this.keys.set(event.key, true);

    if (event.key === ' ') {
      event.preventDefault();
    }
  }

  _onKeyUp(event) {
    this.keys.set(event.key, false);

    if (event.key === ' ') {
      event.preventDefault();
    }
  }

  _onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
  }

  _onMouseDown(event) {
    this.mouse.down = true;
    event.preventDefault();
  }

  _onMouseUp(event) {
    this.mouse.down = false;
    event.preventDefault();
  }

  updateMouseWorldPosition(camera, canvas) {
    if (!camera) return;

    const zoom = camera.zoom || 1;
    const center = camera.getCenter ? camera.getCenter() : { x: camera.x || 0, y: camera.y || 0 };

    // Convert screen coordinates to world coordinates
    const worldX = (this.mouse.x - canvas.width / 2) / zoom + center.x;
    const worldY = (this.mouse.y - canvas.height / 2) / zoom + center.y;

    this.mouse.worldX = worldX;
    this.mouse.worldY = worldY;
  }

  isDown(key) {
    return this.keys.get(key) || false;
  }

  getMouseDirectionFrom(playerX, playerY) {
    const dx = this.mouse.worldX - playerX;
    const dy = this.mouse.worldY - playerY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return { x: 0, y: -1 };

    return {
      x: dx / length,
      y: dy / length,
    };
  }

  getPressedKeys() {
    const pressed = [];
    for (const [key, isDown] of this.keys) {
      if (isDown) pressed.push(key);
    }
    return pressed;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.keys.clear();
  }
}
