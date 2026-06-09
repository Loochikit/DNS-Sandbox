/**
 * dns-visual.js
 * HTML5 Canvas Resolver Tree Visualizer.
 * Renders nodes, recursive lookup paths, cache hit highlights, and poisoned hijacks.
 */

class DnsVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    
    this.nodes = {
      client: { x: 0, y: 0, label: "Client Host", ip: "127.0.0.1", color: "#ffffff", glow: 0 },
      resolver: { x: 0, y: 0, label: "Recursive Resolver", ip: "Local Node", color: "#00f2fe", glow: 0 },
      root: { x: 0, y: 0, label: "Root Server (.)", ip: "198.41.0.4", color: "#4facfe", glow: 0 },
      tld: { x: 0, y: 0, label: "TLD Server (.com)", ip: "192.5.6.30", color: "#ff9100", glow: 0 },
      auth: { x: 0, y: 0, label: "Authoritative NS", ip: "DNS Registry", color: "#00e676", glow: 0 },
      attacker: { x: 0, y: 0, label: "Poison Hijacker", ip: "Hijacked Cache", color: "#ff1744", glow: 0 }
    };

    this.packets = []; // Active floating UDP packets
    this.sparks = []; // Collision effects

    this.resize();
    window.addEventListener("resize", () => this.resize());
    
    // Start loop
    this.animate();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height || 350;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // Node layout positions based on canvas size
    this.nodes.client.x = w * 0.12;
    this.nodes.client.y = h * 0.5;

    this.nodes.resolver.x = w * 0.38;
    this.nodes.resolver.y = h * 0.5;

    this.nodes.root.x = w * 0.76;
    this.nodes.root.y = h * 0.2;

    this.nodes.tld.x = w * 0.76;
    this.nodes.tld.y = h * 0.5;

    this.nodes.auth.x = w * 0.76;
    this.nodes.auth.y = h * 0.8;

    this.nodes.attacker.x = w * 0.38;
    this.nodes.attacker.y = h * 0.82;
  }

  // Trigger a packet move from nodeA to nodeB
  sendPacket(fromName, toName, color, size = 6, label = "", callback = null) {
    const from = this.nodes[fromName];
    const to = this.nodes[toName];
    
    if (!from || !to) return;

    this.packets.push({
      x: from.x,
      y: from.y,
      startX: from.x,
      startY: from.y,
      endX: to.x,
      endY: to.y,
      fromName,
      toName,
      color,
      size,
      progress: 0,
      speed: 0.045, // progress multiplier
      label,
      callback
    });
  }

  // Trace the hops based on WebSocket telemetry pings
  handleHopEvent(data) {
    // data: { id, domain, type, hop, status, maliciousIp }
    const hopName = data.hop;
    const status = data.status;

    if (status === "hijacked") {
      // 1. Packet from client to resolver
      this.sendPacket("client", "resolver", "#00f2fe", 6, `${data.type} ${data.domain}`, () => {
        // Trigger resolver highlight
        this.nodes.resolver.glow = 1.0;
        
        // 2. Redirect packet immediately to attacker node
        this.sendPacket("resolver", "attacker", "#ff1744", 7, "SPOOFED!", () => {
          this.nodes.attacker.glow = 1.2;
          this.createSparks(this.nodes.attacker.x, this.nodes.attacker.y, "#ff1744");

          // 3. Return spoofed result back to client
          this.sendPacket("attacker", "client", "#ff1744", 7, `IP: ${data.maliciousIp}`);
        });
      });
      return;
    }

    if (status === "hit") {
      // Cache Hit: Client -> Resolver -> Client (quick green pulse)
      this.sendPacket("client", "resolver", "#00e676", 6, `${data.type} ${data.domain}`, () => {
        this.nodes.resolver.glow = 1.0;
        this.sendPacket("resolver", "client", "#00e676", 6, "CACHE HIT");
      });
      return;
    }

    // Recursive sequence hops triggers
    if (hopName === "Recursive Resolver") {
      this.sendPacket("client", "resolver", "#00f2fe", 6, `${data.type} ${data.domain}`, () => {
        this.nodes.resolver.glow = 1.0;
      });
    } else if (hopName === "Root Server (.)") {
      this.sendPacket("resolver", "root", "#4facfe", 5, "Root Search", () => {
        this.nodes.root.glow = 1.0;
        this.sendPacket("root", "resolver", "#4facfe", 4, "TLD Referral");
      });
    } else if (hopName === "TLD Name Server (.com)") {
      this.sendPacket("resolver", "tld", "#ff9100", 5, "TLD Search", () => {
        this.nodes.tld.glow = 1.0;
        this.sendPacket("tld", "resolver", "#ff9100", 4, "Auth Referral");
      });
    } else if (hopName === "Authoritative Server") {
      const isRecordFound = status !== "nxdomain";
      const packetColor = isRecordFound ? "#00e676" : "#ff1744";

      this.sendPacket("resolver", "auth", packetColor, 5, "Authoritative Search", () => {
        this.nodes.auth.glow = 1.0;
        this.createSparks(this.nodes.auth.x, this.nodes.auth.y, packetColor);

        this.sendPacket("auth", "resolver", packetColor, 5, isRecordFound ? "ANSWER" : "NXDOMAIN", () => {
          this.sendPacket("resolver", "client", packetColor, 6, isRecordFound ? "RESOLVED" : "NAME ERROR");
        });
      });
    }
  }

  createSparks(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color,
        decay: 0.03
      });
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.ctx.fillStyle = "rgba(6, 10, 18, 0.2)"; // trail effect
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Dotted connection links
    this.drawLinks();

    // 2. Draw Nodes
    this.drawNodes();

    // 3. Update & Draw packets
    this.updateAndDrawPackets();

    // 4. Update & Draw sparks
    this.updateAndDrawSparks();
  }

  drawLinks() {
    const ctx = this.ctx;
    const drawDotted = (n1, n2, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();
      ctx.setLineDash([]); // reset
    };

    // Connections: Client <-> Resolver
    drawDotted(this.nodes.client, this.nodes.resolver, "rgba(255, 255, 255, 0.1)");
    
    // Connections: Resolver <-> Root, TLD, Auth
    drawDotted(this.nodes.resolver, this.nodes.root, "rgba(79, 172, 254, 0.15)");
    drawDotted(this.nodes.resolver, this.nodes.tld, "rgba(255, 145, 0, 0.15)");
    drawDotted(this.nodes.resolver, this.nodes.auth, "rgba(0, 230, 118, 0.15)");
    
    // Connection: Resolver <-> Attacker
    drawDotted(this.nodes.resolver, this.nodes.attacker, "rgba(255, 23, 68, 0.15)");
  }

  drawNodes() {
    const ctx = this.ctx;
    
    Object.keys(this.nodes).forEach(key => {
      const n = this.nodes[key];
      
      // Decay glow
      if (n.glow > 0) n.glow -= 0.025;
      
      // Draw halo glow if active
      if (n.glow > 0) {
        ctx.shadowBlur = 12 + n.glow * 15;
        ctx.shadowColor = n.color;
      }
      
      ctx.fillStyle = n.color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      if (key === "attacker") {
        // Draw Attacker as a hexagon/alert shield
        this.drawShieldNode(n.x, n.y, 18);
      } else {
        ctx.arc(n.x, n.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.shadowBlur = 0; // reset

      // Labels
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px var(--font-title)";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y - 22);

      ctx.fillStyle = "var(--text-muted)";
      ctx.font = "8px var(--font-mono)";
      ctx.fillText(n.ip, n.x, n.y + 24);
    });
  }

  drawShieldNode(x, y, r) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255, 23, 68, 0.25)";
    ctx.strokeStyle = "#ff1744";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    
    // Draw hexagon
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const hx = x + Math.cos(angle) * r;
      const hy = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw internal warning symbol !
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px var(--font-body)";
    ctx.fillText("☠️", x, y + 3);
  }

  updateAndDrawPackets() {
    const ctx = this.ctx;
    
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.progress += p.speed;

      if (p.progress >= 1.0) {
        // Reached destination, execute callback and delete
        if (p.callback) p.callback();
        this.packets.splice(i, 1);
        continue;
      }

      // Linear interpolation (lerp)
      p.x = p.startX + (p.endX - p.startX) * p.progress;
      p.y = p.startY + (p.endY - p.startY) * p.progress;

      // Draw packet particle
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Render query label floating slightly above
      if (p.label) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "8px var(--font-mono)";
        ctx.textAlign = "center";
        ctx.fillText(p.label, p.x, p.y - 12);
      }
      ctx.restore();
    }
  }

  updateAndDrawSparks() {
    const ctx = this.ctx;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.alpha -= s.decay;

      if (s.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        this.sparks.splice(i, 1);
      }
    }
  }
}

window.DnsVisualizer = DnsVisualizer;
