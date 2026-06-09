/**
 * app.js
 * DNS-Sandbox Dashboard UI Controller.
 * Sychronizes state updates, registers clicks, and manages loop intervals.
 */

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const visualizer = new DnsVisualizer("canvasDnsResolution");

  let queryIntervalId = null;

  // --- UI Elements ---
  const registryList = document.getElementById("registryList");
  const txtDomain = document.getElementById("txtDomain");
  const selectRecordType = document.getElementById("selectRecordType");
  const txtRecordValue = document.getElementById("txtRecordValue");
  const numRecordTtl = document.getElementById("numRecordTtl");
  const btnAddRecord = document.getElementById("btnAddRecord");

  const chkPoisonEnabled = document.getElementById("chkPoisonEnabled");
  const poisonList = document.getElementById("poisonList");
  const txtPoisonDomain = document.getElementById("txtPoisonDomain");
  const txtPoisonIp = document.getElementById("txtPoisonIp");
  const btnPoisonDomain = document.getElementById("btnPoisonDomain");

  const selectQueryType = document.getElementById("selectQueryType");
  const txtQueryDomain = document.getElementById("txtQueryDomain");
  const rangeQueryRate = document.getElementById("rangeQueryRate");
  const valQueryRate = document.getElementById("valQueryRate");
  const btnSingleQuery = document.getElementById("btnSingleQuery");
  const btnToggleQueries = document.getElementById("btnToggleQueries");

  const statQueries = document.getElementById("statQueries");
  const statHits = document.getElementById("statHits");
  const statMisses = document.getElementById("statMisses");
  const statHijacks = document.getElementById("statHijacks");

  const cacheList = document.getElementById("cacheList");
  const btnClearCache = document.getElementById("btnClearCache");
  const logsContainer = document.getElementById("logsContainer");
  const btnClearLogs = document.getElementById("btnClearLogs");

  // --- WebSockets Telemetry Streams ---
  socket.on("connect", () => {
    // Fetch initial state via REST fallback
    fetch("/api/settings")
      .then(r => r.json())
      .then(state => {
        renderRegistry(state.registry);
        renderCache(state.cache);
        renderPoison(state.poison);
        renderLogs(state.summary.recent);
        updateStats(state.summary.totals);
      });
  });

  socket.on("registry-update", (records) => {
    renderRegistry(records);
  });

  socket.on("poison-update", (data) => {
    chkPoisonEnabled.checked = data.isEnabled;
    renderPoison(data);
  });

  socket.on("dns-hop", (data) => {
    // Direct packet movement on canvas
    visualizer.handleHopEvent(data);
  });

  socket.on("dns-processed", (data) => {
    // Append trace logs
    appendLog(data.record);
    updateStats(data.summary.totals);
    renderCache(data.cacheList);
  });

  socket.on("cache-decay", (cacheRecords) => {
    renderCache(cacheRecords);
  });

  socket.on("cache-cleared", (cacheRecords) => {
    renderCache(cacheRecords);
  });

  socket.on("logs-cleared", () => {
    logsContainer.innerHTML = `<div style="color: var(--text-dark); text-align: center; margin-top: 3rem; font-size: 0.75rem;">Waiting for DNS requests...</div>`;
    statQueries.textContent = "0";
    statHits.textContent = "0";
    statMisses.textContent = "0";
    statHijacks.textContent = "0";
  });

  // --- UI Action Callbacks ---
  btnAddRecord.addEventListener("click", () => {
    const domain = txtDomain.value.trim();
    const type = selectRecordType.value;
    const value = txtRecordValue.value.trim();
    const ttl = parseInt(numRecordTtl.value) || 300;

    if (!domain || !value) {
      showToast("Domain and destination value are required", "error");
      return;
    }

    fetch("/api/settings/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, type, value, ttl })
    })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        txtDomain.value = "";
        txtRecordValue.value = "";
        showToast(d.message);
      }
    });
  });

  chkPoisonEnabled.addEventListener("change", () => {
    const enabled = chkPoisonEnabled.checked;
    fetch("/api/settings/toggle-poison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
  });

  btnPoisonDomain.addEventListener("click", () => {
    const domain = txtPoisonDomain.value.trim();
    const maliciousIp = txtPoisonIp.value.trim();

    if (!domain || !maliciousIp) {
      showToast("Domain and malicious IP redirect required", "error");
      return;
    }

    fetch("/api/settings/poison", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, maliciousIp })
    })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        txtPoisonDomain.value = "";
        txtPoisonIp.value = "";
        showToast(d.message);
      }
    });
  });

  btnClearCache.addEventListener("click", () => {
    fetch("/api/control/clear-cache", { method: "POST" });
  });

  btnClearLogs.addEventListener("click", () => {
    fetch("/api/control/clear-logs", { method: "POST" });
  });

  // Delete delegation
  registryList.addEventListener("click", (e) => {
    if (e.target.classList.contains("cell-action")) {
      const domain = e.target.dataset.domain;
      const type = e.target.dataset.type;
      fetch(`/api/settings/record/${encodeURIComponent(domain)}/${encodeURIComponent(type)}`, {
        method: "DELETE"
      });
    }
  });

  poisonList.addEventListener("click", (e) => {
    if (e.target.classList.contains("cell-action")) {
      const domain = e.target.dataset.domain;
      fetch(`/api/settings/poison/${encodeURIComponent(domain)}`, {
        method: "DELETE"
      });
    }
  });

  // --- Client Simulator loops ---
  btnSingleQuery.addEventListener("click", () => {
    injectQuery();
  });

  btnToggleQueries.addEventListener("click", () => {
    if (queryIntervalId) {
      stopQueryLoop();
    } else {
      startQueryLoop();
    }
  });

  rangeQueryRate.addEventListener("input", () => {
    const rate = parseInt(rangeQueryRate.value);
    if (rate === 0) {
      valQueryRate.textContent = "0 QPS (Stopped)";
      if (queryIntervalId) stopQueryLoop();
    } else {
      valQueryRate.textContent = `${rate} Queries/sec`;
      if (queryIntervalId) {
        stopQueryLoop();
        startQueryLoop();
      }
    }
  });

  function injectQuery() {
    const domain = txtQueryDomain.value.trim() || "google.com";
    const type = selectQueryType.value;

    fetch("/api/control/trigger-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, type })
    });
  }

  function startQueryLoop() {
    const rate = parseInt(rangeQueryRate.value);
    if (rate === 0) {
      rangeQueryRate.value = 2;
      valQueryRate.textContent = "2 Queries/sec";
    }

    const qps = parseInt(rangeQueryRate.value);
    const intervalMs = 1000 / qps;

    btnToggleQueries.textContent = "Stop Query Loop";
    btnToggleQueries.className = "danger";

    queryIntervalId = setInterval(() => {
      // Pick random domains to test cache expirations vs poison redirects
      const domains = ["google.com", "github.com", "render.com", "portfolio.render.com", "example.com", "nxdomain-test.net"];
      const types = ["A", "TXT", "CNAME", "MX"];
      
      const randDomain = domains[Math.floor(Math.random() * domains.length)];
      const randType = randDomain.includes("nxdomain") ? "A" : types[Math.floor(Math.random() * types.length)];
      
      fetch("/api/control/trigger-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: randDomain, type: randType })
      });
    }, intervalMs);
  }

  function stopQueryLoop() {
    if (queryIntervalId) {
      clearInterval(queryIntervalId);
      queryIntervalId = null;
    }
    btnToggleQueries.textContent = "Start Query Loop";
    btnToggleQueries.className = "success";
    rangeQueryRate.value = 0;
    valQueryRate.textContent = "0 QPS (Stopped)";
  }

  // --- Rendering UI Helpers ---
  function renderRegistry(records) {
    if (records.length === 0) {
      registryList.innerHTML = `<div style="color: var(--text-dark); text-align: center; padding: 1rem;">No records registered.</div>`;
      return;
    }

    registryList.innerHTML = records.map(r => `
      <div class="table-row">
        <span class="cell-domain" title="${r.domain}">${r.domain}</span>
        <span class="cell-type">${r.type}</span>
        <span class="cell-val" title="${r.value}">${r.value}</span>
        <span class="cell-ttl">${r.ttl}s</span>
        <span class="cell-action" data-domain="${r.domain}" data-type="${r.type}">&times;</span>
      </div>
    `).join("");
  }

  function renderCache(cacheRecords) {
    if (cacheRecords.length === 0) {
      cacheList.innerHTML = `<div style="color: var(--text-dark); text-align: center; padding: 1.5rem;">Cache empty.</div>`;
      return;
    }

    cacheList.innerHTML = cacheRecords.map(r => `
      <div class="table-row">
        <span class="cell-domain" title="${r.domain}">${r.domain}</span>
        <span class="cell-type">${r.type}</span>
        <span class="cell-val" title="${r.value}">${r.value}</span>
        <span class="cell-ttl">${r.ttl}s</span>
      </div>
    `).join("");
  }

  function renderPoison(poison) {
    if (poison.entries.length === 0) {
      poisonList.innerHTML = `<div style="color: var(--text-dark); text-align: center; padding: 1rem;">No active hijacks.</div>`;
      return;
    }

    poisonList.innerHTML = poison.entries.map(e => `
      <div class="table-row" style="background: rgba(255, 23, 68, 0.02); border-color: rgba(255, 23, 68, 0.1);">
        <span class="cell-domain" title="${e.domain}" style="color: var(--accent-red);">${e.domain}</span>
        <span class="cell-type">A</span>
        <span class="cell-val" title="${e.ip}" style="color: var(--accent-orange);">${e.ip}</span>
        <span class="cell-action" data-domain="${e.domain}">&times;</span>
      </div>
    `).join("");
  }

  function updateStats(totals) {
    statQueries.textContent = totals.total;
    statHits.textContent = totals.cacheHits;
    statMisses.textContent = totals.recursiveMisses;
    statHijacks.textContent = totals.poisonedHijacks;
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
    if (logsContainer.children.length === 1 && logsContainer.children[0].style.textAlign === "center") {
      logsContainer.innerHTML = "";
    }

    const item = document.createElement("div");
    item.className = "audit-item";

    let badgeClass = "success";
    let statusText = "NOERROR";

    if (log.rcode === 3) {
      badgeClass = "warning";
      statusText = "NXDOMAIN";
    } else if (log.poisoned) {
      badgeClass = "error";
      statusText = "SPOOFED";
    }

    const t = new Date(log.timestamp);
    const timeStr = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;

    item.innerHTML = `
      <div class="audit-header">
        <span class="audit-domain">${log.type} ${log.domain}</span>
        <span class="status-badge-dns ${badgeClass}">${statusText}</span>
      </div>
      <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 0.15rem;">
        ID: <span style="color:#ffffff;">#${log.transactionId}</span> | Answers: ${log.answers || "None"}
      </div>
      <div class="audit-meta">
        <span>Source: ${log.source}</span>
        <span>${log.latency}ms | ${timeStr}</span>
      </div>
    `;

    if (isNew) {
      logsContainer.insertBefore(item, logsContainer.firstChild);
      if (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.lastChild);
      }
    } else {
      logsContainer.appendChild(item);
    }
  }

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
