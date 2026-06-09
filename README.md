# RateLimiter-Shield // API Gateway Proxy & SRE Traffic Guard

**RateLimiter-Shield** is a developer-centric, high-fidelity API Gateway Reverse Proxy and SRE telemetry dashboard. It listens on port `8095` to intercept incoming HTTP connections, applies real-time rate limiting algorithms and security firewall logic, and safely proxies allowed requests to upstream backends.

An interactive dashboard runs on port `8090`, showing real-time HTML5 Canvas particle physics, Chart.js deflection rates, security registries, and live traffic audit logs.

---

## Key Architectural Features

1. **Proxy Interception Engine (Port `8095`)**
   - Intercepts raw HTTP connections.
   - Reads client IPs (supporting proxy `x-forwarded-for` chains) and headers (`x-api-key`).
   - Evaluates rules and routes traffic or returns structured client error responses (`HTTP 429 Too Many Requests`, `HTTP 401 Unauthorized`, `HTTP 403 Forbidden`).

2. **Core Algorithmic Suite**
   - **Token Bucket**: Requests consume tokens from an in-memory bucket that refills at a dynamic rate based on time delta. Best for allowing brief burst traffic while capping long-term usage.
   - **Leaky Bucket**: Requests are queued in a FIFO array and processed (leaked) to upstream servers at a steady, regulated pace. Smooths out traffic spikes.
   - **Sliding Window Log**: Evaluates a log of timestamps per client IP, dropping requests if the log count within the sliding time frame exceeds constraints. Highly precise.

3. **Multi-Layer Security Shield**
   - **API Key Validator**: Enforces client credentials check. Supports dynamic adding and removing of active keys.
   - **IP Blacklist Filter**: Automatically drops incoming connections originating from blacklisted client IPs.

4. **High-Fidelity Telemetry Console**
   - **Canvas Particle Visualizer**: Renders request packets falling and either consuming golden tokens, entering the leaky bucket funnel queue, or bouncing off active red firewall barriers.
   - **Live charts**: Plots real-time request counts and deflection velocity (RPS).
   - **Proxy Audits**: Details live requests headers, outcome, reason, and proxy latency in milliseconds.

---

## Directory Structure

```
ratelimiter-shield/
├── README.md               # SRE System architecture and guides
├── package.json            # Node.js configurations and dependencies
├── server.js               # Dual-server hub (Dashboard on 8090, Gateway on 8095)
├── test.js                 # Algorithmic validation suite
├── lib/
│   ├── TokenBucket.js      # Dynamic time-delta Token Bucket rate limiter
│   ├── LeakyBucket.js      # FIFO queue Leaky Bucket traffic shaper
│   ├── SlidingWindow.js    # Sliding window timestamps log evaluator
│   └── SecurityGuard.js    # IP Blacklist and API Key registry validator
├── public/
│   ├── index.html          # Dash portal
│   ├── css/
│   │   └── styles.css      # Neon cyberglass theme stylesheet
│   └── js/
│       ├── app.js          # Controller app and simulator triggers
│       ├── canvas-limit.js # Physics animations on HTML5 Canvas
│       └── charts.js       # Chart.js deflection velocity plotting
└── render.yaml             # Render Blueprint configuration
```

---

## Local Setup & Quick Start

### 1. Prerequisites
- **Node.js**: Version 18+ (tested on Node v20/v24).

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Algorithmic Unit Tests
Run the built-in, zero-dependency validation suite:
```bash
npm test
```

### 4. Boot the Gateway and Dashboard
```bash
npm start
```

### 5. Access the Panels
- **SRE Dashboard Console**: Open `http://localhost:8090` in your web browser.
- **API Gateway Inbound Endpoint**: Route client requests to `http://localhost:8095/`.

---

## Cloud Deployment

Deploy **RateLimiter-Shield** instantly on **Render's Free Tier** using the included Blueprint:

1. Push this folder to your GitHub repository.
2. In your Render Dashboard, click **New +** > **Blueprint**.
3. Select your repository. Render will automatically parse the `render.yaml` and configure a Dockerized web service exposing the SRE control center.
4. Set the environment variables:
   - `PORT`: `8090` (Dashboard interface)
   - `GATEWAY_PORT`: `8095` (Gateway backend port)
