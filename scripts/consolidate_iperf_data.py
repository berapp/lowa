#!/usr/bin/env python3
"""
Consolidate all iperf3*.csv and iperf*.csv files into a single unified CSV.
Handles different formats and ensures no data loss.
"""

import csv
import os
import glob
import sys
from datetime import datetime
from collections import defaultdict

def detect_format(filepath):
    """Detect the CSV format by examining headers and structure."""
    try:
        # Try to read the first few lines
        with open(filepath, 'r', encoding='utf-8') as f:
            first_line = f.readline().strip()
            second_line = f.readline().strip()
        
        # Check if it has headers
        has_header = 'timestamp' in first_line.lower()
        
        if has_header:
            # Count columns in header
            header_cols = len(first_line.split(','))
            # Check for specific columns
            has_packets = 'packets' in first_line.lower()
            
            if has_packets and header_cols >= 15:
                return 'format1'  # Full format with packets/lost_packets
            elif header_cols >= 13:
                return 'format2'  # Missing packets/lost_packets
            else:
                return 'format3'  # Minimal format
        else:
            # No header - legacy format
            return 'legacy'
    
    except Exception as e:
        print(f"Warning: Could not detect format for {filepath}: {e}")
        return 'unknown'

def read_csv_file(filepath, format_type):
    """Read CSV file based on detected format and return list of standardized records."""
    
    # Standard output columns
    standard_cols = ['timestamp', 'ssid', 'bssid', 'signal_dbm', 'channel', 
                    'iperf3_server', 'iperf_direction', 'iperf_throughput_mbps',
                    'iperf_jitter_ms', 'iperf_loss_percent', 'packets', 
                    'lost_packets', 'lat', 'long', 'devicename', 'source_file']
    
    records = []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            if format_type == 'legacy':
                # No header, read all rows
                reader = csv.reader(f)
                for row in reader:
                    if len(row) >= 13:  # Minimum required columns
                        # Legacy format: timestamp,ssid,bssid,signal_dbm,channel,iperf3_server,
                        # iperf_direction,iperf_throughput_mbps,iperf_jitter_ms,iperf_loss_percent,lat,long,devicename
                        record = {
                            'timestamp': row[0] if len(row) > 0 else '',
                            'ssid': row[1] if len(row) > 1 else '',
                            'bssid': row[2] if len(row) > 2 else '',
                            'signal_dbm': row[3] if len(row) > 3 else '',
                            'channel': row[4] if len(row) > 4 else '',
                            'iperf3_server': row[5] if len(row) > 5 else '',
                            'iperf_direction': row[6] if len(row) > 6 else '',
                            'iperf_throughput_mbps': row[7] if len(row) > 7 else '',
                            'iperf_jitter_ms': row[8] if len(row) > 8 else '',
                            'iperf_loss_percent': row[9] if len(row) > 9 else '',
                            'packets': '',  # Not available in legacy
                            'lost_packets': '',  # Not available in legacy
                            'lat': row[10] if len(row) > 10 else '',
                            'long': row[11] if len(row) > 11 else '',
                            'devicename': row[12] if len(row) > 12 else '',
                            'source_file': os.path.basename(filepath)
                        }
                        records.append(record)
            else:
                # Has header
                reader = csv.DictReader(f)
                for row in reader:
                    # Create standardized record
                    record = {}
                    for col in standard_cols[:-1]:  # Exclude source_file
                        # Handle column name variations
                        value = ''
                        if col in row:
                            value = row[col]
                        elif col == 'lat' and 'latitude' in row:
                            value = row['latitude']
                        elif col == 'long' and 'longitude' in row:
                            value = row['longitude']
                        
                        record[col] = value
                    
                    record['source_file'] = os.path.basename(filepath)
                    records.append(record)
        
        print(f"  Read {len(records)} records from {os.path.basename(filepath)}")
        return records
        
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return []

def consolidate_iperf_files(data_dir, output_file):
    """Consolidate all iperf CSV files into a single file."""
    
    # Find all iperf CSV files (excluding the consolidated output)
    patterns = [
        os.path.join(data_dir, 'iperf3_data*.csv'),
        os.path.join(data_dir, 'iperf_data*.csv')
    ]
    
    all_files = []
    for pattern in patterns:
        files = glob.glob(pattern)
        # Exclude the consolidated file itself
        files = [f for f in files if not f.endswith('iperf3_consolidated.csv')]
        all_files.extend(files)
    
    print(f"Found {len(all_files)} files to consolidate:")
    for f in sorted(all_files):
        print(f"  - {os.path.basename(f)}")
    
    if not all_files:
        print("No iperf CSV files found!")
        return
    
    all_records = []
    
    # Process each file based on its format
    for filepath in sorted(all_files):
        print(f"\nProcessing: {os.path.basename(filepath)}")
        
        # Skip empty files
        if os.path.getsize(filepath) == 0:
            print(f"  Skipping empty file: {filepath}")
            continue
        
        format_type = detect_format(filepath)
        print(f"  Detected format: {format_type}")
        
        records = read_csv_file(filepath, format_type)
        if records:
            all_records.extend(records)
            print(f"  Added {len(records)} records")
        else:
            print(f"  No valid data found in {filepath}")
    
    if not all_records:
        print("No valid data found in any files!")
        return
    
    print(f"\nTotal records before deduplication: {len(all_records)}")
    
    # Remove duplicates and sort
    seen = set()
    unique_records = []
    
    for record in all_records:
        # Create a key for deduplication
        key = (record.get('timestamp', ''), 
               record.get('devicename', ''), 
               record.get('iperf_direction', ''),
               record.get('iperf_throughput_mbps', ''))
        
        if key not in seen:
            seen.add(key)
            unique_records.append(record)
    
    print(f"Total records after deduplication: {len(unique_records)}")
    
    # Sort by timestamp
    try:
        unique_records.sort(key=lambda x: datetime.fromisoformat(x['timestamp'].replace('Z', '+00:00')) if x['timestamp'] else datetime.min)
    except:
        print("Warning: Could not sort by timestamp, keeping original order")
    
    # Write consolidated file
    output_cols = ['timestamp', 'ssid', 'bssid', 'signal_dbm', 'channel', 
                   'iperf3_server', 'iperf_direction', 'iperf_throughput_mbps',
                   'iperf_jitter_ms', 'iperf_loss_percent', 'packets', 
                   'lost_packets', 'lat', 'long', 'devicename']
    
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=output_cols)
        writer.writeheader()
        
        for record in unique_records:
            # Write only the standard columns (excluding source_file)
            row = {col: record.get(col, '') for col in output_cols}
            writer.writerow(row)
    
    print(f"\nConsolidation complete!")
    print(f"Output file: {output_file}")
    print(f"Total records: {len(unique_records)}")
    
    # Summary by date
    print(f"\nData summary by date:")
    date_counts = defaultdict(int)
    for record in unique_records:
        if record.get('timestamp'):
            try:
                date = record['timestamp'].split('T')[0]
                date_counts[date] += 1
            except:
                pass
    
    for date in sorted(date_counts.keys()):
        print(f"  {date}: {date_counts[date]} records")
    
    # Summary by devicename
    print(f"\nData summary by device:")
    device_counts = defaultdict(int)
    for record in unique_records:
        device = record.get('devicename', '') or 'unknown'
        device_counts[device] += 1
    
    # Sort devices, handling empty/None values
    sorted_devices = sorted([d for d in device_counts.keys() if d], key=str.lower)
    for device in sorted_devices:
        print(f"  {device}: {device_counts[device]} records")

if __name__ == '__main__':
    # Set up paths
    data_dir = '/home/berapp/WorkObsidianVault/Major Projects/LOWA/lowa/app/data'
    output_file = os.path.join(data_dir, 'iperf3_consolidated.csv')
    
    print("=== iPerf Data Consolidation Script ===")
    print(f"Data directory: {data_dir}")
    print(f"Output file: {output_file}")
    
    if not os.path.exists(data_dir):
        print(f"Error: Data directory not found: {data_dir}")
        sys.exit(1)
    
    # Run consolidation
    consolidate_iperf_files(data_dir, output_file)