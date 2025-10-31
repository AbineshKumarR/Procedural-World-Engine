// src/spatial/SpatialHashGrid.js
import ISpatialIndex from './ISpatialIndex';

export default class SpatialHashGrid extends ISpatialIndex {
  constructor(cellSize = 64) {
    super();
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityToKeys = new Map();
  }

  _cellKey(cx, cy) {
    return `${cx},${cy}`;
  }
  _toCell(x) {
    return Math.floor(x / this.cellSize);
  }

  clear() {
    this.cells.clear();
    this.entityToKeys.clear();
  }

  rebuild(entities) {
    this.clear();
    for (const e of entities) {
      this.insert(e);
    }
  }

  insert(entity) {
    const minCx = this._toCell(entity.x - entity.r);
    const maxCx = this._toCell(entity.x + entity.r);
    const minCy = this._toCell(entity.y - entity.r);
    const maxCy = this._toCell(entity.y + entity.r);
    const keys = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const k = this._cellKey(cx, cy);
        let set = this.cells.get(k);
        if (!set) {
          set = new Set();
          this.cells.set(k, set);
        }
        set.add(entity.id);
        keys.push(k);
      }
    }
    this.entityToKeys.set(entity.id, keys);
  }

  remove(entity) {
    const keys = this.entityToKeys.get(entity.id);
    if (!keys) return;
    for (const k of keys) {
      const set = this.cells.get(k);
      if (!set) continue;
      set.delete(entity.id);
      if (set.size === 0) this.cells.delete(k);
    }
    this.entityToKeys.delete(entity.id);
  }

  update(entity) {
    this.remove(entity);
    this.insert(entity);
  }

  queryRange(range) {
    const minCx = this._toCell(range.minX);
    const maxCx = this._toCell(range.maxX);
    const minCy = this._toCell(range.minY);
    const maxCy = this._toCell(range.maxY);
    const ids = new Set();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const set = this.cells.get(this._cellKey(cx, cy));
        if (set) {
          for (const id of set) ids.add(id);
        }
      }
    }
    return Array.from(ids);
  }

  debugDraw(
    ctx,
    camera,
    style = { stroke: 'rgba(255,255,255,0.06)', fill: 'rgba(255,255,255,0.02)' }
  ) {
    ctx.save();
    ctx.strokeStyle = style.stroke;
    ctx.fillStyle = style.fill;
    for (const [key, set] of this.cells) {
      const [cx, cy] = key.split(',').map(Number);
      const worldX = cx * this.cellSize;
      const worldY = cy * this.cellSize;
      const sx = camera.worldToScreenX(worldX);
      const sy = camera.worldToScreenY(worldY);
      const w = this.cellSize * camera.scale;
      const h = this.cellSize * camera.scale;
      ctx.fillRect(sx, sy, w, h);
      ctx.strokeRect(sx, sy, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px monospace';
      ctx.fillText(String(set.size), sx + 4, sy + 12);
      ctx.fillStyle = style.fill;
    }
    ctx.restore();
  }
}
