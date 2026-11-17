.. raw:: html

   <style>
     .chapter-content .vid {
       position: relative;
       width: 100%;
       aspect-ratio: 16 / 9;
       margin: 1.6rem 0 .6rem;
     }
     .chapter-content .vid iframe {
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
       margin: 1.6rem 0 .6rem;
     }
     .chapter-content .vid-pair .vid { margin: 0; }
     .chapter-content .stages {
       width: 100%;
       margin: 1.7rem 0 2rem;
       border-collapse: collapse;
       font-size: .92em;
     }
     .chapter-content .stages th {
       padding: .6rem .8rem;
       border: 1px solid var(--line);
       text-align: left;
       font-weight: 600;
     }
     .chapter-content .stages td {
       padding: .55rem .8rem;
       border: 1px solid var(--line);
       vertical-align: top;
     }
     .chapter-content .stages td:first-child { white-space: nowrap; font-weight: 600; }
     .chapter-content .stages td:nth-child(2) { white-space: nowrap; text-align: right; }
     .chapter-content .caption {
       margin: 0 0 2rem;
       color: var(--muted);
       font-size: .82em;
       line-height: 1.45;
       text-align: center;
     }
     @media (max-width: 52rem) {
       .chapter-content .vid-pair { grid-template-columns: 1fr; }
       .chapter-content .stages { font-size: .84em; }
       .chapter-content .stages td { padding: .45rem .5rem; }
     }
   </style>

Automated Testing
=================

A test needs to know the right answer.

That reads as a triviality until the thing being tested is a detector pointed
at the physical world. A phone watches an exercise machine for two minutes and
reports forty-one repetitions. Were there forty-one? You were the one
exercising, and you lost count somewhere in the thirties. Was the lighting
representative? Was the camera framed the way it would be in a gym? Was the
machine turning at a steady rate, or did you slow down when the phone beeped?

Three things are uncertain at once, and nothing in the system can tell you
which of them moved. That is not a test. It is an anecdote with a number in it.

Everything the detector's thresholds were originally set against was one of
two kinds of evidence: a synthetic signal invented to match a theory about what
exercise looks like, or a mechanical counter clicked by hand. Both turned out
to be wrong, repeatedly and in different directions. What follows is what
replaced them — three layers of testing, each able to answer a question the
one below it cannot.

The tests that need no world
----------------------------

The bottom layer is ordinary unit testing, and there is a lot of it: thirty-four
MUnit suites for the browser application and eighteen for the server, plus
small sets for the optional diagnostic plugin and the invitation tool. Five
hundred and forty-eight tests in all, and a full run takes three and a half
minutes on a laptop with no camera, no network and no Google account attached
to it.

Nearly three of those minutes are one suite. Forty-six tests push synthetic
signals — thousands of samples each — through the real detector, and they are
the only part of the run that is not close to instantaneous. As a map of where
the risk in this application lives, that is a fair one.

On the detector's side they feed synthetic signals through the real code: the
band-pass filter against known responses, peak detection by prominence and
spacing, the per-quadrant tallies and the rule that decides which of them to
believe, the rest phase, the signal-strength bands. On the server's side they
cover configuration, the discovery and isolation of plugins, capability
resolution, access policies, the account key, the idle rule, and the validation
of everything that arrives from a client.

Two things about them are worth more than the coverage figure.

The first is that the test names are sentences, and the suite reads as a
specification of the thing rather than a list of its methods. *A report that is
not a rep count is rejected rather than guessed at. Recording ids are opaque
and unguessable, so one session's captures cannot be enumerated. A channel that
has only just begun agreeing cannot freeze the count.* Six months later, the
only person who will ever read this code needs to recover what a rule was for,
and the test that enforces it is a better place to keep that than a comment
beside it.

The second is that most of the detector's tests are not inventions. They are
regressions, each one built from something that actually went wrong out in the
world, with the failure recorded in the test beside the assertion. A quadrant
that the moving figure barely reaches has almost no signal, so its threshold
falls to the floor and the noise it finds can match the cadence by chance: on a
real recording such a channel counted a hundred and thirty-six where a hundred
repetitions were performed. There is now a test that manufactures exactly that
situation and insists the count stays honest. The margin by which two quadrants
of the same movement are allowed to disagree is not a number chosen for
comfort; across sixty-five recordings they differed by one repetition, and at
most two, and the test says so.

There is an honest limit to this layer, and it is worth stating plainly: these
tests do not call Google and do not touch a live Firestore. The queries
themselves are exercised only by running the application.

A known truth, manufactured
---------------------------

The second layer is a bench rig, and the idea behind it is simple enough to
state in one sentence: if nobody can tell you how many repetitions really
happened, then build something that knows.

The bench is a dashboard that also produces the movement being counted. It runs
on a desktop screen, animating a figure at a cadence it has chosen itself, with
the counting phone on a tripod in front of it. To the phone, the bench is an
ordinary dashboard — it arrives over the same direct link described in the
previous article, watches the same readings, and sends the same commands. It is
part of the shipped application, offered only when the address bar ends in
``#test``.

Because the bench drew the movement, it knows exactly how many cycles have been
completed at every instant. The repetition count is exact by construction. And
because it is also watching the counter's readings arrive, it can compare the
two continuously rather than only at the end.

.. raw:: html

   <div class="vid">
     <iframe
       src="https://www.youtube-nocookie.com/embed/x8h_bmsREjs"
       title="The CadenceCam bench rig running a test suite"
       loading="lazy"
       allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
       referrerpolicy="strict-origin-when-cross-origin"
       allowfullscreen>
     </iframe>
   </div>

.. container:: caption

   The rig mid-suite. On the monitor, the bench: a bar pivoting about the
   bottom-left quadrant with a weight on its free end, four green crosses
   marking the quadrant centres, and a scoreboard showing what has been shown,
   what has been counted, and how far off each finished test was. On the phone,
   the Counter — seeing nothing but that screen.

What the animation has to get right
-----------------------------------

Drawing a moving shape is easy. Drawing one that stands in for exercise,
without accidentally testing something else, took several attempts.

There are three figures. A disc whose centre travels a circle, crossing every
quadrant once per cycle. A bar pivoting about the centre of the bottom-left
quadrant, its free end swinging through a quarter turn with a disc on the end of
it — a forearm and a dumbbell. And a square shuttling between two quadrant
centres and back.

The bar sweeps an arc rather than sliding along the chord between its
endpoints, and the reason is instructive. Interpolating between the two ends
would shorten the bar to seven tenths of its length at mid-swing and grow it
back again: a change in size that the exercise it stands in for does not have,
and one the detector would certainly see. The same instinct applies to the
canvas. The trajectories live on a square field centred inside whatever shape
the canvas turns out to be, because scaling horizontally and vertically by
different amounts would turn the circle into an ellipse — which is one layout
accident away, and was one.

Contrast is the single property that counting has been observed to depend on,
so it is a property of a test rather than a detail of the page. The greys come
from two bands — 32 to 63 and 192 to 221, with a hundred and twenty-eight
levels of daylight between them — and each region is filled with a 45-degree
gradient running from the bottom of its band to the top, so a test spans its
band rather than sitting at one flat tone. A suite is therefore six tests:
three figures, each run once as a light object on a dark ground and once as a
dark object on a light one.

Then there are the four small green crosses. They are there to aim the camera
by: the trajectories are described in quadrants, and quadrants only mean
anything if the camera's quadrants are the canvas's. Framing by eye has been
the least reliable part of running a suite, and four marks at the exact centres
turn that from a judgement into a check. Every detail of them is a decision.
Green, because nothing else on the canvas is ever coloured and they must not be
mistaken for part of a test. A mid green rather than a bright one, so they do
not become the brightest thing in frame and skew the exposure the camera
settles on. Static, so they contribute nothing to a band-passed signal. Drawn
underneath the figure rather than over it. And a third of the size they
started at, because at the original size the object passing across one covered
and uncovered enough of it to be a signal in its own right.

The clock that must not be wrong
--------------------------------

A metronomic movement is the easy case, and the detector had already been shown
to handle it. Real exercise wanders, so the bench wanders on purpose: the
cadence averages 0.8 Hz and is modulated by a slower oscillation that takes the
instantaneous frequency between 0.6 and 1.0 Hz, swinging the full way and back
every twenty seconds. The low end is chosen deliberately close to the band-pass
filter's lower corner of 0.5 Hz — any slower and the harness would be
attenuating the movement rather than testing the counter.

That decision has a consequence most of the rig's design hangs from. With a
frequency that varies, the number of cycles completed by a given moment is the
*integral* of the instantaneous frequency, not the frequency multiplied by the
time. The two differ. Taking the easy one would put the reference count
quietly out of step with what is actually on the screen — and the difference
would then be reported as the detector's error rather than the harness's.

An oracle that is wrong does not produce no information. It produces confident
misinformation, attributed to the thing you were trying to measure.

For the same reason, the comparison is made in seconds rather than in
repetitions. Being one short means something quite different at different
speeds: at half a hertz it is two seconds of being wrong, and at two hertz it
is half of one. A tolerance expressed in repetitions would be strict in the
slow tests and lax in the fast ones. So the bench finds the moment the
reference passed the count the detector is reporting — by bisection, since
there is no closed form once the frequency varies — and reports the lag in
seconds. One threshold, two seconds, meaning the same thing everywhere.

A test is a short play in five acts
-----------------------------------

A test is not "animate a hundred repetitions and compare". Every boundary in
the sequence below exists because running them together produced a wrong
answer.

.. raw:: html

   <table class="stages">
     <thead>
       <tr><th>Stage</th><th>Length</th><th>Why it is there</th></tr>
     </thead>
     <tbody>
       <tr>
         <td>Poised</td><td>3 s</td>
         <td>A set begins with the weight picked up and held. Starting from an empty frame made the figure's arrival a step change in whichever quadrants it landed in — at the input, indistinguishable from the first half of a repetition, and with no trough before it to be measured against.</td>
       </tr>
       <tr>
         <td>Running</td><td>125 s</td>
         <td>A hundred repetitions at an average of 0.8 Hz. A hundred rather than thirty: at thirty, about half the tests failed and a different half each run, which is the signature of something intermittent rather than of a figure the detector cannot see.</td>
       </tr>
       <tr>
         <td>Holding</td><td>3 s</td>
         <td>The movement is over but the weight has not been put down. The last repetition's own return then happens in clear air, instead of tangled up with the step of the object leaving.</td>
       </tr>
       <tr>
         <td>Pausing</td><td>15 s</td>
         <td>The figure leaves the frame, which is what gives the final peak the trough that every other peak had. The detector confirms a peak from the samples that follow it, so the last repetitions of a set arrive after the movement has stopped.</td>
       </tr>
       <tr>
         <td>Settling</td><td>1.5 s</td>
         <td>The reset travels to the counting device and takes effect there. Starting to move before it has would credit the first repetitions of a new test to the tail of the last one.</td>
       </tr>
     </tbody>
   </table>

Two of those are worth unpacking, because the numbers in them were measured
rather than guessed.

The still moment at the start was one second before it was three. One second
was not enough separation: on real recordings the transient from the figure's
arrival still covered the first crossing of whichever quadrant it happened to
land closest to. Sixteen samples of separation were swallowed; nineteen
survived. The quadrant that lost its opening crossing then led the count, and
the whole suite came in one short. Three seconds puts the first crossing some
thirty samples clear, at a cost of twelve seconds across a suite of six.

Ending a test by making the figure vanish mid-swing, meanwhile, left the last
peak one-sided — worth half the prominence of its neighbours — and it went
uncounted until the detector's own threshold decayed enough to admit it.
Measured on real recordings: twenty seconds on one test, thirty on another.

The arithmetic of all this is itself asserted in a unit test. A standard suite
takes 898.5 seconds — about a quarter of an hour — and the test exists so that
whoever starts a run knows they are committing to it, rather than discovering
the length halfway through.

Watching all the way through
----------------------------

The bench compares the counter against the reference on every animation frame,
not at the end of each test. Events are recorded on the edges — the moment the
counter falls outside tolerance, the moment it comes back — because sixty
identical lines a second would bury the moment it went wrong, which is the
thing being looked for.

The most valuable of those watchers tracks stalls. A counter that stops
counting and then starts again is a different animal from one that is simply
wrong, and when it recovers there are three possibilities worth telling apart:
the repetitions performed during the stall are eventually credited, they are
silently lost, or they are made up for with interest. The bench records how
long the stall lasted, how many repetitions really happened during it, how many
were credited, and the shortfall between them.

That watcher earns its keep in a way the final total never could. One recorded
test counted nothing for two full minutes while continuing to report the
previous test's total — and *passed*. Its final number was right. Every check
that looks only at the end of a test calls that a pass, and the detector that
produced it would have gone on being considered correct.

The same suspicion applies to the commands the bench sends. A reset travels
over the direct link to the counting device, and that link drops — a phone
locks its screen, a network changes underneath it. Sent once, blind, the reset
was sometimes lost. It is now sent up to three times over four and a half
seconds, and a test that still has no acknowledgement from the far end is
recorded as unconfirmed rather than quietly trusted.

The harness is tested too
-------------------------

The bench has its own unit suites, and they are not a formality. *The phase
never runs backwards, whatever the swing. The time a rep finishes agrees with
the count at that time. The bar keeps its length throughout the swing. The
movement stays inside the band the detector passes, at every point of its
swing. A gradient stays at 45 degrees across a box that is not square.*

The stage machine is a pure function, separated from the view and tested on its
own, for a specific reason: both of the bench's own bugs have been in it.
Scoring a test schedules the next one a second and a half later, and a stage
that stayed where it was in the meantime found the pause over again on every
frame — so it scored the same test ninety times and sent ninety resets to the
other device. *A test is scored exactly once, however many frames find the
pause over* is now an assertion rather than an assumption.

If the oracle is wrong, you are not testing the detector. You are measuring the
harness and publishing the result under the detector's name.

What a run leaves behind
------------------------

A suite produces two kinds of evidence, and both outlive the run.

The first is the stream of observations: test started, reset unconfirmed,
discrepancy, stalled, recovered, movement finished, passed, failed, suite
finished. Each one carries the run it belongs to, the test's name, the reference
count, the acquired count, the lag in seconds and how far into the test it
happened. They are filed on their own rather than under anybody's workout,
because a run is about the detector's behaviour rather than about anyone's
exercise, and the comparisons worth making are between runs.

Each event also carries the handset. That field is chosen by hand at the bench,
from a list of names the operator gave the devices themselves, because nothing
can be read from the browser instead: the user-agent string names an engine and
an operating system, Chrome reports every Android model as "K", and nothing in
it says which of a phone's cameras was opened. It earns its place. Runs of the
same suite, from the same account, on different handsets have come back exactly
right, one short on every test, and fifteen short — and without that field the
only way to tell those apart afterwards was to ask whoever ran them what had
been on the desk at the time.

The second kind of evidence is the recordings. At the end of each test, during
the pause, the bench asks the counting device to capture its signal buffer —
the four quadrant brightness traces, as they were, at ten samples a second. The
ordering there is load-bearing: the reset that prepares the next test also
clears the buffer, so the capture is asked for first and given three seconds to
reach the server, because a lost recording costs the entire test that produced
it.

A run that goes wrong can be abandoned, which deletes the events it filed and
the recordings it asked for, and deliberately leaves the workout alone — that
belongs to the account rather than to the run.

Driving the real browser
------------------------

The third automated layer is an end-to-end suite that drives an actual Chrome
through Selenium against the real, running application, rather than calling
backend code directly. It lives in its own project, and the single command that
runs it is less a test invocation than a piece of defensive choreography:
launch a headless Chrome and immediately quit it, so a broken install fails
fast with a clear message instead of confusingly inside the first test; check
that the application's port is not already taken, by a leftover container from
manual testing, say, so the suite cannot silently exercise the wrong process;
start the server in the background under coverage instrumentation; poll it
until it answers; run the tests; and then stop it by walking the entire process
tree, because the server is started through a nested build process that forks a
JVM of its own, and stopping only the parent would leave that JVM alive and
still holding the port.

What it then asserts is deliberately modest, and the reason is a boundary
outside the project's control. Google actively blocks sign-in from
WebDriver-controlled browsers — the interactive form specifically, as an
anti-automation measure — and there is no emulator to stand in for it, because
Google Cloud's emulators cover databases and messaging, while the Firebase
Authentication emulator only intercepts calls made through the Firebase SDK and
this application speaks OAuth 2.0 directly.

So signing in is done by hand, once. A build task leaves three things running:
the local Firestore emulator, a coverage-instrumented server pointed at it, and
a visible Chrome with remote debugging enabled on a profile of its own. You
sign in there and leave the window open; a later run attaches to that same
browser over the DevTools protocol instead of launching a fresh one, and walks
the signed-in application — opening About and checking it reports the account
and every build field, then stepping into the dashboard and the counter and
back out. The emulator keeps everything in memory, so it has to stay up for the
whole interval between the sign-in and the run.

All of this traffic is instrumented by the same coverage recorder as the unit
tests, and the measurements accumulate rather than overwrite, so one report at
the end can reflect every layer that was run.

What the rig cannot do
----------------------

A desktop screen is an honest movement and a dishonest scene. It is flat,
evenly lit, free of reflections, and it never moves. Everything that makes a
real room difficult is absent from it by construction, which is exactly why the
rig can measure what it measures — and exactly what it cannot tell you about.

The camera is the clearest example. A phone camera is an active participant: it
meters, it adjusts, and it will happily re-expose a scene in the middle of a
set. The application answers that by holding exposure, white balance and focus
still once metering has settled, and nearly everything learned about doing so
was learned by pointing real handsets at real things. Switching a control to
manual puts some Android cameras into a state where the picture goes dark.
Asking for a fixed shutter without also fixing the sensitivity leaves the
sensitivity wherever the driver puts it — as low as 21 on a camera that was
metering at 100, which is a picture four stops darker than the one it replaced.
And an attempt can report success and still be wrong: the controls were held,
and held at the wrong value. "Held" alone says nothing about whether the
picture is usable, which is why the outcome now records what the camera
reported afterwards, verbatim.

.. raw:: html

   <div class="vid-pair">
     <div class="vid">
       <iframe
         src="https://www.youtube-nocookie.com/embed/G5UqS7OyM6Q"
         title="A labelled handset counting the bench rig"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
     <div class="vid">
       <iframe
         src="https://www.youtube-nocookie.com/embed/14f0PsDzTlQ"
         title="Adjusting the camera by hand during a bench run"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
   </div>

.. container:: caption

   Two things the rig cannot automate. Which handset is on the tripod — the
   bench's own list names twenty-three of them, front camera and back — and a
   hand reaching in to set exposure, sensitivity, colour and focus by hand when
   the automatic choice is wrong.

Framing is the second. The crosses make the alignment checkable, but somebody
still has to do the checking, and a suite framed a little wrong is a suite
whose quadrants are not the canvas's.

The third is the breadth of devices, and it is the one the recorded numbers
keep pointing at. The same suite, the same account, three handsets, three
different answers. No amount of animation fixes that; it is answered by owning
a drawer full of phones and running the suite on all of them.

And the fourth is the actual subject. The rig proves that the detector counts a
known movement correctly. It says nothing about whether the thing in front of
somebody's phone in a real room produces a signal of the kind the rig has been
feeding it — and a real room has reflective metal in it, and a window behind
the machine, and movements with more than one event in every cycle. That question is answered by pointing real phones at real
machines, and the recordings that come back from doing so are the subject of
the article that follows.

What comes next
---------------

The rig does not tune anything. It produces evidence: a few hundred scored
tests, each with a known truth, a recorded answer, a named handset, and a
minute of the four raw signals that produced it.

The last article in this series is about what happened when every tuning
decision in the detector was replayed against that evidence, offline, as many
times as a question needed asking. The prominence floor, the window length, the
tolerance, the corroboration margin and the signal-strength bands were all
first chosen by reasoning about signals nobody had recorded, and every guess
made that way turned out to be wrong in a different direction. The recordings
are the only reason anybody could tell which.
