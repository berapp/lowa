#!/usr/bin/env python3
"""
GPS Test Script - Simulates GPS NMEA data for testing
Run this to send test GPS data to a virtual serial port
"""

import time
import sys
from datetime import datetime, timezone

def generate_nmea_checksum(sentence):
    """Calculate NMEA checksum"""
    checksum = 0
    for char in sentence[1:]:  # Skip the $ character
        checksum ^= ord(char)
    return f"*{checksum:02X}"

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

def generate_rmc_sentence(lat, lon, speed=0.0, course=0.0):
    """Generate a GPS RMC sentence"""
    now = datetime.now(timezone.utc)
    time_str = now.strftime("%H%M%S.%f")[:-3]  # HHMMSS.sss
    date_str = now.strftime("%d%m%y")  # DDMMYY
    
    # Convert decimal degrees to DDMM.mmmm format
    lat_deg = int(abs(lat))
    lat_min = (abs(lat) - lat_deg) * 60
    lat_str = f"{lat_deg:02d}{lat_min:06.3f}"
    lat_hem = 'N' if lat >= 0 else 'S'
    
    lon_deg = int(abs(lon))
    lon_min = (abs(lon) - lon_deg) * 60
    lon_str = f"{lon_deg:03d}{lon_min:06.3f}"
    lon_hem = 'E' if lon >= 0 else 'W'
    
    # Convert m/s to knots
    speed_knots = speed * 1.943844
    
    # Build sentence without checksum
    sentence = f"$GPRMC,{time_str},A,{lat_str},{lat_hem},{lon_str},{lon_hem},{speed_knots:.1f},{course:.1f},{date_str},,,"
    
    # Add checksum
    checksum = generate_nmea_checksum(sentence)
    return sentence + checksum

def simulate_gps_movement():
    """Simulate GPS movement around Fort Myers, FL area"""
    # Starting position: 4775 Bermuda Lakes Way, Fort Myers, FL
    base_lat = 26.674
    base_lon = -81.806
    
    print("GPS NMEA Simulator - Fort Myers, FL")
    print("Copy these sentences to test GPS parsing:")
    print("=" * 50)
    
    for i in range(10):
        # Simulate small movement
        offset_lat = (i * 0.0001) - 0.0005  # Move north/south
        offset_lon = (i * 0.0001) - 0.0005  # Move east/west
        
        lat = base_lat + offset_lat
        lon = base_lon + offset_lon
        
        # Generate GPS sentences
        gga = generate_gga_sentence(lat, lon, altitude=10 + i, satellites=8 + (i % 4))
        rmc = generate_rmc_sentence(lat, lon, speed=1.5 + (i * 0.2), course=45 + (i * 10))
        
        print(f"\n--- Position {i+1} ---")
        print(gga)
        print(rmc)
        
        time.sleep(1)

if __name__ == "__main__":
    try:
        simulate_gps_movement()
    except KeyboardInterrupt:
        print("\nGPS simulation stopped.")
        sys.exit(0)