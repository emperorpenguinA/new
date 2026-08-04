(function () {
	'use strict';

	const stepScan = document.getElementById('step-scan');
	const stepMap = document.getElementById('step-map');
	const scanMessage = document.getElementById('scanMessage');
	const mapSummary = document.getElementById('mapSummary');
	const folderPathInput = document.getElementById('folderPathInput');
	const scanButton = document.getElementById('scanButton');

	let leafletMap = null;
	let markersLayer = null;

	function showOnly(section) {
		[stepScan, stepMap].forEach(function (el) {
			el.hidden = el !== section;
		});
	}

	scanButton.addEventListener('click', async function () {
		const folderPath = folderPathInput.value.trim();
		if (!folderPath) {
			scanMessage.hidden = false;
			scanMessage.textContent = 'フォルダのパスを入力してください。';
			return;
		}

		const originalLabel = scanButton.textContent;
		scanButton.disabled = true;
		scanButton.textContent = 'スキャン中...(写真の枚数によって時間がかかります)';
		scanMessage.hidden = true;

		try {
			const res = await fetch('/api/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderPath }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || ('スキャンに失敗しました(status=' + res.status + ')'));
			}
			renderMap(data.spots, data.totalPhotos);
		} catch (e) {
			console.error(e);
			scanMessage.hidden = false;
			scanMessage.textContent = 'エラー: ' + e.message;
		} finally {
			scanButton.disabled = false;
			scanButton.textContent = originalLabel;
		}
	});

	document.getElementById('rescanButton').addEventListener('click', function () {
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
				'<img src="/thumbnail?path=' + encodeURIComponent(spot.path) + '" width="150" style="object-fit:cover;"><br>' +
					escapeHtml(spot.filename || '')
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
