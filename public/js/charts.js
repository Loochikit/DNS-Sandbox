/**
 * charts.js
 * Configures and updates Chart.js instances for SRE deflection telemetry.
 * Renders rolling Requests Per Second (RPS) metrics (Allowed vs Blocked).
 */

class TelemetryCharts {
  constructor() {
    this.chart = null;
    this.allowedBuffer = 0;
    this.blockedBuffer = 0;
    
    // Holds last 12 ticks (seconds) of data
    this.labels = Array(12).fill("");
    this.allowedHistory = Array(12).fill(0);
    this.blockedHistory = Array(12).fill(0);
    
    this.initChart();
    this.startTick();
  }

  initChart() {
    const ctx = document.getElementById("chartTrafficSummary").getContext("2d");
    
    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: this.labels,
        datasets: [
          {
            label: "Allowed (RPS)",
            data: this.allowedHistory,
            borderColor: "#00e676",
            backgroundColor: "rgba(0, 230, 118, 0.05)",
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: "Shield Blocked (RPS)",
            data: this.blockedHistory,
            borderColor: "#ff1744",
            backgroundColor: "rgba(255, 23, 68, 0.05)",
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: "#8492a6",
              font: { size: 9, family: 'var(--font-body)' },
              boxWidth: 8,
              boxHeight: 8,
              padding: 6
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#8492a6", font: { size: 8 } }
          },
          y: {
            min: 0,
            suggestedMax: 5,
            grid: { color: "rgba(255, 255, 255, 0.03)" },
            ticks: { color: "#8492a6", font: { size: 8 }, stepSize: 1 }
          }
        }
      }
    });
  }

  recordRequest(allowed) {
    if (allowed) {
      this.allowedBuffer++;
    } else {
      this.blockedBuffer++;
    }
  }

  startTick() {
    setInterval(() => {
      // Push buffer to history and rotate
      this.allowedHistory.shift();
      this.allowedHistory.push(this.allowedBuffer);

      this.blockedHistory.shift();
      this.blockedHistory.push(this.blockedBuffer);

      const now = new Date();
      const timeLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      this.labels.shift();
      this.labels.push(timeLabel);

      // Reset buffers
      this.allowedBuffer = 0;
      this.blockedBuffer = 0;

      // Update Chart
      if (this.chart) {
        this.chart.update("none"); // "none" skips animation for smooth rendering
      }
    }, 1000);
  }

  clear() {
    this.allowedHistory.fill(0);
    this.blockedHistory.fill(0);
    this.allowedBuffer = 0;
    this.blockedBuffer = 0;
    if (this.chart) {
      this.chart.update();
    }
  }
}

window.TelemetryCharts = TelemetryCharts;
