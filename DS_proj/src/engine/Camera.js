export default class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  follow(x, y) {
    if (typeof x === 'object' && x !== null) {
      this.x = x.x ?? this.x;
      this.y = x.y ?? this.y;
    } else {
      this.x = x;
      this.y = y;
    }
  }

  setCenter(x, y) {
    this.x = x;
    this.y = y;
  }

  getCenter() {
    return { x: this.x, y: this.y };
  }

  setZoom(z) {
    this.zoom = Math.max(0.01, Number(z) || 1);
  }
  applyTransform(ctx, canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth =
      canvas && canvas.width ? canvas.width / dpr : (canvas && canvas.clientWidth) || 0;
    const cssHeight =
      canvas && canvas.height ? canvas.height / dpr : (canvas && canvas.clientHeight) || 0;

    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
