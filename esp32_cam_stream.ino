/*
 * ===================================================================
 *  ESP32-CAM High-Speed Continuous Live Video Streaming to Render
 * ===================================================================
 * 
 *  This code opens a PERSISTENT TCP/TLS Stream to Render and feeds
 *  JPEG frames continuously at high frame rates (10 - 15 FPS)!
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>

// ===================================================================
//  USER CONFIGURATION - CHANGE THESE VALUES BEFORE UPLOADING
// ===================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Your Render Cloud Domain (without http/https)
const char* STREAM_HOST   = "astra26.onrender.com";
const int   STREAM_PORT   = 443; // HTTPS Port

// Stream Delay between frames (in milliseconds)
// 50ms = ~15-20 FPS | 100ms = ~10 FPS | 200ms = ~5 FPS
const int FRAME_INTERVAL_MS = 60; 
// ===================================================================

// AI-THINKER CAMERA PIN CONFIGURATION
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define LED_FLASH_GPIO     4

WiFiClientSecure client;
bool isConnectedToStream = false;

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  pinMode(LED_FLASH_GPIO, OUTPUT);
  digitalWrite(LED_FLASH_GPIO, LOW);

  // Configure Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA;  // 640x480 resolution
    config.jpeg_quality = 12;            // 0-63 quality
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA; // 320x240 resolution
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    return;
  }

  Serial.println("✅ ESP32-CAM Hardware ready.");

  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());

  client.setInsecure(); // Skip SSL certificate verification for fast connection
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    delay(2000);
    return;
  }

  if (!client.connected()) {
    connectLiveStream();
  } else {
    streamNextFrame();
  }

  delay(FRAME_INTERVAL_MS);
}

void connectLiveStream() {
  Serial.print("🎥 Connecting to live stream server: ");
  Serial.println(STREAM_HOST);

  if (client.connect(STREAM_HOST, STREAM_PORT)) {
    Serial.println("✅ Connected to Render Stream server! Initiating persistent live stream...");
    
    // Send persistent HTTP POST header with chunked transfer encoding
    client.println("POST /api/camera/stream_push HTTP/1.1");
    client.print("Host: "); client.println(STREAM_HOST);
    client.println("Content-Type: multipart/x-mixed-replace; boundary=frameboundary");
    client.println("Transfer-Encoding: chunked");
    client.println("Connection: keep-alive");
    client.println();
    
    isConnectedToStream = true;
  } else {
    Serial.println("❌ Connection failed. Retrying in 2 seconds...");
    delay(2000);
  }
}

void streamNextFrame() {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("⚠️ Camera frame capture failed");
    return;
  }

  // Calculate boundary header
  String boundaryStr = "--frameboundary\r\nContent-Type: image/jpeg\r\nContent-Length: " + String(fb->len) + "\r\n\r\n";
  int totalChunkLength = boundaryStr.length() + fb->len + 2;

  // Send chunk length in hex (HTTP Chunked format)
  client.print(String(totalChunkLength, HEX));
  client.print("\r\n");

  // Write boundary text
  client.print(boundaryStr);

  // Write JPEG binary image buffer
  client.write(fb->buf, fb->len);

  // Chunk end
  client.print("\r\n\r\n");

  Serial.printf("⚡ Live Frame Streamed (%u bytes)\n", fb->len);

  esp_camera_fb_return(fb); // Free camera frame buffer
}
