import Quadtree from './Quadtree';
import SpatialHashGrid from './SpatialHashGrid';
import KDTree from './KDTree';
import BVH from './BVH';

export default class IndexManager {
  constructor(config = {}) {
    this.type = config.type || 'grid';
    this.entities = [];

    // Initialize all three data structures
    this.grid = new SpatialHashGrid({
      cellSize: config.gridCellSize || 128,
      bounds: config.bounds || { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 },
    });

    this.quadtree = new Quadtree({
      capacity: config.quadtreeCapacity || 8,
      maxDepth: config.quadtreeMaxDepth || 6,
      bounds: config.bounds || { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 },
    });

    this.kdtree = new KDTree({
      capacity: config.kdtreeCapacity || 16,
      bounds: config.bounds || { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000 },
    });

    this.bvh = new BVH({
      capacity: config.bvhCapacity || 16,
    });

    this.currentIndex = this.getCurrentIndex();
  }

  getCurrentIndex() {
    switch (this.type) {
      case 'grid':
        return this.grid;
      case 'quadtree':
        return this.quadtree;
      case 'kdtree':
        return this.kdtree;
      case 'bvh':
        return this.bvh;
      default:
        return this.grid;
    }
  }

  setBVHParams(capacity) {
    this.bvh.setCapacity(Math.max(1, capacity));
  }

  setType(type) {
    this.type = type;
    this.currentIndex = this.getCurrentIndex();
  }

  setGridCellSize(size) {
    this.grid.setCellSize(size);
  }

  setQuadtreeParams(capacity, maxDepth) {
    this.quadtree.setCapacity(capacity);
    this.quadtree.setMaxDepth(maxDepth);
  }

  setKDTreeParams(capacity) {
    this.kdtree.setCapacity(capacity);
  }

  insert(entity) {
    if (this.type === 'grid') {
      this.grid.insert(entity);
    }
    // For quadtree and kdtree, we typically rebuild
  }

  update(entity) {
    if (this.type === 'grid') {
      this.grid.update(entity);
    }
    // For quadtree and kdtree, we typically rebuild
  }

  remove(entity) {
    if (this.type === 'grid') {
      this.grid.remove(entity);
    }
    // For quadtree and kdtree, we typically rebuild
  }

  queryRange(range) {
    return this.currentIndex.queryRange(range);
  }

  rebuild(entities) {
    this.entities = entities.filter((e) => e.active);

    switch (this.type) {
      case 'grid':
        this.grid.rebuild(this.entities);
        break;
      case 'quadtree':
        this.quadtree.rebuild(this.entities);
        break;
      case 'kdtree':
        this.kdtree.rebuild(this.entities);
        break;
    }
  }

  clear() {
    this.entities = [];
    this.grid.clear();
    this.quadtree.clear();
    this.kdtree.clear();
  }

  debugDraw(ctx, canvas, camera) {
    this.currentIndex.debugDraw?.(ctx, canvas, camera);
  }

  dispose() {
    this.grid.dispose?.();
    this.quadtree.dispose?.();
    this.kdtree.dispose?.();
  }
}
