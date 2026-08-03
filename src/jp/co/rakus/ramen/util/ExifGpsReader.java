package jp.co.rakus.ramen.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * JPEG画像のEXIF情報からGPS位置情報(緯度・経度)を読み取る。
 *
 * Google Photos の API (Library API / Picker API) はプライバシー上の理由で
 * mediaMetadata に位置情報を含めないため、写真本体のバイト列をダウンロードし
 * EXIFのGPS IFDを直接パースして取り出す。外部ライブラリを追加できない
 * プロジェクト構成のため、必要最小限のTIFF/EXIFパーサを自前で実装している。
 */
public final class ExifGpsReader {

	private ExifGpsReader() {
	}

	/**
	 * @return {緯度, 経度} の配列。GPS情報が無い場合はnull。
	 */
	public static double[] readGps(InputStream imageStream) throws IOException {
		byte[] data = readAll(imageStream);
		byte[] exif = findExifSegment(data);
		if (exif == null) {
			return null;
		}
		return parseExifGps(exif);
	}

	private static byte[] readAll(InputStream in) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte[8192];
		int n;
		while ((n = in.read(buf)) != -1) {
			out.write(buf, 0, n);
		}
		return out.toByteArray();
	}

	/**
	 * JPEGマーカーを走査し、APP1(EXIF)セグメントの中身(TIFFヘッダ以降)を返す。
	 */
	private static byte[] findExifSegment(byte[] data) {
		if (data.length < 4 || (data[0] & 0xFF) != 0xFF || (data[1] & 0xFF) != 0xD8) {
			return null; // JPEGではない
		}
		int pos = 2;
		while (pos + 4 <= data.length) {
			if ((data[pos] & 0xFF) != 0xFF) {
				break;
			}
			int marker = data[pos + 1] & 0xFF;
			if (marker == 0xD8 || marker == 0xD9) {
				pos += 2;
				continue;
			}
			if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
				pos += 2;
				continue;
			}
			int segLen = ((data[pos + 2] & 0xFF) << 8) | (data[pos + 3] & 0xFF);
			if (marker == 0xE1) { // APP1
				int contentStart = pos + 4;
				if (contentStart + 6 <= data.length
						&& data[contentStart] == 'E' && data[contentStart + 1] == 'x'
						&& data[contentStart + 2] == 'i' && data[contentStart + 3] == 'f') {
					int tiffStart = contentStart + 6;
					int tiffLen = segLen - 2 - 6;
					if (tiffLen > 0 && tiffStart + tiffLen <= data.length) {
						byte[] tiff = new byte[tiffLen];
						System.arraycopy(data, tiffStart, tiff, 0, tiffLen);
						return tiff;
					}
				}
			}
			if (marker == 0xDA) { // Start of Scan 以降は画像本体
				break;
			}
			pos += 2 + segLen;
		}
		return null;
	}

	private static double[] parseExifGps(byte[] tiff) {
		boolean little = tiff[0] == 'I';
		int ifd0Offset = readInt32(tiff, 4, little);
		Long gpsIfdOffset = findTagOffset(tiff, ifd0Offset, little, 0x8825);
		if (gpsIfdOffset == null) {
			return null;
		}
		int gpsOffset = gpsIfdOffset.intValue();

		String latRef = readAscii(tiff, gpsOffset, little, 1);
		double[] lat = readRational3(tiff, gpsOffset, little, 2);
		String lonRef = readAscii(tiff, gpsOffset, little, 3);
		double[] lon = readRational3(tiff, gpsOffset, little, 4);

		if (lat == null || lon == null) {
			return null;
		}
		double latitude = toDegrees(lat);
		double longitude = toDegrees(lon);
		if ("S".equalsIgnoreCase(latRef)) {
			latitude = -latitude;
		}
		if ("W".equalsIgnoreCase(lonRef)) {
			longitude = -longitude;
		}
		return new double[] { latitude, longitude };
	}

	private static double toDegrees(double[] dms) {
		return dms[0] + dms[1] / 60.0 + dms[2] / 3600.0;
	}

	/** 指定IFD内から tagId のエントリを探し、値オフセット(またはインラインオフセット位置)を返す */
	private static Long findTagOffset(byte[] tiff, int ifdOffset, boolean little, int tagId) {
		if (ifdOffset <= 0 || ifdOffset + 2 > tiff.length) {
			return null;
		}
		int count = readInt16(tiff, ifdOffset, little);
		int entryPos = ifdOffset + 2;
		for (int i = 0; i < count; i++) {
			int base = entryPos + i * 12;
			if (base + 12 > tiff.length) {
				break;
			}
			int tag = readInt16(tiff, base, little);
			if (tag == tagId) {
				// GPS IFDタグ(0x8825)の値そのものがGPS IFDへのオフセット
				return (long) readInt32(tiff, base + 8, little);
			}
		}
		return null;
	}

	private static String readAscii(byte[] tiff, int ifdOffset, boolean little, int tagId) {
		int entry = findEntry(tiff, ifdOffset, little, tagId);
		if (entry < 0) {
			return null;
		}
		int valueOffset = entry + 8;
		return new String(tiff, valueOffset, 1).trim();
	}

	private static double[] readRational3(byte[] tiff, int ifdOffset, boolean little, int tagId) {
		int entry = findEntry(tiff, ifdOffset, little, tagId);
		if (entry < 0) {
			return null;
		}
		int dataOffset = readInt32(tiff, entry + 8, little);
		double[] result = new double[3];
		for (int i = 0; i < 3; i++) {
			int off = dataOffset + i * 8;
			long numerator = readUInt32(tiff, off, little);
			long denominator = readUInt32(tiff, off + 4, little);
			result[i] = denominator == 0 ? 0 : (double) numerator / (double) denominator;
		}
		return result;
	}

	private static int findEntry(byte[] tiff, int ifdOffset, boolean little, int tagId) {
		if (ifdOffset <= 0 || ifdOffset + 2 > tiff.length) {
			return -1;
		}
		int count = readInt16(tiff, ifdOffset, little);
		int entryPos = ifdOffset + 2;
		for (int i = 0; i < count; i++) {
			int base = entryPos + i * 12;
			if (base + 12 > tiff.length) {
				break;
			}
			int tag = readInt16(tiff, base, little);
			if (tag == tagId) {
				return base;
			}
		}
		return -1;
	}

	private static int readInt16(byte[] b, int off, boolean little) {
		int b0 = b[off] & 0xFF;
		int b1 = b[off + 1] & 0xFF;
		return little ? (b1 << 8) | b0 : (b0 << 8) | b1;
	}

	private static int readInt32(byte[] b, int off, boolean little) {
		return (int) readUInt32(b, off, little);
	}

	private static long readUInt32(byte[] b, int off, boolean little) {
		long b0 = b[off] & 0xFF;
		long b1 = b[off + 1] & 0xFF;
		long b2 = b[off + 2] & 0xFF;
		long b3 = b[off + 3] & 0xFF;
		return little ? (b3 << 24) | (b2 << 16) | (b1 << 8) | b0 : (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
	}
}
