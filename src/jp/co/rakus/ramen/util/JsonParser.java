package jp.co.rakus.ramen.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Google API のレスポンス（オブジェクト/配列/文字列/数値/真偽値/null）を読める範囲で
 * パースするだけの最小限の JSON パーサ。汎用ライブラリを追加できないプロジェクト構成
 * (ビルドツール/lib フォルダなし) のために自前実装している。
 */
public final class JsonParser {

	private final String src;
	private int pos;

	private JsonParser(String src) {
		this.src = src;
		this.pos = 0;
	}

	@SuppressWarnings("unchecked")
	public static Map<String, Object> parseObject(String json) {
		JsonParser p = new JsonParser(json);
		p.skipWhitespace();
		Object value = p.parseValue();
		if (value instanceof Map) {
			return (Map<String, Object>) value;
		}
		throw new IllegalArgumentException("JSONオブジェクトではありません: " + json);
	}

	private Object parseValue() {
		skipWhitespace();
		char c = src.charAt(pos);
		if (c == '{') {
			return parseObjectValue();
		} else if (c == '[') {
			return parseArrayValue();
		} else if (c == '"') {
			return parseString();
		} else if (c == 't' || c == 'f') {
			return parseBoolean();
		} else if (c == 'n') {
			pos += 4; // null
			return null;
		} else {
			return parseNumber();
		}
	}

	private Map<String, Object> parseObjectValue() {
		Map<String, Object> map = new LinkedHashMap<String, Object>();
		pos++; // {
		skipWhitespace();
		if (peek() == '}') {
			pos++;
			return map;
		}
		while (true) {
			skipWhitespace();
			String key = parseString();
			skipWhitespace();
			pos++; // :
			Object value = parseValue();
			map.put(key, value);
			skipWhitespace();
			char c = src.charAt(pos);
			if (c == ',') {
				pos++;
				continue;
			} else if (c == '}') {
				pos++;
				break;
			}
		}
		return map;
	}

	private List<Object> parseArrayValue() {
		List<Object> list = new ArrayList<Object>();
		pos++; // [
		skipWhitespace();
		if (peek() == ']') {
			pos++;
			return list;
		}
		while (true) {
			Object value = parseValue();
			list.add(value);
			skipWhitespace();
			char c = src.charAt(pos);
			if (c == ',') {
				pos++;
				continue;
			} else if (c == ']') {
				pos++;
				break;
			}
		}
		return list;
	}

	private String parseString() {
		StringBuilder sb = new StringBuilder();
		pos++; // opening quote
		while (true) {
			char c = src.charAt(pos++);
			if (c == '"') {
				break;
			}
			if (c == '\\') {
				char esc = src.charAt(pos++);
				switch (esc) {
				case 'n':
					sb.append('\n');
					break;
				case 't':
					sb.append('\t');
					break;
				case 'r':
					sb.append('\r');
					break;
				case 'b':
					sb.append('\b');
					break;
				case 'f':
					sb.append('\f');
					break;
				case 'u':
					String hex = src.substring(pos, pos + 4);
					sb.append((char) Integer.parseInt(hex, 16));
					pos += 4;
					break;
				default:
					sb.append(esc);
				}
			} else {
				sb.append(c);
			}
		}
		return sb.toString();
	}

	private Boolean parseBoolean() {
		if (src.charAt(pos) == 't') {
			pos += 4; // true
			return Boolean.TRUE;
		}
		pos += 5; // false
		return Boolean.FALSE;
	}

	private Double parseNumber() {
		int start = pos;
		while (pos < src.length() && "+-0123456789.eE".indexOf(src.charAt(pos)) >= 0) {
			pos++;
		}
		return Double.valueOf(src.substring(start, pos));
	}

	private char peek() {
		return src.charAt(pos);
	}

	private void skipWhitespace() {
		while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
			pos++;
		}
	}

	// ---- 取得補助 ----

	@SuppressWarnings("unchecked")
	public static Map<String, Object> asObject(Object o) {
		return (Map<String, Object>) o;
	}

	@SuppressWarnings("unchecked")
	public static List<Object> asArray(Object o) {
		return (List<Object>) o;
	}

	public static String asString(Object o) {
		return o == null ? null : o.toString();
	}

	public static boolean asBoolean(Object o) {
		return o != null && ((Boolean) o).booleanValue();
	}
}
