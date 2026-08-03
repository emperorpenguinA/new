package jp.co.rakus.ramen.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;

import jp.co.rakus.ramen.config.GooglePhotosConfig;

/**
 * Google OAuth2 と Google Photos Picker API を呼び出す薄いHTTPクライアント。
 * google-api-client 等のSDKに依存せず、標準の HttpURLConnection のみで実装している
 * (このプロジェクトにはビルドツール/依存管理が無いため)。
 */
public class GooglePhotosClient {

	private static final String AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
	private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
	private static final String PICKER_SESSIONS_ENDPOINT = "https://photospicker.googleapis.com/v1/sessions";
	private static final String PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

	public static String buildAuthorizationUrl(GooglePhotosConfig config, String state) {
		StringBuilder url = new StringBuilder(AUTH_ENDPOINT);
		url.append("?client_id=").append(encode(config.getClientId()));
		url.append("&redirect_uri=").append(encode(config.getRedirectUri()));
		url.append("&response_type=code");
		url.append("&scope=").append(encode(PICKER_SCOPE));
		url.append("&access_type=offline");
		url.append("&prompt=consent");
		url.append("&state=").append(encode(state));
		return url.toString();
	}

	/**
	 * 認可コードをアクセストークンに交換する。
	 * @return {"access_token": "...", "refresh_token": "...", ...} を含むMap
	 */
	public Map<String, Object> exchangeCodeForToken(GooglePhotosConfig config, String code) throws IOException {
		StringBuilder body = new StringBuilder();
		body.append("code=").append(encode(code));
		body.append("&client_id=").append(encode(config.getClientId()));
		body.append("&client_secret=").append(encode(config.getClientSecret()));
		body.append("&redirect_uri=").append(encode(config.getRedirectUri()));
		body.append("&grant_type=authorization_code");

		String response = post(TOKEN_ENDPOINT, body.toString(), null, "application/x-www-form-urlencoded");
		return JsonParser.parseObject(response);
	}

	/** Picker APIのセッションを新規作成する。戻り値には id / pickerUri / pollingConfig が含まれる。 */
	public Map<String, Object> createPickerSession(String accessToken) throws IOException {
		String response = post(PICKER_SESSIONS_ENDPOINT, "{}", accessToken, "application/json");
		return JsonParser.parseObject(response);
	}

	/** Picker セッションの現在の状態(mediaItemsSetなど)を取得する。 */
	public Map<String, Object> getPickerSession(String accessToken, String sessionId) throws IOException {
		String response = get(PICKER_SESSIONS_ENDPOINT + "/" + encode(sessionId), accessToken);
		return JsonParser.parseObject(response);
	}

	/** ユーザーが選択したメディアアイテムの一覧を取得する。 */
	public List<Object> listPickedMediaItems(String accessToken, String sessionId) throws IOException {
		String url = "https://photospicker.googleapis.com/v1/mediaItems?sessionId=" + encode(sessionId) + "&pageSize=100";
		String response = get(url, accessToken);
		Map<String, Object> obj = JsonParser.parseObject(response);
		Object items = obj.get("mediaItems");
		return items == null ? java.util.Collections.emptyList() : JsonParser.asArray(items);
	}

	/** baseUrl からEXIF抽出用に元データをダウンロードする。認可ヘッダが必要。 */
	public byte[] downloadBytes(String baseUrl, String accessToken) throws IOException {
		return downloadBytes(baseUrl, accessToken, "=d");
	}

	/** baseUrl + sizeSuffix (例: "=w300-h300") で画像をダウンロードする。認可ヘッダが必要。 */
	public byte[] downloadBytes(String baseUrl, String accessToken, String sizeSuffix) throws IOException {
		URL url = new URL(baseUrl + sizeSuffix);
		HttpURLConnection conn = (HttpURLConnection) url.openConnection();
		conn.setRequestProperty("Authorization", "Bearer " + accessToken);
		conn.setRequestMethod("GET");
		conn.setConnectTimeout(15000);
		conn.setReadTimeout(20000);
		int status = conn.getResponseCode();
		if (status != 200) {
			throw new IOException("画像のダウンロードに失敗しました。status=" + status);
		}
		InputStream in = conn.getInputStream();
		try {
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			byte[] buf = new byte[8192];
			int n;
			while ((n = in.read(buf)) != -1) {
				out.write(buf, 0, n);
			}
			return out.toByteArray();
		} finally {
			in.close();
		}
	}

	private String get(String urlStr, String accessToken) throws IOException {
		URL url = new URL(urlStr);
		HttpURLConnection conn = (HttpURLConnection) url.openConnection();
		conn.setRequestMethod("GET");
		if (accessToken != null) {
			conn.setRequestProperty("Authorization", "Bearer " + accessToken);
		}
		conn.setConnectTimeout(15000);
		conn.setReadTimeout(20000);
		return readResponse(conn);
	}

	private String post(String urlStr, String body, String accessToken, String contentType) throws IOException {
		URL url = new URL(urlStr);
		HttpURLConnection conn = (HttpURLConnection) url.openConnection();
		conn.setRequestMethod("POST");
		conn.setDoOutput(true);
		conn.setRequestProperty("Content-Type", contentType);
		if (accessToken != null) {
			conn.setRequestProperty("Authorization", "Bearer " + accessToken);
		}
		conn.setConnectTimeout(15000);
		conn.setReadTimeout(20000);

		byte[] bodyBytes = toUtf8(body);
		conn.setRequestProperty("Content-Length", String.valueOf(bodyBytes.length));
		OutputStream out = conn.getOutputStream();
		try {
			out.write(bodyBytes);
		} finally {
			out.close();
		}
		return readResponse(conn);
	}

	private String readResponse(HttpURLConnection conn) throws IOException {
		int status = conn.getResponseCode();
		InputStream in = status >= 200 && status < 300 ? conn.getInputStream() : conn.getErrorStream();
		if (in == null) {
			throw new IOException("Google APIの呼び出しに失敗しました。status=" + status);
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try {
			byte[] buf = new byte[4096];
			int n;
			while ((n = in.read(buf)) != -1) {
				out.write(buf, 0, n);
			}
		} finally {
			in.close();
		}
		String text = toUtf8String(out.toByteArray());
		if (status < 200 || status >= 300) {
			throw new IOException("Google APIの呼び出しに失敗しました。status=" + status + " body=" + text);
		}
		return text;
	}

	private static String encode(String value) {
		try {
			return URLEncoder.encode(value, "UTF-8");
		} catch (UnsupportedEncodingException e) {
			throw new RuntimeException(e);
		}
	}

	private static byte[] toUtf8(String s) {
		try {
			return s.getBytes("UTF-8");
		} catch (UnsupportedEncodingException e) {
			throw new RuntimeException(e);
		}
	}

	private static String toUtf8String(byte[] bytes) {
		try {
			return new String(bytes, "UTF-8");
		} catch (UnsupportedEncodingException e) {
			throw new RuntimeException(e);
		}
	}
}
