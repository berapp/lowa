// Simple Thermal Data Debug - Paste into browser console
console.log('🔍 Thermal Data Processing Debug');

// Test fetch directly
fetch('data/temps.csv')
  .then(response => response.text())
  .then(csvText => {
    console.log('✅ CSV loaded, size:', csvText.length, 'bytes');
    
    // Parse with PapaParse
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: false,
      complete: results => {
        const rows = results.data || [];
        console.log('📊 Total CSV rows:', rows.length);
        
        if (rows.length > 0) {
          console.log('📝 Sample row:', rows[0]);
          console.log('📝 Headers:', Object.keys(rows[0]));
        }
        
        // Test processThermalData filtering
        console.log('\n🔄 Testing thermal processing...');
        
        let validRows = 0;
        let invalidReasons = {};
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        for (let i = 0; i < Math.min(100, rows.length); i++) {
          const row = rows[i];
          let reason = 'valid';
          
          if (!row.devicename) reason = 'no devicename';
          else if (!row.temp_C) reason = 'no temp_C';
          else if (row.error && row.error.trim()) reason = 'has error';
          else {
            const timestamp = new Date(row.timestamp);
            if (isNaN(timestamp.getTime())) reason = 'invalid timestamp';
            else if (timestamp < cutoffTime) reason = 'too old';
            else {
              const tempC = parseFloat(row.temp_C);
              if (isNaN(tempC)) reason = 'non-numeric temp';
              else if (tempC < 10 || tempC > 100) reason = 'invalid temp range';
              else validRows++;
            }
          }
          
          invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
        }
        
        console.log('📈 First 100 rows analysis:');
        console.log('  Valid rows:', validRows);
        console.log('  Invalid reasons:', invalidReasons);
        console.log('  Cutoff time (24h ago):', cutoffTime.toISOString());
        
        // Check some actual temperature values
        console.log('\n🌡️ Sample temperatures:');
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i];
          console.log(`  Row ${i}: temp_C="${row.temp_C}", parsed=${parseFloat(row.temp_C)}, timestamp="${row.timestamp}"`);
        }
      }
    });
  })
  .catch(err => {
    console.error('❌ Failed to load thermal data:', err);
  });