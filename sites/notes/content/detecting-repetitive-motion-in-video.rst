.. raw:: html

   <style>
     .chapter-content .eq {
       overflow-x: auto;
       overflow-y: hidden;
       margin: 1.6rem 0 1.9rem;
     }
     .chapter-content .eq math { font-size: 1.08em; }
     .chapter-content .vid {
       position: relative;
       width: 100%;
       aspect-ratio: 16 / 9;
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
       margin: 1.6rem 0 2rem;
     }
     .chapter-content .quadrants {
       width: 11rem;
       margin: 1.7rem auto 2rem;
       border-collapse: collapse;
       font: italic 1.15em/1 Georgia, serif;
     }
     .chapter-content .quadrants td {
       width: 50%;
       padding: .85rem 0;
       border: 1px solid var(--line);
       text-align: center;
     }
     .chapter-content .quadrants sub { font-size: .7em; }
     @media (max-width: 52rem) {
       .chapter-content .vid-pair { grid-template-columns: 1fr; }
       .chapter-content .eq math { font-size: 1em; }
     }
     .chapter-content .caption {
       margin: -1.2rem 0 2rem;
       color: var(--muted);
       font-size: .82em;
       line-height: 1.45;
       text-align: center;
     }
   </style>

Detecting Repetitive Motion in Video
====================================

Point a phone at an exercise machine and ask it a simple question: how many
times has that gone round? The obvious way to answer is to recognise the thing
that is moving — find the pedal, track it, count its circuits. That is a
respectable computer-vision problem, and on a phone it is an expensive one. A
model to ship and load, a GPU to keep busy, a battery to flatten, and a fresh
way to fail every time someone points the camera at a machine nobody trained it
on.

CadenceCam does none of that. It never identifies anything. It does not know
what a pedal is, or whether it is watching a bicycle, a leg, a handle or a
metronome. It knows only that something in front of the camera keeps coming
back, and it counts how often.

That reframing is the entire design. *What is in this picture?* is a hard
question. *Is anything in this picture periodic, and at what rate?* is a
signal-processing question, and signal processing has had a century to get good
at it.

One number instead of a million
-------------------------------

A 1080p frame is about two million pixels. Ten frames a second is twenty
million pixel reads a second, which is not a reasonable thing to ask of a phone
that is also meant to run for an hour on a battery.

So the first step throws nearly all of it away. Each frame is drawn into a
deliberately tiny offscreen canvas — a budget of roughly 2,500 pixels, with the
aspect ratio preserved, so a 16:9 frame lands at about 66 × 38. The browser
does that downscale in hardware, for free, and the result is averaged rather
than examined. Nothing downstream needs detail. It needs only to know how
bright a region is, and how that brightness moves over time.

Brightness here means Rec. 709 luma: the weighted sum the eye would agree with,
rather than a flat average of the three channels, so a green object crossing a
blue background registers as the change it visibly is instead of washing out.

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <msub><mi>s</mi><mi>q</mi></msub>
       <mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo>
       <mo>=</mo>
       <mfrac>
         <mn>1</mn>
         <mrow><mo stretchy="false">|</mo><msub><mi>Q</mi><mi>q</mi></msub><mo stretchy="false">|</mo></mrow>
       </mfrac>
       <msub>
         <mo movablelimits="false">&#8721;</mo>
         <mrow><mi>p</mi><mo>&#8712;</mo><msub><mi>Q</mi><mi>q</mi></msub></mrow>
       </msub>
       <mrow>
         <mo stretchy="false">(</mo>
         <mn>0.2126</mn><msub><mi>R</mi><mi>p</mi></msub>
         <mo>+</mo><mn>0.7152</mn><msub><mi>G</mi><mi>p</mi></msub>
         <mo>+</mo><mn>0.0722</mn><msub><mi>B</mi><mi>p</mi></msub>
         <mo stretchy="false">)</mo>
       </mrow>
     </mrow>
   </math>
   </div>

Two million numbers per frame have become four: one per region, on the same
0–255 scale as the pixels they came from. Everything after this point is
arithmetic on four slow time series, and that is cheap enough to do in a
browser tab on a phone old enough to have been retired to a drawer.

Why four quadrants
------------------

The natural first guess is one number for the whole frame. It does not work,
and it fails in an instructive way: a whole-frame average is often perfectly
constant while a great deal is moving inside it. An object that leaves the left
half exactly as it enters the right half changes the mean not at all. The
motion is still there; averaging has cancelled it.

The opposite extreme — a fine grid of cells — fails for the opposite reason.
The smaller a cell, the less of the moving object it ever contains, so the
signal in any one cell shrinks while the noise does not. You also acquire
several hundred channels that disagree with each other, and now have to decide
which of them to believe.

Four is the smallest split that breaks the cancellation along both axes while
leaving each region large enough to carry a strong signal. The quadrants are
numbered the way mathematics numbers them, counter-clockwise from the top
right:

.. raw:: html

   <table class="quadrants">
     <tr><td>Q<sub>2</sub></td><td>Q<sub>1</sub></td></tr>
     <tr><td>Q<sub>3</sub></td><td>Q<sub>4</sub></td></tr>
   </table>

The app draws those dividing lines over the live preview, which turns an
abstraction into a framing instruction: put the moving part where it will cross
a line.

.. container:: shots

   .. image:: /assets/cadencecam/counter-screen.png
      :align: center
      :alt: The CadenceCam Counter screen, with the quadrant dividing lines drawn over a live camera view of a foot on an exercise machine, reading 14 reps at 2.9 seconds per rep.

What the camera actually gives you
----------------------------------

Here is what those four series look like when everything goes right — a steady
cadence, good contrast, and a camera that stays out of the way. The four traces
are drawn at separate heights so they can be told apart; they share one
brightness scale.

.. container:: shots

   .. image:: /assets/cadencecam-engineering/clean_signal_in_all_4_quadrants_with_slight_frequency_variation.png
      :align: center
      :alt: Four quadrant brightness traces over thirty seconds, each a flat plateau interrupted by regular sharp dips about 1.3 seconds apart.

Three things in that picture are worth more than a paragraph of theory.

It is not a sine wave. It is a plateau, interrupted. The quadrant sits at its
background brightness until the moving object crosses it, drops steeply, holds
briefly at the bottom and recovers. A cycle is one notch, not one oscillation,
and the notch is narrow compared to the period.

The amplitudes are small. The plateau sits around 150 and the dips reach 136 —
a swing of fourteen units out of a possible 255. On a worse-lit machine it is
single digits. Anything that moves the whole frame by a comparable amount is,
to this detector, indistinguishable from exercise.

And the four channels disagree. They have different amplitudes, because the
object crosses them to different depths, and different phase, because it
reaches them at different moments. The one thing they share is the period.
Everything the detector later does to decide whether to believe itself is built
on that single fact.

.. raw:: html

   <div class="vid">
     <iframe
       src="https://www.youtube-nocookie.com/embed/Bcw8uzqm-DA"
       title="CadenceCam counting a side leg exercise"
       loading="lazy"
       allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
       referrerpolicy="strict-origin-when-cross-origin"
       allowfullscreen>
     </iframe>
   </div>

.. container:: caption

   A side leg exercise, counted. There is no machine to instrument here and
   nothing for a model to recognise — only a limb that keeps crossing the same
   line.

Ten samples a second
--------------------

Human exercise cadence lives in a narrow band. Thirty repetitions a minute is a
slow, deliberate grind; a hundred and twenty is a sprint. That is 0.5 to 2 Hz,
and committing to it early is what makes everything downstream tractable.

Sampling theory sets the floor. To represent a 2 Hz component at all, the
sampling rate must exceed twice it:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <msub><mi>f</mi><mi>s</mi></msub>
       <mo>&#62;</mo>
       <mn>2</mn><msub><mi>f</mi><mi>max</mi></msub>
       <mo>=</mo><mn>4</mn><mtext>&#8201;Hz</mtext>
       <mo>,</mo><mspace width="1.2em"/>
       <mtext>chosen:</mtext><mspace width="0.4em"/>
       <msub><mi>f</mi><mi>s</mi></msub><mo>=</mo><mn>10</mn><mtext>&#8201;Hz</mtext>
     </mrow>
   </math>
   </div>

Ten hertz is comfortably above the floor without being wasteful. It puts the
top of the band at two fifths of the Nyquist limit, where a gentle filter still
has room to work, and it quantises the position of a detected peak to
±50 ms — about five per cent of a cycle at one hertz, which is fine for a count
and fine for a pace.

Sampling at the camera's own frame rate would cost three to six times as much
for information the filter is about to discard. So the sampler runs on its own
timer, at its own rate, and simply takes whatever frame is current.

Separating the rhythm from everything else
------------------------------------------

Two problems stand between those raw traces and a count.

The first is level. A quadrant's brightness sits around 120 while a repetition
moves it by ten. The interesting part of the signal is a few per cent of the
number carrying it.

The second is everything else in the room. Someone walking past, the sun going
behind a cloud, the camera adjusting itself, a flickering light — all of it
lands in exactly the same trace as the exercise.

Both are addressed by committing to the band. First the window is centred by
subtracting its own mean, which removes the resting level outright; without
that step a filter starting from rest sees a brightness of 120 as a step input
and rings on it hard enough to swamp a repetition of ten.

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <msub><mi>x</mi><mi>q</mi></msub><mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo>
       <mo>=</mo>
       <msub><mi>s</mi><mi>q</mi></msub><mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo>
       <mo>&#8722;</mo>
       <mfrac>
         <mn>1</mn><mi>N</mi>
       </mfrac>
       <msubsup>
         <mo movablelimits="false">&#8721;</mo>
         <mrow><mi>k</mi><mo>=</mo><mn>0</mn></mrow>
         <mrow><mi>N</mi><mo>&#8722;</mo><mn>1</mn></mrow>
       </msubsup>
       <msub><mi>s</mi><mi>q</mi></msub><mo stretchy="false">[</mo><mi>k</mi><mo stretchy="false">]</mo>
     </mrow>
   </math>
   </div>

Then a band-pass. One second-order IIR section — a biquad — applied as a
difference equation, one sample at a time:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mi>y</mi><mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo>
       <mo>=</mo>
       <msub><mi>b</mi><mn>0</mn></msub><mi>x</mi><mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo>
       <mo>+</mo><msub><mi>b</mi><mn>1</mn></msub><mi>x</mi><mo stretchy="false">[</mo><mi>n</mi><mo>&#8722;</mo><mn>1</mn><mo stretchy="false">]</mo>
       <mo>+</mo><msub><mi>b</mi><mn>2</mn></msub><mi>x</mi><mo stretchy="false">[</mo><mi>n</mi><mo>&#8722;</mo><mn>2</mn><mo stretchy="false">]</mo>
       <mo>&#8722;</mo><msub><mi>a</mi><mn>1</mn></msub><mi>y</mi><mo stretchy="false">[</mo><mi>n</mi><mo>&#8722;</mo><mn>1</mn><mo stretchy="false">]</mo>
       <mo>&#8722;</mo><msub><mi>a</mi><mn>2</mn></msub><mi>y</mi><mo stretchy="false">[</mo><mi>n</mi><mo>&#8722;</mo><mn>2</mn><mo stretchy="false">]</mo>
     </mrow>
   </math>
   </div>

which in the z-domain is the ratio of two quadratics:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mi>H</mi><mo stretchy="false">(</mo><mi>z</mi><mo stretchy="false">)</mo>
       <mo>=</mo>
       <mfrac>
         <mrow><msub><mi>b</mi><mn>0</mn></msub><mo>+</mo><msub><mi>b</mi><mn>1</mn></msub><msup><mi>z</mi><mrow><mo>&#8722;</mo><mn>1</mn></mrow></msup><mo>+</mo><msub><mi>b</mi><mn>2</mn></msub><msup><mi>z</mi><mrow><mo>&#8722;</mo><mn>2</mn></mrow></msup></mrow>
         <mrow><mn>1</mn><mo>+</mo><msub><mi>a</mi><mn>1</mn></msub><msup><mi>z</mi><mrow><mo>&#8722;</mo><mn>1</mn></mrow></msup><mo>+</mo><msub><mi>a</mi><mn>2</mn></msub><msup><mi>z</mi><mrow><mo>&#8722;</mo><mn>2</mn></mrow></msup></mrow>
       </mfrac>
     </mrow>
   </math>
   </div>

The coefficients come from Robert Bristow-Johnson's *Audio EQ Cookbook* — the
same formulae the Web Audio API's own filter nodes are built on. For a band-pass
with constant peak gain, with the centre frequency placed at the geometric mean
of the two edges and the quality factor following from the width:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <msub><mi>f</mi><mn>0</mn></msub><mo>=</mo>
       <msqrt><mrow><msub><mi>f</mi><mi>L</mi></msub><msub><mi>f</mi><mi>H</mi></msub></mrow></msqrt>
       <mo>=</mo><mn>1</mn><mtext>&#8201;Hz</mtext>
       <mo>,</mo><mspace width="1.4em"/>
       <mi>Q</mi><mo>=</mo>
       <mfrac>
         <msub><mi>f</mi><mn>0</mn></msub>
         <mrow><msub><mi>f</mi><mi>H</mi></msub><mo>&#8722;</mo><msub><mi>f</mi><mi>L</mi></msub></mrow>
       </mfrac>
       <mo>=</mo><mfrac><mn>1</mn><mn>1.5</mn></mfrac><mo>&#8776;</mo><mn>0.67</mn>
     </mrow>
   </math>
   </div>

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <msub><mi>&#969;</mi><mn>0</mn></msub><mo>=</mo>
       <mfrac><mrow><mn>2</mn><mi>&#960;</mi><msub><mi>f</mi><mn>0</mn></msub></mrow><msub><mi>f</mi><mi>s</mi></msub></mfrac>
       <mo>,</mo><mspace width="1.4em"/>
       <mi>&#945;</mi><mo>=</mo>
       <mfrac><mrow><mi>sin</mi><mspace width="0.17em"/><msub><mi>&#969;</mi><mn>0</mn></msub></mrow><mrow><mn>2</mn><mi>Q</mi></mrow></mfrac>
       <mo>,</mo><mspace width="1.4em"/>
       <msub><mi>a</mi><mn>0</mn></msub><mo>=</mo><mn>1</mn><mo>+</mo><mi>&#945;</mi>
     </mrow>
   </math>
   </div>

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mtable>
       <mtr><mtd>
         <mrow>
           <msub><mi>b</mi><mn>0</mn></msub><mo>=</mo><mfrac><mi>&#945;</mi><msub><mi>a</mi><mn>0</mn></msub></mfrac>
           <mo>,</mo><mspace width="1em"/>
           <msub><mi>b</mi><mn>1</mn></msub><mo>=</mo><mn>0</mn>
           <mo>,</mo><mspace width="1em"/>
           <msub><mi>b</mi><mn>2</mn></msub><mo>=</mo><mo>&#8722;</mo><mfrac><mi>&#945;</mi><msub><mi>a</mi><mn>0</mn></msub></mfrac>
         </mrow>
       </mtd></mtr>
       <mtr><mtd>
         <mrow>
           <msub><mi>a</mi><mn>1</mn></msub><mo>=</mo><mfrac><mrow><mo>&#8722;</mo><mn>2</mn><mi>cos</mi><mspace width="0.17em"/><msub><mi>&#969;</mi><mn>0</mn></msub></mrow><msub><mi>a</mi><mn>0</mn></msub></mfrac>
           <mo>,</mo><mspace width="1em"/>
           <msub><mi>a</mi><mn>2</mn></msub><mo>=</mo><mfrac><mrow><mn>1</mn><mo>&#8722;</mo><mi>&#945;</mi></mrow><msub><mi>a</mi><mn>0</mn></msub></mfrac>
         </mrow>
       </mtd></mtr>
     </mtable>
   </math>
   </div>

One section is enough. A Q of 0.67 is a wide, gentle band — which is what is
wanted, because the cadence is not known in advance and a sharp filter would
simply be a way of rejecting half the users. At 10 Hz the Nyquist limit is
5 Hz, comfortably more than an octave above the top of the band, so there is
nothing up there that needs a steeper skirt.

The filter is re-run from rest over the whole fifteen-second window on every
new sample, rather than carrying its state forward. That costs a few thousand
multiply-adds a second — nothing next to capturing the frames in the first
place — and it buys a useful guarantee: what the graph shows and what the
counter counts are the same function of the same samples, and cannot quietly
drift apart. The first two seconds of each filtered window are discarded while
the filter settles, because a band-pass starting from rest rings on the arrival
of the signal, and that ringing would otherwise dominate the very statistics
used to decide what counts as a repetition.

From a waveform to a count
--------------------------

It is tempting to reach for a Fourier transform here, or for autocorrelation.
Both will tell you the dominant frequency of the window, confidently and
accurately, and neither will tell you what you need.

A count is not a frequency. A count needs *events*: this repetition happened,
now, add one. A frequency estimate integrated over time is a guess about how
many events probably occurred, and a guess that drifts by two per cent will be
wrong by a repetition every fifty — a counter that is quietly, plausibly wrong
is worse than one that admits it cannot see. Sets also start and stop, and a
window that is half exercise and half rest has a perfectly good dominant
frequency that corresponds to nothing.

So the detector looks for peaks, and judges each one on two properties.

**Prominence** — how far a local maximum stands above the higher of the two
valleys flanking it. Walk outwards in both directions until the signal rises
back to the peak's own height, note the lowest point reached on each side, and
take the shallower of the two:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mi>P</mi><mo stretchy="false">(</mo><mi>i</mi><mo stretchy="false">)</mo>
       <mo>=</mo>
       <mi>y</mi><mo stretchy="false">[</mo><mi>i</mi><mo stretchy="false">]</mo>
       <mo>&#8722;</mo>
       <mi>max</mi>
       <mrow>
         <mo>(</mo>
         <munder><mo movablelimits="false">min</mo><mrow><mi>j</mi><mo>&#8712;</mo><mi>L</mi></mrow></munder>
         <mspace width="0.2em"/>
         <mi>y</mi><mo stretchy="false">[</mo><mi>j</mi><mo stretchy="false">]</mo>
         <mo>,</mo>
         <munder><mo movablelimits="false">min</mo><mrow><mi>j</mi><mo>&#8712;</mo><mi>R</mi></mrow></munder>
         <mspace width="0.2em"/>
         <mi>y</mi><mo stretchy="false">[</mo><mi>j</mi><mo stretchy="false">]</mo>
         <mo>)</mo>
       </mrow>
     </mrow>
   </math>
   </div>

Prominence is used instead of an absolute height because the baseline moves and
the height does not mean anything on its own. It is the same measure used to
decide whether a hill is a mountain in its own right or merely a shoulder of
the one next to it, and the same measure used to find heartbeats in a
photoplethysmogram — a problem that sits in a similar frequency range and has
precisely the same difficulty.

The threshold a peak must clear has two terms:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mi>&#952;</mi><mo>=</mo>
       <mi>max</mi>
       <mrow><mo>(</mo>
         <mn>4.0</mn><mo>,</mo><mspace width="0.4em"/>
         <mn>1.5</mn><mo>&#8901;</mo>
         <msqrt>
           <mrow>
             <mfrac><mn>1</mn><mi>N</mi></mfrac>
             <msubsup>
               <mo movablelimits="false">&#8721;</mo>
               <mrow><mi>n</mi><mo>=</mo><mn>0</mn></mrow>
               <mrow><mi>N</mi><mo>&#8722;</mo><mn>1</mn></mrow>
             </msubsup>
             <msup><mrow><mi>y</mi><mo stretchy="false">[</mo><mi>n</mi><mo stretchy="false">]</mo></mrow><mn>2</mn></msup>
           </mrow>
         </msqrt>
       <mo>)</mo></mrow>
     </mrow>
   </math>
   </div>

The relative term scales with how active the window is, so a brightly lit
machine with a strong signal does not accept the small wobbles that a dim one
would have to. The absolute floor exists because a relative threshold on its
own is self-defeating: show it a window containing nothing but noise, and it
will faithfully set a threshold that the noise clears.

That floor is not set by sensor noise. Per-pixel noise averages away almost
entirely across the several hundred pixels in a quadrant. What survives
averaging is everything that moves the whole frame at once — auto-exposure
hunting, mains flicker, the camera's own denoising — and that is a far larger
number than the sensor's.

**Distance** gives the second rule. Two repetitions cannot fall closer together
than the period of the fastest cadence the band admits, so accepted peaks must
be at least five samples apart:

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mi>&#916;</mi><mi>n</mi><mo>&#8805;</mo>
       <mfrac><msub><mi>f</mi><mi>s</mi></msub><msub><mi>f</mi><mi>max</mi></msub></mfrac>
       <mo>=</mo>
       <mfrac><mrow><mn>10</mn><mtext>&#8201;Hz</mtext></mrow><mrow><mn>2</mn><mtext>&#8201;Hz</mtext></mrow></mfrac>
       <mo>=</mo><mn>5</mn><mspace width="0.35em"/><mtext>samples</mtext>
     </mrow>
   </math>
   </div>

Where two candidates fall closer than that, the more prominent survives.
Resolving by prominence rather than by position keeps the outcome independent
of which end of the window the scan started from.

When one cycle has two peaks
----------------------------

Real signals are not as obliging as the clean trace above. The most common
complication, by a wide margin, is that one repetition produces more than one
peak.

.. container:: shots

   .. image:: /assets/cadencecam-engineering/mildly_distorted_mildly_challenging_signal.png
      :align: center
      :alt: Two quadrant traces in which each cycle shows one tall peak followed by a distinctly smaller secondary bump.

This is geometry, not mathematics. A quadrant boundary is a line, and a real
mechanism crosses it more than once per cycle: a foot and the pedal under it, a
limb and its shadow, the near and the far side of a flywheel. Each crossing is
a genuine brightness event. Only one of them is a repetition.

When the secondary event is much smaller, prominence disposes of it without
further help. When the two peaks are nearly equal but the trough between them
is shallow, prominence still works, because the second peak is measured against
the higher of its neighbours — the shallow notch, not the deep trough:

.. container:: shots

   .. image:: /assets/cadencecam-engineering/challenging_signal_with_double_peaks_but_single_troughs.png
      :align: center
      :alt: Two overlapping quadrant traces showing paired peaks of similar height separated by a shallow notch, with one deep trough per cycle.

And then there is the case that defeats single-channel peak-picking entirely:

.. container:: shots

   .. image:: /assets/cadencecam-engineering/highly_challenging_signal_with_double_peaks_and_double_troughs.png
      :align: center
      :alt: One quadrant trace in which every cycle contains two peaks of nearly equal height, each flanked by deep troughs of nearly equal depth.

Two peaks per cycle, within ten per cent of each other in height. Two troughs
per cycle, within a couple of units of each other in depth. Both peaks are
therefore prominent, and they are far enough apart that the distance rule has
no opinion. Nothing in this one trace distinguishes *one repetition with a
complicated shape* from *two repetitions* — and a detector that guesses will be
exactly double, which is the most expensive way to be wrong.

That is the honest limit of looking at one channel. The way past it is to stop.

Agreement as evidence
---------------------

The detector analyses all four quadrants independently and then asks a
different question: do any two of them agree about the period?

.. raw:: html

   <div class="eq">
   <math display="block" xmlns="http://www.w3.org/1998/Math/MathML">
     <mrow>
       <mfrac>
         <mrow><mo stretchy="false">|</mo><msub><mi>T</mi><mi>a</mi></msub><mo>&#8722;</mo><msub><mi>T</mi><mi>b</mi></msub><mo stretchy="false">|</mo></mrow>
         <mrow><mi>max</mi><mo stretchy="false">(</mo><msub><mi>T</mi><mi>a</mi></msub><mo>,</mo><msub><mi>T</mi><mi>b</mi></msub><mo stretchy="false">)</mo></mrow>
       </mfrac>
       <mo>&#8804;</mo><mn>0.25</mn>
     </mrow>
   </math>
   </div>

Two, deliberately, and not a majority. A movement may only ever cross two
quadrants — a pedal low on the left of the frame need never trouble the top
right — so requiring three or four would reject perfectly good framing. The
period of each channel is taken as the *median* interval between its own peaks,
so a single missed or spurious peak moves it hardly at all.

Note what is *not* required: phase. The quadrants see the same movement at
different moments, and sometimes in opposition — here the green and orange
traces are very nearly anti-phase, which is exactly what two neighbouring
quadrants look like when an object leaves one as it enters the other.

.. container:: shots

   .. image:: /assets/cadencecam-engineering/highly_distorted_highly_challenging_signal_both_double_peaks_and_double_troughs.png
      :align: center
      :alt: All four quadrant traces over thirty-five seconds at small amplitude, with two of them rising and falling in opposition to each other.

That is also why the peaks of agreeing channels are never merged into one
train. They carry the same period at different phases, and fusing them would
smear the very timing the count depends on. Instead, each channel keeps its own
tally, counted entirely from its own peaks, and a tally is believed when a
second channel has independently arrived within two repetitions of it. A
channel that has locked onto its own noise reaches a number nothing else is
near, and that is what gives it away — not its signal strength, which is no
help at all, but the size of its claim.

Three further conditions have to hold before anything is counted.

The movement must be **sustained**: at least five peaks in a row, none further
from the last than the period of the slowest cadence in the band. One peak, or
two, is somebody shifting in a chair or reaching for a towel. Until the fifth
arrives nothing is counted at all — and when it does, all five count together,
because each is evidence for the others and none of them was a repetition on
its own.

The movement must **come back**. A repetition is a round trip: the object
enters the quadrant and leaves it again, so the brightness that fell returns to
where it was. Putting a dumbbell down is not a round trip — the object goes and
stays gone — but to a band-pass the two are identical, because a filter blind to
a constant treats *rose and stayed* exactly like *rose and fell*. So that test
is made on the quadrant's raw brightness, where the distinction still exists.

And a peak must **stand up against the recent ones** in its own channel, rather
than only against the window's average activity. When a set ends and the
movement slides out of the window, the relative threshold decays after it, and
the camera's own speckle is then perfectly capable of clearing a threshold set
by the camera's own speckle.

.. container:: shots

   .. image:: /assets/cadencecam-engineering/double_peaks_and_occasional_double_troughs_and_amplitude_difference.png
      :align: center
      :alt: Two quadrant traces of the same movement, one swinging about twice as far as the other.

Finally, the detector says which of these it is in — borrowing the vocabulary
of a phase-locked loop, it is *acquiring* while the buffer fills, *searching*
when no two channels agree, and *locked* when they do. Only in the last of
those does the number on screen mean anything, and the app says so rather than
showing a confident figure it has no business being confident about.

What the method is good at
--------------------------

**It needs nothing from the machine.** No sensor, no magnet, no bracket, no
Bluetooth pairing, no cooperation from a manufacturer who stopped supporting the
model in 2019. If it moves in a cycle and the camera can see it, it can be
counted — a bike, a stepper, a rowing machine, an arm crank, a limb with no
machine at all.

**It is cheap.** About 2,500 pixel reads ten times a second, a two-pole filter
over a 150-sample window, and a peak scan over the same window. That is a
rounding error on any device with a camera, which is what makes it reasonable
to run continuously, in a browser tab, on a phone that is otherwise retired.

**The video never goes anywhere.** Not as a privacy policy — as an
architecture. The only thing that leaves the sampling stage is four numbers per
frame, and they are already an average over several hundred pixels. There is no
frame to transmit, store or leak, because by the time anything is counted the
frames have been discarded.

**It fails honestly.** The lock state, the corroboration requirement and a
count that only ever rises are all aimed at one particular kind of failure: a
count that stalls and says it is searching, rather than one that runs away. A
detector that stops is a nuisance. A detector that confidently invents forty
repetitions is a liar, and much harder to notice.

Where the method runs out
-------------------------

**It needs contrast, and it needs a crossing.** The signal is brightness
difference. A dark machine in a dark room, or a movement that stays entirely
within one quadrant without ever crossing a boundary, produces a trace with
nothing in it. Framing is not a detail here; it is half the instrument.

**The camera fights back.** This is the most irritating one. A phone camera is
not a passive sensor — it runs its own exposure and white-balance loops, and
when a dark object repeatedly enters the frame, the camera helpfully brightens
everything to compensate. The compensation lags, so it distorts the shape of
every cycle and partially cancels the very modulation being measured:

.. container:: shots

   .. image:: /assets/cadencecam-engineering/distorted_signal_due_to_cameras_adaptive_brightness_control_very_challenging.png
      :align: center
      :alt: Two quadrant traces in which the cycle shape varies from one repetition to the next and the baseline drifts, caused by the camera's automatic exposure control.

**Some movements simply have several events per cycle**, at comparable
amplitude, and no amount of filtering invents the information needed to tell
which one is the repetition:

.. container:: shots

   .. image:: /assets/cadencecam-engineering/multiple_peaks_multiple_troughs_per_period.png
      :align: center
      :alt: Two quadrant traces showing three or four local maxima of differing heights within each cycle, with the cadence gradually slowing.

**The band is a commitment.** Anything slower than 0.5 Hz or faster than 2 Hz
is invisible by construction. That is a deliberate trade — the band is what
makes the filter, the sampling rate, the minimum distance and the gap rule all
derivable from one decision — but it does mean very slow, deliberate movements
are outside the design.

**It counts crossings, not exercise.** The detector has no idea what it is
watching. A ceiling fan, a pendulum, a washing machine or someone pacing back
and forth across the frame are all, to it, perfectly good repetitions. The
agreement and sustain rules make accidental counting unlikely, not impossible.

**It is always slightly behind.** A peak cannot be confirmed until the signal
has turned back down after it and come back far enough to prove it was a round
trip, which costs about one cadence period — a little over a second at a
typical pace. And the first lock of a session cannot happen until the
fifteen-second window has filled. Nothing is lost — the repetition is counted
— but the number on screen always belongs to a moment slightly in the past.

.. raw:: html

   <div class="vid-pair">
     <div class="vid">
       <iframe
         src="https://www.youtube-nocookie.com/embed/2IwRsSalVY0"
         title="CadenceCam counting a clean signal"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
     <div class="vid">
       <iframe
         src="https://www.youtube-nocookie.com/embed/mxqbGnmFDcM"
         title="CadenceCam counting a noisy signal"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
         referrerpolicy="strict-origin-when-cross-origin"
         allowfullscreen>
       </iframe>
     </div>
   </div>

.. container:: caption

   The same target, watched by two different devices: one returning a clean,
   high-contrast signal, the other a noticeably noisier one. The live quadrant
   graphs beneath the counter show how much difference the sensor alone makes.

What comes next
---------------

Every threshold quoted above — the prominence floor of four, the factor of one
and a half, the fifteen-second window, the tolerance of a quarter, the
requirement that a tally be corroborated within two — is a number, and every
number is a decision that could have been made differently and worse.

None of them were argued into place. They were measured, against hundreds of
recorded signals captured from real machines and from a bench rig built for the
purpose, and several of them are not what the original reasoning suggested.

The articles that follow take that apart from three directions. The first is
the software: how an application that has to run this loop ten times a second
in a browser, mirror it to a second device over a direct peer connection, and
survive being written by one person in their spare time, is actually put
together. The second is testing: how you write automated tests for something
whose input is the physical world, what a remote-controlled bench rig buys you,
and which failures only ever turn up when a human points a real phone at a real
machine. The third is the one that changed the most minds — what happened when
every tuning decision was replayed against a library of recorded signals, and
how a detector that counted *about right* became one that counts exactly.
