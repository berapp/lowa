## 🔍 Where to Find Thermal Information in the LOWA App

### 📍 **Location of Thermal Controls:**

1. **Right Side Panel** - Look for the "Legend Panel" on the right side of the map
2. **Thermal Overlay Section** - Should contain:
   ```
   Map Layers
   
   Thermal Overlay
   [Show Thermal Status] button
   Last update: [timestamp]
   
   • Green: Normal (< 65°C)
   • Yellow: Warm (65-70°C) 
   • Orange: Hot (70-75°C)
   • Red: Critical (≥ 75°C)
   ```

3. **Speed Test Marker Colors** - Below the thermal section

### 🎯 **How to Use:**

1. **Enable Thermal Overlay:**
   - Click the "Show Thermal Status" button in the legend panel
   - Thermal markers should appear as colored circles on the map

2. **View Thermal Details:**
   - Click on any colored thermal marker
   - Popup shows device name, temperature, and zone details

3. **Toggle On/Off:**
   - Use the same button to hide thermal data: "Hide Thermal Status"

### 🚨 **If You Don't See Thermal Controls:**

**Possible Issues:**
- Thermal data not loaded (file missing)
- JavaScript errors in browser console 
- App needs to be refreshed

**Debug Steps:**
1. Open browser developer tools (F12)
2. Check Console tab for errors
3. In Console, type: `console.log('Thermal data:', thermalData.length, 'devices')`
4. Should show: "Thermal data: X devices" where X > 0

### 📱 **App Layout:**
```
┌─────────────────────────────────────────┬─────────────┐
│                                         │   LEGEND    │
│              MAP AREA                   │   PANEL     │
│         (with markers)                  │             │
│                                         │ Thermal     │
│                                         │ Overlay     │
│                                         │ [Button]    │
│                                         │             │
│  ┌────────────────────────┐            │ • Green     │
│  │  AP Selection Panel    │            │ • Yellow    │
│  │  Filter by Date: ___   │            │ • Orange    │
│  │  [All Dates] [AP ▼]   │            │ • Red       │
│  │                        │            │             │
│  │  Details Panel         │            │ Speed Test  │
│  └────────────────────────┘            │ Colors      │
└─────────────────────────────────────────┴─────────────┘
```

### 🔧 **Quick Test:**
In browser console, paste this to test thermal functionality:
```javascript
console.log('=== Thermal Debug ===');
console.log('Thermal data loaded:', thermalData ? thermalData.length : 'NONE');
console.log('Thermal visible:', thermalVisible);
console.log('AP list loaded:', apList ? apList.length : 'NONE');
console.log('Speed test data:', allSpeedTestData ? allSpeedTestData.length : 'NONE');
```