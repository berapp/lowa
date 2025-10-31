#!/usr/bin/env python3
"""
ping_monitor.py - ping-monitor network devices listed in maps/aps.json

This script polls devices with ICMP (system ping) and writes a CSV snapshot
per-poll with fields: timestamp, devicename, host, reachable (1/0), rtt_ms,
packet_loss_percent, notes, error.

It supports polling once (`--once`) or in a loop with `--interval` seconds
between polls. Devices can be read from `maps/aps.json` or supplied via
`--hosts` (comma-separated hostnames/IPs). Parallel polling is supported
via `--parallel`.

This implementation calls the system `ping` command (Linux-style). It
requires ping to be available in PATH. No extra Python dependencies.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional

DEFAULT_AP_FILE = os.path.join(os.path.dirname(__file__), '..', 'maps', 'aps.json')


def parse_args():
    p = argparse.ArgumentParser(description='Ping-monitor devices and log CSV snapshots')
    p.add_argument('--ap-file', default=DEFAULT_AP_FILE, help='JSON file listing APs (objects with devicename and host/ip)')
    p.add_argument('--hosts', help='Comma-separated list of hostnames or ips to monitor (overrides ap-file)')
    p.add_argument('--interval', type=int, default=60, help='Polling interval in seconds')
    p.add_argument('--once', action='store_true', help='Run one poll and exit')
    p.add_argument('--out', default='ping_status.csv', help='Output CSV file (appends)')
    p.add_argument('--timeout', type=int, default=2, help='Ping timeout in seconds (per ping)')
    p.add_argument('--count', type=int, default=1, help='Number of pings to send per host')
    p.add_argument('--parallel', type=int, default=20, help='Number of concurrent pings')
    return p.parse_args()


def load_ap_list(path: str) -> List[Dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as fh:
            j = json.load(fh)
            if isinstance(j, dict):
                return [v for v in j.values() if isinstance(v, dict)]
            if isinstance(j, list):
                return [item for item in j if isinstance(item, dict)]
    except Exception:
        pass
    return []


def build_targets_from_args(args) -> List[Dict]:
    targets: List[Dict] = []
    if args.hosts:
        for h in args.hosts.split(','):
            h = h.strip()
            if not h:
                continue
            targets.append({'devicename': h, 'host': h})
        return targets
    # otherwise load AP file
    ap_list = load_ap_list(args.ap_file)
    if ap_list:
        for ap in ap_list:
            host = ap.get('host') or ap.get('ip') or ap.get('hostname') or ap.get('address')
            if not host:
                continue
            targets.append({'devicename': ap.get('devicename') or ap.get('name') or host, 'host': host})
    return targets


PING_TIME_RE = re.compile(r'time=([0-9.]+)\s*ms')
PACKET_LOSS_RE = re.compile(r'([0-9]+(?:\.[0-9]+)?)% packet loss')


def ping_host(host: str, timeout: int = 2, count: int = 1) -> Tuple[bool, Optional[float], Optional[float], str]:
    """Return (reachable, rtt_ms, packet_loss_percent, error_message)"""
    # Use system ping. On Linux: ping -c <count> -W <timeout>
    cmd = ['ping', '-c', str(count), '-W', str(int(timeout)), host]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        return False, None, None, 'ping not found'
    out = (proc.stdout or '').strip()
    err = (proc.stderr or '').strip()
    if proc.returncode != 0:
        # parse packet loss if present
        m_loss = PACKET_LOSS_RE.search(out + '\n' + err)
        loss = float(m_loss.group(1)) if m_loss else 100.0
        return False, None, loss, err or 'ping failed'
    # parse rtt
    m = PING_TIME_RE.search(out)
    rtt = float(m.group(1)) if m else None
    # try packet loss
    m_loss = PACKET_LOSS_RE.search(out)
    loss = float(m_loss.group(1)) if m_loss else 0.0
    return True, rtt, loss, ''


def ensure_csv_header(path: str, header: List[str]):
    if not os.path.exists(path):
        try:
            with open(path, 'w', newline='') as fh:
                csv.writer(fh).writerow(header)
        except Exception as e:
            print('Failed to create output file:', e, file=sys.stderr)


def append_rows(path: str, rows: List[List]):
    try:
        with open(path, 'a', newline='') as fh:
            writer = csv.writer(fh)
            for r in rows:
                writer.writerow(r)
    except Exception as e:
        print('Failed to append to CSV:', e, file=sys.stderr)


def poll_one_target(target: Dict, args) -> List[List]:
    host = target.get('host')
    dev = target.get('devicename') or host
    ts = datetime.now(timezone.utc).astimezone().isoformat()
    reachable, rtt, loss, err = ping_host(host, timeout=args.timeout, count=args.count)
    rows = []
    if reachable:
        rows.append([ts, dev, host, 1, (f"{rtt:.3f}" if rtt is not None else ''), (f"{loss:.2f}" if loss is not None else ''), '', ''])
    else:
        rows.append([ts, dev, host, 0, '', (f"{loss:.2f}" if loss is not None else ''), '', err or 'unreachable'])
    return rows


def main():
    args = parse_args()
    header = ['timestamp', 'devicename', 'host', 'reachable', 'rtt_ms', 'packet_loss_percent', 'notes', 'error']
    ensure_csv_header(args.out, header)
    targets = build_targets_from_args(args)
    if not targets:
        print('No targets found from --hosts or --ap-file', file=sys.stderr)
        sys.exit(2)

    def poll_all_once():
        results: List[List] = []
        if args.parallel and args.parallel > 1:
            with ThreadPoolExecutor(max_workers=args.parallel) as ex:
                futs = {ex.submit(poll_one_target, t, args): t for t in targets}
                for fut in as_completed(futs):
                    try:
                        r = fut.result()
                        results.extend(r)
                    except Exception as e:
                        t = futs.get(fut)
                        ts = datetime.now(timezone.utc).astimezone().isoformat()
                        results.append([ts, t.get('devicename') or '', t.get('host') or '', 0, '', '', '', str(e)])
        else:
            for t in targets:
                try:
                    results.extend(poll_one_target(t, args))
                except Exception as e:
                    ts = datetime.now(timezone.utc).astimezone().isoformat()
                    results.append([ts, t.get('devicename') or '', t.get('host') or '', 0, '', '', '', str(e)])
        if results:
            append_rows(args.out, results)
        return results

    if args.once:
        poll_all_once()
        return

    try:
        while True:
            poll_all_once()
            time.sleep(max(1, args.interval))
    except KeyboardInterrupt:
        print('\nInterrupted by user')


if __name__ == '__main__':
    main()
