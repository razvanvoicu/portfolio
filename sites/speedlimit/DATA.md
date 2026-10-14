# Official data and coverage

The app bundles every "Maximum Speed Limit" sign in the LTA Traffic Sign
GeoJSON snapshot from data.gov.sg, dataset d_bbf0132c7290d6838f82003972d933d5.
This is a point inventory, **not a road-segment speed-limit dataset**. It has
no road names, segment geometry, applicability ranges or time-dependent rules.
It cannot fulfil guaranteed speed-limit coverage of all Singapore roads.

The default displayed limit is 50 km/h. A sign applies within 30 m when its
bearing differs from the computed vehicle heading by at most 45 degrees.
The nearest qualifying sign sets the limit, which persists until a new sign
or a turn of at least 60 degrees resets it to the default. LTA specifies sign
bearing along traffic flow, rather than the physical face direction.

Heading is the circular mean of consecutive segment bearings across the last
four accepted positions. A fix less than 5 m from the last accepted position
is ignored for heading/sign processing; it can still update GPS speed.
Smoothed headings are retained over the last 30 m travelled. A difference of
at least 60 degrees from a heading in that history identifies a turn in either
direction. Stops do not evict useful history. On a detected turn, smoothing
begins again with the latest movement to avoid carrying the old road direction.
All these values are in static/config.mjs. The previous accuracy cutoff,
60 m radius and conflicting-sign rejection have been removed.

Colour still uses speed > limit - tolerance. Automatic audio additionally
requires a limit of at least 60 km/h. The explicit Test Sound button remains
available. GPS freshness failures silence the alarm but retain the limit.
This is sign-derived inference, not verified road geometry; parallel roads,
conditional zones, temporary signs and changes missing from the snapshot can
still differ. A new drive starts at 50 with fresh movement history.

Singapore-only operation uses URA Master Plan 2019 Planning Area Boundary
(No Sea), dataset d_4765db0e87b9c86336792efe8a1f7a66. These are indicative
planning polygons, so new reclamation or boundary-edge fixes can be excluded.

Both datasets are published under the Singapore Open Data Licence:
https://data.gov.sg/open-data-licence

Source links, retrieval time, source SHA-256 hashes, and sign count are embedded
in `static/road-data.js`. Reproduce/update with
`python scripts/speedlimit_data.py --download`, then run the repository build.
Downloads remain in ignored tmp/; only compiled constants ship to the browser.

GPS coordinates are processed locally. The app does not transmit location.
GPS speed must be supplied by the device: null speed is not interpreted as zero.
Location fixes older than 8 seconds are invalid. Audio and wake lock require
an explicit start gesture. Background browser execution is not guaranteed.
