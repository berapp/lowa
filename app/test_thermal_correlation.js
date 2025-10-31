// Test thermal correlation - place this in browser console
console.log('=== Testing Thermal-AP Correlation ===');

// Check if data is loaded
if (typeof allSpeedTestData !== 'undefined' && allSpeedTestData.length > 0) {
  console.log(`Speed test data loaded: ${allSpeedTestData.length} records`);
} else {
  console.log('ERROR: Speed test data not loaded');
}

if (typeof apList !== 'undefined' && apList.length > 0) {
  console.log(`AP list loaded: ${apList.length} APs`);
} else {
  console.log('ERROR: AP list not loaded');
}

if (typeof thermalData !== 'undefined' && thermalData.length > 0) {
  console.log(`Thermal data loaded: ${thermalData.length} devices`);
  
  // Test correlation for each thermal device
  thermalData.forEach((device, i) => {
    console.log(`\n--- Device ${i+1}: ${device.host} ---`);
    
    // Find AP info
    const ap = apList.find(a => a.host === device.host);
    if (ap) {
      console.log(`  AP found: ${ap.devicename}`);
      
      // Find coordinates from speed test data
      const speedTestRecord = allSpeedTestData.find(record => record.devicename === ap.devicename);
      if (speedTestRecord && speedTestRecord.lat && speedTestRecord.long) {
        console.log(`  Coordinates: ${speedTestRecord.lat}, ${speedTestRecord.long}`);
        console.log(`  Max temp: ${device.maxTemp}°C`);
        console.log('  ✅ Ready for thermal overlay');
      } else {
        console.log('  ❌ No coordinates found in speed test data');
      }
    } else {
      console.log('  ❌ No AP found for this host');
    }
  });
} else {
  console.log('ERROR: Thermal data not loaded');
}