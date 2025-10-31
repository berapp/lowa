#!/usr/bin/env python3
"""
Combine and clean thermal CSV files from scripts/temps.csv and app/data/temps.csv
"""

import csv
import json
import os
from collections import defaultdict

def load_ip_to_device_mapping():
    """Load IP to device name mapping from aps.json"""
    # Get the directory of the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up one level to lowa, then to app/data for aps.json
    aps_file = os.path.join(script_dir, '..', 'app', 'data', 'aps.json')
    
    with open(aps_file, 'r') as f:
        aps = json.load(f)
    
    mapping = {}
    for ap in aps:
        if 'host' in ap and 'devicename' in ap:
            mapping[ap['host']] = ap['devicename']
    
    return mapping

def is_error_row(row):
    """Check if a row contains error data that should be removed."""
    error_indicators = [
        'ssh:',
        'WARNING:',
        'Connection timed out',
        'Host key verification failed',
        'Permission denied',
        'No such file or directory',
        'Connection refused',
        'Network is unreachable',
        'Operation timed out',
        'ssh_exchange_identification',
        'kex_exchange_identification',
        'Connection reset by peer',
        '@',  # SSH prompts/errors often contain @
        'REMOTE HOST IDENTIFICATION HAS CHANGED',
        'Could not resolve hostname',
        'Name or service not known'
    ]
    
    # Check temp_C field for errors
    temp_c = row.get('temp_C', '').strip()
    if temp_c and any(indicator in temp_c for indicator in error_indicators):
        return True
    
    # Check error field
    error_field = row.get('error', '').strip()
    if error_field and any(indicator in error_field for indicator in error_indicators):
        return True
    
    # Check devicename field for SSH errors
    devicename = row.get('devicename', '').strip()
    if devicename and any(indicator in devicename for indicator in error_indicators):
        return True
    
    return False

def fix_devicename(row, ip_to_device):
    """Fix devicename if it's an IP address."""
    current_devicename = row.get('devicename', '').strip()
    host_ip = row.get('host', '').strip()
    
    # If devicename is the same as host (IP), try to map it
    if current_devicename == host_ip and host_ip in ip_to_device:
        row['devicename'] = ip_to_device[host_ip]
        return True
    
    return False

def combine_and_clean_thermal_data():
    """Combine thermal data from both locations and clean it."""
    
    print("=== THERMAL DATA COMBINATION AND CLEANUP ===")
    
    # File paths
    scripts_csv = '/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/scripts/temps.csv'
    app_data_csv = '/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data/temps.csv'
    output_csv = '/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data/temps_combined_clean.csv'
    
    # Load IP to device mapping
    print("Loading IP to device mapping...")
    ip_to_device = load_ip_to_device_mapping()
    print(f"Loaded {len(ip_to_device)} IP -> devicename mappings")
    
    all_rows = []
    seen_rows = set()  # For deduplication
    
    files_to_process = []
    if os.path.exists(scripts_csv):
        files_to_process.append(('scripts', scripts_csv))
    if os.path.exists(app_data_csv):
        files_to_process.append(('app/data', app_data_csv))
    
    if not files_to_process:
        print("No thermal CSV files found!")
        return
    
    total_input_rows = 0
    total_error_rows = 0
    total_duplicate_rows = 0
    devicename_fixes = 0
    
    # Process each file
    for source, filepath in files_to_process:
        print(f"\nProcessing {source}: {os.path.basename(filepath)}")
        
        try:
            with open(filepath, 'r') as f:
                reader = csv.DictReader(f)
                file_rows = 0
                file_errors = 0
                file_duplicates = 0
                file_fixes = 0
                
                for row in reader:
                    file_rows += 1
                    total_input_rows += 1
                    
                    # Skip error rows
                    if is_error_row(row):
                        file_errors += 1
                        total_error_rows += 1
                        continue
                    
                    # Fix devicename if needed
                    if fix_devicename(row, ip_to_device):
                        file_fixes += 1
                        devicename_fixes += 1
                    
                    # Create deduplication key
                    dedup_key = (
                        row.get('timestamp', '').strip(),
                        row.get('devicename', '').strip(),
                        row.get('host', '').strip(),
                        row.get('zone', '').strip(),
                        row.get('temp_C', '').strip()
                    )
                    
                    if dedup_key in seen_rows:
                        file_duplicates += 1
                        total_duplicate_rows += 1
                        continue
                    
                    seen_rows.add(dedup_key)
                    all_rows.append(row)
                
                print(f"  Processed: {file_rows:,} rows")
                print(f"  Errors removed: {file_errors:,}")
                print(f"  Duplicates removed: {file_duplicates:,}")
                print(f"  Device names fixed: {file_fixes:,}")
                
        except Exception as e:
            print(f"  Error reading {filepath}: {e}")
    
    print(f"\n=== SUMMARY ===")
    print(f"Total input rows: {total_input_rows:,}")
    print(f"Error rows removed: {total_error_rows:,}")
    print(f"Duplicate rows removed: {total_duplicate_rows:,}")
    print(f"Device names fixed: {devicename_fixes:,}")
    print(f"Clean rows remaining: {len(all_rows):,}")
    
    # Sort by timestamp
    print("\nSorting by timestamp...")
    try:
        all_rows.sort(key=lambda x: x.get('timestamp', ''))
    except Exception as e:
        print(f"Warning: Could not sort by timestamp: {e}")
    
    # Write combined clean file
    print(f"Writing combined clean data to: {output_csv}")
    
    if all_rows:
        fieldnames = list(all_rows[0].keys())
        
        with open(output_csv, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        
        print(f"✅ Combined clean file written: {output_csv}")
        print(f"📊 Final record count: {len(all_rows):,}")
        
        # Show sample of devices
        devices = defaultdict(int)
        for row in all_rows:
            device = row.get('devicename', 'unknown')
            devices[device] += 1
        
        print(f"\n📈 Top 10 devices by record count:")
        for device, count in sorted(devices.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"  {device}: {count:,} records")
        
        # Replace the app data file with the clean version
        backup_path = app_data_csv + '.backup'
        if os.path.exists(app_data_csv):
            print(f"\nBacking up original to: {backup_path}")
            os.rename(app_data_csv, backup_path)
        
        print(f"Replacing {app_data_csv} with clean data...")
        os.rename(output_csv, app_data_csv)
        
        print("✅ Thermal data combination and cleanup complete!")
        
    else:
        print("❌ No clean data to write!")

if __name__ == '__main__':
    combine_and_clean_thermal_data()