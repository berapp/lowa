// Test the FIXED thermal data processing - should show current temps only
const fs = require('fs');

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = values[i] ? values[i].trim() : '';
    });
    return obj;
  });
}

function getThermalStatus(tempC) {
  if (tempC == null || isNaN(tempC)) return 'offline';
  if (tempC >= 75) return 'critical';  // red
  if (tempC >= 70) return 'hot';       // yellow
  if (tempC >= 65) return 'warm';      // green
  return 'normal';                     // blue
}

function processThermalData(rawData) {
  // Group thermal readings by device and find only the most recent readings per device
  const deviceMap = {};
  
  // Only consider data from the last 4 hours for current thermal status
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000); // 4 hours ago
  
  console.log(`Processing thermal data with 4-hour cutoff: ${recentCutoff.toISOString()}`);
  
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
  
  // Convert to array - only devices with data in the last 2 hours
  const results = Object.values(deviceMap)
    .map(device => {
      device.status = getThermalStatus(device.currentMaxTemp);
      // For backwards compatibility, set maxTemp to current value
      device.maxTemp = device.currentMaxTemp;
      return device;
    });
    
  console.log(`Thermal data processed - ${results.length} devices with recent data (last 2 hours)`);
  
  return results;
}

// Load and test FIXED thermal data processing
const thermalCsv = fs.readFileSync('data/temps.csv', 'utf8');
const rawData = parseCSV(thermalCsv);

console.log('=== FIXED THERMAL DATA ANALYSIS (CURRENT TEMPS ONLY) ===');

// Process thermal data with the new logic
const processedData = processThermalData(rawData);
const pole22Processed = processedData.filter(d => d.devicename.includes('pole 22'));

console.log('\n=== FIXED POLE 22 THERMAL DATA (RECENT ONLY) ===');
pole22Processed.forEach(device => {
  console.log(`\n${device.devicename}:`);
  console.log(`  Host: ${device.host}`);
  console.log(`  CURRENT Max Temp: ${device.currentMaxTemp}°C`);
  console.log(`  Status: ${device.status.toUpperCase()}`);
  console.log(`  Last Update: ${device.lastUpdate}`);
  console.log(`  Recent Thermal Zones:`);
  Object.values(device.zones).forEach(zone => {
    console.log(`    ${zone.zone}: ${zone.temp_C}°C (${zone.timestamp})`);
  });
});

console.log('\n=== COMPARISON ===');
console.log('OLD: Used historical max (80-85°C) → Critical status');
console.log('NEW: Uses CURRENT max from last 2 hours → Should be Normal/Warm status');

// Show what the display should show now
pole22Processed.forEach(device => {
  const color = device.status === 'critical' ? 'RED' : 
                device.status === 'hot' ? 'YELLOW' : 
                device.status === 'warm' ? 'GREEN' : 'BLUE';
  console.log(`Expected Display: ${device.devicename} - ${device.currentMaxTemp}°C - ${device.status.toUpperCase()} (${color})`);
});