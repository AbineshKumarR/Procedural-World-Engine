// src/spatial/ISpatialIndex.js
// Conceptual interface for spatial indexes. Concrete classes must implement these methods.

export default class ISpatialIndex {
  // Rebuild the index from an array of entity objects
  rebuild(entities) {
    throw new Error('Not implemented');
  }

  // Insert a single entity (optional)
  insert(entity) {
    throw new Error('Not implemented');
  }

  // Remove a single entity (optional)
  remove(entity) {
    throw new Error('Not implemented');
  }

  // Update an entity (optional)
  update(entity) {
    throw new Error('Not implemented');
  }

  // Query by axis-aligned bounding box: {minX,minY,maxX,maxY} -> returns array of entity ids
  queryRange(aabb) {
    throw new Error('Not implemented');
  }

  // Clear entire index
  clear() {
    throw new Error('Not implemented');
  }

  // Debug draw into ctx with camera transforms (optional)
  debugDraw(ctx, camera) {
    /* optional */
  }
}
