// Map center for 4775 Bermuda Lakes Way, Fort Myers, FL
const MAP_CENTER = [26.674, -81.806];
const MAP_ZOOM = 16;
const MAX_ZOOM = 22;
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const map = L.map('map', {maxZoom: MAX_ZOOM, zoomControl: true})
  .setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer(SATELLITE_URL, {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: MAX_ZOOM
}).addTo(map);

// --- UI Elements ---
const apSelect = document.getElementById('ap-select');
const legendPanel = document.getElementById('legend-panel');
const bandSelect = document.getElementById('band-select');
const dirSelect = document.getElementById('dir-select');
const minThroughputInput = document.getElementById('min-throughput');
const maxThroughputInput = document.getElementById('max-throughput');
const testCount = document.getElementById('test-count');
const reloadButton = document.getElementById('reload-data');

// --- Data ---
let apList = [];
let speedTestData = [];
let speedMarkersLayer = L.layerGroup().addTo(map);
let activeMarkers = []; // store markers for current draw order

// --- Utility: Marker Color Logic ---
function getSpeedTestColor(band, mbps) {
  // 2.4 GHz colors
  if (band === '2.4') {
    if (mbps >= 100) return '#F73E28';    // --red-950
    if (mbps >= 50) return '#FF7D5F';     // --red-700
    if (mbps >= 20) return '#FFC0AD';     // --red-300
    return '#FFDFD5';                     // --red-100
  }
  // 5 GHz colors
  if (band === '5') {
    if (mbps >= 100) return '#2B28F7';    // --blue-950
    if (mbps >= 50) return '#8263FC';     // --blue-700
    if (mbps >= 20) return '#B79CFF';     // --blue-400
    return '#E4D7FF';                     // --blue-100
  }
  // fallback
  return 'gray';
}

// --- Utility: Band Detection ---
function detectBand(row) {
  // Use frequency if available, else channel
  if (row.frequency) {
    if (row.frequency >= 2400 && row.frequency <= 2499) return '2.4';
    if (row.frequency >= 5000 && row.frequency <= 5999) return '5';
  }
  if (row.channel) {
    if (row.channel >= 1 && row.channel <= 14) return '2.4';
    if (row.channel >= 36 && row.channel <= 165) return '5';
  }
  return null;
}

// Format a timestamp string (or epoch) to YYYY-MM-DD HH:MM (local time)
function formatTimestamp(ts) {
  if (!ts && ts !== 0) return '';
  try {
    let d = (typeof ts === 'number') ? new Date(ts) : new Date(String(ts));
    if (isNaN(d.getTime())) return String(ts);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  } catch (e) {
    return String(ts);
  }
}

// --- Load APs and Populate Dropdown ---
fetch('aps.json')
  .then(response => response.json())
  .then(json => {
    apList = json;
    apList.forEach(ap => {
      const opt = document.createElement('option');
      opt.value = ap.devicename;
      opt.textContent = ap.devicename;
      apSelect.appendChild(opt);
    });
  });

// --- Load Speed Test Data ---
function loadSpeedTestData(cb) {
  fetch('iperf3_data.csv')
    .then(response => response.text())
    .then(csvText => {
      // Try parsing with header first. If the file has no header (first row is data), fall back to index mapping.
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: false,
        complete: results => {
          let rows = results.data || [];
          const hasHeader = results.meta && Array.isArray(results.meta.fields) && results.meta.fields.length > 0 && (results.meta.fields[0].toString().toLowerCase().includes('timestamp') || results.meta.fields.some(f => f && f.toString().toLowerCase().includes('iperf')));
          if (!hasHeader || rows.length === 0 || Object.keys(rows[0]).length <= 2) {
            // fallback: parse without header and map by column index
            const raw = Papa.parse(csvText, { header: false, dynamicTyping: false }).data || [];
            rows = raw.map(r => {
              // expected columns (index-based):
              // 0: timestamp, 1:ssid, 2:bssid, 3:signal_dbm, 4:channel/frequency, 5:iperf3_server, 6:iperf_direction,
              // 7:iperf_throughput_mbps, 8:iperf_jitter_ms, 9:iperf_loss_percent, 10:packets, 11:lost_packets, 12:lat, 13:long, 14:devicename
              return {
                timestamp: r[0],
                ssid: r[1],
                bssid: r[2],
                signal_dbm: r[3] != null && r[3] !== '' ? Number(r[3]) : null,
                frequency: r[4] != null && r[4] !== '' ? Number(r[4]) : null,
                iperf3_server: r[5],
                iperf_direction: r[6],
                iperf_throughput_mbps: r[7] != null && r[7] !== '' ? Number(r[7]) : null,
                iperf_jitter_ms: r[8] != null && r[8] !== '' ? Number(r[8]) : null,
                iperf_loss_percent: r[9] != null && r[9] !== '' ? Number(r[9]) : null,
                packets: r[10] != null && r[10] !== '' ? Number(r[10]) : null,
                lost_packets: r[11] != null && r[11] !== '' ? Number(r[11]) : null,
                lat: r[12] != null && r[12] !== '' ? Number(r[12]) : null,
                long: r[13] != null && r[13] !== '' ? Number(r[13]) : null,
                devicename: r[14] || (r[12] && r[13] && r[12].toString().startsWith('pole') ? r[12] : '')
              };
            });
          } else {
            // normal header-based parse: coerce numeric fields where appropriate
            rows = rows.map(r => {
              return Object.assign({}, r, {
                signal_dbm: r.signal_dbm != null && r.signal_dbm !== '' ? Number(r.signal_dbm) : null,
                frequency: r.frequency != null && r.frequency !== '' ? Number(r.frequency) : (r.channel != null && r.channel !== '' ? Number(r.channel) : null),
                channel: r.channel != null && r.channel !== '' ? Number(r.channel) : null,
                iperf_throughput_mbps: r.iperf_throughput_mbps != null && r.iperf_throughput_mbps !== '' ? Number(r.iperf_throughput_mbps) : null,
                iperf_jitter_ms: r.iperf_jitter_ms != null && r.iperf_jitter_ms !== '' ? Number(r.iperf_jitter_ms) : null,
                iperf_loss_percent: r.iperf_loss_percent != null && r.iperf_loss_percent !== '' ? Number(r.iperf_loss_percent) : null,
                packets: (r.packets != null && r.packets !== '') ? Number(r.packets) : ((r.packets_sent != null && r.packets_sent !== '') ? Number(r.packets_sent) : null),
                lost_packets: (r.lost_packets != null && r.lost_packets !== '') ? Number(r.lost_packets) : ((r.lost != null && r.lost !== '') ? Number(r.lost) : null),
                lat: r.lat != null && r.lat !== '' ? Number(r.lat) : (r.latitude != null && r.latitude !== '' ? Number(r.latitude) : null),
                long: r.long != null && r.long !== '' ? Number(r.long) : (r.longitude != null && r.longitude !== '' ? Number(r.longitude) : null)
              });
            });
          }

          speedTestData = rows.filter(row => row.lat != null && row.long != null && row.devicename);
          if (cb) cb();
        }
      });
    });
}

// initial load
loadSpeedTestData();

// reload handler: preserves current filters and re-renders
if (reloadButton) {
  reloadButton.addEventListener('click', () => {
    const currentAP = apSelect.value;
    const currentBand = bandSelect ? bandSelect.value : 'all';
    loadSpeedTestData(() => {
      if (currentAP) drawSpeedTestsForAP(currentAP, currentBand);
    });
  });
}

// --- Draw Markers for Selected AP ---
function drawSpeedTestsForAP(devicename, band='all') {
  speedMarkersLayer.clearLayers();
  if (!devicename) return;

  // Filter speed tests for AP by devicename
  let tests = speedTestData.filter(row => row.devicename === devicename);
  // apply band filter unless 'all'
  if (band && band !== 'all') {
    tests = tests.filter(row => detectBand(row) === band);
  }

  // filter by direction
  const dir = dirSelect ? dirSelect.value : 'all';
  if (dir && dir !== 'all') {
    tests = tests.filter(row => (row.iperf_direction || '').toLowerCase() === dir);
  }

  // filter by throughput range
  const minT = minThroughputInput && minThroughputInput.value ? Number(minThroughputInput.value) : null;
  const maxT = maxThroughputInput && maxThroughputInput.value ? Number(maxThroughputInput.value) : null;
  if (minT !== null) tests = tests.filter(r => (r.iperf_throughput_mbps || 0) >= minT);
  if (maxT !== null) tests = tests.filter(r => (r.iperf_throughput_mbps || 0) <= maxT);

  const latlngs = [];
  // create markers array and push in the same order as tests
  activeMarkers = [];
  tests.forEach((row, idx) => {
    const band = detectBand(row);
    const color = getSpeedTestColor(band, row.iperf_throughput_mbps);
    // Use colored icons (circle instead of tachometer for better color display)
    const markerIcon = L.AwesomeMarkers.icon({
      icon: 'circle',
      markerColor: 'white', // Use white so the icon color stands out
      prefix: 'fa',
      iconColor: color,
      extraClasses: 'fa-lg'
    });
      const marker = L.marker([row.lat, row.long], {icon: markerIcon})
      .addTo(speedMarkersLayer)
      .bindPopup(
        `<b>Speed Test</b><br>
         <b>Timestamp:</b> ${formatTimestamp(row.timestamp)}<br>
         <b>SSID:</b> ${row.ssid}<br>
         <b>BSSID:</b> ${row.bssid}<br>
         <b>Band:</b> ${band ? (band === '2.4' ? '2.4 GHz' : '5 GHz') : 'Unknown'}<br>
         <b>Signal:</b> ${row.signal_dbm} dBm<br>
         <b>Frequency:</b> ${row.frequency || 'N/A'}<br>
         <b>Channel:</b> ${row.channel || 'N/A'}<br>
         <b>Direction:</b> ${row.iperf_direction}<br>
         <b>Throughput:</b> ${row.iperf_throughput_mbps ? row.iperf_throughput_mbps.toFixed(1) : 'N/A'} Mbps<br>
         <b>Jitter:</b> ${row.iperf_jitter_ms || 'N/A'} ms<br>
         <b>Loss:</b> ${row.iperf_loss_percent || 'N/A'} %<br>
         <b>Packets:</b> ${row.packets != null ? row.packets : (row.packets_sent != null ? row.packets_sent : 'N/A')}<br>
         <b>Lost packets:</b> ${row.lost_packets != null ? row.lost_packets : (row.lost != null ? row.lost : 'N/A')}<br>
        <b>Device:</b> ${row.devicename || ''}`
      );
      latlngs.push([row.lat, row.long]);
      activeMarkers.push(marker);
  });

  // Recenter map to show all speed test markers for selected AP
  if (latlngs.length > 0) {
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, {maxZoom: 20});
  }
  // update test count
  if (testCount) testCount.textContent = `Shown: ${tests.length}`;
  // Populate marker details list with sorting and click handlers
  const detailsList = document.getElementById('marker-details-list');
  if (detailsList) {
    if (!tests || tests.length === 0) {
      detailsList.innerHTML = 'No tests selected';
    } else {
      // sorting
      const sortSelect = document.getElementById('sort-select');
      const sortOrder = document.getElementById('sort-order');
      let sorted = tests.slice();
      const key = sortSelect ? sortSelect.value : 'none';
      const order = sortOrder ? sortOrder.value : 'desc';
      if (key && key !== 'none') {
        sorted.sort((a,b) => {
          let va = 0, vb = 0;
          if (key === 'throughput') { va = a.iperf_throughput_mbps || 0; vb = b.iperf_throughput_mbps || 0; }
          if (key === 'time') { va = new Date(a.timestamp || 0).getTime(); vb = new Date(b.timestamp || 0).getTime(); }
          if (key === 'signal') { va = a.signal_dbm || 0; vb = b.signal_dbm || 0; }
          return (va - vb) * (order === 'asc' ? 1 : -1);
        });
      }

      const maxShow = 100; // cap to avoid overwhelming the UI
      const rowsToShow = sorted.slice(0, maxShow);
      detailsList.innerHTML = rowsToShow.map((r, i) => {
        const band = detectBand(r) || 'Unknown';
        const dir = r.iperf_direction || 'N/A';
  const thr = r.iperf_throughput_mbps != null ? r.iperf_throughput_mbps.toFixed(1) + ' Mbps' : 'N/A';
  const jit = r.iperf_jitter_ms != null ? r.iperf_jitter_ms + ' ms' : 'N/A';
  const loss = r.iperf_loss_percent != null ? r.iperf_loss_percent + ' %' : 'N/A';
  const pk = r.packets != null ? r.packets : (r.packets_sent != null ? r.packets_sent : 'N/A');
  const lostpk = r.lost_packets != null ? r.lost_packets : (r.lost != null ? r.lost : 'N/A');
  const when = formatTimestamp(r.timestamp) || '';
        const ssid = r.ssid || '';
        const bssid = r.bssid || '';
        // include data-index pointing to the corresponding marker index in activeMarkers
  return `<div class="marker-row" data-index="${i}"><div class="marker-row-left">${when} ${dir}</div><div class="marker-row-right">${thr} ${band} | J:${jit} | L:${loss}<br>Pk:${pk} | Lost:${lostpk}<br><small>${ssid} ${bssid}</small></div></div>`;
      }).join('');
      if (tests.length > maxShow) {
        detailsList.innerHTML += `<div class="marker-row"><em>and ${tests.length - maxShow} more...</em></div>`;
      }

      // attach click handlers: map rows to markers by matching lat/lon (best-effort)
      const rows = detailsList.querySelectorAll('.marker-row[data-index]');
      rows.forEach((rowEl, listIdx) => {
        rowEl.style.cursor = 'pointer';
        rowEl.addEventListener('click', () => {
          // remove previous selection
          const prev = detailsList.querySelector('.marker-row.selected');
          if (prev) prev.classList.remove('selected');
          // mark this row selected
          rowEl.classList.add('selected');
          // ensure the row is visible
          rowEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});

          const item = rowsToShow[listIdx];
          if (!item) return;
          const lat = Number(item.lat);
          const lon = Number(item.long || item.lng || item.lon || item.longitude || item.long);
          if (!isNaN(lat) && !isNaN(lon)) {
            // pan to location but preserve zoom level
            const currentZoom = map.getZoom();
            map.setView([lat, lon], Math.max(currentZoom, 18));
            // try to find the matching marker and open popup
            const matching = activeMarkers.find(m => {
              const ml = m.getLatLng();
              return Math.abs(ml.lat - lat) < 1e-6 && Math.abs(ml.lng - lon) < 1e-6;
            });
            if (matching) matching.openPopup();
          }
        });
      });
    }
  }
}

// --- Legend ---
function updateLegend() {
  legendPanel.innerHTML = `
    <b>Speed Test Marker Colors</b><br>
    <div>
      <span style="color:#FFDFD5;font-weight:bold;"><i class="fa fa-circle"></i></span> 2.4 GHz 0–19 Mbps<br>
      <span style="color:#FFC0AD;font-weight:bold;"><i class="fa fa-circle"></i></span> 2.4 GHz 20–49 Mbps<br>
      <span style="color:#FF7D5F;font-weight:bold;"><i class="fa fa-circle"></i></span> 2.4 GHz 50–99 Mbps<br>
      <span style="color:#F73E28;font-weight:bold;"><i class="fa fa-circle"></i></span> 2.4 GHz ≥100 Mbps<br>
      <span style="color:#E4D7FF;font-weight:bold;"><i class="fa fa-circle"></i></span> 5 GHz 0–19 Mbps<br>
      <span style="color:#B79CFF;font-weight:bold;"><i class="fa fa-circle"></i></span> 5 GHz 20–49 Mbps<br>
      <span style="color:#8263FC;font-weight:bold;"><i class="fa fa-circle"></i></span> 5 GHz 50–99 Mbps<br>
      <span style="color:#2B28F7;font-weight:bold;"><i class="fa fa-circle"></i></span> 5 GHz ≥100 Mbps
    </div>
  `;
}
updateLegend();

// --- Event: AP Selection ---
apSelect.addEventListener('change', () => {
  const selectedAP = apSelect.value;
  if (selectedAP) {
    if (bandSelect) bandSelect.value = 'all';
    if (dirSelect) dirSelect.value = 'all';
    if (minThroughputInput) minThroughputInput.value = '';
    if (maxThroughputInput) maxThroughputInput.value = '';
    drawSpeedTestsForAP(selectedAP, bandSelect ? bandSelect.value : 'all');
  } else {
    drawSpeedTestsForAP('');
    if (testCount) testCount.textContent = 'Shown: 0';
  }
});

// redraw when band, direction, or throughput filters change
if (bandSelect) bandSelect.addEventListener('change', () => { if (apSelect.value) drawSpeedTestsForAP(apSelect.value, bandSelect.value); });
if (dirSelect) dirSelect.addEventListener('change', () => { if (apSelect.value) drawSpeedTestsForAP(apSelect.value, bandSelect.value); });
if (minThroughputInput) minThroughputInput.addEventListener('input', () => { if (apSelect.value) drawSpeedTestsForAP(apSelect.value, bandSelect.value); });
if (maxThroughputInput) maxThroughputInput.addEventListener('input', () => { if (apSelect.value) drawSpeedTestsForAP(apSelect.value, bandSelect.value); });
