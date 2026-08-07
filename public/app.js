(function () {
	'use strict';

	const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

	const stepScan = document.getElementById('step-scan');
	const stepMap = document.getElementById('step-map');
	const scanMessage = document.getElementById('scanMessage');
	const mapSummary = document.getElementById('mapSummary');
	const folderInput = document.getElementById('folderInput');
	const selectedFolderName = document.getElementById('selectedFolderName');

	let leafletMap = null;
	let markersLayer = null;

	function showOnly(section) {
		[stepScan, stepMap].forEach(function (el) {
			el.hidden = el !== section;
		});
	}

	function extensionOf(filename) {
		const dot = filename.lastIndexOf('.');
		return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
	}

	function dirnameOf(relPath) {
		const slash = relPath.lastIndexOf('/');
		return slash === -1 ? '' : relPath.slice(0, slash);
	}

	function extractGeoData(data) {
		const geo = data.geoData || data.geoDataExif;
		if (geo && (geo.latitude !== 0 || geo.longitude !== 0)) {
			return { latitude: geo.latitude, longitude: geo.longitude };
		}
		return null;
	}

	/**
	 * Google Takeoutは写真本体とは別に "<ファイル名>.json"
	 * (長いファイル名の場合は "<ファイル名>.supplemental-metadata.json" になることもある)
	 * というサイドカーファイルを出力し、その中の geoData に位置情報が入っていることがある。
	 * 撮影時にGPSが記録されていない写真でも、Google側が推定した位置情報が入っている場合がある。
	 *
	 * さらにファイル名が長い場合、Takeout側でJSONのファイル名自体が途中で切り詰められ、
	 * 単純な「画像ファイル名+.json」の突き合わせでは見つからないことがある。
	 * その場合は同じフォルダ内のJSONを開き、中の"title"(元のファイル名)で照合する。
	 */
	async function readJsonSidecarGeoData(imagePath, imageFilename, filesByPath, jsonFilesByDir) {
		const candidates = [`${imagePath}.json`, `${imagePath}.supplemental-metadata.json`];
		for (const candidate of candidates) {
			const sidecarFile = filesByPath.get(candidate);
			if (!sidecarFile) continue;
			try {
				const geo = extractGeoData(JSON.parse(await sidecarFile.text()));
				if (geo) return geo;
			} catch (e) {
				// 読み込み/パースに失敗した場合は次の候補、またはフォールバックへ
			}
		}

		// ファイル名の切り詰めに対応するため、同じフォルダ内のJSONをtitleで照合する
		const siblings = jsonFilesByDir.get(dirnameOf(imagePath)) || [];
		for (const jsonFile of siblings) {
			try {
				const data = JSON.parse(await jsonFile.text());
				if (data.title !== imageFilename) continue;
				const geo = extractGeoData(data);
				if (geo) return geo;
			} catch (e) {
				// 読み込み/パースに失敗した場合は次の候補へ
			}
		}
		return null;
	}

	async function extractGps(imageFile, imagePath, filesByPath, jsonFilesByDir) {
		try {
			const gps = await exifr.gps(imageFile);
			if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
				return { latitude: gps.latitude, longitude: gps.longitude };
			}
		} catch (e) {
			// EXIF解析に失敗した場合はJSONサイドカーにフォールバックする
		}
		const geo = await readJsonSidecarGeoData(imagePath, imageFile.name, filesByPath, jsonFilesByDir);
		if (!geo) {
			console.log('[ramen-map] 位置情報が見つかりませんでした:', imagePath);
		}
		return geo;
	}

	folderInput.addEventListener('change', async function () {
		const files = Array.from(folderInput.files || []);
		if (files.length === 0) return;

		const folderLabel = (files[0].webkitRelativePath || '').split('/')[0] || '選択したフォルダ';
		selectedFolderName.textContent = folderLabel + ' を処理中...';
		scanMessage.hidden = true;

		const filesByPath = new Map();
		const jsonFilesByDir = new Map();
		files.forEach(function (file) {
			filesByPath.set(file.webkitRelativePath, file);
			if (extensionOf(file.name) === 'json') {
				const dir = dirnameOf(file.webkitRelativePath);
				if (!jsonFilesByDir.has(dir)) jsonFilesByDir.set(dir, []);
				jsonFilesByDir.get(dir).push(file);
			}
		});

		const imageFiles = files.filter(function (file) {
			return IMAGE_EXTENSIONS.has(extensionOf(file.name));
		});

		try {
			const results = await Promise.all(
				imageFiles.map(async function (file) {
					const gps = await extractGps(file, file.webkitRelativePath, filesByPath, jsonFilesByDir);
					if (!gps) return null;
					return {
						filename: file.name,
						lat: gps.latitude,
						lng: gps.longitude,
						objectUrl: URL.createObjectURL(file),
					};
				})
			);

			const spots = results.filter(Boolean);
			selectedFolderName.textContent = folderLabel;
			renderMap(spots, imageFiles.length);
		} catch (e) {
			console.error(e);
			scanMessage.hidden = false;
			scanMessage.textContent = 'エラー: ' + e.message;
		}
	});

	document.getElementById('rescanButton').addEventListener('click', function () {
		folderInput.value = '';
		selectedFolderName.textContent = '';
		showOnly(stepScan);
	});

	// 座標 -> 店名/住所の解決結果をキャッシュ(同じ地点を何度開いても再取得しないため)
	const shopNameCache = new Map();

	function cacheKey(lat, lng) {
		return lat.toFixed(5) + ',' + lng.toFixed(5);
	}

	// 都道府県から番地に向かって並ぶ、日本語の住所として自然な順序。
	// Nominatimはバージョンや地域によって都道府県などのキー名が揺れることがあるため
	// (state/province等)、想定されるキー名を広めに列挙しておく。
	const ADDRESS_FIELD_ORDER = [
		'state', // 都道府県
		'province',
		'state_district',
		'county', // 郡
		'city', // 市
		'municipality',
		'city_district', // 区
		'district',
		'borough',
		'town', // 町
		'village', // 村
		'suburb', // 地区
		'subdivision',
		'city_block', // 丁目
		'neighbourhood',
		'quarter',
		'road',
		'house_number', // 番地(Nominatim/OSMの日本の住所データには含まれないことが多い)
	];

	/**
	 * Nominatimのdisplay_nameは詳細->広域の順(例:「〇〇店, 新奥多摩街道, ...,福生市, 東京都」)で
	 * 日本語の住所表記としては逆順になっているため、addressdetailsの構造化データから
	 * 都道府県->市区町村->...の自然な順序に組み立て直す。郵便番号は先頭に付ける。
	 */
	function formatJapaneseAddress(address) {
		if (!address) return '';
		const body = ADDRESS_FIELD_ORDER.map(function (key) {
			return address[key];
		})
			.filter(Boolean)
			.join('');
		return address.postcode ? '〒' + address.postcode + ' ' + body : body;
	}

	/**
	 * OpenStreetMapのNominatim(無料・APIキー不要)で逆ジオコーディングする。
	 * 写真のGPS座標は店の入口ちょうどとは限らないため、店名が正確に取れるとは限らない。
	 * display_nameの先頭要素を店名/施設名の推定値として扱い、フルの住所も合わせて表示する。
	 */
	async function lookupShopName(lat, lng) {
		const key = cacheKey(lat, lng);
		if (shopNameCache.has(key)) {
			return shopNameCache.get(key);
		}
		const url =
			'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
			encodeURIComponent(lat) +
			'&lon=' +
			encodeURIComponent(lng) +
			'&zoom=18&addressdetails=1&accept-language=ja';
		try {
			const res = await fetch(url, { headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error('status=' + res.status);
			const data = await res.json();
			const displayName = data.display_name || '';
			const guessedName = displayName.split(',')[0].trim();
			const formattedAddress = formatJapaneseAddress(data.address) || displayName;
			const result = { name: guessedName || null, address: formattedAddress };
			shopNameCache.set(key, result);
			return result;
		} catch (e) {
			console.log('[ramen-map] 店名の取得に失敗:', lat, lng, e.message);
			const result = { name: null, address: null };
			shopNameCache.set(key, result);
			return result;
		}
	}

	function renderMap(spots, totalPhotos) {
		mapSummary.textContent =
			'見つかった写真 ' + totalPhotos + ' 枚中、位置情報が見つかった ' + spots.length + ' 枚を表示しています。';

		showOnly(stepMap);

		if (!leafletMap) {
			leafletMap = L.map('map');
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap contributors',
			}).addTo(leafletMap);
			markersLayer = L.layerGroup().addTo(leafletMap);
		}
		markersLayer.clearLayers();

		const ramenIcon = L.divIcon({
			html: '<span class="ramen-emoji-icon-inner">🍜</span>',
			className: 'ramen-emoji-icon',
			iconSize: [40, 40],
			iconAnchor: [20, 20],
			popupAnchor: [0, -20],
		});
		const bounds = [];

		spots.forEach(function (spot) {
			const marker = L.marker([spot.lat, spot.lng], { icon: ramenIcon });
			marker.bindPopup(popupHtml(spot, '<span class="shop-name-loading">お店を調べています...</span>'));

			marker.on('popupopen', async function () {
				const result = await lookupShopName(spot.lat, spot.lng);
				const nameHtml = result.name
					? '<strong>' + escapeHtml(result.name) + '</strong>(推定)<br><small>' + escapeHtml(result.address || '') + '</small>'
					: '<span class="notice">お店の情報を取得できませんでした</span>';
				marker.setPopupContent(popupHtml(spot, nameHtml));
			});

			marker.addTo(markersLayer);
			bounds.push([spot.lat, spot.lng]);
		});

		if (bounds.length > 1) {
			leafletMap.fitBounds(bounds, { padding: [30, 30] });
		} else if (bounds.length === 1) {
			leafletMap.setView(bounds[0], 14);
		} else {
			leafletMap.setView([35.681236, 139.767125], 5); // 東京駅
		}
	}

	function popupHtml(spot, shopInfoHtml) {
		return (
			'<img src="' + spot.objectUrl + '" width="150" style="object-fit:cover;"><br>' +
			escapeHtml(spot.filename || '') +
			'<br>' +
			shopInfoHtml
		);
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
})();
