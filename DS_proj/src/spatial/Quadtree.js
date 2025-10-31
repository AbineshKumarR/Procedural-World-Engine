import ISpatialIndex from './ISpatialIndex';

function aabbOf(e) {
  return { minX: e.x - e.r, minY: e.y - e.r, maxX: e.x + e.r, maxY: e.y + e.r };
}
function intersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
function contains(bounds, aabb) {
  return (
    bounds.minX <= aabb.minX &&
    bounds.minY <= aabb.minY &&
    bounds.maxX >= aabb.maxX &&
    bounds.maxY >= aabb.maxY
  );
}

class QTNode {
  constructor(bounds, capacity = 6, depth = 0, maxDepth = 8) {
    this.bounds = bounds; 
    this.capacity = capacity;
    this.entities = []; 
    this.children = null;
    this.depth = depth;
    this.maxDepth = maxDepth;
  }

  subdivide() {
    const { minX, minY, maxX, maxY } = this.bounds;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    this.children = [
      new QTNode(
        { minX, minY, maxX: midX, maxY: midY },
        this.capacity,
        this.depth + 1,
        this.maxDepth
      ),
      new QTNode(
        { minX: midX, minY, maxY: midY, maxX },
        this.capacity,
        this.depth + 1,
        this.maxDepth
      ),
      new QTNode(
        { minX, minY: midY, maxX: midX, maxY },
        this.capacity,
        this.depth + 1,
        this.maxDepth
      ),
      new QTNode(
        { minX: midX, minY: midY, maxX, maxY },
        this.capacity,
        this.depth + 1,
        this.maxDepth
      ),
    ];
  }

  insertEntity(entity) {
    const aabb = aabbOf(entity);
    if (!intersects(this.bounds, aabb)) return null;

    if (!this.children && (this.entities.length < this.capacity || this.depth >= this.maxDepth)) {
      this.entities.push(entity);
      return this;
    }

    if (!this.children) this.subdivide();

    for (const child of this.children) {
      if (contains(child.bounds, aabb)) {
        return child.insertEntity(entity);
      }
    }

    this.entities.push(entity);
    return this;
  }

  removeEntityById(entityId) {
    for (let i = 0; i < this.entities.length; i++) {
      if (this.entities[i].id === entityId) {
        this.entities.splice(i, 1);
        return true;
      }
    }
    if (this.children) {
      for (const c of this.children) {
        if (c.removeEntityById(entityId)) return true;
      }
    }
    return false;
  }

  queryRange(range, found) {
    if (!intersects(this.bounds, range)) return;
    for (const e of this.entities) {
      const ea = aabbOf(e);
      if (intersects(ea, range)) {
        found.push(e.id);
      }
    }
    if (this.children) {
      for (const c of this.children) c.queryRange(range, found);
    }
  }

  clear() {
    this.entities.length = 0;
    if (this.children) {
      for (const c of this.children) c.clear();
      this.children = null;
    }
  }

  debugDraw(ctx, camera) {
    const sx = camera.worldToScreenX(this.bounds.minX);
    const sy = camera.worldToScreenY(this.bounds.minY);
    const w = (this.bounds.maxX - this.bounds.minX) * camera.scale;
    const h = (this.bounds.maxY - this.bounds.minY) * camera.scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(sx, sy, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.fillText(String(this.entities.length), sx + 4, sy + 12);
    if (this.children) {
      for (const c of this.children) c.debugDraw(ctx, camera);
    }
  }
}

export default class Quadtree extends ISpatialIndex {
  constructor(
    bounds = { minX: -20000, minY: -20000, maxX: 20000, maxY: 20000 },
    capacity = 6,
    maxDepth = 8
  ) {
    super();
    this.root = new QTNode(bounds, capacity, 0, maxDepth);
    this.bounds = bounds;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.entityNodeMap = new Map(); 
  }

  clear() {
    this.root.clear();
    this.entityNodeMap.clear();
  }

  rebuild(entities) {
    this.clear();
    for (const e of entities) {
      const node = this.root.insertEntity(e);
      if (node) {
        this.entityNodeMap.set(e.id, node);
      }
    }
  }

  insert(entity) {
    const node = this.root.insertEntity(entity);
    if (node) this.entityNodeMap.set(entity.id, node);
    return !!node;
  }

  remove(entity) {
    const node = this.entityNodeMap.get(entity.id);
    if (node) {
      node.removeEntityById(entity.id);
      this.entityNodeMap.delete(entity.id);
      return true;
    }
    const removed = this.root.removeEntityById(entity.id);
    if (removed) this.entityNodeMap.delete(entity.id);
    return removed;
  }

  update(entity) {
    const node = this.entityNodeMap.get(entity.id);
    const aabb = aabbOf(entity);
    if (node && contains(node.bounds, aabb)) {
      for (let i = 0; i < node.entities.length; i++) {
        if (node.entities[i].id === entity.id) {
          node.entities[i] = entity;
          return true;
        }
      }
    }
    this.remove(entity);
    this.insert(entity);
    return true;
  }

  queryRange(range) {
    const found = [];
    this.root.queryRange(range, found);
    return found;
  }

  debugDraw(ctx, camera) {
    this.root.debugDraw(ctx, camera);
  }
}