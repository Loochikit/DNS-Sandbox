const test = require("node:test");
const assert = require("node:assert");
const { parseQuery, buildResponse, buildQuery } = require("./lib/DnsServer");
const Registry = require("./lib/Registry");
const CacheManager = require("./lib/CacheManager");
const PoisonEngine = require("./lib/PoisonEngine");

test("DNS Server Packet Parser and Encoder", async (t) => {
  await t.test("should encode and parse a DNS query binary packet", () => {
    const id = 12345;
    const domain = "google.com";
    const type = "A";

    const queryBuffer = buildQuery(id, domain, type);
    
    // Header should be 12 bytes
    assert.strictEqual(queryBuffer.readUInt16BE(0), id); // Trans ID
    assert.strictEqual(queryBuffer.readUInt16BE(2), 0x0100); // Flags (RD=1)
    assert.strictEqual(queryBuffer.readUInt16BE(4), 1); // QDCOUNT

    // Parse it back
    const parsed = parseQuery(queryBuffer);
    assert.ok(parsed);
    assert.strictEqual(parsed.id, id);
    assert.strictEqual(parsed.domain, domain);
    assert.strictEqual(parsed.type, type);
  });

  await t.test("should build a standard DNS response packet", () => {
    const id = 45678;
    const domain = "github.com";
    const type = "A";

    const queryBuffer = buildQuery(id, domain, type);
    const parsed = parseQuery(queryBuffer);

    const answers = [
      { type: "A", value: "140.82.121.4", ttl: 300 }
    ];

    const responseBuffer = buildResponse(parsed, answers);
    
    // Check Transaction ID matches
    assert.strictEqual(responseBuffer.readUInt16BE(0), id);
    // Flags: Response QR=1, AA=1, RD=1, RA=1 (0x8480)
    assert.strictEqual(responseBuffer.readUInt16BE(2), 0x8480);
    // ANCOUNT count
    assert.strictEqual(responseBuffer.readUInt16BE(6), 1);
  });

  await t.test("should build an NXDOMAIN response packet on name error", () => {
    const id = 9999;
    const domain = "notfound.org";
    const type = "A";

    const queryBuffer = buildQuery(id, domain, type);
    const parsed = parseQuery(queryBuffer);

    // Build with nameError = true
    const responseBuffer = buildResponse(parsed, [], true);
    
    assert.strictEqual(responseBuffer.readUInt16BE(0), id);
    // Flags RCODE = 3 (0x8483)
    assert.strictEqual(responseBuffer.readUInt16BE(2) & 0x000F, 3);
    assert.strictEqual(responseBuffer.readUInt16BE(6), 0); // ANCOUNT = 0
  });
});

test("CacheManager DB Lifecycle", async (t) => {
  await t.test("should insert, retrieve, and decay cache records", async () => {
    const cache = new CacheManager();
    const domain = "google.com";
    
    // Add entry with short TTL (1 sec)
    cache.add(domain, "A", "8.8.8.8", 1);
    
    // Immediate lookup should hit
    const hit = cache.lookup(domain, "A");
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].value, "8.8.8.8");
    assert.strictEqual(hit[0].ttl, 1);

    // Wait 1.2 seconds for expiration
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Lookup should now miss (expired)
    const miss = cache.lookup(domain, "A");
    assert.strictEqual(miss.length, 0);
  });
});

test("PoisonEngine DNS Hijacking Spoofing Simulator", async (t) => {
  await t.test("should spoof IP answers only when poisoning is globally enabled", () => {
    const engine = new PoisonEngine();
    const domain = "google.com";
    
    engine.setPoison(domain, "66.66.66.66");

    // Disabled globally -> no spoofed answer
    engine.setEnabled(false);
    assert.strictEqual(engine.isPoisoned(domain), false);
    assert.strictEqual(engine.getSpoofedAnswer(domain, "A"), null);

    // Enabled globally -> returns spoofed A record
    engine.setEnabled(true);
    assert.strictEqual(engine.isPoisoned(domain), true);
    
    const ans = engine.getSpoofedAnswer(domain, "A");
    assert.ok(ans);
    assert.strictEqual(ans.value, "66.66.66.66");
    assert.strictEqual(ans.poisoned, true);
  });
});
