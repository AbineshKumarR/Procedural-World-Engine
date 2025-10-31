// src/spatial/KDTree.js
export default class KDTree {
  constructor(config = {}) {
    this.capacity = config.capacity || 16;
    this.bounds = config.bounds || { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 };
    this.root = null;
    this.entities = [];
  }

  setCapacity(capacity) {
    this.capacity = Math.max(1, capacity);
  }

  insert(entity) {
    this.entities.push(entity);
  }

  update(entity) {}

  remove(entity) {
    const index = this.entities.findIndex((e) => e.id === entity.id);
    if (index !== -1) {
      this.entities.splice(index, 1);
    }
  }

  queryRange(range) {
    if (!this.root && this.entities.length > 0) {
      this._buildTree();
    }

    if (!this.root) return [];

    const results = [];
    this._queryNode(this.root, range, results);
    return results;
  }

  _buildTree() {
    this.root = this._buildNode(this.entities, 0);
  }

  _buildNode(entities, depth) {
    if (entities.length === 0) return null;
    if (entities.length <= this.capacity) {
      return {
        entities: [...entities],
        isLeaf: true,
      };
    }

    const axis = depth % 2; 
    entities.sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));

    const mid = Math.floor(entities.length / 2);
    const median = entities[mid];

    const node = {
      axis,
      value: axis === 0 ? median.x : median.y,
      left: this._buildNode(entities.slice(0, mid), depth + 1),
      right: this._buildNode(entities.slice(mid + 1), depth + 1),
      isLeaf: false,
    };

    return node;
  }

  _queryNode(node, range, results) {
    if (!node) return;

    if (node.isLeaf) {
      for (const entity of node.entities) {
        if (this._entityInRange(entity, range)) {
          results.push(entity);
        }
      }
      return;
    }

    if (node.axis === 0) {
      if (range.minX <= node.value) {
        this._queryNode(node.left, range, results);
      }
      if (range.maxX >= node.value) {
        this._queryNode(node.right, range, results);
      }
    } else {
      if (range.minY <= node.value) {
        this._queryNode(node.left, range, results);
      }
      if (range.maxY >= node.value) {
        this._queryNode(node.right, range, results);
      }
    }
  }

  _entityInRange(entity, range) {
    return (
      entity.x >= range.minX &&
      entity.x <= range.maxX &&
      entity.y >= range.minY &&
      entity.y <= range.maxY
    );
  }

  rebuild(entities) {
    this.entities = entities.filter((e) => e.active);
    this.root = null; 
  }

  clear() {
    this.entities = [];
    this.root = null;
  }

  debugDraw(ctx, canvas, camera) {
    if (!this.root) return;

    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    this._drawNode(ctx, this.root, this.bounds, 0);

    ctx.restore();
  }

  _drawNode(ctx, node, bounds, depth) {
    if (!node) return;

    if (node.isLeaf) {
      ctx.strokeStyle = `hsl(${depth * 30}, 70%, 50%)`;
      ctx.strokeRect(
        bounds.minX,
        bounds.minY,
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY
      );
      return;
    }

    if (node.axis === 0) {
      ctx.beginPath();
      ctx.moveTo(node.value, bounds.minY);
      ctx.lineTo(node.value, bounds.maxY);
      ctx.stroke();

      this._drawNode(ctx, node.left, { ...bounds, maxX: node.value }, depth + 1);
      this._drawNode(ctx, node.right, { ...bounds, minX: node.value }, depth + 1);
    } else {
      ctx.beginPath();
      ctx.moveTo(bounds.minX, node.value);
      ctx.lineTo(bounds.maxX, node.value);
      ctx.stroke();

      this._drawNode(ctx, node.left, { ...bounds, maxY: node.value }, depth + 1);
      this._drawNode(ctx, node.right, { ...bounds, minY: node.value }, depth + 1);
    }
  }

  dispose() {
    this.entities = [];
    this.root = null;
  }
}
