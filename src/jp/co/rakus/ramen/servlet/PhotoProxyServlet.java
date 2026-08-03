package jp.co.rakus.ramen.servlet;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import jp.co.rakus.ramen.util.GooglePhotosClient;

/**
 * ブラウザの&lt;img&gt;タグはAuthorizationヘッダを付けられないため、
 * サーバー側でアクセストークンを使って画像を取得し、そのままストリーミングして返すプロキシ。
 */
public class PhotoProxyServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;

	private final GooglePhotosClient client = new GooglePhotosClient();

	@SuppressWarnings("unchecked")
	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		HttpSession session = request.getSession(false);
		String accessToken = session == null ? null : (String) session.getAttribute(RamenSessionKeys.ACCESS_TOKEN);
		Map<String, String> thumbnailUrls = session == null ? null
				: (Map<String, String>) session.getAttribute(RamenSessionKeys.THUMBNAIL_URLS);

		String mediaItemId = request.getParameter("mediaItemId");
		if (accessToken == null || thumbnailUrls == null || mediaItemId == null) {
			response.sendError(HttpServletResponse.SC_FORBIDDEN);
			return;
		}
		String baseUrl = thumbnailUrls.get(mediaItemId);
		if (baseUrl == null) {
			response.sendError(HttpServletResponse.SC_NOT_FOUND);
			return;
		}

		byte[] image = client.downloadBytes(baseUrl, accessToken, "=w300-h300");
		response.setContentType("image/jpeg");
		response.setContentLength(image.length);
		OutputStream out = response.getOutputStream();
		try {
			out.write(image);
		} finally {
			out.close();
		}
	}
}
