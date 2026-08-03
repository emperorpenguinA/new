package jp.co.rakus.ramen.model;

import java.io.Serializable;

/** ラーメンマップ上の1地点(1枚の写真)を表す。 */
public class RamenSpot implements Serializable {

	private static final long serialVersionUID = 1L;

	private final String mediaItemId;
	private final String filename;
	private final double latitude;
	private final double longitude;

	public RamenSpot(String mediaItemId, String filename, double latitude, double longitude) {
		this.mediaItemId = mediaItemId;
		this.filename = filename;
		this.latitude = latitude;
		this.longitude = longitude;
	}

	public String getMediaItemId() {
		return mediaItemId;
	}

	public String getFilename() {
		return filename;
	}

	public double getLatitude() {
		return latitude;
	}

	public double getLongitude() {
		return longitude;
	}
}
