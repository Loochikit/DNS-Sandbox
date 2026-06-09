const test = require("node:test");
const assert = require("node:assert");
const TokenBucket = require("./lib/TokenBucket");
const LeakyBucket = require("./lib/LeakyBucket");
const SlidingWindow = require("./lib/SlidingWindow");
const SecurityGuard = require("./lib/SecurityGuard");

test("Token Bucket Rate Limiter", async (t) => {
  await t.test("should initialize with capacity and refill rate", () => {
    const bucket = new TokenBucket(5, 1);
    assert.strictEqual(bucket.capacity, 5);
    assert.strictEqual(bucket.refillRate, 1);
  });

  await t.test("should consume tokens and block when depleted", () => {
    const bucket = new TokenBucket(2, 1);
    const ip = "1.2.3.4";
    
    // First consume should succeed
    const res1 = bucket.consume(ip);
    assert.strictEqual(res1.allowed, true);
    
    // Second consume should succeed
    const res2 = bucket.consume(ip);
    assert.strictEqual(res2.allowed, true);
    
    // Third consume should fail
    const res3 = bucket.consume(ip);
    assert.strictEqual(res3.allowed, false);
  });

  await t.test("should refill tokens over time", async () => {
    const bucket = new TokenBucket(2, 10); // refills 10 tokens/sec
    const ip = "1.2.3.5";
    
    bucket.consume(ip);
    bucket.consume(ip);
    assert.strictEqual(bucket.consume(ip).allowed, false); // depleted
    
    // Wait 150ms for tokens to refill (approx 1.5 tokens refilled)
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    assert.strictEqual(bucket.consume(ip).allowed, true); // allowed now
  });
});

test("Leaky Bucket Limiter", async (t) => {
  await t.test("should enqueue requests up to capacity", () => {
    const bucket = new LeakyBucket(2, 1);
    const ip = "2.2.2.2";
    
    const res1 = bucket.enqueue(ip, () => {});
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.queueLength, 1);
    
    const res2 = bucket.enqueue(ip, () => {});
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.queueLength, 2);
    
    const res3 = bucket.enqueue(ip, () => {});
    assert.strictEqual(res3.allowed, false); // queue is full
  });

  await t.test("should leak requests at constant rate", async () => {
    let leakedCount = 0;
    const bucket = new LeakyBucket(3, 10); // leak 10 reqs/sec = leak every 100ms
    const ip = "2.2.2.3";
    
    bucket.enqueue(ip, () => leakedCount++);
    bucket.enqueue(ip, () => leakedCount++);
    
    assert.strictEqual(leakedCount, 0); // enqueued but not leaked yet
    
    // Wait 250ms for leaks to trigger (should leak both)
    await new Promise((resolve) => setTimeout(resolve, 250));
    
    assert.strictEqual(leakedCount, 2);
    bucket.clear(ip);
  });
});

test("Sliding Window Rate Limiter", async (t) => {
  await t.test("should block requests exceeding window limit", () => {
    const limiter = new SlidingWindow(2, 5); // max 2 requests in 5 seconds
    const ip = "3.3.3.3";
    
    assert.strictEqual(limiter.consume(ip).allowed, true);
    assert.strictEqual(limiter.consume(ip).allowed, true);
    assert.strictEqual(limiter.consume(ip).allowed, false); // blocked
  });
});

test("Security Guard Checks", async (t) => {
  await t.test("should block blacklisted IPs", () => {
    const guard = new SecurityGuard();
    guard.blacklistIp("1.1.1.1");
    
    const res = guard.checkRequest("1.1.1.1", null);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.reason, "IP_BLACKLISTED");
  });

  await t.test("should validate API keys when enabled", () => {
    const guard = new SecurityGuard();
    guard.setApiKeyRequired(true);
    guard.addApiKey("valid-key");
    
    // Missing key
    const resNoKey = guard.checkRequest("2.2.2.2", null);
    assert.strictEqual(resNoKey.allowed, false);
    assert.strictEqual(resNoKey.status, 401);
    
    // Invalid key
    const resBadKey = guard.checkRequest("2.2.2.2", "bad-key");
    assert.strictEqual(resBadKey.allowed, false);
    assert.strictEqual(resBadKey.status, 401);
    
    // Valid key
    const resGoodKey = guard.checkRequest("2.2.2.2", "valid-key");
    assert.strictEqual(resGoodKey.allowed, true);
  });
});
