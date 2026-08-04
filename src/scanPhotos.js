'use strict';

const fs = require('fs/promises');
const path = require('path');
const exifr = require('exifr');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);

async function findImageFiles(rootDir) {
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

/**
 * Google Takeoutは写真本体とは別に "<ファイル名>.json"
 * (長いファイル名の場合は "<ファイル名>.supplemental-metadata.json" になることがある)
 * というサイドカーファイルを出力し、その中の geoData に位置情報が入っていることがある。
 * 撮影時にGPSが記録されていない写真でも、Google側が推定した位置情報が入っている場合がある。
 */
async function readJsonSidecarGeoData(imagePath) {
  const candidates = [`${imagePath}.json`, `${imagePath}.supplemental-metadata.json`];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const data = JSON.parse(raw);
      const geo = data.geoData || data.geoDataExif;
      if (geo && (geo.latitude !== 0 || geo.longitude !== 0)) {
        return { latitude: geo.latitude, longitude: geo.longitude };
      }
    } catch (e) {
      // サイドカーファイルが無い/読めない場合は次の候補、または諦める
    }
  }
  return null;
}

async function extractGps(imagePath) {
  try {
    const gps = await exifr.gps(imagePath);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch (e) {
    // EXIF解析に失敗した場合はJSONサイドカーにフォールバックする
  }
  return readJsonSidecarGeoData(imagePath);
}

/** rootDir配下を再帰的に走査し、位置情報が取れた写真の一覧(相対パス付き)を返す */
async function scanForRamenSpots(rootDir) {
  const files = await findImageFiles(rootDir);

  const results = await Promise.all(
    files.map(async (filePath) => {
      const gps = await extractGps(filePath);
      if (!gps) return null;
      return {
        path: path.relative(rootDir, filePath).split(path.sep).join('/'),
        filename: path.basename(filePath),
        lat: gps.latitude,
        lng: gps.longitude,
      };
    })
  );

  return {
    totalPhotos: files.length,
    spots: results.filter(Boolean),
  };
}

module.exports = { scanForRamenSpots };
