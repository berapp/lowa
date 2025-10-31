#!/usr/bin/env python3
"""
Fix existing temps.csv by mapping IP addresses to proper device names from aps.json
"""

import json
import csv
import sys

def load_ip_to_device_mapping(aps_file):
    """Load aps.json and create IP -> devicename mapping."""
    with open(aps_file, 'r') as f:
        aps = json.load(f)
    
    mapping = {}
    for ap in aps:
        if 'host' in ap and 'devicename' in ap:
            mapping[ap['host']] = ap['devicename']
    
    return mapping

def fix_thermal_csv(input_file, output_file, aps_file):
    """Fix thermal CSV by replacing IP devicenames with proper device names."""
    
    print(f"Loading AP mappings from {aps_file}...")
    ip_to_device = load_ip_to_device_mapping(aps_file)
    print(f"Loaded {len(ip_to_device)} IP -> devicename mappings")
    
    # Show some mappings for verification
    print("\nSample mappings:")
    for i, (ip, device) in enumerate(list(ip_to_device.items())[:5]):
        print(f"  {ip} -> {device}")
    
    updated_count = 0
    total_count = 0
    
    print(f"\nProcessing {input_file}...")
    
    with open(input_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        
        for row in reader:
            total_count += 1
            
            # Check if devicename is an IP address that we can map
            current_devicename = row['devicename']
            host_ip = row['host']
            
            # If devicename is the same as host (IP), try to map it
            if current_devicename == host_ip and host_ip in ip_to_device:
                row['devicename'] = ip_to_device[host_ip]
                updated_count += 1
            
            writer.writerow(row)
    
    print(f"\nCompleted!")
    print(f"Total rows processed: {total_count:,}")
    print(f"Rows updated: {updated_count:,}")
    print(f"Output written to: {output_file}")

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python3 fix_thermal_devicenames.py <input_temps.csv> <output_temps.csv> <aps.json>")
        print("Example: python3 fix_thermal_devicenames.py temps.csv temps_fixed.csv aps.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    aps_file = sys.argv[3]
    
    fix_thermal_csv(input_file, output_file, aps_file)