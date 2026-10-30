CREATE TABLE saved_photo_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  label TEXT NOT NULL,
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  created_at INTEGER NOT NULL,
  UNIQUE(site_id, label)
);
