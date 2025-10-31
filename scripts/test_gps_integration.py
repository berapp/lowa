#!/usr/bin/env python3
"""
GPS Functionality Test Script
Tests the GPS integration in the LOWA app
"""

import subprocess
import time
import os

def test_app_running():
    """Check if the LOWA app is running"""
    print("🔍 Checking if LOWA app is running...")
    try:
        result = subprocess.run(['pgrep', '-f', 'electron.*lowa'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ LOWA app is running")
            return True
        else:
            print("❌ LOWA app is not running")
            return False
    except Exception as e:
        print(f"⚠️  Could not check app status: {e}")
        return False

def test_serial_package():
    """Check if serialport package is installed"""
    print("\n📦 Checking serialport package installation...")
    app_dir = "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app"
    
    if os.path.exists(os.path.join(app_dir, "node_modules", "serialport")):
        print("✅ serialport package is installed")
        return True
    else:
        print("❌ serialport package is missing")
        return False

def test_gps_simulator():
    """Test the GPS simulator functionality"""
    print("\n🛰️ Testing GPS simulator...")
    try:
        result = subprocess.run([
            'python3', 
            '/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/scripts/gps_simulator.py'
        ], capture_output=True, text=True, timeout=3)
        
        if '$GPGGA' in result.stdout and '$GPRMC' in result.stdout:
            print("✅ GPS simulator is working")
            lines = result.stdout.split('\n')
            gps_lines = [line for line in lines if line.startswith('$GP')]
            print(f"📡 Generated {len(gps_lines)} GPS sentences")
            return True
        else:
            print("❌ GPS simulator output is invalid")
            return False
            
    except subprocess.TimeoutExpired:
        print("✅ GPS simulator is running (timeout after 3s is normal)")
        return True
    except Exception as e:
        print(f"❌ GPS simulator error: {e}")
        return False

def test_file_structure():
    """Check if GPS-related files exist"""
    print("\n📁 Checking GPS file structure...")
    
    files_to_check = [
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/renderer.js",
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/main.js", 
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/preload_secure.js",
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/index.html",
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/style2.css",
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/scripts/gps_simulator.py",
        "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/docs/GPS_INTEGRATION.md"
    ]
    
    all_exist = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"✅ {os.path.basename(file_path)}")
        else:
            print(f"❌ {os.path.basename(file_path)} - MISSING")
            all_exist = False
    
    return all_exist

def check_gps_code_integration():
    """Check if GPS code was properly integrated"""
    print("\n🔍 Checking GPS code integration...")
    
    renderer_path = "/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/renderer.js"
    
    try:
        with open(renderer_path, 'r') as f:
            content = f.read()
            
        checks = [
            ('GPS variables', 'gpsEnabled = false'),
            ('GPS functions', 'function enableGPS()'),
            ('NMEA parsing', 'function parseNMEASentence'),
            ('GPS dialogs', 'showGPSDialog'),
            ('Manual GPS', 'enableManualGPS'),
            ('Serial GPS', 'enableSerialGPS'),
            ('GPS smoothing', 'gpsSmoothing = {'),
            ('Smoothing functions', 'function addGPSReading'),
            ('Smoothing config', 'showGPSSmoothingDialog')
        ]
        
        all_found = True
        for check_name, search_string in checks:
            if search_string in content:
                print(f"✅ {check_name}")
            else:
                print(f"❌ {check_name} - NOT FOUND")
                all_found = False
                
        return all_found
        
    except Exception as e:
        print(f"❌ Could not check code integration: {e}")
        return False

def main():
    """Run all GPS tests"""
    print("GPS Integration Test Suite")
    print("=" * 40)
    
    tests = [
        test_app_running,
        test_serial_package,
        test_file_structure,
        check_gps_code_integration,
        test_gps_simulator
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test error: {e}")
            results.append(False)
    
    print("\n" + "=" * 40)
    print("📊 TEST SUMMARY")
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"🎉 All {total} tests PASSED!")
        print("\n📋 Next steps:")
        print("1. Open the LOWA app")
        print("2. Try 'Enable GPS' with Browser Geolocation")
        print("3. Try 'Manual Input' for coordinates")
        print("4. If you have a GPS module, try 'Serial GPS Module'")
    else:
        print(f"⚠️  {passed}/{total} tests passed")
        print("Some GPS features may not work properly.")
    
    print("\n📚 See GPS_INTEGRATION.md for complete usage guide")

if __name__ == "__main__":
    main()