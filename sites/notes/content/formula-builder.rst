.. raw:: html

   <style>
     .chapter-content .shots.wide { grid-auto-columns: min(18rem, 70vw); }
     .chapter-content .shots.graph { grid-auto-columns: min(100%, 40rem); margin: 1.2rem 0 1.8rem; }
   </style>

Build It, Then Graph It
=======================

I like graphs. Not the quarterly kind, but the kind where a short formula goes
into a plotter and something unexpected comes out: humps of different heights,
flat shoulders where the curve pauses and carries on, a pattern you did not
ask for. The trouble is getting the formula in. On a phone,
``Math.sin(x + Math.PI / 4) + 3 * Math.cos(2 * x)`` is a contest against tiny
keys and brackets that never balance.

So I built the Formula Builder. You assemble the formula from blocks by
dragging them into place, and one button draws it.

Snap it together
----------------

Along the top there is a strip of tabs: numbers, operators, functions,
trigonometry, logic and your own variables. Pick a tab, drag a block out of the
strip, and drop it on a slot. That is the whole interface. Blocks only fit where
they make sense, so you cannot build something broken, and there are no
parentheses to count. The app adds the right ones.

The clip below builds the formula above from scratch. It is the real app,
recorded at three frames per second, so the dragging is a little jerky.

.. container:: shots wide

   .. image:: /assets/formula-builder/build.gif
      :align: center
      :alt: A variable x is added, then blocks are dragged one by one into place until sin(x + π/4) + 3 × cos(2 × x) is complete, and the graph is opened.

The only thing you ever type is a digit, when a number block needs to say 3
instead of 0. Constants such as π, π/2 and π/4 are blocks of their own, one
drag away. As soon as every slot is filled, the value appears at the bottom, and
it follows any change you make, because there is no calculate button.

.. container:: shots

   .. image:: /assets/formula-builder/palette.webp
      :align: center
      :alt: The Trig tab of the block strip, with a sin block being placed next to a plus block.

   .. image:: /assets/formula-builder/built.webp
      :align: center
      :alt: The finished formula in the editor, with its value shown below.

Then press the graph button
---------------------------

The little curve icon next to the result opens the graph. You choose which
variable to vary and over what range, and the app draws the curve with the
formula printed underneath. The other variables keep their values, so you can
set one up, change it and watch the curve move. Share copies the range, the
formula and the variables, and the graph view can import them back, so a
curve is easy to send to a friend.

The last frames of the clip show it: x from -15 to 15, and this is what
comes out.

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-05.webp
      :align: center
      :alt: Graph of sin(x + π/4) + 3 cos(2x) from -15 to 15: tall peaks near 3.7 alternate with shorter ones near 2.3.

The phase shift of π/4 breaks the symmetry. Without it, every peak would be as
tall as its neighbour. With it, tall peaks of about 3.7 alternate with shorter
ones of about 2.3, and the pattern repeats every 2π.

Two waves, one sum
------------------

Everything below comes from the same few moves. I began with the plainest
thing there is: a fast wave plus a slower one.

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-01.webp
      :align: center
      :alt: Graph of sin(3x) + 2 cos(x) from -10 to 10, repeating every 2π with peaks of different heights.

``sin(3x) + 2cos(x)`` repeats every 2π, and each period holds three peaks of
three different heights. One of them hides below the axis. Already it is hard
to guess from the formula what the picture will look like.

Now let the slow wave win by making it ten times as big:

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-02.webp
      :align: center
      :alt: Graph of sin(5x) + 10 cos(x) from -20 to 20: one big wave with small ripples on its flanks.

``sin(5x) + 10cos(x)`` has only one peak and one trough per period. The fast
wave has shrunk to a ripple, but it has not vanished. It shows up as shoulders
on the flanks, short flat steps where the curve slows down, hesitates and then
keeps falling. These are inflexion points without a turning point, and they are
my favourite part of this picture.

A wave inside a wave
--------------------

Blocks nest, so nothing stops us from putting a function inside another one.

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-03.webp
      :align: center
      :alt: Graph of sin(3x) + 2 cos(sin(4x)) from -10 to 10: a busy repeating pattern that never goes below zero.

In ``sin(3x) + 2cos(sin(4x))`` the inner ``sin(4x)`` only ever lies between
-1 and 1, so ``2cos(...)`` is stuck in a narrow band between about 1.1 and 2.
Add ``sin(3x)`` to that and the whole curve stays above zero and tops out at
exactly 3. Inside that corridor it still manages to squeeze in a lot of wiggles.

Replace the inside with something that keeps growing and the curve speeds up as
it goes:

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-04.webp
      :align: center
      :alt: Graph of sin(3x) + 2 cos(x²) from -7 to 7: slow in the middle, oscillating faster and faster toward both edges.

In ``sin(3x) + 2cos(x²)`` the argument of the cosine changes faster the farther
you are from zero. Near the middle it hardly moves, and the slow sine shows
through, with a flat pause around x = -1. Toward the edges the oscillation
speeds up and the peaks crowd together, like a siren.

Turning the volume up and down
------------------------------

Multiplying by a slow cosine gives the whole curve an envelope: the amplitude
swells and fades, the way two guitar strings tuned almost alike beat against
each other. Here the factor is ``cos(0.125x)``, and the wave from the clip, now
with a plain ``1 * cos(2x)``, sits inside.

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-06.webp
      :align: center
      :alt: Graph of cos(0.125x) times (sin(x + π/4) + cos(2x)) from -60 to 60: bursts of oscillation separated by quiet stretches.

Change that 1 into a 3 and the same envelope carries a much busier wave, with
dozens of peaks and dips in this window:

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-07.webp
      :align: center
      :alt: Graph of cos(0.125x) times (sin(x + π/4) + 3 cos(2x)) from -60 to 60: the same envelope with taller, denser oscillations.

Add a plain ``sin(x)`` on the end and the symmetry around the vertical axis is
gone. The dips now reach deeper than the peaks do, and the quiet stretches are
no longer quiet, because ``sin(x)`` keeps going while the envelope fades:

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-08.webp
      :align: center
      :alt: Graph of cos(0.25x) times (sin(x + π/4) + 3 cos(2x)) plus sin(x) from -60 to 60: an asymmetric, irregular pattern.

From there it is a matter of nudging numbers. Each tweak is one tap on a number
block and one glance at the graph. A 4 here and a 0.5 there give this:

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-09.webp
      :align: center
      :alt: Graph of cos(0.25x) times (sin(x + π/4) + 4 cos(2x)) plus 0.5 sin(x) from -45 to 45: tall peaks with pronounced dips between them.

The last one is the most elaborate, and it is still only blocks and a few
digits. It scales everything by ``0.25 * |x|^1.5 + 100``, so the swings grow toward the
edges. The tallest peaks are even cut off by the frame.

.. container:: shots graph

   .. image:: /assets/formula-builder/graph-10.webp
      :align: center
      :alt: A long formula multiplying a growing envelope with the previous waves, graphed from -130 to 130: oscillations that grow toward both edges.

Try it
------

It lives at `formulas.raz.sg <https://formulas.raz.sg>`_. Add a variable, drag a
sine onto the editor, and keep going until the curve surprises you. There is
nothing to sign up for, and everything happens on your device. If you find a
curve you like, or something breaks, find me on
`LinkedIn <https://www.linkedin.com/in/razvan-voicu-89061711/>`_.
