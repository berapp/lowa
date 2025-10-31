// Test timezone handling for thermal data
const testTimestamp = "2025-10-30T13:33:38.595245-04:00";
const systemTime = new Date();
console.log("=== TIMEZONE DEBUG ===");
console.log(`Test CSV timestamp: ${testTimestamp}`);
console.log(`Parsed as Date: ${new Date(testTimestamp)}`);
console.log(`System time now: ${systemTime}`);
console.log(`System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// Check time difference
const csvTime = new Date(testTimestamp);
const diffMs = systemTime.getTime() - csvTime.getTime();
const diffHours = diffMs / (1000 * 60 * 60);
console.log(`Time difference: ${diffHours.toFixed(2)} hours`);

// Test different cutoff strategies
const cutoffs = [1, 2, 4, 6, 12, 24];
cutoffs.forEach(hours => {
  const cutoff = new Date(systemTime.getTime() - hours * 60 * 60 * 1000);
  const isRecent = csvTime >= cutoff;
  console.log(`${hours}h cutoff (${cutoff.toISOString()}): ${isRecent ? 'INCLUDED' : 'excluded'}`);
});

// Show what cutoff we need
console.log(`\nRecommended cutoff: ${Math.ceil(diffHours) + 1} hours to include recent data`);