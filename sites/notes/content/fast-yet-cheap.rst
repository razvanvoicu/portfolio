.. raw:: html

   <style>
     .chapter-content .vid-short {
       position: relative;
       width: 100%;
       aspect-ratio: 9 / 16;
     }
     .chapter-content .vid-short iframe {
       position: absolute;
       inset: 0;
       width: 100%;
       height: 100%;
       border: 0;
       border-radius: .9rem;
     }
     .chapter-content .vid-pair {
       display: grid;
       grid-template-columns: 1fr 1fr;
       gap: 1rem;
       max-width: 34rem;
       margin: 1.6rem auto 2rem;
     }
     .chapter-content .phone {
       display: block;
       width: 216px;
       max-width: 62%;
       margin: 1.7rem auto .8rem;
       border: 1px solid var(--line);
       border-radius: .9rem;
     }
     .chapter-content .split {
       width: 100%;
       margin: 1.7rem 0 2rem;
       border-collapse: collapse;
       font-size: .93em;
     }
     .chapter-content .split th {
       padding: .6rem .8rem;
       border: 1px solid var(--line);
       text-align: left;
       font-weight: 600;
       letter-spacing: .02em;
     }
     .chapter-content .split td {
       width: 50%;
       padding: .55rem .8rem;
       border: 1px solid var(--line);
       vertical-align: top;
     }
     .chapter-content .caption {
       margin: -1.2rem 0 2rem;
       color: var(--muted);
       font-size: .82em;
       line-height: 1.45;
       text-align: center;
     }
     @media (max-width: 52rem) {
       .chapter-content .vid-pair {
         grid-template-columns: 1fr;
         max-width: 20rem;
       }
       .chapter-content .split { font-size: .86em; }
       .chapter-content .split td { padding: .5rem .55rem; }
     }
   </style>

Fast, Yet Cheap
===============

The previous article was about a detector: four brightness signals, a
band-pass filter, and a rule for deciding that a bump in a noisy line is a
repetition. This one is about the application that has to run it, and about
the two numbers that shaped nearly every decision in it.

The first number is a hundred milliseconds. The detector takes a sample ten
times a second, and on every sample it re-analyses the last fifteen seconds of
all four signals. Miss the deadline and you do not get a slightly late answer;
you get a gap in the signal, which is a different signal, which is a different
count.

The second number is zero. Nobody is paid to run CadenceCam and nothing it
does earns anything back. It is one person's project, written in the evenings,
deployed from a laptop, and it has to stay inside Google Cloud's free
allowances — not as a stretch goal, but as a condition of existing at all.

Those two budgets normally pull in opposite directions. Fast usually means
more machine, and more machine is exactly what a free allowance does not
contain. Here they happen to agree, because of one decision made early and
never seriously revisited: **do the arithmetic where the data already is.** The
frames are in the browser. The browser has a processor. Everything else
follows from refusing to move the data somewhere more expensive.

One language on both sides of the wire
--------------------------------------

CadenceCam is Scala 3 from end to end. The browser application is Scala.js —
the same compiler, the same language, emitting JavaScript instead of bytecode —
with Laminar for the interface. The server is Scala on the JVM, with ZIO HTTP
for the routes and Firestore for storage. Both are built by one ``sbt`` build
from one repository, on one compiler version.

The sizes are a fair summary of where the work is. The browser application is
about eight thousand lines of Scala. The server is about five thousand. And
between them sits a third project, compiled twice — once to bytecode and once
to JavaScript — that is six hundred and fifty lines long.

That small project is the entire contract between the two halves: thirty-four
shapes that cross the wire, and the fifteen route paths they travel on. The
path is not a string in the frontend that happens to match a string in the
backend. It is a constant that lives in the companion object of the type that
travels on it. Every call the browser makes is built from that constant, and a
test on the server asserts that the route the server actually declared is the
same one. Change the value and the server's suite fails; rename it and the
browser stops compiling. Either way the mismatch turns up on a laptop, rather
than as a 404 on a phone, in a gym, with no console open.

The codecs are derived from the same definitions, so nothing describes a
payload twice. There is no schema file, no generator step, no second
description that can fall behind the first. A field added to a message is
added once, and both ends are looking at it in the same instant; there is no
state in which one of them knows about a field and the other does not.

The reason this matters is not that it saves typing. It is that the boundary
between client and server is, in most projects, the one place where nothing
checks anything — where a typo survives until a human finds it. For a project
whose entire budget is one person's evenings, the bug you genuinely cannot
afford is the one that takes an evening to locate.

There is a second dividend, and it turned out to be the larger one. The
detector is ordinary Scala: no model, no GPU kernel, no library compiled from
another language. Code that is ordinary Scala can be taken out of the browser
and run anywhere Scala runs — including against hundreds of recorded signals,
offline, as many times as a question needs asking. That is the subject of the
last article in this series, and it would not have been possible if the
detector had been written in the browser's own terms.

A build with no JavaScript in it
--------------------------------

There is no ``package.json`` anywhere in the repository. No bundler, no
``node_modules``, no separate frontend pipeline, no second thing to deploy.

The Scala.js linker runs as a *resource generator for the backend*. Its output,
``main.js``, is written into the server's managed resources alongside the
hand-written ``index.html``, the stylesheet, the web-app manifest, the icons
and the legal documents. The server's own JAR therefore carries the browser
application inside it. One build produces one artifact, that artifact becomes
one Docker image, and one ``gcloud run deploy`` ships the client and the server
together or not at all. There is no window in which a new frontend is talking
to an old backend, because there is no way to deploy one without the other.

One small thing happens to the bundle on the way through. The build prepends a
single line that records the version and build time into the browser's own
storage, so the About panel can display the build the browser is actually
running next to the build the server believes it is serving. The comment in
the build file explains why it exists, and it is not a hypothetical: a browser
holding a cached bundle is indistinguishable from one that has picked up the
latest, and hours of test results have been read as detector behaviour when
they were an old build on one phone.

The server never watches the exercise
-------------------------------------

Here is the division of labour, which is the whole architecture in one table.

.. raw:: html

   <table class="split">
     <thead>
       <tr><th>In the browser</th><th>On the server</th></tr>
     </thead>
     <tbody>
       <tr><td>Reading the camera, ten times a second</td><td>Who is signed in</td></tr>
       <tr><td>Four quadrant brightness means per frame</td><td>Which device is counting</td></tr>
       <tr><td>The band-pass filter, re-run on every sample</td><td>Three numbers, every ten seconds</td></tr>
       <tr><td>Peak detection, and agreement between quadrants</td><td>The account's weight, exercises and factors</td></tr>
       <tr><td>The repetition count and the pace</td><td>The finished workout, kept as history</td></tr>
       <tr><td>Calories, projections and the live graphs</td><td>An offer, an answer, a few candidates</td></tr>
     </tbody>
   </table>

The left column runs at ten hertz. Four quadrants at ten samples a second is
forty numbers a second, each one distilled from about two and a half thousand
pixel reads, and each one triggering a fresh pass of the filter and the peak
detector over the last fifteen seconds of all four signals.

The right column runs at a tenth of a hertz. While a workout is in progress,
the counting device sends the server three numbers — the repetition count, an
accumulator the dashboard needs for frequency-based calories, and how long the
set has been running — once every ten seconds.

Consider the alternatives honestly. Uploading video is megabits per second per
user, a bill that scales with the number of people exercising, and it moves the
detector's hundred-millisecond deadline to the far end of a round trip.
Uploading just the four brightness signals is far cheaper — but it is still
forty values a second instead of three every ten, and the analysis then has to
run somewhere that is being billed for it. Neither buys a single thing the
browser was not already able to do.

Three separate properties fall out of the same decision. It is cheap, because
the traffic scales with workouts rather than with repetitions. It is fast,
because the count appears the moment the camera sees the movement, with no
round trip between the two. And it is private in a way a policy document
cannot be: there is no upload path for the picture, so there is nothing to
promise about what happens to it.

.. raw:: html

   <div class="vid-pair">
     <div class="vid-short">
       <iframe
         src="https://www.youtube-nocookie.com/embed/3n8kEMi7rxU"
         title="CadenceCam counting, recorded on the counting device"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
     <div class="vid-short">
       <iframe
         src="https://www.youtube-nocookie.com/embed/IOAEhdDSmDM"
         title="CadenceCam counting on another device, recorded on screen"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
   </div>

.. container:: caption

   Two screen recordings taken on the counting device itself. The count, the
   seconds-per-repetition status line, the signal-strength figure and the four
   live quadrant graphs are all drawn from numbers that never leave the device.

The second screen is not a client of the server
-----------------------------------------------

A phone propped where it can see the machine is a poor display. It is three
metres away, face-on to a moving leg, and the person exercising is not going to
walk over and squint at it. So a second device — a tablet, a laptop, another
phone — shows the count, the pace and the calories while the first one counts.

The obvious way to build that is for the counter to post each reading to the
server and the dashboard to poll for it. It is also the worst of the available
options. Every reading becomes two requests; the latency is whatever the poll
interval is; and the server acquires a job it did not previously have, which is
holding the live state of a workout in progress.

What actually happens is that the two browsers talk to each other. A WebRTC
data channel is opened directly between the counting device and each watching
device, and the readings travel across it. The server's only role is the
introduction: an offer, an answer and a handful of connection candidates, filed
under the account in Firestore and handed to whichever end is waiting for them.
Once the channel is open the server is not part of the workout at all.

The ICE server list is empty — no STUN server, no TURN relay. The two devices
are expected to be on the same network, which is the only arrangement that
makes physical sense for a phone on a tripod and a tablet on the handlebars,
and it means the readings never reach the public internet, let alone a relay
somebody has to pay for.

The decisive argument for this was not cost, though. A live room held in one
server process requires both devices to land in that same process, and nothing
about how a platform scales will guarantee that. The deployment happens to be
capped at a single instance today — but a design that depends on that cap is a
design that can never be uncapped. Two browsers that have exchanged candidates
do not care which instance introduced them, or whether it is still running.

What is left on the server is a post box, and it is polled at rates chosen to
be boring: every three seconds while a counter watches for a dashboard that may
have appeared, every half second while a link is actually being negotiated, and
not at all on the watching side once its channel is open. Readings are sent when what
the counter would say changes, not on a timer. Connection diagnostics are filed
in a different place from the exchange itself, because one diagnostic per
connection-state change, against a single offer and a single answer, will
otherwise bury the two messages that pairing actually depends on.

.. raw:: html

   <img class="phone"
        src="/assets/cadencecam/counter-live.gif"
        alt="The CadenceCam Counter on a phone, the count rising while four live quadrant graphs scroll beneath it.">

.. container:: caption

   The counting device, with no server in the loop. Everything moving on this
   screen was computed in the browser that is showing it.

Who owns the arithmetic
-----------------------

The counter sends a measurement. It does not send a conclusion.

What crosses the data channel is the repetition count, the frequency
accumulator, the elapsed time, the status line and a couple of flags. What does
*not* cross it is calories — because the counting device has no business
knowing what anybody weighs. The dashboard holds the account's settings, so the
dashboard does the arithmetic: weight, the chosen exercise's factor, and
whether that exercise counts by repetitions or by frequency.

.. container:: shots

   .. image:: /assets/cadencecam/dashboard-screen.png
      :align: center
      :alt: The CadenceCam Dashboard showing 70 reps and 61.3 calories, each with a per-minute rate and a thirty-minute projection, above the status line "Counting · 1.1s/rep".

Two of the numbers on that screen arrived from the phone: the count and the
clock. Everything else on it — the calorie total, both per-minute rates, both
half-hour projections — was worked out by the device displaying it, out of that
measurement and the settings below.

.. container:: shots

   .. image:: /assets/cadencecam/settings-screen.png
      :align: center
      :alt: The CadenceCam settings panel, showing weight in kilograms, a default factor, and a list of exercises each with a counts-by choice and a factor.

None of that is known to the counting device, and none of it needs to be.
Choosing a different exercise re-renders a dashboard; it does not involve
renegotiating anything with a phone across the room. When a dashboard asks for
a different exercise, the identifier travels to the counter as an opaque string
which the counter merely repeats to everything else watching — it never looks
up what the string means, and it could not calculate a calorie if it wanted to.

One detail of the dashboard is a deliberate inversion of the usual rule. The
status line along the bottom — *Counting · 1.1s/rep* — is sent across the
channel as finished text, not as a state for the dashboard to render in its own
words. The two screens are supposed to read identically, and the only way to
guarantee that is to let one of them do the wording and have the other repeat
it.

Scale to zero, and the heartbeat that goes with it
--------------------------------------------------

The server runs on Cloud Run, which starts a container when a request arrives
and bills for the time it spends serving. When nobody is exercising there is no
container and there is no bill. For an application with one regular user and a
few test devices, "nobody is exercising" describes almost the entire week.

That model has one awkward interaction with a workout, which is a long-lived
thing happening on a platform that has no concept of one. The ten-second
progress report answers both halves of it. It keeps the account's record
roughly current — the record that a dashboard's Stop turns into a history row,
and the mark whose age decides when an abandoned set should be closed. And the
traffic itself is what stops the instance being reclaimed while somebody is
mid-set. Unchanged totals are reported too, deliberately: reporting only when
the count changes would go silent during a rest, which is precisely the moment
a counting session must not quietly evaporate.

Nothing live depends on that record, which is the point. A counter that is
reloaded in the middle of a set resumes from the browser's own storage, and a
dashboard gets its count over the data channel. The server's copy is the
history, not the backup.

The same thinking removed the last background job. A workout whose most recent
report is more than ten minutes old is closed as idle — not by a scheduler, not
by a cron job, not by a timer in some process, but by whichever request next
happens to look at that account. There is nothing to keep alive in order to
have something expire, which is the only kind of expiry that is free on a
platform that scales to zero.

A backend that is added to, not edited
--------------------------------------

The server's routes are not registered in ``Main``. At startup, the backend
scans its own classpath for objects implementing a small plugin interface and
finds twenty-three of them: login for three identity providers, session
refresh, logout, the account's settings, workout control, workout history, the
progress reports, the peer post box, trace capture, the bench's test events,
and so on. Each one declares an identifier, its routes, and the capabilities it
needs — Firestore, the session store, the HTTP client — as a value the loader
resolves against what the host actually has.

A plugin whose capabilities are missing is skipped and reported, not fatal. A
duplicate identifier, a conflicting route, an incompatible interface version or
an exception during initialisation isolates that plugin and leaves the rest of
the server running. The optional diagnostic plugin is a separate JAR that is
only on the classpath when the developer's own configuration enables it, so a
facility that should not exist in a deployment is genuinely absent from it
rather than merely switched off inside it.

This is not team-scale machinery; there is no team. It is a hedge against the
only reviewer this code will ever get, which is the same person six months
later. Adding a feature should not require remembering to edit the file that
starts the server, because that registration line is exactly the thing that
gets forgotten.

The static files follow the same instinct. There is no file server and no
document root. There is a list of names — the index, the stylesheet, the
bundle, its source map, the manifest, the icons, and the four public documents
— each mapped to a route that hands back a classpath resource. A path that is
not on the list cannot be served, which is a far smaller thing to reason about
than a directory.

What the free tier actually absorbs
-----------------------------------

It is worth putting the numbers next to each other.

While a set is running, the counting device makes roughly forty-six requests a
minute: twenty checks that it is still the device holding the counting role,
twenty polls of the signalling post box for a dashboard that might have
appeared, and six progress reports. A half-hour workout is therefore something
like fourteen hundred requests and a hundred and eighty small writes. At rest,
an account is one document, plus one subdocument per workout kept as history,
plus a few signalling rows that the next offer prunes behind it.

Note what that breakdown says. Forty of those forty-six requests a minute are
housekeeping — am I still the counter, has anyone come to watch — and they
happen whether or not a single repetition is being performed. A counter sitting
idle with its screen open is very nearly as chatty as one in the middle of a
set. What the exercise itself contributes is six requests a minute, which is
the clearest possible statement of where this application's work is not
happening.

Cloud Run's free allowance is a monthly quantity of request time and memory;
Firestore's is a daily quantity of document reads and writes. One person's
workouts and a handful of test devices fit inside both with room to spare, and
the project has so far run entirely within them.

The honest reason it is free is that there is one user. But the *shape* is the
part that would survive more of them. Nothing the server does scales with
repetitions. The forty numbers a second — the part that genuinely scales with
how much exercise is happening in the world — never becomes traffic at all. It
stays on a device that somebody else already bought, already charges, and is
already holding.

Where it would stop being cheap
-------------------------------

Three places, and it is worth being specific about them.

**The first page load is enormous.** The deployed ``main.js`` is 8,252,441
bytes, served uncompressed, with a cache lifetime of zero. The size is the
output of Scala.js's fast linker rather than its optimising one — the quicker
link and the fatter bundle. The expiry is zero on purpose, and the build says
why: every deployment is still a test deployment, and a cached stylesheet
outliving a server restart hides a change that was in fact shipped. Each is a
line of build configuration away from being otherwise. For now the price is
paid on every page load, by a developer, on a home network — and it would be
the first thing to change on the day a stranger opened the app on mobile data.

**One instance is a ceiling, not a floor.** The service is deployed with a
maximum of one instance. It bounds what a burst of traffic can start, which is
a reasonable thing to want when the bill is personal — but it also means that
real concurrent load would queue rather than scale. Nothing in the design
depends on the cap any more, now that every request reads its state from
Firestore and the live path is peer-to-peer, which means raising it is a flag
rather than a rewrite. And a container that has scaled to zero still has to
start a JVM before it can answer, so the first request after a quiet night pays
for the privilege of being free all night.

**The detector is written twice.** One language on both sides of the wire is a
real saving, and it stops at the edge of the browser. The native Android and
iOS Counter is a Flutter application — forty-six hundred lines of Dart — with
its own ten-hertz four-quadrant acquisition and its own copy of the detector. A
second implementation of the one algorithm is exactly what a shared project
exists to prevent, and every tuning decision now has to land in both of them.
That is the real price of a native client, and it is paid in the only currency
this project is ever short of.

What comes next
---------------

Everything above is a set of decisions. What makes them more than opinions is
that the thing works — a phone on a tripod counts a stranger's exercise
machine correctly — and that is a claim about testing, not about architecture.

The next article is about how an application whose input is the physical world
gets tested at all: the automated suites that can run on a laptop, the
remote-controlled bench rig built to animate a known cadence at a camera and
mark its own answers, and the failures that only ever appeared when a human
pointed a real phone at a real machine in a real room.

The one after it is about what that testing produced. Every threshold in the
detector — the prominence floor, the window length, the tolerance, the
corroboration requirement — was first chosen by reasoning, and then replayed
against a library of recorded signals. Several of them were wrong. That is the
article about how a counter that was *about right* became one that counts
exactly, and it is the one where the recorded traces, the offline replays and
the ordinary-Scala detector all turn out to have been the same decision.
