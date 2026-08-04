(function () {
	'use strict';

	const stepLogin = document.getElementById('step-login');
	const stepPick = document.getElementById('step-pick');
	const stepWaiting = document.getElementById('step-waiting');
	const stepMap = document.getElementById('step-map');
	const waitingMessage = document.getElementById('waitingMessage');
	const mapSummary = document.getElementById('mapSummary');

	let currentSessionId = null;
	let currentPickerUri = null;
	let leafletMap = null;
	let markersLayer = null;

	function showOnly(section) {
		[stepLogin, stepPick, stepWaiting, stepMap].forEach(function (el) {
			el.hidden = el !== section;
		});
	}

	async function init() {
		const res = await fetch('/api/session');
		const data = await res.json();
		showOnly(data.authenticated ? stepPick : stepLogin);
	}

	document.getElementById('loginButton').addEventListener('click', function () {
		window.location.href = '/auth/google';
	});

	document.getElementById('startPickButton').addEventListener('click', async function () {
		const res = await fetch('/api/picker', { method: 'POST' });
		if (!res.ok) {
			alert('Pickerセッションの作成に失敗しました。');
			return;
		}
		const data = await res.json();
		currentSessionId = data.sessionId;
		currentPickerUri = data.pickerUri;
		waitingMessage.hidden = true;
		showOnly(stepWaiting);
	});

	document.getElementById('openPickerButton').addEventListener('click', function () {
		if (currentPickerUri) {
			window.open(currentPickerUri, '_blank');
		}
	});

	const checkDoneButton = document.getElementById('checkDoneButton');
	checkDoneButton.addEventListener('click', async function () {
		if (!currentSessionId) {
			alert('写真選択セッションが見つかりません。お手数ですが最初からやり直してください。');
			showOnly(stepPick);
			return;
		}

		const originalLabel = checkDoneButton.textContent;
		checkDoneButton.disabled = true;
		checkDoneButton.textContent = '確認中...';
		waitingMessage.hidden = true;

		try {
			const statusRes = await fetch('/api/picker/' + encodeURIComponent(currentSessionId));
			const status = await statusRes.json();
			if (!statusRes.ok) {
				throw new Error(status.error || ('選択状況の確認に失敗しました(status=' + statusRes.status + ')'));
			}
			if (!status.mediaItemsSet) {
				waitingMessage.hidden = false;
				return;
			}

			checkDoneButton.textContent = '写真を取得中...(枚数によって時間がかかります)';
			const spotsRes = await fetch('/api/picker/' + encodeURIComponent(currentSessionId) + '/spots');
			const data = await spotsRes.json();
			if (!spotsRes.ok) {
				throw new Error(data.error || ('写真の取得に失敗しました(status=' + spotsRes.status + ')'));
			}
			renderMap(data.spots, data.totalPicked);
		} catch (e) {
			console.error(e);
			alert('エラーが発生しました: ' + e.message);
		} finally {
			checkDoneButton.disabled = false;
			checkDoneButton.textContent = originalLabel;
		}
	});

	document.getElementById('restartButton').addEventListener('click', function () {
		currentSessionId = null;
		currentPickerUri = null;
		showOnly(stepPick);
	});

	function renderMap(spots, totalPicked) {
		mapSummary.textContent =
			'選択した写真 ' + totalPicked + ' 枚中、位置情報が見つかった ' + spots.length + ' 枚を表示しています。';

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
				'<img src="/photo/' + encodeURIComponent(spot.id) + '" width="150" height="150" style="object-fit:cover;"><br>' +
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

	init();
})();
