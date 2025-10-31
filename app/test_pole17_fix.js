// Test the improved thermal processing for pole 17
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

// Load and test thermal data
const thermalCsv = fs.readFileSync('data/temps.csv', 'utf8');
const rawData = parseCSV(thermalCsv);

console.log('=== IMPROVED THERMAL PROCESSING TEST ===');
console.log(`Total raw thermal rows: ${rawData.length}`);

const processedData = processThermalData(rawData);
console.log(`Processed devices: ${processedData.length}`);

const pole17 = processedData.find(d => d.devicename === 'pole 17');
if (pole17) {
  console.log('\n✅ POLE 17 FOUND!');
  console.log(`- Device: ${pole17.devicename}`);
  console.log(`- Host: ${pole17.host}`);
  console.log(`- Max Temp: ${pole17.maxTemp}°C`);
  console.log(`- Status: ${pole17.status}`);
  console.log(`- Last Update: ${pole17.lastUpdate}`);
  console.log(`- Thermal Zones: ${Object.keys(pole17.zones).length}`);
  
  Object.values(pole17.zones).forEach(zone => {
    console.log(`  • ${zone.zone}: ${zone.temp_C}°C (${zone.timestamp})`);
  });
} else {
  console.log('\n❌ POLE 17 NOT FOUND');
}

console.log('\nAll pole devices found:');
processedData
  .filter(d => d.devicename.startsWith('pole'))
  .sort((a, b) => a.devicename.localeCompare(b.devicename))
  .forEach(d => console.log(`- ${d.devicename}: ${d.maxTemp}°C (${d.lastUpdate})`));