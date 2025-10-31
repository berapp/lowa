// Test current thermal data processing for pole 22 NW
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

function processThermalData(rawData) {
  const deviceMap = {};
  
  // Process rows in reverse order (newest first)
  for (let i = rawData.length - 1; i >= 0; i--) {
    const row = rawData[i];
    if (!row.devicename || !row.temp_C) continue;
    if (row.error && row.error.trim()) continue;
    
    // Skip rows with SSH error messages or invalid data
    if (row.temp_C.includes('@') || row.temp_C.includes('WARNING') || 
        row.temp_C.includes('ssh') || row.temp_C === '') continue;
    
    const timestamp = new Date(row.timestamp);
    if (isNaN(timestamp.getTime())) continue;
    
    const device = row.devicename;
    const zone = row.zone || 'unknown';
    const tempC = parseFloat(row.temp_C);
    
    if (isNaN(tempC)) continue;
    if (tempC < 10 || tempC > 100) continue;
    
    if (!deviceMap[device]) {
      deviceMap[device] = {
        devicename: device,
        host: row.host,
        zones: {},
        maxTemp: -999,
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
    
    // Update device max temp and last update
    if (tempC > deviceMap[device].maxTemp) {
      deviceMap[device].maxTemp = tempC;
    }
    if (!deviceMap[device].lastUpdate || timestamp > new Date(deviceMap[device].lastUpdate)) {
      deviceMap[device].lastUpdate = row.timestamp;
    }
  }
  
  // Filter to keep only devices with recent data (within last 7 days)
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  return Object.values(deviceMap)
    .filter(device => new Date(device.lastUpdate) >= recentCutoff)
    .map(device => {
      device.status = device.maxTemp >= 75 ? 'critical' : 
                     device.maxTemp >= 70 ? 'hot' : 
                     device.maxTemp >= 65 ? 'warm' : 'normal';
      return device;
    });
}

// Load and test current thermal data
const thermalCsv = fs.readFileSync('data/temps.csv', 'utf8');
const rawData = parseCSV(thermalCsv);

console.log('=== CURRENT THERMAL DATA ANALYSIS ===');
console.log(`Total thermal rows: ${rawData.length}`);

// Find all pole 22 data
const pole22Data = rawData.filter(row => 
  row.devicename && row.devicename.includes('pole 22')
);

console.log(`\nPole 22 total records: ${pole22Data.length}`);

// Get latest timestamps for each pole 22 device
const pole22Devices = {};
pole22Data.forEach(row => {
  const device = row.devicename;
  if (!pole22Devices[device] || new Date(row.timestamp) > new Date(pole22Devices[device].timestamp)) {
    pole22Devices[device] = row;
  }
});

console.log('\nLatest raw data for pole 22 devices:');
Object.values(pole22Devices).forEach(row => {
  console.log(`${row.devicename}: ${row.timestamp} - ${row.temp_C}°C (${row.zone})`);
});

// Process thermal data
const processedData = processThermalData(rawData);
const pole22Processed = processedData.filter(d => d.devicename.includes('pole 22'));

console.log('\n=== PROCESSED POLE 22 THERMAL DATA ===');
pole22Processed.forEach(device => {
  console.log(`\n${device.devicename}:`);
  console.log(`  Host: ${device.host}`);
  console.log(`  Max Temp: ${device.maxTemp}°C`);
  console.log(`  Status: ${device.status.toUpperCase()}`);
  console.log(`  Last Update: ${device.lastUpdate}`);
  console.log(`  Thermal Zones:`);
  Object.values(device.zones).forEach(zone => {
    console.log(`    ${zone.zone}: ${zone.temp_C}°C (${zone.timestamp})`);
  });
});

console.log('\n=== EXPECTED VS ACTUAL ===');
console.log('Expected (from CSV): pole 22 NW should be 60-65°C range (Normal/Warm)');
console.log('Interface shows: Old cached data with higher temperatures');
console.log('Issue: App may be using stale data or incorrect processing logic');