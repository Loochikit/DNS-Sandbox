class TokenBucket {
  constructor(capacity = 10, refillRate = 2) {
    this.capacity = Number(capacity);
    this.refillRate = Number(refillRate); // tokens per second
    this.buckets = new Map(); // ip -> { tokens, lastRefill }
  }

  updateSettings(capacity, refillRate) {
    this.capacity = Number(capacity);
    this.refillRate = Number(refillRate);
  }

  getBucket(ip) {
    const now = Date.now();
    if (!this.buckets.has(ip)) {
      this.buckets.set(ip, {
        tokens: this.capacity,
        lastRefill: now
      });
    }

    const bucket = this.buckets.get(ip);
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs * this.refillRate) / 1000;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    return bucket;
  }

  consume(ip, tokensToConsume = 1) {
    const bucket = this.getBucket(ip);
    if (bucket.tokens >= tokensToConsume) {
      bucket.tokens -= tokensToConsume;
      return {
        allowed: true,
        tokensRemaining: Math.floor(bucket.tokens),
        capacity: this.capacity,
        currentTokens: bucket.tokens
      };
    }
    return {
      allowed: false,
      tokensRemaining: Math.floor(bucket.tokens),
      capacity: this.capacity,
      currentTokens: bucket.tokens
    };
  }

  getTokens(ip) {
    const bucket = this.getBucket(ip);
    return bucket.tokens;
  }
}

module.exports = TokenBucket;
