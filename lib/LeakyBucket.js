class LeakyBucket {
  constructor(capacity = 5, leakRate = 1) {
    this.capacity = Number(capacity); // Max queue capacity
    this.leakRate = Number(leakRate); // Requests leaked per second
    this.queues = new Map(); // ip -> Array of function callbacks
    this.timers = new Map(); // ip -> interval ID
    this.onLeakCallback = null; // Callback for notifying UI of leaks
  }

  setOnLeak(callback) {
    this.onLeakCallback = callback;
  }

  updateSettings(capacity, leakRate) {
    this.capacity = Number(capacity);
    const oldLeakRate = this.leakRate;
    this.leakRate = Number(leakRate);

    if (oldLeakRate !== this.leakRate) {
      // Re-trigger leak interval for all active queues
      for (const ip of this.queues.keys()) {
        if (this.queues.get(ip).length > 0) {
          this.startLeaking(ip);
        }
      }
    }
  }

  enqueue(ip, callback) {
    if (!this.queues.has(ip)) {
      this.queues.set(ip, []);
    }
    const queue = this.queues.get(ip);

    if (queue.length >= this.capacity) {
      return { allowed: false, queueLength: queue.length, capacity: this.capacity };
    }

    queue.push(callback);
    this.startLeaking(ip);

    return { allowed: true, queueLength: queue.length, capacity: this.capacity };
  }

  startLeaking(ip) {
    if (this.timers.has(ip)) {
      clearInterval(this.timers.get(ip));
    }

    const intervalMs = 1000 / this.leakRate;
    const timer = setInterval(() => {
      const queue = this.queues.get(ip);
      if (!queue || queue.length === 0) {
        clearInterval(this.timers.get(ip));
        this.timers.delete(ip);
        return;
      }

      const nextCallback = queue.shift();
      if (nextCallback) {
        if (this.onLeakCallback) {
          this.onLeakCallback(ip, queue.length);
        }
        nextCallback();
      }
    }, intervalMs);

    this.timers.set(ip, timer);
  }

  getQueueLength(ip) {
    const queue = this.queues.get(ip);
    return queue ? queue.length : 0;
  }

  clear(ip) {
    if (this.timers.has(ip)) {
      clearInterval(this.timers.get(ip));
      this.timers.delete(ip);
    }
    this.queues.delete(ip);
  }
}

module.exports = LeakyBucket;
