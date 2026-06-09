/**
 * server.js
 * DNS-Sandbox Main Server.
 * 1. Exposes Express Dashboard and Control APIs on Port 8060.
 * 2. Exposes UDP Socket DNS Server on Port 8053.
 * 3. Handles binary packet parser, recursive hop simulation, cache registry, and WebSocket streams.
 */

const express = require("express");
const http = require("http");
const dgram = require("dgram");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

// Core Engines
const { parseQuery, buildResponse, buildQuery } = require("./lib/DnsServer");
const Registry = require("./lib/Registry");
const CacheManager = require("./lib/CacheManager");
const PoisonEngine = require("./lib/PoisonEngine");

dotenv.config();

const PORT = process.env.PORT || 8060;
const DNS_PORT = process.env.DNS_PORT || 8053;

// --- Initialize Registries & Databases ---
const registry = new Registry();
const cache = new CacheManager();
const poisonEngine = new PoisonEngine();
const historyLogs = [];

// --- 1. SRE Dashboard UI Server (Express TCP 8060) ---
const app = express();
const dashboardServer = http.createServer(app);
const io = new Server(dashboardServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Telemetry Stats aggregator
function getTelemetrySummary() {
  const last30 = historyLogs.slice(-30);
  const total = historyLogs.length;
  const cacheHits = historyLogs.filter(h => h.source === "cache").length;
  const recursiveMisses = historyLogs.filter(h => h.source === "recursive" || h.source === "authoritative").length;
  const poisonedHijacks = historyLogs.filter(h => h.poisoned).length;
  const avgLatency = total ? Math.round(historyLogs.reduce((acc, h) => acc + h.latency, 0) / total) : 0;

  return {
    totals: {
      total,
      cacheHits,
      recursiveMisses,
      poisonedHijacks,
      avgLatency
    },
    recent: last30
  };
}

// Log final resolved query helper
const finalizeDnsLog = (id, clientIp, domain, type, answers, allowed, source, latency, poisoned = false, rcode = 0) => {
  const logRecord = {
    id: `dns_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    transactionId: id,
    clientIp,
    domain,
    type,
    answers: answers.map(a => `${a.type} -> ${a.value} (TTL ${a.ttl}s)`).join(" | "),
    allowed,
    source, // 'cache' | 'authoritative' | 'recursive' | 'hijacked-cache'
    latency,
    poisoned,
    rcode // 0 = NOERROR, 3 = NXDOMAIN
  };

  historyLogs.push(logRecord);
  if (historyLogs.length > 300) {
    historyLogs.shift();
  }

  // Stream stats to dashboard
  io.emit("dns-processed", {
    record: logRecord,
    summary: getTelemetrySummary(),
    cacheList: cache.getAliveRecords()
  });
};

// --- Settings & Control REST APIs ---
app.get("/api/settings", (req, res) => {
  res.json({
    registry: registry.getAllRecords(),
    cache: cache.getAliveRecords(),
    poison: {
      isEnabled: poisonEngine.isEnabled,
      entries: poisonEngine.getEntries()
    },
    summary: getTelemetrySummary()
  });
});

app.post("/api/settings/record", (req, res) => {
  const { domain, type, value, ttl, preference } = req.body;
  if (!domain || !type || !value) {
    return res.status(400).json({ error: "Missing fields: domain, type, and value are required" });
  }

  registry.addRecord(domain, type, value, ttl, preference);
  io.emit("registry-update", registry.getAllRecords());
  res.json({ success: true, message: `DNS Record added for ${domain}` });
});

app.delete("/api/settings/record/:domain/:type", (req, res) => {
  const { domain, type } = req.params;
  const deleted = registry.removeRecord(domain, type);
  io.emit("registry-update", registry.getAllRecords());
  res.json({ success: !!deleted });
});

app.post("/api/settings/poison", (req, res) => {
  const { domain, maliciousIp } = req.body;
  if (!domain || !maliciousIp) {
    return res.status(400).json({ error: "Domain and malicious IP required" });
  }

  poisonEngine.setPoison(domain, maliciousIp);
  io.emit("poison-update", {
    isEnabled: poisonEngine.isEnabled,
    entries: poisonEngine.getEntries()
  });
  res.json({ success: true, message: `Poison entry configured for ${domain}` });
});

app.delete("/api/settings/poison/:domain", (req, res) => {
  const { domain } = req.params;
  poisonEngine.removePoison(domain);
  io.emit("poison-update", {
    isEnabled: poisonEngine.isEnabled,
    entries: poisonEngine.getEntries()
  });
  res.json({ success: true });
});

app.post("/api/settings/toggle-poison", (req, res) => {
  const { enabled } = req.body;
  poisonEngine.setEnabled(enabled);
  io.emit("poison-update", {
    isEnabled: poisonEngine.isEnabled,
    entries: poisonEngine.getEntries()
  });
  res.json({ success: true, isEnabled: poisonEngine.isEnabled });
});

app.post("/api/control/clear-logs", (req, res) => {
  historyLogs.length = 0;
  io.emit("logs-cleared");
  res.json({ success: true });
});

app.post("/api/control/clear-cache", (req, res) => {
  cache.clear();
  io.emit("cache-cleared", cache.getAliveRecords());
  res.json({ success: true });
});

// Trigger a real local UDP DNS Query Loopback
app.post("/api/control/trigger-query", (req, res) => {
  const { domain, type } = req.body;
  if (!domain || !type) return res.status(400).json({ error: "Domain and type required" });

  const client = dgram.createSocket("udp4");
  const transactionId = Math.floor(Math.random() * 65535);
  const queryBuf = buildQuery(transactionId, domain, type);
  
  let resolved = false;

  client.on("message", (msg) => {
    if (resolved) return;
    resolved = true;
    client.close();
    res.json({
      success: true,
      message: `UDP Query targeting DNS Port ${DNS_PORT} resolved successfully`,
      rawLength: msg.length
    });
  });

  client.on("error", (err) => {
    if (resolved) return;
    resolved = true;
    client.close();
    res.status(500).json({ error: err.message });
  });

  client.send(queryBuf, 0, queryBuf.length, DNS_PORT, "127.0.0.1", (err) => {
    if (err && !resolved) {
      resolved = true;
      client.close();
      res.status(500).json({ error: err.message });
    }
  });

  // Timeout fallbacks
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      client.close();
      res.status(504).json({ error: "UDP Local Query Gateway Timeout" });
    }
  }, 2000);
});


// --- 2. UDP DNS Socket Server (UDP 8053) ---
const udpDnsServer = dgram.createSocket("udp4");

udpDnsServer.on("message", (msg, rinfo) => {
  const startTime = Date.now();
  const parsed = parseQuery(msg);

  if (!parsed) {
    console.error("⚠️ Failed to parse raw UDP DNS packet header");
    return;
  }

  const clientIp = rinfo.address;
  const { id, domain, type } = parsed;

  // A. Security Check - Cache Poisoning Interception
  const spoofed = poisonEngine.getSpoofedAnswer(domain, type);
  if (spoofed) {
    const latency = Date.now() - startTime;
    const responseBuf = buildResponse(parsed, [spoofed]);
    
    // Broadcast security hijack details to visualizer immediately
    io.emit("dns-hop", {
      id,
      domain,
      type,
      hop: "Hijacked Cache (Poisoned)",
      status: "hijacked",
      maliciousIp: spoofed.value
    });

    udpDnsServer.send(responseBuf, 0, responseBuf.length, rinfo.port, rinfo.address);
    finalizeDnsLog(id, clientIp, domain, type, [spoofed], false, "hijacked-cache", latency, true, 0);
    return;
  }

  // B. Cache Lookup
  const cached = cache.lookup(domain, type);
  if (cached.length > 0) {
    const latency = Date.now() - startTime;
    const responseBuf = buildResponse(parsed, cached);
    
    io.emit("dns-hop", {
      id,
      domain,
      type,
      hop: "Local Resolver Cache",
      status: "hit"
    });

    udpDnsServer.send(responseBuf, 0, responseBuf.length, rinfo.port, rinfo.address);
    finalizeDnsLog(id, clientIp, domain, type, cached, true, "cache", latency, false, 0);
    return;
  }

  // C. Recursive Resolution Hops Simulator Chain
  // If the record isn't cached, query authoritative list or mock resolution
  const authoritativeAnswers = registry.lookup(domain, type);
  
  // Hops timeline logic
  const hops = [
    { name: "Recursive Resolver", delay: 35 },
    { name: "Root Server (.)", delay: 70 },
    { name: "TLD Name Server (.com)", delay: 60 },
    { name: "Authoritative Server", delay: 65 }
  ];

  const triggerHopChain = (hopIndex) => {
    if (hopIndex >= hops.length) {
      // Finished all hops! Process final output
      const finalLatency = Date.now() - startTime;
      
      if (authoritativeAnswers.length > 0) {
        // Cache entry
        authoritativeAnswers.forEach(ans => {
          cache.add(domain, type, ans.value, ans.ttl, ans.preference);
        });

        const responseBuf = buildResponse(parsed, authoritativeAnswers);
        udpDnsServer.send(responseBuf, 0, responseBuf.length, rinfo.port, rinfo.address);
        finalizeDnsLog(id, clientIp, domain, type, authoritativeAnswers, true, "authoritative", finalLatency, false, 0);
      } else {
        // NXDOMAIN - Record Name Error
        const responseBuf = buildResponse(parsed, [], true);
        udpDnsServer.send(responseBuf, 0, responseBuf.length, rinfo.port, rinfo.address);
        finalizeDnsLog(id, clientIp, domain, type, [], false, "recursive", finalLatency, false, 3);
      }
      return;
    }

    const currentHop = hops[hopIndex];
    
    // Broadcast hop activation
    io.emit("dns-hop", {
      id,
      domain,
      type,
      hop: currentHop.name,
      status: hopIndex === hops.length - 1 && authoritativeAnswers.length === 0 ? "nxdomain" : "searching"
    });

    setTimeout(() => {
      triggerHopChain(hopIndex + 1);
    }, currentHop.delay);
  };

  // Start resolution sequence
  triggerHopChain(0);
});

udpDnsServer.on("listening", () => {
  const address = udpDnsServer.address();
  console.log(`⚡ UDP DNS Server listening on port ${address.port}`);
});

udpDnsServer.on("error", (err) => {
  console.error(`⚠️ UDP Server error:\n${err.stack}`);
  udpDnsServer.close();
});

// Broadcast TTL refresh interval (every second) to sync UI countdown counters
setInterval(() => {
  const activeCache = cache.getAliveRecords();
  io.emit("cache-decay", activeCache);
}, 1000);

// --- Boot Servers ---
dashboardServer.listen(PORT, () => {
  console.log(`🖥️  DNS SRE Observability Console active at http://localhost:${PORT}`);
  console.log(`👉 Open dashboard: http://localhost:${PORT}/index.html`);
});

udpDnsServer.bind(DNS_PORT);

// Graceful Shutdown
process.on("SIGTERM", () => {
  udpDnsServer.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  udpDnsServer.close();
  process.exit(0);
});
