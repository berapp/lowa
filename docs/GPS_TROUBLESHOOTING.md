# GPS Troubleshooting Guide

## Issues Fixed

### ✅ Browser GPS "Position unavailable" Error
**Problem**: GPS permissions don't prompt and "GPS error: Position unavailable"

**Solution**: 
- Added proper permission checking with `navigator.permissions` API
- Improved error messages with specific suggestions
- Added fallback for browsers without permissions API
- Increased timeout from 10s to 15s for better GPS acquisition

**How to test**:
1. Open the LOWA app
2. Click "Enable GPS"
3. You should see improved error messages if GPS fails
4. Try refreshing the page and enabling location services in browser settings

### ✅ Serial GPS "prompt() not supported" Error  
**Problem**: `prompt()` function doesn't work in Electron renderer process

**Solution**:
- Created proper dialog system with HTML/CSS modals
- Added GPS Serial Port Selection Dialog
- Added Manual GPS Coordinate Dialog  
- Replaced all `prompt()` calls with custom dialogs

**How to test**:
1. Change GPS source to "Serial GPS Module"
2. Click "Enable GPS" 
3. A dialog will appear to select port and baud rate
4. No more `prompt()` errors

## New Features Added

### 🆕 GPS Dialog System
- **Serial GPS Dialog**: Select port and baud rate
- **Manual GPS Dialog**: Enter coordinates with validation
- **Click outside to close**: Better user experience
- **Proper form validation**: Lat/lng range checking

### 🆕 Improved Error Messages
- **Specific GPS errors**: Permission, signal, timeout details
- **Helpful suggestions**: What to do for each error type  
- **Fallback options**: Manual GPS when hardware GPS fails

### 🆕 Better UI/UX
- **Professional dialogs**: No more browser prompts
- **Loading states**: "Scanning for GPS modules..."
- **Status updates**: Real-time GPS connection status
- **Button states**: Proper enable/disable logic

### 🆕 GPS Data Smoothing
- **Noise Reduction**: Averages multiple readings for stable positioning
- **Outlier Filtering**: Rejects poor accuracy readings automatically
- **Configurable Parameters**: Adjust smoothing for different use cases
- **Visual Feedback**: Shows smoothing status and reading count
- **Real-time Processing**: Smoothing applied to all GPS sources

## Testing Your GPS Setup

### Browser GPS Test
```bash
# Start the app
cd /home/berapp/WorkObsidianVault/Major\ Projects/LOWA/lowa/app
npm start

# In the app:
# 1. GPS Source: "Browser Geolocation" 
# 2. Click "Enable GPS"
# 3. Allow location permission
# 4. Should see blue GPS marker on map
```

### Serial GPS Test  
```bash
# Check for GPS devices
ls /dev/ttyUSB* /dev/ttyACM*

# In the app:
# 1. GPS Source: "Serial GPS Module"
# 2. Click "Enable GPS"
# 3. Select port from dialog
# 4. Choose baud rate (usually 9600)
# 5. Click "Connect"
```

### Manual GPS Test
```bash
# In the app:
# 1. GPS Source: "Manual Input"
# 2. Click "Enable GPS"  
# 3. Enter coordinates in dialog:
#    Lat: 26.674 (Fort Myers)
#    Lng: -81.806
# 4. Click "Set Location"
```

### GPS Simulator Test
```bash
# Test NMEA parsing without hardware
cd /home/berapp/WorkObsidianVault/Major\ Projects/LOWA/lowa/scripts
python3 gps_simulator.py

# Copy generated NMEA sentences to test parsing
```

## Common Issues & Solutions

### Browser GPS Still Fails
1. **Check browser settings**: Enable location services
2. **Try HTTPS**: Some browsers require HTTPS for GPS
3. **Clear permissions**: Reset location permissions and try again
4. **Use manual input**: As fallback for testing

### Serial GPS Issues  
1. **Check USB connection**: `lsusb` to see connected devices
2. **Check permissions**: May need `sudo` or add user to `dialout` group
3. **Try different baud rates**: 4800, 9600, 38400 are common
4. **Check GPS module**: Ensure it's getting GPS fix (LED indicators)

### Dialog Not Appearing
1. **Refresh page**: Reload the app  
2. **Check console**: Look for JavaScript errors
3. **Check z-index**: Dialogs should be above map (z-index: 2000)

## Hardware Recommendations

### Tested GPS Modules
- **u-blox NEO-6M/8M**: Standard hobby GPS modules
- **Adafruit Ultimate GPS**: Well-documented, easy setup
- **VK-162 G-Mouse**: Cheap USB GPS receiver

### GPS Module Setup
```bash
# Check if device appears
dmesg | grep tty

# Test raw GPS output  
cat /dev/ttyUSB0  # or your GPS device

# Should see NMEA sentences like:
# $GPGGA,123456.00,2640.123,N,08148.456,W,1,08,1.2,45.0,M...
```

## Files Modified

### Core GPS Integration
- `renderer.js`: GPS functionality, NMEA parsing, dialogs
- `main.js`: Serial port IPC handlers  
- `preload_secure.js`: Secure GPS API exposure
- `index.html`: GPS UI elements and dialogs
- `style2.css`: GPS styling and dialog CSS

### Documentation & Testing
- `GPS_INTEGRATION.md`: Complete usage guide
- `gps_simulator.py`: NMEA test data generator
- `test_gps_integration.py`: Integration test suite

## Next Steps

1. **Test all GPS sources** in your environment
2. **Try GPS track recording** while moving around  
3. **Correlate GPS with WiFi tests** for site surveys
4. **Check accuracy** in different locations (indoor/outdoor)

The GPS system is now fully functional with proper error handling and user-friendly dialogs!