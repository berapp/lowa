const MAP_CENTER = [26.674, -81.806];
const MAP_ZOOM = 16;
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);

L.tileLayer(SATELLITE_URL, {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 19
}).addTo(map);

fetch('./pole_locations.csv')
  .then(response => response.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      complete: results => {
        results.data.forEach(row => {
          if (!row.lat || !row.long) return;
          L.marker([row.lat, row.long])
            .addTo(map)
            .bindPopup(
              `<b>Pole ID:</b> ${row.pole_id}<br>
               <b>Timestamp:</b> ${row.timestamp}`
            );
        });
        // Center map to all markers
        const latlngs = results.data
          .filter(r => r.lat && r.long)
          .map(r => [r.lat, r.long]);
        if (latlngs.length) map.fitBounds(latlngs);
      }
    });
  })
  .catch(err => alert('Failed to load pole_locations.csv'));