// src/engine/EntityPool.js
export default class EntityPool {
  constructor(initialSize = 1000) {
    this._nextId = 1;
    this.entities = new Map(); // Use Map for reliable entity storage
    this.activeEntities = new Set();
    this.inactiveEntities = [];
    this._initialSize = initialSize;

    // Pre-allocate some entities
    this._expand(initialSize);
  }

  _expand(count) {
    for (let i = 0; i < count; i++) {
      const entity = {
        id: this._nextId++,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 5,
        type: 'generic',
        color: '#ffffff',
        active: false,
      };
      this.entities.set(entity.id, entity);
      this.inactiveEntities.push(entity.id);
    }
  }

  acquire() {
    if (this.inactiveEntities.length === 0) {
      this._expand(this._initialSize / 2);
    }

    const entityId = this.inactiveEntities.pop();
    const entity = this.entities.get(entityId);

    if (!entity) {
      // This should never happen, but if it does, create a new entity
      const newEntity = {
        id: this._nextId++,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 5,
        type: 'generic',
        color: '#ffffff',
        active: true,
      };
      this.entities.set(newEntity.id, newEntity);
      this.activeEntities.add(newEntity.id);
      return newEntity;
    }

    // Reset entity properties
    entity.x = 0;
    entity.y = 0;
    entity.vx = 0;
    entity.vy = 0;
    entity.r = 5;
    entity.type = 'generic';
    entity.color = '#ffffff';
    entity.active = true;

    this.activeEntities.add(entity.id);
    return entity;
  }

  release(entity) {
    if (!entity || !this.entities.has(entity.id)) return;

    entity.active = false;
    this.activeEntities.delete(entity.id);
    this.inactiveEntities.push(entity.id);
  }

  get(id) {
    return this.entities.get(id) || null;
  }

  allActive() {
    const active = [];
    for (const id of this.activeEntities) {
      const entity = this.entities.get(id);
      if (entity) active.push(entity);
    }
    return active;
  }

  countActive() {
    return this.activeEntities.size;
  }

  clear() {
    for (const id of this.activeEntities) {
      const entity = this.entities.get(id);
      if (entity) {
        entity.active = false;
      }
    }
    this.activeEntities.clear();
    this.inactiveEntities = Array.from(this.entities.keys());
  }

  dispose() {
    this.entities.clear();
    this.activeEntities.clear();
    this.inactiveEntities = [];
    this._nextId = 1;
  }
}
