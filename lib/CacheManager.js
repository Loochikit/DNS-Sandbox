/**
 * CacheManager.js
 * In-memory DNS Cache store with dynamic TTL count-down.
 * Automatically handles record expiry.
 */

class CacheManager {
  constructor() {
    this.cache = new Map(); // key -> { domain, type, value, ttl, preference, expiryTime }
  }

  add(domain, type, value, ttl = 300, preference = 10) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    const expiryTime = Date.now() + ttl * 1000;
    this.cache.set(key, {
      domain: domain.toLowerCase(),
      type: type.toUpperCase(),
      value,
      ttl: Number(ttl),
      preference: Number(preference),
      expiryTime
    });
  }

  lookup(domain, type) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    const cached = this.cache.get(key);
    if (!cached) return [];

    if (Date.now() > cached.expiryTime) {
      this.cache.delete(key);
      return [];
    }

    const remainingTtl = Math.max(0, Math.round((cached.expiryTime - Date.now()) / 1000));
    return [{
      domain: cached.domain,
      type: cached.type,
      value: cached.value,
      ttl: remainingTtl,
      preference: cached.preference
    }];
  }

  getAliveRecords() {
    const now = Date.now();
    const alive = [];
    
    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiryTime) {
        this.cache.delete(key);
      } else {
        const remainingTtl = Math.max(0, Math.round((cached.expiryTime - now) / 1000));
        alive.push({
          domain: cached.domain,
          type: cached.type,
          value: cached.value,
          ttl: remainingTtl,
          preference: cached.preference
        });
      }
    }
    
    return alive;
  }

  remove(domain, type) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = CacheManager;
