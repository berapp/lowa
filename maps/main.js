// Center on RV Resort, Fort Myers, FL
const MAP_CENTER = [26.674, -81.806];
const MAP_ZOOM = 16;
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const map = L.map('map', {maxZoom: 22}).setView(MAP_CENTER, MAP_ZOOM);

L.tileLayer(SATELLITE_URL, {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 22
}).addTo(map);

let poleMarkers = L.layerGroup().addTo(map);
let apMarkers = L.layerGroup().addTo(map);
let speedMarkers = L.layerGroup().addTo(map);
let heatLayer = null;

let speedTestData = [];
let heatmapData = [];
let apList = [];
let apLookup = {}; // deviceid and bssid -> AP object
let poleLocations = {}; // pole_id -> {lat, long}
let filterState = {
  ssid: '',
  minSignal: -100,
  maxSignal: 0,
  minThroughput: 0,
  maxThroughput: 1000,
  ap: '',
  startDate: '',
  endDate: '',
  band: ''
};

const filterControl = L.control({position: 'topright'});
filterControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'filter-control');
  div.innerHTML = `
    <label>SSID: <input type="text" id="filter-ssid" style="width:120px"></label><br>
    <label>Signal dBm: <input type="number" id="filter-minSignal" style="width:40px" value="-100"> to 
      <input type="number" id="filter-maxSignal" style="width:40px" value="0"></label><br>
    <label>Throughput Mbps: <input type="number" id="filter-minThroughput" style="width:40px" value="0"> to 
      <input type="number" id="filter-maxThroughput" style="width:60px" value="1000"></label><br>
    <label>AP: <select id="filter-ap"><option value="">(All)</option></select></label><br>
    <label>Band: 
      <select id="filter-band">
        <option value="">(All)</option>
        <option value="2.4">2.4 GHz</option>
        <option value="5">5 GHz</option>
      </select>
    </label><br>
    <label>Date Range: <input type="date" id="filter-startDate"> to <input type="date" id="filter-endDate"></label><br>
    <button id="filter-apply">Apply</button>
    <button id="filter-reset">Reset</button>
  `;
  return div;
};
filterControl.addTo(map);

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

const legendControl = L.control({position: 'bottomright'});
legendControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <b>Speed Test Marker Colors</b><br>
    <span style="color:green;font-weight:bold;"><i class="fa fa-tachometer"></i></span> ≥100 Mbps<br>
    <span style="color:limegreen;font-weight:bold;"><i class="fa fa-tachometer"></i></span> 50–99 Mbps<br>
    <span style="color:orange;font-weight:bold;"><i class="fa fa-tachometer"></i></span> 20–49 Mbps<br>
    <span style="color:red;font-weight:bold;"><i class="fa fa-tachometer"></i></span> 1–19 Mbps<br>
    <span style="color:gray;font-weight:bold;"><i class="fa fa-tachometer"></i></span> 0 Mbps<br>
    <hr style="margin:6px 0">
    <b>Heatmap</b>: Signal strength (dBm)<br>
    <span style="background:blue;color:white;padding:2px 5px;border-radius:2px;">Strong</span>
    <span style="background:lime;color:black;padding:2px 5px;border-radius:2px;">Medium</span>
    <span style="background:red;color:white;padding:2px 5px;border-radius:2px;">Weak</span>
    <hr style="margin:6px 0">
    <b>AP Marker:</b> <i class="fa fa-wifi" style="color:#2A85D9;font-size:20px"></i>
    <br>
    <b>Pole Marker:</b> <i class="fa fa-dot-circle-o" style="color:gray;font-size:20px"></i>
  `;
  return div;
};
legendControl.addTo(map);

function getSpeedColor(mbps) {
  if (mbps >= 100) return 'green';
  if (mbps >= 50) return 'limegreen';
  if (mbps >= 20) return 'orange';
  if (mbps > 0) return 'red';
  return 'gray';
}
// function matchesAP(row) {
//   if (!filterState.ap) return true;
//   if (row.bssid && apLookup[row.bssid] && apLookup[row.bssid].deviceid === filterState.ap) return true;
//   if (row.deviceid && row.deviceid === filterState.ap) return true;
//   if (row.devicename && apLookup[row.devicename] && apLookup[row.devicename].deviceid === filterState.ap) return true;
//   return false;
// }
function matchesAP(row) {
  if (!filterState.ap) return true;

  // Find selected AP object
  const selectedAP = apList.find(ap => ap.deviceid === filterState.ap);
  if (!selectedAP) return false;

  // Build array of all BSSIDs for selected AP
  const selectedBSSIDs = [
    selectedAP.bssid_24,
    selectedAP.bssid_5,
    selectedAP.bssid_guest24,
    selectedAP.bssid_guest5
  ].filter(Boolean);

  // Only match if row.bssid matches one of the selected AP's BSSIDs
  return selectedBSSIDs.includes(row.bssid);
}
function matchesDate(row) {
  if (!filterState.startDate && !filterState.endDate) return true;
  if (!row.timestamp) return false;
  let rowDate = new Date(row.timestamp);
  if (filterState.startDate) {
    let start = new Date(filterState.startDate);
    if (rowDate < start) return false;
  }
  if (filterState.endDate) {
    let end = new Date(filterState.endDate);
    end.setDate(end.getDate() + 1);
    if (rowDate >= end) return false;
  }
  return true;
}
function isBandMatch(row) {
  if (!filterState.band) return true;
  if (filterState.band === '2.4') {
    // Use frequency if available
    if (row.frequency) {
      return row.frequency >= 2400 && row.frequency <= 2499;
    }
    // fallback to channel
    if (row.channel) {
      return row.channel >= 1 && row.channel <= 14;
    }
  }
  if (filterState.band === '5') {
    if (row.frequency) {
      return row.frequency >= 5000 && row.frequency <= 5999;
    }
    if (row.channel) {
      return row.channel >= 36 && row.channel <= 165;
    }
  }
  return true;
}

fetch('pole_locations.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        results.data.forEach(row => {
          if (row.pole_id && row.lat && row.long) {
            poleLocations[row.pole_id] = {lat: row.lat, long: row.long};
            const poleIcon = L.AwesomeMarkers.icon({
              icon: 'dot-circle-o',
              markerColor: 'gray',
              prefix: 'fa'
            });
            L.marker([row.lat, row.long], {icon: poleIcon})
              .addTo(poleMarkers)
              .bindPopup(
                `<b>Pole ID:</b> ${row.pole_id}<br>
                 <b>Timestamp:</b> ${row.timestamp}`
              );
          }
        });
        loadAPsOnPoles();
      }
    });
  });

function loadAPsOnPoles() {
  fetch('aps.json')
    .then(response => response.json())
    .then(list => {
      apList = list;
      apMarkers.clearLayers();
      apLookup = {};
      const apSelect = document.getElementById('filter-ap');
      apSelect.innerHTML = `<option value="">(All)</option>`;
      apList.forEach(ap => {
        apLookup[ap.deviceid] = ap;
        [ap.bssid_24, ap.bssid_5, ap.bssid_guest24, ap.bssid_guest5].forEach(bssid => {
          if (bssid) apLookup[bssid] = ap;
        });
        if (ap.devicename) apLookup[ap.devicename] = ap;
        const option = document.createElement('option');
        option.value = ap.deviceid;
        option.textContent = ap.devicename || ap.deviceid;
        apSelect.appendChild(option);
        const pole = poleLocations[ap.pole_id];
        if (pole) {
          const bssidList = [
            ap.bssid_24, ap.bssid_5, ap.bssid_guest24, ap.bssid_guest5
          ].filter(Boolean).map(b => `<li>${b}</li>`).join('');
          const popup = `
            <b>AP: ${ap.devicename || ap.deviceid}</b><br>
            <b>Pole:</b> ${ap.pole_id}<br>
            <b>Device ID:</b> ${ap.deviceid}<br>
            <b>Channels:</b> 2.4GHz=${ap.channel_24}, 5GHz=${ap.channel_5}<br>
            <b>BSSIDs:</b><ul>${bssidList}</ul>
          `;
          const apIcon = L.AwesomeMarkers.icon({
            icon: 'wifi',
            markerColor: 'blue',
            prefix: 'fa'
          });
          L.marker([pole.lat, pole.long], {icon: apIcon})
            .addTo(apMarkers)
            .bindPopup(popup);
        }
      });
    });
}

function plotSpeedTests() {
  speedMarkers.clearLayers();
  speedTestData.forEach(row => {
    if (filterState.ssid && row.ssid && !row.ssid.toLowerCase().includes(filterState.ssid.toLowerCase())) return;
    if (row.signal_dbm < filterState.minSignal || row.signal_dbm > filterState.maxSignal) return;
    if (row.iperf_throughput_mbps < filterState.minThroughput || row.iperf_throughput_mbps > filterState.maxThroughput) return;
    if (!matchesAP(row)) return;
    if (!matchesDate(row)) return;
    if (!isBandMatch(row)) return;
    if (!row.lat || !row.long || !row.iperf_throughput_mbps) return;
    const color = getSpeedColor(row.iperf_throughput_mbps);
    const speedIcon = L.AwesomeMarkers.icon({
      icon: 'tachometer',
      markerColor: color,
      prefix: 'fa'
    });
    L.marker([row.lat, row.long], {icon: speedIcon})
      .addTo(speedMarkers)
      .bindPopup(
        `<b>Speed Test</b><br>
         <b>Timestamp:</b> ${row.timestamp}<br>
         <b>SSID:</b> ${row.ssid}<br>
         <b>BSSID:</b> ${row.bssid}<br>
         <b>Signal:</b> ${row.signal_dbm} dBm<br>
         <b>Frequency:</b> ${row.frequency || 'N/A'}<br>
         <b>Channel:</b> ${row.channel}<br>
         <b>Direction:</b> ${row.iperf_direction}<br>
         <b>Throughput:</b> ${row.iperf_throughput_mbps.toFixed(1)} Mbps<br>
         <b>Jitter:</b> ${row.iperf_jitter_ms || 'N/A'} ms<br>
         <b>Loss:</b> ${row.iperf_loss_percent || 'N/A'} %<br>
         <b>Device:</b> ${row.devicename || ''}`
      );
  });
}

fetch('data/iperf3_data.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        speedTestData = results.data.filter(row => row.lat && row.long);
        plotSpeedTests();
      }
    });
  });

function plotHeatmap() {
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (!heatmapData.length) return;
  const points = heatmapData
    .filter(row => {
      if (filterState.ssid && row.ssid && !row.ssid.toLowerCase().includes(filterState.ssid.toLowerCase())) return false;
      if (row.signal_dbm < filterState.minSignal || row.signal_dbm > filterState.maxSignal) return false;
      if (!matchesAP(row)) return false;
      if (!matchesDate(row)) return false;
      // Optional: apply band filter to heatmap also
      if (!isBandMatch(row)) return false;
      return row.lat && row.long && typeof row.signal_dbm === 'number';
    })
    .map(row => [
      row.lat, row.long,
      Math.max(0.1, Math.min(1, (row.signal_dbm + 100) / 70))
    ]);
  heatLayer = L.heatLayer(points, {
    radius: 25,
    blur: 18,
    maxZoom: 17,
    gradient: {
      0.8: 'blue',
      0.5: 'lime',
      0.2: 'red'
    }
  });
  heatLayer.addTo(map);
}

fetch('data/signal_data.csv')
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

function applyFilters() {
  filterState.ssid = document.getElementById('filter-ssid').value;
  filterState.minSignal = parseInt(document.getElementById('filter-minSignal').value, 10);
  filterState.maxSignal = parseInt(document.getElementById('filter-maxSignal').value, 10);
  filterState.minThroughput = parseFloat(document.getElementById('filter-minThroughput').value);
  filterState.maxThroughput = parseFloat(document.getElementById('filter-maxThroughput').value);
  filterState.ap = document.getElementById('filter-ap').value;
  filterState.band = document.getElementById('filter-band').value;
  filterState.startDate = document.getElementById('filter-startDate').value;
  filterState.endDate = document.getElementById('filter-endDate').value;
  plotSpeedTests();
  plotHeatmap();
  updateLayerVisibility();
}
function resetFilters() {
  document.getElementById('filter-ssid').value = '';
  document.getElementById('filter-minSignal').value = '-100';
  document.getElementById('filter-maxSignal').value = '0';
  document.getElementById('filter-minThroughput').value = '0';
  document.getElementById('filter-maxThroughput').value = '1000';
  document.getElementById('filter-ap').value = '';
  document.getElementById('filter-band').value = '';
  document.getElementById('filter-startDate').value = '';
  document.getElementById('filter-endDate').value = '';
  applyFilters();
}

setTimeout(() => {
  document.getElementById('toggle-speed').addEventListener('change', updateLayerVisibility);
  document.getElementById('toggle-heat').addEventListener('change', updateLayerVisibility);
  document.getElementById('filter-apply').addEventListener('click', applyFilters);
  document.getElementById('filter-reset').addEventListener('click', resetFilters);
  document.getElementById('filter-ap').addEventListener('change', applyFilters);
  document.getElementById('filter-band').addEventListener('change', applyFilters);
}, 1000);
