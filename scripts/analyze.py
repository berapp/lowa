import pandas as pd
import geopandas as gpd
from shapely.geometry import Point, Polygon
import folium

# Load KML
gdf = gpd.read_file("LOWA.kml")
perimeter = gdf[gdf["name"] == "4775 Bermuda Lakes Way Perimeter"].geometry.iloc[0]
exclusions = gdf[gdf["name"].str.contains("Exclusion Zone")].geometry

# Load WiFi data
df = pd.read_csv("../data/wifi_data.csv")
df["geometry"] = df.apply(lambda row: Point(row["long"], row["lat"]), axis=1)
gdf_wifi = gpd.GeoDataFrame(df, geometry="geometry")

# Filter: Inside perimeter, outside exclusions
gdf_wifi = gdf_wifi[gdf_wifi.within(perimeter)]
for excl in exclusions:
    gdf_wifi = gdf_wifi[~gdf_wifi.within(excl)]

# Heatmap
m = folium.Map(location=[26.673614, -81.8039762], zoom_start=16)
# Add heatmap logic (TBD based on signal strength)
m.save("~/LOWA/docs/heatmap.html")