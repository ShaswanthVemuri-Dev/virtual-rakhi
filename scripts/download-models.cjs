const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..');
const targetDir = path.join(root, 'public', 'models');
const models = [
  ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
  ['hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  ['pose_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
];

fs.mkdirSync(targetDir, { recursive: true });

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
    if (fs.existsSync(target) && fs.statSync(target).size > 100_000) {
      console.log(`[models] ${name} already present.`);
      continue;
    }
    console.log(`[models] Downloading ${name}...`);
    await download(url, target);
  }
  console.log('[models] MediaPipe models ready.');
})().catch((error) => {
  console.error(`[models] ${error.message}`);
  process.exit(1);
});
