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

		const ramenIcon = L.divIcon({ html: '🍜', className: 'ramen-emoji-icon', iconSize: [28, 28] });
		const bounds = [];

		spots.forEach(function (spot) {
			const marker = L.marker([spot.lat, spot.lng], { icon: ramenIcon });
			marker.bindPopup(
				'<img src="' + spot.objectUrl + '" width="150" style="object-fit:cover;"><br>' + escapeHtml(spot.filename || '')
			);
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

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
})();
