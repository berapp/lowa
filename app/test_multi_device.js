// Test multi-device thermal overlay functionality
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

function extractPoleNumber(devicename) {
  if (!devicename) return null;
  const match = devicename.match(/pole\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function processThermalData(rawData) {
  const deviceMap = {};
  
  for (let i = rawData.length - 1; i >= 0; i--) {
    const row = rawData[i];
    if (!row.devicename || !row.temp_C) continue;
    if (row.error && row.error.trim()) continue;
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
    
    if (!deviceMap[device].zones[zone] || timestamp > new Date(deviceMap[device].zones[zone].timestamp)) {
      deviceMap[device].zones[zone] = {
        zone: zone,
        type: row.type,
        temp_C: tempC,
        temp_F: parseFloat(row.temp_F) || (tempC * 9/5 + 32),
        timestamp: row.timestamp
      };
    }
    
    if (tempC > deviceMap[device].maxTemp) {
      deviceMap[device].maxTemp = tempC;
    }
    if (!deviceMap[device].lastUpdate || timestamp > new Date(deviceMap[device].lastUpdate)) {
      deviceMap[device].lastUpdate = row.timestamp;
    }
  }
  
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

// Test the multi-device functionality
const thermalCsv = fs.readFileSync('data/temps.csv', 'utf8');
const rawData = parseCSV(thermalCsv);
const processedData = processThermalData(rawData);

console.log('=== MULTI-DEVICE THERMAL ANALYSIS ===');

// Group by pole number to find poles with multiple devices
const devicesByPole = {};
processedData.forEach(device => {
  const poleNumber = extractPoleNumber(device.devicename);
  if (!poleNumber) return;
  
  if (!devicesByPole[poleNumber]) {
    devicesByPole[poleNumber] = [];
  }
  devicesByPole[poleNumber].push(device);
});

console.log(`Total poles with thermal data: ${Object.keys(devicesByPole).length}`);

// Find poles with multiple devices
const multiDevicePoles = Object.entries(devicesByPole)
  .filter(([pole, devices]) => devices.length > 1)
  .sort(([a], [b]) => parseInt(a) - parseInt(b));

console.log(`\nPoles with multiple devices: ${multiDevicePoles.length}`);

multiDevicePoles.forEach(([poleNumber, devices]) => {
  const maxTemp = Math.max(...devices.map(d => d.maxTemp));
  const minTemp = Math.min(...devices.map(d => d.maxTemp));
  const tempRange = maxTemp - minTemp;
  
  console.log(`\nPole ${poleNumber} (${devices.length} devices):`);
  console.log(`  Temperature range: ${minTemp.toFixed(1)}°C - ${maxTemp.toFixed(1)}°C (Δ${tempRange.toFixed(1)}°C)`);
  
  devices.forEach(device => {
    const status = device.maxTemp >= 75 ? 'CRITICAL' : 
                   device.maxTemp >= 70 ? 'HOT' : 
                   device.maxTemp >= 65 ? 'WARM' : 'NORMAL';
    console.log(`    ${device.devicename}: ${device.maxTemp.toFixed(1)}°C (${status}) - ${device.host}`);
  });
});

// Show single device poles for comparison
const singleDevicePoles = Object.entries(devicesByPole)
  .filter(([pole, devices]) => devices.length === 1)
  .slice(0, 5);

console.log(`\nSample single-device poles:`);
singleDevicePoles.forEach(([poleNumber, devices]) => {
  const device = devices[0];
  const status = device.maxTemp >= 75 ? 'CRITICAL' : 
                 device.maxTemp >= 70 ? 'HOT' : 
                 device.maxTemp >= 65 ? 'WARM' : 'NORMAL';
  console.log(`  Pole ${poleNumber}: ${device.devicename} - ${device.maxTemp.toFixed(1)}°C (${status})`);
});