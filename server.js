'use strict';

require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const exifr = require('exifr');

const googlePhotos = require('./src/googlePhotos');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SESSION_SECRET,
  PORT,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error(
    '.envにGOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URIを設定してください' +
      '(.env.exampleを参考にしてください)'
  );
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.accessToken) });
});

app.get('/auth/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const url = googlePhotos.buildAuthorizationUrl({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    state,
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).send(`Google認可がキャンセルされました: ${error}`);
  }
  if (!state || state !== req.session.oauthState) {
    return res.status(400).send('不正なリクエストです(state不一致)。');
  }
  delete req.session.oauthState;
  if (!code) {
    return res.status(400).send('認可コードがありません。');
  }

  try {
    const token = await googlePhotos.exchangeCodeForToken({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI,
      code,
    });
    if (!token.access_token) {
      throw new Error(`アクセストークンの取得に失敗しました: ${JSON.stringify(token)}`);
    }
    req.session.accessToken = token.access_token;
    res.redirect('/');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post('/api/picker', requireAuth, async (req, res) => {
  try {
    const session_ = await googlePhotos.createPickerSession(req.session.accessToken);
    res.json({ sessionId: session_.id, pickerUri: session_.pickerUri });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/picker/:sessionId', requireAuth, async (req, res) => {
  try {
    const session_ = await googlePhotos.getPickerSession(req.session.accessToken, req.params.sessionId);
    res.json({ mediaItemsSet: Boolean(session_.mediaItemsSet) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/picker/:sessionId/spots', requireAuth, async (req, res) => {
  try {
    const accessToken = req.session.accessToken;
    const mediaItems = await googlePhotos.listPickedMediaItems(accessToken, req.params.sessionId);

    req.session.thumbnailUrls = req.session.thumbnailUrls || {};
    const spots = [];
    let totalPicked = 0;

    for (const item of mediaItems) {
      const mediaFile = item.mediaFile;
      if (!mediaFile || !mediaFile.baseUrl) continue;
      totalPicked += 1;
      req.session.thumbnailUrls[item.id] = mediaFile.baseUrl;

      try {
        const original = await googlePhotos.downloadPhoto(mediaFile.baseUrl, accessToken, '=d');
        const gps = await exifr.gps(original);
        if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
          spots.push({
            id: item.id,
            filename: mediaFile.filename,
            lat: gps.latitude,
            lng: gps.longitude,
          });
        }
      } catch (e) {
        // GPSが取れない写真は地図上ではスキップする
      }
    }

    res.json({ totalPicked, spots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/photo/:mediaItemId', requireAuth, async (req, res) => {
  const baseUrl = (req.session.thumbnailUrls || {})[req.params.mediaItemId];
  if (!baseUrl) {
    return res.sendStatus(404);
  }
  try {
    const thumbnail = await googlePhotos.downloadPhoto(baseUrl, req.session.accessToken, '=w300-h300');
    res.set('Content-Type', 'image/jpeg');
    res.send(thumbnail);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: '未認証です。/auth/google からログインしてください。' });
  }
  next();
}

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`ラーメンマップサーバー起動: http://localhost:${port}`);
});
