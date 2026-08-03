package jp.co.rakus.ramen.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import javax.servlet.ServletContext;

/**
 * WEB-INF/google-photos.properties から Google OAuth クライアント情報を読み込む。
 * 実際の client.secret はリポジトリに含めず、各自の環境で
 * google-photos.properties.example をコピーして設定する。
 */
public class GooglePhotosConfig {

	private static final String CONFIG_PATH = "/WEB-INF/google-photos.properties";

	private final String clientId;
	private final String clientSecret;
	private final String redirectUri;

	private GooglePhotosConfig(String clientId, String clientSecret, String redirectUri) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;
		this.redirectUri = redirectUri;
	}

	public static GooglePhotosConfig load(ServletContext context) throws IOException {
		Properties props = new Properties();
		InputStream in = context.getResourceAsStream(CONFIG_PATH);
		if (in == null) {
			throw new IOException(CONFIG_PATH + " が見つかりません。"
					+ "google-photos.properties.example を参考に作成してください。");
		}
		try {
			props.load(in);
		} finally {
			in.close();
		}
		String clientId = props.getProperty("client.id", "").trim();
		String clientSecret = props.getProperty("client.secret", "").trim();
		String redirectUri = props.getProperty("redirect.uri", "").trim();
		if (clientId.length() == 0 || clientSecret.length() == 0 || redirectUri.length() == 0) {
			throw new IOException(CONFIG_PATH + " に client.id / client.secret / redirect.uri を設定してください。");
		}
		return new GooglePhotosConfig(clientId, clientSecret, redirectUri);
	}

	public String getClientId() {
		return clientId;
	}

	public String getClientSecret() {
		return clientSecret;
	}

	public String getRedirectUri() {
		return redirectUri;
	}
}
