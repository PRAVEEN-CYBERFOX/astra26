document.addEventListener('DOMContentLoaded', () => {
  // State variables
  let currentUnit = 'C'; // 'C' or 'F'
  let historyData = [];
  let currentReading = null;
  let socket = null;
  let liveChart = null;
  let analyticsChart = null;
  let activeChartRange = 20;

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

  // Initialize Socket.io Connection
  initSocket();

  // Initialize Charts
  initLiveChart();
  initAnalyticsChart();

  // Event Listeners
  setupNavigation();
  setupUnitToggle();
  setupSimulateButton();
  setupChartControls();
  setupLogActions();
  setupCodeCopy();

  // Audio Beep generator using Web Audio API
  function playBeep(freq = 880, duration = 0.2) {
    if (!audioAlertToggle.checked) return;
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
      connectionBadge.className = 'status-badge online';
      connectionText.textContent = 'ESP32 Cloud Online';
    });

    socket.on('disconnect', () => {
      connectionBadge.className = 'status-badge offline';
      connectionText.textContent = 'Disconnected';
    });

    socket.on('init_data', (payload) => {
      if (payload.history && payload.history.length > 0) {
        historyData = payload.history;
        currentReading = payload.latest || historyData[historyData.length - 1];
        updateUI();
      }
    });

    socket.on('new_reading', (reading) => {
      historyData.push(reading);
      currentReading = reading;
      
      // Check alerts
      const highThreshold = parseFloat(highTempAlertInput.value) || 35;
      const lowThreshold = parseFloat(lowTempAlertInput.value) || 10;
      
      if (reading.temp_c >= highThreshold) {
        playBeep(1000, 0.4);
      } else if (reading.temp_c <= lowThreshold) {
        playBeep(440, 0.4);
      }

      updateUI();
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
      currentTempDisplay.textContent = '--.-';
      statLatest.textContent = '--.-';
      statMin.textContent = '--.-';
      statMax.textContent = '--.-';
      statAvg.textContent = '--.-';
      return;
    }

    // 1. Temperature Display & Units
    const valC = currentReading.temp_c;
    const valF = currentReading.temp_f;
    const formattedVal = formatTemp(valC, valF);
    
    currentTempDisplay.textContent = formattedVal;
    currentUnitSymbol.textContent = `°${currentUnit}`;
    statLatest.textContent = `${formattedVal} °${currentUnit}`;
    statSensorId.textContent = `Sensor: ${currentReading.sensor_id}`;

    // 2. Last Updated Timestamp
    const date = new Date(currentReading.timestamp);
    lastUpdatedTime.textContent = date.toLocaleTimeString();

    // 3. RSSI
    wifiRssi.textContent = currentReading.wifi_rssi ? currentReading.wifi_rssi : 'N/A';

    // 4. Thermometer Visual Liquid Gauge (Map -10°C to 60°C to 5% - 95% height)
    const minTempGauge = 0;
    const maxTempGauge = 60;
    let percentage = ((valC - minTempGauge) / (maxTempGauge - minTempGauge)) * 100;
    percentage = Math.max(5, Math.min(95, percentage));
    thermometerLiquid.style.height = `${percentage}%`;

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

    tempStatusTag.textContent = statusText;
    tempStatusTag.style.color = statusColor;
    tempStatusTag.style.backgroundColor = statusBg;
    tempStatusTag.style.borderColor = statusBorder;
    
    thermometerLiquid.style.background = statusColor;
    thermometerBulb.style.background = statusColor;
    thermometerBulb.style.boxShadow = `0 0 20px ${statusColor}`;

    // 6. Stats Summary
    if (historyData.length > 0) {
      const tempArray = historyData.map(r => currentUnit === 'C' ? r.temp_c : r.temp_f);
      const minVal = Math.min(...tempArray);
      const maxVal = Math.max(...tempArray);
      const avgVal = tempArray.reduce((a, b) => a + b, 0) / tempArray.length;

      const minObj = historyData[tempArray.indexOf(minVal)];
      const maxObj = historyData[tempArray.indexOf(maxVal)];

      statMin.textContent = `${minVal.toFixed(1)} °${currentUnit}`;
      statMinTime.textContent = new Date(minObj.timestamp).toLocaleTimeString();

      statMax.textContent = `${maxVal.toFixed(1)} °${currentUnit}`;
      statMaxTime.textContent = new Date(maxObj.timestamp).toLocaleTimeString();

      statAvg.textContent = `${avgVal.toFixed(1)} °${currentUnit}`;
      statCount.textContent = `Based on ${historyData.length} readings`;
    }

    // 7. Update Charts & Logs
    updateLiveChart();
    updateAnalyticsChart();
    renderLogsTable();
  }

  function initLiveChart() {
    const ctx = document.getElementById('liveChart').getContext('2d');
    
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
    const ctx = document.getElementById('analyticsChart').getContext('2d');
    
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
        document.getElementById(targetId).classList.add('active');

        if (tab.dataset.tab === 'analytics') {
          setTimeout(() => analyticsChart.resize(), 100);
        }
      });
    });
  }

  function setupUnitToggle() {
    unitCBtn.addEventListener('click', () => {
      if (currentUnit === 'C') return;
      currentUnit = 'C';
      unitCBtn.classList.add('active');
      unitFBtn.classList.remove('active');
      updateUI();
    });

    unitFBtn.addEventListener('click', () => {
      if (currentUnit === 'F') return;
      currentUnit = 'F';
      unitFBtn.classList.add('active');
      unitCBtn.classList.remove('active');
      updateUI();
    });
  }

  function setupSimulateButton() {
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

    refreshAnalyticsBtn.addEventListener('click', () => {
      updateAnalyticsChart();
    });
  }

  function setupLogActions() {
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

    clearLogsBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all temperature history logs?')) {
        await fetch('/api/temperature/history', { method: 'DELETE' });
      }
    });
  }

  function setupCodeCopy() {
    copyCodeBtn.addEventListener('click', () => {
      const code = document.getElementById('espCodeBlock').textContent;
      navigator.clipboard.writeText(code).then(() => {
        copyCodeBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
        setTimeout(() => {
          copyCodeBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copy Sketch`;
        }, 2000);
      });
    });
  }
});
