'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const { scanForRamenSpots } = require('./src/scanPhotos');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 直近でスキャンしたフォルダのみサムネイル配信を許可する(単純なパストラバーサル対策)
let lastScanRoot = null;

app.post('/api/scan', async (req, res) => {
  const folderPath = req.body && req.body.folderPath;
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPathを指定してください。' });
  }

  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ error: `フォルダが見つかりません: ${resolved}` });
  }

  try {
    const result = await scanForRamenSpots(resolved);
    lastScanRoot = resolved;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/thumbnail', (req, res) => {
  const relPath = req.query.path;
  if (!lastScanRoot || !relPath) {
    return res.sendStatus(404);
  }
  const resolved = path.resolve(lastScanRoot, relPath);
  if (!resolved.startsWith(lastScanRoot + path.sep) && resolved !== lastScanRoot) {
    return res.sendStatus(403);
  }
  res.sendFile(resolved, (err) => {
    if (err && !res.headersSent) {
      res.sendStatus(404);
    }
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`ラーメンマップサーバー起動: http://localhost:${port}`);
});
