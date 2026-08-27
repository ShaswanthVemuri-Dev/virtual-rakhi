const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const required = [
  'public/assets/rakhi.png',
  'public/assets/tilak.png',
  'public/assets/tilak_hand.png',
  'public/assets/aarti_thali.png',
  'public/assets/flower_01.png',
  'public/assets/flower_02.png',
  'public/assets/flower_03.png',
  'public/assets/rakhi.glb',
  'public/models/face_landmarker.task',
  'public/models/hand_landmarker.task',
  'public/models/pose_landmarker.task',
  'src/app/App.tsx',
  'src/app/NetworkCeremonyApp.tsx',
  'src/vision/visionManager.ts',
  'src/rakhi/handRetargeting.ts',
  'src/rakhi/tyingStateMachine.ts',
  'src/ar/ceremonyRenderer.ts',
  'src/rtc/peerSession.ts',
  'src/rtc/messages.ts',
  'src/media/acquireMedia.ts',
];

let failed = false;
for (const relative of required) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    console.error(`[check] Missing required file: ${relative}`);
    failed = true;
  }
}

const wasmDir = path.join(root, 'public', 'wasm');
const wasmFiles = fs.existsSync(wasmDir) ? fs.readdirSync(wasmDir).filter((name) => name.endsWith('.wasm') || name.endsWith('.js')) : [];
if (wasmFiles.length < 2) {
  console.error('[check] MediaPipe WASM runtime is incomplete in public/wasm.');
  failed = true;
}

if (failed) process.exit(1);
console.log(`[check] Virtual Rakhi runtime integrity check passed (${wasmFiles.length} MediaPipe WASM/JS files found).`);
