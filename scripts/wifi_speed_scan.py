import json
import subprocess
import time
import csv
import os
from datetime import datetime

# Set relative data path
output_dir = os.path.join(os.path.dirname(__file__), "../data")
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, "wifi_speed_data.csv")

# Initialize CSV
with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "lat", "long", "ssid", "bssid", "signal_dbm", "channel", "iperf_throughput_mbps", "iperf_jitter_ms", "iperf_loss_percent"])

while True:
    try:
        # Get location
        loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
        lat, long = loc.get("latitude"), loc.get("longitude")
        
        # Get WiFi scan
        wifi = json.loads(subprocess.run(["termux-wifi-scaninfo"], capture_output=True, text=True).stdout)
        
        # Run iperf3 test (10s, TCP, 4 streams, reverse mode)
        iperf_cmd = ["iperf3", "-c", "192.168.10.242", "-t", "10", "-P", "4", "-R", "--json"]
        iperf_result = json.loads(subprocess.run(iperf_cmd, capture_output=True, text=True).stdout)
        
        # Extract iperf3 metrics (handle varying JSON structure)
        end = iperf_result.get("end", {})
        sum_data = end.get("sum") or end.get("sum_received") or end.get("sum_sent") or {}
        throughput_mbps = sum_data.get("bits_per_second", 0) / 1e6
        jitter_ms = sum_data.get("jitter_ms", 0)
        loss_percent = sum_data.get("lost_percent", 0)

        with open(output_file, 'a', newline='') as f:
            writer = csv.writer(f)
            for network in wifi:
                writer.writerow([
                    datetime.now().isoformat(),
                    lat,
                    long,
                    network.get("ssid"),
                    network.get("bssid"),
                    network.get("level"),
                    network.get("channel"),
                    throughput_mbps,
                    jitter_ms,
                    loss_percent
                ])
        time.sleep(15)  # Scan every 15s
    except Exception as e:
        print(f"Error: {e}")
        time.sleep(5)