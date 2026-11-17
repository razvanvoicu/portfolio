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
     .chapter-content .plot {
       margin: 1.7rem 0 .6rem;
     }
     .chapter-content .plot svg {
       display: block;
       width: 100%;
       height: auto;
       border: 1px solid var(--line);
       border-radius: .9rem;
       background: var(--page);
     }
     .chapter-content .plot text {
       font-family: inherit;
       fill: var(--muted);
     }
     .chapter-content .plot .lead { fill: var(--ink); font-weight: 600; }
     .chapter-content .ledger,
     .chapter-content .bands {
       width: 100%;
       margin: 1.7rem 0 2rem;
       border-collapse: collapse;
       font-size: .92em;
     }
     .chapter-content .ledger th,
     .chapter-content .bands th {
       padding: .6rem .8rem;
       border: 1px solid var(--line);
       text-align: left;
       font-weight: 600;
     }
     .chapter-content .ledger td,
     .chapter-content .bands td {
       padding: .55rem .8rem;
       border: 1px solid var(--line);
       vertical-align: top;
     }
     .chapter-content .ledger td:nth-child(2) { white-space: nowrap; text-align: right; }
     .chapter-content .bands td:first-child { white-space: nowrap; font-weight: 600; }
     .chapter-content .bands td:nth-child(2),
     .chapter-content .bands td:nth-child(3),
     .chapter-content .bands td:nth-child(4) { white-space: nowrap; text-align: right; }
     .chapter-content .caption {
       margin: 0 0 2rem;
       color: var(--muted);
       font-size: .82em;
       line-height: 1.45;
       text-align: center;
     }
     @media (max-width: 52rem) {
       .chapter-content .ledger,
       .chapter-content .bands { font-size: .82em; }
       .chapter-content .ledger td,
       .chapter-content .ledger th,
       .chapter-content .bands td,
       .chapter-content .bands th { padding: .45rem .5rem; }
     }
   </style>

Fine-Tuning
===========

A detector that watches the world has numbers in it, and somebody has to choose
them. How far must a peak stand above its surroundings before it is a
repetition rather than a ripple? How long a stretch of signal should the
decision be made over? How much may two quadrants of the same frame disagree
before one of them is lying?

There are fifteen such numbers in this one, and every one of them started life
as an argument. A plausible argument, in most cases, made from how a camera
ought to behave and how a person ought to exercise. The trouble with a
plausible argument is that it produces a value with no error bar and no way to
tell whether it is right — and when the thing being tuned is a filter watching
a limb move through a patch of light, the arguments turn out to be wrong in
ways nobody would have guessed, and wrong in a different direction each time.

This article is about what happened when the arguments were replaced with
recordings. It is the last of four, and the one the other three were building
towards: a library of real signals, captured from real phones watching real
movement, against which a proposed change to any of those fifteen numbers can
be replayed as many times as the question needs asking.

Fifteen numbers in one place
----------------------------

Almost everything the detector can be tuned by lives in a single immutable
record called ``DetectorSettings``. It is an ordinary Scala case class with
fifteen fields and a default for each, and it exists in that shape deliberately
— its own comment says it is gathered in one place *so it can be settled against
recordings rather than argued about*. One more number, how long a stretch of
signal the analysis runs over, lives next door with the buffer that holds it,
and it has a section to itself below.

The fields are the whole of the detector's behaviour. The sampling rate, ten
hertz. The band-pass edges, half a hertz to two. The closest two repetitions
may fall, five samples. The prominence threshold, which is a floor of four
units or one and a half times the window's own activity, whichever is larger.
How much signal must accumulate before a cadence may be claimed, a hundred and
fifty samples. How closely two quadrants' periods must match, a quarter. How
many peaks in a row make a sustained movement, five. How far a quadrant's tally
may exceed its neighbour's and still be believed, two. How far a peak's own
quadrant must come back down afterwards, a fifth of how far the others did.
How tall a peak must stand against the repetitions before it, a half. How far
back *before it* reaches, ten repetitions. How many recent repetitions the
reported pace is averaged over, ten. And twenty samples dropped at the front of
every window while the filter settles.

**The most important line in that file is the one that admits what is not
known.** The record's comment reads: the values began as reasoning; several
have since been measured against recorded signals, and where one has, its
comment says against how many recordings and what the change did; the rest are
still the reasoned value. That distinction is maintained field by field. Four
of the fifteen now name the pool of recordings they were replayed against and
what moved when they changed; a fifth rests on a measurement of its own. The
other ten still say, in effect, *this seemed sensible and nothing has
contradicted it yet*.

That is a less satisfying state of affairs than a detector where every constant
is justified, and it is a far more honest one. A reader of the code can tell at
a glance which numbers are load-bearing evidence and which are placeholders
that have simply never been challenged, and so can the person who wrote them, a
year later, at the point of wanting to change one.

What a recording is
-------------------

The counter can capture what it is seeing. The control sits in the menu on the
counting phone, and the bench rig described in the previous article presses it
automatically after every test, so a full suite leaves six recordings behind
without anyone touching the handset.

What gets sent is deliberately blunt: a JSON document holding the sample rate,
four named series of up to three thousand six hundred numbers each — six
minutes of quadrant brightness at ten hertz — the count the detector had
reached, the lock state written out in words, an optional note, what the camera
reported it was capable of, what became of the attempt to hold its exposure
still and at which sample that settled, and which handset recorded it.

**Each of those fields is there for a stated reason.** The
lock state is in words rather than inferred afterwards, so a replay knows what
the detector believed at the time rather than what a rebuilt detector would now
believe. The camera's capabilities are carried because they differ by device in
ways that decide whether the controls can be held still at all, and there is no
other way to read them off a phone. The control outcome sits in the same record
as the signal it may have disturbed, so the two can be read against each other
instead of against a wall-clock timestamp and a hopeful memory of when the
picture changed. And the device is named because two handsets pointed at the
same panel have produced recordings that count quite differently, and nothing
else in a trace says which was which.

The buffer is taken whole rather than from a chosen window, for the reason that
makes recordings useful at all: what makes a trace worth keeping is usually
something that *already happened*, and the interesting part is often just before
the moment somebody reached for the button.

The replay, and the control it needs
------------------------------------

None of this would be possible if the detector were a stream. It is not. The
band-pass filter runs over the whole buffer from rest on every sample rather
than carrying state between calls, which keeps its output a pure function of
the samples; the analysis of a channel is a function of that channel's samples,
its quadrant, and a settings record; and the settings record is immutable with
a default for every field. Replaying a recording against a changed detector is
therefore a matter of constructing ``DetectorSettings(prominenceFloor = 4.0)``
and running the same code over stored numbers.

**That is the whole trick, and it is not a trick at all — it is what ordinary
code buys you.** There is no model to retrain, no inference server, no
checkpoint. There are a few hundred lines of signal processing with their
parameters lifted into one record, which means the expensive part of answering
"what if the floor were four?" is reading the recordings, not rebuilding the
system.

The expensive part of answering it *correctly* is something else: the control.
Every candidate change is replayed across the whole pool with current behaviour
run alongside it, and the rule is that the control must reproduce the counts
the phones actually reported at the time. A control that does not is a sweep
that means nothing, however good the candidate's numbers look — and a control
that had quietly stopped reproducing them has invalidated whole sweeps on this
project. The recordings are evidence; a replay is only evidence if the
unchanged detector still agrees with what the unchanged detector did.

Six of those sweeps follow in detail, and one that was run the same way and
then thrown out.

.. raw:: html

   <table class="ledger">
     <thead>
       <tr><th>What changed</th><th>Replayed over</th><th>What moved</th></tr>
     </thead>
     <tbody>
       <tr>
         <td>A peak counts only where the movement came back</td>
         <td>24</td>
         <td>Correct counts went from four in twelve to ten; nothing correct became wrong</td>
       </tr>
       <tr>
         <td>The analysis window shortened from a minute to fifteen seconds</td>
         <td>the same recordings</td>
         <td>Final repetition delayed 20–30s became 7–11s; counts unchanged at exactly 100</td>
       </tr>
       <tr>
         <td>Both quadrants of the pair tallied, the larger believed</td>
         <td>59</td>
         <td>Counted exactly right: 19 became 36</td>
       </tr>
       <tr>
         <td>Every agreeing quadrant tallied, bounded by corroboration</td>
         <td>65</td>
         <td>Counted exactly right: 41 became 47; no runaway totals</td>
       </tr>
       <tr>
         <td>A peak measured against the repetitions before it</td>
         <td>88</td>
         <td>Exactly right 61 became 64; counts over 100 fell from 15 to 7; worst count 131 became 101</td>
       </tr>
       <tr>
         <td>The prominence floor lowered from five to four</td>
         <td>53</td>
         <td>Two counts recovered, none lost; worst count anywhere 103</td>
       </tr>
       <tr>
         <td>The wait for a return taken from the cadence being kept</td>
         <td>65</td>
         <td>Standing delay 2.1s became 1.3s; one count changed, from 103 to 102</td>
       </tr>
       <tr>
         <td>The strength bands moved to where counting degrades</td>
         <td>452</td>
         <td>The “strong” boundary moved from 3.13 to 2.0</td>
       </tr>
       <tr>
         <td>A repetition refused if it arrives too soon <em>(reverted)</em></td>
         <td>105</td>
         <td>Five over-counts removed, nine recordings lost one each; exactly right 75 became 71</td>
       </tr>
     </tbody>
   </table>

.. container:: caption

   Each row is a sweep across every recording in the pool at the time, with the
   unchanged detector run alongside it as a control. The pool grew as the bench
   produced more, so each decision was settled against the evidence that
   existed when it was taken.

The hundred-and-first repetition
--------------------------------

Every bench test run with a dark object on a light background came in exactly
one over. A hundred repetitions performed, a hundred and one counted, and the
extra one arrived at the instant the object left the frame at the end of the
set.

The cause is a property of the filter, and it is worth stating slowly because
it is the clearest example in the project of a correct component producing a
wrong answer. A band-pass filter is blind to a constant. A level that rises and
*stays* and a level that rises and *falls back* both decay to zero in it at the
same rate, because the filter has no way to express the difference. The peak
detector then looks for local maxima in what the filter produced, and finds
one at the departure.

Which way the error points depends on the contrast. With a light object on a
dark ground, the object leaving is a *trough*, and a trough at the end does no
harm — it gives the last real peak the footing it needs. With a dark object on
a light ground, the object leaving is a peak of its own, and it gets counted.

.. raw:: html

   <div class="plot">
     <svg viewBox="0 0 790 446" xmlns="http://www.w3.org/2000/svg" role="img"
          aria-label="Two stacked plots of the same eight seconds of quadrant brightness: the raw signal, in which the disc's departure is an obvious step that never returns, and the band-passed signal, in which the departure is a local maximum indistinguishable from the five real crossings.">
       <text class="lead" x="58" y="28" font-size="17">Quadrant brightness, as the camera recorded it</text>
       <g stroke="var(--line)" stroke-width="1">
         <line x1="58" y1="53.2" x2="742" y2="53.2"/>
         <line x1="58" y1="99.3" x2="742" y2="99.3"/>
         <line x1="58" y1="145.3" x2="742" y2="145.3"/>
         <line x1="58" y1="191.4" x2="742" y2="191.4"/>
       </g>
       <g font-size="15" text-anchor="end">
         <text x="48" y="58">220</text>
         <text x="48" y="104">210</text>
         <text x="48" y="150">200</text>
         <text x="48" y="196">190</text>
       </g>
       <path d="M 612 112 L 612 86 L 660 76" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
       <text class="lead" x="600" y="130" font-size="16">the level that rose</text>
       <text class="lead" x="600" y="150" font-size="16">and stayed</text>
       <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"
                 points="58.0,64.5 66.2,148.4 74.5,186.1 82.7,185.6 91.0,135.1 99.2,50.7 107.4,53.4 115.7,55.8 123.9,58.3 132.2,60.4 140.4,62.8 148.7,64.1 156.9,64.6 165.1,64.0 173.4,132.6 181.6,186.0 189.9,184.6 198.1,112.9 206.3,52.2 214.6,53.8 222.8,57.6 231.1,59.6 239.3,61.5 247.5,63.0 255.8,64.1 264.0,64.2 272.3,165.8 280.5,187.9 288.7,155.9 297.0,51.7 305.2,53.7 313.5,56.6 321.7,58.6 330.0,60.7 338.2,62.2 346.4,63.6 354.7,83.8 362.9,176.1 371.2,187.4 379.4,118.0 387.6,52.2 395.9,54.9 404.1,57.8 412.4,60.7 420.6,61.7 428.8,63.2 437.1,63.6 445.3,162.5 453.6,188.4 461.8,142.2 470.0,52.6 478.3,54.6 486.5,58.2 494.8,60.3 503.0,62.1 511.3,63.2 519.5,68.8 527.7,169.5 536.0,187.1 544.2,111.7 552.5,54.5 560.7,59.8 568.9,61.8 577.2,64.1 585.4,65.1 593.7,66.3 601.9,67.8 610.1,68.4 618.4,68.9 626.6,69.1 634.9,69.5 643.1,69.4 651.3,69.4 659.6,69.4 667.8,69.7 676.1,69.5 684.3,69.8 692.6,69.8 700.8,70.1 709.0,70.3 717.3,70.1 725.5,70.2 733.8,70.2 742.0,70.1"/>
       <g stroke="var(--muted)" stroke-width="1.5">
         <line x1="371.2" y1="205" x2="453.6" y2="205"/>
         <line x1="371.2" y1="200" x2="371.2" y2="210"/>
         <line x1="453.6" y1="200" x2="453.6" y2="210"/>
       </g>
       <text x="412" y="226" font-size="15" text-anchor="middle">one cycle</text>

       <text class="lead" x="58" y="250" font-size="17">The same eight seconds, band-passed</text>
       <g stroke="var(--line)" stroke-width="1">
         <line x1="58" y1="274" x2="742" y2="274"/>
         <line x1="58" y1="394" x2="742" y2="394"/>
       </g>
       <line x1="58" y1="334" x2="742" y2="334" stroke="var(--muted)" stroke-width="1"/>
       <g font-size="15" text-anchor="end">
         <text x="48" y="279">+15</text>
         <text x="48" y="339">0</text>
         <text x="48" y="399">&#8722;15</text>
       </g>
       <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"
                 points="58.0,328.2 66.2,344.0 74.5,379.8 82.7,391.5 91.0,367.2 99.2,313.1 107.4,275.9 115.7,278.3 123.9,295.3 132.2,313.4 140.4,327.0 148.7,335.2 156.9,338.5 165.1,338.6 173.4,355.4 181.6,388.7 189.9,401.0 198.1,368.5 206.3,311.6 214.6,279.7 222.8,283.2 231.1,299.6 239.3,316.1 247.5,328.2 255.8,335.1 264.0,337.8 272.3,364.9 280.5,400.1 288.7,393.6 297.0,339.1 305.2,289.4 313.5,283.3 321.7,295.6 330.0,311.7 338.2,324.8 346.4,333.1 354.7,342.3 362.9,373.5 371.2,402.7 379.4,380.4 387.6,323.5 395.9,287.5 404.1,287.3 412.4,301.1 420.6,316.3 428.8,327.5 437.1,334.1 445.3,363.0 453.6,399.7 461.8,391.1 470.0,336.6 478.3,291.5 486.5,286.7 494.8,298.9 503.0,314.0 511.3,325.9 519.5,334.5 527.7,365.9 536.0,401.1 544.2,381.6 552.5,326.2 560.7,292.9 568.9,292.9 577.2,304.9 585.4,318.2 593.7,328.1 601.9,334.2 610.1,337.1 618.4,337.7 626.6,337.1 634.9,336.3 643.1,335.4 651.3,334.7 659.6,334.2 667.8,334.0 676.1,334.0 684.3,334.0 692.6,334.1 700.8,334.2 709.0,334.3 717.3,334.3 725.5,334.1 733.8,334.1 742.0,334.0"/>
       <g fill="var(--ink)">
         <circle cx="107.4" cy="275.9" r="5"/>
         <circle cx="214.6" cy="279.7" r="5"/>
         <circle cx="313.5" cy="283.3" r="5"/>
         <circle cx="404.1" cy="287.3" r="5"/>
         <circle cx="486.5" cy="286.7" r="5"/>
       </g>
       <circle cx="568.9" cy="292.9" r="7.5" fill="none" stroke="var(--accent)" stroke-width="3"/>
       <text class="lead" x="600" y="276" font-size="16">a peak like any other</text>
       <g font-size="15" text-anchor="middle">
         <text x="58" y="436">0s</text>
         <text x="222.8" y="436">2s</text>
         <text x="387.6" y="436">4s</text>
         <text x="552.5" y="436">6s</text>
         <text x="717.3" y="436">8s</text>
       </g>
     </svg>
   </div>

.. container:: caption

   Eighty-four samples of one quadrant of one recording, kept in the test suite
   as a fixture. A dark disc circles on a light ground; the quadrant sits near
   218 and drops to about 191 each time the disc passes through it. The last of
   those passes is just before six seconds; after it the brightness returns to
   its resting level and simply stays there. Below, the project's own band-pass
   applied to those same numbers. Six local maxima, one for each time the
   brightness rose: five of them are followed by the disc passing again, and the
   sixth is not. It measures 10.3 where its five neighbours measure 11.7, 11.8,
   12.7, 13.6 and 14.5. No threshold on height, prominence or shape separates
   it from them.

**The fix is to stop asking the filter.** A repetition is a round trip — the
object enters a quadrant and leaves it again, so the brightness that moved
comes back within a period — while a weight being put down is a departure with
no return. That distinction survives in the quadrant's own raw brightness, where
the filter has not yet erased it. A peak is counted only if the level falls back
within the slowest period the band admits, by at least a fifth of how far the
other peaks in that window fell.

A fifth, specifically, because of what twenty-four recorded tests said: every
real repetition came back at least a third as far as the typical one, and every
phantom less than a seventh. A fifth sits between them, half again above the
worst phantom and a third below the weakest honest repetition. Of the four peaks
the fixture above puts to that test, the three real ones fall back by 28.6, 28.4
and 28.0 brightness units, and the departure by 1.9.

The threshold is stated as a share of the movement's own excursion rather than
as an absolute, for the same reason the prominence threshold is adaptive: how
far a repetition falls depends on contrast, framing and distance, none of which
are known in advance, while this peak measured against the others is comparable
everywhere.

Replayed over those recordings, the six suites run since the bench began
holding the figure still before each test went from four correct in twelve to
ten, with nothing that had counted correctly now counting wrong. The cost is not a
repetition but a delay: the newest peak cannot be judged until the movement has
had time to come back, so the last repetition of a set is credited up to two
seconds later, inside the pause that follows it.

A threshold carrying a minute of history
----------------------------------------

The threshold a peak must clear is the greater of a fixed floor and a multiple
of how active the surrounding window is. The adaptive half is what lets the
detector work in a dim room and a bright one without being told which it is in.
It is also, if the window is long, a way of judging the present against the
past.

That window used to be a minute. Two consequences were measured, and neither
had been predicted. The last repetition of a set waited twenty to thirty
seconds to be counted, because the threshold had been set by the set that
preceded it and the movement had to age out of the window before the final peak
could clear it. And a test run immediately after a stronger one spent its first
half-minute failing to clear a threshold that belonged to the previous test.

Fifteen seconds instead. Against the same recordings, the final delay measured
at seven and eleven seconds, with the counts unchanged at exactly a hundred.

**What makes this more than a number being lowered is the floor underneath
it.** The window cannot shrink freely: nothing is counted until five peaks have
accumulated, and after the filter's settling samples are dropped, fifteen
seconds holds about six cycles of the slowest cadence the band admits.
Shortening it further would start rejecting slow exercise rather than stale
history. A test now asserts that the window is wide enough for the
sustained-movement rule, so the two cannot drift apart as one or the other is
tuned.

Two tallies, and a second opinion
---------------------------------

This one took several attempts, and the ones that failed are the instructive
part.

A movement crosses two quadrants of the frame, and the detector locks onto the
pair whose periods agree. Which of the two *leads* the count is settled by
signal power, often by a couple of per cent — and the one that loses has
repeatedly been the one that saw every repetition. Six suites in a row came in
one short that way.

The obvious repair is to fuse the two peak trains into one. That was tried
twice and thrown away twice. The quadrants carry the same period at different
phases, so fusing them means estimating the phase between them, and the
estimate is never clean enough: one attempt reached a hundred and twenty
repetitions on a hundred-repetition test, and the more cautious one fixed four
recordings and broke four.

What worked was to stop fusing anything. Each agreeing quadrant keeps its own
tally entirely from its own peaks, and the count is the largest of them. Largest
rather than an average or a vote, because the error runs one way only: a
quadrant that does not really see the movement finds *fewer* crossings, not
more. Measured over fifty-nine recordings, the partner ran as much as a hundred
repetitions below the leader and never more than two above. Taking the larger
turned no correct count into a wrong one, and took the number of recordings
counted exactly right from nineteen to thirty-six.

**Then the bound that makes the largest safe.** A quadrant the movement barely
reaches has almost no signal; its threshold falls to the fixed floor, and the
noise it then finds can match the cadence by chance. On real recordings such a
channel reported a hundred and thirty-six where a hundred repetitions were
performed. Guarding on signal power was tried at two thresholds and let every
one of them through — the noise was not weak, it was simply not the movement.
What gives it away is the size of its claim. Two quadrants watching one
movement disagree about the *edges* of a set and never about its middle, by one
repetition and at most two, so a tally is believed only when another channel
arrived within two of it.

Comparing against the leader instead, which was the first version of this,
failed in both directions: it believed a runaway whenever the runaway happened
to be leading, since nothing bounds a leader against itself, and it could freeze
the count outright when a channel that started agreeing late won on power from a
tally of zero. A recorded suite contains exactly that — a test that counted
nothing for two minutes while reporting the previous test's total, and passed,
because the reference climbed to meet a number that was never measured.

Over sixty-five recordings from four handsets, tallying every agreeing quadrant
and bounding it by corroboration took forty-one counted exactly right to
forty-seven, with nothing correct made wrong and no runaway totals.

The speckle that counted after the set
--------------------------------------

The adaptive threshold has a failure mode at the other end of a set, and it is
the one that reads worst to a user: the count carries on rising after the
exercise has stopped.

The arithmetic is unavoidable once stated. The adaptive half of the threshold
is one and a half times the root-mean-square of the window, and noise peaks
routinely exceed one and a half times their own RMS. So a window holding nothing but noise sets a
threshold that noise clears. When a set ends and the movement slides out of the
window, the threshold decays after it, and the camera's own speckle starts
counting. One recording gained eleven repetitions that way, and another seven.

The fix measures a peak against the tallest thing in the preceding stretch of
its own channel. Within a set, that is another repetition, so every repetition
passes. After a set, it is still a repetition, so speckle does not. Both bounds
are measurements: across sixty-four recordings, cool-down noise stood at about
a third of the movement that preceded it, and no genuine repetition fell below
three quarters of its own set's median. A half sits between, a third clear of
the worst honest dip.

**The interesting part is what the memory is allowed to learn from.** It reads
the signal, not the peaks already credited — and that is load-bearing rather
than incidental. A memory that learned only from accepted peaks would stop
learning the moment it began rejecting; a room that then dimmed would ratchet
the threshold out of reach and the count would simply stop. That is a silent,
total failure, where the one it replaces is merely wrong. Auto-exposure was
measured moving a signal's amplitude by as much as forty per cent in ten
seconds, so a room that dims is not a hypothetical.

The memory reaches back ten repetitions rather than a fixed number of seconds,
so it scales with cadence — twelve seconds at a slow pace and four at a fast
one — and does not judge a repetition against a scene that no longer exists.

Replayed over eighty-eight recordings from five handsets: sixty-one counted
exactly right became sixty-four, counts above a hundred fell from fifteen to
seven, and the worst count anywhere fell from a hundred and thirty-one to a
hundred and one.

The floor that was rejecting first repetitions
----------------------------------------------

The fixed floor under the adaptive threshold was five. It is now four, and the
reason is a single recording.

Prominence is measured against the higher of the two valleys flanking a peak.
The first repetition of a set has no valley on one side: it rises out of
stillness, so the higher flank is a *resting level* rather than a trough, and
the peak scores about half what its neighbours do. One recording lost its
opening repetition on exactly that margin — 4.27 against a floor of 5, where
every later crossing of the same quadrant scored between 7.2 and 7.8, with the
same excursion in the raw brightness and the same fall afterwards.

The bench had made this worse, incidentally. Lengthening the hold before each
test made that first peak properly one-sided, where it used to have the start
of the movement beside it.

**The floor was also doing less work than when it was set.** It had been raised
to five when prominence was the only test of amplitude the detector had, and
camera shake was measured scoring as high as thirteen, so it was never what
rejected shake. A peak must now also be one the movement came back from, and
that is the test that does.

Four, on measurement. Replayed over the fifty-three recordings made on the
current bench, it recovered two counts and lost none, and nothing ran away —
the worst count anywhere was a hundred and three, through fifteen seconds of a
deliberately static scene at the end of every recording. Three gained nothing
further, so four keeps the wider margin.

Twelve recordings were excluded from that sweep, and the exclusion is the part
worth copying. They were made by an older bench that did not hold the figure
still before a test, so their first peak is not one-sided and the question
being asked does not arise for them. Leaving them in would have diluted the
result with cases that could not move either way.

A gauge that was reporting the threshold
----------------------------------------

The counting screen shows a badge saying how far the movement stands above the
background, as a multiple of the threshold it has to clear. It is a useful
thing to show someone propping up a phone: it is the difference between "this
will not work" and "move nothing, you are fine".

The boundaries between its three bands came, originally, from eight readings on
four phones. They were then re-derived by replaying the detector over four
hundred and fifty-two recorded bench tests of a hundred repetitions each, and
reading the margin each would have shown against what the phone actually
counted.

.. raw:: html

   <table class="bands">
     <thead>
       <tr><th>Margin</th><th>Recordings</th><th>Within two</th><th>Exactly right</th></tr>
     </thead>
     <tbody>
       <tr><td>2 and above</td><td>429</td><td>93%</td><td>71%</td></tr>
       <tr><td>1.5 to 2</td><td>16</td><td>75%</td><td>—</td></tr>
       <tr><td>below 1.5</td><td>7</td><td>57%</td><td>29%</td></tr>
     </tbody>
   </table>

.. container:: caption

   452 recorded bench tests, each of a hundred repetitions, grouped by the
   margin the detector would have reported. The rate is flat from a margin of
   two all the way to fifteen: past that point a stronger signal is not a better
   one.

**The old boundary for "strong" was 3.13, and it separated almost nothing.**
Tests below it landed within two repetitions 86% of the time against 94% above
— which means most of what the badge was painting amber was counting perfectly
well. A gauge that says *not quite* about a signal that counts is worse than no
gauge at all, because the remedy it invites, moving the camera closer, costs
framing and buys nothing. So "strong" moved from 3.13 to 2.0.

The lower boundary rests on far less, and the code says so where the constants
are: 23 of the 452 sat below a margin of two and only 7 below one and a half,
so where counting *stops* is known much less precisely than where it starts.

There is a second-order trap in this that is easy to walk into. The margin is
computed by dividing a peak's prominence by the detector's fixed floor, so
lowering that floor raises every margin by the same proportion. Had the bands
been stored as multiples of the floor, the change described two sections ago
would have silently re-graded every movement on every screen — and the badge
would then have been reporting a detector threshold rather than the signal. The
bands are therefore stored in prominence units, eight and six, and converted
against whatever the floor currently is.

The badge is also, deliberately, not called confidence or quality. It says
whether the movement is strong enough to be counted and nothing about whether
what is being counted is exercise: on two of four phones, a camera shaken by
typing on the same desk scored above four here while counting nothing real.

The change that was measured and not kept
-----------------------------------------

One camera in the set has a quadrant whose brightness rises and falls *twice*
for every repetition. Measured against the fundamental, the energy at twice the
cadence runs from one and a half to four times larger on that handset, where
the phones that count perfectly sit between a twentieth and a half. The extra
peak lands halfway between two real ones, and nothing about its height,
prominence or shape distinguishes it. Only its timing does.

So: refuse a candidate that arrives sooner than seven tenths of the interval
the channel is currently keeping. Seven tenths rather than eight because
exercise does not keep time — on a recording that counts perfectly, the
intervals run from 0.83 to 1.42 of their median, and a threshold at eight
tenths clips that fast tail and cost sixty-six recordings when it was tried. The
unwanted peak lands at a half, comfortably clear of both.

The expectation has to come from the peaks the channel is *showing*, never from
the ones already accepted, and that was wrong the first time round: an
expectation built from acceptances rises whenever one is refused, which raises
the threshold that refused it, and the count walks itself down to every other
repetition — measured at 23 of 37 on a recording with nothing whatever wrong
with it.

Replayed over a hundred and five recordings from six handsets, the finished
rule removed five over-counts, including the 102 on the noisy camera, and took
counts above a hundred from nine to five. It also cost nine recordings a
repetition apiece, every one of them on a handset with no doubling to remove,
so the number counted exactly right slipped from seventy-five to seventy-one.

**It was reverted.** Five over-counts removed, nine recordings each losing a
repetition, and four fewer counted exactly right is not an improvement; it is a
redistribution, and the pool said so clearly enough that no argument was
needed. The commit that made the change had said as much before it was taken:
that trade is the reason to try it on a real suite rather than assume it.

There is a postscript. The experiment then reached production by accident,
staged wholesale rather than by path, riding along with the commit before it. It
was taken back out in a commit that says what happened in plain words: it was
never validated well enough to ship, and shipping it silently is worse than
shipping it deliberately. The working tree kept the experiment; the detector
went back to what it was.

What the recordings cannot settle
---------------------------------

Four hundred and fifty-two recordings is a great deal of evidence about one
thing: a phone on a tripod watching an animated figure on a monitor, under a
bench rig's own grey backgrounds, at a cadence the rig chose. Ten of the fifteen
numbers in ``DetectorSettings`` are still the value somebody reasoned their way
to. Of the five that are not, one is a reasoned value the recordings moved, and
the others are tests that did not exist at all until a recording showed why
they had to — which is about the most that can be said for what the remaining
ten are worth.

.. raw:: html

   <div class="vid">
     <iframe src="https://www.youtube-nocookie.com/embed/H2sFeEvSYWo"
             title="CadenceCam counting a side leg raise"
             loading="lazy" allowfullscreen></iframe>
   </div>

.. container:: caption

   What the bench pool does not contain: a person, a bed, daylight, and a limb
   that is not a disc. The four traces running under the count on the phone are
   the same four quadrant signals the bench produces — and they are not all the
   same shape.

The recording above is a side leg raise, counted by an Oppo handset with the
dashboard beside it, and it is the kind of input the bench pool cannot
manufacture. Look at the four traces on the phone's screen: one quadrant shows
sharp narrow spikes, one shows broad rounded cycles, one shows small ragged
ones with more than one bump inside each. That is a single movement, seen four
ways, and the detector has to pick two of those four that agree.

So the honest statement of where this got to is not that the counter is exact.
It is that above a margin of two — where 429 of those 452 recordings sat — a
hundred repetitions come back within two of the truth 93% of the time and
exactly right 71% of the time, and that those figures are measured rather than
hoped for. Below that margin, far less is known, and the code says so.

**What the exercise actually produced was not a set of better numbers.** It was
a way of asking. The recordings are kept, the settings record stays in one piece,
and the failures found this way have synthetic reproductions in the test suite
so that they cannot come back unnoticed — the eighty-four samples plotted above
are in the repository for exactly that reason, as the fixture of a phantom that
will not be counted again. The replay tooling itself is not in the repository at
all, and that is the right way round: the durable artefacts are the evidence,
the one place the parameters live, and the tests that remember what each number
was for.

That is the engineering of it. A camera, four numbers ten times a second, a
filter anyone could write, and fifteen constants — most of the work, and all of
the interesting part, was in finding out which of those constants were lies.
