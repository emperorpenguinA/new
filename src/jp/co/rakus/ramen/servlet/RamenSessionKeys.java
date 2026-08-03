package jp.co.rakus.ramen.servlet;

/** HttpSession属性キーの一覧。ラーメンマップ機能内のservlet間で共有する。 */
final class RamenSessionKeys {

	static final String OAUTH_STATE = "ramen.oauthState";
	static final String ACCESS_TOKEN = "ramen.accessToken";
	static final String PICKER_SESSION_ID = "ramen.pickerSessionId";
	static final String PICKER_URI = "ramen.pickerUri";
	static final String RAMEN_SPOTS = "ramen.spots";
	static final String THUMBNAIL_URLS = "ramen.thumbnailUrls"; // Map<mediaItemId, baseUrl>

	private RamenSessionKeys() {
	}
}
