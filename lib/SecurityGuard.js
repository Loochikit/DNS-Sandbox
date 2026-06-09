class SecurityGuard {
  constructor() {
    this.blacklistedIps = new Set(['192.168.1.99', '10.0.0.66']); // default mock blacklist
    this.apiKeys = new Set(['shield-dev-123', 'shield-admin-999', 'sre-demo-key']); // default mock keys
    this.apiKeyRequired = false; // API Key enforcement toggle
  }

  blacklistIp(ip) {
    if (ip && ip.trim()) {
      this.blacklistedIps.add(ip.trim());
    }
  }

  whitelistIp(ip) {
    this.blacklistedIps.delete(ip);
  }

  isIpBlacklisted(ip) {
    return this.blacklistedIps.has(ip);
  }

  addApiKey(key) {
    if (key && key.trim()) {
      this.apiKeys.add(key.trim());
    }
  }

  removeApiKey(key) {
    this.apiKeys.delete(key);
  }

  isValidApiKey(key) {
    return this.apiKeys.has(key);
  }

  setApiKeyRequired(required) {
    this.apiKeyRequired = !!required;
  }

  checkRequest(ip, key) {
    // 1. IP Blacklist Check (403)
    if (this.isIpBlacklisted(ip)) {
      return { allowed: false, status: 403, reason: 'IP_BLACKLISTED' };
    }

    // 2. API Key Validation (401)
    if (this.apiKeyRequired) {
      if (!key) {
        return { allowed: false, status: 401, reason: 'MISSING_API_KEY' };
      }
      if (!this.isValidApiKey(key)) {
        return { allowed: false, status: 401, reason: 'INVALID_API_KEY' };
      }
    }

    return { allowed: true };
  }

  getBlacklistedIps() {
    return Array.from(this.blacklistedIps);
  }

  getApiKeys() {
    return Array.from(this.apiKeys);
  }
}

module.exports = SecurityGuard;
