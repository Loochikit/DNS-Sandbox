/**
 * PoisonEngine.js
 * DNS Cache Poisoning (Spoofing) Simulator.
 * Intercepts requests for targeted domains and injects malicious IP mappings.
 */

class PoisonEngine {
  constructor() {
    this.poisonedEntries = new Map(); // domain -> maliciousIp
    this.isEnabled = false; // globally enable/disable DNS spoofing simulation
    this.initDefaultPoison();
  }

  initDefaultPoison() {
    this.setPoison("google.com", "66.66.66.66");
    this.setPoison("github.com", "99.99.99.99");
  }

  setPoison(domain, maliciousIp) {
    if (domain && maliciousIp) {
      this.poisonedEntries.set(domain.toLowerCase().trim(), maliciousIp.trim());
    }
  }

  removePoison(domain) {
    return this.poisonedEntries.delete(domain.toLowerCase().trim());
  }

  isPoisoned(domain) {
    if (!this.isEnabled) return false;
    return this.poisonedEntries.has(domain.toLowerCase().trim());
  }

  getSpoofedAnswer(domain, type) {
    if (type.toUpperCase() === "A" && this.isPoisoned(domain)) {
      return {
        domain: domain.toLowerCase(),
        type: "A",
        value: this.poisonedEntries.get(domain.toLowerCase()),
        ttl: 60, // Short spoofed TTL
        preference: 10,
        poisoned: true
      };
    }
    return null;
  }

  setEnabled(enabled) {
    this.isEnabled = !!enabled;
  }

  getEntries() {
    const list = [];
    for (const [domain, ip] of this.poisonedEntries.entries()) {
      list.push({ domain, ip });
    }
    return list;
  }
}

module.exports = PoisonEngine;
