document.addEventListener('DOMContentLoaded', () => {
  // State variables
  let currentUnit = 'C'; // 'C' or 'F'
  let historyData = [];
  let currentReading = null;
  let socket = null;
  let liveChart = null;
  let analyticsChart = null;
  let activeChartRange = 20;

  // Camera stream variables
  let lastFrameTime = Date.now();
  let frameCount = 0;
  let currentFps = 0.0;

  // DOM Elements
  const connectionBadge = document.getElementById('connectionBadge');
  const connectionText = document.getElementById('connectionText');
  const unitCBtn = document.getElementById('unitCBtn');
  const unitFBtn = document.getElementById('unitFBtn');
  const currentTempDisplay = document.getElementById('currentTempDisplay');
  const currentUnitSymbol = document.getElementById('currentUnitSymbol');
  const tempStatusTag = document.getElementById('tempStatusTag');
  const lastUpdatedTime = document.getElementById('lastUpdatedTime');
  const wifiRssi = document.getElementById('wifiRssi');
  const thermometerLiquid = document.getElementById('thermometerLiquid');
  const thermometerBulb = document.getElementById('thermometerBulb');
  
  // Stat cards
  const statLatest = document.getElementById('statLatest');
  const statSensorId = document.getElementById('statSensorId');
  const statMin = document.getElementById('statMin');
  const statMinTime = document.getElementById('statMinTime');
  const statMax = document.getElementById('statMax');
  const statMaxTime = document.getElementById('statMaxTime');
  const statAvg = document.getElementById('statAvg');
  const statCount = document.getElementById('statCount');

  // Interactive controls
  const quickSimBtn = document.getElementById('quickSimBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const logsTableBody = document.getElementById('logsTableBody');
  const audioAlertToggle = document.getElementById('audioAlertToggle');
  const highTempAlertInput = document.getElementById('highTempAlert');
  const lowTempAlertInput = document.getElementById('lowTempAlert');

  // Camera elements
  const camStatusBadge = document.getElementById('camStatusBadge');
  const camStatusText = document.getElementById('camStatusText');
  const cameraStreamImg = document.getElementById('cameraStreamImg');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const camFpsBadge = document.getElementById('camFpsBadge');
  const camTimestampDisplay = document.getElementById('camTimestampDisplay');
  const takeSnapshotBtn = document.getElementById('takeSnapshotBtn');
  const cameraFullscreenBtn = document.getElementById('cameraFullscreenBtn');
  const simCameraFrameBtn = document.getElementById('simCameraFrameBtn');
  const videoPlayerContainer = document.getElementById('videoPlayerContainer');

  // Initialize Socket.io Connection
  initSocket();

  // Initialize Charts
  initLiveChart();
  initAnalyticsChart();

  // Initialize All Event Listeners safely
  setupNavigation();
  setupUnitToggle();
  setupSimulateButton();
  setupChartControls();
  setupLogActions();
  setupCodeCopy();
  setupCameraActions();

  // Audio Beep generator using Web Audio API
  function playBeep(freq = 880, duration = 0.2) {
    if (!audioAlertToggle || !audioAlertToggle.checked) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.log('Audio alert error:', e);
    }
  }

  function initSocket() {
    socket = io();

    socket.on('connect', () => {
      if (connectionBadge) connectionBadge.className = 'status-badge online';
      if (connectionText) connectionText.textContent = 'ESP32 Cloud Online';
    });

    socket.on('disconnect', () => {
      if (connectionBadge) connectionBadge.className = 'status-badge offline';
      if (connectionText) connectionText.textContent = 'Disconnected';
    });

    socket.on('init_data', (payload) => {
      if (payload && payload.history && payload.history.length > 0) {
        historyData = payload.history;
        currentReading = payload.latest || historyData[historyData.length - 1];
        updateUI();
      }
    });

    socket.on('new_reading', (reading) => {
      historyData.push(reading);
      currentReading = reading;
      
      // Check alerts
      const highThreshold = parseFloat(highTempAlertInput ? highTempAlertInput.value : 35) || 35;
      const lowThreshold = parseFloat(lowTempAlertInput ? lowTempAlertInput.value : 10) || 10;
      
      if (reading.temp_c >= highThreshold) {
        playBeep(1000, 0.4);
      } else if (reading.temp_c <= lowThreshold) {
        playBeep(440, 0.4);
      }

      updateUI();
    });

    socket.on('camera_frame', (payload) => {
      if (payload && payload.frame && cameraStreamImg) {
        cameraStreamImg.src = payload.frame;
        cameraStreamImg.style.display = 'block';
        if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';

        if (camStatusBadge) camStatusBadge.className = 'status-badge online';
        if (camStatusText) camStatusText.textContent = 'Camera Live Stream';

        const now = Date.now();
        frameCount++;
        if (now - lastFrameTime >= 1000) {
          currentFps = (frameCount * 1000 / (now - lastFrameTime)).toFixed(1);
          if (camFpsBadge) camFpsBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> ${currentFps} FPS`;
          frameCount = 0;
          lastFrameTime = now;
        }

        const dateStr = new Date(payload.timestamp).toLocaleTimeString();
        if (camTimestampDisplay) camTimestampDisplay.innerHTML = `<i class="fa-solid fa-clock"></i> Last frame: ${dateStr}`;
      }
    });

    socket.on('history_cleared', () => {
      historyData = [];
      currentReading = null;
      updateUI();
    });
  }

  function formatTemp(valC, valF) {
    if (valC === undefined || valC === null) return '--.-';
    return currentUnit === 'C' ? valC.toFixed(1) : valF.toFixed(1);
  }

  function updateUI() {
    if (!currentReading) {
      if (currentTempDisplay) currentTempDisplay.textContent = '--.-';
      if (statLatest) statLatest.textContent = '--.-';
      if (statMin) statMin.textContent = '--.-';
      if (statMax) statMax.textContent = '--.-';
      if (statAvg) statAvg.textContent = '--.-';
      return;
    }

    // 1. Temperature Display & Units
    const valC = currentReading.temp_c;
    const valF = currentReading.temp_f;
    const formattedVal = formatTemp(valC, valF);
    
    if (currentTempDisplay) currentTempDisplay.textContent = formattedVal;
    if (currentUnitSymbol) currentUnitSymbol.textContent = `°${currentUnit}`;
    if (statLatest) statLatest.textContent = `${formattedVal} °${currentUnit}`;
    if (statSensorId) statSensorId.textContent = `Sensor: ${currentReading.sensor_id}`;

    // 2. Last Updated Timestamp
    const date = new Date(currentReading.timestamp);
    if (lastUpdatedTime) lastUpdatedTime.textContent = date.toLocaleTimeString();

    // 3. RSSI
    if (wifiRssi) wifiRssi.textContent = currentReading.wifi_rssi ? currentReading.wifi_rssi : 'N/A';

    // 4. Thermometer Visual Liquid Gauge
    const minTempGauge = 0;
    const maxTempGauge = 60;
    let percentage = ((valC - minTempGauge) / (maxTempGauge - minTempGauge)) * 100;
    percentage = Math.max(5, Math.min(95, percentage));
    if (thermometerLiquid) thermometerLiquid.style.height = `${percentage}%`;

    // 5. Gauge Color and Status Tag
    let statusText = 'Normal';
    let statusColor = 'var(--temp-normal)';
    let statusBg = 'rgba(52, 211, 153, 0.15)';
    let statusBorder = 'rgba(52, 211, 153, 0.3)';

    if (valC < 15) {
      statusText = 'Cold / Freezing';
      statusColor = 'var(--temp-cold)';
      statusBg = 'rgba(56, 189, 248, 0.15)';
      statusBorder = 'rgba(56, 189, 248, 0.3)';
    } else if (valC >= 15 && valC <= 30) {
      statusText = 'Optimal Room Range';
      statusColor = 'var(--temp-normal)';
      statusBg = 'rgba(52, 211, 153, 0.15)';
      statusBorder = 'rgba(52, 211, 153, 0.3)';
    } else if (valC > 30 && valC <= 38) {
      statusText = 'Warm Temperature';
      statusColor = 'var(--temp-warm)';
      statusBg = 'rgba(251, 191, 36, 0.15)';
      statusBorder = 'rgba(251, 191, 36, 0.3)';
    } else {
      statusText = '🔥 High Warning Alert!';
      statusColor = 'var(--temp-hot)';
      statusBg = 'rgba(248, 113, 113, 0.15)';
      statusBorder = 'rgba(248, 113, 113, 0.3)';
    }

    if (tempStatusTag) {
      tempStatusTag.textContent = statusText;
      tempStatusTag.style.color = statusColor;
      tempStatusTag.style.backgroundColor = statusBg;
      tempStatusTag.style.borderColor = statusBorder;
    }
    
    if (thermometerLiquid) thermometerLiquid.style.background = statusColor;
    if (thermometerBulb) {
      thermometerBulb.style.background = statusColor;
      thermometerBulb.style.boxShadow = `0 0 20px ${statusColor}`;
    }

    // 6. Stats Summary
    if (historyData.length > 0) {
      const tempArray = historyData.map(r => currentUnit === 'C' ? r.temp_c : r.temp_f);
      const minVal = Math.min(...tempArray);
      const maxVal = Math.max(...tempArray);
      const avgVal = tempArray.reduce((a, b) => a + b, 0) / tempArray.length;

      const minObj = historyData[tempArray.indexOf(minVal)];
      const maxObj = historyData[tempArray.indexOf(maxVal)];

      if (statMin) statMin.textContent = `${minVal.toFixed(1)} °${currentUnit}`;
      if (statMinTime) statMinTime.textContent = new Date(minObj.timestamp).toLocaleTimeString();

      if (statMax) statMax.textContent = `${maxVal.toFixed(1)} °${currentUnit}`;
      if (statMaxTime) statMaxTime.textContent = new Date(maxObj.timestamp).toLocaleTimeString();

      if (statAvg) statAvg.textContent = `${avgVal.toFixed(1)} °${currentUnit}`;
      if (statCount) statCount.textContent = `Based on ${historyData.length} readings`;
    }

    // 7. Update Charts & Logs
    updateLiveChart();
    updateAnalyticsChart();
    renderLogsTable();
  }

  function initLiveChart() {
    const chartElem = document.getElementById('liveChart');
    if (!chartElem) return;
    const ctx = chartElem.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    liveChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: `Temperature (°${currentUnit})`,
          data: [],
          borderColor: '#38bdf8',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#38bdf8',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function updateLiveChart() {
    if (!liveChart) return;
    const slice = historyData.slice(-activeChartRange);
    
    liveChart.data.labels = slice.map(r => new Date(r.timestamp).toLocaleTimeString());
    liveChart.data.datasets[0].label = `Temperature (°${currentUnit})`;
    liveChart.data.datasets[0].data = slice.map(r => currentUnit === 'C' ? r.temp_c : r.temp_f);
    liveChart.update();
  }

  function initAnalyticsChart() {
    const chartElem = document.getElementById('analyticsChart');
    if (!chartElem) return;
    const ctx = chartElem.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, 'rgba(192, 132, 252, 0.4)');
    gradient.addColorStop(1, 'rgba(192, 132, 252, 0.0)');

    analyticsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: `Historical Stream (°${currentUnit})`,
          data: [],
          borderColor: '#c084fc',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.25,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
          }
        },
        plugins: {
          legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit' } } }
        }
      }
    });
  }

  function updateAnalyticsChart() {
    if (!analyticsChart) return;
    analyticsChart.data.labels = historyData.map(r => new Date(r.timestamp).toLocaleTimeString());
    analyticsChart.data.datasets[0].label = `Historical Temperature (°${currentUnit})`;
    analyticsChart.data.datasets[0].data = historyData.map(r => currentUnit === 'C' ? r.temp_c : r.temp_f);
    analyticsChart.update();
  }

  function renderLogsTable() {
    if (!logsTableBody) return;
    if (historyData.length === 0) {
      logsTableBody.innerHTML = `<tr><td colspan="6" class="text-center">No temperature data recorded yet.</td></tr>`;
      return;
    }

    const recentLogs = [...historyData].reverse().slice(0, 50);
    logsTableBody.innerHTML = recentLogs.map(item => {
      const dateStr = new Date(item.timestamp).toLocaleString();
      const statusClass = item.temp_c > 35 ? 'color: var(--danger)' : item.temp_c < 10 ? 'color: var(--primary)' : 'color: var(--success)';
      const statusText = item.temp_c > 35 ? 'HIGH ALERT' : item.temp_c < 10 ? 'COLD' : 'NORMAL';

      return `
        <tr>
          <td>${dateStr}</td>
          <td><code>${item.sensor_id}</code></td>
          <td><strong>${item.temp_c.toFixed(2)} °C</strong></td>
          <td>${item.temp_f.toFixed(2)} °F</td>
          <td>${item.wifi_rssi ? item.wifi_rssi + ' dBm' : 'N/A'}</td>
          <td style="${statusClass}; font-weight: bold;">${statusText}</td>
        </tr>
      `;
    }).join('');
  }

  function setupNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetId = `tab-${tab.dataset.tab}`;
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');

        if (tab.dataset.tab === 'analytics' && analyticsChart) {
          setTimeout(() => analyticsChart.resize(), 100);
        }
      });
    });
  }

  function setupUnitToggle() {
    if (unitCBtn) {
      unitCBtn.addEventListener('click', () => {
        if (currentUnit === 'C') return;
        currentUnit = 'C';
        unitCBtn.classList.add('active');
        if (unitFBtn) unitFBtn.classList.remove('active');
        updateUI();
      });
    }

    if (unitFBtn) {
      unitFBtn.addEventListener('click', () => {
        if (currentUnit === 'F') return;
        currentUnit = 'F';
        unitFBtn.classList.add('active');
        if (unitCBtn) unitCBtn.classList.remove('active');
        updateUI();
      });
    }
  }

  function setupSimulateButton() {
    if (quickSimBtn) {
      quickSimBtn.addEventListener('click', async () => {
        try {
          quickSimBtn.disabled = true;
          quickSimBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
          
          await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseTemp: 26.0 })
          });
        } catch (err) {
          console.error('Simulation error:', err);
        } finally {
          setTimeout(() => {
            quickSimBtn.disabled = false;
            quickSimBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Push Test Reading`;
          }, 500);
        }
      });
    }
  }

  function setupChartControls() {
    const rangeBtns = document.querySelectorAll('.chart-actions button');
    rangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        rangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeChartRange = parseInt(btn.dataset.range);
        updateLiveChart();
      });
    });

    if (refreshAnalyticsBtn) {
      refreshAnalyticsBtn.addEventListener('click', () => {
        updateAnalyticsChart();
      });
    }
  }

  function setupLogActions() {
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        if (historyData.length === 0) {
          alert('No sensor data to export!');
          return;
        }
        
        let csvContent = 'data:text/csv;charset=utf-8,ID,Timestamp,SensorID,Temp_C,Temp_F,WiFi_RSSI\n';
        historyData.forEach(row => {
          csvContent += `${row.id},"${row.timestamp}",${row.sensor_id},${row.temp_c},${row.temp_f},${row.wifi_rssi || ''}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `esp32_temperature_logs_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all temperature history logs?')) {
          await fetch('/api/temperature/history', { method: 'DELETE' });
        }
      });
    }
  }

  function setupCodeCopy() {
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        const codeBlock = document.getElementById('espCodeBlock');
        if (!codeBlock) return;
        const code = codeBlock.textContent;
        navigator.clipboard.writeText(code).then(() => {
          copyCodeBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
          setTimeout(() => {
            copyCodeBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copy Sketch`;
          }, 2000);
        });
      });
    }

    // Code selector dropdown or tab switch if available
    const codeSelectBtnTemp = document.getElementById('codeSelectTemp');
    const codeSelectBtnCam = document.getElementById('codeSelectCam');
    const espCodeBlock = document.getElementById('espCodeBlock');

    if (codeSelectBtnTemp && codeSelectBtnCam && espCodeBlock) {
      codeSelectBtnTemp.addEventListener('click', () => {
        codeSelectBtnTemp.classList.add('active');
        codeSelectBtnCam.classList.remove('active');
        espCodeBlock.textContent = `/* ESP32 Temperature Sensor Code */
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://astra26.onrender.com/api/temperature";

#define ONE_WIRE_BUS 4

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  sensors.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  if (tempC != DEVICE_DISCONNECTED_C && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    String json = "{\"temperature\":" + String(tempC, 2) + "}";
    http.POST(json);
    http.end();
  }
  delay(10000);
}`;
      });

      codeSelectBtnCam.addEventListener('click', () => {
        codeSelectBtnCam.classList.add('active');
        codeSelectBtnTemp.classList.remove('active');
        espCodeBlock.textContent = `/* ESP32-CAM Ultra-Stable Live Stream (QVGA 320x240) */
#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://astra26.onrender.com/api/camera/frame";

void setup() {
  Serial.begin(115200);
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5; config.pin_d1 = 18; config.pin_d2 = 19; config.pin_d3 = 21;
  config.pin_d4 = 36; config.pin_d5 = 39; config.pin_d6 = 34; config.pin_d7 = 35;
  config.pin_xclk = 0; config.pin_pclk = 22; config.pin_vsync = 25; config.pin_href = 23;
  config.pin_sscb_sda = 26; config.pin_sscb_scl = 27; config.pin_pwdn = 32; config.pin_reset = -1;
  config.xclk_freq_hz = 20000000; config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA; config.jpeg_quality = 14; config.fb_count = 1;

  esp_camera_init(&config);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (fb) {
      HTTPClient http;
      http.begin(SERVER_URL);
      http.setReuse(false);
      http.setTimeout(5000);
      http.addHeader("Content-Type", "image/jpeg");
      http.POST(fb->buf, fb->len);
      http.end();
      esp_camera_fb_return(fb);
    }
  }
  delay(800); // Stable stream delay
}`;
      });


    }
  }

  function setupCameraActions() {
    if (takeSnapshotBtn) {
      takeSnapshotBtn.addEventListener('click', () => {
        if (!cameraStreamImg || !cameraStreamImg.src || cameraStreamImg.style.display === 'none') {
          alert('No live camera stream active to take a snapshot!');
          return;
        }
        const link = document.createElement('a');
        link.download = `esp32_cam_snapshot_${Date.now()}.jpg`;
        link.href = cameraStreamImg.src;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    if (cameraFullscreenBtn && videoPlayerContainer) {
      cameraFullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          videoPlayerContainer.requestFullscreen().catch(err => {
            alert(`Error attempting to enable fullscreen: ${err.message}`);
          });
        } else {
          document.exitFullscreen();
        }
      });
    }

    if (simCameraFrameBtn) {
      simCameraFrameBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, 640, 480);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 640; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke();
        }
        for (let y = 0; y < 480; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
        }

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(320, 240, 60, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(320, 240, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f3f4f6';
        ctx.font = 'bold 22px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESP32-CAM SIMULATED FRAME', 320, 180);

        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px JetBrains Mono, monospace';
        ctx.fillText(`TIMESTAMP: ${new Date().toLocaleTimeString()}`, 320, 320);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        fetch('/api/camera/frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame: dataUrl, sensor_id: 'ESP32_CAM_SIMULATED' })
        }).catch(err => console.error('Sim camera error:', err));
      });
    }
  }
});
