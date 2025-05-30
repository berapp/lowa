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
SCRIPT_VERSION = "1.0.4-20250530201500"

# Frequency to channel mapping
def freq_to_channel(freq):
    if 2412 <= freq <= 2472:
        return (freq - 2412) // 5 + 1
    elif 5180 <= freq <= 5825:
        return (freq - 5180) // 5 + 36
    return 0  # Unknown

# Set relative data path with timestamped filename
output_dir = os.path.join(os.path.dirname(__file__), "../data")
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, f"wifi_speed_data_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv")

# Initialize CSV
with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "lat", "long", "ssid", "bssid", "signal_dbm", "channel", "channel_overlap", "connected_ssid", "connected_bssid", "connected_rssi", "site_number", "iperf_throughput_mbps", "iperf_jitter_ms", "iperf_loss_percent"])

# State variables
paused = False
running = True
triggered = False
site_number = "unknown"

def user_input_thread():
    global paused, running, triggered, site_number
    print("\nCommands: p (pause), r (resume), s (stop), n (set site number), t (trigger scan)")
    while running:
        try:
            cmd = input().strip().split()
            if not cmd:
                continue
            action = cmd[0].lower()
            if action == 'p' and not paused:
                paused = True
                print("Paused at site", site_number)
            elif action == 'r' and paused:
                paused = False
                print("Resumed scanning at site", site_number)
            elif action == 's':
                running = False
                print("Stopping scan...")
            elif action == 'n' and len(cmd) > 1:
                try:
                    n = int(cmd[1])
                    if 1 <= n <= 155:
                        site_number = str(n)
                        print(f"Set site number to {site_number}")
                    else:
                        print("Site number must be 1–155")
                except ValueError:
                    print("Invalid site number")
            elif action == 't':
                triggered = True
                print("Triggering scan...")
                try:
                    n = input("Enter site number (1–155, Enter to skip): ").strip()
                    if n:
                        n = int(n)
                        if 1 <= n <= 155:
                            site_number = str(n)
                            print(f"Set site number to {site_number}")
                        else:
                            print("Site number must be 1–155, keeping", site_number)
                except ValueError:
                    print("Invalid site number, keeping", site_number)
            else:
                print("Invalid. Use: p, r, s, n <1-155>, t")
        except EOFError:
            pass
        time.sleep(0.1)

# Start input thread
input_thread = threading.Thread(target=user_input_thread, daemon=True)
input_thread.start()

print(f"Starting LOWA WiFi and speed scan v{SCRIPT_VERSION}...")
print(f"Saving data to {output_file}")
print("Use 't' to trigger a scan at each site, 'n' to set site number")

while running:
    if paused or not triggered:
        time.sleep(1)
        continue
    try:
        timestamp = datetime.now().isoformat()
        print(f"\n[{timestamp}] New scan cycle at site {site_number}")

        # Get location
        print("Fetching GPS location...")
        loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
        lat, long = loc.get("latitude"), loc.get("longitude")
        print(f"Location: ({lat}, {long})")
        
        # Get connected AP
        print("Fetching connected AP...")
        conn_info = json.loads(subprocess.run(["termux-wifi-connectioninfo"], capture_output=True, text=True).stdout)
        connected_ssid = conn_info.get("ssid", "unknown")
        connected_bssid = conn_info.get("bssid", "unknown")
        connected_rssi = conn_info.get("rssi", 0)
        print(f"Connected AP: SSID={connected_ssid}, BSSID={connected_bssid}, RSSI={connected_rssi}")

        # Get WiFi scan
        print("Scanning WiFi networks...")
        wifi_raw = subprocess.run(["termux-wifi-scaninfo"], capture_output=True, text=True).stdout
        wifi = json.loads(wifi_raw)
        print(f"Found {len(wifi)} networks")

        # Calculate channel overlap
        channels = [freq_to_channel(network.get("frequency_mhz", 0)) for network in wifi if network.get("frequency_mhz")]
        channel_counts = Counter(channels)
        print("Channel overlap:", {f"Ch {ch}": count for ch, count in channel_counts.items() if ch != 0})

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
                ssid = network.get("ssid")
                rssi = network.get("rssi")
                freq = network.get("frequency_mhz")
                if not ssid or rssi is None or freq is None:
                    print(f"Skipping invalid network: {network}")
                    continue
                signal_dbm = int(rssi)
                channel = freq_to_channel(int(freq))
                channel_overlap = channel_counts.get(channel, 0)
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
                    site_number,
                    throughput_mbps,
                    jitter_ms,
                    loss_percent
                ])
                print(f"Saved: SSID={ssid}, signal_dbm={signal_dbm}, channel={channel}, overlap={channel_overlap}")
        print(".", end="", flush=True)
        triggered = False  # Wait for next trigger
        time.sleep(30)  # Allow time for 50 ft walk
    except Exception as e:
        print(f"\nError: {e}")
        triggered = False
        time.sleep(5)

print("\nScan complete. Data saved to", output_file)
sys.exit(0)