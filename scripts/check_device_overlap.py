#!/usr/bin/env python3
"""
Check overlap between iperf3 devices and thermal devices.
"""

import json
import csv
from collections import defaultdict

# Read aps.json to get IP -> devicename mapping
with open('/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data/aps.json', 'r') as f:
    aps = json.load(f)

ip_to_device = {ap['host']: ap['devicename'] for ap in aps if 'host' in ap and 'devicename' in ap}

# Get iperf3 devices
iperf3_devices = set()
with open('/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data/iperf3_consolidated.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['devicename'] and row['devicename'].strip():
            iperf3_devices.add(row['devicename'].strip())

# Get thermal device IPs and map to device names
thermal_ips = set()
with open('/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data/temps.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['host'] and row['host'].strip():
            thermal_ips.add(row['host'].strip())

thermal_devices = set()
for ip in thermal_ips:
    if ip in ip_to_device:
        thermal_devices.add(ip_to_device[ip])

print("=== Device Overlap Analysis ===")
print(f"iPerf3 devices: {len(iperf3_devices)}")
print(f"Thermal devices (mapped): {len(thermal_devices)}")

# Find overlap
overlap = iperf3_devices & thermal_devices
print(f"Overlapping devices: {len(overlap)}")

if overlap:
    print("\nDevices with BOTH iperf3 and thermal data:")
    for device in sorted(overlap):
        print(f"  - {device}")
else:
    print("\nNo devices have both iperf3 and thermal data!")

print(f"\nDevices only in iPerf3:")
iperf_only = iperf3_devices - thermal_devices
for device in sorted(list(iperf_only)[:10]):  # Show first 10
    print(f"  - {device}")
if len(iperf_only) > 10:
    print(f"  ... and {len(iperf_only) - 10} more")

print(f"\nDevices only in Thermal:")
thermal_only = thermal_devices - iperf3_devices  
for device in sorted(list(thermal_only)[:10]):  # Show first 10
    print(f"  - {device}")
if len(thermal_only) > 10:
    print(f"  ... and {len(thermal_only) - 10} more")