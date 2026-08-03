<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"
    import="java.util.List, jp.co.rakus.ramen.model.RamenSpot"%>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>ラーメンマップ</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
#map { height: 600px; width: 100%; }
</style>
</head>
<body>

<h1>🍜 ラーメンマップ</h1>

<%
List<RamenSpot> spots = (List<RamenSpot>) request.getAttribute("spots");
Integer totalPicked = (Integer) request.getAttribute("totalPicked");
int spotCount = spots == null ? 0 : spots.size();
int total = totalPicked == null ? spotCount : totalPicked.intValue();
%>

<p>選択した写真 <%= total %> 枚中、位置情報が見つかった <%= spotCount %> 枚を地図に表示しています。</p>
<% if (spotCount == 0) { %>
<p style="color:red;">位置情報付きの写真が見つかりませんでした。スマートフォンの位置情報(ジオタグ)がONで撮影された写真を選んでください。</p>
<% } %>

<p><a href="<%= request.getContextPath() %>/RamenMapServlet">別の写真でつくり直す</a></p>

<div id="map"></div>

<script>
var spots = [
<%
if (spots != null) {
	for (int i = 0; i < spots.size(); i++) {
		RamenSpot spot = spots.get(i);
		String filename = spot.getFilename() == null ? "" : spot.getFilename().replace("\\", "\\\\").replace("\"", "\\\"");
		String thumbUrl = request.getContextPath() + "/PhotoProxyServlet?mediaItemId=" + java.net.URLEncoder.encode(spot.getMediaItemId(), "UTF-8");
%>
	{ lat: <%= spot.getLatitude() %>, lng: <%= spot.getLongitude() %>, filename: "<%= filename %>", thumb: "<%= thumbUrl %>" }<%= (i < spots.size() - 1) ? "," : "" %>
<%
	}
}
%>
];

var defaultCenter = [35.681236, 139.767125]; // 東京駅
var map = L.map('map').setView(
	spots.length > 0 ? [spots[0].lat, spots[0].lng] : defaultCenter,
	spots.length > 0 ? 12 : 5
);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var ramenIcon = L.divIcon({
	html: '🍜',
	className: 'ramen-emoji-icon',
	iconSize: [28, 28]
});

var bounds = [];
spots.forEach(function (spot) {
	var marker = L.marker([spot.lat, spot.lng], { icon: ramenIcon }).addTo(map);
	marker.bindPopup(
		'<img src="' + spot.thumb + '" width="150" height="150" style="object-fit:cover;"><br>' + spot.filename
	);
	bounds.push([spot.lat, spot.lng]);
});
if (bounds.length > 1) {
	map.fitBounds(bounds, { padding: [30, 30] });
}
</script>

</body>
</html>
