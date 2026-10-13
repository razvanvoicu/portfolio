# Official data and coverage

The app bundles every "Maximum Speed Limit" sign in the LTA Traffic Sign
GeoJSON snapshot from data.gov.sg, dataset d_bbf0132c7290d6838f82003972d933d5.
This is a point inventory, **not a road-segment speed-limit dataset**. It has
no road names, segment geometry, applicability ranges or time-dependent rules.
It cannot fulfil guaranteed speed-limit coverage of all Singapore roads.

The displayed limit is explicitly a nearby-sign estimate. Only signs within
60 m are considered; GPS accuracy must be 30 m or better. Conflicting limits
within 60 m plus reported GPS uncertainty produce an unknown limit. Parallel
roads or conditional signs may still produce incorrect estimates. No default
limit is invented; no sign is propagated down a road. Unknown means no alarm,
and speed is neutral rather than green. Sign bearing is retained for future
use but does not establish road applicability.

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
