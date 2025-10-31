// LOWA App Thermal Debug Script
// Paste this into the browser console (F12) when the app is running

console.log('🔍 === LOWA Thermal Debug ===');

// Check if required data is loaded
console.log('📊 Data Status:');
console.log('  Speed Test Data:', typeof allSpeedTestData !== 'undefined' ? allSpeedTestData.length + ' records' : '❌ NOT LOADED');
console.log('  AP List:', typeof apList !== 'undefined' ? apList.length + ' APs' : '❌ NOT LOADED');
console.log('  Thermal Data:', typeof thermalData !== 'undefined' ? thermalData.length + ' devices' : '❌ NOT LOADED');

// Check UI elements
console.log('\n🎛️ UI Elements:');
const debugLegendPanel = document.getElementById('legend-panel');
console.log('  Legend Panel:', debugLegendPanel ? '✅ Found' : '❌ Missing');

const debugThermalToggle = document.getElementById('thermal-toggle');
console.log('  Thermal Toggle Button:', debugThermalToggle ? '✅ Found' : '❌ Missing');

if (debugLegendPanel) {
  console.log('  Legend Panel Content Preview:', debugLegendPanel.innerHTML.substring(0, 100) + '...');
}

// Check thermal overlay status
console.log('\n🌡️ Thermal Status:');
console.log('  Thermal Visible:', typeof thermalVisible !== 'undefined' ? thermalVisible : '❓ Unknown');
console.log('  Thermal Markers Layer:', typeof thermalMarkersLayer !== 'undefined' ? 'Initialized' : '❌ Not initialized');

// Test thermal data loading
console.log('\n🔄 Testing Thermal Data Load...');
if (typeof loadThermalData === 'function') {
  loadThermalData(() => {
    console.log('✅ Thermal data reload completed');
    console.log('  New thermal data count:', thermalData ? thermalData.length : 'NONE');
    
    if (thermalData && thermalData.length > 0) {
      console.log('  Sample thermal device:', thermalData[0]);
      
      // Test correlation
      const sampleDevice = thermalData[0];
      const ap = apList.find(a => a.host === sampleDevice.host);
      console.log('  AP correlation for sample device:', ap ? ap.devicename : 'NOT FOUND');
      
      if (ap) {
        const speedRecord = allSpeedTestData.find(record => record.devicename === ap.devicename);
        console.log('  Coordinates available:', speedRecord && speedRecord.lat && speedRecord.long ? 'YES' : 'NO');
      }
    }
  });
} else {
  console.log('❌ loadThermalData function not available');
}

// Manual legend update test  
console.log('\n🔄 Testing Legend Update...');
if (typeof updateLegend === 'function') {
  updateLegend();
  console.log('✅ Legend update triggered');
} else {
  console.log('❌ updateLegend function not available');
}