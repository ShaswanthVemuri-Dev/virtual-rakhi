const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const hashes = require('./runtime-hashes.cjs');

const root = path.resolve(__dirname, '..');
const targetDir = path.join(root, 'public', 'models');
const models = [
  ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  ['hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  ['pose_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
];

fs.mkdirSync(targetDir, { recursive: true });

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const download = (url, target, redirects = 0) => new Promise((resolve, reject) => {
  const request = https.get(url, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
      response.resume();
      return resolve(download(response.headers.location, target, redirects + 1));
    }
    if (response.statusCode !== 200) {
      response.resume();
      return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
    }
    const temporary = `${target}.part`;
    const file = fs.createWriteStream(temporary);
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      fs.renameSync(temporary, target);
      resolve();
    });
    file.on('error', reject);
  });
  request.setTimeout(30_000, () => request.destroy(new Error('Download timed out.')));
  request.on('error', reject);
});

(async () => {
  for (const [name, url] of models) {
    const target = path.join(targetDir, name);
    const expected = hashes[`public/models/${name}`];
    if (fs.existsSync(target) && sha256(target) === expected) {
      console.log(`[models] ${name} verified.`);
      continue;
    }
    console.log(`[models] Downloading ${name}...`);
    await download(url, target);
    if (sha256(target) !== expected) {
      fs.unlinkSync(target);
      throw new Error(`${name} failed its SHA-256 integrity check.`);
    }
  }
  console.log('[models] MediaPipe models ready.');
})().catch((error) => {
  console.error(`[models] ${error.message}`);
  process.exit(1);
});
