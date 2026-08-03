package jp.co.rakus.ramen.servlet;

import java.io.IOException;
import java.util.Map;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import jp.co.rakus.ramen.config.GooglePhotosConfig;
import jp.co.rakus.ramen.util.GooglePhotosClient;
import jp.co.rakus.ramen.util.JsonParser;

/**
 * Googleの認可画面からのリダイレクトを受け取り、認可コードをアクセストークンに交換する。
 */
public class OAuth2CallbackServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;

	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		HttpSession session = request.getSession(true);

		String error = request.getParameter("error");
		if (error != null) {
			response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Google認可がキャンセルされました: " + error);
			return;
		}

		String state = request.getParameter("state");
		Object expectedState = session.getAttribute(RamenSessionKeys.OAUTH_STATE);
		if (state == null || !state.equals(expectedState)) {
			response.sendError(HttpServletResponse.SC_BAD_REQUEST, "不正なリクエストです(state不一致)。");
			return;
		}
		session.removeAttribute(RamenSessionKeys.OAUTH_STATE);

		String code = request.getParameter("code");
		if (code == null) {
			response.sendError(HttpServletResponse.SC_BAD_REQUEST, "認可コードがありません。");
			return;
		}

		try {
			GooglePhotosConfig config = GooglePhotosConfig.load(getServletContext());
			GooglePhotosClient client = new GooglePhotosClient();
			Map<String, Object> token = client.exchangeCodeForToken(config, code);
			String accessToken = JsonParser.asString(token.get("access_token"));
			if (accessToken == null) {
				throw new IOException("アクセストークンの取得に失敗しました: " + token);
			}
			session.setAttribute(RamenSessionKeys.ACCESS_TOKEN, accessToken);
		} catch (IOException e) {
			response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
			return;
		}

		response.sendRedirect(request.getContextPath() + "/RamenMapServlet");
	}
}
