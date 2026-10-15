// ESP32-C3 voltmeter for setting the MT3608 boost converter.
// Divider: Vin -> 100k -> GPIO3 -> 10k -> GND. Reads 0-28 V.
// Shows the reading on Wi-Fi AP "lamp-voltmeter" (open http://192.168.4.1) and on USB serial.
#include <WiFi.h>
#include <WebServer.h>

const int PIN = 3;               // ADC1_CH3, not a strapping pin
const float RATIO = 110.0 / 10.0; // (100k + 10k) / 10k
WebServer server(80);
float volts = 0;

float readVolts() {
  uint32_t sum = 0;
  for (int i = 0; i < 64; i++) sum += analogReadMilliVolts(PIN);
  return sum / 64.0 / 1000.0 * RATIO;
}

void setup() {
  Serial.begin(115200);
  analogSetPinAttenuation(PIN, ADC_11db);
  WiFi.softAP("lamp-voltmeter");
  WiFi.setTxPower(WIFI_POWER_8_5dBm); // SuperMini antenna fix
  server.on("/", [] {
    server.send(200, "text/html",
      "<meta name=viewport content='width=device-width'><meta http-equiv=refresh content=1>"
      "<body style='font:bold 22vw system-ui;text-align:center;margin-top:30vh'>" +
      String(volts, 2) + " V</body>");
  });
  server.begin();
}

void loop() {
  static uint32_t last = 0;
  server.handleClient();
  if (millis() - last > 250) {
    last = millis();
    volts = readVolts();
    Serial.printf("%.2f V\n", volts);
  }
}
