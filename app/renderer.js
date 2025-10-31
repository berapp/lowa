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
const legendPanel = document.getElementById('legend-content');
const bandSelect = document.getElementById('band-select');
const dirSelect = document.getElementById('dir-select');
const minThroughputInput = document.getElementById('min-throughput');
const maxThroughputInput = document.getElementById('max-throughput');
const testCount = document.getElementById('test-count');
const reloadButton = document.getElementById('reload-data');
// dataset selector will be created dynamically below
let datasetSelect = document.getElementById('dataset-select');

// --- GPS UI Elements ---
const gpsEnableBtn = document.getElementById('gps-enable');
const gpsDisableBtn = document.getElementById('gps-disable');
const gpsCenterBtn = document.getElementById('gps-center');
const gpsStatus = document.getElementById('gps-status');
const gpsCoords = document.getElementById('gps-coords');
const gpsSourceSelect = document.getElementById('gps-source');
const gpsTrackCheckbox = document.getElementById('gps-track-enable');
const gpsClearTrackBtn = document.getElementById('gps-clear-track');

// --- GPS Dialog Elements ---
const gpsDialog = document.getElementById('gps-dialog');
const gpsPortSelect = document.getElementById('gps-port-select');
const gpsBaudSelect = document.getElementById('gps-baud-select');
const gpsDialogCancel = document.getElementById('gps-dialog-cancel');
const gpsDialogConnect = document.getElementById('gps-dialog-connect');

const gpsManualDialog = document.getElementById('gps-manual-dialog');
const gpsManualLat = document.getElementById('gps-manual-lat');
const gpsManualLng = document.getElementById('gps-manual-lng');
const gpsManualCancel = document.getElementById('gps-manual-cancel');
const gpsManualSet = document.getElementById('gps-manual-set');

// --- GPS Smoothing Dialog Elements ---
const gpsSmoothingCheckbox = document.getElementById('gps-smoothing-enable');
const gpsSmoothingConfigBtn = document.getElementById('gps-smoothing-config');
const gpsSmoothingDialog = document.getElementById('gps-smoothing-dialog');
const gpsSmoothingWindow = document.getElementById('gps-smoothing-window');
const gpsSmoothingAccuracy = document.getElementById('gps-smoothing-accuracy');
const gpsSmoothingAge = document.getElementById('gps-smoothing-age');
const gpsSmoothingGain = document.getElementById('gps-smoothing-gain');
const gpsSmoothingCancel = document.getElementById('gps-smoothing-cancel');
const gpsSmoothingApply = document.getElementById('gps-smoothing-apply');

// --- Data ---
let apList = [];
let speedTestData = [];
let speedMarkersLayer = L.layerGroup().addTo(map);
let activeMarkers = []; // store markers for current draw order
let currentDataset = 'iperf3_consolidated.csv';
let selectedDate = null; // for date filtering
let allSpeedTestData = []; // store all loaded data
// Bucketed layer groups for legend toggles
let bucketLayers = {};
let bucketVisible = {};
// Define legend buckets (id, label, color)
const legendBuckets = [
  {id: '24_0_19', label: '2.4 GHz 0–19 Mbps', color: '#fcc'},
  {id: '24_20_49', label: '2.4 GHz 20–49 Mbps', color: '#f88'},
  {id: '24_50_99', label: '2.4 GHz 50–99 Mbps', color: '#f44'},
  {id: '24_100_plus', label: '2.4 GHz ≥100 Mbps', color: '#f00'},
  {id: '5_0_19', label: '5 GHz 0–19 Mbps', color: '#ccf'},
  {id: '5_20_49', label: '5 GHz 20–49 Mbps', color: '#88f'},
  {id: '5_50_99', label: '5 GHz 50–99 Mbps', color: '#44f'},
  {id: '5_100_plus', label: '5 GHz ≥100 Mbps', color: '#00f'},
];

// --- Thermal Data ---
let thermalData = [];
let poleLocations = [];
let thermalMarkersLayer = L.layerGroup();
let thermalVisible = false;
let thermalLastUpdate = null;

// --- Signal Strength Data ---
let signalData = [];
let allSignalData = [];
let signalMarkersLayer = L.layerGroup();
let signalVisible = false;
// Thermal color thresholds (Celsius)
const THERMAL_THRESHOLDS = {
  normal: 65,    // <65°C - green
  warm: 70,      // 65-70°C - yellow  
  hot: 75,       // 70-75°C - orange
  critical: 80   // >=75°C - red
};

// --- GPS Data ---
let gpsEnabled = false;
let gpsWatchId = null;
let gpsCurrentPosition = null;
let gpsMarker = null;
let gpsAccuracyCircle = null;
let gpsSource = 'browser'; // 'browser', 'serial', 'manual'
let gpsSerialPort = null;
let gpsTrackingEnabled = false;
let gpsTrackPoints = [];
let gpsTrackLayer = L.layerGroup();
const GPS_UPDATE_INTERVAL = 1000; // milliseconds

// --- GPS Smoothing ---
let gpsSmoothing = {
  enabled: true,
  windowSize: 5, // Number of readings to average
  readings: [], // Circular buffer of recent GPS readings
  minAccuracy: 50, // Reject readings with accuracy worse than this (meters)
  maxAge: 30000, // Maximum age of readings to include (milliseconds)
  kalmanGain: 0.3, // Simple Kalman filter gain (0-1, higher = more responsive)
  lastSmoothedPosition: null
};

// --- Pole Coverage Circles ---
let poleCirclesLayer = L.layerGroup();
let poleCirclesVisible = false;
const POLE_CIRCLE_RADIUS_FEET50 = 50;
const POLE_CIRCLE_RADIUS_FEET100 = 100;
const POLE_CIRCLE_RADIUS_FEET150 = 150;
const FEET_TO_METERS = 0.3048;
const POLE_CIRCLE_RADIUS_METERS50 = POLE_CIRCLE_RADIUS_FEET50 * FEET_TO_METERS;
const POLE_CIRCLE_RADIUS_METERS100 = POLE_CIRCLE_RADIUS_FEET100 * FEET_TO_METERS;
const POLE_CIRCLE_RADIUS_METERS150 = POLE_CIRCLE_RADIUS_FEET150 * FEET_TO_METERS;
// Add pole circles layer to map (initially hidden)
poleCirclesLayer.addTo(map);
// Add signal layer to map (initially hidden)
signalMarkersLayer.addTo(map);

// --- Signal Strength Thresholds (dBm) ---
const SIGNAL_THRESHOLDS = {
  excellent: -30, // > -30 dBm - green
  good: -50,      // -30 to -50 dBm - light green  
  fair: -60,      // -50 to -60 dBm - yellow
  weak: -70,      // -60 to -70 dBm - orange
  poor: -80       // -70 to -80 dBm - red
  // < -80 dBm - dark red
};

// Define thermal legend buckets
const thermalLegendBuckets = [
  {id: 'thermal_normal', label: 'Normal (<65°C)', color: '#2196F3'},
  {id: 'thermal_warm', label: 'Warm (65-70°C)', color: '#4CAF50'},
  {id: 'thermal_hot', label: 'Hot (70-75°C)', color: '#FFC107'},
  {id: 'thermal_critical', label: 'Critical (≥75°C)', color: '#F44336'},
  {id: 'thermal_offline', label: 'Offline/Error', color: '#9E9E9E'},
];

// Try to use Node fs to enumerate files in the data directory (works when Node integration is enabled)
let _fs = null;
let _path = null;
try {
  _fs = require('fs');
  _path = require('path');
} catch (e) {
  // Node not available in renderer; we'll fallback to default dataset
  // showDataDirPopup('Node.js fs/path modules not available in renderer; falling back to default dataset.');
  _fs = null;
  _path = null;
}

// Debug helper: show a short popup on the map (falls back to alert)
function showDataDirPopup(msg) {
  try {
    if (typeof L !== 'undefined' && map && map.getCenter) {
      L.popup({autoClose: true, closeOnClick: true})
       .setLatLng(map.getCenter())
       .setContent('<pre style="max-width:320px;white-space:pre-wrap;">' + String(msg) + '</pre>')
       .openOn(map);
      return;
    }
  } catch (e) {
    // fallthrough to alert
  }
  try { alert(msg); } catch (e) { console.log(msg); }
}

// --- Utility: Marker Color Logic ---
function getSpeedTestColor(band, mbps) {
  // 2.4 GHz colors
  if (band === '2.4') {
    if (mbps >= 100) return '#f00';
    if (mbps >= 50) return '#f44';
    if (mbps >= 20) return '#f88';
    return '#fcc';
  }
  // 5 GHz colors
  if (band === '5') {
    if (mbps >= 100) return '#00f';
    if (mbps >= 50) return '#44f';
    if (mbps >= 20) return '#88f';
    return '#ccf';
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

// Determine bucket id for a given row based on band and throughput
function getBucketId(row) {
  const band = detectBand(row);
  const mbps = row.iperf_throughput_mbps || 0;
  if (band === '2.4') {
    if (mbps >= 100) return '24_100_plus';
    if (mbps >= 50) return '24_50_99';
    if (mbps >= 20) return '24_20_49';
    return '24_0_19';
  }
  if (band === '5') {
    if (mbps >= 100) return '5_100_plus';
    if (mbps >= 50) return '5_50_99';
    if (mbps >= 20) return '5_20_49';
    return '5_0_19';
  }
  return 'unknown';
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

// --- Thermal Utility Functions ---
function getThermalColor(tempC) {
  if (tempC == null || isNaN(tempC)) return '#9E9E9E'; // gray for offline
  if (tempC >= THERMAL_THRESHOLDS.critical) return '#F44336'; // red
  if (tempC >= THERMAL_THRESHOLDS.hot) return '#FFC107'; // yellow
  if (tempC >= THERMAL_THRESHOLDS.warm) return '#4CAF50'; // green
  return '#2196F3'; // blue
}

function getThermalStatus(tempC) {
  if (tempC == null || isNaN(tempC)) return 'offline';
  if (tempC >= THERMAL_THRESHOLDS.critical) return 'critical';
  if (tempC >= THERMAL_THRESHOLDS.hot) return 'hot';
  if (tempC >= THERMAL_THRESHOLDS.warm) return 'warm';
  return 'normal';
}

// --- Signal Strength Utility Functions ---
function getSignalColor(signalDbm) {
  if (signalDbm == null || isNaN(signalDbm)) return '#9E9E9E'; // gray for no data
  if (signalDbm > SIGNAL_THRESHOLDS.excellent) return '#4CAF50'; // excellent - green
  if (signalDbm > SIGNAL_THRESHOLDS.good) return '#8BC34A'; // good - light green
  if (signalDbm > SIGNAL_THRESHOLDS.fair) return '#FFC107'; // fair - yellow
  if (signalDbm > SIGNAL_THRESHOLDS.weak) return '#FF9800'; // weak - orange
  if (signalDbm > SIGNAL_THRESHOLDS.poor) return '#F44336'; // poor - red
  return '#B71C1C'; // very poor - dark red
}

function getSignalStatus(signalDbm) {
  if (signalDbm == null || isNaN(signalDbm)) return 'no-data';
  if (signalDbm > SIGNAL_THRESHOLDS.excellent) return 'excellent';
  if (signalDbm > SIGNAL_THRESHOLDS.good) return 'good';
  if (signalDbm > SIGNAL_THRESHOLDS.fair) return 'fair';
  if (signalDbm > SIGNAL_THRESHOLDS.weak) return 'weak';
  if (signalDbm > SIGNAL_THRESHOLDS.poor) return 'poor';
  return 'very-poor';
}

function processThermalData(rawData) {
  // Group thermal readings by device and find only the most recent readings per device
  const deviceMap = {};
  
  // Only consider data from the last 4 hours for current thermal status
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000); // 4 hours ago
  
  // Process rows in reverse order (newest first) for efficiency  
  for (let i = rawData.length - 1; i >= 0; i--) {
    const row = rawData[i];
    if (!row.devicename || !row.temp_C) continue; // skip invalid rows
    if (row.error && row.error.trim()) continue; // skip error rows
    
    // Skip rows with SSH error messages or invalid data
    if (row.temp_C.includes('@') || row.temp_C.includes('WARNING') || 
        row.temp_C.includes('ssh') || row.temp_C === '') continue;
    
    const timestamp = new Date(row.timestamp);
    if (isNaN(timestamp.getTime())) continue; // Skip invalid timestamps
    
    // ONLY process recent data for thermal status (last 4 hours)
    if (timestamp < recentCutoff) continue;
    
    const device = row.devicename;
    const zone = row.zone || 'unknown';
    const tempC = parseFloat(row.temp_C);
    
    if (isNaN(tempC)) continue; // Skip non-numeric temperatures
    
    // Skip obviously invalid temperatures (like the 0.06°C readings)
    if (tempC < 10 || tempC > 100) continue;
    
    if (!deviceMap[device]) {
      deviceMap[device] = {
        devicename: device,
        host: row.host,
        zones: {},
        currentMaxTemp: -999, // Only current temps, not historical
        lastUpdate: null,
        status: 'offline'
      };
    }
    
    // Update zone info if this reading is newer
    if (!deviceMap[device].zones[zone] || timestamp > new Date(deviceMap[device].zones[zone].timestamp)) {
      deviceMap[device].zones[zone] = {
        zone: zone,
        type: row.type,
        temp_C: tempC,
        temp_F: parseFloat(row.temp_F) || (tempC * 9/5 + 32),
        timestamp: row.timestamp
      };
    }
    
    // Update device CURRENT max temp (only from recent readings)
    if (tempC > deviceMap[device].currentMaxTemp) {
      deviceMap[device].currentMaxTemp = tempC;
    }
    if (!deviceMap[device].lastUpdate || timestamp > new Date(deviceMap[device].lastUpdate)) {
      deviceMap[device].lastUpdate = row.timestamp;
    }
  }
  
  // Convert to array - only devices with data in the last 4 hours
  const results = Object.values(deviceMap)
    .map(device => {
      device.status = getThermalStatus(device.currentMaxTemp);
      // For backwards compatibility, set maxTemp to current value
      device.maxTemp = device.currentMaxTemp;
      return device;
    });
    
  console.log(`Thermal data processed - ${results.length} devices with recent data (last 4 hours)`);
  
  return results;
}

// --- Utility: Extract Pole Number from Device Name ---
function extractPoleNumber(devicename) {
  if (!devicename) return null;
  // Extract pole number from formats like "pole 01 NE", "pole 12 N", "pole 04", etc.
  const match = devicename.match(/pole\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// --- Load Pole Locations ---
function loadPoleLocations(cb) {
  fetch('data/pole_locations.csv')
    .then(response => response.text())
    .then(csvText => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: false,
        complete: results => {
          poleLocations = (results.data || []).map(row => ({
            pole_id: parseInt(row.pole_id, 10),
            lat: parseFloat(row.lat),
            long: parseFloat(row.long),
            timestamp: row.timestamp
          })).filter(p => !isNaN(p.pole_id) && !isNaN(p.lat) && !isNaN(p.long));
          
          console.log(`Loaded ${poleLocations.length} pole locations`);
          if (cb) cb();
        }
      });
    })
    .catch(err => {
      console.error('Failed to load pole locations:', err);
      poleLocations = [];
      if (cb) cb();
    });
}

// --- Pole Coverage Circles Functions ---
function drawPoleCircles() {
  // Clear existing circles
  poleCirclesLayer.clearLayers();
  
  if (!poleCirclesVisible) return;
  
  poleLocations.forEach(pole => {
    // Create 50ft radius circle around each pole
    const circle50 = L.circle([pole.lat, pole.long], {
      color: '#FF6B6B',        // Red border
      fillColor: '#FF6B6B',    // Red fill
      fillOpacity: 0.1,        // Semi-transparent
      radius: POLE_CIRCLE_RADIUS_METERS50,
      weight: 2,               // Border thickness
      dashArray: '5, 10'       // Dashed line
    });
    const circle100 = L.circle([pole.lat, pole.long], {
      color: '#FF8E8E',        // Lighter red border
      fillColor: '#FF8E8E',    // Lighter red fill
      fillOpacity: 0.1,        // Semi-transparent
      radius: POLE_CIRCLE_RADIUS_METERS100,
      weight: 2,               // Border thickness
      dashArray: '5, 10'       // Dashed line
    });
    const circle150 = L.circle([pole.lat, pole.long], {
      color: '#FFB3B3',        // Even lighter red border
      fillColor: '#FFB3B3',    // Even lighter red fill
      fillOpacity: 0.1,        // Semi-transparent
      radius: POLE_CIRCLE_RADIUS_METERS150,
      weight: 2,               // Border thickness
      dashArray: '5, 10'       // Dashed line
    });
    
    // Add popup with pole information
    circle50.bindPopup(`
      <b>Pole ${pole.pole_id}</b><br>
      Coverage: ${POLE_CIRCLE_RADIUS_FEET50}ft radius<br>
      Location: ${pole.lat.toFixed(6)}, ${pole.long.toFixed(6)}
    `);
    
    // Add to layer
    poleCirclesLayer.addLayer(circle50);
    poleCirclesLayer.addLayer(circle100);
    poleCirclesLayer.addLayer(circle150);
  });
  
  console.log(`Drew ${poleLocations.length} pole coverage circles`);
}

function togglePoleCircles() {
  poleCirclesVisible = !poleCirclesVisible;
  
  if (poleCirclesVisible) {
    drawPoleCircles();
  } else {
    poleCirclesLayer.clearLayers();
  }
  
  // Update legend
  updateLegend();
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

// Create date selector UI for filtering consolidated data
function createDateSelector() {
  // Create date selector container
  const dateContainer = document.createElement('div');
  dateContainer.id = 'date-selector-container';
  dateContainer.style.marginRight = '8px';
  dateContainer.style.display = 'inline-block';
  
  // Create label and date input
  const label = document.createElement('label');
  label.textContent = 'Filter by Date: ';
  label.style.marginRight = '4px';
  
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.id = 'date-selector';
  dateInput.style.marginRight = '8px';
  
  // Create "All Dates" button
  const allDatesBtn = document.createElement('button');
  allDatesBtn.textContent = 'All Dates';
  allDatesBtn.style.padding = '2px 6px';
  allDatesBtn.style.marginRight = '8px';
  
  dateContainer.appendChild(label);
  dateContainer.appendChild(dateInput);
  dateContainer.appendChild(allDatesBtn);
  
  // Insert before apSelect if possible
  if (apSelect && apSelect.parentNode) {
    apSelect.parentNode.insertBefore(dateContainer, apSelect);
  } else {
    document.body.insertBefore(dateContainer, document.body.firstChild);
  }
  
  // Create status display
  const status = document.createElement('div');
  status.id = 'dataset-status';
  status.style.margin = '6px 0 6px 0';
  status.style.fontSize = '0.9em';
  status.style.color = '#333';
  status.innerHTML = '<b>Data source:</b> iperf3_consolidated.csv';
  dateContainer.parentNode.insertBefore(status, dateContainer.nextSibling);
  
  // Event handlers
  dateInput.addEventListener('change', () => {
    selectedDate = dateInput.value;
    filterAndDisplayData();
  });
  
  allDatesBtn.addEventListener('click', () => {
    selectedDate = null;
    dateInput.value = '';
    filterAndDisplayData();
  });
  
  // Store reference globally
  datasetSelect = dateInput; // reuse existing variable name for compatibility
}

// Filter loaded data by selected date and redraw
function filterAndDisplayData() {
  if (!allSpeedTestData || allSpeedTestData.length === 0) return;
  
  if (selectedDate) {
    // Filter speed test data by selected date
    speedTestData = allSpeedTestData.filter(row => {
      if (!row.timestamp) return false;
      const rowDate = new Date(row.timestamp).toISOString().split('T')[0];
      return rowDate === selectedDate;
    });
    
    // Filter signal data by selected date
    if (allSignalData && allSignalData.length > 0) {
      signalData = allSignalData.filter(row => {
        if (!row.timestamp) return false;
        // Handle different timestamp formats
        let dateStr;
        if (row.timestamp.includes('_')) {
          // Format: 2025-10-31_14-06-57 -> 2025-10-31
          dateStr = row.timestamp.split('_')[0];
        } else {
          dateStr = new Date(row.timestamp).toISOString().split('T')[0];
        }
        return dateStr === selectedDate;
      });
    }
  } else {
    // Show all data
    speedTestData = [...allSpeedTestData];
    signalData = [...allSignalData];
  }
  
  // Update status display
  const status = document.getElementById('dataset-status');
  if (status) {
    const filteredCount = speedTestData.length;
    const totalCount = allSpeedTestData.length;
    const dateText = selectedDate ? ` (${selectedDate})` : ' (all dates)';
    status.innerHTML = `<b>Data source:</b> iperf3_consolidated.csv${dateText} - ${filteredCount} of ${totalCount} records`;
  }
  
  // Redraw if an AP is selected
  if (apSelect && apSelect.value) {
    drawSpeedTestsForAP(apSelect.value, bandSelect ? bandSelect.value : 'all');
  }
}

createDateSelector();

// --- Load Speed Test Data ---
function loadSpeedTestData(cb) {
  const ds = currentDataset; // Always use iperf3_consolidated.csv
  console.log(`Loading consolidated data from: data/${ds}`);
  
  fetch('data/' + ds)
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

          // Store all data for date filtering
          allSpeedTestData = rows.filter(row => row.lat != null && row.long != null && row.devicename);
          console.log(`Loaded ${allSpeedTestData.length} total speed test records`);
          
          // Initialize with all data (no date filter initially)
          speedTestData = [...allSpeedTestData];
          
          // Apply any current date filter
          filterAndDisplayData();
          
          if (cb) cb();
        }
      });
    })
    .catch(err => {
      console.error('Failed to load consolidated data:', err);
      allSpeedTestData = [];
      speedTestData = [];
      if (cb) cb();
    });
}

// --- Load Thermal Data ---
function loadThermalData(cb) {
  fetch('data/temps.csv')
    .then(response => response.text())
    .then(csvText => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: false,
        complete: results => {
          let rows = results.data || [];
          // Process thermal data to get latest readings per device
          thermalData = processThermalData(rows);
          thermalLastUpdate = new Date().toISOString();
          if (cb) cb();
        }
      });
    })
    .catch(err => {
      console.log('Failed to load thermal data:', err);
      thermalData = [];
      if (cb) cb();
    });
}

// --- Load Signal Strength Data ---
function loadSignalData(cb) {
  fetch('data/signal_data_consolidated.csv')
    .then(response => response.text())
    .then(csvText => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: false,
        complete: results => {
          let rows = results.data || [];
          
          // Process and clean the data
          allSignalData = rows.map(row => ({
            timestamp: row.timestamp,
            lat: parseFloat(row.lat),
            long: parseFloat(row.long),
            bssid: row.bssid,
            signal_dbm: parseFloat(row.signal_dbm),
            frequency: parseFloat(row.frequency),
            channel: parseFloat(row.channel),
            ssid: row.ssid,
            devicename: row.devicename
          })).filter(row => !isNaN(row.lat) && !isNaN(row.long) && !isNaN(row.signal_dbm) && row.devicename);
          
          // Initialize with all data
          signalData = [...allSignalData];
          
          console.log(`Loaded ${allSignalData.length} signal strength records`);
          if (cb) cb();
        }
      });
    })
    .catch(err => {
      console.error('Failed to load signal data:', err);
      allSignalData = [];
      signalData = [];
      if (cb) cb();
    });
}

// initial loads
loadSpeedTestData(() => {
  // Load pole locations first, then thermal and signal data
  loadPoleLocations(() => {
    loadThermalData(() => {
      loadSignalData();
    });
  });
});

// reload handler: preserves current filters and re-renders
if (reloadButton) {
  reloadButton.addEventListener('click', () => {
    const currentAP = apSelect.value;
    const currentBand = bandSelect ? bandSelect.value : 'all';
    loadSpeedTestData(() => {
      if (currentAP) drawSpeedTestsForAP(currentAP, currentBand);
    });
    loadPoleLocations(() => {
      loadThermalData(() => {
        if (thermalVisible) drawThermalOverlay();
        loadSignalData(() => {
          if (signalVisible) drawSignalOverlay();
        });
      });
    });
  });
}

// --- Draw Markers for Selected AP ---
function drawSpeedTestsForAP(devicename, band='all') {
  // Clear previous bucket layers from map so we can rebuild per-selection
  try {
    for (const id in bucketLayers) {
      try { map.removeLayer(bucketLayers[id]); } catch (e) {}
    }
  } catch (e) {}
  bucketLayers = {};
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
    // Use a geographic circle (meters) so the dot is ~4m diameter on the map regardless of zoom
    const marker = L.circle([row.lat, row.long], {
      radius: 2,
      fillColor: color,
      color: color,
      weight: 1,
      fillOpacity: 0.9,
      opacity: 1,
      interactive: true
    })
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
    // assign to bucket layer
    const bucketId = getBucketId(row);
    if (!bucketLayers[bucketId]) {
      bucketLayers[bucketId] = L.layerGroup();
      if (bucketVisible[bucketId] !== false) bucketLayers[bucketId].addTo(map);
    }
    bucketLayers[bucketId].addLayer(marker);
    // include in latlngs only if bucket is visible
    if (bucketVisible[bucketId] !== false) latlngs.push([row.lat, row.long]);
    activeMarkers.push(marker);
  });

  // Recenter map to show all speed test markers for selected AP
  if (latlngs.length > 0) {
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, {maxZoom: 20});
  } else {
    // No visible points — reset to initial view and zoom
    try {
      map.setView(MAP_CENTER, MAP_ZOOM);
    } catch (e) {
      console.log('Failed to reset map view:', e);
    }
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
  
  // Update signal overlay if visible
  if (signalVisible) {
    drawSignalOverlay();
  }
}

// --- Draw Thermal Overlay ---
function drawThermalOverlay() {
  // Clear existing thermal markers
  thermalMarkersLayer.clearLayers();
  
  if (!thermalData || thermalData.length === 0 || !poleLocations || poleLocations.length === 0) {
    return;
  }
  
  // Group devices by pole number to handle multiple devices per pole
  const devicesByPole = {};
  thermalData.forEach(device => {
    const poleNumber = extractPoleNumber(device.devicename);
    if (!poleNumber) return;
    
    if (!devicesByPole[poleNumber]) {
      devicesByPole[poleNumber] = [];
    }
    devicesByPole[poleNumber].push(device);
  });
  
  let markersAdded = 0;
  
  Object.keys(devicesByPole).forEach(poleNumber => {
    const poleId = parseInt(poleNumber, 10);
    const devices = devicesByPole[poleNumber];
    
    // Find corresponding pole location
    const poleLocation = poleLocations.find(p => p.pole_id === poleId);
    if (!poleLocation) return;
    
    // Calculate overall pole status (use the highest temperature)
    const maxTemp = Math.max(...devices.map(d => d.maxTemp));
    const overallColor = getThermalColor(maxTemp);
    const overallStatus = getThermalStatus(maxTemp);
    
    // For multiple devices, create slightly offset markers
    devices.forEach((device, index) => {
      const tempC = device.maxTemp;
      const color = getThermalColor(tempC);
      const status = device.status;
      
      // Calculate offset position for multiple devices (small circular arrangement)
      let lat = poleLocation.lat;
      let lng = poleLocation.long;
      
      if (devices.length > 1) {
        // Offset devices in a small circle around the pole location
        const offsetDistance = 0.00002; // ~2 meters
        const angle = (index * (2 * Math.PI)) / devices.length;
        lat += offsetDistance * Math.cos(angle);
        lng += offsetDistance * Math.sin(angle);
      }
      
      // Create thermal marker
      const marker = L.circle([lat, lng], {
        radius: devices.length > 1 ? 3 : 4, // Slightly smaller if multiple devices
        fillColor: color,
        color: color,
        weight: 2,
        fillOpacity: 0.8,
        opacity: 1,
        interactive: true
      });
      
      // Build thermal popup content
      let popupContent = `<b>Thermal Status: ${device.devicename}</b><br>`;
      popupContent += `<b>Pole ID:</b> ${poleId}<br>`;
      
      // Show info about other devices on the same pole
      if (devices.length > 1) {
        popupContent += `<b>Devices on Pole ${poleId}:</b><br>`;
        devices.forEach(d => {
          const dColor = getThermalColor(d.maxTemp);
          const dStatus = getThermalStatus(d.maxTemp);
          const isCurrentDevice = d.devicename === device.devicename;
          popupContent += `${isCurrentDevice ? '→ ' : '  '}${d.devicename}: <span style="color:${dColor};font-weight:bold;">${d.maxTemp.toFixed(1)}°C (${dStatus.toUpperCase()})</span><br>`;
        });
        popupContent += `<br><b>Overall Pole Status:</b> <span style="color:${overallColor};font-weight:bold;">${overallStatus.toUpperCase()}</span> (${maxTemp.toFixed(1)}°C)<br><br>`;
      }
      
      popupContent += `<b>Device Status:</b> <span style="color:${color};font-weight:bold;">${status.toUpperCase()}</span><br>`;
      popupContent += `<b>Max Temperature:</b> ${tempC ? tempC.toFixed(1) + '°C' : 'N/A'}<br>`;
      popupContent += `<b>Last Update:</b> ${formatTimestamp(device.lastUpdate)}<br>`;
      popupContent += `<b>Host:</b> ${device.host}<br>`;
      popupContent += `<b>GPS:</b> ${poleLocation.lat.toFixed(6)}, ${poleLocation.long.toFixed(6)}<br><br>`;
      
      // Add zone details for this specific device
      popupContent += `<b>Thermal Zones (${device.devicename}):</b><br>`;
      Object.values(device.zones || {}).forEach(zone => {
        const zoneColor = getThermalColor(zone.temp_C);
        popupContent += `• ${zone.zone}: <span style="color:${zoneColor};font-weight:bold;">${zone.temp_C ? zone.temp_C.toFixed(1) + '°C' : 'N/A'}</span> (${zone.type})<br>`;
      });
      
      marker.bindPopup(popupContent);
      thermalMarkersLayer.addLayer(marker);
      markersAdded++;
    });
  });
  
  console.log(`Thermal overlay: ${markersAdded} markers displayed across ${Object.keys(devicesByPole).length} poles`);
}

// Toggle thermal overlay visibility
function toggleThermalOverlay() {
  if (thermalVisible) {
    // Hide thermal overlay
    map.removeLayer(thermalMarkersLayer);
    thermalVisible = false;
  } else {
    // Show thermal overlay
    drawThermalOverlay();
    map.addLayer(thermalMarkersLayer);
    thermalVisible = true;
  }
  updateLegend(); // Refresh legend to show current state
}

// --- Draw Signal Strength Overlay ---
function drawSignalOverlay() {
  signalMarkersLayer.clearLayers();
  
  if (!signalData || signalData.length === 0) {
    console.log('No signal data available');
    return;
  }
  
  // Get current AP selection for filtering
  const selectedAP = apSelect ? apSelect.value : '';
  if (!selectedAP) {
    console.log('No AP selected for signal overlay');
    return;
  }
  
  // Apply same filters as speed tests
  let filteredSignals = signalData.filter(row => row.devicename === selectedAP);
  
  // Apply band filter
  const band = bandSelect ? bandSelect.value : 'all';
  if (band && band !== 'all') {
    filteredSignals = filteredSignals.filter(row => {
      const detectedBand = detectBand(row);
      return detectedBand === band;
    });
  }
  
  // Apply date filter if one is selected
  if (selectedDate) {
    filteredSignals = filteredSignals.filter(row => {
      if (!row.timestamp) return false;
      // Handle different timestamp formats
      let dateStr;
      if (row.timestamp.includes('_')) {
        // Format: 2025-10-31_14-06-57 -> 2025-10-31
        dateStr = row.timestamp.split('_')[0];
      } else {
        dateStr = new Date(row.timestamp).toISOString().split('T')[0];
      }
      return dateStr === selectedDate;
    });
  }
  
  let markersAdded = 0;
  
  filteredSignals.forEach(row => {
    const color = getSignalColor(row.signal_dbm);
    const status = getSignalStatus(row.signal_dbm);
    const band = detectBand(row);
    
    // Create signal strength marker
    const marker = L.circleMarker([row.lat, row.long], {
      radius: 4,
      fillColor: color,
      color: '#000',
      weight: 1,
      opacity: 0.8,
      fillOpacity: 0.7
    });
    
    // Create popup content
    const popupContent = `
      <b>Signal Strength</b><br>
      <b>Signal:</b> <span style="color:${color};font-weight:bold;">${row.signal_dbm} dBm (${status.toUpperCase()})</span><br>
      <b>SSID:</b> ${row.ssid}<br>
      <b>BSSID:</b> ${row.bssid}<br>
      <b>Band:</b> ${band ? (band === '2.4' ? '2.4 GHz' : '5 GHz') : 'Unknown'}<br>
      <b>Frequency:</b> ${row.frequency ? row.frequency + ' MHz' : 'N/A'}<br>
      <b>Channel:</b> ${row.channel || 'N/A'}<br>
      <b>Device:</b> ${row.devicename}<br>
      <b>Timestamp:</b> ${row.timestamp}<br>
      <b>Location:</b> ${row.lat.toFixed(6)}, ${row.long.toFixed(6)}
    `;
    
    marker.bindPopup(popupContent);
    signalMarkersLayer.addLayer(marker);
    markersAdded++;
  });
  
  console.log(`Signal overlay: ${markersAdded} signal markers displayed for ${selectedAP}`);
}

// Toggle signal overlay visibility
function toggleSignalOverlay() {
  signalVisible = !signalVisible;
  
  if (signalVisible) {
    drawSignalOverlay();
  } else {
    signalMarkersLayer.clearLayers();
  }
  
  updateLegend(); // Refresh legend to show current state
}

// --- Legend ---
function updateLegend() {
  // Build interactive legend with toggles per bucket
  const sw = (hex) => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${hex};border:1px solid #666;margin-right:8px;vertical-align:middle;margin-left:4px;margin-right:10px;"></span>`;
  
  let legendHTML = '<b>Map Layers</b><br>';
  
  // Thermal overlay toggle
  legendHTML += '<div style="margin:8px 0; padding:8px; background:#f5f5f5; border-radius:4px;">';
  legendHTML += '<b>Thermal Overlay</b><br>';
  legendHTML += `<button id="thermal-toggle" class="btn btn-small">${thermalVisible ? 'Hide' : 'Show'} Thermal Status</button><br>`;
  if (thermalLastUpdate) {
    legendHTML += `<small>Last update: ${formatTimestamp(thermalLastUpdate)}</small><br>`;
  }
  if (thermalVisible) {
    legendHTML += '<div style="margin-top:4px;">';
    legendHTML += '<small>Multiple devices per pole shown as offset circles</small><br>';
    thermalLegendBuckets.forEach(bucket => {
      legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw(bucket.color)} ${bucket.label}</div>`;
    });
    legendHTML += '</div>';
  }
  legendHTML += '</div>';
  
  // Signal Strength overlay toggle
  legendHTML += '<div style="margin:8px 0; padding:8px; background:#f5f5f5; border-radius:4px;">';
  legendHTML += '<b>Signal Strength</b><br>';
  legendHTML += `<button id="signal-toggle" class="btn btn-small">${signalVisible ? 'Hide' : 'Show'} Signal Overlay</button><br>`;
  if (signalVisible) {
    legendHTML += '<div style="margin-top:4px;">';
    legendHTML += '<small>Signal strength readings filtered by selected AP</small><br>';
    // Signal strength legend
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#4CAF50')} Excellent (> -30 dBm)</div>`;
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#8BC34A')} Good (-30 to -50 dBm)</div>`;
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#FFC107')} Fair (-50 to -60 dBm)</div>`;
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#FF9800')} Weak (-60 to -70 dBm)</div>`;
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#F44336')} Poor (-70 to -80 dBm)</div>`;
    legendHTML += `<div style="font-size:0.9em; margin:2px 0;">${sw('#B71C1C')} Very Poor (< -80 dBm)</div>`;
    legendHTML += '</div>';
  }
  legendHTML += '</div>';

  // Pole Coverage Circles toggle
  legendHTML += '<div style="margin:8px 0; padding:8px; background:#f5f5f5; border-radius:4px;">';
  legendHTML += '<b>Pole Coverage</b><br>';
  legendHTML += `<button id="pole-circles-toggle" class="btn btn-small">${poleCirclesVisible ? 'Hide' : 'Show'} 50ft Circles</button><br>`;
  if (poleCirclesVisible && poleLocations.length > 0) {
    legendHTML += `<small>Showing ${poleLocations.length} pole coverage areas</small><br>`;
  }
  legendHTML += '</div>';
  
  // Speed test legend
  legendHTML += '<div style="margin:8px 0;">';
  legendHTML += '<b>Speed Test Marker Colors</b><br><div style="line-height:1.6;margin-top:6px;" id="legend-buckets"></div>';
  legendHTML += '</div>';
  
  legendPanel.innerHTML = legendHTML;
  
  // Add thermal toggle handler
  const thermalToggle = document.getElementById('thermal-toggle');
  if (thermalToggle) {
    thermalToggle.addEventListener('click', toggleThermalOverlay);
  }
  
  // Add signal toggle handler
  const signalToggle = document.getElementById('signal-toggle');
  if (signalToggle) {
    signalToggle.addEventListener('click', toggleSignalOverlay);
  }
  
  // Add pole circles toggle handler
  const poleCirclesToggle = document.getElementById('pole-circles-toggle');
  if (poleCirclesToggle) {
    poleCirclesToggle.addEventListener('click', togglePoleCircles);
  }
  
  // Speed test buckets
  const container = document.getElementById('legend-buckets');
  if (!container) return;
  // initialize bucket visibility default
  legendBuckets.forEach(b => {
    if (bucketVisible[b.id] === undefined) bucketVisible[b.id] = true;
    const div = document.createElement('div');
    div.style.cursor = 'pointer';
    div.style.userSelect = 'none';
    div.style.marginBottom = '4px';
    div.id = 'legend-' + b.id;
    div.innerHTML = `${sw(b.color)} <span style="vertical-align:middle;">${b.label}</span>`;
    if (!bucketVisible[b.id]) div.style.opacity = '0.35';
    div.addEventListener('click', () => {
      // toggle
      bucketVisible[b.id] = !bucketVisible[b.id];
      if (bucketVisible[b.id]) {
        // show: add layer to map
        if (bucketLayers[b.id]) map.addLayer(bucketLayers[b.id]);
        div.style.opacity = '1';
      } else {
        // hide: remove layer
        if (bucketLayers[b.id]) map.removeLayer(bucketLayers[b.id]);
        div.style.opacity = '0.35';
      }
    });
    container.appendChild(div);
  });
}
updateLegend();

// Initialize collapsible panels after legend is created
setTimeout(initializeCollapsiblePanels, 50);

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

// --- GPS Event Listeners ---
if (gpsEnableBtn) gpsEnableBtn.addEventListener('click', enableGPS);
if (gpsDisableBtn) gpsDisableBtn.addEventListener('click', disableGPS);
if (gpsCenterBtn) {
  gpsCenterBtn.addEventListener('click', (e) => {
    console.log('Center button clicked', { disabled: gpsCenterBtn.disabled });
    if (!gpsCenterBtn.disabled) {
      centerOnGPSLocation();
    }
  });
}
if (gpsSourceSelect) gpsSourceSelect.addEventListener('change', changeGPSSource);
if (gpsTrackCheckbox) gpsTrackCheckbox.addEventListener('change', toggleGPSTracking);
if (gpsClearTrackBtn) {
  gpsClearTrackBtn.addEventListener('click', (e) => {
    console.log('Clear track button clicked', { disabled: gpsClearTrackBtn.disabled });
    if (!gpsClearTrackBtn.disabled) {
      clearGPSTrack();
    }
  });
}

// --- GPS Dialog Event Listeners ---
if (gpsDialogCancel) gpsDialogCancel.addEventListener('click', closeGPSDialog);
if (gpsDialogConnect) gpsDialogConnect.addEventListener('click', connectSerialGPS);
if (gpsManualCancel) gpsManualCancel.addEventListener('click', closeManualGPSDialog);
if (gpsManualSet) gpsManualSet.addEventListener('click', setManualGPS);

// --- GPS Smoothing Event Listeners ---
if (gpsSmoothingCheckbox) gpsSmoothingCheckbox.addEventListener('change', toggleGPSSmoothing);
if (gpsSmoothingConfigBtn) gpsSmoothingConfigBtn.addEventListener('click', showGPSSmoothingDialog);
if (gpsSmoothingCancel) gpsSmoothingCancel.addEventListener('click', closeGPSSmoothingDialog);
if (gpsSmoothingApply) gpsSmoothingApply.addEventListener('click', applyGPSSmoothingConfig);

// --- Collapsible Panel Event Listeners ---
function initializeCollapsiblePanels() {
  const headers = document.querySelectorAll('.panel-header');
  console.log(`Found ${headers.length} panel headers for collapsible functionality`);
  
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-target');
      const content = document.getElementById(targetId);
      const icon = header.querySelector('.collapse-icon');
      
      console.log(`Panel clicked: ${targetId}`, { content: !!content, icon: !!icon });
      
      if (content && icon) {
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
          // Expand
          content.classList.remove('collapsed');
          header.classList.remove('collapsed');
          icon.textContent = '▼';
          console.log(`Expanded panel: ${targetId}`);
        } else {
          // Collapse
          content.classList.add('collapsed');
          header.classList.add('collapsed');
          icon.textContent = '▶';
          console.log(`Collapsed panel: ${targetId}`);
        }
      }
    });
  });
}

// Initialize collapsible panels after DOM is ready and legend is updated
setTimeout(() => {
  initializeCollapsiblePanels();
  // Also call after legend is generated to ensure all elements exist
  setTimeout(initializeCollapsiblePanels, 500);
}, 100);

// Load pole circles after data is loaded
setTimeout(() => {
  if (poleLocations.length > 0) {
    console.log(`Pole locations loaded: ${poleLocations.length} poles available for circle drawing`);
  }
}, 1000);

// Close dialogs when clicking outside
if (gpsDialog) {
  gpsDialog.addEventListener('click', (e) => {
    if (e.target === gpsDialog) closeGPSDialog();
  });
}
if (gpsManualDialog) {
  gpsManualDialog.addEventListener('click', (e) => {
    if (e.target === gpsManualDialog) closeManualGPSDialog();
  });
}
if (gpsSmoothingDialog) {
  gpsSmoothingDialog.addEventListener('click', (e) => {
    if (e.target === gpsSmoothingDialog) closeGPSSmoothingDialog();
  });
}

// === GPS FUNCTIONS ===

function updateGPSStatus(message, isError = false) {
  if (gpsStatus) {
    gpsStatus.textContent = message;
    gpsStatus.style.color = isError ? '#f44' : '#666';
  }
}

function updateGPSCoords(lat, lng, accuracy = null) {
  if (gpsCoords) {
    let coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (accuracy !== null) {
      coordText += ` (±${accuracy.toFixed(0)}m)`;
    }
    gpsCoords.textContent = coordText;
  }
}

function createGPSMarker(lat, lng, accuracy = null) {
  // Remove existing GPS marker and accuracy circle
  if (gpsMarker) {
    map.removeLayer(gpsMarker);
    gpsMarker = null;
  }
  if (gpsAccuracyCircle) {
    map.removeLayer(gpsAccuracyCircle);
    gpsAccuracyCircle = null;
  }

  // Create new GPS marker
  gpsMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'gps-marker',
      html: '<div style="background:#2196F3; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 6px rgba(0,0,0,0.3);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    }),
    zIndexOffset: 1000
  }).addTo(map);

  // Add accuracy circle if available
  if (accuracy && accuracy > 0) {
    gpsAccuracyCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#2196F3',
      fillColor: '#2196F3',
      fillOpacity: 0.1,
      weight: 1,
      opacity: 0.5
    }).addTo(map);
  }

  const smoothingInfo = gpsSmoothing.enabled && gpsCurrentPosition?.readingCount ? 
    `<br>Smoothed (${gpsCurrentPosition.readingCount} readings)` : '';
  gpsMarker.bindPopup(`GPS Location<br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}${accuracy ? `<br>Accuracy: ±${accuracy.toFixed(0)}m` : ''}${smoothingInfo}`);
}

function enableGPS() {
  if (!navigator.geolocation) {
    updateGPSStatus('GPS not supported by browser', true);
    return;
  }

  if (gpsSource === 'browser') {
    enableBrowserGPS();
  } else if (gpsSource === 'serial') {
    enableSerialGPS();
  } else if (gpsSource === 'manual') {
    enableManualGPS();
  }
}

function enableBrowserGPS() {
  // Check if geolocation is supported
  if (!navigator.geolocation) {
    updateGPSStatus('Geolocation not supported by this browser', true);
    return;
  }

  // Check permissions first
  if (navigator.permissions) {
    navigator.permissions.query({name: 'geolocation'}).then(function(result) {
      if (result.state === 'denied') {
        updateGPSStatus('GPS permission denied. Enable location in browser settings.', true);
        return;
      }
      requestGPSPosition();
    }).catch(() => {
      // Fallback if permissions API not available
      requestGPSPosition();
    });
  } else {
    // Fallback for browsers without permissions API
    requestGPSPosition();
  }
}

function requestGPSPosition() {
  updateGPSStatus('Requesting GPS position...');
  
  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 10000
  };

  // Get initial position
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // Add reading to smoothing buffer and get smoothed position
      const smoothedPos = addGPSReading(latitude, longitude, accuracy);
      gpsCurrentPosition = smoothedPos;
      
      const statusMsg = gpsSmoothing.enabled ? 
        `GPS active (smoothed, ${smoothedPos.readingCount || 1} readings)` : 
        'GPS active';
      updateGPSStatus(statusMsg);
      updateGPSCoords(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
      createGPSMarker(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
      
      // Enable continuous tracking
      gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          
          // Add reading to smoothing buffer and get smoothed position
          const smoothedPos = addGPSReading(latitude, longitude, accuracy);
          gpsCurrentPosition = smoothedPos;
          
          updateGPSCoords(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
          createGPSMarker(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
          
          // Add to track if tracking is enabled (use smoothed position)
          if (gpsTrackingEnabled) {
            gpsTrackPoints.push([smoothedPos.lat, smoothedPos.lng]);
            updateGPSTrack();
          }
        },
        (error) => {
          let message = 'GPS tracking error: ';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message += 'Permission revoked';
              break;
            case error.POSITION_UNAVAILABLE:
              message += 'Signal lost';
              break;
            case error.TIMEOUT:
              message += 'Signal timeout';
              break;
            default:
              message += 'Connection lost';
              break;
          }
          updateGPSStatus(message, true);
        },
        options
      );
      
      gpsEnabled = true;
      updateGPSButtons();
    },
    (error) => {
      let message = 'GPS error: ';
      let suggestion = '';
      switch(error.code) {
        case error.PERMISSION_DENIED:
          message += 'Permission denied';
          suggestion = 'Enable location services in browser settings and refresh the page.';
          break;
        case error.POSITION_UNAVAILABLE:
          message += 'Position unavailable';
          suggestion = 'Check that GPS/location services are enabled on your device. Try moving to an area with better GPS reception.';
          break;
        case error.TIMEOUT:
          message += 'Location request timed out';
          suggestion = 'Try again. Make sure you have a clear view of the sky for GPS reception.';
          break;
        default:
          message += 'Unknown error';
          suggestion = 'Try refreshing the page or using manual GPS input.';
          break;
      }
      updateGPSStatus(`${message}. ${suggestion}`, true);
    },
    options
  );
}

async function enableSerialGPS() {
  try {
    // Check if GPS API is available
    if (!window.api?.gps) {
      updateGPSStatus('GPS API not available. App needs to be restarted.', true);
      return;
    }
    
    // List available serial ports
    updateGPSStatus('Scanning for GPS modules...');
    const result = await window.api.gps.listSerialPorts();
    
    if (!result.ok) {
      updateGPSStatus(`Serial GPS error: ${result.error}`, true);
      return;
    }
    
    if (result.ports.length === 0) {
      updateGPSStatus('No serial ports found. Connect GPS module.', true);
      return;
    }
    
    // Populate port selection dialog
    if (gpsPortSelect) {
      gpsPortSelect.innerHTML = '';
      result.ports.forEach((port, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}`;
        gpsPortSelect.appendChild(option);
      });
    }
    
    // Show dialog and store ports for later use
    window.gpsAvailablePorts = result.ports;
    showGPSDialog();
    
  } catch (err) {
    updateGPSStatus(`Serial GPS error: ${err.message}`, true);
  }
}

function showGPSDialog() {
  if (gpsDialog) {
    gpsDialog.style.display = 'flex';
  }
}

function closeGPSDialog() {
  if (gpsDialog) {
    gpsDialog.style.display = 'none';
  }
}

async function connectSerialGPS() {
  try {
    const portIndex = parseInt(gpsPortSelect.value);
    const baudRate = parseInt(gpsBaudSelect.value);
    const selectedPort = window.gpsAvailablePorts[portIndex];
    
    if (!selectedPort) {
      updateGPSStatus('Invalid port selection', true);
      return;
    }
    
    closeGPSDialog();
    updateGPSStatus(`Opening ${selectedPort.path} at ${baudRate} baud...`);
    
    const openResult = await window.api.gps.openSerialPort(selectedPort.path, baudRate);
    if (!openResult.ok) {
      updateGPSStatus(`Failed to open port: ${openResult.error}`, true);
      return;
    }
    
    // Set up GPS data listeners
    window.api.gps.onData((nmeaSentence) => {
      parseNMEASentence(nmeaSentence);
    });
    
    window.api.gps.onError((error) => {
      updateGPSStatus(`GPS error: ${error}`, true);
    });
    
    gpsEnabled = true;
    updateGPSStatus('Serial GPS connected, waiting for data...');
    updateGPSButtons();
    
  } catch (err) {
    updateGPSStatus(`Serial GPS error: ${err.message}`, true);
    closeGPSDialog();
  }
}

function parseNMEASentence(sentence) {
  try {
    const parts = sentence.split(',');
    const messageType = parts[0];
    
    // Parse GGA (Global Positioning System Fix Data)
    if (messageType === '$GPGGA' || messageType === '$GNGGA') {
      const time = parts[1];
      const lat = parseLatitude(parts[2], parts[3]);
      const lng = parseLongitude(parts[4], parts[5]);
      const quality = parseInt(parts[6]);
      const satellites = parseInt(parts[7]);
      const hdop = parseFloat(parts[8]);
      const altitude = parseFloat(parts[9]);
      
      if (lat !== null && lng !== null && quality > 0) {
        const accuracy = hdop ? hdop * 5 : null; // Rough accuracy estimate
        
        // Add reading to smoothing buffer and get smoothed position
        const smoothedPos = addGPSReading(lat, lng, accuracy);
        gpsCurrentPosition = smoothedPos;
        
        const statusMsg = gpsSmoothing.enabled ? 
          `GPS fix: ${satellites} sats, HDOP ${hdop} (smoothed, ${smoothedPos.readingCount || 1} readings)` :
          `GPS fix: ${satellites} sats, HDOP ${hdop}`;
        updateGPSStatus(statusMsg);
        updateGPSCoords(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
        createGPSMarker(smoothedPos.lat, smoothedPos.lng, smoothedPos.accuracy);
        
        if (gpsTrackingEnabled) {
          gpsTrackPoints.push([smoothedPos.lat, smoothedPos.lng]);
          updateGPSTrack();
        }
      }
    }
    
    // Parse RMC (Recommended Minimum Course)  
    else if (messageType === '$GPRMC' || messageType === '$GNRMC') {
      const status = parts[2];
      if (status === 'A') { // Active
        const lat = parseLatitude(parts[3], parts[4]);
        const lng = parseLongitude(parts[5], parts[6]);
        const speed = parseFloat(parts[7]) * 0.514444; // Convert knots to m/s
        const course = parseFloat(parts[8]);
        
        if (lat !== null && lng !== null) {
          // Add reading to smoothing buffer and get smoothed position
          const smoothedPos = addGPSReading(lat, lng, null); // RMC doesn't provide accuracy
          gpsCurrentPosition = { ...smoothedPos, speed, course };
          
          const statusMsg = gpsSmoothing.enabled ? 
            `GPS active (RMC, smoothed, ${smoothedPos.readingCount || 1} readings)` :
            'GPS active (RMC)';
          updateGPSStatus(statusMsg);
          updateGPSCoords(smoothedPos.lat, smoothedPos.lng);
          createGPSMarker(smoothedPos.lat, smoothedPos.lng);
        }
      }
    }
  } catch (err) {
    console.warn('NMEA parsing error:', err);
  }
}

function parseLatitude(latStr, hemisphere) {
  if (!latStr || !hemisphere) return null;
  const degrees = parseInt(latStr.substring(0, 2));
  const minutes = parseFloat(latStr.substring(2));
  let lat = degrees + minutes / 60;
  if (hemisphere === 'S') lat = -lat;
  return lat;
}

function parseLongitude(lngStr, hemisphere) {
  if (!lngStr || !hemisphere) return null;
  const degrees = parseInt(lngStr.substring(0, 3));
  const minutes = parseFloat(lngStr.substring(3));
  let lng = degrees + minutes / 60;
  if (hemisphere === 'W') lng = -lng;
  return lng;
}

function enableManualGPS() {
  // Show manual GPS dialog
  showManualGPSDialog();
}

function showManualGPSDialog() {
  if (gpsManualDialog) {
    gpsManualDialog.style.display = 'flex';
  }
}

function closeManualGPSDialog() {
  if (gpsManualDialog) {
    gpsManualDialog.style.display = 'none';
  }
}

function setManualGPS() {
  const lat = parseFloat(gpsManualLat.value);
  const lng = parseFloat(gpsManualLng.value);
  
  if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    gpsCurrentPosition = { lat, lng, accuracy: null };
    updateGPSStatus('Manual GPS coordinates set');
    updateGPSCoords(lat, lng);
    createGPSMarker(lat, lng);
    gpsEnabled = true;
    updateGPSButtons();
    closeManualGPSDialog();
  } else {
    updateGPSStatus('Invalid coordinates entered. Check latitude (-90 to 90) and longitude (-180 to 180).', true);
  }
}

async function disableGPS() {
  // Stop browser GPS tracking
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  
  // Close serial GPS if active
  if (gpsSource === 'serial' && window.api?.gps) {
    try {
      await window.api.gps.closeSerialPort();
      window.api.gps.removeListeners();
    } catch (err) {
      console.warn('Error closing GPS serial port:', err);
    }
  }
  
  // Remove GPS markers and overlays
  if (gpsMarker) {
    map.removeLayer(gpsMarker);
    gpsMarker = null;
  }
  
  if (gpsAccuracyCircle) {
    map.removeLayer(gpsAccuracyCircle);
    gpsAccuracyCircle = null;
  }
  
  if (gpsTrackLayer) {
    gpsTrackLayer.clearLayers();
  }
  
  gpsEnabled = false;
  gpsCurrentPosition = null;
  gpsTrackPoints = [];
  resetGPSSmoothing(); // Clear smoothing buffer
  updateGPSStatus('GPS disabled');
  if (gpsCoords) gpsCoords.textContent = '';
  updateGPSButtons();
}

function centerOnGPSLocation() {
  console.log('centerOnGPSLocation called', { gpsEnabled, gpsCurrentPosition });
  
  if (gpsCurrentPosition) {
    map.setView([gpsCurrentPosition.lat, gpsCurrentPosition.lng], MAP_ZOOM);
    if (gpsMarker) {
      gpsMarker.openPopup();
    }
    updateGPSStatus('Map centered on GPS location');
  } else {
    updateGPSStatus('No GPS location available', true);
  }
}

function changeGPSSource() {
  const newSource = gpsSourceSelect.value;
  
  // Disable current GPS if active
  if (gpsEnabled) {
    disableGPS();
  }
  
  gpsSource = newSource;
  updateGPSStatus(`GPS source changed to ${newSource}`);
}

function updateGPSButtons() {
  console.log('updateGPSButtons called', { 
    gpsEnabled, 
    hasCurrentPosition: !!gpsCurrentPosition, 
    trackPointsCount: gpsTrackPoints.length,
    centerBtnExists: !!gpsCenterBtn,
    clearBtnExists: !!gpsClearTrackBtn
  });
  
  if (gpsEnableBtn) gpsEnableBtn.disabled = gpsEnabled;
  if (gpsDisableBtn) gpsDisableBtn.disabled = !gpsEnabled;
  if (gpsCenterBtn) {
    const shouldDisable = !gpsEnabled || !gpsCurrentPosition;
    gpsCenterBtn.disabled = shouldDisable;
    console.log('Center button disabled:', shouldDisable);
  }
  if (gpsTrackCheckbox) gpsTrackCheckbox.disabled = !gpsEnabled;
  if (gpsClearTrackBtn) {
    const shouldDisable = gpsTrackPoints.length === 0;
    gpsClearTrackBtn.disabled = shouldDisable;
    console.log('Clear track button disabled:', shouldDisable, 'trackPoints:', gpsTrackPoints.length);
  }
}

function toggleGPSTracking() {
  gpsTrackingEnabled = gpsTrackCheckbox.checked;
  updateGPSStatus(`GPS tracking ${gpsTrackingEnabled ? 'enabled' : 'disabled'}`);
  
  if (!gpsTrackingEnabled && gpsTrackLayer) {
    gpsTrackLayer.clearLayers();
  }
}

function clearGPSTrack() {
  console.log('clearGPSTrack called', { trackPointsCount: gpsTrackPoints.length });
  
  gpsTrackPoints = [];
  if (gpsTrackLayer) {
    gpsTrackLayer.clearLayers();
  }
  if (gpsTrackCheckbox) {
    gpsTrackCheckbox.checked = false;
    gpsTrackingEnabled = false;
  }
  updateGPSStatus('GPS track cleared');
  updateGPSButtons();
}

function updateGPSTrack() {
  // Remove existing track
  if (gpsTrackLayer) {
    gpsTrackLayer.clearLayers();
  }
  
  // Add new track line if we have multiple points
  if (gpsTrackPoints.length > 1) {
    const trackLine = L.polyline(gpsTrackPoints, {
      color: '#2196F3',
      weight: 3,
      opacity: 0.7
    });
    gpsTrackLayer.addLayer(trackLine);
    
    if (!map.hasLayer(gpsTrackLayer)) {
      gpsTrackLayer.addTo(map);
    }
  }
}

// === GPS SMOOTHING FUNCTIONS ===

function addGPSReading(lat, lng, accuracy, timestamp = null) {
  if (!timestamp) timestamp = Date.now();
  
  const reading = {
    lat: lat,
    lng: lng, 
    accuracy: accuracy || 999,
    timestamp: timestamp
  };
  
  // Add to circular buffer
  gpsSmoothing.readings.push(reading);
  
  // Keep only the most recent readings
  if (gpsSmoothing.readings.length > gpsSmoothing.windowSize * 2) {
    gpsSmoothing.readings = gpsSmoothing.readings.slice(-gpsSmoothing.windowSize);
  }
  
  // Return smoothed position if smoothing is enabled
  if (gpsSmoothing.enabled) {
    return getSmoothedGPSPosition();
  } else {
    return { lat, lng, accuracy };
  }
}

function getSmoothedGPSPosition() {
  if (gpsSmoothing.readings.length === 0) return null;
  
  const now = Date.now();
  const maxAge = gpsSmoothing.maxAge;
  const minAccuracy = gpsSmoothing.minAccuracy;
  
  // Filter readings by age and accuracy
  const validReadings = gpsSmoothing.readings.filter(reading => {
    return (now - reading.timestamp) <= maxAge && 
           reading.accuracy <= minAccuracy;
  });
  
  if (validReadings.length === 0) {
    // No valid readings, return most recent raw reading
    return gpsSmoothing.readings[gpsSmoothing.readings.length - 1];
  }
  
  // Take most recent readings up to window size
  const recentReadings = validReadings.slice(-gpsSmoothing.windowSize);
  
  if (recentReadings.length === 1) {
    return recentReadings[0];
  }
  
  // Calculate weighted average (weight by accuracy - better accuracy = higher weight)
  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLng = 0;
  let bestAccuracy = Infinity;
  
  recentReadings.forEach(reading => {
    const weight = 1 / (reading.accuracy + 1); // Add 1 to avoid division by zero
    totalWeight += weight;
    weightedLat += reading.lat * weight;
    weightedLng += reading.lng * weight;
    bestAccuracy = Math.min(bestAccuracy, reading.accuracy);
  });
  
  let smoothedLat = weightedLat / totalWeight;
  let smoothedLng = weightedLng / totalWeight;
  
  // Apply simple Kalman-like filtering with previous position
  if (gpsSmoothing.lastSmoothedPosition) {
    const gain = gpsSmoothing.kalmanGain;
    smoothedLat = gpsSmoothing.lastSmoothedPosition.lat * (1 - gain) + smoothedLat * gain;
    smoothedLng = gpsSmoothing.lastSmoothedPosition.lng * (1 - gain) + smoothedLng * gain;
  }
  
  const smoothedPosition = {
    lat: smoothedLat,
    lng: smoothedLng,
    accuracy: bestAccuracy,
    readingCount: recentReadings.length
  };
  
  gpsSmoothing.lastSmoothedPosition = smoothedPosition;
  return smoothedPosition;
}

function resetGPSSmoothing() {
  gpsSmoothing.readings = [];
  gpsSmoothing.lastSmoothedPosition = null;
}

function toggleGPSSmoothing() {
  gpsSmoothing.enabled = gpsSmoothingCheckbox.checked;
  if (!gpsSmoothing.enabled) {
    resetGPSSmoothing();
  }
  updateGPSStatus(`GPS smoothing ${gpsSmoothing.enabled ? 'enabled' : 'disabled'}`);
}

function showGPSSmoothingDialog() {
  // Populate dialog with current values
  if (gpsSmoothingWindow) gpsSmoothingWindow.value = gpsSmoothing.windowSize;
  if (gpsSmoothingAccuracy) gpsSmoothingAccuracy.value = gpsSmoothing.minAccuracy;
  if (gpsSmoothingAge) gpsSmoothingAge.value = gpsSmoothing.maxAge / 1000;
  if (gpsSmoothingGain) gpsSmoothingGain.value = gpsSmoothing.kalmanGain;
  
  if (gpsSmoothingDialog) {
    gpsSmoothingDialog.style.display = 'flex';
  }
}

function closeGPSSmoothingDialog() {
  if (gpsSmoothingDialog) {
    gpsSmoothingDialog.style.display = 'none';
  }
}

function applyGPSSmoothingConfig() {
  // Update smoothing parameters
  gpsSmoothing.windowSize = Math.max(1, Math.min(20, parseInt(gpsSmoothingWindow.value) || 5));
  gpsSmoothing.minAccuracy = Math.max(1, Math.min(500, parseInt(gpsSmoothingAccuracy.value) || 50));
  gpsSmoothing.maxAge = Math.max(5000, Math.min(300000, (parseFloat(gpsSmoothingAge.value) || 30) * 1000));
  gpsSmoothing.kalmanGain = Math.max(0.1, Math.min(0.9, parseFloat(gpsSmoothingGain.value) || 0.3));
  
  // Reset smoothing buffer with new parameters
  resetGPSSmoothing();
  
  closeGPSSmoothingDialog();
  updateGPSStatus(`GPS smoothing updated: ${gpsSmoothing.windowSize} readings, ${gpsSmoothing.minAccuracy}m accuracy`);
}

// Initialize GPS buttons
updateGPSButtons();
