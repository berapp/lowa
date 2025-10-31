// Debug script to test thermal processing
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

// Load thermal data
console.log('=== THERMAL DATA ANALYSIS ===');
const thermalCsv = fs.readFileSync('data/temps.csv', 'utf8');
const thermalData = parseCSV(thermalCsv);

console.log(`Total thermal rows: ${thermalData.length}`);

// Filter for pole 17 data
const pole17Data = thermalData.filter(row => 
  row.devicename && row.devicename.includes('pole 17')
);

console.log(`\nPole 17 thermal records: ${pole17Data.length}`);

if (pole17Data.length > 0) {
  const latestPole17 = pole17Data.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  )[0];
  
  console.log(`Latest pole 17 record:`);
  console.log(`- Timestamp: ${latestPole17.timestamp}`);
  console.log(`- Device: ${latestPole17.devicename}`);
  console.log(`- Host: ${latestPole17.host}`);
  console.log(`- Temp: ${latestPole17.temp_C}°C`);
  console.log(`- Zone: ${latestPole17.zone}`);
}

// Check all unique device names
const uniqueDevices = [...new Set(thermalData
  .filter(row => row.devicename && row.devicename.startsWith('pole'))
  .map(row => row.devicename)
)];

console.log(`\nUnique pole devices with thermal data (${uniqueDevices.length}):`);
uniqueDevices.sort().forEach(device => console.log(`- ${device}`));

// Load pole locations
console.log('\n=== POLE LOCATIONS ANALYSIS ===');
const poleLocationsCsv = fs.readFileSync('data/pole_locations.csv', 'utf8');
const poleLocations = parseCSV(poleLocationsCsv);

console.log(`Total pole locations: ${poleLocations.length}`);

const pole17Location = poleLocations.find(row => row.pole_id === '17');
if (pole17Location) {
  console.log(`\nPole 17 location:`);
  console.log(`- Pole ID: ${pole17Location.pole_id}`);
  console.log(`- Lat: ${pole17Location.lat}`);
  console.log(`- Long: ${pole17Location.long}`);
  console.log(`- Timestamp: ${pole17Location.timestamp}`);
} else {
  console.log('\nPole 17 location: NOT FOUND');
}

console.log(`\nAvailable pole IDs:`);
poleLocations
  .map(row => parseInt(row.pole_id))
  .filter(id => !isNaN(id))
  .sort((a, b) => a - b)
  .forEach(id => console.log(`- Pole ${id}`));

// Test pole number extraction
function extractPoleNumber(devicename) {
  if (!devicename) return null;
  const match = devicename.match(/pole\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

console.log('\n=== POLE NUMBER EXTRACTION TEST ===');
['pole 17', 'pole 12 N', 'pole 01 NE', 'pole 22 SW'].forEach(name => {
  console.log(`"${name}" -> ${extractPoleNumber(name)}`);
});