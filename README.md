# DNS-Sandbox // UDP DNS Server & Recursive Resolver Playground

**DNS-Sandbox** is a lightweight, zero-dependency, full-stack UDP DNS Server, recursive resolver visualizer, and cache poisoning security simulator. 

Instead of traditional HTTP wrappers, this project operates at the transport layer, implementing raw **UDP socket networking (`dgram`)** and low-level binary protocol parsing. It runs a functional DNS server on port `8053` and hosts an interactive SRE observability dashboard on port `8060`.

---

## Technical Highlights

1. **UDP Packet Parser & Encoder (Port `8053`)**
   - Binds to a local UDP socket using Node's native `dgram` module.
   - Decodes standard incoming binary DNS query headers (Transaction ID, Flag masks, QDCOUNT) and extracts domain label sequences.
   - Encodes DNS answers natively into standardized binary payload answers (A, CNAME, MX, TXT) incorporating standard compression pointers (`0xc00c` pointing to the question domain).

2. **Recursive Lookup Tree Simulator**
   - Traces query hops dynamically when a record misses the local cache:
     `Client ➔ Recursive Resolver ➔ Root Name Server (.) ➔ TLD Name Server (.com) ➔ Authoritative Name Server`
   - Simulates internet lookup latency delays at each hop and pushes real-time status updates via WebSockets.

3. **DNS Cache Poisoning Hijacker**
   - Spoofs DNS caching maps: when spoofing is active, the resolver intercepts queries for targeted domains and replies with a custom malicious IP address.
   - Highlights safety warning paths and alert badges in the UI, demonstrating how security exploits redirect traffic.

4. **Interactive Dashboard (Port `8060`)**
   - **Visual Canvas**: Renders real-time vector connections and floating packet animations mapping the recursive routing paths.
   - **Zone Editor**: Add or remove authoritative zone records in the registry.
   - **Local Traffic Injector**: Triggers real local UDP queries from the browser loops to audit cache expirations and TTL counts.

---

## Directory Structure

```
dns-sandbox/
├── README.md               # SRE guides and UDP usage instructions
├── package.json            # Node.js configurations and dependencies
├── server.js               # Dual Server (Console on 8060, UDP DNS Server on 8053)
├── test.js                 # Low-level protocol binary unit tests
├── lib/
│   ├── DnsServer.js        # Packet parser, encoder, and query builder
│   ├── CacheManager.js     # Cache DB holding active TTL countdowns
│   ├── Registry.js         # Authoritative zone records registry
│   └── PoisonEngine.js     # Cache poisoning redirect exploit engine
└── public/
    ├── index.html          # Observability control portal
    ├── css/
    │   └── styles.css      # Cyber-glassmorphism styles
    └── js/
        ├── app.js          # Main dashboard coordinator
        ├── dns-visual.js   # Canvas packet path animator
        └── charts.js       # Live metrics accumulator
```

---

## Local Installation & Booting

### 1. Prerequisites
- **Node.js**: Version 18+ (tested on Node v20/v24).

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Unit Test Suite
Verify binary encoders/decoders and cache decay logic:
```bash
npm test
```

### 4. Start the DNS Server & SRE Panel
```bash
npm start
```

### 5. Access the Visual Console
Open your web browser and navigate to: **`http://localhost:8060/index.html`**

---

## Testing UDP Resolutions with Standard Tools

You can query your custom DNS server directly from your machine's command line using standard networking tools:

### Using `nslookup` (Windows / macOS / Linux)
```bash
nslookup -port=8053 google.com 127.0.0.1
```

### Using `dig` (macOS / Linux)
```bash
dig @127.0.0.1 -p 8053 google.com A
```

Observe how the CLI outputs the authoritative IP and the visual dashboard instantly highlights the packet flow client-to-resolver and counts the resolution latency!
