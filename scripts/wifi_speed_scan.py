import json
import subprocess
import time
import csv
import os
import threading
import sys
from datetime import datetime

# Set relative data path
output_dir = os.path.join(os.path.dirname(__file__), "../data")
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, "wifi_speed_data.csv")

# Initialize CSV
with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "lat", "long", "ssid", "bssid", "signal_dbm", "channel", "iperf_throughput_mbps", "iperf_jitter_ms", "iperf_loss_percent"])

# State variables
paused = False
running = True

def user_input_thread():
    global paused, running
    print("\nCommands: p (pause), r (resume), s (stop)")
    while running:
        try:
            cmd = input().strip().lower()
            if cmd == 'p' and not paused:
                paused = True
                print("Paused. Enter 'r' to resume or 's' to stop.")
            elif cmd == 'r' and paused:
                paused = False
                print("Resumed scanning.")
            elif cmd == 's':
                running = False
                print("Stopping scan...")
            else:
                print("Invalid command. Use: p (pause), r (resume), s (stop)")
        except EOFError:
            pass
        time.sleep(0.1)

# Start input thread
input_thread = threading.Thread(target=user_input_thread, daemon=True)
input_thread.start()

print("Starting LOWA WiFi and speed scan...")

while running:
    if paused:
        time.sleep(1)
        continue
    try:
        timestamp = datetime.now().isoformat()
        print(f"\n[{timestamp}] New scan cycle")

        # Get location
        print("Fetching GPS location...")
        loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
        lat, long = loc.get("latitude"), loc.get("longitude")
        print(f"Location: ({lat}, {long})")
        
        # Get WiFi scan
        print("Scanning WiFi networks...")
        wifi = json.loads(subprocess.run(["termux-wifi-scaninfo"], capture_output=True, text=True).stdout)
        print(f"Found {len(wifi)} networks")
        
        # Run iperf3 test (10s, TCP, 4 streams, reverse mode)
        print("Running iperf3 test (4 streams, reverse) to 192.168.10.242...")
        iperf_cmd = ["iperf3", "-c", "192.168.10.242", "-t", "10", "-P", "4", "-R", "--json"]
        iperf_result = json.loads(subprocess.run(iperf_cmd, capture_output=True, text=True).stdout)
        
        # Extract iperf3 metrics
        end = iperf_result.get("end", {})
        sum_data = end.get("sum") or end.get("sum_received") or end.get("sum_sent") or {}
        throughput_mbps = sum_data.get("bits_per_second", 0) / 1e6
        jitter_ms = sum_data.get("jitter_ms", 0)
        loss_percent = sum_data.get("lost_percent", 0)
        print(f"iperf3: {throughput_mbps:.2f} Mbps, {jitter_ms:.2f} ms jitter, {loss_percent:.2f}% loss")

        # Save to CSV
        with open(output_file, 'a', newline='') as f:
            writer = csv.writer(f)
            for network in wifi:
                writer.writerow([
                    timestamp,
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
        print(".", end="", flush=True)  # Progress dot
        time.sleep(15)  # Scan every 15s
    except Exception as e:
        print(f"\nError: {e}")
        time.sleep(5)

print("\nScan complete. Data saved to", output_file)
sys.exit(0)