const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MODEL_URLS = [
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/ssd_mobilenetv1_model-weights_manifest.json',
    file: 'ssd_mobilenetv1_model-weights_manifest.json'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/ssd_mobilenetv1_model-shard1',
    file: 'ssd_mobilenetv1_model-shard1'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-weights_manifest.json',
    file: 'face_landmark_68_model-weights_manifest.json'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-shard1',
    file: 'face_landmark_68_model-shard1'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-weights_manifest.json',
    file: 'face_recognition_model-weights_manifest.json'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard1',
    file: 'face_recognition_model-shard1'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard2',
    file: 'face_recognition_model-shard2'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/tiny_face_detector_model-weights_manifest.json',
    file: 'tiny_face_detector_model-weights_manifest.json'
  },
  {
    url: 'https://github.com/justadudewhohacks/face-api.js/raw/master/weights/tiny_face_detector_model-shard1',
    file: 'tiny_face_detector_model-shard1'
  },
];

const OUTPUT_DIR = path.join(__dirname, 'public', 'models');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`Downloading: ${path.basename(dest)}`);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function downloadModels() {
  console.log('Starting model download...\n');
  
  // Create directory if not exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Delete old models first
  console.log('Deleting old models...\n');
  const existingFiles = fs.readdirSync(OUTPUT_DIR);
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(OUTPUT_DIR, file));
    console.log(`Deleted: ${file}`);
  }
  
  // Download new models
  for (const model of MODEL_URLS) {
    const dest = path.join(OUTPUT_DIR, model.file);
    
    try {
      await downloadFile(model.url, dest);
    } catch (error) {
      console.error(`Error downloading ${model.file}:`, error.message);
    }
  }
  
  console.log('\n=== Download complete! ===\n');
  
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log(`Total files: ${files.length}\n`);
  
  for (const f of files) {
    const stats = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} - ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }
}

downloadModels().catch(console.error);