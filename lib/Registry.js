/**
 * Registry.js
 * In-memory Authoritative Zone Registry.
 * Holds active server mappings for domains and records.
 */

class Registry {
  constructor() {
    this.records = new Map();
    this.initDefaultRecords();
  }

  initDefaultRecords() {
    // google.com
    this.addRecord("google.com", "A", "142.250.190.46", 300);
    this.addRecord("google.com", "TXT", "v=spf1 include:_spf.google.com ~all", 300);
    this.addRecord("google.com", "MX", "mail.google.com", 300, 10);
    this.addRecord("mail.google.com", "A", "142.250.190.50", 300);

    // github.com
    this.addRecord("github.com", "A", "140.82.121.4", 300);
    this.addRecord("github.com", "TXT", "github-verification=abc123xyz", 300);

    // render.com
    this.addRecord("render.com", "A", "216.24.57.1", 300);
    this.addRecord("portfolio.render.com", "CNAME", "render.com", 300);
    
    // example.com
    this.addRecord("example.com", "A", "93.184.216.34", 300);
  }

  addRecord(domain, type, value, ttl = 300, preference = 10) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    this.records.set(key, {
      domain: domain.toLowerCase(),
      type: type.toUpperCase(),
      value,
      ttl: Number(ttl),
      preference: Number(preference)
    });
  }

  removeRecord(domain, type) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    return this.records.delete(key);
  }

  lookup(domain, type) {
    const key = `${domain.toLowerCase()}:${type.toUpperCase()}`;
    const record = this.records.get(key);
    return record ? [record] : [];
  }

  getAllRecords() {
    return Array.from(this.records.values());
  }
}

module.exports = Registry;
