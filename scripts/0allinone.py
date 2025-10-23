import serial
import time
import csv
from datetime import datetime, timezone
import pynmea2
import subprocess
import json
import re
import os
import argparse

SERIAL_PORT = '/dev/ttyACM0'  # Adjust to '/dev/ttyUSB0' if needed
BAUD_RATE = 115200

# WiFi interface name (adjust if needed)
WIFI_INTERFACE = 'wlan0'

CLUBHOUSE = '192.168.10.242'
LAUNDRY1 = '192.168.10.94'
LAUNDRY2 = '192.168.10.152'
POLELAPTOP = '192.168.11.156'
APLAPTOP = '192.168.10.156'
#IPERF_SERVER = '192.168.42.213'
IPERF_PORT = 5201  # Default iperf3 port

lat = None
lon = None
alt = None
acc = None
v_acc = None
bearing = None
speed = None
elapsed = None
provider = 'gps'
ts = None
USE_UDP = False
UDP_BANDWIDTH = None
SKIP_GPS = False

def ensure_csv_header(path, header):
    """Ensure the CSV file has a header row.

    Behavior:
    - If the file does not exist or is empty, write the header.
    - If the file exists and the first line already looks like a header (contains the header keywords), do nothing.
    - Otherwise, create a temp file containing the header followed by the original contents, then atomically replace the original file.
    """
    try:
        # If file missing or empty -> write header and return
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            with open(path, 'a', newline='') as f:
                w = csv.writer(f)
                w.writerow(header)
            return

        # Read the first non-empty line to see if a header is present
        first_line = ''
        with open(path, 'r', newline='') as f:
            for line in f:
                if line.strip() != '':
                    first_line = line.strip()
                    break

        # If first line already contains header keywords, assume header present
        first_lower = first_line.lower()
        header_keywords = [h.lower() for h in header]
        if all(any(kw in first_lower for kw in [hk]) for hk in header_keywords if hk):
            return

        # Otherwise, insert header by creating a temp file in the same directory then replacing atomically
        import tempfile
        dirpath = os.path.dirname(path) or '.'
        tf = tempfile.NamedTemporaryFile('w', delete=False, dir=dirpath, newline='')
        try:
            w = csv.writer(tf)
            w.writerow(header)
            # copy original contents
            with open(path, 'r', newline='') as orig:
                for line in orig:
                    tf.write(line)
        finally:
            tf.close()
        os.replace(tf.name, path)
    except Exception as e:
        print(f"Warning: failed to ensure header in {path}: {e}")

def freq_to_channel(freq):
    """Convert frequency in MHz to WiFi channel."""
    try:
        f = int(freq)
        if 2400 <= f <= 2499:
            return (f - 2407) // 5
        elif 5000 <= f <= 5999:
            return (f - 5000) // 5 + 1
        else:
            return None
    except ValueError:
        return None

def run_wifi_scan():
    """Run iw scan and return parsed networks."""
    print("Starting scan now!          ")
    try:
        result = subprocess.run(['iw', 'dev', WIFI_INTERFACE, 'scan'], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"Scan failed: {result.stderr}\n")
            return []

        # Ensure we have current GPS data
        if not SKIP_GPS:
            get_gps_data()

        lines = result.stdout.split('\n')
        networks = []
        current_bssid = None
        current_ssid = None
        current_signal = None
        current_freq = None
        
        for line in lines:
            line = line.strip()
            if line.startswith('BSS '):
                if current_bssid:
                    if current_ssid and current_signal and current_freq:
                        channel = freq_to_channel(current_freq)
                        networks.append({
                            'bssid': current_bssid,
                            'ssid': current_ssid,
                            'signal_dbm': current_signal,
                            'frequency': current_freq,
                            'channel': channel
                        })
                current_bssid = re.search(r'BSS ([0-9a-f:]{17})', line).group(1) if re.search(r'BSS ([0-9a-f:]{17})', line) else None
                current_ssid = None
                current_signal = None
                current_freq = None
            elif 'freq:' in line and current_bssid:
                current_freq = re.search(r'freq: (\d+)', line).group(1)
            elif 'signal:' in line and current_bssid:
                current_signal = re.search(r'signal: (-?\d+)', line).group(1)
            elif line.startswith('SSID:') and current_bssid:
                current_ssid = line[5:].strip().rstrip('"').lstrip('"')
        
        # Add last network
        if current_bssid and current_ssid and current_signal and current_freq:
            channel = freq_to_channel(current_freq)
            networks.append({
                'bssid': current_bssid,
                'ssid': current_ssid,
                'signal_dbm': current_signal,
                'frequency': current_freq,
                'channel': channel
            })
        
        return networks
    except Exception as e:
        print(f"Error in scan: {e}\n")
        return []

def countdown(secs, msg):
    for i in range(secs, 0, -1):
        print(f"{msg} in {i} seconds...", end='\r')
        time.sleep(1)
    print(' ' * 50, end='\r')  # Clear line
    print("\n")

def countdown_beeps(seconds):
    for i in range(seconds, 0, -1):
        print(f"{i}")
        print('\a', end='', flush=True)  # Short beep via bell
        time.sleep(1)
    print("Time's up!")
    print('\a')  # Final beep

def get_gps_data():
    global lat, lon, alt, acc, v_acc, bearing, speed, elapsed, provider, ts
    lat = None
    lon = None
    alt = None
    acc = None
    v_acc = None
    bearing = None
    speed = None
    elapsed = None
    # If SKIP_GPS is set, return empty strings for lat/lon so CSV fields remain consistent
    if SKIP_GPS:
        lat = ''
        lon = ''
        ts = datetime.now(timezone.utc).isoformat()
        return

    # Try to open the serial port safely; if it fails, set lat/lon to empty strings and continue
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    except Exception as e:
        print(f"Warning: could not open serial port {SERIAL_PORT}: {e}")
        lat = ''
        lon = ''
        ts = datetime.now(timezone.utc).isoformat()
        return

    ts = datetime.now(timezone.utc).isoformat()

    # Read NMEA sentences until we have a valid fix
    try:
        attempts = 0
        while ((lat is None or lat == 0) or (lon is None or lon == 0)) and attempts < 30:
            attempts += 1
            print("Waiting for valid GPS data...")
            try:
                line = ser.readline().decode('ascii', errors='replace').strip()
                if line.startswith('$GPGGA') or line.startswith('$GPRMC'):
                    msg = pynmea2.parse(line)
                    if hasattr(msg, 'latitude') and msg.latitude not in (None, 0):
                        lat = msg.latitude
                        lon = msg.longitude
                        alt = msg.altitude if hasattr(msg, 'altitude') else None
                        bearing = msg.true_course if hasattr(msg, 'true_course') else None
                        speed = msg.spd_over_grnd if hasattr(msg, 'spd_over_grnd') else None
                        elapsed = int(time.time() * 1000) % 1000
                        provider = 'gps'
                        break
            except Exception as e:
                print(f"Error parsing NMEA data: {e}")
                # continue to next attempt
        # If we failed to get a fix, fall back to empty strings instead of blocking
        if lat in (None, 0) or lon in (None, 0):
            print("No valid GPS fix obtained; writing empty lat/lon.")
            lat = ''
            lon = ''
    finally:
        try:
            ser.close()
        except Exception:
            pass
    print(f"Lat: {lat}, Lon: {lon}\n")


def run_iperf_test(direction):
    global ts
    """Run iperf3 test and return throughput, jitter, and loss."""
    ts = datetime.now(timezone.utc).isoformat()
    # Only attempt to get GPS data if not explicitly skipped
    if not SKIP_GPS:
        get_gps_data()
    print(f"Running iperf3 in {direction}\n")
    try:
        # iperf3 -c {server_ip} -P 4 -t 10 {reverse_flag}
        server = globals().get('IPERF_SERVER', CLUBHOUSE)
        cmd = ['iperf3', '-c', server, '-p', str(IPERF_PORT), '-i', '0', '-J', '-P', '4']
        if USE_UDP:
            cmd.append('-u')
            if UDP_BANDWIDTH:
                # iperf3 expects bandwidth like '10M'
                cmd.extend(['-b', str(UDP_BANDWIDTH)])
        if direction == 'upload':
            cmd.append('-R')  # Reverse for upload (client sends)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"iperf3 {direction} failed: {result.stderr}\n")
            # Return five Nones to match callers expecting (throughput, jitter, loss, packets, lost_packets)
            return None, None, None, None, None
        
        data = json.loads(result.stdout)
        # Parse JSON for TCP or UDP results
        end = data.get('end', {})
        if USE_UDP:
            # UDP reports may be under 'sum' or 'sum_received'
            sum_data = end.get('sum', {}) or end.get('sum_received', {}) or end.get('sum_sent', {})
        else:
            sum_data = end.get('sum_sent', {}) or end.get('sum', {})

        throughput = sum_data.get('bits_per_second', 0) / 1_000_000  # Mbps
        jitter = sum_data.get('jitter_ms', None)
        loss = sum_data.get('lost_percent', 0)

        # UDP-specific packet counts (best-effort, fields vary by iperf3 version)
        packets = None
        lost_packets = None
        # try common keys
        if isinstance(sum_data, dict):
            packets = sum_data.get('packets') or sum_data.get('packets_sent') or sum_data.get('packets_received')
            lost_packets = sum_data.get('lost_packets') or sum_data.get('lost') or sum_data.get('lost_packets_recv')

        return throughput, jitter, loss, packets, lost_packets
    except Exception as e:
        print(f"Error in iperf3 {direction}: {e}\n")
        return None, None, None, None, None

def get_current_ssid_bssid():
    global ts
    """Get current connected SSID and BSSID."""
    try:
        result = subprocess.run(['iw', 'dev', WIFI_INTERFACE, 'link'], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return None, None, None, None
        ssid = None
        bssid = None
        rssi = None
        freq = None
        for line in result.stdout.split('\n'):
            if 'Connected to' in line:
                bssid = line.split('Connected to ')[1].split(' ')[0]
            if 'SSID:' in line:
                ssid = line.split('SSID: ')[1].strip()
            if 'signal:' in line:
                rssi = line.split('signal: ')[1].split(' ')[0]
            if 'freq:' in line:
                freq = re.search(r'freq: (\d+)', line).group(1)
        channel = freq_to_channel(freq) if freq else None
        return ssid, bssid, rssi, channel
    except Exception as e:
        print(f"Error getting SSID/BSSID: {e}\n")
        return None, None, None, None

def main():
    # parse command-line args
    parser = argparse.ArgumentParser(description='All-in-one WiFi scanner + iperf runner')
    parser.add_argument('--once', action='store_true', help='Run one scan+iperf cycle and exit')
    # --udp may be provided as a flag or with an optional bandwidth value.
    # Examples:
    #   --udp           -> enable UDP, use --udp-bandwidth if provided
    #   --udp 10M       -> enable UDP with 10M
    #   --udp 0         -> enable UDP with bandwidth '0' (user intends unlimited)
    parser.add_argument('--udp', nargs='?', const='', default=None,
                        help="Enable UDP mode; optional bandwidth value (e.g. '10M'). Use '0' for unlimited.")
    parser.add_argument('--udp-bandwidth', type=str, default=None, help="UDP bandwidth for iperf3 (e.g. '10M')")
    parser.add_argument('--skip-gps', action='store_true', help='Skip obtaining GPS fixes (do not call get_gps_data)')
    parser.add_argument('-s', '--iperf-server', type=str, default=None, help='IP or hostname of iperf3 server (overrides default)')
    args = parser.parse_args()
    once = args.once
    global USE_UDP, UDP_BANDWIDTH
    global IPERF_SERVER, SKIP_GPS
    if args.udp is None:
        # --udp not provided
        USE_UDP = False
        UDP_BANDWIDTH = args.udp_bandwidth
    else:
        # --udp provided (possibly with a value). If args.udp == '' then no inline value was given.
        USE_UDP = True
        if args.udp != '':
            # explicit value passed to --udp (could be '0')
            UDP_BANDWIDTH = args.udp
        else:
            # --udp passed without value; fall back to --udp-bandwidth if provided
            UDP_BANDWIDTH = args.udp_bandwidth
        SKIP_GPS = bool(args.skip_gps)

    # Set IPERF_SERVER early so run_iperf_test can use it
    if args.iperf_server:
        IPERF_SERVER = args.iperf_server
    else:
        # default to CLUBHOUSE if not overridden
        IPERF_SERVER = CLUBHOUSE

    # Load APS data
    with open('../app/data/aps.json', 'r') as f:
        aps_data = json.load(f)
    bssid_to_name = {}
    for ap in aps_data:
        if ap.get('bssid_24'):
            bssid_to_name[ap['bssid_24']] = ap['devicename']
        if ap.get('bssid_5'):
            bssid_to_name[ap['bssid_5']] = ap['devicename']
        if ap.get('bssid_guest24'):
            bssid_to_name[ap['bssid_guest24']] = ap['devicename']
        if ap.get('bssid_guest5'):
            bssid_to_name[ap['bssid_guest5']] = ap['devicename']

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    filename = f'../app/data/signal_data_{today}.csv'
    filename_iperf3 = f'../app/data/iperf3_data_{today}.csv'

    # Ensure CSV headers exist so client-side parsers see consistent fields
    ensure_csv_header(filename, ['timestamp', 'lat', 'long', 'bssid', 'signal_dbm', 'frequency', 'channel', 'ssid', 'devicename'])
    ensure_csv_header(filename_iperf3, ['timestamp', 'ssid', 'bssid', 'signal_dbm', 'channel', 'iperf3_server', 'iperf_direction', 'iperf_throughput_mbps', 'iperf_jitter_ms', 'iperf_loss_percent', 'packets', 'lost_packets', 'lat', 'long', 'devicename'])
    
    while True:
        for i in range(4, 0, -1):
            get_gps_data()
            print(f"Scanning for WiFi networks...\n")
            networks = run_wifi_scan()
        
            # sort networks by numeric signal strength descending (strongest first)
            def _signal_key(n):
                try:
                    return int(n.get('signal_dbm'))
                except Exception:
                    return -999

            networks_sorted = sorted(networks, key=_signal_key, reverse=True)

            with open(filename, 'a', newline='') as csvfile:
                writer = csv.writer(csvfile)
                for net in networks_sorted:
                    devicename = bssid_to_name.get(net['bssid'], 'Unknown')
                    writer.writerow([ts, lat, lon, net['bssid'], net['signal_dbm'], net['frequency'], net['channel'], net['ssid'], devicename])
                    csvfile.flush()
                    print(f"Device: {devicename}, Signal: {net['signal_dbm']} dBm, Freq: {net['frequency']} MHz, Channel: {net['channel']}, SSID: {net['ssid']}")
            
            ssid, bssid, rssi, channel = get_current_ssid_bssid()
            devicename = bssid_to_name.get(bssid, 'Unknown')
            countdown(5, "Starting scan")  # Short countdown before iperf tests
        countdown(2, "Starting upload test")  # Short countdown before iperf tests
        print(f"\n\nCurrent connection - Device: {devicename}, Channel: {channel}, RSSI: {rssi}, SSID: {ssid}, BSSID: {bssid}\n")
        ts = datetime.now(timezone.utc).isoformat()
        # Run upload test
        up_throughput, up_jitter, up_loss, up_packets, up_lost = run_iperf_test('upload')
        if up_throughput is not None:
            ts = datetime.now(timezone.utc).isoformat()
            with open(filename_iperf3, 'a', newline='') as csvfile_iperf3:
                writer_iperf3 = csv.writer(csvfile_iperf3)
                server = globals().get('IPERF_SERVER', CLUBHOUSE)
                writer_iperf3.writerow([ts, ssid, bssid, rssi, channel, server, 'upload', up_throughput, up_jitter, up_loss, up_packets, up_lost, lat, lon, devicename])
                csvfile_iperf3.flush()
            print(f"Device: {devicename}, RSSI: {rssi}, Channel: {channel}, Throughput: {up_throughput:.2f} Mbps, Server: {CLUBHOUSE}, Direction: upload, Jitter: {up_jitter if up_jitter is not None else 'N/A'} ms, Loss: {up_loss:.2f}%\n")
        countdown(2, "Starting download test")  # Short countdown before next test
        # Run download test
        down_throughput, down_jitter, down_loss, down_packets, down_lost = run_iperf_test('download')
        if down_throughput is not None:
            ts = datetime.now(timezone.utc).isoformat()
            with open(filename_iperf3, 'a', newline='') as csvfile_iperf3:
                writer_iperf3 = csv.writer(csvfile_iperf3)
                server = globals().get('IPERF_SERVER', CLUBHOUSE)
                writer_iperf3.writerow([ts, ssid, bssid, rssi, channel, server, 'download', down_throughput, down_jitter, down_loss, down_packets, down_lost, lat, lon, devicename])
                csvfile_iperf3.flush()
            print(f"Device: {devicename}, RSSI: {rssi}, Channel: {channel}, Throughput: {down_throughput:.2f} Mbps, Server: {CLUBHOUSE}, Direction: download, Jitter: {down_jitter if down_jitter is not None else 'N/A'} ms, Loss: {down_loss:.2f}%\n")
                
        countdown(2, "Starting scan")  # Countdown before next scan

        # if --once was specified, exit after completing one full cycle
        if once:
            print("--once flag set, exiting after one cycle.")
            return

if __name__ == "__main__":
    main()