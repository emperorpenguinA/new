<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>ラーメンマップ - 写真選択</title>
<script src="../jquery/jquery-1.9.0.min.js"></script>
</head>
<body>

<h1>ラーメンマップを作る</h1>

<%
String pickerUri = (String) request.getAttribute("pickerUri");
Boolean stillWaiting = (Boolean) request.getAttribute("stillWaiting");
%>

<% if (Boolean.TRUE.equals(stillWaiting)) { %>
<p style="color:red;">まだ写真の選択が完了していないようです。Googleフォトの画面で選択を終えてから、もう一度お試しください。</p>
<% } %>

<ol>
	<li>下のボタンでGoogleフォトを開き、ラーメンの写真を選択してください（複数選択可）。</li>
	<li>選択が終わったら、Googleフォト側の画面で「完了」してこのタブに戻り、「選択を確認する」を押してください。</li>
</ol>

<p>
	<button id="openPicker">Googleフォトで写真を選ぶ</button>
</p>

<form action="<%= request.getContextPath() %>/RamenMapServlet" method="get">
	<input type="hidden" name="action" value="poll">
	<button type="submit">選択を確認する</button>
</form>

<script>
$(function () {
	$("#openPicker").click(function () {
		window.open("<%= pickerUri == null ? "" : pickerUri.replace("\"", "") %>", "_blank");
	});
});
</script>

</body>
</html>
