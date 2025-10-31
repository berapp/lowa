// Test thermal data processing with new 7-day window
console.log('🔄 Testing thermal data with 7-day window...');

const testNow = new Date();
const testCutoff = new Date(testNow.getTime() - 7 * 24 * 60 * 60 * 1000);
console.log('Current time:', testNow.toISOString());
console.log('7-day cutoff:', testCutoff.toISOString());

// Test sample dates
const thermalDates = ['2025-10-27', '2025-10-28', '2025-10-29'];
console.log('\nThermal data dates vs cutoff:');
thermalDates.forEach(dateStr => {
  const thermalDate = new Date(dateStr);
  const isValid = thermalDate >= testCutoff;
  console.log(`  ${dateStr}: ${isValid ? '✅ VALID' : '❌ TOO OLD'}`);
});

console.log('\nNow run: loadThermalData(); to reload thermal data');