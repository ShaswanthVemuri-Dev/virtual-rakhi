const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = path.join(root, 'public', 'wasm');

if (!fs.existsSync(source)) {
  console.error('[wasm] @mediapipe/tasks-vision wasm folder was not found. Run npm install first.');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
for (const entry of fs.readdirSync(source)) {
  const from = path.join(source, entry);
  const to = path.join(target, entry);
  if (fs.statSync(from).isFile()) fs.copyFileSync(from, to);
}
console.log('[wasm] MediaPipe WASM runtime copied to public/wasm.');
