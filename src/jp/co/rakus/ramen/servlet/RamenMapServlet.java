package jp.co.rakus.ramen.servlet;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import jp.co.rakus.ramen.model.RamenSpot;
import jp.co.rakus.ramen.util.ExifGpsReader;
import jp.co.rakus.ramen.util.GooglePhotosClient;
import jp.co.rakus.ramen.util.JsonParser;

/**
 * ラーメンマップ機能のメインコントローラ。
 *
 * action無し : Pickerセッションを作成し、ユーザーに写真選択を促す画面を表示
 * action=poll : 選択完了を確認し、完了していれば写真をダウンロードしてGPSを抽出、地図画面を表示
 */
public class RamenMapServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;

	private final GooglePhotosClient client = new GooglePhotosClient();

	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {

		HttpSession session = request.getSession(true);
		String accessToken = (String) session.getAttribute(RamenSessionKeys.ACCESS_TOKEN);
		if (accessToken == null) {
			response.sendRedirect(request.getContextPath() + "/GoogleAuthServlet");
			return;
		}

		String action = request.getParameter("action");
		try {
			if ("poll".equals(action)) {
				handlePoll(request, response, session, accessToken);
			} else {
				handleStart(request, response, session, accessToken);
			}
		} catch (IOException e) {
			request.setAttribute("errorMessage", e.getMessage());
			forward(request, response, "/view/ramenError.jsp");
		}
	}

	/** Pickerセッションを新規作成し、選択画面を表示する。 */
	private void handleStart(HttpServletRequest request, HttpServletResponse response, HttpSession session,
			String accessToken) throws ServletException, IOException {
		Map<String, Object> pickerSession = client.createPickerSession(accessToken);
		String sessionId = JsonParser.asString(pickerSession.get("id"));
		String pickerUri = JsonParser.asString(pickerSession.get("pickerUri"));

		session.setAttribute(RamenSessionKeys.PICKER_SESSION_ID, sessionId);
		session.setAttribute(RamenSessionKeys.PICKER_URI, pickerUri);

		request.setAttribute("pickerUri", pickerUri);
		forward(request, response, "/view/ramenPick.jsp");
	}

	/** 選択完了を確認し、完了していればGPSを抽出して地図画面へ。未完了ならもう一度選択画面へ。 */
	private void handlePoll(HttpServletRequest request, HttpServletResponse response, HttpSession session,
			String accessToken) throws ServletException, IOException {
		String sessionId = (String) session.getAttribute(RamenSessionKeys.PICKER_SESSION_ID);
		if (sessionId == null) {
			handleStart(request, response, session, accessToken);
			return;
		}

		Map<String, Object> pickerSession = client.getPickerSession(accessToken, sessionId);
		boolean mediaItemsSet = JsonParser.asBoolean(pickerSession.get("mediaItemsSet"));
		if (!mediaItemsSet) {
			request.setAttribute("pickerUri", session.getAttribute(RamenSessionKeys.PICKER_URI));
			request.setAttribute("stillWaiting", Boolean.TRUE);
			forward(request, response, "/view/ramenPick.jsp");
			return;
		}

		List<Object> mediaItems = client.listPickedMediaItems(accessToken, sessionId);
		List<RamenSpot> spots = new ArrayList<RamenSpot>();
		Map<String, String> thumbnailUrls = new HashMap<String, String>();

		for (int i = 0; i < mediaItems.size(); i++) {
			Map<String, Object> item = JsonParser.asObject(mediaItems.get(i));
			String id = JsonParser.asString(item.get("id"));
			Map<String, Object> mediaFile = JsonParser.asObject(item.get("mediaFile"));
			if (mediaFile == null) {
				continue;
			}
			String baseUrl = JsonParser.asString(mediaFile.get("baseUrl"));
			String filename = JsonParser.asString(mediaFile.get("filename"));
			if (baseUrl == null) {
				continue;
			}
			thumbnailUrls.put(id, baseUrl);

			double[] gps = extractGps(baseUrl, accessToken);
			if (gps != null) {
				spots.add(new RamenSpot(id, filename, gps[0], gps[1]));
			}
		}

		session.setAttribute(RamenSessionKeys.RAMEN_SPOTS, spots);
		session.setAttribute(RamenSessionKeys.THUMBNAIL_URLS, thumbnailUrls);
		session.removeAttribute(RamenSessionKeys.PICKER_SESSION_ID);
		session.removeAttribute(RamenSessionKeys.PICKER_URI);

		request.setAttribute("spots", spots);
		request.setAttribute("totalPicked", Integer.valueOf(mediaItems.size()));
		forward(request, response, "/view/ramenMap.jsp");
	}

	private double[] extractGps(String baseUrl, String accessToken) {
		try {
			byte[] bytes = client.downloadBytes(baseUrl, accessToken);
			return ExifGpsReader.readGps(new ByteArrayInputStream(bytes));
		} catch (IOException e) {
			// GPSが取れない写真は地図上ではスキップする
			return null;
		}
	}

	private void forward(HttpServletRequest request, HttpServletResponse response, String path)
			throws ServletException, IOException {
		RequestDispatcher dispatcher = request.getRequestDispatcher(path);
		dispatcher.forward(request, response);
	}
}
