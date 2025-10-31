#!/usr/bin/env python3
"""
split_csv_by_day.py

Simple utility to split CSV files into separate files per day based on a timestamp column.

Behavior:
- By default looks for a header and a column named 'timestamp'.
- If no header is detected, assumes the timestamp is in column index 0 (or provide --timestamp-col-index).
- Supports common timestamp formats:
    - ISO 8601 (with or without timezone, 'Z' or +HH:MM)
    - YYYYMMDD_HHMMSS and YYYYMMDD
    - UNIX epoch seconds (integer/float)
    - A few common human-readable formats like 'YYYY-MM-DD HH:MM:SS'
- Writes output files next to the input file named: <input_basename>_YYYY-MM-DD.csv

Usage examples:
    python3 split_csv_by_day.py iperf3_data.csv
    python3 split_csv_by_day.py --timestamp-col timestamp signal_data.csv
    python3 split_csv_by_day.py -o outdir --timestamp-col-index 0 myfile.csv

"""

import argparse
import csv
import os
import re
from datetime import datetime, timezone
from typing import Optional

# Try to use dateutil if available for robust parsing
try:
    from dateutil import parser as dateutil_parser
    _HAS_DATEUTIL = True
except Exception:
    _HAS_DATEUTIL = False

ISO_Z_RE = re.compile(r"Z$")

# Common strptime patterns to try when dateutil isn't available
COMMON_PATTERNS = [
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M:%S%z",
    "%Y%m%d_%H%M%S",
    "%Y%m%d",
]


def parse_date_to_ymd(value: str) -> Optional[str]:
    """Parse a timestamp-like string and return a date string YYYY-MM-DD or None if unparsable."""
    if value is None:
        return None
    s = value.strip()
    if s == "":
        return None

    # Try numeric epoch (seconds)
    if re.match(r"^-?\d+(\.\d+)?$", s):
        try:
            ts = float(s)
            # if ts is very large (ms), convert
            if ts > 1e12:
                ts = ts / 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.date().isoformat()
        except Exception:
            pass

    # Try dateutil if available
    if _HAS_DATEUTIL:
        try:
            dt = dateutil_parser.parse(s)
            # normalize to UTC-aware if naive
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.date().isoformat()
        except Exception:
            pass

    # Replace trailing Z with +00:00 for fromisoformat
    try:
        iso_try = ISO_Z_RE.sub('+00:00', s)
        dt = None
        try:
            dt = datetime.fromisoformat(iso_try)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.date().isoformat()
        except Exception:
            pass

        # Try common patterns
        for pat in COMMON_PATTERNS:
            try:
                dt = datetime.strptime(s, pat)
                # treat naive as UTC
                dt = dt.replace(tzinfo=timezone.utc)
                return dt.date().isoformat()
            except Exception:
                continue
    except Exception:
        pass

    return None


def split_file(path: str, timestamp_col: Optional[str], timestamp_col_index: Optional[int], out_dir: Optional[str], unknown_name: str = 'unknown'):
    path = os.path.abspath(path)
    base = os.path.basename(path)
    name, ext = os.path.splitext(base)
    out_dir = out_dir or os.path.dirname(path)
    os.makedirs(out_dir, exist_ok=True)

    with open(path, 'r', newline='') as f:
        # Detect header
        sample = f.read(4096)
        f.seek(0)
        has_header = csv.Sniffer().has_header(sample)

        if has_header:
            reader = csv.DictReader(f)
            header = reader.fieldnames
            # If timestamp column not provided, try to find 'timestamp'
            if timestamp_col is None:
                if header and 'timestamp' in [h.lower() for h in header]:
                    # find actual header name case-insensitively
                    for h in header:
                        if h.lower() == 'timestamp':
                            timestamp_col = h
                            break
                else:
                    # fallback to first column
                    timestamp_col = header[0] if header else None
        else:
            # No header: use index-based parsing
            reader = csv.reader(f)
            header = None
            if timestamp_col_index is None:
                timestamp_col_index = 0

        # Keep open file handles per date to stream writes
        open_files = {}
        writers = {}

        def get_writer_for_date(date_str, header_row):
            if date_str is None:
                date_str = unknown_name
            out_name = f"{name}_{date_str}.csv"
            out_path = os.path.join(out_dir, out_name)
            if out_path in writers:
                return writers[out_path]
            out_f = open(out_path, 'a', newline='')
            w = csv.writer(out_f)
            # If header is present, write header once if file is empty
            if header_row:
                try:
                    if os.path.getsize(out_path) == 0:
                        w.writerow(header_row)
                except OSError:
                    # assume new file
                    w.writerow(header_row)
            open_files[out_path] = out_f
            writers[out_path] = w
            return w

        # Process rows
        for row in reader:
            if has_header:
                ts_value = row.get(timestamp_col) if timestamp_col is not None else None
            else:
                # row is a list
                try:
                    ts_value = row[timestamp_col_index]
                except Exception:
                    ts_value = None
            date_str = parse_date_to_ymd(ts_value) if ts_value is not None else None

            # choose writer and write row (preserve order)
            if has_header:
                writer = get_writer_for_date(date_str, header)
                # write row as list matching header order
                writer.writerow([row.get(h, '') for h in header])
            else:
                writer = get_writer_for_date(date_str, None)
                writer.writerow(row)

        # Close open files
        for fh in open_files.values():
            try:
                fh.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description='Split CSV files into per-day CSVs by timestamp column')
    parser.add_argument('files', nargs='+', help='One or more CSV files to split')
    parser.add_argument('--timestamp-col', type=str, default=None, help="Name of the timestamp column (default: 'timestamp' if present)")
    parser.add_argument('--timestamp-col-index', type=int, default=None, help='If no header or you want to use an index, provide the column index (0-based)')
    parser.add_argument('-o', '--out-dir', type=str, default=None, help='Output directory for per-day files (defaults to input file directory)')
    parser.add_argument('--unknown-name', type=str, default='unknown', help='Name to use for rows with unparseable timestamps')
    args = parser.parse_args()

    for p in args.files:
        if not os.path.exists(p):
            print(f"Skipping missing file: {p}")
            continue
        print(f"Processing {p}...")
        split_file(p, args.timestamp_col, args.timestamp_col_index, args.out_dir, unknown_name=args.unknown_name)

    print("Done.")


if __name__ == '__main__':
    main()
