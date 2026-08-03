<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>ラーメンマップ - エラー</title>
</head>
<body>

<h1>エラーが発生しました</h1>
<p style="color:red;"><%= request.getAttribute("errorMessage") %></p>
<p><a href="<%= request.getContextPath() %>/RamenMapServlet">もう一度試す</a></p>

</body>
</html>
