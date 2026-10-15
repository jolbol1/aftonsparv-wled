# What we learnt

These notes come from converting an IKEA AFTONSPARV lamp to WLED, 14–15 Oct 2026. We built it by hand first (ESP32-C3 + boost converter + MOSFETs). That took about 5 hours and ended up as a messy box that dropped off Wi-Fi. We then replaced it with a £35 off-the-shelf controller, which worked the same evening.

## The big one

**Price up the off-the-shelf controller before building your own.** An ESP32 board with PWM outputs and WLED preinstalled costs about £35 and arrives next day. It replaces the boost converter, the MCU, the MOSFETs, the power wiring and the debugging. Only go DIY if it has to fit inside the lamp or you want the build itself.

## The lamp

- The LEDs are analog RGB, common anode, run straight from 24 V. The lamp's LED strip limits its own current, so there are no series resistors (confirmed from the [Caffeinated-AFTONSPARV](https://github.com/caffeinated-labs/Caffeinated-AFTONSPARV) netlist).
- IKEA's driver is the ICPSW24-3-3: 24 V, 3 W. The LEDs draw about 2.3 W, so there's little room left for an ESP32.
- The board is marked HE-QPDRGB-05 and has B/R/G pads, two DC+ pads and one DC− pad. Two white wires both land on DC+, and only the printed text on the LED+ wire tells them apart.
- The cord goes into a panel DC socket that lifts out. The IKEA lead has a barrel plug at both ends.
- The channel in the base is tight. Hand-wired MOSFETs, a boost converter and the joints didn't fit once everything was soldered.

## Picking a controller

- Make sure it says **PWM** or **analog RGB**. Most ESP32 WLED controllers are digital/addressable only. GL-C-017WL-D is digital, Elite 1D2P has only 2 PWM channels, and GL-C-208M runs Matter firmware.
- BTF SP805E: the PWM terminals are R = IO25, G = IO26, B = IO27, W = IO12, C = IO14. Power comes in through the DC jack (5–24 V).

## WLED gotchas

- **The SP805E ships configured for addressable strips** (2× WS281x on IO16/IO2, 850 mA limiter), so the lamp stays dark until you swap in a PWM RGB output (type 43) on 25/26/27.
- **Colour gamma is off from the factory.** HA's red is (255, 38, 0). With no gamma, 15% green duty on a very efficient green LED turns it orange. Gamma 2.8 fixes it.
- In `/json/cfg`, `light.gc.col` / `gc.bri` store **1 for off** and the gamma value (2.8) for on. It's easy to misread `1` as "on".
- WLED 0.15 applies bus changes posted to `/json/cfg` live. On the C3 (WLED 16.0.1), the POST returned success but wrote to flash a few seconds later, so wait about 5 s before sending `{"rb":true}` or you lose the change.
- `{"tt":0}` in a state call makes that change instant, which is useful for tests. Save a preset with `{"psave":N,"n":"name","ib":true,"sb":true}`. The boot preset is `cfg.def.ps`.
- AudioReactive is enabled on the SP805E. It does nothing with a solid colour.

## DIY build lessons (ESP32-C3 route)

These are worth keeping for the next ESP32 project:

- **MT3608 boost:** turning the pot anticlockwise *raises* the output, despite what you'd expect. Start by turning it about 20 turns clockwise, to the minimum, then raise it slowly with a meter on OUT and no load. Trust the meter over the direction.
- **IRLZ44N from Amazon can be fakes or relabelled IRFZ44N.** Test each one on a breadboard: with 3.3 V on the gate through WLED, a genuine one dims an LED smoothly from 1 to 100%. Meter checks for a built module:
  - gate↔source ≈ 10 kΩ (the pulldown)
  - diode test from S to D reads 0.4–0.7
  - D→S reads OL
- **C3 SuperMini Wi-Fi is weak.** Full TX power is known to break some batches, so we ran it at 8.5 dBm. WLED-AP never appeared after flashing. The fix was install.wled.me → Connect → Change Wi-Fi (Improv over USB).
- **Header pins pushed into the C3 without solder don't connect.** The breadboard rails stayed dead until they were soldered.
- **Brownouts look like Wi-Fi problems.** The C3 kept falling back to WLED-AP. WLED's reset reason showed a brownout: 5 V dips on the C3 when Wi-Fi and the boost converter draw at once. Keep 5 V wiring short and thick, and put 470–1000 µF across the input.
- **Never connect the C3's USB-C to a computer while the lamp's 5 V is live.** USB VBUS and the 5 V pin back-feed into each other. Do updates over Wi-Fi.
- **A cut USB cable makes a fine 4-core lead.** Some have no black wire and use the braid as ground. We measured 50 mV of drop at full red over about 1 m. Red looking dimmer than the others is your eye, not the wiring.

## Testing

- `tools/lamp-test.mjs` drives WLED and, optionally, reads a webcam to check each colour. The camera reading compares each frame against a frame taken with the lamp off, masks to the lamp's pixels, then checks the dominant channel (primaries) or the hue within ±40° (mixed colours).
- Webcam auto-exposure flattens the dimming curve, so treat the brightness ramp as a rough check only.
- macOS ffmpeg avfoundation:
  - the MacBook camera needs `-pixel_format nv12` (yuv420p is rejected)
  - macOS has no `timeout` command
  - an app with no camera usage description (e.g. some IDE terminals) is **silently denied** camera access for its child processes, so ffmpeg just hangs. Run it from Terminal.app, which shows the permission prompt.
- The power test holds full white for 20 s and polls `/json/info` uptime. If uptime goes down, the controller rebooted. That includes someone switching the lamp off during the test.
