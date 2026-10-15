#!/usr/bin/env node
// AFTONSPARV lamp self-test (SP805E + WLED).
//   node tools/lamp-test.mjs [ip] [--camera "MacBook Pro Camera"] [--no-camera] [--hold ms]
// 1. Checks the WLED config that matters for this lamp (PWM RGB on 25/26/27, gamma, limiter, Wi-Fi).
// 2. Cycles test colours. With a webcam pointed at the lamp it measures each one;
//    without (--no-camera) it holds each colour so you can watch.
// 3. Power test: full white for 20 s, then rapid colour changes, checking the controller never reboots.
// Writes tools/reports/<time>/report.html and restores the lamp's previous state at the end.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const IP = args.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) ?? '192.168.0.84';
const CAMERA = args.includes('--no-camera') ? null : flag('--camera', 'MacBook Pro Camera');
const HOLD = Number(flag('--hold', CAMERA ? 600 : 2500));
const BASE = `http://${IP}`;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'reports', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const mark = { pass: '\x1b[32m✓\x1b[0m', fail: '\x1b[31m✗\x1b[0m', info: '\x1b[36m•\x1b[0m', warn: '\x1b[33m!\x1b[0m' };
function record(section, name, status, detail = '', extra = {}) {
  results.push({ section, name, status, detail, ...extra });
  console.log(`  ${mark[status]} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}
// tt = transition for this call only, so colours switch instantly.
const setColour = (rgb, bri = 255) => api('/json/state', { on: true, bri, tt: 0, seg: [{ id: 0, fx: 0, col: [rgb] }] });
const setOff = () => api('/json/state', { on: false, tt: 0 });

// ---------- webcam ----------
class Camera {
  constructor(name, w = 320, h = 180) {
    Object.assign(this, { name, w, h, size: w * h * 3, buf: Buffer.alloc(0), count: 0, latest: null, err: '' });
  }
  start() {
    this.proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation', '-pixel_format', 'nv12',
      '-framerate', '30', '-video_size', '1280x720', '-i', this.name, '-vf', `scale=${this.w}:${this.h}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    this.proc.stdout.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= this.size) {
        this.latest = Buffer.from(this.buf.subarray(0, this.size));
        this.buf = this.buf.subarray(this.size);
        this.count++;
      }
    });
    this.proc.stderr.on('data', d => { this.err += d; });
  }
  async ready(timeout = 10000) {
    const t0 = Date.now();
    while (this.count < 15) {
      if (Date.now() - t0 > timeout || this.proc.exitCode !== null)
        throw new Error(`no frames from "${this.name}". ${this.err.trim() || 'Camera permission not granted to this terminal?'}`);
      await sleep(100);
    }
  }
  // Skip stale frames, then average a few fresh ones.
  async grab(skip = 8, n = 4) {
    const start = this.count;
    while (this.count < start + skip) await sleep(10);
    const acc = new Float32Array(this.size);
    for (let k = 0; k < n; k++) {
      const c = this.count;
      while (this.count === c) await sleep(5);
      for (let i = 0; i < this.size; i++) acc[i] += this.latest[i];
    }
    for (let i = 0; i < this.size; i++) acc[i] /= n;
    return acc;
  }
  stop() { this.proc?.kill('SIGKILL'); }
}

const luma = (f, i) => 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2];
// The lamp = the pixels that brighten most between "off" and "white".
function buildMask(off, white) {
  const diffs = [];
  for (let i = 0; i < off.length; i += 3) diffs.push(luma(white, i) - luma(off, i));
  const max = Math.max(...diffs);
  if (max < 25) return null;
  const mask = [];
  diffs.forEach((d, p) => { if (d >= max * 0.5) mask.push(p * 3); });
  return mask;
}
function measure(frame, off, mask) {
  const s = [0, 0, 0];
  for (const i of mask) for (let c = 0; c < 3; c++) s[c] += Math.max(0, frame[i + c] - off[i + c]);
  return s.map(v => v / mask.length);
}
function hueOf([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const display = m => { const k = 255 / Math.max(1, ...m); return m.map(v => Math.round(v * k)); };
function saveJpg(frame, cam, file) {
  const ppm = file.replace(/\.jpg$/, '.ppm');
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${cam.w} ${cam.h}\n255\n`), Buffer.from(Uint8Array.from(frame, v => Math.round(v)))]));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', ppm, file]);
  unlinkSync(ppm);
}

// ---------- tests ----------
const COLOURS = [
  { name: 'Red', rgb: [255, 0, 0], ch: 0, look: 'strong red' },
  { name: 'Green', rgb: [0, 255, 0], ch: 1, look: 'green' },
  { name: 'Blue', rgb: [0, 0, 255], ch: 2, look: 'blue' },
  { name: 'Yellow', rgb: [255, 255, 0], hue: 60, look: 'yellow (may lean green)' },
  { name: 'Cyan', rgb: [0, 255, 255], hue: 180, look: 'cyan' },
  { name: 'Magenta', rgb: [255, 0, 255], hue: 300, look: 'magenta/purple' },
  { name: 'Home Assistant red', rgb: [255, 38, 0], ch: 0, look: 'strong red, NOT orange (gamma check)' },
  { name: 'Orange', rgb: [255, 128, 0], look: 'orange' },
  { name: 'Pink', rgb: [255, 0, 128], look: 'pink' },
  { name: 'White', rgb: [255, 255, 255], look: 'white-ish (RGB white is never perfect)' },
];

async function configChecks() {
  console.log('\nConfig');
  const info = await api('/json/info');
  const cfg = await api('/json/cfg');
  record('Config', 'Controller reachable', 'pass', `WLED ${info.ver}, ${info.ip}`);
  const ins = cfg.hw.led.ins;
  const bus = ins[0];
  const pwmOk = ins.length === 1 && bus.type === 43 && [25, 26, 27].every((p, i) => bus.pin[i] === p);
  record('Config', 'Output = PWM RGB on IO25/26/27', pwmOk ? 'pass' : 'fail',
    ins.map(b => `type ${b.type} pins ${b.pin.join('/')}`).join('; '));
  record('Config', 'PWM frequency', 'info', `${bus.freq} Hz`);
  const limiter = cfg.hw.led.maxpwr;
  record('Config', 'Brightness limiter off', limiter === 0 ? 'pass' : 'fail', `maxpwr ${limiter} mA`);
  const gc = cfg.light.gc;
  record('Config', 'Colour gamma on', gc.col > 1 ? 'pass' : 'fail', gc.col > 1 ? `gamma ${gc.col}` : 'off — HA colours will look washed toward yellow');
  const sig = info.wifi.signal;
  record('Config', 'Wi-Fi signal', sig >= 60 ? 'pass' : sig >= 35 ? 'warn' : 'fail', `${sig}% (RSSI ${info.wifi.rssi} dBm)`);
  return info;
}

async function colourTests(cam) {
  console.log(`\nColours${cam ? ' (webcam)' : ' (watch the lamp)'}`);
  let off, mask;
  if (cam) {
    await setOff(); await sleep(HOLD); off = await cam.grab();
    await setColour([255, 255, 255]); await sleep(HOLD); const white = await cam.grab();
    mask = buildMask(off, white);
    if (!mask) {
      record('Colours', 'Find lamp in camera view', 'fail', 'white vs off barely changes the picture — point the camera at the lamp');
      cam = null;
    } else {
      record('Colours', 'Find lamp in camera view', 'pass', `${mask.length} pixels`);
      saveJpg(off, cam, join(outDir, 'off.jpg'));
    }
  }
  for (const [n, c] of COLOURS.entries()) {
    await setColour(c.rgb);
    if (!cam) {
      record('Colours', c.name, 'info', `[${c.rgb}] should look ${c.look}`, { rgb: c.rgb });
      await sleep(HOLD);
      continue;
    }
    await sleep(HOLD);
    const frame = await cam.grab();
    const m = measure(frame, off, mask);
    const img = `c${n}.jpg`;
    saveJpg(frame, cam, join(outDir, img));
    const h = hueOf(m);
    let status = 'info', detail = `camera saw rgb(${display(m)}), hue ${h?.toFixed(0) ?? '–'}°`;
    if (c.ch !== undefined) {
      const dom = m[c.ch], others = m.filter((_, i) => i !== c.ch);
      status = m.indexOf(Math.max(...m)) === c.ch && others.every(v => v < dom * 0.5) ? 'pass' : 'fail';
    } else if (c.hue !== undefined) {
      status = h !== null && hueGap(h, c.hue) <= 40 ? 'pass' : 'fail';
      detail += ` (want ≈${c.hue}°)`;
    }
    record('Colours', c.name, status, detail, { rgb: c.rgb, seen: display(m), img });
  }

  console.log('\nDimming (red)');
  const levels = [255, 128, 48, 12, 3];
  const lum = [];
  for (const bri of levels) {
    await setColour([255, 0, 0], bri);
    if (!cam) { await sleep(HOLD * 0.6); continue; }
    await sleep(250);  // read before auto-exposure fully catches up
    const m = measure(await cam.grab(4, 3), off, mask);
    lum.push(m[0]);
  }
  if (cam) {
    const falling = lum.every((v, i) => i === 0 || v <= lum[i - 1] * 1.05);
    record('Dimming', 'Red fades down smoothly', falling ? 'pass' : 'warn',
      `camera red level ${lum.map(v => v.toFixed(0)).join(' → ')} (auto-exposure can flatten this; trust your eyes)`);
  } else record('Dimming', 'Red fades 255 → 3', 'info', 'should step down evenly and stay red, no flicker');
}

async function powerTest(startUptime) {
  console.log('\nPower (watching for reboots)');
  await setColour([255, 255, 255]);
  let last = startUptime, rebooted = false, misses = 0;
  for (let t = 0; t < 10; t++) {
    await sleep(2000);
    try {
      const up = (await api('/json/info')).uptime;
      if (up < last) rebooted = true;
      last = up;
    } catch { misses++; }
  }
  record('Power', 'Full white for 20 s, no reboot', rebooted ? 'fail' : misses > 2 ? 'warn' : 'pass',
    rebooted ? 'uptime reset — brownout or crash' : `${misses} missed polls`);

  for (let k = 0; k < 40; k++) {
    await api('/json/state', { on: true, bri: 255, tt: 0, seg: [{ id: 0, col: [[Math.random() * 256 | 0, Math.random() * 256 | 0, Math.random() * 256 | 0]] }] }).catch(() => misses++);
    await sleep(60);
  }
  await sleep(1500);
  const up = (await api('/json/info')).uptime;
  record('Power', '40 rapid colour changes, still responsive', up >= last ? 'pass' : 'fail', `uptime ${up} s`);
}

function writeReport(info) {
  const chip = s => `<span class="chip ${s}">${{ pass: 'PASS', fail: 'FAIL', warn: 'CHECK', info: 'INFO' }[s]}</span>`;
  const sw = c => c ? `<span class="sw" style="background:rgb(${c})"></span>` : '';
  const rows = results.map(r => `<tr><td>${r.section}</td><td>${r.name}</td><td>${chip(r.status)}</td><td>${sw(r.rgb)}</td><td>${sw(r.seen)}</td><td>${r.img ? `<img src="${r.img}">` : ''}</td><td class="d">${r.detail}</td></tr>`).join('\n');
  const fails = results.filter(r => r.status === 'fail').length;
  writeFileSync(join(outDir, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Lamp test</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:24px}h1{font-size:20px}table{border-collapse:collapse}
td,th{padding:6px 10px;border-bottom:1px solid #333;text-align:left;vertical-align:middle}th{color:#999;font-weight:500}
.chip{padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600}.pass{background:#1f5f2f}.fail{background:#7a1f1f}.warn{background:#7a5a10}.info{background:#24425f}
.sw{display:inline-block;width:36px;height:24px;border-radius:4px;border:1px solid #444}img{height:54px;border-radius:4px}.d{color:#aaa;font-size:13px}</style>
<h1>AFTONSPARV lamp test — ${new Date().toLocaleString('en-GB')} — WLED ${info.ver} @ ${IP} — ${fails ? `<span style="color:#f66">${fails} failed</span>` : '<span style="color:#6c6">all passed</span>'}</h1>
<table><tr><th>Section</th><th>Test</th><th>Result</th><th>Sent</th><th>Camera saw</th><th>Frame</th><th>Detail</th></tr>${rows}</table>`);
  return fails;
}

// ---------- run ----------
mkdirSync(outDir, { recursive: true });
const saved = await api('/json/state');
const restore = () => api('/json/state', { on: saved.on, bri: saved.bri, tt: 0,
  seg: [{ id: 0, col: saved.seg[0].col, fx: saved.seg[0].fx, pal: saved.seg[0].pal }] }).catch(() => {});
let cam = null;
process.on('SIGINT', async () => { cam?.stop(); await restore(); process.exit(130); });

console.log(`Lamp test → ${IP}`);
const info = await configChecks();
if (CAMERA) {
  cam = new Camera(CAMERA);
  cam.start();
  try { await cam.ready(); }
  catch (e) { console.log(`\n  ${mark.warn} Webcam unavailable: ${e.message}\n    Falling back to watch mode.`); cam.stop(); cam = null; }
}
try {
  await colourTests(cam);
  await powerTest(info.uptime);
} finally {
  cam?.stop();
  await restore();
}
const fails = writeReport(info);
console.log(`\n${fails ? `${fails} failed` : 'All passed'}. Report: ${join(outDir, 'report.html')}`);
process.exit(fails ? 1 : 0);
