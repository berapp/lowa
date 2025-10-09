import serial
import time
import csv
from datetime import datetime, timezone
import pynmea2
import subprocess
import json
import re

SERIAL_PORT = '/dev/ttyACM0'  # Adjust to '/dev/ttyUSB0' if needed
BAUD_RATE = 115200

# WiFi interface name (adjust if needed)
WIFI_INTERFACE = 'wlan4'

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

def run_wifi_scan():
    """Run iw scan and return parsed networks."""
    print("Starting scan now!          ")
    try:
        result = subprocess.run(['iw', 'dev', WIFI_INTERFACE, 'scan'], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"Scan failed: {result.stderr}")
            return []
        
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
                        networks.append({
                            'bssid': current_bssid,
                            'ssid': current_ssid,
                            'signal_dbm': current_signal,
                            'frequency': current_freq
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
            networks.append({
                'bssid': current_bssid,
                'ssid': current_ssid,
                'signal_dbm': current_signal,
                'frequency': current_freq
            })
        
        return networks
    except Exception as e:
        print(f"Error in scan: {e}")
        return []

def countdown(secs):
    for i in range(secs, 0, -1):
        print(f"Starting scan in {i} seconds...", end='\r')
        time.sleep(1)

def get_gps_data():
    global lat, lon, alt, acc, v_acc, bearing, speed, elapsed, provider
    lat = None
    lon = None
    alt = None
    acc = None
    v_acc = None
    bearing = None
    speed = None
    elapsed = None

    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)

    try:
        line = ser.readline().decode('ascii', errors='replace').strip()
        if line.startswith('$GPGGA') or line.startswith('$GPRMC'):
            msg = pynmea2.parse(line)
            if hasattr(msg, 'latitude') and msg.latitude != 0:
                lat = msg.latitude
                lon = msg.longitude
                alt = msg.altitude if hasattr(msg, 'altitude') else None
                bearing = msg.true_course if hasattr(msg, 'true_course') else None
                speed = msg.spd_over_grnd if hasattr(msg, 'spd_over_grnd') else None
                elapsed = int(time.time() * 1000) % 1000
                provider = 'gps'
                
                # Echo coordinates to screen (ts from main)
        # time.sleep(0.1)
    except Exception as e:
        print(f"Error: {e}")
        # time.sleep(1)

def run_iperf_test(direction):
    """Run iperf3 test and return throughput, jitter, and loss."""
    print(f"Running iperf3 in {direction}")
    try:
        # iperf3 -c {server_ip} -P 4 -t 10 {reverse_flag}
        cmd = ['iperf3', '-c', CLUBHOUSE, '-p', str(IPERF_PORT), '-i', '0', '-J', '-P', '4']
        if direction == 'upload':
            cmd.append('-R')  # Reverse for upload (client sends)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"iperf3 {direction} failed: {result.stderr}")
            return None, None, None
        
        data = json.loads(result.stdout)
        # Use sum_sent for both upload and download in TCP mode
        sum_data = data.get('end', {}).get('sum_sent', {})
        throughput = sum_data.get('bits_per_second', 0) / 1_000_000  # Mbps
        jitter = sum_data.get('jitter_ms', None)  # None for TCP
        loss = sum_data.get('lost_percent', 0)  # Default to 0 if not present
        
        return throughput, jitter, loss
    except Exception as e:
        print(f"Error in iperf3 {direction}: {e}")
        return None, None, None

def get_current_ssid_bssid():
    """Get current connected SSID and BSSID."""
    try:
        result = subprocess.run(['iw', 'dev', WIFI_INTERFACE, 'link'], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return None, None, None
        ssid = None
        bssid = None
        rssi = None
        for line in result.stdout.split('\n'):
            if 'Connected to' in line:
                bssid = line.split('Connected to ')[1].split(' ')[0]
            if 'SSID:' in line:
                ssid = line.split('SSID: ')[1].strip()
            if 'signal:' in line:
                rssi = line.split('signal: ')[1].split(' ')[0]
        return ssid, bssid, rssi
    except Exception as e:
        print(f"Error getting SSID/BSSID: {e}")
        return None, None, None

def main():
    global ts  # Make ts global for get_gps_data

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    filename = f'allinone_data_{ts}.csv'
    filename_iperf3 = f'allinone_data_iperf3_{ts}.csv'
    
    while True:
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        with open(filename, 'a', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['timestamp', 'lat', 'long', 'bssid', 'signal_dbm', 'frequency', 'ssid'])
            
            get_gps_data()
            ts = datetime.now(timezone.utc).isoformat()  # Update ts here for print in get_gps_data next loop
            print(f"Time: {ts}, Lat: {lat}, Lon: {lon}, Alt: {alt}")

            
            networks = run_wifi_scan()
            
            for net in networks:
                writer.writerow([ts, lat, lon, net['bssid'], net['signal_dbm'], net['frequency'], net['ssid']])
                csvfile.flush()
                print(f"Time: {ts}, BSSID: {net['bssid']}, Signal: {net['signal_dbm']} dBm, Freq: {net['frequency']} MHz, SSID: {net['ssid']}")
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        with open(filename_iperf3, 'a', newline='') as csvfile_iperf3:
            writer_iperf3 = csv.writer(csvfile_iperf3)
            writer_iperf3.writerow(['timestamp', 'ssid', 'bssid', 'signal_dbm', 'iperf3_server', 'iperf_direction', 'iperf_throughput_mbps', 'iperf_jitter_ms', 'iperf_loss_percent', 'lat', 'long'])
            
            ts = datetime.now(timezone.utc).isoformat()
            ssid, bssid, rssi = get_current_ssid_bssid()
            
            # Run upload test
            up_throughput, up_jitter, up_loss = run_iperf_test('upload')
            if up_throughput is not None:
                ts = datetime.now(timezone.utc).isoformat()
                writer_iperf3.writerow([ts, ssid, bssid, rssi, CLUBHOUSE, 'upload', up_throughput, up_jitter, up_loss, lat, lon])
                print(f"Time: {ts}, SSID: {ssid}, BSSID: {bssid}, RSSI: {rssi}, Server: {CLUBHOUSE}, Direction: upload, Throughput: {up_throughput:.2f} Mbps, Jitter: {up_jitter if up_jitter is not None else 'N/A'} ms, Loss: {up_loss:.2f}%")
            
            # Run download test
            down_throughput, down_jitter, down_loss = run_iperf_test('download')
            if down_throughput is not None:
                ts = datetime.now(timezone.utc).isoformat()
                writer_iperf3.writerow([ts, ssid, bssid, rssi, CLUBHOUSE, 'download', down_throughput, down_jitter, down_loss, lat, lon])
                print(f"Time: {ts}, SSID: {ssid}, BSSID: {bssid}, RSSI: {rssi}, Server: {CLUBHOUSE}, Direction: download, Throughput: {down_throughput:.2f} Mbps, Jitter: {down_jitter if down_jitter is not None else 'N/A'} ms, Loss: {down_loss:.2f}%")
                
                csvfile_iperf3.flush()
                
        countdown(10)  # Countdown before next scan

if __name__ == "__main__":
    main()