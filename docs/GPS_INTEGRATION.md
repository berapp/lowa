# GPS Integration Guide

## Overview

The LOWA app now includes comprehensive GPS functionality to track your location while analyzing WiFi performance. This allows you to correlate network performance with specific geographic positions.

## GPS Features

### 1. Multiple GPS Sources
- **Browser Geolocation**: Uses your device's built-in GPS/location services
- **Serial GPS Module**: Connects to external GPS devices via USB/serial port
- **Manual Input**: Enter coordinates manually for testing or fixed locations

### 2. Real-time Location Display
- Live GPS coordinates with accuracy information
- Visual GPS marker on the map with accuracy circle
- Automatic map centering on your location

### 3. GPS Track Recording
- Record your movement path as you conduct speed tests
- Visual GPS track overlay on the map
- Clear track history when needed

### 4. GPS Data Smoothing 🆕
- **Noise Filtering**: Averages multiple GPS readings to reduce noise
- **Outlier Rejection**: Filters out inaccurate readings based on accuracy threshold
- **Kalman-like Filtering**: Smooths position changes while maintaining responsiveness
- **Configurable Parameters**: Adjust smoothing window, accuracy thresholds, and responsiveness
- **Visual Feedback**: Shows number of readings used in smoothing

## Using GPS Features

### Browser Geolocation (Easiest)
1. Click **"Enable GPS"** button
2. Allow location permission when prompted
3. Your location will appear as a blue dot on the map
4. Coordinates are displayed below the GPS controls

### Serial GPS Module (Most Accurate)
1. Connect your GPS module via USB
2. Change GPS Source to **"Serial GPS Module"**
3. Click **"Enable GPS"**
4. Select the correct serial port from the list
5. Set the baud rate (usually 9600 or 4800)
6. The app will parse NMEA data and display your location

### Manual Input (For Testing)
1. Change GPS Source to **"Manual Input"**
2. Click **"Enable GPS"**
3. Enter latitude and longitude when prompted
4. Your entered coordinates will be marked on the map

## GPS Controls

- **Enable GPS**: Start GPS tracking
- **Disable GPS**: Stop GPS and remove location marker
- **Center on Location**: Pan the map to your current GPS position
- **GPS Source**: Select between Browser, Serial, or Manual GPS
- **Record GPS Track**: Enable to record your movement path
- **Clear Track**: Remove the recorded GPS track

### GPS Smoothing Controls 🆕
- **GPS Smoothing**: Enable/disable coordinate smoothing (enabled by default)
- **Config**: Open smoothing configuration dialog
  - **Window Size**: Number of GPS readings to average (1-20, default: 5)
  - **Max Accuracy Threshold**: Reject readings worse than this accuracy in meters (1-500, default: 50)
  - **Max Age**: Maximum age of readings to include in seconds (5-300, default: 30)
  - **Responsiveness**: Filter responsiveness from 0.1 (smooth) to 0.9 (responsive), default: 0.3

## Technical Details

### Supported GPS Modules
The app supports any GPS module that outputs standard NMEA sentences via serial/USB:
- **u-blox modules** (NEO-6M, NEO-8M, etc.)
- **GlobalSat GPS modules**
- **Adafruit GPS modules**
- **Generic USB GPS dongles**

### NMEA Sentence Support
- **GGA**: Global Positioning System Fix Data
- **RMC**: Recommended Minimum Course data
- Auto-detection of GPS vs GLONASS sentences ($GP* or $GN*)

### Accuracy Information
- Browser GPS: Uses device's reported accuracy
- Serial GPS: Estimates accuracy from HDOP (Horizontal Dilution of Precision)
- Manual input: No accuracy information

## Troubleshooting

### Browser GPS Issues
- **Permission denied**: Enable location services in browser settings
- **Position unavailable**: Check GPS/WiFi connectivity
- **Timeout errors**: Try refreshing the page and enabling GPS again

### Serial GPS Issues
- **No serial ports found**: Ensure GPS module is connected and drivers installed
- **Port access denied**: Run the app with appropriate permissions
- **No GPS data**: Check baud rate settings and GPS module power

### General GPS Issues
- **Poor accuracy**: Move to an area with clear sky view
- **No GPS fix**: Wait for the module to acquire satellites (can take 30+ seconds)
- **Intermittent tracking**: Check power connections and antenna placement

## Data Integration

### Speed Test Correlation
When GPS is enabled during speed tests, location data can be correlated with:
- WiFi signal strength at specific coordinates
- Throughput performance by geographic area
- Network coverage mapping
- Dead zone identification

### Export Data
GPS coordinates are included in speed test data exports when GPS is active, allowing for:
- GIS analysis in external tools
- Coverage heat map generation
- Performance optimization based on location patterns

## Best Practices

1. **Enable GPS before starting speed tests** for location correlation
2. **Use serial GPS** for highest accuracy in professional testing
3. **Record tracks** when doing walking/driving surveys
4. **Clear tracks periodically** to avoid cluttering the display
5. **Check accuracy** - wait for good GPS fix before important measurements

## Hardware Recommendations

### Professional Use
- **u-blox NEO-8M GPS module** with external antenna
- **GlobalSat BU-353-S4** USB GPS receiver
- **Garmin GPS 18x OEM** for high-precision work

### Basic Use
- **Adafruit Ultimate GPS** for simple projects  
- **VK-162 G-Mouse** USB GPS receiver
- Built-in device GPS for casual testing

## Security Notes

- Browser geolocation requires HTTPS in production
- Serial GPS requires appropriate system permissions
- Location data is processed locally - not transmitted externally
- GPS tracks are stored in browser memory only (not persistent)

## File Structure

```
lowa/app/
├── main.js           # GPS IPC handlers for serial communication
├── preload_secure.js # Safe GPS API exposure to renderer
├── renderer.js       # GPS UI and NMEA parsing logic
├── index.html        # GPS control UI elements
└── style2.css        # GPS styling
```

## Testing GPS

### Basic GPS Testing
Use the included GPS simulator for development and testing:

```bash
cd lowa/scripts
python3 gps_simulator.py
```

This generates realistic NMEA sentences for the Fort Myers area that can be used to test GPS parsing without actual hardware.

### GPS Smoothing Testing 🆕
Use the enhanced GPS simulator to test smoothing algorithms with realistic noise:

```bash
cd lowa/scripts
# Test different scenarios
python3 gps_smoothing_test.py stationary  # GPS receiver not moving
python3 gps_smoothing_test.py walking     # Moving in straight line
python3 gps_smoothing_test.py driving     # Moving in curve
python3 gps_smoothing_test.py noisy       # Poor GPS conditions
```

**Test Procedure**:
1. Run simulator with noisy GPS data
2. Copy NMEA sentences from terminal
3. Use Serial GPS mode and paste sentences to test parsing
4. Compare smoothed vs unsmoothed positions
5. Adjust smoothing parameters in Config dialog
6. Observe smoothing effectiveness in status messages

**Smoothing Benefits**:
- **Stationary mode**: Reduces GPS jitter around true position
- **Walking mode**: Balances accuracy with responsiveness
- **Driving mode**: Smooths curves while maintaining track fidelity
- **Noisy mode**: Filters out GPS spikes and poor readings