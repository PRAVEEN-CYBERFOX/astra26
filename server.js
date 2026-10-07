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

// Memory store for camera frame
let latestCameraFrame = null;
let lastCameraTimestamp = null;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.raw({ type: ['image/jpeg', 'image/png'], limit: '10mb' }));
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


// Continuous MJPEG Stream Push Endpoint from ESP32-CAM
app.post(['/api/camera/stream_push', '/camera/stream_push'], (req, res) => {
  console.log('🎥 ESP32-CAM Live Stream Connected!');
  
  let buffer = Buffer.alloc(0);

  req.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    // Look for JPEG start (0xFF, 0xD8) and end (0xFF, 0xD9) markers
    let startIdx = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
    let endIdx = buffer.indexOf(Buffer.from([0xFF, 0xD9]));

    while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jpegBuffer = buffer.slice(startIdx, endIdx + 2);
      latestCameraFrame = jpegBuffer;
      lastCameraTimestamp = new Date().toISOString();

      const base64Data = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
      
      io.emit('camera_frame', {
        timestamp: lastCameraTimestamp,
        frame: base64Data,
        size: jpegBuffer.length,
        sensor_id: 'ESP32_CAM_LIVE_STREAM'
      });

      buffer = buffer.slice(endIdx + 2);
      startIdx = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
      endIdx = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
    }

    // Keep buffer manageable
    if (buffer.length > 500000) {
      buffer = Buffer.alloc(0);
    }
  });

  req.on('end', () => {
    console.log('🎥 ESP32-CAM Live Stream Disconnected');
    res.status(200).send('Stream ended');
  });

  req.on('error', (err) => {
    console.error('Stream error:', err.message);
  });
});

// Camera Frame Endpoint (Receives single frame from ESP32-CAM)

app.post(['/api/camera/frame', '/camera/frame', '/api/camera'], (req, res) => {
  let imageBuffer = null;
  let base64Data = null;

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    imageBuffer = req.body;
    base64Data = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  } else if (req.body && req.body.frame) {
    base64Data = req.body.frame.startsWith('data:image') 
      ? req.body.frame 
      : `data:image/jpeg;base64,${req.body.frame}`;
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(base64Clean, 'base64');
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid frame payload. Expected binary image/jpeg or JSON with base64 frame.' });
  }

  latestCameraFrame = imageBuffer;
  lastCameraTimestamp = new Date().toISOString();

  const payload = {
    timestamp: lastCameraTimestamp,
    frame: base64Data,
    size: imageBuffer.length,
    sensor_id: req.body.sensor_id || req.headers['x-sensor-id'] || 'ESP32_CAM'
  };

  // Broadcast live frame to web dashboard clients via Socket.io
  io.emit('camera_frame', payload);

  res.status(200).json({
    success: true,
    message: 'Camera frame received',
    timestamp: lastCameraTimestamp
  });
});

// GET latest single JPEG frame
app.get('/api/camera/latest', (req, res) => {
  if (!latestCameraFrame) {
    return res.status(404).send('No camera frame received yet.');
  }
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': latestCameraFrame.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(latestCameraFrame);
});

// GET MJPEG Stream Endpoint (For standard video tags / direct URLs)
app.get('/api/camera/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  const sendFrame = (data) => {
    if (res.writableEnded) return;
    try {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${data.length}\r\n\r\n`);
      res.write(data);
      res.write('\r\n');
    } catch (e) {
      console.error('MJPEG stream write error:', e.message);
    }
  };

  if (latestCameraFrame) {
    sendFrame(latestCameraFrame);
  }

  const frameListener = (payload) => {
    if (latestCameraFrame) sendFrame(latestCameraFrame);
  };

  io.on('camera_frame', frameListener);

  req.on('close', () => {
    io.off('camera_frame', frameListener);
  });
});

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

  // If a camera frame is stored, send it immediately to the new client
  if (latestCameraFrame) {
    socket.emit('camera_frame', {
      timestamp: lastCameraTimestamp,
      frame: `data:image/jpeg;base64,${latestCameraFrame.toString('base64')}`,
      size: latestCameraFrame.length,
      sensor_id: 'ESP32_CAM'
    });
  }

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
