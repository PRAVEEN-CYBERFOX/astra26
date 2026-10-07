# 🌡️ ESP32 + DS18B20 Waterproof Temperature Sensor Dashboard (Hosted on Render)

This project provides a complete, production-ready solution for reading waterproof temperature sensor data from an **ESP32**, pushing it to a **Cloud Web Server** hosted on **Render.com**, and displaying it in a real-time web dashboard.

---

## 🛠️ Hardware Requirements & Wiring

### Hardware Components
1. **ESP32 Development Board** (e.g., ESP32 NodeMCU / WROOM).
2. **DS18B20 Waterproof Temperature Sensor** (Stainless steel probe with 3 wires).
3. **4.7kΩ Pull-up Resistor** (Crucial for OneWire bus stability).
4. Breadboard & Jumper Wires.

### Pin Connections Diagram
| DS18B20 Cable Wire | ESP32 Connection | Description |
| :--- | :--- | :--- |
| **Red (VCC)** | **3.3V** or **5V** | Power Supply |
| **Black (GND)** | **GND** | Ground |
| **Yellow / White (Data)** | **GPIO 4** | OneWire Data Bus |

> ⚠️ **Important**: Connect the **4.7kΩ Resistor** between **Red (VCC)** and **Yellow (Data)**! Without this pull-up resistor, the ESP32 will fail to detect the sensor or return invalid `-127.0°C` readings.

---

## ☁️ Step-by-Step Deployment Guide for Render.com

### Step 1: Push Code to GitHub
1. Create a new repository on GitHub (e.g. `esp32-temp-render`).
2. Commit and push all project files to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for ESP32 Render Temperature App"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/esp32-temp-render.git
   git push -u origin main
   ```

### Step 2: Deploy Web Service on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right corner and select **Web Service**.
3. Choose **Build and deploy from a Git repository** and connect your GitHub repo.
4. Fill in the following details:
   - **Name**: `esp32-temp-monitor` (or any custom name)
   - **Region**: Choose the closest location to you
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.
6. Render will build and deploy your application. Once finished, copy your public URL!
   - Example: `https://esp32-temp-monitor.onrender.com`

---

## ⚡ ESP32 Arduino Setup

### 1. Arduino IDE Prerequisites
In Arduino IDE, open **Tools** -> **Manage Libraries...** (`Ctrl+Shift+I` or `Cmd+Shift+I`) and install:
1. `OneWire` (by Paul Stoffregen)
2. `DallasTemperature` (by Miles Burton)

### 2. Configure & Flash Arduino Code
Open the included [`esp32_temperature_sensor.ino`](./esp32_temperature_sensor.ino) file in Arduino IDE:
1. Replace `"YOUR_WIFI_SSID"` with your Wi-Fi network name.
2. Replace `"YOUR_WIFI_PASSWORD"` with your Wi-Fi password.
3. Replace `SERVER_URL` with your Render API endpoint:
   ```cpp
   const char* SERVER_URL = "https://your-app-name.onrender.com/api/temperature";
   ```
4. Select your ESP32 board in Arduino IDE under **Tools -> Board**, select the COM/Serial Port, and click **Upload** (`Ctrl+U` / `Cmd+U`).

---

## 🖥️ Local Testing & Development

To test the application on your computer locally before deploying to Render:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
4. Click the **"Push Test Reading"** button on the Live Monitor tab to test real-time WebSocket gauge updates, live charts, and sound alerts without physical ESP32 hardware!

---

## 🛰️ REST API Reference

### `POST /api/temperature`
Pushes a new temperature reading to the cloud.

#### Request Body (JSON):
```json
{
  "temperature": 25.4,
  "temp_f": 77.72,
  "sensor_id": "DS18B20_ESP32",
  "rssi": -65
}
```

#### Response (JSON):
```json
{
  "success": true,
  "message": "Temperature recorded successfully",
  "data": {
    "id": "m5x8ab12",
    "sensor_id": "DS18B20_ESP32",
    "temp_c": 25.4,
    "temp_f": 77.72,
    "timestamp": "2026-10-07T22:30:00.000Z",
    "wifi_rssi": -65
  }
}
```

---

## 🌟 Key Features
- **Real-Time WebSockets**: Instant temperature gauge and chart updates using Socket.io.
- **Glassmorphic Responsive UI**: Optimized for smartphones, tablets, and desktop displays.
- **Visual Thermometer Gauge**: Liquid level & glow color changes dynamically with temperature status (Cold, Optimal, Warm, Hot).
- **Audio & Visual Threshold Alerts**: Customizable High/Low warning alarms with sound alerts.
- **Data Export**: Export sensor logs to CSV format with a single click.
- **Hardware-Free Simulator**: Embedded web simulator to test your web app before connecting ESP32 hardware.
