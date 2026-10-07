/*
 * ===================================================================
 *  ESP32-CAM (AI-THINKER) Live Video Streaming to Render Cloud
 * ===================================================================
 * 
 *  HARDWARE SETUP (ESP32-CAM AI-THINKER):
 *  --------------------------------------
 *  - Board: "AI Thinker ESP32-CAM"
 *  - PSRAM: Enabled (Recommended for HD / SVGA quality)
 *  - Flash Mode: QIO 80MHz
 *  - Partition Scheme: Huge APP (3MB No OTA / 1MB SPIFFS)
 * 
 *  WIRING FOR FLASHING (FTDI Programmer to ESP32-CAM):
 *  - FTDI 5V   --> ESP32-CAM 5V
 *  - FTDI GND  --> ESP32-CAM GND
 *  - FTDI TX   --> ESP32-CAM U0R (GPIO 3)
 *  - FTDI RX   --> ESP32-CAM U0T (GPIO 1)
 *  - GPIO 0    --> Connect to GND while uploading code! (Remove after uploading)
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// ===================================================================
//  USER CONFIGURATION - CHANGE THESE VALUES BEFORE UPLOADING
// ===================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Your Render Cloud API endpoint for receiving camera frames
const char* SERVER_URL    = "https://astra26.onrender.com/api/camera/frame";

// Frame capture delay (in milliseconds). 
// 800ms = ~1.2 Frames Per Second (FPS) - Optimal for stable cloud streaming
const int FRAME_DELAY_MS  = 800; 
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

#define LED_FLASH_GPIO     4 // Built-in bright LED flash

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  pinMode(LED_FLASH_GPIO, OUTPUT);
  digitalWrite(LED_FLASH_GPIO, LOW); // Flash LED OFF by default

  // Configure Camera Parameters
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
  
  // Set resolution depending on PSRAM availability
  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA;  // 640x480
    config.jpeg_quality = 12;            // 0-63 (lower = higher quality)
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA; // 320x240
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  // Camera Initialization
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x", err);
    return;
  }

  Serial.println("✅ ESP32-CAM Hardware initialized successfully.");

  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    sendCameraFrame();
  } else {
    delay(1000);
  }
  delay(FRAME_DELAY_MS);
}

void sendCameraFrame() {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("⚠️ Camera capture failed");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setReuse(true); // Reuse TCP/SSL connection for smooth streaming
  http.setTimeout(5000); // 5s timeout
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-sensor-id", "ESP32_CAM_PRO");

  // Send raw JPEG binary buffer over HTTP POST
  int httpResponseCode = http.POST(fb->buf, fb->len);

  if (httpResponseCode > 0) {
    Serial.printf("📸 Frame sent (%u bytes) -> HTTP Code: %d\n", fb->len, httpResponseCode);
  } else {
    Serial.printf("❌ POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
  esp_camera_fb_return(fb); // Release memory buffer
}

