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

### Manual sign corrections

`data/sign-corrections.json` holds reviewed numeric speed-sign corrections.
The compiler applies them after reading the official snapshot; raw downloads
remain unchanged. Generated metadata records the correction file hash and count.
Future corrections belong in this file, rather than in generated JavaScript.

Each correction has an `operation`, `id`, `reason` and `evidence`:

- `add`: supply a five-field `sign` array (longitude, latitude, km/h, traffic-flow
  bearing, ID). Use a unique string ID beginning with `manual:`.
- `update`: supply the existing numeric source ID, its complete original array
  as `expected`, and its replacement array as `sign`, keeping the same ID.
- `disable`: delete a sign from the compiled app dataset by supplying its source
  ID and complete original array as `expected`. The downloaded LTA record stays
  unchanged; the deletion is reapplied on each rebuild.

Updates/disables fail compilation if the source record changes or disappears,
so a refreshed download requires review rather than silently applying a stale
correction. Duplicate correction IDs and additions colliding with source IDs
also fail. School-zone markers are outside this correction file's scope.

The initial addition is the missing 40 km/h sign beside The Lanai on the
Hillview Avenue spur, at the user-supplied map pin. Its approximate westbound
travel bearing follows the spur geometry. The separate Jalan Remaja sign
(source ID 86695) is preserved. This adds a sign; it does not assign a statutory
limit to the entire spur or change detection thresholds.

Source sign 81950, the 90 km/h record west of Mount Pleasant Flyover, is disabled.
The user's August 2024 Street View image shows 80 km/h signs on the entrance
ramp and main carriageway at that location. The separate 80 km/h record 64917
is preserved. Source sign 83759, near Catholic Junior College beside
Whitley/Malcolm Road, is also disabled following the user's Street View image
showing 80 km/h signage. Source sign 81945 west of Adam Road is disabled on the
same basis: the user's image after Adam Road shows 80 km/h signage. All three
reviewed PIE 90 km/h records are excluded from the compiled app dataset.

On the user's instruction, eastbound PIE records 83665, 83664, 34637, 81946 and
81951 on the same CTE-to-Dunearn Road stretch are updated from 90 to 80 km/h.
Their source coordinates and bearings are preserved. These eastbound corrections
record the user's instruction as evidence; the three supplied photographs
document the westbound locations. Nearby record 73788 is on BKE and is unchanged.

Rifle Range Underpass entrance records 142798 and 142799 are updated from 50 to
40 km/h. The user's photograph shows the paired 40 signs; the refined map point
(1.3431667, 103.7843611) is 3.5 m from record 142798 and 12.7 m from record
142799. Both source positions and their 249-degree traffic-flow bearings are
preserved.

After editing corrections, run `python scripts/speedlimit_data.py` using the
cached downloads (or add `--download` to refresh), then rebuild the repository.

The app bundles every "Maximum Speed Limit" sign in the LTA Traffic Sign
GeoJSON snapshot from data.gov.sg, dataset d_bbf0132c7290d6838f82003972d933d5.
It also bundles every sign whose description contains "School Zone". End Of
School Zone [3064] is an exit. Only a category explicitly stating
"School Zone, 40 km/h" is a speed-zone entry with a numeric limit of 40.
All other categories, including "Drive Carefully", children-ahead logos,
time plates and distance plates, are warnings without a numeric limit.
The current snapshot contains 892 warnings, 786 exits and no explicit 40 km/h
school-zone speed entries. The compiler does not associate a nearby ordinary
40 sign with a warning marker or infer a combined regulatory sign.
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

An ordinary numeric sign is ignored when its limit is at least 20 km/h below
the current limit and the vehicle's current GPS speed is strictly above the
midpoint of those two limits. For example, an 80-to-50 change is ignored above
65 km/h; exactly 65 km/h is allowed. Smaller reductions and increases are
unaffected. If GPS speed is unavailable, the ignore condition cannot be met.
The sign is marked handled when evaluated, so slowing down after passage does
not immediately apply it. The existing corner rechecks and encounter expiry
still apply. The limit display no longer has a tap-to-undo action.

Generic school-zone warnings do not change the speed limit or block ordinary
numeric signs. Normal mapped-road and numeric-sign behavior continues through
those warnings. A school-zone override
requires an explicit 40 km/h entry; legacy entries with a null limit are also
ignored. For an explicit speed zone, the pre-zone limit and source are saved
once, 40 is retained through turns and ordinary signs, and a school-zone exit
restores the saved value. An exit without an active speed zone has no effect.
The legal 40 km/h rule depends on the prescribed diagram 12A sign, rather than
the generic presence of a school-zone marker. From 1 January 2026 it applies
throughout the day. School polygons are not used by the app.

Legal basis: https://sso.agc.gov.sg/SL-Supp/S691-2025/Published/20251031?DocDate=20251031

Heading is the circular mean of consecutive segment bearings across the last
four accepted positions. A fix less than 5 m from the last accepted position
is ignored for heading/sign processing; it can still update GPS speed.
Smoothed headings are retained over the last 40 m travelled. A difference of
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

GPS coordinates are processed locally. With Record enabled, recorded fixes and
displayed-limit diagnostics are uploaded at Stop to the password-protected
backend; with Record disabled, location is not uploaded.
GPS speed must be supplied by the device: null speed is not interpreted as zero.
Location fixes older than 8 seconds are invalid. Audio and wake lock require
an explicit start gesture. Background browser execution is not guaranteed.

Two sound levels share the alert threshold (limit minus tolerance). Excess up to the saved gentle range (default 3 km/h, inclusive) uses a sine chime. Greater excess uses the existing square-wave warning and a pink background. The range is adjustable in settings; automatic sound remains suppressed below a 60 km/h limit.
