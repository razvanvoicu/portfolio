.. raw:: html

   <style>
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
     .chapter-content .sums {
       width: 100%;
       margin: 1.7rem 0 2rem;
       border-collapse: collapse;
       font-size: .92em;
     }
     .chapter-content .sums th {
       padding: .6rem .8rem;
       border: 1px solid var(--line);
       text-align: left;
       font-weight: 600;
     }
     .chapter-content .sums td {
       padding: .55rem .8rem;
       border: 1px solid var(--line);
       vertical-align: top;
     }
     .chapter-content .sums td:first-child { font-weight: 600; }
     .chapter-content .sums td:nth-child(2),
     .chapter-content .sums td:nth-child(3) { white-space: nowrap; text-align: right; }
     .chapter-content .formula {
       margin: 1.6rem 0;
       padding: 1rem 1.2rem;
       border: 1px solid var(--line);
       border-radius: .9rem;
       background: var(--accent-soft);
       text-align: center;
       line-height: 1.9;
     }
     .chapter-content .formula .row { font-size: 1.05em; }
     .chapter-content .formula .note { color: var(--muted); font-size: .84em; }
     .chapter-content .caption {
       margin: 0 0 2rem;
       color: var(--muted);
       font-size: .82em;
       line-height: 1.45;
       text-align: center;
     }
     @media (max-width: 52rem) {
       .chapter-content .sums { font-size: .82em; }
       .chapter-content .sums td,
       .chapter-content .sums th { padding: .45rem .5rem; }
       .chapter-content .formula { padding: .8rem .7rem; font-size: .92em; }
     }
   </style>

Practical Usage
===============

The four articles before this one were about how the counting works. This one
is about the part the counting is in service of, which is a number of
kilocalories — where it comes from, why it is not a measurement of you, and how
to make it mean something for the particular piece of equipment in your
particular room.

The short version: there is one formula, it has four terms, and one of those
terms is a setting you are expected to calibrate yourself. Most of what follows
is about that one term.

Pointing it at the machine
--------------------------

None of the arithmetic matters until something is being counted correctly, so
the practical part first.

Sign in on a phone and it opens the Counter and asks for the camera. Prop it
where the moving part of the exercise fills a good share of the picture — not
the whole body, not the whole room, the part that moves. For the first fifteen
seconds or so nothing appears: the detector is working out whether there is a
cadence there at all. Then the count arrives, including the repetitions
performed while it was deciding.

**The badge beside the status line is the thing to look at while you are still
adjusting the phone.** It says how far the movement stands out from its
background, as a multiple of the threshold a repetition has to clear. Green
counts reliably. Amber is marginal. Red will miss repetitions. If it is not
green, move the phone rather than hoping — and the ↺ control starts the count
over, which is how you throw away the movement of climbing onto the machine.

To see the figures on something other than the phone that is counting, sign in
on a tablet and choose Dashboard. The two connect directly to each other and
must be on the same network. A workout begins only at Start — signing in does
not begin one, and neither does taking over the counting — and ends at Stop, at
sign-out, or ten minutes after the counter last reported.

The screen, and where every number on it comes from
---------------------------------------------------

.. container:: shots

   .. image:: /assets/cadencecam/dashboard-screen.png
      :align: center
      :alt: The CadenceCam Dashboard showing 70 reps and 61.3 calories, each with a per-minute rate and a thirty-minute projection, above the status line "Counting · 1.1s/rep".

.. container:: caption

   Seventy repetitions, 61.3 kilocalories, one minute and thirty-three seconds
   in. The header says which exercise's settings produced it: factor 1.25,
   counting by rep count.

Two numbers on that screen came from the phone — the count, and the clock.
Everything else was worked out by the tablet from those two and the account's
settings, and all of it can be checked by hand.

At a weight of 70 kg — the starting value, and what the settings panel further
down shows — with the factor at 1.25 and counting by repetitions, the calorie
figure is 70 × 70 × 1.25 ÷ 100 = 61.25, which the screen rounds to 61.3. **That
is the whole calculation.** No model, no lookup table, no heart rate.

The two rates are measured over the last ten repetitions rather than over the
whole session, so that watching mid-set tells you how fast you are going *now*
rather than how fast you have been going on average. The two projections add the
remainder: the total so far, plus that rate applied to the time left before the
next half-hour mark. At 1:33 there are twenty-eight and a half minutes still to
run, so 52.2 repetitions a minute reaches about 1,554 and 45.7 kilocalories a
minute about 1,360 — which is what the screen says, to within the rounding on
the rates themselves.

The calorie figure is also, plainly, nonsense. Forty-six kilocalories a minute
is roughly three times what half an hour at top sustainable effort produces for
a 70 kg adult. Nothing is broken: the factor is still the shipped default, which
was calibrated for the frequency formula and is here being applied to a rep
count. An uncalibrated factor is exactly what that looks like, and the rest of
this article is how to fix it.

The whole formula
-----------------

.. raw:: html

   <div class="formula">
     <div class="row"><strong>calories = measure &times; weight in kg &times; factor &divide; 100</strong></div>
     <div class="row">counting by <strong>rep count</strong>: measure = the number of repetitions</div>
     <div class="row">counting by <strong>frequency</strong>: measure = the sum of every repetition's own rate, in reps per second</div>
     <div class="note">the 100 exists only to put the factor on a scale a person can read and nudge</div>
   </div>

The weight is yours and is kept once for the whole account. The measure is what
the counter reported. The factor is the number you set per exercise, and it is
the only place in the formula where the particular machine, its resistance
setting, your technique and your range of movement are allowed to live.

The hundred deserves a word, because it is pure ergonomics. A factor calibrated
against a real machine lands on values like 0.0125, which is correct, unreadable
and impossible to adjust by eye — three leading zeros away from telling you
whether one exercise is harder than another. Dividing by a hundred moves the
same calibration to 1.25, where 1.25 and 1.30 are visibly different numbers and
a step of 0.05 is a real adjustment. It changes nothing about the arithmetic.

**The frequency measure is the one that needs explaining.** Every repetition
from the second onwards contributes the reciprocal of the gap since the one
before it. A repetition a second apart adds 1.0. A repetition half a second
apart adds 2.0. Over a set this sum grows with the number of repetitions *and*
with how fast they came, which means it grows with the square of the cadence —
go twice as fast for the same length of time and you do twice as many
repetitions, each worth twice as much, for four times the total.

Why there are two of them
-------------------------

They are not two approximations of the same thing, and the choice is not a
matter of taste.

Counting repetitions says every repetition costs the same. That is true of a
weight lifted the same way each time: a dumbbell curl with 12 kg moves 12 kg
through the same arc whether you take two seconds over it or four, so the
mechanical work is identical and the energy cost very nearly so. Doing them
faster gets you through the set sooner; it does not make each one harder.

Counting frequency says the opposite — that the whole of the effort is in how
fast the thing is going round. That is true of a bicycle, a rowing machine, a
stair climber. On a stepper set to a fixed resistance, the pedal travel is the
same every step; what changes between a stroll and a hard effort is purely the
rate, and the energy cost rises much faster than the rate does.

Pick the one that describes what actually varies when you push harder. If
pushing harder means *more repetitions*, count repetitions. If pushing harder
means *the same repetitions, faster*, count frequency.

What the factor is attached to
------------------------------

The factor belongs to the equipment, not to the exercise's name. "Stationary
bicycle" costs quite different amounts of effort on two machines set to two
resistances, and the factor is where that difference lives — which is why an
exercise in the settings carries a free-text equipment line as well as a name.
Two entries called "Chest press" with different machines and different factors
are the correct way to use this, not a mistake.

A factor is per exercise. There is also a default factor, used by a new exercise
until you give it one of its own, and it ships at 1.25 — a value calibrated
against a real machine rather than a placeholder, but calibrated against
*someone else's* real machine, which makes it a starting point and nothing more.

One more property matters for what comes later: when a workout is stopped from
a dashboard, the exercise, the factor, the weight and the counting mode are
frozen into that history row along with the calorie total. Change your factor
next week and last week's workouts keep the numbers they were recorded with. The
raw measurement — repetitions, the frequency sum, the duration — is kept beside
the snapshot, so an old workout can be recalculated under a new factor by
anybody willing to do the multiplication.

Calibrating it: five minutes and a lookup
-----------------------------------------

The factor cannot be derived from first principles, because it encodes things
nobody has measured: the resistance the machine is set to, how far you actually
move, how efficiently you do it. What it *can* be is anchored to published
figures for the same activity, which is the method that follows.

**One.** Pick the exercise in the settings, choose its counting mode, and leave
the factor wherever it is. Start a workout and do five minutes at the hardest
intensity you can hold for five minutes. Not a sprint, and not a warm-up — the
intensity you would describe to somebody as working hard.

**Two.** Stop the workout. Open History from the dashboard menu and export the
CSV. The row you just made carries ``duration_seconds``, ``reps`` and
``cadence_sum``, which are the raw measurement, untouched by whatever the factor
happened to be.

**Three.** Look up what that activity is generally reckoned to cost, in METs.
The standard reference is the Compendium of Physical Activities, which lists an
activity once per intensity, so what you get is a range rather than a number.

**Four.** Place yourself in that range honestly. This is the step that feels
unscientific and is not: nobody else can do it for you, and a range exists
precisely because the activity is done at different intensities by different
people. If you have been doing this exercise for years and can go faster and
longer than other people who use the same equipment, the top of the range is a
fair description of you. If you took it up last month, it is not. Pick a
percentage and write down why.

**Five.** Convert METs to kilocalories per minute, by the usual formula —
METs × 3.5 × your weight in kg ÷ 200 — and multiply by five.

**Six.** Solve the formula backwards for the factor:

.. raw:: html

   <div class="formula">
     <div class="row"><strong>factor = kilocalories &times; 100 &divide; (measure &times; weight in kg)</strong></div>
     <div class="note">measure is the <code>reps</code> column, or the <code>cadence_sum</code> column, depending on the mode</div>
   </div>

Type the result into the factor field. It takes a typed value, not only the
nudge buttons, which exists for exactly this reason.

Worked example: a stair climber, counted by frequency
-----------------------------------------------------

A stepper is a frequency exercise: the resistance does not change, only how fast
you go. Say an 80 kg exerciser who has used this machine for years.

The five-minute set comes back as 300 repetitions over 300 seconds — about sixty
steps a minute — and the CSV gives a ``cadence_sum`` of 298.0. (At one step a
second the frequency sum lands very close to the rep count, which is a useful
sanity check that you have read the right column.)

The Compendium lists stair climbing at 4.5 METs for a slow pace and 9.3 for a
fast one, one step at a time. Our exerciser puts themselves at 75% of that
range, on the grounds of being demonstrably faster and longer-lasting than other
people on the same machine: 4.5 + 0.75 × 4.8 = **8.1 METs**.

.. raw:: html

   <table class="sums">
     <thead><tr><th>Step</th><th>Working</th><th>Result</th></tr></thead>
     <tbody>
       <tr><td>Energy rate</td><td>8.1 &times; 3.5 &times; 80 &divide; 200</td><td>11.34 kcal/min</td></tr>
       <tr><td>Over five minutes</td><td>11.34 &times; 5</td><td>56.7 kcal</td></tr>
       <tr><td>Factor</td><td>56.7 &times; 100 &divide; (298.0 &times; 80)</td><td>0.24</td></tr>
     </tbody>
   </table>

.. container:: caption

   The frequency calibration. The measure is the summed rate, not the rep count,
   which is why the factor comes out well below one.

Type 0.24 into the factor field for that exercise and the dashboard will report
56.7 kilocalories for a set exactly like the calibration set — because that is
what you just told it to do.

Worked example: dumbbell curls, counted by repetitions
------------------------------------------------------

The same method, the other mode. Twelve-kilogram dumbbells, the same 80 kg
exerciser.

Five minutes of curls is not five minutes of continuous movement, and that is
fine — the clock runs through the rests on purpose, and the published figures
for resistance training include the rests too. Say the set comes back as 60
repetitions over five minutes.

The Compendium's resistance-training entries run from 3.5 METs for multiple
exercises at varied resistance to 6.0 for vigorous power lifting or body
building. At 75% of that range: 3.5 + 0.75 × 2.5 = **5.375 METs**.

.. raw:: html

   <table class="sums">
     <thead><tr><th>Step</th><th>Working</th><th>Result</th></tr></thead>
     <tbody>
       <tr><td>Energy rate</td><td>5.375 &times; 3.5 &times; 80 &divide; 200</td><td>7.53 kcal/min</td></tr>
       <tr><td>Over five minutes</td><td>7.53 &times; 5</td><td>37.6 kcal</td></tr>
       <tr><td>Factor</td><td>37.6 &times; 100 &divide; (60 &times; 80)</td><td>0.78</td></tr>
     </tbody>
   </table>

.. container:: caption

   The rep-count calibration. Same method, same weight, same 75% judgement — and
   a factor more than three times larger, because it is multiplying sixty rather
   than two hundred and ninety-eight.

**Those two factors are not comparable with each other, and that is not a
defect.** 0.24 and 0.78 are answers to different questions: one is the cost of a
unit of cadence, the other the cost of a repetition. A factor is only meaningful
beside the mode it was calibrated in, which is why the dashboard header prints
both — "factor 1.25 · rep count" — rather than the number alone.

What changing pace does to each
-------------------------------

Here is why the choice of mode matters more than the choice of factor.

Take the stair climber calibration above and, for the sake of the comparison,
calibrate the *same* five-minute set both ways: 56.7 kilocalories from 300
repetitions gives a rep-count factor of 0.24 as well. At the calibration pace,
the two modes now agree exactly. Then change the pace.

.. raw:: html

   <div class="plot">
     <svg viewBox="0 0 790 420" xmlns="http://www.w3.org/2000/svg" role="img"
          aria-label="A chart of kilocalories from a five-minute set against cadence, showing rep count rising as a straight line and frequency rising as a curve, the two crossing at the calibration pace of sixty repetitions a minute.">
       <g stroke="var(--line)" stroke-width="1">
         <line x1="70" y1="279.1" x2="740" y2="279.1"/>
         <line x1="70" y1="222.2" x2="740" y2="222.2"/>
         <line x1="70" y1="165.2" x2="740" y2="165.2"/>
         <line x1="70" y1="108.3" x2="740" y2="108.3"/>
         <line x1="70" y1="51.4" x2="740" y2="51.4"/>
       </g>
       <line x1="70" y1="336" x2="740" y2="336" stroke="var(--muted)" stroke-width="1"/>
       <g font-size="15" text-anchor="end">
         <text x="60" y="284">25</text>
         <text x="60" y="227">50</text>
         <text x="60" y="170">75</text>
         <text x="60" y="113">100</text>
         <text x="60" y="56">125</text>
       </g>
       <text class="lead" x="70" y="26" font-size="17">Kilocalories from a five-minute set</text>
       <line x1="405" y1="40" x2="405" y2="336" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>
       <polyline fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linejoin="round"
                 points="70.0,271.4 92.3,267.1 114.7,262.8 137.0,258.5 159.3,254.2 181.7,249.9 204.0,245.6 226.3,241.3 248.7,237.0 271.0,232.7 293.3,228.4 315.7,224.1 338.0,219.8 360.3,215.5 382.7,211.2 405.0,206.9 427.3,202.6 449.7,198.3 472.0,194.0 494.3,189.7 516.7,185.4 539.0,181.1 561.3,176.8 583.7,172.5 606.0,168.2 628.3,163.9 650.7,159.6 673.0,155.3 695.3,151.0 717.7,146.7 740.0,142.3"/>
       <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"
                 points="70.0,303.9 92.3,299.5 114.7,294.8 137.0,289.7 159.3,284.4 181.7,278.8 204.0,272.9 226.3,266.7 248.7,260.3 271.0,253.5 293.3,246.5 315.7,239.1 338.0,231.5 360.3,223.6 382.7,215.4 405.0,206.9 427.3,198.1 449.7,189.0 472.0,179.7 494.3,170.0 516.7,160.1 539.0,149.9 561.3,139.4 583.7,128.6 606.0,117.5 628.3,106.1 650.7,94.4 673.0,82.5 695.3,70.2 717.7,57.7 740.0,44.9"/>
       <circle cx="405" cy="206.9" r="6" fill="var(--ink)"/>
       <text class="lead" x="405" y="372" font-size="16" text-anchor="middle">calibrated here</text>
       <text class="lead" x="660" y="132" font-size="16" text-anchor="end">rep count</text>
       <text class="lead" x="700" y="62" font-size="16" text-anchor="end">frequency</text>
       <g font-size="15" text-anchor="middle">
         <text x="70" y="356">30</text>
         <text x="237.5" y="356">45</text>
         <text x="405" y="356">60</text>
         <text x="572.5" y="356">75</text>
         <text x="740" y="356">90</text>
       </g>
       <text x="740" y="396" font-size="15" text-anchor="end">repetitions per minute</text>
     </svg>
   </div>

.. container:: caption

   The same five minutes, the same 80 kg, both modes calibrated to agree at
   sixty repetitions a minute. Rep count is a straight line through the origin;
   frequency is a parabola. At ninety a minute the two differ by half as much
   again.

Do the same five minutes 20% faster — 360 repetitions instead of 300 — and rep
count reports 68.0 kilocalories, which is 20% more. Frequency reports 81.7,
which is 44% more, because 1.2 squared is 1.44. Go 50% faster and rep count
reports half as much again while frequency reports two and a quarter times as
much.

**Neither is wrong. They are claims about different machines.** If your stepper
really does cost four times as much at twice the rate, the parabola is the
honest curve and the straight line is undercounting you badly at the top end. If
your dumbbell really does cost the same per curl however fast you do it, the
straight line is honest and the parabola will reward you handsomely for rushing
your form. Choosing the mode wrong is a much larger error than getting the
factor slightly wrong, and no amount of recalibration fixes it — it only moves
the point where the two curves happen to cross.

Reading it back out, and changing your mind
-------------------------------------------

.. container:: shots

   .. image:: /assets/cadencecam/settings-screen.png
      :align: center
      :alt: The CadenceCam settings panel, showing weight in kilograms, a default factor, and an exercise row with a counts-by choice and a factor.

.. container:: caption

   Where the three settings in the formula live. Weight is kept once for the
   account; every exercise has its own counting mode and its own factor.

History lists every workout newest first, and its menu exports the lot as a CSV
file. The columns are the measurement rather than the application's internals:
start, end, exercise, duration, repetitions, cadence sum, weight, factor,
counting mode, calories. The calorie figure is written out beside everything it
was computed from, on purpose — a file that gave you only the total would be a
file you could not check and could not recalculate.

That matters most when you decide the calibration was wrong. A factor is a
judgement about yourself made on one afternoon, and the honest way to improve it
is to wear a heart-rate monitor for a session, compare what it reports with what
the dashboard does, and scale the factor by the ratio. Doing that does not
retroactively change anything already in the history — but every row in the
export still carries the raw measurement, so you can multiply the old sets by
the new factor in a spreadsheet and see what the correction does to a month of
workouts.

What the number is not
----------------------

It is not a measurement of your metabolism. Nothing in this system observes you:
there is no heart rate, no oxygen, no body composition. There is a count of
repetitions, a weight you typed in, and a constant you chose. The output is a
kilocalorie only in so far as the factor has been calibrated to make it one,
which is the entire reason the factor is a setting rather than a constant in the
source.

The published figures the calibration is anchored to carry their own
uncertainty. The MET itself is defined as 3.5 ml of oxygen per kilogram per
minute, which is a convention rather than a fact about any individual: real
resting rates vary with age, sex, body composition and health, so the same
activity at the same rate does not cost two people the same. A range drawn from
a published compendium is the right order of magnitude and should not be
mistaken for better than that.

And the 75% is a judgement, not a measurement. It is the honest kind of
judgement — one made explicitly, written down, and attached to a number that can
be corrected — but a different person would pick differently, and the resulting
calorie figures would differ by as much as the range itself does.

**What the number is good for is comparison with itself.** The same exercise, on
the same machine, at the same factor, on Tuesday and on Friday: that difference
is real, because everything uncertain about it is held constant on both sides and
cancels out. A figure whose absolute accuracy is only as good as the judgement
behind it, but which is consistent to the repetition week over week, still tells
you accurately whether you are doing more than you were. That is what a counter
on a tripod can honestly offer, and it is most of what anybody wanted from one.
