/*
 * ===================================================================
 *  ESP32-CAM (AI-THINKER) Live Cloud Video Streamer for Render
 * ===================================================================
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// ===================================================================
//  USER CONFIGURATION - CHANGE THESE VALUES BEFORE UPLOADING
// ===================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Your Render Cloud API endpoint
const char* SERVER_URL    = "https://astra26.onrender.com/api/camera/frame";

// Delay between frame uploads (in milliseconds)
// 200ms = ~5 FPS | 300ms = ~3.3 FPS | 500ms = ~2 FPS
const int FRAME_INTERVAL_MS = 250; 
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

void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Starting ESP32-CAM Cloud Stream ---");

  pinMode(LED_FLASH_GPIO, OUTPUT);
  digitalWrite(LED_FLASH_GPIO, LOW); // Flash LED OFF by default

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM; config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM;
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

  Serial.println("✅ ESP32-CAM Hardware initialized.");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi: "); Serial.println(WIFI_SSID);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP Address: "); Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    sendFrame();
  } else {
    delay(1000);
  }
  delay(FRAME_INTERVAL_MS);
}

void sendFrame() {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("⚠️ Camera frame capture failed");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setReuse(true);    // Keep TCP/SSL connection open
  http.setTimeout(4000);  // 4s timeout
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-sensor-id", "ESP32_CAM_LIVE");

  int httpCode = http.POST(fb->buf, fb->len);

  if (httpCode > 0) {
    Serial.printf("⚡ Frame Sent (%u bytes) -> HTTP %d\n", fb->len, httpCode);
  } else {
    Serial.printf("❌ Send Error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  esp_camera_fb_return(fb); // Release memory buffer
}
