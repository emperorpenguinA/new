package jp.co.rakus.ramen.servlet;

import java.io.IOException;
import java.util.UUID;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import jp.co.rakus.ramen.config.GooglePhotosConfig;
import jp.co.rakus.ramen.util.GooglePhotosClient;

/**
 * Googleフォト連携の入口。CSRF対策用のstateを発行し、Googleの認可画面へリダイレクトする。
 */
public class GoogleAuthServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;

	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		GooglePhotosConfig config;
		try {
			config = GooglePhotosConfig.load(getServletContext());
		} catch (IOException e) {
			response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
			return;
		}

		HttpSession session = request.getSession(true);
		String state = UUID.randomUUID().toString();
		session.setAttribute(RamenSessionKeys.OAUTH_STATE, state);

		String authUrl = GooglePhotosClient.buildAuthorizationUrl(config, state);
		response.sendRedirect(authUrl);
	}
}
