)import time
import csv
from datetime import datetime, timezone
import subprocess
import json
import os
import argparse
import socket

CLUBHOUSE = '192.168.10.242'
IPERF_PORT = 5201  # Default iperf3 port

ts = None


def countdown(secs, msg):
    for i in range(secs, 0, -1):
        print(f"{msg} in {i} seconds...", end='\r')
        time.sleep(1)
    print(' ' * 50, end='\r')  # Clear line
    print("\n")


def run_iperf_test(direction, server=CLUBHOUSE):
    global ts
    """Run iperf3 test and return throughput, jitter, and loss."""
    ts = datetime.now(timezone.utc).isoformat()
    print(f"Running iperf3 {direction} against {server}\n")
    try:
        cmd = ['iperf3', '-c', server, '-p', str(IPERF_PORT), '-i', '0', '-J', '-P', '4']
        if direction == 'upload':
            cmd.append('-R')  # Reverse for upload (client sends)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"iperf3 {direction} failed: {result.stderr}\n")
            return None, None, None

        data = json.loads(result.stdout)
        # Prefer sum_sent for upload (client->server) and sum_received if present for download
        end = data.get('end', {})
        if direction == 'upload':
            sum_data = end.get('sum_sent', {})
        else:
            # for download (server->client) some iperf JSON uses sum_received
            sum_data = end.get('sum_received', {}) or end.get('sum_sent', {})

        throughput = sum_data.get('bits_per_second', 0) / 1_000_000  # Mbps
        jitter = sum_data.get('jitter_ms', None)
        loss = sum_data.get('lost_percent', 0)
        return throughput, jitter, loss
    except Exception as e:
        print(f"Error in iperf3 {direction}: {e}\n")
        return None, None, None


def main():
    parser = argparse.ArgumentParser(description='Run iperf3 upload/download and log results')
    parser.add_argument('-d', '--devicename', help='Device name to record in CSV', default=socket.gethostname())
    parser.add_argument('-s', '--server', help='iperf3 server IP', default=CLUBHOUSE)
    args = parser.parse_args()
    devicename = args.devicename
    server = args.server

    filename = 'bridge_data.csv'
    # Write headers if file is new/empty
    file_is_new = not os.path.exists(filename) or os.path.getsize(filename) == 0
    if file_is_new:
        with open(filename, 'a', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['timestamp', 'server', 'direction', 'throughput_mbps', 'jitter_ms', 'loss_percent', 'devicename'])
            csvfile.flush()

    # Upload test
    ts = datetime.now(timezone.utc).isoformat()
    up_throughput, up_jitter, up_loss = run_iperf_test('upload', server=server)
    if up_throughput is not None:
        ts = datetime.now(timezone.utc).isoformat()
        with open(filename, 'a', newline='') as csvfile_iperf3:
            writer_iperf3 = csv.writer(csvfile_iperf3)
            writer_iperf3.writerow([ts, server, 'upload', up_throughput, up_jitter, up_loss, devicename])
            csvfile_iperf3.flush()
        print(f"Device: {devicename}, Upload: {up_throughput:.2f} Mbps, Jitter: {up_jitter if up_jitter is not None else 'N/A'} ms, Loss: {up_loss:.2f}%")

    countdown(2, "Starting download test")

    # Download test
    down_throughput, down_jitter, down_loss = run_iperf_test('download', server=server)
    if down_throughput is not None:
        ts = datetime.now(timezone.utc).isoformat()
        with open(filename, 'a', newline='') as csvfile_iperf3:
            writer_iperf3 = csv.writer(csvfile_iperf3)
            writer_iperf3.writerow([ts, server, 'download', down_throughput, down_jitter, down_loss, devicename])
            csvfile_iperf3.flush()
        print(f"Device: {devicename}, Download: {down_throughput:.2f} Mbps, Jitter: {down_jitter if down_jitter is not None else 'N/A'} ms, Loss: {down_loss:.2f}%")


if __name__ == '__main__':
    main()