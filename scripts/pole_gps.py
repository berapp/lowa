import json
import subprocess
import csv
import os
from datetime import datetime

# Set relative data path
output_dir = os.path.join(os.path.dirname(__file__), "../data")
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, "pole_locations.csv")

# Initialize CSV
if not os.path.exists(output_file):
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "pole_id", "lat", "long"])

print("Starting pole GPS logger...")
print(f"Saving data to {output_file}")
print("Enter pole ID (e.g., Pole 3) and press Enter to log GPS. Press Ctrl+C to quit.")

try:
    while True:
        pole_id = input("Enter pole ID: ").strip()
        if not pole_id:
            print("Pole ID cannot be empty")
            continue
        try:
            loc = json.loads(subprocess.run(["termux-location"], capture_output=True, text=True).stdout)
            lat, long = loc.get("latitude"), loc.get("longitude")
            timestamp = datetime.now().isoformat()
            with open(output_file, 'a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([timestamp, pole_id, lat, long])
            print(f"Saved: Pole {pole_id} at ({lat}, {long})")
        except Exception as e:
            print(f"Error: {e}")
except KeyboardInterrupt:
    print("\nPole GPS logging complete. Data saved to", output_file)