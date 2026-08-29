const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const hashes = require('./runtime-hashes.cjs');

const root = path.resolve(__dirname, '..');
const sourceFiles = [
  'src/app/App.tsx',
  'src/app/NetworkCeremonyApp.tsx',
  'src/vision/visionManager.ts',
  'src/rakhi/handRetargeting.ts',
  'src/rakhi/tyingStateMachine.ts',
  'src/ar/ceremonyRenderer.ts',
  'src/ar/rakhi3dRenderer.ts',
  'src/rtc/peerSession.ts',
  'src/rtc/messages.ts',
  'src/media/acquireMedia.ts',
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let failed = false;

for (const relative of sourceFiles) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`[check] Missing required source file: ${relative}`);
    failed = true;
  }
}

for (const [relative, expected] of Object.entries(hashes)) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    console.error(`[check] Missing required runtime file: ${relative}`);
    failed = true;
  } else if (sha256(full) !== expected) {
    console.error(`[check] Runtime hash mismatch: ${relative}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`[check] Runtime integrity passed (${Object.keys(hashes).length} verified assets/models/runtime files).`);
