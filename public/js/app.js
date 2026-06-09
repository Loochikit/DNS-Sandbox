/**
 * app.js
 * Main UI Controller and Client-side WebSocket integration.
 * Coordinates input configurations, security filters, chart updates, and simulator loops.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize systems
  const socket = io();
  const visualizer = new RateLimitVisualizer("canvasRateLimit");
  const charts = new TelemetryCharts();

  // Traffic Loop Interval holder
  let trafficIntervalId = null;

  // Local settings reference
  let currentKeys = [];

  // --- UI Elements ---
  const selectAlgorithm = document.getElementById("selectAlgorithm");
  const configTokenBucket = document.getElementById("config-token-bucket");
  const configLeakyBucket = document.getElementById("config-leaky-bucket");
  const configSlidingWindow = document.getElementById("config-sliding-window");

  // Inputs
  const tbCapacity = document.getElementById("tbCapacity");
  const tbRefill = document.getElementById("tbRefill");
  const lbCapacity = document.getElementById("lbCapacity");
  const lbLeak = document.getElementById("lbLeak");
  const swLimit = document.getElementById("swLimit");
  const swWindow = document.getElementById("swWindow");
  const btnSaveSettings = document.getElementById("btnSaveSettings");

  // Security elements
  const chkApiKeyRequired = document.getElementById("chkApiKeyRequired");
  const apiKeySection = document.getElementById("apiKeySection");
  const txtNewApiKey = document.getElementById("txtNewApiKey");
  const btnAddApiKey = document.getElementById("btnAddApiKey");
  const apiKeysList = document.getElementById("apiKeysList");

  const txtBlacklistIp = document.getElementById("txtBlacklistIp");
  const btnBlacklistIp = document.getElementById("btnBlacklistIp");
  const blacklistList = document.getElementById("blacklistList");

  // Simulator elements
  const selectClientIp = document.getElementById("selectClientIp");
  const customClientIpGroup = document.getElementById("customClientIpGroup");
  const txtCustomIp = document.getElementById("txtCustomIp");
  const selectApiKey = document.getElementById("selectApiKey");
  const rangeTrafficRate = document.getElementById("rangeTrafficRate");
  const valTrafficRate = document.getElementById("valTrafficRate");
  const btnSingleRequest = document.getElementById("btnSingleRequest");
  const btnToggleTraffic = document.getElementById("btnToggleTraffic");

  // Telemetry Cards
  const statTotal = document.getElementById("statTotal");
  const statPassed = document.getElementById("statPassed");
  const statLimited = document.getElementById("statLimited");
  const statBlocked = document.getElementById("statBlocked");
  const logsContainer = document.getElementById("logsContainer");
  const btnResetLogs = document.getElementById("btnResetLogs");
  const txtCanvasStatus = document.getElementById("txtCanvasStatus");

  // --- Helper: UI View Toggles ---
  const updateConfigVisibility = (algo) => {
    configTokenBucket.style.display = algo === "token-bucket" ? "block" : "none";
    configLeakyBucket.style.display = algo === "leaky-bucket" ? "block" : "none";
    configSlidingWindow.style.display = algo === "sliding-window" ? "block" : "none";
  };

  selectAlgorithm.addEventListener("change", () => {
    updateConfigVisibility(selectAlgorithm.value);
  });

  selectClientIp.addEventListener("change", () => {
    customClientIpGroup.style.display = selectClientIp.value === "custom" ? "block" : "none";
  });

  // --- WebSocket Listeners ---
  socket.on("init-state", (state) => {
    // Sync settings
    selectAlgorithm.value = state.algorithm;
    updateConfigVisibility(state.algorithm);
    visualizer.setAlgorithm(state.algorithm);

    // Sync input parameters
    tbCapacity.value = state.tokenBucket.capacity;
    tbRefill.value = state.tokenBucket.refillRate;
    lbCapacity.value = state.leakyBucket.capacity;
    lbLeak.value = state.leakyBucket.leakRate;
    swLimit.value = state.slidingWindow.limit;
    swWindow.value = state.slidingWindow.windowSize;

    // Sync security switches
    chkApiKeyRequired.checked = state.security.apiKeyRequired;
    apiKeySection.style.display = state.security.apiKeyRequired ? "block" : "none";
    syncSecurityUI(state.security);

    // Sync history
    renderLogs(state.history);
    updateStats(state.historySummary.totals);

    // Initial state setup for canvas
    if (state.history.length > 0) {
      const last = state.history[state.history.length - 1];
      const initialBucketState = {
        tokens: last.tokensRemaining !== undefined ? last.tokensRemaining : 10,
        queueLength: last.queueLength !== undefined ? last.queueLength : 0,
        count: last.windowCount !== undefined ? last.windowCount : 0
      };
      visualizer.updateState(initialBucketState);
      updateCanvasStatusBarText(state.algorithm, initialBucketState);
    }
  });

  socket.on("settings-changed", (data) => {
    selectAlgorithm.value = data.activeAlgorithm;
    updateConfigVisibility(data.activeAlgorithm);
    visualizer.setAlgorithm(data.activeAlgorithm);

    tbCapacity.value = data.tokenBucket.capacity;
    tbRefill.value = data.tokenBucket.refillRate;
    lbCapacity.value = data.leakyBucket.capacity;
    lbLeak.value = data.leakyBucket.leakRate;
    swLimit.value = data.slidingWindow.limit;
    swWindow.value = data.slidingWindow.windowSize;

    // Reset visualizer limits
    visualizer.updateState({
      capacity: data.tokenBucket.capacity,
      refillRate: data.tokenBucket.refillRate,
      leakRate: data.leakyBucket.leakRate,
      limit: data.slidingWindow.limit,
      windowSize: data.slidingWindow.windowSize
    });
  });

  socket.on("security-update", (data) => {
    chkApiKeyRequired.checked = data.apiKeyRequired;
    apiKeySection.style.display = data.apiKeyRequired ? "block" : "none";
    syncSecurityUI(data);
  });

  socket.on("request-processed", (data) => {
    const record = data.record;
    
    // Trigger Canvas particle drop
    visualizer.triggerRequest(record.allowed, record.reason);

    // Record data to Chart.js
    charts.recordRequest(record.allowed);

    // Update canvas counts state
    if (data.bucketState) {
      visualizer.updateState(data.bucketState);
      updateCanvasStatusBarText(record.algorithm, data.bucketState);
    }

    // Refresh telemetry metric cards
    updateStats(data.summary.totals);

    // Append log record to audit table
    appendLog(record);
  });

  socket.on("leaky-bucket-leak", (data) => {
    // Spark visual leak drip
    visualizer.triggerLeak();
    visualizer.updateState({ queueLength: data.queueLength });
    updateCanvasStatusBarText("leaky-bucket", { queueLength: data.queueLength, capacity: data.capacity });
  });

  socket.on("logs-cleared", () => {
    logsContainer.innerHTML = `<div style="color: var(--text-dark); text-align: center; margin-top: 3rem; font-size: 0.75rem;">Waiting for gateway requests...</div>`;
    statTotal.textContent = "0";
    statPassed.textContent = "0";
    statLimited.textContent = "0";
    statBlocked.textContent = "0";
    charts.clear();
  });

  // --- UI Action Controllers ---
  btnSaveSettings.addEventListener("click", () => {
    const payload = {
      algorithm: selectAlgorithm.value,
      tokenBucket: {
        capacity: parseInt(tbCapacity.value),
        refillRate: parseFloat(tbRefill.value)
      },
      leakyBucket: {
        capacity: parseInt(lbCapacity.value),
        leakRate: parseFloat(lbLeak.value)
      },
      slidingWindow: {
        limit: parseInt(swLimit.value),
        windowSize: parseInt(swWindow.value)
      }
    };

    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showToast("Configurations updated successfully", "success");
      }
    });
  });

  chkApiKeyRequired.addEventListener("change", () => {
    const enabled = chkApiKeyRequired.checked;
    fetch("/api/security/toggle-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
  });

  btnAddApiKey.addEventListener("click", () => {
    const key = txtNewApiKey.value.trim();
    if (!key) return;

    fetch("/api/security/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    })
    .then(() => {
      txtNewApiKey.value = "";
    });
  });

  btnBlacklistIp.addEventListener("click", () => {
    const ip = txtBlacklistIp.value.trim();
    if (!ip) return;

    fetch("/api/security/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip })
    })
    .then(() => {
      txtBlacklistIp.value = "";
    });
  });

  btnResetLogs.addEventListener("click", () => {
    fetch("/api/control/clear-logs", { method: "POST" });
  });

  // Badge list item deletions via event delegation
  apiKeysList.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-badge")) {
      const key = e.target.dataset.item;
      fetch(`/api/security/keys/${encodeURIComponent(key)}`, { method: "DELETE" });
    }
  });

  blacklistList.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-badge")) {
      const ip = e.target.dataset.item;
      fetch(`/api/security/blacklist/${encodeURIComponent(ip)}`, { method: "DELETE" });
    }
  });

  // --- Simulator: Traffic Injection ---
  btnSingleRequest.addEventListener("click", () => {
    injectRequest();
  });

  btnToggleTraffic.addEventListener("click", () => {
    if (trafficIntervalId) {
      stopTrafficLoop();
    } else {
      startTrafficLoop();
    }
  });

  rangeTrafficRate.addEventListener("input", () => {
    const rate = parseInt(rangeTrafficRate.value);
    if (rate === 0) {
      valTrafficRate.textContent = "0 Req/sec (Stopped)";
      if (trafficIntervalId) stopTrafficLoop();
    } else {
      valTrafficRate.textContent = `${rate} Req/second`;
      if (trafficIntervalId) {
        // restart with new interval velocity
        stopTrafficLoop();
        startTrafficLoop();
      }
    }
  });

  function getSimulatorPayload() {
    let ip = selectClientIp.value;
    if (ip === "custom") {
      ip = txtCustomIp.value.trim() || "127.0.0.1";
    }

    const apiKey = selectApiKey.value;
    return { ip, apiKey, delay: 30 };
  }

  function injectRequest() {
    const payload = getSimulatorPayload();
    fetch("/api/control/trigger-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  function startTrafficLoop() {
    const rate = parseInt(rangeTrafficRate.value);
    if (rate === 0) {
      rangeTrafficRate.value = 3;
      valTrafficRate.textContent = "3 Req/second";
    }
    
    const targetRps = parseInt(rangeTrafficRate.value);
    const intervalMs = 1000 / targetRps;

    btnToggleTraffic.textContent = "Stop Traffic Loop";
    btnToggleTraffic.className = "danger";

    trafficIntervalId = setInterval(() => {
      injectRequest();
    }, intervalMs);
  }

  function stopTrafficLoop() {
    if (trafficIntervalId) {
      clearInterval(trafficIntervalId);
      trafficIntervalId = null;
    }
    btnToggleTraffic.textContent = "Start Traffic Loop";
    btnToggleTraffic.className = "success";
    rangeTrafficRate.value = 0;
    valTrafficRate.textContent = "0 Req/sec (Stopped)";
  }

  // --- Sync Helpers ---
  function syncSecurityUI(security) {
    currentKeys = security.apiKeys;

    // 1. Api Keys badge list
    apiKeysList.innerHTML = "";
    security.apiKeys.forEach(key => {
      const badge = document.createElement("span");
      badge.className = "badge-item";
      badge.innerHTML = `
        <span>${key}</span>
        <span class="remove-badge" data-item="${key}">&times;</span>
      `;
      apiKeysList.appendChild(badge);
    });

    // 2. Blacklisted IPs badge list
    blacklistList.innerHTML = "";
    security.blacklistedIps.forEach(ip => {
      const badge = document.createElement("span");
      badge.className = "badge-item blacklist";
      badge.innerHTML = `
        <span>${ip}</span>
        <span class="remove-badge" data-item="${ip}">&times;</span>
      `;
      blacklistList.appendChild(badge);
    });

    // 3. Sync Simulator dropdown options for keys
    const previousSelected = selectApiKey.value;
    selectApiKey.innerHTML = `<option value="">No API Key</option>`;
    
    security.apiKeys.forEach(key => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${key} (Valid)`;
      selectApiKey.appendChild(opt);
    });

    const invalidOpt = document.createElement("option");
    invalidOpt.value = "shield-invalid-456";
    invalidOpt.textContent = "shield-invalid-456 (Invalid)";
    selectApiKey.appendChild(invalidOpt);

    selectApiKey.value = previousSelected;
  }

  function updateCanvasStatusBarText(algo, state) {
    if (algo === "token-bucket") {
      const tokens = state.tokens !== undefined ? state.tokens : state.currentTokens;
      txtCanvasStatus.textContent = `Tokens Remaining: ${Math.floor(tokens)} / ${state.capacity}`;
    } else if (algo === "leaky-bucket") {
      txtCanvasStatus.textContent = `Queue Level: ${state.queueLength} / ${state.capacity}`;
    } else if (algo === "sliding-window") {
      txtCanvasStatus.textContent = `Window Request Count: ${state.count} / ${state.limit}`;
    }
  }

  function updateStats(totals) {
    statTotal.textContent = totals.total;
    statPassed.textContent = totals.passed;
    statLimited.textContent = totals.rateLimited;
    statBlocked.textContent = totals.unauthorized + totals.forbidden;
  }

  function renderLogs(logs) {
    logsContainer.innerHTML = "";
    if (logs.length === 0) {
      logsContainer.innerHTML = `<div style="color: var(--text-dark); text-align: center; margin-top: 3rem; font-size: 0.75rem;">Waiting for requests...</div>`;
      return;
    }
    const subset = logs.slice(-30).reverse();
    subset.forEach(log => appendLog(log, false));
  }

  function appendLog(log, isNew = true) {
    // Remove default placeholder text if present
    if (logsContainer.children.length === 1 && logsContainer.children[0].style.textAlign === "center") {
      logsContainer.innerHTML = "";
    }

    const item = document.createElement("div");
    item.className = "audit-item";

    const isSuccess = log.allowed;
    let badgeClass = "success";
    if (!isSuccess) {
      badgeClass = log.statusCode === 429 ? "warning" : "error";
    }

    const t = new Date(log.timestamp);
    const timeStr = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;

    item.innerHTML = `
      <div class="audit-header">
        <span class="audit-path">${log.method} ${log.url}</span>
        <span class="status-badge-http ${badgeClass}">${log.statusCode}</span>
      </div>
      <div>
        <span style="color: var(--accent-cyan); font-weight: bold;">Client IP:</span> ${log.clientIp}
      </div>
      <div class="audit-meta">
        <span>Algo: ${log.algorithm} | ${log.reason}</span>
        <span>${log.latency}ms | ${timeStr}</span>
      </div>
    `;

    if (isNew) {
      logsContainer.insertBefore(item, logsContainer.firstChild);
      // Caps logs visual length at 50
      if (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.lastChild);
      }
    } else {
      logsContainer.appendChild(item);
    }
  }

  // Visual helper toast notifications
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "0.75rem 1.25rem";
    toast.style.borderRadius = "5px";
    toast.style.backgroundColor = type === "success" ? "rgba(0, 230, 118, 0.95)" : "rgba(255, 23, 68, 0.95)";
    toast.style.color = "#060a12";
    toast.style.fontSize = "0.8rem";
    toast.style.fontWeight = "bold";
    toast.style.zIndex = "1000";
    toast.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
    toast.style.fontFamily = "var(--font-title)";
    toast.style.transition = "all 0.5s ease";
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  }
});
