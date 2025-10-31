import json
import subprocess
import time
import csv
import os
import threading
import sys
from datetime import datetime
from collections import Counter

# Script version
SCRIPT_VERSION = "1.0.7-20250530201500"

# Frequency to channel mapping
def freq_to_channel(freq):
    if 2412 <= freq <= 2472:
        return (freq - 2412) // 5 + 1
    elif 5180 <= freq <= 5825:
        return (freq - 5180) // 5 + 36
    return 0

# Set relative data paths
output_dir = os.path.join(os.path.dirname(__file__), "../data")
os.makedirs(output_dir, exist_ok=True)
wifi_file = os.path.join(output_dir, f"wifi_speed_data_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv")
pole_file = os.path.join(output_dir, "pole_locations.csv")

# Initialize WiFi CSV
with open(wifi_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "lat", "long", "ssid", "bssid", "signal_dbm", "channel", "channel_overlap", "connected_ssid", "connected_bssid", "connected_rssi", "site_number", "iperf_direction", "iperf_throughput_mbps", "iperf_jitter_ms", "iperf_loss_percent"])

# Initialize Pole CSV
if not os.path.exists(pole_file):
    with open(pole_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "pole_id", "lat", "long"])

# State variables
paused = False
running = True
triggered = False
site_number = 1  # Start at 1

def user_input_thread():
    global paused, running, triggered, site_number
    while running:
        try:
            cmd = input().strip().split(maxsplit=1)
            if not cmd:
                continue
            action = cmd[0].lower()
            if action == 'p' and not paused:
                paused = True
                print(f"Paused at site {site_number}")
            elif action == 'r' and paused:
                paused = False
                print(f"Resumed at site {site_number}")
            elif action == 's':
                running = False
                print("Stopping...")
            elif action == 'n' and len(cmd) > 1:
                try:
                    n = int(cmd[1])
                    if 1 <= n <= 155:
                        site_number = n
                        print(f"Site {site_number} set")
                    else:
                        print("Site number must be 1–155")
                except ValueError:
                    print("Invalid site number")
            elif action == 't':
                triggered = True
                print("Triggering scan...")
                try:
                    n = input(f"Enter site number (1–155, Enter for {site_number}): ").strip()
                    if n:
                        n = int(n)
                        if 1 <= n <= 155:
                            site_number = n
                            print(f"Site {site_number} set")
                        else:
                            print(f"Site number must be 1–155, using {site_number}")
                    else:
                        print(f"Using site {site_number}")
                except ValueError:
                    print(f"Invalid site number, using {site_number}")
            elif action == 'l' and len(cmd) > 1:
                pole_id = cmd[1].strip()
                if pole_id:
                    try:
                        loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
                        lat, long = loc.get("latitude"), loc.get("longitude")
                        timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
                        with open(pole_file, 'a', newline='') as f:
                            writer = csv.writer(f)
                            writer.writerow([timestamp, pole_id, lat, long])
                        print(f"Pole {pole_id} logged at ({lat}, {long})")
                    except Exception as e:
                        print(f"Error logging pole: {e}")
                else:
                    print("Pole ID cannot be empty")
            else:
                print("Invalid. Use: p (pause), r (resume), s (stop), n <1-155>, t (trigger), l <pole_id>")
        except EOFError:
            pass
        time.sleep(0.1)

# Start input thread
input_thread = threading.Thread(target=user_input_thread, daemon=True)
input_thread.start()

print(f"LOWA WiFi scan v{SCRIPT_VERSION}")
print(f"WiFi data to {wifi_file}")
print(f"Pole data to {pole_file}")
print("Commands: t (trigger scan), n <1-155> (site number), l <pole_id> (log pole), p (pause), r (resume), s (stop)")

while running:
    if paused or not triggered:
        time.sleep(1)
        continue
    try:
        timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        
        # Get location
        loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
        lat, long = loc.get("latitude"), loc.get("longitude")
        
        # Get connected AP
        conn_info = json.loads(subprocess.run(["termux-wifi-connectioninfo"], capture_output=True, text=True).stdout)
        connected_ssid = conn_info.get("ssid", "unknown")
        connected_bssid = conn_info.get("bssid", "unknown")
        connected_rssi = conn_info.get("rssi", 0)

        # Get WiFi scan
        wifi = json.loads(subprocess.run(["termux-wifi-scaninfo"], capture_output=True, text=True).stdout)

        # Calculate channel overlap
        channels = [freq_to_channel(network.get("frequency_mhz", 0)) for network in wifi if network.get("frequency_mhz")]
        channel_counts = Counter(channels)

        # Run iperf3 tests
        results = []
        for direction, flag in [("download", "-R"), ("upload", "")]:
            iperf_cmd = ["iperf3", "-c", "192.168.10.242", "-t", "10", "-P", "4", flag, "--json"]
            iperf_result = json.loads(subprocess.run(iperf_cmd, capture_output=True, text=True).stdout)
            end = iperf_result.get("end", {})
            sum_data = end.get("sum") or end.get("sum_received") or end.get("sum_sent") or {}
            throughput_mbps = sum_data.get("bits_per_second", 0) / 1e6
            jitter_ms = sum_data.get("jitter_ms", 0)
            loss_percent = sum_data.get("lost_percent", 0)
            results.append((direction, throughput_mbps, jitter_ms, loss_percent))

        # Save to WiFi CSV
        with open(wifi_file, 'a', newline='') as f:
            writer = csv.writer(f)
            for network in wifi:
                ssid = network.get("ssid")
                rssi = network.get("rssi")
                freq = network.get("frequency_mhz")
                if not ssid or rssi is None or freq is None:
                    continue
                signal_dbm = int(rssi)
                channel = freq_to_channel(int(freq))
                channel_overlap = channel_counts.get(channel, 0)
                for direction, throughput_mbps, jitter_ms, loss_percent in results:
                    writer.writerow([
                        timestamp,
                        lat,
                        long,
                        ssid,
                        network.get("bssid"),
                        signal_dbm,
                        channel,
                        channel_overlap,
                        connected_ssid,
                        connected_bssid,
                        connected_rssi,
                        str(site_number),
                        direction,
                        throughput_mbps,
                        jitter_ms,
                        loss_percent
                    ])

        # Print summary
        dl_throughput = results[0][1]
        ul_throughput = results[1][1]
        print(f"[{timestamp}] Site {site_number}: RSSI={connected_rssi}, DL={dl_throughput:.2f} Mbps, UL={ul_throughput:.2f} Mbps")
        print(".", end="", flush=True)
        site_number = min(site_number + 1, 155)  # Auto-increment
        triggered = False
        time.sleep(35)
    except Exception as e:
        print(f"\nError: {e}")
        triggered = False
        time.sleep(5)

print("\nScan complete. WiFi data saved to", wifi_file)
print("Pole data saved to", pole_file)
sys.exit(0)