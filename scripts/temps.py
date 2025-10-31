#!/usr/bin/env python3
"""
temps.py - SSH into access points and monitor thermal zones

This script reads a list of access points (JSON) or a single host and polls
their thermal zones under /sys/class/thermal. It writes CSV rows with the
timestamp, device name, host, zone, type, temp_mC, temp_C, temp_F and any error.

Usage examples:
  # one-off poll of all APs listed in maps/aps.json
  ./temps.py --ap-file ../maps/aps.json --once --out ../app/data/temps.csv

  # poll a single host repeatedly every 60s using a specific key
  ./temps.py --ap "192.0.2.5" --user root --key ~/.ssh/id_rsa --interval 60

The script prefers system ssh (no extra deps). It can poll hosts in parallel
using threads (--parallel).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import shlex
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

DEFAULT_AP_FILE = os.path.join(os.path.dirname(__file__), '..', 'maps', 'aps.json')

REMOTE_CMD = (
    "for z in /sys/class/thermal/thermal_zone*; do \
        [ -f \"$z/temp\" ] || continue; \
        t=$(cat \"$z/temp\" 2>/dev/null || echo); \
        typ=$(cat \"$z/type\" 2>/dev/null || echo unknown); \
        name=$(basename \"$z\"); \
        echo \"${name}|${typ}|${t}\"; \
    done"
)


def parse_args():
    p = argparse.ArgumentParser(description='Poll AP thermal zones over SSH and log CSV rows')
    p.add_argument('--ap-file', default=DEFAULT_AP_FILE, help='JSON file listing APs (objects with devicename and host/ip)')
    p.add_argument('--ap', help='Single AP host or devicename to poll (overrides --ap-file)')
    p.add_argument('--user', default=None, help='SSH username (overrides per-AP user)')
    p.add_argument('--key', default=None, help='SSH private key file (optional)')
    p.add_argument('--port', type=int, default=22, help='SSH port')
    p.add_argument('--timeout', type=int, default=8, help='SSH connect timeout (seconds)')
    p.add_argument('--interval', type=int, default=60, help='Polling interval in seconds (use with --once to run once)')
    p.add_argument('--once', action='store_true', help='Run a single poll and exit')
    p.add_argument('--out', default='../app/data/temps.csv', help='Output CSV file (appends)')
    p.add_argument('--parallel', type=int, default=4, help='Number of parallel SSH connections')
    p.add_argument('--ap-name', help='When using --ap with a host, set the devicename to this value in the CSV')
    p.add_argument('--debug', action='store_true', help='Enable debug output for troubleshooting')
    return p.parse_args()


def load_ap_list(path: str) -> List[Dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as fh:
            j = json.load(fh)
            # expect a list of objects
            if isinstance(j, dict):
                # maybe the file contains a map; convert to list
                return [v for v in j.values() if isinstance(v, dict)]
            if isinstance(j, list):
                return [item for item in j if isinstance(item, dict)]
    except Exception:
        pass
    return []


def build_ssh_cmd(user: Optional[str], host: str, port: int, key: Optional[str], timeout: int, remote_cmd: str) -> List[str]:
    cmd = ['ssh', '-o', 'BatchMode=yes', '-o', f'ConnectTimeout={int(timeout)}', '-p', str(port)]
    if key:
        cmd.extend(['-i', key])
    target = f'{user + "@" if user else ""}{host}'
    cmd.append(target)
    cmd.append(remote_cmd)
    return cmd


def run_ssh_command(user: Optional[str], host: str, port: int, key: Optional[str], timeout: int) -> Tuple[bool, str]:
    cmd = build_ssh_cmd(user, host, port, key, timeout, REMOTE_CMD)
    try:
        # prefer subprocess.run; avoid shell=True
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if proc.returncode != 0:
            return False, proc.stderr.strip() or f'ssh exit {proc.returncode}'
        return True, proc.stdout
    except FileNotFoundError as e:
        return False, f'ssh not found: {e}'
    except Exception as e:
        return False, str(e)


def parse_remote_output(output: str) -> List[Tuple[str,str,int]]:
    rows = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split('|')
        if len(parts) < 3:
            continue
        zone, typ, temp_s = parts[0].strip(), parts[1].strip(), parts[2].strip()
        try:
            temp_mC = int(temp_s)
        except Exception:
            try:
                temp_mC = int(float(temp_s))
            except Exception:
                temp_mC = None
        rows.append((zone, typ, temp_mC))
    return rows


def temp_mC_to_CF(temp_mC: Optional[int]) -> Tuple[Optional[float], Optional[float]]:
    if temp_mC is None:
        return None, None
    c = float(temp_mC) / 1000.0
    f = c * 9.0 / 5.0 + 32.0
    return c, f


def ensure_csv_header(path: str, header: List[str]):
    exists = os.path.exists(path)
    if not exists:
        try:
            with open(path, 'w', newline='') as fh:
                writer = csv.writer(fh)
                writer.writerow(header)
        except Exception as e:
            print('Failed to create output file:', e, file=sys.stderr)


def append_rows_to_csv(path: str, rows: List[List]) -> None:
    try:
        with open(path, 'a', newline='') as fh:
            writer = csv.writer(fh)
            for r in rows:
                writer.writerow(r)
    except Exception as e:
        print('Failed to append to CSV:', e, file=sys.stderr)


def poll_one(ap: Dict, args) -> List[List]:
    host = ap.get('host') or ap.get('ip') or ap.get('address') or ap.get('hostname') or ap.get('bssid') or ''
    
    # Prioritize devicename from aps.json, but ensure we have a fallback
    dev = ap.get('devicename') or ap.get('name') or f"device_{host}"
    
    # Debug: log the devicename mapping for troubleshooting
    if args.debug and dev != host:
        print(f"DEBUG: Mapping {host} -> {dev}", file=sys.stderr)
    
    user = args.user or ap.get('user') or ap.get('username') or None
    key = args.key or ap.get('key') or None
    port = int(ap.get('port') or args.port or 22)
    rows_out = []
    ts = datetime.now(timezone.utc).astimezone().isoformat()
    success, out = run_ssh_command(user, host, port, key, args.timeout)
    if not success:
        # write single row with error
        rows_out.append([ts, dev, host, '', '', '', '', '', '', out])
        return rows_out
    parsed = parse_remote_output(out)
    if not parsed:
        # no zones found -- still write a row documenting that
        rows_out.append([ts, dev, host, '', '', '', '', '', '', 'no_zones'])
        return rows_out
    for zone, typ, temp_mC in parsed:
        c, f = temp_mC_to_CF(temp_mC)
        rows_out.append([ts, dev, host, zone, typ, temp_mC if temp_mC is not None else '', (f"{c:.3f}" if c is not None else ''), (f"{f:.2f}" if f is not None else ''), '', ''])
    return rows_out


def build_ap_targets(args) -> List[Dict]:
    targets = []
    if args.ap:
        # when --ap provided, allow either JSON devicename or raw host
        # If looks like JSON path (contains = or :), treat as host
        host = args.ap
        devname = args.ap_name or host
        targets.append({'devicename': devname, 'host': host})
        return targets
    # otherwise load ap file
    ap_list = load_ap_list(args.ap_file)
    if args.debug:
        print(f"DEBUG: Loaded {len(ap_list)} APs from {args.ap_file}", file=sys.stderr)
    
    if ap_list:
        for ap in ap_list:
            # normalize fields
            host = ap.get('host') or ap.get('ip') or ap.get('hostname') or ap.get('address')
            devicename = ap.get('devicename') or ap.get('name')
            
            if not host:
                if args.debug:
                    print(f"DEBUG: Skipping AP with no host: {ap}", file=sys.stderr)
                continue
                
            if not devicename and args.debug:
                print(f"DEBUG: AP {host} has no devicename, will use host as fallback", file=sys.stderr)
            
            # Ensure we have both host and devicename in the target
            target = dict(ap)  # copy all fields
            target['host'] = host
            if devicename:
                target['devicename'] = devicename
                
            targets.append(target)
            if args.debug:
                print(f"DEBUG: Added target - host: {host}, devicename: {devicename or 'fallback'}", file=sys.stderr)
    
    return targets


def main():
    args = parse_args()
    header = ['timestamp', 'devicename', 'host', 'zone', 'type', 'temp_mC', 'temp_C', 'temp_F', 'notes', 'error']
    ensure_csv_header(args.out, header)
    targets = build_ap_targets(args)
    if not targets:
        print('No targets found. Use --ap or provide a valid --ap-file JSON.', file=sys.stderr)
        sys.exit(2)

    def poll_all_once():
        results = []
        if args.parallel and args.parallel > 1:
            with ThreadPoolExecutor(max_workers=args.parallel) as ex:
                futs = {ex.submit(poll_one, ap, args): ap for ap in targets}
                for fut in as_completed(futs):
                    try:
                        r = fut.result()
                        results.extend(r)
                    except Exception as e:
                        ap = futs.get(fut)
                        ts = datetime.now(timezone.utc).astimezone().isoformat()
                        results.append([ts, ap.get('devicename') or '', ap.get('host') or '', '', '', '', '', '', '', str(e)])
        else:
            for ap in targets:
                try:
                    r = poll_one(ap, args)
                    results.extend(r)
                except Exception as e:
                    ts = datetime.now(timezone.utc).astimezone().isoformat()
                    results.append([ts, ap.get('devicename') or '', ap.get('host') or '', '', '', '', '', '', '', str(e)])
        if results:
            append_rows_to_csv(args.out, results)
        return results

    # run once or in a loop
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
