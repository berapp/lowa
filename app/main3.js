// Basic heatmap page script
const MAP_CENTER = [26.674, -81.806];
const MAP_ZOOM = 16;

const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22 }).addTo(map);

let heatLayer = null;
let currentPoints = [];
let rawRows = [];
let totalRows = 0;
let markerLayer = L.layerGroup().addTo(map);

const radiusInput = document.getElementById('radius');
const blurInput = document.getElementById('blur');
const maxIntensityInput = document.getElementById('maxIntensity');
const reloadBtn = document.getElementById('reload');
const heatInfo = document.getElementById('heat-info');
const timeWindowInput = document.getElementById('timeWindow');
const smoothingInput = document.getElementById('smoothing');
const bssidFilterInput = document.getElementById('bssidFilter');

function buildHeatPoints(rows) {
  // rows: array of parsed CSV rows with lat,long fields and optionally signal_dbm or iperf_throughput_mbps
  const pts = [];
  rows.forEach(r => {
    const lat = Number(r.lat);
    const lon = Number(r.long || r.lng || r.lon || r.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    // prefer signal_dbm (negative dBm); convert to a positive intensity
    let intensity = 1;
    if (r.signal_dbm != null && r.signal_dbm !== '') {
      // map -100..-30 dBm -> 0..1
      const s = Number(r.signal_dbm);
      const clipped = Math.max(-100, Math.min(-30, s));
      intensity = (clipped + 100) / 70; // 0..1
    } else if (r.iperf_throughput_mbps != null && r.iperf_throughput_mbps !== '') {
      // map 0..200 Mbps -> 0..1
      const t = Number(r.iperf_throughput_mbps);
      const clipped = Math.max(0, Math.min(200, t));
      intensity = clipped / 200;
    }
    // scale by maxIntensity control
    const scaled = intensity * Number(maxIntensityInput.value || 1);
    pts.push([lat, lon, scaled]);
  });
  return pts;
}
// Filter rows by time window and BSSID, return rows with lat/long
function filterRows(rows) {
  const minutes = Number(timeWindowInput.value || 0);
  const now = Date.now();
  const bssidFilter = (bssidFilterInput && bssidFilterInput.value) ? bssidFilterInput.value.toLowerCase() : '';

  let filtered = rows.filter(r => {
    // time filter
    if (minutes > 0 && r.timestamp) {
      const t = new Date(String(r.timestamp)).getTime();
      if (isNaN(t) || (now - t) > minutes * 60 * 1000) return false;
    }
    // bssid filter
    if (bssidFilter) {
      const b = (r.bssid || '').toString().toLowerCase();
      if (!b.includes(bssidFilter)) return false;
    }
    return true;
  });

  // store rawRows and total count (rows passed in should already be backfilled)
  rawRows = rows;
  totalRows = rows.length;

  return filtered.filter(r => r.lat && r.long);
}

function getColorForSignal(s) {
  if (s === null || s === undefined || s === '') return '#888888';
  const v = Number(s);
  if (isNaN(v)) return '#888888';
  // New buckets:
  // Green: -30 to -39
  if (v <= -30 && v >= -39) return '#00ff00';
  // Yellow: -40 to -49
  if (v <= -40 && v >= -49) return '#ffff00';
  // Blue: -50 to -59
  if (v <= -50 && v >= -59) return '#0000ff';
  // Magenta: -60 to -69
  if (v <= -60 && v >= -69) return '#ff00ff';
  // Red: -70 to -79
  if (v <= -70 && v >= -79) return '#ff0000';
  // weaker or out-of-range
  return '#CCCCCC';
}

function getRadiusForSignal(s) {
  const v = Number(s);
  if (isNaN(v)) return 4;
  // map by new buckets: stronger signals larger
  if (v >= -39 && v <= -30) return 7; // red
  if (v >= -49 && v <= -40) return 6; // purple
  if (v >= -59 && v <= -50) return 5; // blue
  if (v >= -69 && v <= -60) return 4; // green
  if (v >= -79 && v <= -70) return 3; // yellow
  return 3;
}

function renderMarkers(rows) {
  markerLayer.clearLayers();
  const pts = rows || [];
  pts.forEach(r => {
    const lat = Number(r.lat);
    const lon = Number(r.long);
    if (isNaN(lat) || isNaN(lon)) return;
    const sig = r.signal_dbm;
    const color = getColorForSignal(sig);
    const radius = getRadiusForSignal(sig);
  // create a filled circle marker with no stroke (outline)
  const marker = L.circleMarker([lat, lon], { radius, fillColor: color, fillOpacity: 0.9, stroke: false });
    const when = r.timestamp || '';
    marker.bindPopup(`<b>Timestamp:</b> ${when}<br><b>BSSID:</b> ${r.bssid || ''}<br><b>Signal:</b> ${sig || 'N/A'} dBm<br><b>Device:</b> ${r.devicename || ''}`);
    marker.addTo(markerLayer);
  });
  heatInfo.textContent = `Points: ${pts.length} / ${totalRows}`;
}

function updateHeatLayer(points) {
  if (heatLayer) {
    heatLayer.setLatLngs(points);
  } else {
    heatLayer = L.heatLayer(points, { radius: Number(radiusInput.value), blur: Number(blurInput.value), maxZoom: 18 }).addTo(map);
  }
  heatLayer.setOptions({ radius: Number(radiusInput.value), blur: Number(blurInput.value) });
  heatInfo.textContent = `Points: ${points.length} / ${totalRows}`;
}

function loadHeatData(cb) {
  // Use the signal dataset for heatmap
  fetch('signal_data.csv')
    .then(r => r.text())
    .then(txt => {
      Papa.parse(txt, { header: true, dynamicTyping: true, complete: res => {
            // parse all rows
            const allRows = res.data || [];
            // build map of last-known locations per devicename (use most recent timestamp)
            const lastLoc = {};
            allRows.forEach(r => {
              if (r.devicename && r.lat && r.long) {
                const t = r.timestamp ? new Date(String(r.timestamp)).getTime() : 0;
                if (!lastLoc[r.devicename] || (lastLoc[r.devicename].t || 0) < t) {
                  lastLoc[r.devicename] = { lat: Number(r.lat), long: Number(r.long), t };
                }
              }
            });

                      // build a unique list of BSSIDs with sample band/devicename for the dropdown
                      const bssidMap = {};
                      allRows.forEach(r => {
                        const b = (r.bssid || '').toString().toLowerCase();
                        if (!b) return;
                        if (!bssidMap[b]) {
                          bssidMap[b] = { bssid: b, band: r.frequency || r.band || '', devicename: r.devicename || '' };
                        }
                      });
                      // populate the BSSID select with options (keep existing selection if any)
                      if (bssidFilterInput && bssidFilterInput.tagName === 'SELECT') {
                        const sel = bssidFilterInput;
                        const current = sel.value || '';
                        // remove existing options except the first (All BSSIDs)
                        while (sel.options.length > 1) sel.remove(1);
                        const keys = Object.keys(bssidMap).sort();
                        keys.forEach(k => {
                          const info = bssidMap[k];
                          const text = `${info.bssid} ${info.band ? '(' + info.band + ')' : ''} ${info.devicename ? '- ' + info.devicename : ''}`;
                          const opt = document.createElement('option');
                          opt.value = info.bssid;
                          opt.text = text;
                          sel.appendChild(opt);
                        });
                        if (current) sel.value = current;
                      }

            // backfill missing lat/long when possible using devicename's last known location
            const rows = allRows.map(r => {
              if ((!r.lat || !r.long) && r.devicename && lastLoc[r.devicename]) {
                // create a shallow copy to avoid mutating original parse result
                const c = Object.assign({}, r);
                c.lat = lastLoc[r.devicename].lat;
                c.long = lastLoc[r.devicename].long;
                return c;
              }
              return r;
            });

                  // set totalRows to total CSV rows (before filtering)
                  totalRows = allRows.length;

                  // filter rows by time/BSSID and render markers (rows already backfilled where possible)
                  const filtered = filterRows(rows);
                  currentPoints = filtered;
                  renderMarkers(currentPoints);
                  if (cb) cb();
      }});
    });
}

// Wire controls
radiusInput.addEventListener('input', () => { /* size unaffected for now */ });
blurInput.addEventListener('input', () => { /* unused for marker view */ });
maxIntensityInput.addEventListener('input', () => { /* unused for marker view */ });
timeWindowInput.addEventListener('change', () => { currentPoints = filterRows(rawRows); renderMarkers(currentPoints); });
smoothingInput.addEventListener('change', () => { /* smoothing not used for marker plotting */ currentPoints = filterRows(rawRows); renderMarkers(currentPoints); });
if (bssidFilterInput) {
  // if it's a select use 'change', otherwise fallback to 'input'
  const ev = (bssidFilterInput.tagName === 'SELECT') ? 'change' : 'input';
  bssidFilterInput.addEventListener(ev, () => { currentPoints = filterRows(rawRows); renderMarkers(currentPoints); });
}
reloadBtn.addEventListener('click', () => { loadHeatData(() => {/* rendered in loader */}); });

// initial load (rendering happens inside loadHeatData)
loadHeatData(() => {});
