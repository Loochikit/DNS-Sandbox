/**
 * canvas-limit.js
 * HTML5 Canvas Physics Renderer for Rate Limiting visual structures:
 * - Token Bucket (filling cylinder, golden refill drops, requests consuming tokens or bouncing off barrier)
 * - Leaky Bucket (funnel queue stack, steady drops leaking from bottom, bounce off if full)
 * - Sliding Window Log (timestamps orbiting a core, expiring and fading out)
 */

class RateLimitVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    
    this.algorithm = "token-bucket";
    this.state = {
      tokens: 10,
      capacity: 10,
      refillRate: 2,
      queueLength: 0,
      leakRate: 1,
      count: 0,
      limit: 10,
      windowSize: 10
    };

    this.particles = []; // Inbound request packet particles
    this.refillParticles = []; // Token bucket refill drops
    this.sparks = []; // Collisions sparks
    this.leakedDrops = []; // Leaky bucket leaked drops
    
    // For sliding window visual timestamps
    this.orbitNodes = []; 

    this.resize();
    window.addEventListener("resize", () => this.resize());
    
    // Start animation loop
    this.animate();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height || 350;
  }

  setAlgorithm(algo) {
    this.algorithm = algo;
    this.particles = [];
    this.sparks = [];
    this.leakedDrops = [];
    this.orbitNodes = [];
  }

  updateState(newState) {
    this.state = { ...this.state, ...newState };
  }

  // Called when a new request comes in
  triggerRequest(allowed, reason) {
    const width = this.canvas.width;
    const startX = Math.random() * (width - 80) + 40;
    const targetX = width / 2;
    
    let targetY = this.canvas.height * 0.5; // default barrier line
    if (this.algorithm === "token-bucket") {
      targetY = this.canvas.height * 0.55;
    } else if (this.algorithm === "leaky-bucket") {
      targetY = this.canvas.height * 0.35; // Funnel top inlet
    } else if (this.algorithm === "sliding-window") {
      targetY = this.canvas.height * 0.45;
    }

    this.particles.push({
      x: startX,
      y: 0,
      targetX,
      targetY,
      speed: 3.5,
      size: 6,
      allowed: !!allowed,
      reason: reason || "SUCCESS",
      stage: "falling", // 'falling' | 'bouncing' | 'passing'
      vx: 0,
      vy: 0,
      alpha: 1,
      color: allowed ? "#00e676" : "#ff1744"
    });
  }

  // Called when leaky bucket ticks a leak
  triggerLeak() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Spawn drop from bottom of funnel
    this.leakedDrops.push({
      x: width / 2,
      y: height * 0.65,
      vy: 2.5,
      alpha: 1,
      size: 5,
      color: "#00e676"
    });
  }

  createSparks(x, y, color) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1.5;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color: color || "#ff1744",
        decay: Math.random() * 0.03 + 0.015
      });
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.ctx.fillStyle = "rgba(6, 10, 18, 0.25)"; // slight trail
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Grid in background
    this.drawBackgroundGrid();

    // 2. Algorithm Specific Container Rendering
    if (this.algorithm === "token-bucket") {
      this.drawTokenBucket();
    } else if (this.algorithm === "leaky-bucket") {
      this.drawLeakyBucket();
    } else if (this.algorithm === "sliding-window") {
      this.drawSlidingWindow();
    }

    // 3. Update & Draw Particles
    this.updateAndDrawParticles();

    // 4. Update & Draw Sparks
    this.updateAndDrawSparks();
  }

  drawBackgroundGrid() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    const gridSize = 25;
    
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // --- TOKEN BUCKET VISUALS ---
  drawTokenBucket() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    const bx = width / 2;
    const by = height * 0.7;
    const bWidth = 100;
    const bHeight = 70;
    
    // Draw Refill Golden Drips matching refill rate
    if (Math.random() < this.state.refillRate * 0.02) {
      this.refillParticles.push({
        x: bx + (Math.random() - 0.5) * (bWidth - 10),
        y: 10,
        vy: 3,
        color: "#ffd600"
      });
    }

    // Update and draw refill drops
    ctx.fillStyle = "#ffd600";
    for (let i = this.refillParticles.length - 1; i >= 0; i--) {
      const p = this.refillParticles[i];
      p.y += p.vy;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // check if hit bucket
      if (p.y >= by - bHeight) {
        this.refillParticles.splice(i, 1);
        // creates a golden ripple
      }
    }

    // Draw Forcefield line (red/green barrier based on capacity status)
    const activeTokens = this.state.tokens;
    const barrierColor = activeTokens > 0 ? "rgba(0, 242, 254, 0.3)" : "rgba(255, 23, 68, 0.6)";
    
    ctx.strokeStyle = barrierColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = activeTokens > 0 ? 10 : 20;
    ctx.shadowColor = activeTokens > 0 ? "#00f2fe" : "#ff1744";
    ctx.beginPath();
    ctx.moveTo(bx - 120, by - bHeight - 15);
    ctx.lineTo(bx + 120, by - bHeight - 15);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // Draw Glass Bucket Cylinder
    ctx.strokeStyle = "rgba(0, 242, 254, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    // left side
    ctx.moveTo(bx - bWidth/2, by - bHeight);
    ctx.lineTo(bx - bWidth/2, by);
    // bottom curve
    ctx.quadraticCurveTo(bx, by + 12, bx + bWidth/2, by);
    // right side
    ctx.lineTo(bx + bWidth/2, by - bHeight);
    ctx.stroke();
    
    // Draw top lip curve
    ctx.beginPath();
    ctx.ellipse(bx, by - bHeight, bWidth/2, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw gold tokens stacking up inside
    const cap = this.state.capacity;
    const tokens = this.state.tokens;
    
    ctx.fillStyle = "rgba(255, 214, 0, 0.75)";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#ffd600";
    
    // Draw stacked tokens inside cylinder
    for (let i = 0; i < Math.floor(tokens); i++) {
      // Stack mathematical positioning
      const row = Math.floor(i / 4);
      const col = i % 4;
      const tx = bx - bWidth/3 + col * (bWidth / 5.5) + (row % 2 * 5);
      const ty = by - 12 - row * 10;
      
      ctx.beginPath();
      ctx.ellipse(tx, ty, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw fractional token as small pulse
    const fraction = tokens % 1;
    if (fraction > 0.1 && tokens < cap) {
      const row = Math.floor(tokens / 4);
      const col = Math.floor(tokens) % 4;
      const tx = bx - bWidth/3 + col * (bWidth / 5.5) + (row % 2 * 5);
      const ty = by - 12 - row * 10;
      
      ctx.fillStyle = `rgba(255, 214, 0, ${fraction})`;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 8 * fraction, 3 * fraction, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0; // reset
  }

  // --- LEAKY BUCKET VISUALS ---
  drawLeakyBucket() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    const bx = width / 2;
    const by = height * 0.45;
    
    // Draw Funnel Outline
    ctx.strokeStyle = "rgba(79, 172, 254, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Top funnel width
    ctx.moveTo(bx - 75, by);
    ctx.lineTo(bx + 75, by);
    ctx.stroke();

    ctx.beginPath();
    // Left slope
    ctx.moveTo(bx - 75, by);
    ctx.lineTo(bx - 12, by + 60);
    // Neck
    ctx.lineTo(bx - 12, by + 85);
    // Neck opening
    ctx.moveTo(bx + 12, by + 85);
    ctx.lineTo(bx + 12, by + 60);
    // Right slope
    ctx.lineTo(bx + 75, by);
    ctx.stroke();

    // Red forcefield barrier for leaky bucket (above the funnel)
    const isFull = this.state.queueLength >= this.state.capacity;
    const barrierColor = isFull ? "rgba(255, 23, 68, 0.6)" : "rgba(0, 242, 254, 0.25)";
    
    ctx.strokeStyle = barrierColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 110, by - 15);
    ctx.lineTo(bx + 110, by - 15);
    ctx.stroke();

    // Draw enqueued requests inside funnel
    const qLen = this.state.queueLength;
    ctx.fillStyle = "rgba(0, 230, 118, 0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#00e676";
    
    for (let i = 0; i < qLen; i++) {
      // Draw stacked requests circles starting from neck going upwards
      let sx = bx;
      let sy = by + 50 - i * 14;
      if (i > 3) {
        // distribute horizontally in funnel upper part
        const offset = (i % 2 === 0 ? 1 : -1) * 16;
        sx = bx + offset;
        sy = by + 30 - Math.floor(i / 2) * 12;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Draw leaked drops falling down to SRE backend target
    ctx.fillStyle = "#00e676";
    for (let i = this.leakedDrops.length - 1; i >= 0; i--) {
      const d = this.leakedDrops[i];
      d.y += d.vy;
      
      // Draw standard drip drop shape
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - d.size);
      ctx.quadraticCurveTo(d.x + d.size, d.y, d.x, d.y + d.size);
      ctx.quadraticCurveTo(d.x - d.size, d.y, d.x, d.y - d.size);
      ctx.fill();

      // Remove off-canvas drops
      if (d.y > height + 20) {
        this.leakedDrops.splice(i, 1);
      }
    }
  }

  // --- SLIDING WINDOW LOG VISUALS ---
  drawSlidingWindow() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    const bx = width / 2;
    const by = height * 0.5;
    const radius = 60;

    // Draw Central core gateway node
    ctx.shadowBlur = 15;
    const blockState = this.state.count >= this.state.limit;
    ctx.shadowColor = blockState ? "#ff1744" : "#00f2fe";
    ctx.fillStyle = blockState ? "rgba(255, 23, 68, 0.15)" : "rgba(0, 242, 254, 0.1)";
    ctx.strokeStyle = blockState ? "var(--accent-red)" : "var(--accent-cyan)";
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.arc(bx, by, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.shadowBlur = 0;

    // Draw text inside core
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px var(--font-mono)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${this.state.count}/${this.state.limit}`, bx, by - 3);
    
    ctx.font = "8px var(--font-body)";
    ctx.fillStyle = "var(--text-muted)";
    ctx.fillText("REQUESTS", bx, by + 10);

    // Draw sliding window ring path
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Red forcefield line
    ctx.strokeStyle = blockState ? "rgba(255, 23, 68, 0.6)" : "rgba(0, 242, 254, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, by, radius + 25, 0, Math.PI * 2);
    ctx.stroke();

    // Update active timestamps logs orbiting the ring
    const limit = this.state.limit;
    const count = this.state.count;
    
    // Add temporary visual nodes to orbit if count increases
    if (this.orbitNodes.length < count) {
      // add nodes
      const missing = count - this.orbitNodes.length;
      for (let i = 0; i < missing; i++) {
        this.orbitNodes.push({
          angle: Math.random() * Math.PI * 2,
          speed: 0.015 + Math.random() * 0.01,
          size: 5,
          color: "#00e676",
          life: 1.0 // will decay/expire
        });
      }
    } else if (this.orbitNodes.length > count) {
      // trigger decay of extras rather than delete immediately for smooth animation
      this.orbitNodes.forEach((node, idx) => {
        if (idx >= count) node.decaying = true;
      });
    }

    // Draw orbit nodes
    for (let i = this.orbitNodes.length - 1; i >= 0; i--) {
      const node = this.orbitNodes[i];
      node.angle += node.speed;
      
      if (node.decaying) {
        node.life -= 0.05;
        node.color = "#ff9100";
        if (node.life <= 0) {
          this.orbitNodes.splice(i, 1);
          continue;
        }
      }

      const nx = bx + Math.cos(node.angle) * radius;
      const ny = by + Math.sin(node.angle) * radius;

      ctx.fillStyle = node.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = node.color;
      ctx.globalAlpha = node.life;
      ctx.beginPath();
      ctx.arc(nx, ny, node.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    }
  }

  // --- PARTICLES & COLLISION UPDATES ---
  updateAndDrawParticles() {
    const ctx = this.ctx;
    const height = this.canvas.height;
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (p.stage === "falling") {
        // Path calculation towards proxy gateway center bottleneck
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 5) {
          // Reached the barrier node! Resolve allowed status
          if (p.allowed) {
            p.stage = "passing";
            // Reduce token count visually for immediate feedback
            if (this.algorithm === "token-bucket") {
              this.state.tokens = Math.max(0, this.state.tokens - 1);
            }
          } else {
            p.stage = "bouncing";
            // Sparks explosion
            this.createSparks(p.x, p.y, p.color);
            // set bounce velocity
            p.vx = (Math.random() - 0.5) * 5;
            p.vy = -Math.random() * 3 - 2;
          }
        } else {
          // move towards target bottleneck
          p.x += (dx / distance) * p.speed;
          p.y += (dy / distance) * p.speed;
        }
      } else if (p.stage === "bouncing") {
        // Bounce upwards and fade
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.alpha -= 0.02;
      } else if (p.stage === "passing") {
        // Continue down towards backend
        p.y += p.speed * 1.25;
        // visual morph towards center exit
        const cX = this.canvas.width / 2;
        p.x += (cX - p.x) * 0.1;

        if (p.y > height + 20) {
          p.alpha = 0; // ready for garbage clean
        }
      }

      // Render request packet particle
      if (p.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add label indicator (HTTP Code)
        if (p.stage !== "falling") {
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 8px var(--font-mono)";
          ctx.textAlign = "center";
          
          let codeText = "200";
          if (!p.allowed) {
            codeText = p.reason === "IP_BLACKLISTED" ? "403" : 
                       (p.reason.includes("API_KEY") ? "401" : "429");
          }
          ctx.fillText(codeText, p.x, p.y - 10);
        }
        
        ctx.restore();
      } else {
        this.particles.splice(i, 1);
      }
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

// Global scope registration so app.js can access it
window.RateLimitVisualizer = RateLimitVisualizer;
