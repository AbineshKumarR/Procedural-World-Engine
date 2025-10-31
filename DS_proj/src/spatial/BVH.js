export default class BVH {
  constructor(capacity = 16) {
    this.capacity = capacity;
    this.type = 'bvh';
    this.root = null;
    this.entities = [];
  }

  rebuild(entities) {
    this.entities = entities.slice();
    if (this.entities.length === 0) {
      this.root = null;
      return;
    }

    this.root = this._buildNode(this.entities, 0);
  }

  _buildNode(entities, depth = 0) {
    if (entities.length === 0) return null;

    if (entities.length <= this.capacity) {
      return {
        isLeaf: true,
        entities: entities.slice(),
        bounds: this._computeBounds(entities),
      };
    }

    const axis = depth % 2 === 0 ? 'x' : 'y';

    entities.sort((a, b) => a[axis] - b[axis]);

    const mid = Math.floor(entities.length / 2);
    const leftEntities = entities.slice(0, mid);
    const rightEntities = entities.slice(mid);

    return {
      isLeaf: false,
      left: this._buildNode(leftEntities, depth + 1),
      right: this._buildNode(rightEntities, depth + 1),
      bounds: this._computeBounds(entities),
    };
  }

  _computeBounds(entities) {
    if (entities.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const entity of entities) {
      const left = entity.x - entity.r;
      const right = entity.x + entity.r;
      const top = entity.y - entity.r;
      const bottom = entity.y + entity.r;

      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    }

    return { minX, minY, maxX, maxY };
  }

  queryRange(range) {
    const results = [];
    if (!this.root) return results;

    this._queryNode(this.root, range, results);
    return results;
  }

  _queryNode(node, range, results) {
    if (!node) return;

    if (!this._boundsIntersect(node.bounds, range)) {
      return;
    }

    if (node.isLeaf) {
      for (const entity of node.entities) {
        if (this._entityInRange(entity, range)) {
          results.push(entity);
        }
      }
    } else {
      this._queryNode(node.left, range, results);
      this._queryNode(node.right, range, results);
    }
  }

  _boundsIntersect(bounds, range) {
    return !(
      bounds.maxX < range.minX ||
      bounds.minX > range.maxX ||
      bounds.maxY < range.minY ||
      bounds.minY > range.maxY
    );
  }

  _entityInRange(entity, range) {
    return (
      entity.x >= range.minX &&
      entity.x <= range.maxX &&
      entity.y >= range.minY &&
      entity.y <= range.maxY
    );
  }

  queryRadius(x, y, radius) {
    return this.queryRange({
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    });
  }

  clear() {
    this.root = null;
    this.entities = [];
  }

  getStats() {
    let nodeCount = 0;
    let leafCount = 0;
    let maxDepth = 0;
    let totalEntitiesInLeaves = 0;

    const traverse = (node, depth = 0) => {
      if (!node) return;

      nodeCount++;
      maxDepth = Math.max(maxDepth, depth);

      if (node.isLeaf) {
        leafCount++;
        totalEntitiesInLeaves += node.entities.length;
      } else {
        traverse(node.left, depth + 1);
        traverse(node.right, depth + 1);
      }
    };

    traverse(this.root);

    return {
      nodeCount,
      leafCount,
      maxDepth,
      totalEntitiesInLeaves,
      averageEntitiesPerLeaf: leafCount > 0 ? totalEntitiesInLeaves / leafCount : 0,
      balanceFactor: maxDepth > 0 ? nodeCount / maxDepth : 0,
    };
  }

  insert(entity) {
    this.entities.push(entity);
    this.rebuild(this.entities);
  }

  remove(entity) {
    const index = this.entities.indexOf(entity);
    if (index > -1) {
      this.entities.splice(index, 1);
      this.rebuild(this.entities);
    }
  }

  setCapacity(capacity) {
    this.capacity = Math.max(1, capacity);
    if (this.entities.length > 0) {
      this.rebuild(this.entities);
    }
  }
}
