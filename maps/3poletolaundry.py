import argparse
import subprocess
import time
import csv
from datetime import datetime, timezone
import json
import sys
import os
import signal
import threading

# Defaults - change as appropriate
DEFAULT_SERVER = '192.168.10.94'  # LAUNDRY1
DEFAULT_PORT = 5201
DEFAULT_INTERVAL = 30  # seconds between test pairs
DEFAULT_DURATION = 10  # iperf3 test duration in seconds


def run_iperf_test(server, port, duration, parallel, direction, timeout=60):
    """Run an iperf3 test and return (throughput_mbps, jitter_ms_or_None, loss_percent_or_None).

    direction: 'upload' or 'download'
    For iperf3 JSON: use 'sum_sent' for data sent by the client and 'sum_received' for data received by the client.
    When running with -R (reverse), the client's role flips.
    """
    try:
        cmd = ['iperf3', '-c', server, '-p', str(port), '-J', '-P', str(parallel), '-t', str(duration)]
        if direction == 'upload':
            # client receives data when -R is set (server -> client), so for upload we want the client to send data.
            # iperf3 -R makes the server send and client receive; to test upload (client->server) do NOT use -R.
            # Historically some scripts used -R reversed. Use clear mapping here: 'upload' => client->server (no -R),
            # 'download' => server->client (use -R).
            pass
        elif direction == 'download':
            cmd.append('-R')

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode != 0:
            print(f"iperf3 {direction} failed (rc={proc.returncode}): {proc.stderr.strip()}")
            return None, None, None

        data = json.loads(proc.stdout)
        end = data.get('end', {})

        # Choose the correct summary depending on direction
        if direction == 'upload':
            # client sent data -> check sum_sent
            sum_data = end.get('sum_sent') or end.get('sum') or {}
        else:
            # download: client received data -> check sum_received
            sum_data = end.get('sum_received') or end.get('sum') or {}

        bits_per_second = sum_data.get('bits_per_second') or 0
        throughput_mbps = bits_per_second / 1_000_000.0

        # jitter_ms and lost_percent may not be present for TCP tests
        jitter_ms = sum_data.get('jitter_ms')
        lost_percent = None
        # some iperf3 JSON uses 'lost_percent' or calculates via lost and packets
        if 'lost_percent' in sum_data:
            lost_percent = sum_data.get('lost_percent')
        elif 'lost_packets' in sum_data and 'packets' in sum_data and sum_data.get('packets'):
            try:
                lost_percent = (sum_data.get('lost_packets', 0) / float(sum_data.get('packets'))) * 100.0
            except Exception:
                lost_percent = None

        return throughput_mbps, jitter_ms, lost_percent
    except Exception as e:
        print(f"Error running iperf3 ({direction}): {e}")
        return None, None, None


def write_csv_header_if_needed(path, fieldnames):
    need_header = False
    try:
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            need_header = True
    except Exception:
        need_header = True

    if need_header:
        with open(path, 'a', newline='') as fh:
            writer = csv.writer(fh)
            writer.writerow(fieldnames)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except Exception:
                pass


def prompt_tag_interactive(current_tag):
    try:
        new = input(f"Enter tag (current: {current_tag}) or q to quit: ").strip()
        if not new:
            return current_tag
        return new
    except EOFError:
        return current_tag


def main():
    parser = argparse.ArgumentParser(description='Run iperf3 upload/download tests and log results to CSV')
    parser.add_argument('--tag', '-t', default='none', help='Tag to identify the pole (e.g. pole number)')
    parser.add_argument('--server', '-s', default=DEFAULT_SERVER, help='iperf3 server IP')
    parser.add_argument('--port', '-p', type=int, default=DEFAULT_PORT, help='iperf3 server port')
    parser.add_argument('--interval', '-i', type=int, default=DEFAULT_INTERVAL, help='Seconds between test pairs')
    parser.add_argument('--duration', '-d', type=int, default=DEFAULT_DURATION, help='iperf3 test duration seconds')
    parser.add_argument('--parallel', '-P', type=int, default=4, help='iperf3 parallel streams')
    parser.add_argument('--output', '-o', default='pole2laundry_data.csv', help='CSV output filename')
    parser.add_argument('--interactive', action='store_true', help='Prompt for tag between test cycles')
    parser.add_argument('--once', action='store_true', help='Run one upload+download pair and exit')
    args = parser.parse_args()

    fieldnames = ['timestamp', 'iperf3_server', 'iperf3_port', 'iperf_direction', 'iperf_throughput_mbps', 'iperf_jitter_ms', 'iperf_loss_percent', 'tag']
    write_csv_header_if_needed(args.output, fieldnames)

    # Startup banner / summary
    print("Starting iperf3 logger with the following settings:")
    print(f"  server:    {args.server}")
    print(f"  port:      {args.port}")
    print(f"  duration:  {args.duration}s per test")
    print(f"  parallel:  {args.parallel} streams")
    print(f"  interval:  {args.interval}s between test pairs")
    print(f"  output:    {args.output}")
    print(f"  tag:       {args.tag}")
    print(f"  interactive mode: {'ON' if args.interactive else 'OFF'}")

    # Check that iperf3 is available
    try:
        check = subprocess.run(['iperf3', '--version'], capture_output=True, text=True, timeout=5)
        if check.returncode != 0:
            print('Warning: iperf3 returned non-zero on --version. Ensure iperf3 is installed and on PATH.')
        else:
            # show a short first line of the version output
            first_line = (check.stdout or check.stderr).splitlines()[0] if (check.stdout or check.stderr) else ''
            if first_line:
                print(f"  iperf3:    {first_line}")
    except FileNotFoundError:
        print('ERROR: iperf3 not found on PATH. Please install iperf3 and ensure it is available.')
        sys.exit(2)
    except Exception:
        print('Warning: could not determine iperf3 version. Continuing...')

    stop_event = threading.Event()

    def handle_sigint(signum, frame):
        print('\nReceived interrupt, stopping after current test...')
        stop_event.set()

    signal.signal(signal.SIGINT, handle_sigint)

    tag = args.tag

    try:
        while not stop_event.is_set():
            ts = datetime.now(timezone.utc).isoformat()

            # Run upload (client -> server)
            up_throughput, up_jitter, up_loss = run_iperf_test(args.server, args.port, args.duration, args.parallel, 'upload')
            if up_throughput is not None:
                with open(args.output, 'a', newline='') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow([ts, args.server, args.port, 'upload', f"{up_throughput:.3f}", up_jitter if up_jitter is not None else '', up_loss if up_loss is not None else '', tag])
                    csvfile.flush()
                    try:
                        os.fsync(csvfile.fileno())
                    except Exception:
                        pass
                print(f"{ts} upload -> {args.server}:{args.port} {up_throughput:.2f} Mbps jitter={up_jitter if up_jitter is not None else 'N/A'} loss={up_loss if up_loss is not None else 'N/A'} tag={tag}")

            if stop_event.is_set():
                break

            # Small sleep between tests to avoid hammering
            time.sleep(2)

            # Run download (server -> client)
            ts = datetime.now(timezone.utc).isoformat()
            down_throughput, down_jitter, down_loss = run_iperf_test(args.server, args.port, args.duration, args.parallel, 'download')
            if down_throughput is not None:
                with open(args.output, 'a', newline='') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow([ts, args.server, args.port, 'download', f"{down_throughput:.3f}", down_jitter if down_jitter is not None else '', down_loss if down_loss is not None else '', tag])
                    csvfile.flush()
                    try:
                        os.fsync(csvfile.fileno())
                    except Exception:
                        pass
                print(f"{ts} download <- {args.server}:{args.port} {down_throughput:.2f} Mbps jitter={down_jitter if down_jitter is not None else 'N/A'} loss={down_loss if down_loss is not None else 'N/A'} tag={tag}")

            # Finished a pair of tests
            if args.once:
                print('--once specified, exiting after single pair of tests')
                break
            if args.interactive:
                new_tag = prompt_tag_interactive(tag)
                if new_tag.lower() == 'q':
                    print('Quitting per user request')
                    break
                tag = new_tag

            # Wait until next cycle or break early if interrupted
            for _ in range(int(args.interval)):
                if stop_event.is_set():
                    break
                time.sleep(1)

    except Exception as exc:
        print(f"Unexpected error: {exc}")


if __name__ == '__main__':
    main()
