# Official data and coverage

## Road matching and statutory limits

The offline network uses LTA Road Section Line (September 2026), joined to the
official January 2024 Road Name/Road Code table. Coordinates are converted from
SVY21 (EPSG:3414) to WGS84 using PROJ, preserving every original vertex. There
are 15,364 line parts across 3,805 named roads; unmatched road codes remain
unnamed. Road identity does not by itself establish a speed limit.

The six schedules of the Road Traffic (Restriction of Speed on Roads)
Notification, effective 1 January 2026, supply statutory limits. The compiler
preserves estate context, direction and partial-road wording. It assigns whole
road limits only where that road has no conflicting or scoped schedule entry.
Simple ranges between named roads are assigned only when both junctions share
exact source vertices and there is a unique connecting path. Features crossing
a legal boundary remain unresolved. Directional, lamp-post and estate extents
are not guessed. Curated partial ranges are pinned to the source file hash.

The current mapping contains 1,924 parts across 306 road names, including 33
resolved junction ranges. Other stretches use the sign/default fallback and
are labelled as such. This is not complete statutory coverage of Singapore.
The complete network is still used to display the matched road name.

Hillview Avenue's 60 km/h rule is mapped only to its main chain between
Hillview Road and Bukit Batok East Avenue 2. The estate spur, other side branches
and continuation north of Hillview Road are not assigned that limit. The branch
containing OneMap's Hillview Road reference point is corrected from the
adjacent avenue's source code; this correction and all curated feature IDs are
recorded in data/verified-road-sections.json. Automatically resolved boundaries
and source schedule references are in data/resolved-road-sections.json.

Approved runtime rules (all driving thresholds are in static/config.mjs):

- Consider road segments within 30 m, aligned within 45 degrees of heading in
  either direction. Compare distinct road identities by nearest eligible segment.
- If different roads are within 10 m of the best distance, retain the previous
  road only if it remains eligible; otherwise label the match uncertain.
- Use the mapped statutory limit only for that matched line part. Uncertain or
  unresolved stretches use the existing sign/default behavior, visibly labelled
  as fallback. A previous statutory value is not carried into an unresolved part.
- School-zone entry/end behavior takes precedence and retains the agreed saved
  pre-zone limit. GPS fixes below the existing movement threshold preserve the
  road/heading history while stopped.

### Rebuilding the network

`scripts/speedlimit_roads.py --publish` consumes the official HTML schedules,
RoadSectionLine_Sep2026.zip and road-codes.xlsx under ignored tmp/. It emits
static/network.mjs plus data/road-coverage.json with SHA-256 source hashes.
The isolated build tools are beautifulsoup4==4.14.3, pyshp==3.0.3 and
pyproj==3.7.2; they are not browser/runtime dependencies. Install them into
tmp/roadtools and set PYTHONPATH to that directory when running the compiler.
The original road file must match the curated hash or the compiler stops for
boundary review. The browser makes no external road/geocoding requests.

Sources:

- https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/RoadSectionLine_Sep2026.zip
- https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/GIS_Data_Hub/road_name_road_code_jan2024.xlsx
- https://sso.agc.gov.sg/SL/RTA1961-N6

## Sign fallback and school zones

The app bundles every "Maximum Speed Limit" sign in the LTA Traffic Sign
GeoJSON snapshot from data.gov.sg, dataset d_bbf0132c7290d6838f82003972d933d5.
It also bundles every sign whose description contains "School Zone", tagging
End Of School Zone [3064] as an exit and the other school-zone markers as entry.
This is a point inventory, **not a road-segment speed-limit dataset**. It has
no road names, segment geometry, applicability ranges or time-dependent rules.
It cannot fulfil guaranteed speed-limit coverage of all Singapore roads.

The default displayed limit is 50 km/h. Signs become candidates within a 60 m
cone. Its half-angle grows linearly from 20 degrees at 60 m to 90 degrees at
zero distance. The same cone is mirrored behind the vehicle after passage.
A candidate applies only after consecutive accepted GPS positions confirm
passage: the sign's projection along that movement lies between the fixes,
the sign is in the rear cone, and its bearing differs from the smoothed heading
by at most 45 degrees. The rear cone can recover a sign skipped between fixes.
Passed signs are processed in travel order. This does not determine which road
a nearby ramp sign governs. LTA specifies sign bearing along traffic flow,
rather than the physical face direction.

Signs encountered within range are retained for rechecking over the next
30 m travelled, using the updated heading and the same 45-degree bearing rule.
This accommodates signs at corners while the averaged heading catches up.
The recheck distance is configured by signRecheckDistanceM.

Tapping the limit within seven seconds of a displayed change restores the
previous limit, source and school-zone state. The rejected sign remains ignored
until another qualifying sign is passed. The restored state is retained until
then, including against repeated road matching. A later visit can encounter the
rejected sign again. Stopping resets this state. The window and cone constants
are in static/config.mjs.

Per the agreed app behavior, school-zone entry markers impose 40 km/h. The
pre-zone limit and its source are saved once on entry. While inside the zone,
turns and numeric speed signs cannot replace 40. An End Of School Zone marker
restores the saved limit. Repeated entry markers do not overwrite that saved
value. schoolZoneLimitKph is configurable. These are the user-specified app
rules; the dataset does not distinguish enhanced zones or encode flashing-light
conditions. School polygons are not used by the app.

Heading is the circular mean of consecutive segment bearings across the last
four accepted positions. A fix less than 5 m from the last accepted position
is ignored for heading/sign processing; it can still update GPS speed.
Smoothed headings are retained over the last 30 m travelled. A difference of
at least 60 degrees from a heading in that history identifies a turn in either
direction. Stops do not evict useful history. On a detected turn, smoothing
begins again with the latest movement to avoid carrying the old road direction.
All these values are in static/config.mjs. The previous accuracy cutoff and
conflicting-sign rejection have been removed; the old 30 m proximity activation
is superseded by the cone and passage rules above.

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

Two sound levels share the alert threshold (limit minus tolerance). Excess up to the saved gentle range (default 3 km/h, inclusive) uses a sine chime. Greater excess uses the existing square-wave warning and a pink background. The range is adjustable in settings; automatic sound remains suppressed below a 60 km/h limit.
