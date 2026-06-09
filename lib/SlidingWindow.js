class SlidingWindow {
  constructor(limit = 10, windowSize = 10) {
    this.limit = Number(limit); // Max requests allowed in the window
    this.windowSize = Number(windowSize); // Window size in seconds
    this.logs = new Map(); // ip -> Array of timestamps (ms)
  }

  updateSettings(limit, windowSize) {
    this.limit = Number(limit);
    this.windowSize = Number(windowSize);
  }

  consume(ip) {
    const now = Date.now();
    const windowMs = this.windowSize * 1000;

    if (!this.logs.has(ip)) {
      this.logs.set(ip, []);
    }

    let timestamps = this.logs.get(ip);

    // Keep only timestamps that fall within the current sliding window
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    this.logs.set(ip, timestamps);

    if (timestamps.length < this.limit) {
      timestamps.push(now);
      return {
        allowed: true,
        count: timestamps.length,
        limit: this.limit,
        windowSize: this.windowSize
      };
    }

    return {
      allowed: false,
      count: timestamps.length,
      limit: this.limit,
      windowSize: this.windowSize
    };
  }

  getLogCount(ip) {
    const now = Date.now();
    const windowMs = this.windowSize * 1000;
    const timestamps = this.logs.get(ip) || [];
    return timestamps.filter(ts => now - ts < windowMs).length;
  }

  clear(ip) {
    this.logs.delete(ip);
  }
}

module.exports = SlidingWindow;
