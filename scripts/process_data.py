import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import folium
import glob
import os

# Relative paths
data_dir = os.path.join("..", "data")
kml_file = os.path.join(data_dir, "LOWA.kml")
output_dir = os.path.join("..", "docs")
os.makedirs(output_dir, exist_ok=True)

# Verify KML exists
if not os.path.exists(kml_file):
    raise FileNotFoundError(f"KML file not found at {kml_file}")

# Load KML layers
try:
    # Load Perimeter layer
    gdf_perimeter = gpd.read_file(kml_file, layer="Perimeter")
    print("Perimeter layer columns:", gdf_perimeter.columns.tolist())
    if "Name" in gdf_perimeter.columns:
        perimeter_subset = gdf_perimeter[gdf_perimeter["Name"] == "4775 Bermuda Lakes Way Perimeter"]
        if not perimeter_subset.empty:
            perimeter = perimeter_subset.geometry.iloc[0]
        else:
            print("Warning: No Placemark named '4775 Bermuda Lakes Way Perimeter', using first geometry")
            perimeter = gdf_perimeter.geometry.iloc[0]
    else:
        print("Warning: 'Name' column missing in Perimeter, using first geometry")
        perimeter = gdf_perimeter.geometry.iloc[0]
    # Load Exclusion Zones layer
    gdf_exclusions = gpd.read_file(kml_file, layer="Exclusion Zones")
    print("Exclusion Zones layer columns:", gdf_exclusions.columns.tolist())
    if "Name" in gdf_exclusions.columns and not gdf_exclusions.empty:
        exclusions = gdf_exclusions[gdf_exclusions["Name"].str.contains("Exclusion Zone", na=False)].geometry
    else:
        print("Warning: 'Name' column missing or empty in Exclusion Zones, skipping exclusions")
        exclusions = []
except Exception as e:
    raise Exception(f"Error loading KML layers: {e}")

# Merge WiFi CSVs
csv_files = [
    os.path.join(data_dir, f"wifi_speed_data_{name}.csv")
    for name in [
        "20250530171918", "20250530173653", "20250530174837",
        "20250530175129", "20250530175202", "20250530175857",
        "20250530215131", "20250530221149", "20250530222634",
        "20250530223557", "20250530225557", "20250530231328",
        "20250530231402"
    ]
]
df_list = []
for f in csv_files:
    if os.path.exists(f):
        df_list.append(pd.read_csv(f))
    else:
        print(f"Warning: CSV not found at {f}")
if not df_list:
    raise FileNotFoundError("No CSVs found")
df = pd.concat(df_list, ignore_index=True)

# Create GeoDataFrame
df["geometry"] = df.apply(lambda row: Point(row["long"], row["lat"]), axis=1)
gdf = gpd.GeoDataFrame(df, geometry="geometry")

# Filter: Inside perimeter, outside exclusions
gdf = gdf[gdf.within(perimeter)]
for excl in exclusions:
    gdf = gdf[~gdf.within(excl)]

# Load pole locations (if exists)
pole_file = os.path.join(data_dir, "pole_locations.csv")
if os.path.exists(pole_file):
    pole_df = pd.read_csv(pole_file)
    pole_df["geometry"] = pole_df.apply(lambda row: Point(row["long"], row["lat"]), axis=1)
    pole_gdf = gpd.GeoDataFrame(pole_df, geometry="geometry")
else:
    pole_gdf = None
    print("No pole_locations.csv found")

# Heatmaps
for direction in ["download", "upload"]:
    gdf_dir = gdf[gdf["iperf_direction"] == direction]
    m = folium.Map(location=[26.671022, -81.804503], zoom_start=14)
    for _, row in gdf_dir.iterrows():
        folium.CircleMarker(
            location=[row["lat"], row["long"]],
            radius=5,
            color="blue" if row["iperf_throughput_mbps"] > 70 else "red",
            fill=True,
            popup=f"Site: {row['site_number']}, Throughput: {row['iperf_throughput_mbps']:.2f} Mbps, RSSI: {row['connected_rssi']}, Overlap: {row['channel_overlap']}"
        ).add_to(m)
    if pole_gdf is not None:
        for _, row in pole_gdf.iterrows():
            folium.Marker(
                location=[row["lat"], row["long"]],
                popup=f"Pole: {row['pole_id']}",
                icon=folium.Icon(color="green", icon="tower-broadcast")
            ).add_to(m)
    m.save(os.path.join(output_dir, f"heatmap_{direction}.html"))

# Summaries
overlap_summary = gdf.groupby(["site_number", "channel"])["channel_overlap"].mean().unstack().fillna(0)
overlap_summary.to_csv(os.path.join(output_dir, "channel_overlap_summary.csv"))
site_summary = gdf.groupby("site_number").agg({
    "iperf_throughput_mbps": ["mean", "min", "max"],
    "connected_rssi": "mean",
    "channel_overlap": "mean",
    "lat": "first",
    "long": "first"
}).round(2)
site_summary.to_csv(os.path.join(output_dir, "site_summary.csv"))

print("Heatmaps saved to", output_dir)
print("Summaries saved to", os.path.join(output_dir, "channel_overlap_summary.csv, site_summary.csv"))