/*
 * ===================================================================
 *  ESP32 + Waterproof DS18B20 Temperature Sensor for Render Cloud
 * ===================================================================
 * 
 *  WIRING INSTRUCTIONS:
 *  --------------------
 *  DS18B20 Sensor Cable:
 *    - Red Wire   (VCC)   --> 3.3V or 5V on ESP32
 *    - Black Wire (GND)   --> GND on ESP32
 *    - Yellow/Data Wire  --> GPIO 4 on ESP32
 * 
 *  IMPORTANT: Connect a 4.7k Ohm resistor between the VCC (Red) 
 *             and Data (Yellow) wires! (Pull-up resistor)
 * 
 *  REQUIRED ARDUINO LIBRARIES (Install via Library Manager):
 *  1. OneWire (by Jim Studt, Paul Stoffregen, etc.)
 *  2. DallasTemperature (by Miles Burton)
 *  3. ArduinoJson (by Benoit Blanchon) [Optional if using raw JSON]
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ===================================================================
//  USER CONFIGURATION - CHANGE THESE VALUES BEFORE UPLOADING
// ===================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";         // Your Wi-Fi Name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";     // Your Wi-Fi Password

// Your deployed Render server URL (or local IP for testing e.g. "http://192.168.1.50:3000/api/temperature")
const char* SERVER_URL    = "https://YOUR-APP-NAME.onrender.com/api/temperature";

// Optional API key if configured on server (leave empty "" if not using)
const char* API_KEY       = ""; 

// Temperature reading send interval (in milliseconds)
const unsigned long SEND_INTERVAL_MS = 10000; // 10 seconds

// Data Pin connected to DS18B20
#define ONE_WIRE_BUS 4

// Onboard LED pin for visual feedback (GPIO 2 on most ESP32 dev boards)
#define STATUS_LED 2 
// ===================================================================

// Setup OneWire and DallasTemperature
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long lastSendTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  Serial.println("\n-------------------------------------------");
  Serial.println(" ESP32 DS18B20 Temperature Monitoring System");
  Serial.println("-------------------------------------------");

  // Initialize temperature sensor
  sensors.begin();
  int deviceCount = sensors.getDeviceCount();
  Serial.print("Found ");
  Serial.print(deviceCount);
  Serial.println(" DS18B20 sensor(s) on OneWire bus.");

  if (deviceCount == 0) {
    Serial.println("⚠️ WARNING: No DS18B20 sensor detected! Check wiring & 4.7k resistor.");
  }

  // Connect to Wi-Fi
  connectWiFi();
}

void loop() {
  // Ensure Wi-Fi stays connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = currentMillis;
    sendTemperatureData();
  }
}

void connectWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED)); // Blink while connecting
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED, HIGH); // Solid ON when connected
    Serial.println("\n✅ WiFi Connected Successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    digitalWrite(STATUS_LED, LOW);
    Serial.println("\n❌ WiFi Connection Failed! Will retry in next loop cycle.");
  }
}

void sendTemperatureData() {
  // Request temperature from DS18B20
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  // Check if sensor reading is valid
  if (tempC == DEVICE_DISCONNECTED_C || tempC < -55.0 || tempC > 125.0) {
    Serial.println("⚠️ Error: Could not read temperature from DS18B20 sensor.");
    return;
  }

  float tempF = (tempC * 9.0 / 5.0) + 32.0;
  int rssi = WiFi.RSSI();

  Serial.print("Reading: ");
  Serial.print(tempC);
  Serial.print(" °C | ");
  Serial.print(tempF);
  Serial.println(" °F");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skipping HTTP POST.");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  if (strlen(API_KEY) > 0) {
    http.addHeader("x-api-key", API_KEY);
  }

  // Build JSON Payload
  String jsonPayload = "{";
  jsonPayload += "\"temperature\":" + String(tempC, 2) + ",";
  jsonPayload += "\"temp_f\":" + String(tempF, 2) + ",";
  jsonPayload += "\"sensor_id\":\"DS18B20_ESP32\",";
  jsonPayload += "\"rssi\":" + String(rssi);
  jsonPayload += "}";

  Serial.print("Sending POST request to ");
  Serial.println(SERVER_URL);

  // Rapid double-blink on sending data
  digitalWrite(STATUS_LED, LOW); delay(50);
  digitalWrite(STATUS_LED, HIGH); delay(50);
  digitalWrite(STATUS_LED, LOW); delay(50);
  digitalWrite(STATUS_LED, HIGH);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✅ Server Response Code: ");
    Serial.println(httpResponseCode);
    Serial.print("Response Payload: ");
    Serial.println(response);
  } else {
    Serial.print("❌ HTTP POST Request failed. Error code: ");
    Serial.println(httpResponseCode);
    Serial.print("Error description: ");
    Serial.println(http.errorToString(httpResponseCode));
  }

  http.end();
}
