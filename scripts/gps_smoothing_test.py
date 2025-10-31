#!/usr/bin/env python3
"""
Enhanced GPS Simulator with Noise for Testing GPS Smoothing
Generates realistic GPS data with noise to test smoothing algorithms
"""

import time
import sys
import math
import random
from datetime import datetime, timezone

def generate_nmea_checksum(sentence):
    """Calculate NMEA checksum"""
    checksum = 0
    for char in sentence[1:]:  # Skip the $ character
        checksum ^= ord(char)
    return f"*{checksum:02X}"

def add_gps_noise(lat, lon, accuracy_meters=5, spike_probability=0.05):
    """Add realistic GPS noise to coordinates"""
    # Convert accuracy to degrees (rough approximation)
    accuracy_deg = accuracy_meters / 111000.0  # meters to degrees
    
    # Add random GPS noise (normal distribution)
    noise_lat = random.gauss(0, accuracy_deg / 3)  # 3-sigma = accuracy
    noise_lon = random.gauss(0, accuracy_deg / 3)
    
    # Occasionally add GPS spikes (multipath, poor satellite geometry)
    if random.random() < spike_probability:
        spike_magnitude = accuracy_deg * random.uniform(2, 8)
        noise_lat += random.choice([-1, 1]) * spike_magnitude
        noise_lon += random.choice([-1, 1]) * spike_magnitude
    
    return lat + noise_lat, lon + noise_lon

def generate_gga_sentence(lat, lon, altitude=100, satellites=8, hdop=1.2):
    """Generate a GPS GGA sentence"""
    now = datetime.now(timezone.utc)
    time_str = now.strftime("%H%M%S.%f")[:-3]  # HHMMSS.sss
    
    # Convert decimal degrees to DDMM.mmmm format
    lat_deg = int(abs(lat))
    lat_min = (abs(lat) - lat_deg) * 60
    lat_str = f"{lat_deg:02d}{lat_min:06.3f}"
    lat_hem = 'N' if lat >= 0 else 'S'
    
    lon_deg = int(abs(lon))
    lon_min = (abs(lon) - lon_deg) * 60
    lon_str = f"{lon_deg:03d}{lon_min:06.3f}"
    lon_hem = 'E' if lon >= 0 else 'W'
    
    # Build sentence without checksum
    sentence = f"$GPGGA,{time_str},{lat_str},{lat_hem},{lon_str},{lon_hem},1,{satellites:02d},{hdop:.1f},{altitude:.1f},M,0.0,M,,"
    
    # Add checksum
    checksum = generate_nmea_checksum(sentence)
    return sentence + checksum

def simulate_walking_path(mode='stationary'):
    """Simulate different GPS scenarios"""
    # Starting position: 4775 Bermuda Lakes Way, Fort Myers, FL
    base_lat = 26.674
    base_lon = -81.806
    
    print(f"GPS Smoothing Test - {mode.title()} Mode")
    print("=" * 50)
    
    for i in range(50):  # More readings for better smoothing test
        if mode == 'stationary':
            # Simulate stationary GPS with noise
            true_lat = base_lat
            true_lon = base_lon
            accuracy = random.uniform(3, 15)  # Variable GPS accuracy
        
        elif mode == 'walking':
            # Simulate walking in a straight line (north)
            distance_m = i * 2  # 2 meters per reading
            lat_offset = distance_m / 111000.0  # Convert meters to degrees
            true_lat = base_lat + lat_offset
            true_lon = base_lon
            accuracy = random.uniform(3, 12)
        
        elif mode == 'driving':
            # Simulate driving in a curve
            angle = i * 0.1  # Radians
            radius_m = 50  # 50 meter radius curve
            lat_offset = (radius_m * math.sin(angle)) / 111000.0
            lon_offset = (radius_m * math.cos(angle)) / 111000.0
            true_lat = base_lat + lat_offset
            true_lon = base_lon + lon_offset
            accuracy = random.uniform(5, 20)  # More variable accuracy while driving
        
        elif mode == 'noisy':
            # Simulate poor GPS conditions with lots of noise
            true_lat = base_lat
            true_lon = base_lon
            accuracy = random.uniform(10, 50)  # Poor accuracy
        
        # Add GPS noise based on accuracy
        noisy_lat, noisy_lon = add_gps_noise(true_lat, true_lon, accuracy, spike_probability=0.1)
        
        # Vary other GPS parameters realistically
        satellites = random.randint(6, 12)
        hdop = accuracy / 5.0  # HDOP roughly correlates with accuracy
        altitude = 10 + random.uniform(-5, 10)
        
        # Generate NMEA sentence
        gga = generate_gga_sentence(noisy_lat, noisy_lon, altitude, satellites, hdop)
        
        print(f"Reading {i+1:2d}: {gga}")
        
        # Show the noise for debugging
        noise_distance = math.sqrt((noisy_lat - true_lat)**2 + (noisy_lon - true_lon)**2) * 111000
        print(f"           True: {true_lat:.6f}, {true_lon:.6f} | Noise: {noise_distance:.1f}m | Acc: ±{accuracy:.1f}m")
        
        time.sleep(1)

def main():
    """Run GPS simulation with different modes"""
    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()
        if mode not in ['stationary', 'walking', 'driving', 'noisy']:
            print("Usage: python3 gps_smoothing_test.py [stationary|walking|driving|noisy]")
            print("Default: stationary")
            mode = 'stationary'
    else:
        mode = 'stationary'
    
    print("GPS Smoothing Test Data Generator")
    print("This generates GPS data with realistic noise to test smoothing algorithms")
    print(f"Mode: {mode}")
    print("\nTest scenarios:")
    print("- stationary: GPS receiver not moving (tests noise filtering)")
    print("- walking: Moving in straight line (tests lag vs accuracy)")  
    print("- driving: Moving in curve (tests prediction)")
    print("- noisy: Poor GPS conditions (tests outlier rejection)")
    print("\nCopy the NMEA sentences to test GPS smoothing in the app\n")
    
    try:
        simulate_walking_path(mode)
    except KeyboardInterrupt:
        print("\nGPS simulation stopped.")
        sys.exit(0)

if __name__ == "__main__":
    main()