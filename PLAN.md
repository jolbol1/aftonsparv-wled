# ESP32 lights: IKEA AFTONSPARV lamp + Govee RGBIC TV light bars

Handover doc. Started 2026-10-14. Two projects that share an approach: replace the stock controller with an ESP32 running WLED (or ESPHome).

| Project | Status | Next action |
|---|---|---|
| IKEA AFTONSPARV planet lamp | Lamp opened 2026-10-14 (see 1.7 Build log). | **Done (2026-10-15).** BTF SP805E (WLED 0.15.4, 192.168.0.84) + 24 V adapter, PWM RGB on IO25/26/27. DIY C3 box retired; parts kept for the Govee project |
| Govee RGBIC TV light bars | **Parked (James, 2026-10-14).** The LAN API (route A) works and is in use. Revisit only if the bars break. His concern is privacy (what the device sends to Govee), not features. | Optional: block the controller's internet at the router (LAN API keeps working) |

Parts arrival confirmed 2026-10-14 (see 1.3): everything except the stripboard. Govee model confirmed H6056 from the app.

---

## 1. IKEA AFTONSPARV planet lamp

### 1.1 Facts

- Product: [AFTONSPARV LED decoration lighting, planet shape](https://www.ikea.com/gb/en/p/aftonsparv-led-decoration-lighting-planet-shape-multicolour-10558776/), art. 105.587.76, £19. 2.3 W, 7 colours, 2.1 cm thick.
- Stock power: plug-in driver **ICPSW24-3-3, 24 V DC, 3 W max** ([report](https://device.report/ikea/icpsw24-3-3)).
- LEDs are **analog RGB, common anode** — not addressable. Five wires reach the original board.
- Open-hardware replacement board exists: [caffeinated-labs/Caffeinated-AFTONSPARV](https://github.com/caffeinated-labs/Caffeinated-AFTONSPARV) (ESP32-C3-MINI, OSHW DE000140, last push Nov 2023). It is the reference for this build.

Wire colours (from the Caffeinated README):

| Lamp wire | Function |
|---|---|
| LED white | LED + (24 V common anode) |
| LED black | Red (low side) |
| LED green | Green (low side) |
| LED transparent | Blue (low side) |
| Plug white | +24 V in |
| Plug black | − (ground) |

Access: remove the bottom cover only (one screw is under the sticker). Desolder all wires from the IKEA board; it is discarded.

**Verified from the Caffeinated KiCad netlist** (`Caffeinated-AFTONSPARV.kicad_pcb`): LED connector pins go straight to the MOSFET drains and LED + goes straight to +24 V. There is no series LED resistor on the board, so the lamp's LED strip limits its own current at 24 V. The 20 Ω parts (R4–R6) are gate resistors; the 10 kΩ (R1–R3) are gate pulldowns. Our discrete circuit matches.

Caffeinated WLED config: `PWM RGB`, GPIO 4, 5, 6; button on GPIO 9.

### 1.2 Design decision: one USB cable

James wants **one cable**. Chosen design:

```
USB-A charger → cut USB-A cable (red +5V, black GND; green/white data left unconnected)
  ├─► ESP32-C3 SuperMini 5V pin + GND
  └─► MT3608 boost IN+/IN− ── set to 24.0 V ──► OUT+ → lamp LED white (+)
                                                  OUT− → common GND
lamp black  (R) → IRLZ44N #1 drain
lamp green  (G) → IRLZ44N #2 drain
lamp transp.(B) → IRLZ44N #3 drain
all MOSFET sources → GND
GPIO4 ─100Ω─► gate #1, 10kΩ gate→GND
GPIO5 ─100Ω─► gate #2, 10kΩ gate→GND
GPIO6 ─100Ω─► gate #3, 10kΩ gate→GND
```

IRLZ44N pinout, text facing you, legs down: **G, D, S** left to right.

Power budget: LEDs about 3 W at 24 V → about 0.7 A drawn at 5 V through the boost, plus the C3. Any 1 A+ USB charger works. Moving off the IKEA 3 W driver removes the tight power budget the Caffeinated design has.

Rejected alternatives:
- **USB-C PD trigger at 5 V**: the DollaTek listing says a mis-set DIP switch outputs "any one of" 5–20 V, which would kill the ESP32. A cut USB-A cable can only give 5 V.
- **Two supplies** (IKEA 24 V for the LEDs + USB for the ESP32, grounds joined): needs no voltage setting, but James rejected it because it means two cables.
- **IKEA 24 V + buck to 5 V for the ESP32**: one cable, but needs an MP1584 (not bought) and the 3 W budget is tight.
  - Revisited 2026-10-14; James asked about using the IKEA cable as the single cable. It's still viable and is the Caffeinated design's approach. Plug white (+24 V) → LED white + MP1584 IN+; MP1584 set to 5.0 V → C3 5V pin; MOSFET stage unchanged; no MT3608. Budget: LEDs about 2.3 W + C3 about 0.5 W average (Wi-Fi peaks higher) vs the driver's 3 W.
  - Mitigations: WLED brightness limit (start at about 80%), TX power 8.5 dBm, and optionally a 470 µF cap on 5 V (not on hand).
  - MP1584 input max is 28 V, so meter the IKEA plug unloaded first (expect about 24 V). Don't use a Mini-360 (23 V max).
  - Only missing part: the MP1584 ([B07DJ5HZ7G](https://www.amazon.co.uk/dp/B07DJ5HZ7G)).
  - **James switched to this (IKEA plug + step-down) on 2026-10-14** and wanted parts the same day, locally.
    - Wickes has no DC-DC converter. Its only car charger is the DeWalt DWT1410484 at £63, delivery only. Hobbycraft doesn't sell electronics.
    - Amazon delivery: every buck module is Fri 16 Oct at the earliest.
    - **Same-day stopgap: a car USB charger rated "12V/24V" input** (Argos, supermarkets, Halfords; Halfords lists several, e.g. SKU 375019). Its tip/centre contact is +, the side springs are −. Wire IKEA plug white → tip and black → spring, and run a USB-A→USB-C lead into the C3's own USB-C port. That way USB is the C3's only supply, so there's no back-feed issue. Strip the case if it won't fit.
    - Budget is tighter still: about 85% conversion efficiency plus the charger's idle draw. Cap WLED brightness at about 70%, and prefer a plain 5 V USB-A charger.
    - Fixed-5 V modules need no adjusting, e.g. JZK B09TFHTH1X. That one's input tops out at 24 V, though, so prefer a buck with more input headroom (MP1584 or LM2596).

**Final decision (James, 2026-10-14): USB + MT3608 step-up, built today.** He compared it with IKEA plug + step-down: the USB route uses parts on hand and has 10 W+ headroom against the IKEA driver's 3 W, so there is no brightness cap.

**Getting the USB cable in without a new hole (James, 2026-10-14):**
- **Preferred: reuse the IKEA cord.** Cut it near the wall adapter and splice a cut USB-A cable's red/black onto the cord's white (+) / black (−). Solder, then heat-shrink or tape. The lamp end, grommet and strain relief stay untouched, and the inside wiring is unchanged except it now carries 5 V. Bin the IKEA adapter so 24 V can never go back in.
  - The cord is thin (made for about 0.13 A at 24 V; it now carries about 0.7 A at 5 V). Meter the voltage at the lamp end with the LEDs on full. Above about 4.5 V is fine for the MT3608 and the C3. Lower than that: shorten the cord, or splice the USB cable in closer to the lamp.
- If the cord plugs into a DC socket on the lamp instead: use a USB-A → DC barrel cable that matches it. The risk is that the IKEA 24 V adapter still fits and would kill the C3, so get rid of it.
- Only if the cord is moulded in and can't be reused: feed the USB cable through the existing cord hole and knot it inside for strain relief.
- Not yet checked how the cord enters the AFTONSPARV base; James to look.

### 1.3 Parts (Amazon UK, as audited 2026-10-14)

| Part | Link | Price | Notes |
|---|---|---|---|
Arrival confirmed by James 2026-10-14:

| Part | Link | Price | Status / notes |
|---|---|---|---|
| ESP32-C3 SuperMini ×2 (DUBEUYEW) | [B0DMNBWTFD](https://www.amazon.co.uk/dp/B0DMNBWTFD) | £8.99 | ✅ Arrived. One for the lamp, one spare |
| MT3608 boost ×5 (Youmile, 2–24 V in, 5–28 V out, 2 A, 1 A continuous) | [B0C5HXZ6HT](https://www.amazon.co.uk/dp/B0C5HXZ6HT) | £6.59 | ✅ Arrived. 36×17×**14 mm** tall; includes 24AWG wire (use it for the lamp wiring) |
| IRLZ44N ×10 (PENGLIN) | [B0G127JL8B](https://www.amazon.co.uk/dp/B0G127JL8B) | £7.99 | ✅ Arrived. Amazon packs can be relabelled IRFZ44N; test each |
| Resistor kit (BOJACK, 1 Ω–1 MΩ, 25 values, 1000 pcs) | — | — | ✅ Arrived (replaced the planned B0BTP6WYH1). The usual BOJACK 25-value set includes 100 Ω and 10 kΩ; check the strip labels |
| CP2102 USB-serial ×2 (Hailege) | [B07XRF152K](https://www.amazon.co.uk/dp/B07XRF152K) | £7.49 | ✅ Arrived. For the Govee project, not the lamp |
| USB-C PD trigger ×4 (GELRHONR, 5/9/12/15/20 V) | — | — | ✅ Arrived, but **not used for the lamp** (see 1.2). Keep for Govee route C (12 V) |
| Stripboard 25×64 mm ×10 | [B08D2HP4B3](https://www.amazon.co.uk/dp/B08D2HP4B3) | £6.99 | ❌ **Not in the delivery.** Either order it, or wire the MOSFETs point-to-point (1.5 step 5) |

Still to buy (Wickes, click & collect):

| Part | Link | Price |
|---|---|---|
| Cat II Compact Digital Multimeter 300 V | [Wickes 276109](https://www.wickes.co.uk/Cat-II-Compact-Digital-Multimeter---300V/p/276109) | £10 |
| Tower black PVC insulation tape 20 m | [Wickes 710074](https://www.wickes.co.uk/Tower-Black-PVC-Electrical-Insulation-Tape---20m-x-19mm/p/710074) | £1 |

Hobbycraft has no multimeter and no electrical tape (only duct and masking tape), so don't use it for these.

James also owns a Freenove RFID Starter Kit V2.0 (Arduino Uno clone; [B08B4JY95V](https://www.amazon.co.uk/dp/B08B4JY95V), [parts list](https://github.com/Freenove/Freenove_RFID_Starter_Kit_V2.0/blob/master/PartsList.jpg)). It has **no buck converter**. Useful from it: a breadboard and jumper wires (prototype the MOSFET stage before soldering), 220 Ω/1 kΩ/10 kΩ resistors, 10 µF and 0.1 µF caps, and diodes. The Uno clone's regulator can't take the IKEA 24 V.

Also needed, assumed on hand: soldering iron and solder, a USB-A charger (1 A+), and a spare USB-A cable to cut.

### 1.4 Gotchas

- **MT3608 ships at a random output.** Per the Youmile listing, **anticlockwise RAISES the voltage** (corrected 2026-10-14; earlier notes had it backwards). Turn it **clockwise** about 20 turns first, until OUT reads about the input voltage (around 5 V). Then turn anticlockwise slowly to 24.0 V, with no load and the meter on OUT. Trust the meter over the direction. Its max output is 28 V.
- **Flash WLED before wiring the C3 in** (install.wled.me, Chrome, ESP32-C3). Do later updates over Wi-Fi. Never plug the C3 into a Mac while the lamp's 5 V is connected: the SuperMini's USB VBUS and 5 V pin would back-feed each other.
- **C3 SuperMini antenna**: many batches drop Wi-Fi. Lower TX power to about 8.5 dBm in WLED's Wi-Fi settings.
- **C3 pins**: use GPIO 4/5/6. Avoid strapping pins 2, 8 and 9, and USB pins 18/19. GPIO 8 has the on-board LED.
- **MOSFET test**: wire one channel, drive it from WLED. Full, smooth dimming means a genuine logic-level part. Dim or dead means a fake; swap it.
- **Fit**: the MT3608 is 14 mm tall. If it won't fit in the base, put it in a small box on the cable.
- Insulate the stripboard and the converter pins with PVC tape before closing the lamp.

### 1.5 Build steps

Visual step-by-step guide (works offline in any browser): `guide/index.html`, with photos in `guide/img/`.

1. Photograph the original IKEA board and its wiring before desoldering anything.
2. Flash WLED to the C3. LED Preferences → `PWM RGB`, GPIO 4, 5, 6. Optional button on GPIO 9 if wired.
3. Meter on DC V. Cut the USB-A cable and plug it into the charger. Confirm red = +5 V (no minus sign).
4. Connect 5 V to the MT3608 IN. Turn its pot clockwise about 20 turns (to the minimum, about 5 V), then anticlockwise slowly until OUT reads 24.0 V with no load.
5. Build the MOSFET stage on stripboard per 1.2. Without stripboard, wire it point-to-point: twist the three source legs to one GND wire, put each 10 kΩ straight across its gate and source legs, put the 100 Ω in series on the gate wire, then tape every joint.
6. Wire one colour, test it, then add the other two.
7. Tape, fit and close.

### 1.6 Fallback: ESP32 as voltmeter (if no multimeter)

Spare C3 + divider: Vin → 100 kΩ (brown-black-yellow) → GPIO3 → 10 kΩ (brown-black-orange) → GND. 28 V reads as 2.55 V at the pin. Calibrate by measuring the IKEA 24 V plug first, then match the MT3608 to that reading. The sketch is in `voltmeter/voltmeter.ino`: a softAP "lamp-voltmeter" at http://192.168.4.1, plus USB serial.

Build status: arduino-cli and the esp32 core 3.3.12 are installed (Homebrew, `~/Library/Arduino15`). Compiling failed with `ctags: bad CPU type in executable`: an x86 tool, and Rosetta is not installed. Fix with `softwareupdate --install-rosetta --agree-to-license`, then `arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc voltmeter`. Not needed once the multimeter is bought.

### 1.7 Build log

- **2026-10-14: lamp opened.** The base screws have an unusual head James didn't recognise; type not yet recorded. The IKEA board is marked **HE-QPDRGB-05**: through-hole pads labelled **B, R, G**, two **DC+** and one **DC−**, three 10 kΩ (103) SMD resistors R4–R6, and a tact switch SW1. No MOSFETs are visible on the top, so they're presumably on the underside.
  - The cord appears to enter through a **white panel DC socket** (solder lugs) at the end of the channel, so the adapter lead may unplug from the lamp. Not yet confirmed. If it does, the plan still works: cut the IKEA adapter's lead near the brick and splice the USB onto it, keeping the barrel plug. The socket accepts any barrel adapter, so bin the IKEA one and label the plug "5 V USB only".
  - Use the board's B/R/G labels to cross-check the Caffeinated wire colours before desoldering.
- **2026-10-14: board underside photographed.** It carries three SOT-23 MOSFETs (Q1–Q3), an SOP-8 chip (U2), and L1/C1–C8. Wire map, matching the Caffeinated colours:
  - **DC−** ← plain black and **DC+** ← plain white: a pair that loops down the channel to the socket (cord − / cord +).
  - **Second DC+** (by C8) ← a white wire with **printed insulation** (VW-1 80°C) that runs up into the ring: **LED white, the common anode**.
  - **R** ← black, **G** ← green, **B** ← transparent: all three run up into the ring.
  - Both whites sit on DC+, so the printed text is the only thing that tells them apart. Flag them before desoldering.
- **2026-10-14: all six wires desoldered.** There was no tape for flags, so the wires are told apart by route: the plain white + black pair is the cord (twisted together), the printed white is LED+, and the other black is RED. The IKEA board is retired. Iron: Tabiger 60 W adjustable (B07Q4T12PH) at about 350 °C.
- **2026-10-14: DC socket confirmed and fit checked.** The plain white + black cord pair are soldered to the lugs of a white panel DC socket, which lifts out of its slot. So the IKEA lead is detachable, with a barrel plug. Plan: cut the adapter's lead near the brick and splice the USB onto it (guide step 6 updated). Four wires come out of the ring: black (R), green (G), transparent (B), printed white (LED+). James checked the parts physically and **everything fits in the channel**, MT3608 included, so no inline box is needed.
- **2026-10-14: WLED flashed** via install.wled.me. The installer didn't offer Wi-Fi setup, and **WLED-AP never appeared** (likely the SuperMini antenna at full TX power). Fix: install.wled.me → **Connect** → **Change Wi-Fi** (Improv over USB) put it on the home network.
- **2026-10-14: WLED configured over its JSON API.** WLED 16.0.1 (release ESP32-C3) at **192.168.0.79**, signal about 80%. Its defaults were WS281x on **GPIO 2** (a strapping pin) and a button on GPIO 0. It's now **PWM RGB (type 43) on GPIO 4/5/6**, len 1, with name "Planet" and mDNS `planet`. TX power was already 34 (= 8.5 dBm). Gotcha: POST `/json/cfg` returns success but writes to flash a few seconds later, so wait about 5 s before sending `{"rb":true}`, or the change is lost.
- **2026-10-14: breadboard test, first attempt.** James fitted the C3's header pins **without soldering**. The kit LED stayed dark even with the gate tied high, and an LED across the rails stayed dark too: the loose headers weren't carrying 5V/GND to the breadboard. Fixed by James; the rails now light the LED. On the breadboard, WLED dropped off the home Wi-Fi and fell back to **WLED-AP** (http://4.3.2.1), which works at close range. That's likely the antenna sitting over the metal strips at 8.5 dBm. Meter: **Deta T1003** (auto-ranging; DC V via the ≂V position + SEL). Diagrams: `guide/breadboard-test.html`, `guide/mosfet-test.html` (spread layout, James's column numbers), `guide/led-test.html`.
- **2026-10-14: channel 1 works on the breadboard** (`guide/full-test.html`). Gate tied to 5 V → LED on (stage 1). GPIO 4 → 100 Ω → gate, with WLED dimming the kit LED smoothly → **MOSFET #1 switches at 3.3 V gate drive, so it's genuine logic-level**. WLED rejoined the home Wi-Fi at 192.168.0.79 (signal 66% on the breadboard).
- **2026-10-14: three MOSFETs confirmed genuine.** Each dims the kit LED smoothly 1→100% from a 3.3 V GPIO. These three go in the lamp. **GPIO 5 (green) and GPIO 6 (blue) also tested OK**, so all three channels work.
- **2026-10-14: the IKEA lead is detachable at both ends** (barrel plug at the adapter end and the lamp end). Step 6 plan: cut one plug off right behind the plug, keep the full-length lead with the other plug, and bin the adapter brick.
- **2026-10-14: USB splice dry-fitted and verified.** IKEA + found by beep test to the socket's plain-white lug. USB cable read 5.0 V red→black. With the twisted (not yet soldered) joints taped apart: no beep across the socket lugs (no short), and **+5.0 V plain-white → black at the lamp socket**. Polarity is correct. Soldered (pigtail), taped and re-checked: **the USB lead works (step 6 done)**.
- **2026-10-14: MT3608 set to 24.0 V** with no load (step 7 done). VIN+ is a red 24AWG wire and VIN− black, taken from the MT3608 bag. Target band: 23.5–24.3 V; re-check under full white in step 10. When VOUT+ gets its (red) wire, flag it "24V" so it can't be confused with the 5 V red.
- **2026-10-14: MOSFET module redesigned for hand soldering.** Fitting resistors across the 2.54 mm legs was too cramped. New layout: **G and S legs splayed about 30°**, D straight, **one wire per leg** (gate/drain/source). The **10 kΩ goes between the gate and source wires about 4 cm away** (stripped windows), and the **100 Ω moves inline into the gate wire**, between the C3 end and the 10 kΩ rung (recommended; it works without it too). **James then chose to fit both resistors on the legs:** G/S splayed, **D bent 90° towards him** so the 10 kΩ can run straight across the G and S tips, with the 100 Ω hooked onto the G tip. Either layout is electrically the same.
- **2026-10-14: first MOSFET module soldered and checked.** gate end→S 10.04 kΩ; gate→D 2.9 MΩ (red on gate: the reading comes from the 10 kΩ plus the body diode, so it isn't a short; an OL expectation here was wrong); diode S→D 0.6; D→S OL. **Correct check list:** gate↔S ≈ 10.1 kΩ; red D/black gate = OL or MΩ; diode red S/black D ≈ 0.4–0.7; reversed OL.
- **2026-10-14: all three MOSFET modules (R, G, B) built** (step 8 done). Next: solder the module gate wires straight to C3 pads 4/5/6, plus red/black wires on the 5V/G pads.
- **2026-10-15: C3 wired** (gate wires on pads 4/5/6, power wires on 5V/G). Power plan: use the **MT3608 VIN pads as the junction** (socket plain white + C3 red into VIN+, socket black + C3 black into VIN−) instead of pigtails, with the MT3608 sat next to the socket. From now on, **never plug the C3 USB-C into the Mac**; update over Wi-Fi only.
- **2026-10-15: power joins A/B made (pigtails) and first power-up OK.** Beep checks passed. C3 5V↔G ≈ 5 V, MT3608 VOUT ≈ 24 V. WLED took a few minutes to rejoin, then was reachable at 192.168.0.79 ("Planet", signal 72%, PWM RGB on 4/5/6 confirmed over the API). Next: VOUT+ → printed white (LED+), the 3 sources → VOUT−, drains → LED wires, then step 10 tests.
- **2026-10-15: 🎉 the lamp works end to end.** Everything is connected (VOUT+ → printed white, sources → VOUT−, drains → black/green/transparent) and James controls it from the WLED app. Still to do: full-white load checks (C3 5V ≥ 4.5 V, VOUT 23.5–24.3 V, MOSFET/MT3608 temperature), confirm the colour mapping, then step 11 (insulate, fit, close). Note: the Mac couldn't reach 192.168.0.79 at that moment even though the app could; check the IP in the app if API access is needed.
- **2026-10-15: step 10 passed.** The colours map correctly (no GPIO swap needed), dimming is smooth on all three, and the full-white voltages are in range. Next: step 11 packaging.
- **2026-10-15: it won't fit in the channel once wired** (wires, joints and modules are too bulky). **Plan: move all the electronics into a small external box** joined to the lamp by a 4-wire lead: a cut USB data cable, hardwired with no USB plugs because it carries 24 V. Mapping: red = 24 V → printed white (LED+), black → LED black (R), green → LED green, white → LED transparent (B). The lead enters through the old DC socket hole, knotted inside. The DC socket moves into the box so the existing USB lead still plugs in. A detachable alternative is a 4-pin RGB LED-strip extension (JST-SM, rated 12/24 V). The C3 being outside the lamp should also help Wi-Fi. Diagram: `guide/external-box.html`.
- **2026-10-15: 4-wire lead fitted.** The cable used is a white USB-A→C lead: **red, white, green + bare braid, no black** (the braid is its ground). Final mapping: **red = 24 V → printed white (LED+); braid → LED black (R); green → LED green; white → LED transparent (B)**. It was spliced into the existing lamp-side tails (each line cut mid-way and flagged R/G/B/24V first). Red went dead once (a braid joint), then worked but looked dimmer. Voltage drop across the braid line at full red: **50 mV**, so the joints are fine and the dimness is just the eye's lower sensitivity to red.
- **2026-10-15: everything works, but the C3 keeps falling back to WLED-AP** and won't hold the home Wi-Fi; it works fine over the AP. Suspects, in order: antenna obstructed or next to the MT3608 or wires in the box; 8.5 dBm TX power too low for the new spot; 5 V dips during Wi-Fi bursts. Plan: move the antenna end to the box edge, away from the MT3608 coil; try TX 11 dBm then 13 dBm (full power is known to break this SuperMini batch); if still flaky, add a capacitor across the C3 5V/G.
- **2026-10-15: WLED reported a brownout restart**, which confirms the 5 V dips (the cause of the AP fallback, and probably the noise). James is redoing some wiring. **Final wiring reference: `guide/final-wiring.html`**: box with socket → node A (5 V: MT3608 VIN+, C3 5V, C1+) / node B (GND: VIN−, C3 G, C1−); C3 4/5/6 → 100 Ω → Q1–Q3 gates with 10 kΩ G↔S; sources → VOUT−; VOUT+ → cable red → printed white; drains → braid/green/white → LED black/green/transparent. **New: C1, 470–1000 µF ≥10 V electrolytic at the MT3608 VIN pads** (to buy), keeping the 5 V wiring short and thick.
- **2026-10-15: James finds the hand-built box too messy, so we looked at off-the-shelf replacements** (Amazon UK, checked 15 Oct):
  - **Recommended:** GLEDOPTO ESP32 PWM WLED controller, 12–24 V, analog RGB, WLED preinstalled, 108×45×18 mm ([B0DP9H9WCL](https://www.amazon.co.uk/dp/B0DP9H9WCL), £37.54, third-party, delivery 24–26 Oct), plus a 24 V 1 A adapter, 5.5×2.1 mm ([B0GXD9M8HX](https://www.amazon.co.uk/dp/B0GXD9M8HX), £8.53). This replaces the USB lead, MT3608, C3 and MOSFETs. The existing 4-wire lead connects to the controller output: red → V+, braid → R, green → G, white → B. The lamp side is unchanged.
  - **Budget, no WLED:** iNextStation 4-pin WiFi RGB controller, 12–24 V, Surplife app ([B07JC7725K](https://www.amazon.co.uk/dp/B07JC7725K), £8.99).
  - Avoid: IRF520 modules, and "digital/addressable" WLED controllers (most of the cheap ESP32 WLED listings) — the lamp is analog common-anode RGB.
  - The built C3 + MOSFET parts can be reused for the Govee project.
  - **Fast WLED option found (15 Oct): BTF-LIGHTING SP805E** ([B0H3V5T62D](https://www.amazon.co.uk/dp/B0H3V5T62D), £34.99, dispatched by Amazon, next day). ESP32, WLED preinstalled, PWM 2–6 pin strips (RGB OK) plus SPI, DC 5/12/24 V, reverse-polarity protection. It meets every requirement. Terminals (from the product photo): right column GND, GND, DATA2 (IO2), DATA1 (IO16), PWM-W (IO12), PWM-C (IO14), PWM-B (IO27), PWM-G (IO26), PWM-R (IO25), VCC×3; power via DC jack (5–24 V, max 4 A). **Wiring: red → VCC, braid → PWM-R (IO25), green → PWM-G (IO26), white → PWM-B (IO27). WLED: PWM RGB on 25/26/27.** Annotated: `guide/sp805e-wiring.html`. Rejected: GL-C-017WL-D (digital only), Elite 1D2P (only 2 PWM channels), GL-C-208M (works, but Matter not WLED). WLED check over the API: signal 78%, PWM ≈9.8 kHz, the unused GPIO 0 button is still configured (offered to disable), no boot preset yet. Check: gate↔source ≈ 10 kΩ, gate↔drain OL, diode S→D ≈ 0.4–0.7. Diagram: `guide/step8-mosfet-module.html` (the older version with the 100 Ω is superseded). Guide pages: `guide/step6a-cord-polarity.html`, `step6b-usb-cable.html`, `step6c-splice.html`. The C3 is now off the breadboard, with jumpers pushed into its pin holes (`guide/channel-tests.html`).
  - **SP805E installed (15 Oct):** wired per `guide/sp805e-wiring.html`, IP 192.168.0.84, WLED 0.15.4, signal 100%. Gotcha: it ships configured for addressable strips (2× WS281x, type 22, on IO16 + IO2, 30 LEDs each, 850 mA limiter), so the lamp stayed dark. Fixed over `/json/cfg`: one bus, type 43 PWM RGB, pins [25,26,27], 19.5 kHz, limiter off — applied live, no reboot needed. Full red lit correctly; James confirmed all channels working. **Lamp done.** Optional leftover: AudioReactive usermod is on (harmless with a solid effect).
  - **HA colours looked off (15 Oct):** HA's red is (255,38,0) and showed orange. Cause: BTF ships colour gamma **off** (`light.gc.col: 1`; in WLED cfg 1 = off, 2.8 = on). Pure (255,0,0) and (255,1,0) were strong red, proving the raw 15% green duty was the culprit. Fixed: `light.gc.col = 2.8` (brightness gamma left off, WLED default).
  - **Self-test script (15 Oct):** `node tools/lamp-test.mjs [ip] [--camera "MacBook Pro Camera" | --no-camera]` checks config (PWM bus, gamma, limiter, Wi-Fi), cycles 10 colours + a dim ramp (webcam measures them, or watch mode), holds full white 20 s + 40 rapid changes checking uptime never resets. HTML report in `tools/reports/`. First run (watch mode): all passed, Wi-Fi 100%, no reboot. Webcam needs Camera permission for the terminal app (T3 Code had none). Webcam run (James, Terminal): all 7 colour checks passed (HA red seen as pure red); power test "failed" only because James switched the lamp off/on mid-test. Uptime then climbed steadily for 2+ min, no reboots.
  - **Boot preset (15 Oct):** preset 1 "Default" = solid cyan (0,229,255), bri 255; `def.ps = 1`, so the lamp comes back on in that colour after a power cut.
  - **Documented (15 Oct):** private repo [jolbol1/aftonsparv-wled](https://github.com/jolbol1/aftonsparv-wled). README = SP805E conversion guide, LESSONS.md = what we learnt. `tools/reports/` and the Govee FCC PDFs are gitignored.

---

## 2. Govee RGBIC TV light bars

### 2.1 What we know

- Model **confirmed H6056** (Flow Plus, RGBICWW; James's Govee app, 2026-10-14). FCC ID `2AQA6-H6056` (assumed; check the label). It has warm and cool white channels on top of the addressable RGB.
- **H6056 precedent** ([WLED forum](https://wled.discourse.group/t/govee-h6056-in-wled/13647)), the exact model. The 8-wire USB-C-style cable:

  | Wire | Function |
  |---|---|
  | Red | 12 V |
  | Black | GND |
  | White | Bar 1 RGB data |
  | Green | Bar 1 CW |
  | Yellow | Bar 1 WW |
  | Purple | Bar 2 RGB data |
  | Green (listed twice in the post; verify with a meter) | Bar 2 CW |
  | Grey | Bar 2 WW |

  The poster "hacked all the plastic bits apart" to reach the wires and drove the RGB from an ESP32 + WLED, "working great so far". They skipped the whites; the RGB's warm white "looked good enough". The post doesn't give the WLED LED type, colour order, LED count, level shifter, or the stock controller's chip. It's unknown how the CW/WW wires are driven (likely low-side analog PWM, like the lamp; check with a meter).
- **Controller board, from the FCC internal photos** (`govee-h6056-fcc/`: the PDFs James downloaded plus zoomed crops). Board `H6056_MAIN_V1.1`, dated 2021/5/8, about 6×5 cm, inside a small inline box with 3 buttons and a mic. 12 V comes in on a DC barrel jack; the USB-C socket is the output to the bars.
  - **Wi-Fi: Realtek RTL8710BN** on a custom module ("8710_WIFI module_BANZAI V1.0"), with **Winbond 25Q32JVSIQ (4 MB) flash**. A `3V3 TX RX GND` header sits beside it. **No ESP32 anywhere → WLED is impossible on the stock board.**
  - **BLE: Freqchip FR8018HA** (ARM BLE SoC), sitting next to the USB-C output. There's a second header, `GND RST CLK DAT 3V3`, which looks like SWD (probably for this chip).
  - **4× AO3400 N-MOSFETs** ("3400", SOT-23) on the back: almost certainly low-side switches for CW1, WW1, CW2 and WW2. This confirms the whites are analog PWM, like the lamp.
  - Also on board: an NCE30P20 P-MOSFET (input switching), a small buck (SOT-23-6 + inductor) for 3.3 V, and an unpopulated TSSOP-20 footprint on the back.
  - **Unknown: which chip drives the LEDs.** The FR8018HA's position by the USB-C output suggests it is the LED MCU, with the RTL8710BN as a Wi-Fi-to-UART bridge, a common Govee split. To settle it, use a continuity test from the USB-C data pins and the AO3400 gates back to the chips.
- Other Govee products also use Realtek: the H6086 bulb has an RTL8710BX ([blakadder](https://templates.blakadder.com/govee_H6086.html)) and the H6008 bulb has an RTL8720CF ([Elektroda](https://www.elektroda.com/rtvforum/topic4099028.html)).
- **Protocol risk**: an older 4-pin Govee strip was WS2811 ([thread](https://wled.discourse.group/t/govee-4pin-stripe-can-i-use-this-for-wled/9380)). The newer Strip Light 2 Pro (H61FX) would not work with any WLED LED type, with or without a level shifter ([thread](https://wled.discourse.group/t/govee-strip-light-2-pro-h61fx-and-wled/13950)).
- **The bars' USB-C connector is not USB.** It carries 12 V and LED data. Never plug it into a charger or computer.
- No teardown of H6046/H6047/H6056 found. fccid.io, fcc.report, device.report and apps.fcc.gov all blocked automated access (Cloudflare or Akamai). Internal photos would be at FCC ID `2AQA6-H6046` (or `-H6047`, `-H6056`); open them in a real browser.

### 2.2 Three routes, cheapest first

**A. Local control, no hardware change.** H6046, H6047 and H6056 are on the Govee LAN API list ([openHAB](https://www.openhab.org/addons/bindings/govee/), [Home Assistant `govee_light_local`](https://home-assistant.io/integrations/govee_light_local)). Enable "LAN Control" in the Govee app. No custom effects. Some users report H6046 discovery issues ([SignalRGB](https://forum.signalrgb.com/t/govee-h6046-not-detected-but-on-supported-list/2362)).

**B. Flash custom firmware onto the existing Govee controller.** This depends on the chip:

| Chip found | Outcome |
|---|---|
| ESP32 (any variant) | Read the eFuses (`espefuse.py summary`, read-only). If secure boot and flash encryption are off → WLED or ESPHome. If on → route C. ([Espressif secure boot](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/secure-boot-v2.html)) |
| Realtek RTL8720CF / RTL8710BN, Beken BK7231 | ESPHome via LibreTiny ([docs](https://docs.libretiny.eu/docs/flashing/esphome/)) or [OpenBeken](https://github.com/openshwprojects/OpenBK7231T_App). **No WLED.** Addressable-LED support varies by chip; check before flashing. |
| Telink / BLE-only | Not practical → route C |

Govee precedents: the H601A downlight uses an RTL8720CF, flashed with ESPHome via ltchiptool, with test points on the module edge and 115200 baud only ([ESPHome devices](https://devices.esphome.io/devices/govee-h601a-6in-recessed-rgbcct-light/)). The H61541A1 strip uses a T103 module with an RTL8710BN ([Elektroda](https://www.elektroda.com/rtvforum/topic4095269.html)).

**Always dump the stock firmware first** (`esptool read_flash` or `ltchiptool flash read`) so the change is reversible.

CP2102 adapter caveats (B07XRF152K): it has a USB-A plug (needs a USB-C adapter for the Mac). Its 3.3 V pin can't power a Wi-Fi chip, so power the controller from its own supply and share GND. It has no DTR, so enter boot mode manually.

**C. Replace the controller with an ESP32 + WLED.** Not yet bought:
- ESP32. A spare C3 SuperMini works: WLED drives 2 digital outputs on the C3, which is enough for one data line per bar. A classic ESP32 gives headroom for more outputs or sound reactivity.
- 12 V → 5 V buck for the ESP32: DollaTek MP1584 ×5 [B07DJ5HZ7G](https://www.amazon.co.uk/dp/B07DJ5HZ7G), £4.99.
- Level shifter 3.3 → 5 V for data: SN74AHCT125N ×10 [B0GKNSSDD7](https://www.amazon.co.uk/dp/B0GKNSSDD7), £8.99. Don't use BSS138 "I2C level converter" modules; they are too slow for LED data.
- Optional logic analyser to decode the stock data line in PulseView before cutting anything: [B0D868ST5C](https://www.amazon.co.uk/dp/B0D868ST5C), £6.99.
- Alternative all-in-one: a 12 V-input WLED controller (Gledopto ESP32 WLED, QuinLED Dig-Uno), which has the buck and level shifter on board.
- To make the bars USB-C powered: a PD trigger at 12 V. **12 V is optional in USB PD**, and many chargers (including Apple's) only offer 5/9/15/20 V. Either confirm the charger lists 12 V, or trigger 15 V and buck to 12 V with something heavier than an MP1584 (3 A max). Check the Govee adapter's label for the bars' wattage.
- WLED starting point: WS2811, 12 V. Iterate colour order and LED count.

**Verdict for the H6056 (2026-10-14): route C.** Route B would mean ESPHome via LibreTiny on the RTL8710BN (no WLED). It only helps if the RTL8710BN drives the LEDs directly. If the FR8018HA drives them, you'd have to reverse-engineer Govee's chip-to-chip UART protocol. Route C is proven on this exact model.

Custom firmware instead of WLED (James asked 2026-10-14). WLED is only the off-the-shelf option.
- On a replacement ESP32: easy. Use Arduino + FastLED/NeoPixelBus, or ESPHome with custom effects.
- On the stock board, the limit is the chips, not WLED:
  - RTL8710BN: custom Arduino code via LibreTiny (or Realtek's Ameba SDK), flashed over UART with ltchiptool. It has no ESP32-style RMT peripheral, so WS2811 timing is DIY (not checked whether LibreTiny has a driver). This only helps if the RTL drives the LED lines.
  - FR8018HA: BLE-only ARM chip. Freqchip's FR801xH SDK is public ([gitee](https://gitee.com/geek-pi/FR801xH-SDK); it covers FR8018H and has a tools folder for flashing and debugging). But it's Keil-based with no hobby community, and the read protection and SWD/UART flashing details are unknown. Custom firmware here gives BLE-only control unless the RTL is also rewritten.
  - Middle path: custom RTL firmware that sends Govee's own commands to the FR8018HA over UART, sniffed with the CP2102. This keeps Govee's effects, but the LAN API (route A) already gives local control.

**Custom-firmware investigation plan (James chose to pursue flashing, 2026-10-14).** Do it in this order; nothing here is irreversible:
1. **Open the controller**, solder header pins into the two unpopulated headers (`3V3 TX RX GND` and `GND RST CLK DAT 3V3`), and photograph both sides.
2. **Continuity-trace** (meter, power off): the USB-C output's data pins and the four AO3400 gates (via their gate resistors) → which chip pin they reach. This decides everything:
   - **RTL8710BN drives them** → custom firmware on the RTL is realistic (LibreTiny Arduino or ESPHome).
   - **FR8018HA drives them** → the RTL is only a Wi-Fi bridge; choose the middle path, a Freqchip SDK project, or route C.
   - Also find which header goes to which chip; `CLK/DAT` is likely SWD.
3. **Dump the RTL8710BN flash** with the CP2102 + ltchiptool (`pipx install ltchiptool`; `ltchiptool flash read` per the [AmebaZ flashing guide](https://docs.libretiny.eu/docs/platform/realtek-ambz/)). UART2: PA29 = RX2 ← adapter TX, PA30 = TX2 → adapter RX. Download mode: hold PA30 to GND while power-cycling (or pulsing CEN low), then release. The LibreTiny board page contradicts itself (PA29 vs PA30), so try PA30 first. The flash is **4 MB** (25Q32), not the 2 MB in LibreTiny's generic board IDs, so read the full 4 MB. Keep the dump safe; it may contain Wi-Fi credentials. An Elektroda user couldn't get UART comms with the RTL8710BN on a Govee H61541A1 ([thread](https://www.elektroda.com/rtvforum/topic4095269.html)), so expect some fiddling.
4. Run `strings` on the dump: effect names or WS2811 code imply the RTL drives the LEDs; an AT/UART command table implies it's a bridge.
5. Optional: sniff the RTL↔FR8018HA UART with the CP2102's RX (plus GND only) while using the Govee app, to capture Govee's internal protocol.
6. Only then write firmware. On the RTL there's no confirmed addressable-LED driver in LibreTiny/ESPHome (search 2026-10-14), so WS2811 output is bit-bang or SPI-encoded DIY; the whites are plain PWM.

Needs: multimeter (Wickes), CP2102 (have), USB-C→USB-A adapter for the Mac, header pins or thin wire, soldering iron.

**Flashing over Wi-Fi instead (James asked 2026-10-14).** There's real precedent, but on a different Govee product:
- Include Security replaced the firmware of a GoveeLife space heater over Wi-Fi ([write-up, Feb 2025](https://blog.includesecurity.com/2025/02/replacing-a-space-heater-firmware-over-wifi/)). Its Realtek module (RTL8710C, AmebaZ2) checked for updates with **cleartext HTTP** POST `app.govee.com/device/rest/devices/v1/wifiCheckVersion`. The JSON reply carried an HTTP S3 `downloadUrl`, plus `md5` and `size`. The image was only checksummed (a byte sum appended to the file). Secure boot was off, and the per-section HMAC key sat in the image header.
  - Their method: DNS-redirect `app.govee.com` on a test Wi-Fi network to a Flask server, then serve a patched image (patched in Ghidra; HMAC and checksum recomputed with a script).
  - Same architecture as the H6056: the Realtek module talks to a second MCU over UART via `Govee_Uart_Protocol_Package`, and that MCU drives the hardware.
  - **Their first patched image bricked the device**; they recovered it by desoldering the module and reflashing with ltchiptool.
  - Govee said it would move to asymmetric signing and HTTPS/MQTTS.
- **CVE-2025-10910** ([CERT Polska](https://cert.pl/en/posts/2025/12/CVE-2025-10910/), Dec 2025) was verified on the **H6056** itself (firmware 1.08.13). It's a cloud binding flaw, not a firmware one, but Govee then pushed security firmware updates to the H6056. So James's unit has likely had the update path hardened. Hardware versions 1.00.10 and 1.00.11 "cannot receive firmware update due to hardware limitations".
- Differences for us: the H6056 uses the RTL8710BN (AmebaZ, an older family with a different image format from the heater's AmebaZ2). Whatever runs on the RTL still has to talk to the FR8018HA unless the RTL drives the LEDs directly. LibreTiny builds don't output Govee's OTA format.
- **James's unit: firmware 1.10.02** (2026-10-14). That's newer than the CVE-tested 1.08.13, so it has had Govee's post-CVE updates, and its hardware evidently takes updates (so it's probably not hardware 1.00.10/1.00.11). Assume the update path is hardened until proven otherwise.
- **Decision (James, 2026-10-14): serial only.** Wi-Fi flashing is dropped; don't pursue it. Flash and recover over the serial header (investigation plan above).

Route C specifics for the H6056:
- Power: reuse the Govee 12 V barrel-jack adapter, so no PD trigger is needed.
- Hook up to the bars by cutting the cable as the forum poster did, or with a **full 24-pin USB-C female breakout** (not the 6-pin power-only type) so the bars' cable plugs in uncut. Map the pins by continuity against the wire table above.
- ESP32-C3: 2 data lines through the 74AHCT125. For the whites, use 4 spare IRLZ44N on PWM pins (low side, same as the lamp), or skip them as the forum poster did. WLED on the C3 allows this: up to 6 buses, 2 of them digital, plus 6 PWM channels (`const.h`, 0.15: "2 digital & 2 analog RGB or 6 PWM white"). So 2 digital + 2 PWM-CCT buses (4 PWM pins) fit.
- Still to buy: MP1584 buck (12 V → 5 V for the C3), 74AHCT125, and optionally the USB-C breakout.

### 2.2b Chosen build: one USB-C cable (James, 2026-10-14)

Power budget: the H6056 is 18 W max, 12 W typical ([datacompagniet listing](https://eshop.datacompagniet.dk/govee-rgbicww-wifi-bluetooth-flow/cat-p/c/p1003758967/l_en), [MediaMarkt PL](https://mediamarkt.pl/pl/product/_panel-led-govee-h6056-czarny-164580025.html)), so about 1.5 A at 12 V.

```
USB-C PD charger (must list 12V ≥1.5A) → GELRHONR trigger set to 12 V (meter-check first)
  12V → bars red (both bars share it)
      → 12V→5V buck (MP1584; stopgap: a car USB adapter) → C3 5V pin
  GND → bars black, C3 GND, buck GND, all MOSFET sources
C3 GPIO4 ─330Ω─► bar 1 data (white)      C3 GPIO5 ─330Ω─► bar 2 data (purple)
C3 GPIO6/7  ─100Ω─► IRLZ44N gates → bar 1 CW (green) / WW (yellow)   (10k gate→GND each)
C3 GPIO10/3 ─100Ω─► IRLZ44N gates → bar 2 CW (green) / WW (grey)
```

- Without a 74AHCT125, the 3.3 V data often works over short wires; add the shifter if you see flicker or wrong colours.
- Boosting 5 V with an MT3608 was rejected: 18 W at 12 V from 5 V is about 4 A input, far beyond the module (~6–8 W realistic).
- PD trigger safety: if the board has solder pads for a fixed voltage, use them. Otherwise set 12 V, meter it, then tape over the button/switch. 20 V would kill the bars. Many chargers (Apple's included) don't offer 12 V; check the charger's label for a `12V⎓` line.
- Wire ID: cut the bars' cable, leaving a stub on the controller side. Plug that stub into the stock controller and power it. Meter red/black for 12 V, and toggle the whites in the app to find CW/WW (low side: about 0 V when on).
- WLED: 2× WS281x buses (GPIO 4, 5; iterate LED count and colour order) + 2× PWM CCT buses (6+7, 10+3; swap the pins if warm and cool are reversed). Set the brightness limiter so the total stays within the charger's 12 V rating.
- Same as the lamp: flash WLED before wiring, and never plug the C3's USB into a computer while its 5 V pin is powered.

### 2.2c Parked: privacy without flashing

James trusts the LAN API for control but not what the controller sends to Govee. Options that don't touch the hardware:
- Give the controller a DHCP reservation, then block its internet access at the router. Home Assistant / LAN API control is local UDP, so it keeps working. The Govee app's cloud features, voice assistants and firmware updates stop. Firmware 1.10.02 already includes the post-CVE-2025-10910 fixes.
- A Pi-hole or AdGuard Home DNS log shows which domains it contacts, if James wants to see before blocking.
- An IoT VLAN is possible, but LAN API discovery uses multicast, so it needs a multicast relay or same-subnet Home Assistant.

### 2.3 Next steps (only if revisited)

1. ~~Model number~~ (H6056). Still read the adapter's wattage, and open https://fccid.io/2AQA6-H6056 in a real browser for internal photos.
2. Open the controller. Photograph both sides of the board, the chip and module markings, and any TX/RX/3V3/GND/IO0 pads.
3. ~~Identify the chip~~ (done from the FCC photos: RTL8710BN + FR8018HA → route C). Optionally confirm that your unit's board matches `H6056_MAIN_V1.1`.
4. For route C: probe the wires (12 V, GND, data per bar) and optionally capture the data line with the logic analyser before buying parts.

---

## 3. Session notes

- ESP32-C3 SuperMini vs the classic ESP32 devkit James first linked ([B08DR5T897](https://www.amazon.co.uk/dp/B08DR5T897), ESP-WROOM-32 + CP2102). The C3 is single-core RISC-V with BLE only, 2 WLED digital outputs, 22×18 mm and lower power. The classic is dual-core with about 25 GPIO and more outputs, but is too big for the lamp.
- Amazon checks were done logged out (default UK location). Prime and next-day were verified on product pages; same-day was not checked.
- Amazon search helper used during research: `/tmp/amz-scripts/search.sh "<query>"` and `item.sh <ASIN>...` (agent-browser from content-terminal's `node_modules/.bin`). These live in /tmp, so recreate them if missing.
