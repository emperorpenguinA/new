'use strict';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const PICKER_SESSIONS_ENDPOINT = 'https://photospicker.googleapis.com/v1/sessions';
const PICKER_MEDIA_ITEMS_ENDPOINT = 'https://photospicker.googleapis.com/v1/mediaItems';
const PICKER_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

function buildAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', PICKER_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return assertOk(res);
}

async function createPickerSession(accessToken) {
  const res = await fetch(PICKER_SESSIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return assertOk(res);
}

async function getPickerSession(accessToken, sessionId) {
  const res = await fetch(`${PICKER_SESSIONS_ENDPOINT}/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return assertOk(res);
}

async function listPickedMediaItems(accessToken, sessionId) {
  const url = new URL(PICKER_MEDIA_ITEMS_ENDPOINT);
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('pageSize', '100');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await assertOk(res);
  return data.mediaItems || [];
}

/** baseUrl + サイズ指定 (例: "=d" で元データ, "=w300-h300" でサムネイル) で画像を取得する */
async function downloadPhoto(baseUrl, accessToken, sizeSuffix) {
  const res = await fetch(`${baseUrl}${sizeSuffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`画像のダウンロードに失敗しました。status=${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function assertOk(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Google APIの呼び出しに失敗しました。status=${res.status} body=${text}`);
  }
  return data;
}

module.exports = {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  createPickerSession,
  getPickerSession,
  listPickedMediaItems,
  downloadPhoto,
};
