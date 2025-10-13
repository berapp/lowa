// --- Map Setup ---
const MAP_CENTER = [26.674, -81.806]; // Approximate resort center
const MAP_ZOOM = 16;
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);

L.tileLayer(SATELLITE_URL, {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 19
}).addTo(map);

// --- Layers ---
let poleMarkers = L.layerGroup().addTo(map);
let speedMarkers = L.layerGroup();
let heatLayer = null;

// --- Filtering State ---
let speedTestData = [];
let heatmapData = [];
let filterState = {
  ssid: '',
  minSignal: -100,
  maxSignal: 0,
  minThroughput: 0,
  maxThroughput: 1000,
};

// --- Filtering UI ---
const filterControl = L.control({position: 'topright'});
filterControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'filter-control');
  div.innerHTML = `
    <label>SSID: <input type="text" id="filter-ssid" style="width:120px"></label><br>
    <label>Signal dBm: <input type="number" id="filter-minSignal" style="width:40px" value="-100"> to 
      <input type="number" id="filter-maxSignal" style="width:40px" value="0"></label><br>
    <label>Throughput Mbps: <input type="number" id="filter-minThroughput" style="width:40px" value="0"> to 
      <input type="number" id="filter-maxThroughput" style="width:60px" value="1000"></label><br>
    <button id="filter-apply">Apply</button>
    <button id="filter-reset">Reset</button>
  `;
  return div;
};
filterControl.addTo(map);

// --- Layer Toggle UI ---
const layerControl = L.control({position: 'topright'});
layerControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'layer-control');
  div.innerHTML = `
    <label><input type="checkbox" id="toggle-speed" checked> Show Speed Tests</label><br>
    <label><input type="checkbox" id="toggle-heat" checked> Show Signal Heatmap</label>
  `;
  return div;
};
layerControl.addTo(map);

// --- Legend UI ---
const legendControl = L.control({position: 'bottomright'});
legendControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <b>Speed Test Marker Colors</b><br>
    <span style="color:green;font-weight:bold;">&#9679;</span> ≥100 Mbps<br>
    <span style="color:limegreen;font-weight:bold;">&#9679;</span> 50–99 Mbps<br>
    <span style="color:orange;font-weight:bold;">&#9679;</span> 20–49 Mbps<br>
    <span style="color:red;font-weight:bold;">&#9679;</span> 1–19 Mbps<br>
    <span style="color:gray;font-weight:bold;">&#9679;</span> 0 Mbps<br>
    <hr style="margin:6px 0">
    <b>Heatmap</b>: Signal strength (dBm)<br>
    <span style="background:blue;color:white;padding:2px 5px;border-radius:2px;">Strong</span>
    <span style="background:lime;color:black;padding:2px 5px;border-radius:2px;">Medium</span>
    <span style="background:red;color:white;padding:2px 5px;border-radius:2px;">Weak</span>
  `;
  return div;
};
legendControl.addTo(map);

// --- Utility ---
function getSpeedColor(mbps) {
  if (mbps >= 100) return 'green';
  if (mbps >= 50) return 'limegreen';
  if (mbps >= 20) return 'orange';
  if (mbps > 0) return 'red';
  return 'gray';
}

// --- Load Pole Markers ---
fetch('pole_locations.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        results.data.forEach(row => {
          if (!row.lat || !row.long) return;
          L.marker([row.lat, row.long])
            .addTo(poleMarkers)
            .bindPopup(
              `<b>Pole ID:</b> ${row.pole_id}<br>
               <b>Timestamp:</b> ${row.timestamp}`
            );
        });
      }
    });
  });

// --- Load and Plot Speed Test Markers ---
function plotSpeedTests() {
  speedMarkers.clearLayers();
  speedTestData.forEach(row => {
    // Filtering
    if (filterState.ssid && row.ssid && !row.ssid.toLowerCase().includes(filterState.ssid.toLowerCase())) return;
    if (row.signal_dbm < filterState.minSignal || row.signal_dbm > filterState.maxSignal) return;
    if (row.iperf_throughput_mbps < filterState.minThroughput || row.iperf_throughput_mbps > filterState.maxThroughput) return;
    if (!row.lat || !row.long || !row.iperf_throughput_mbps) return;

    // Color based on throughput
    const color = getSpeedColor(row.iperf_throughput_mbps);
    const radius = Math.max(6, Math.min(24, row.iperf_throughput_mbps / 5));
    L.circleMarker([row.lat, row.long], {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.7,
      weight: 2
    })
    .addTo(speedMarkers)
    .bindPopup(
      `<b>Speed Test</b><br>
       <b>Timestamp:</b> ${row.timestamp}<br>
       <b>SSID:</b> ${row.ssid}<br>
       <b>BSSID:</b> ${row.bssid}<br>
       <b>Signal:</b> ${row.signal_dbm} dBm<br>
       <b>Channel:</b> ${row.channel}<br>
       <b>Direction:</b> ${row.iperf_direction}<br>
       <b>Throughput:</b> ${row.iperf_throughput_mbps.toFixed(1)} Mbps<br>
       <b>Jitter:</b> ${row.iperf_jitter_ms || 'N/A'} ms<br>
       <b>Loss:</b> ${row.iperf_loss_percent || 'N/A'} %<br>
       <b>Device:</b> ${row.devicename || ''}`
    );
  });
}

// --- Load Speed Data ---
fetch('iperf3_data_20251009.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        speedTestData = results.data.filter(row => row.lat && row.long);
        plotSpeedTests();
        speedMarkers.addTo(map);
      }
    });
  });

// --- Signal Heatmap Layer ---
function plotHeatmap() {
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (!heatmapData.length) return;
  // Prepare as [lat, long, intensity]
  const points = heatmapData
    .filter(r => r.lat && r.long && typeof r.signal_dbm === 'number')
    .map(r => [
      r.lat, r.long,
      // Normalize signal_dbm (-30 = strong, -90 = weak)
      Math.max(0.1, Math.min(1, (r.signal_dbm + 100) / 70))
    ]);
  heatLayer = L.heatLayer(points, {
    radius: 25,
    blur: 18,
    maxZoom: 17,
    gradient: {
      0.8: 'blue',    // strong
      0.5: 'lime',    // medium
      0.2: 'red'      // weak
    }
  });
  heatLayer.addTo(map);
}

// --- Load Signal Scan Data (for Heatmap) ---
fetch('signal_scan_data_20251009.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        heatmapData = results.data.filter(row => row.lat && row.long && typeof row.signal_dbm === 'number');
        plotHeatmap();
      }
    });
  });

// --- Layer Toggle Handlers ---
function updateLayerVisibility() {
  const speedChecked = document.getElementById('toggle-speed').checked;
  const heatChecked = document.getElementById('toggle-heat').checked;
  if (speedChecked) {
    if (!map.hasLayer(speedMarkers)) speedMarkers.addTo(map);
  } else {
    if (map.hasLayer(speedMarkers)) map.removeLayer(speedMarkers);
  }
  if (heatChecked) {
    if (heatLayer && !map.hasLayer(heatLayer)) heatLayer.addTo(map);
  } else {
    if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  }
}

// --- Filtering Handlers ---
function applyFilters() {
  filterState.ssid = document.getElementById('filter-ssid').value;
  filterState.minSignal = parseInt(document.getElementById('filter-minSignal').value, 10);
  filterState.maxSignal = parseInt(document.getElementById('filter-maxSignal').value, 10);
  filterState.minThroughput = parseFloat(document.getElementById('filter-minThroughput').value);
  filterState.maxThroughput = parseFloat(document.getElementById('filter-maxThroughput').value);
  plotSpeedTests();
  updateLayerVisibility();
}
function resetFilters() {
  document.getElementById('filter-ssid').value = '';
  document.getElementById('filter-minSignal').value = '-100';
  document.getElementById('filter-maxSignal').value = '0';
  document.getElementById('filter-minThroughput').value = '0';
  document.getElementById('filter-maxThroughput').value = '1000';
  applyFilters();
}

// --- Attach UI Event Listeners ---
setTimeout(() => {
  document.getElementById('toggle-speed').addEventListener('change', updateLayerVisibility);
  document.getElementById('toggle-heat').addEventListener('change', updateLayerVisibility);
  document.getElementById('filter-apply').addEventListener('click', applyFilters);
  document.getElementById('filter-reset').addEventListener('click', resetFilters);
}, 1000); // Give DOM time to render controls
