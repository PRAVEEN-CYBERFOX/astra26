const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ''; // Optional security key
const DATA_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_HISTORY = 1000;

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// In-memory data store with file backup
let temperatureHistory = [];

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      temperatureHistory = JSON.parse(raw);
      if (!Array.isArray(temperatureHistory)) temperatureHistory = [];
    }
  } catch (err) {
    console.error('Error loading history from file:', err.message);
    temperatureHistory = [];
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(temperatureHistory.slice(-MAX_HISTORY), null, 2));
  } catch (err) {
    console.error('Error saving history to file:', err.message);
  }
}

loadData();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    totalReadings: temperatureHistory.length,
    uptime: process.uptime()
  });
});

// GET latest temperature reading
app.get('/api/temperature/latest', (req, res) => {
  if (temperatureHistory.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No temperature readings recorded yet.'
    });
  }
  const latest = temperatureHistory[temperatureHistory.length - 1];
  res.json({
    success: true,
    data: latest
  });
});

// GET temperature history
app.get('/api/temperature/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const history = temperatureHistory.slice(-limit);
  res.json({
    success: true,
    count: history.length,
    total: temperatureHistory.length,
    data: history
  });
});

// POST new temperature reading (from ESP32 or HTTP client)
const handleTemperaturePost = (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.body.api_key;
  
  // If API_KEY is set in env, enforce authorization check
  if (API_KEY && apiKey !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key' });
  }

  // Support flexible field names from ESP32 payload
  let rawTemp = req.body.temperature ?? req.body.temp ?? req.body.temp_c ?? req.body.value;
  
  if (rawTemp === undefined || rawTemp === null || isNaN(Number(rawTemp))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload. "temperature" must be a numeric value.'
    });
  }

  const tempC = parseFloat(Number(rawTemp).toFixed(2));
  const tempF = parseFloat(((tempC * 9) / 5 + 32).toFixed(2));
  const sensorId = req.body.sensor_id || req.body.device_id || 'DS18B20_ESP32';
  const timestamp = req.body.timestamp ? new Date(req.body.timestamp).toISOString() : new Date().toISOString();

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    sensor_id: sensorId,
    temp_c: tempC,
    temp_f: tempF,
    timestamp: timestamp,
    wifi_rssi: req.body.rssi || null
  };

  temperatureHistory.push(record);
  if (temperatureHistory.length > MAX_HISTORY) {
    temperatureHistory = temperatureHistory.slice(-MAX_HISTORY);
  }

  saveData();

  // Broadcast to all connected WebSocket clients in real-time
  io.emit('new_reading', record);

  console.log(`[${new Date().toLocaleTimeString()}] Reading received: ${tempC}°C / ${tempF}°F from ${sensorId}`);

  res.status(201).json({
    success: true,
    message: 'Temperature recorded successfully',
    data: record
  });
};

// Mount route handler on primary and alias endpoints for robust compatibility
app.post('/api/temperature', handleTemperaturePost);
app.post('/api/temp', handleTemperaturePost);
app.post('/temperature', handleTemperaturePost);
app.post('/update', handleTemperaturePost);
app.post('/', handleTemperaturePost);


// POST endpoint to trigger simulated telemetry (for live UI testing)
app.post('/api/simulate', (req, res) => {
  const baseTemp = req.body.baseTemp ? parseFloat(req.body.baseTemp) : 24.5;
  const variation = (Math.random() - 0.5) * 2.5; // +/- 1.25 degrees
  const tempC = parseFloat((baseTemp + variation).toFixed(2));
  const tempF = parseFloat(((tempC * 9) / 5 + 32).toFixed(2));

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    sensor_id: 'DS18B20_SIMULATED',
    temp_c: tempC,
    temp_f: tempF,
    timestamp: new Date().toISOString(),
    wifi_rssi: Math.floor(-70 + Math.random() * 20)
  };

  temperatureHistory.push(record);
  if (temperatureHistory.length > MAX_HISTORY) {
    temperatureHistory = temperatureHistory.slice(-MAX_HISTORY);
  }

  saveData();
  io.emit('new_reading', record);

  res.json({ success: true, data: record });
});

// Clear history API endpoint
app.delete('/api/temperature/history', (req, res) => {
  temperatureHistory = [];
  saveData();
  io.emit('history_cleared');
  res.json({ success: true, message: 'Temperature history cleared' });
});

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log('Client connected to dashboard:', socket.id);
  
  // Send current history & latest reading on connection
  socket.emit('init_data', {
    latest: temperatureHistory.length > 0 ? temperatureHistory[temperatureHistory.length - 1] : null,
    history: temperatureHistory.slice(-100)
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 ESP32 Temperature Server running on port ${PORT}`);
  console.log(`📊 Web Dashboard: http://localhost:${PORT}`);
  console.log(`📡 ESP32 Endpoint: http://localhost:${PORT}/api/temperature`);
  console.log(`====================================================`);
});
