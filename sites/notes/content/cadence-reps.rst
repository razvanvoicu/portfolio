.. raw:: html

   <style>
     img.scaled-60 {
       zoom: 0.6;
       /* or use: transform: scale(0.6); transform-origin: center; */
     }
   </style>

Set a Cadence for Your Reps
===========================

Somewhere around rep fifteen, I usually lose count. Or the rhythm. Usually both.
Counting is a surprisingly bad job for a tired brain, and keeping an even pace
while you do it is worse. The first reps are brisk, the last ones crawl, and
the set ends up as a different workout than the one you planned.

.. container:: shots

   .. image:: /assets/cadence-reps/cycle.gif
      :align: center
      :alt: Three reps at two seconds each: the blue fill rises, then the screen flashes green and the count goes up.

So I stopped counting and built a small app that does it for me. You tell it
how many reps and how many seconds each one should take. It does the rest.

Two numbers, that's all
-----------------------

The first screen asks for exactly two things: how many reps, and how many
seconds per rep. Reps go from 1 to 9999, and seconds from 0.6 to 999.9, so it
works for a slow three-second squat or a fast set of jumping jacks. The app
remembers what you typed last time, because most of us do the same set again
tomorrow.

.. container:: shots

   .. image:: /assets/cadence-reps/setup.png
      :align: center
      :class: scaled-60
      :alt: The setup screen with 12 reps and 3.0 seconds per rep entered.

Tap Start and you land on a mostly empty screen with a clock and a big play
button. Get into position, then tap it.

.. container:: shots

   .. image:: /assets/cadence-reps/ready.png
      :align: center
      :class: scaled-60
      :alt: The workout screen before starting, with a large play button.


The screen does the counting
----------------------------

You get one second to settle, and a voice says "Get ready". Then the work
starts. Each rep is one cycle, and this is the whole idea: the screen slowly
fills with blue from the bottom up. The big number sits on top of it, and
wherever the blue has reached, the digit turns yellow. When the blue reaches
the top, the rep is over and the whole screen flashes green while the number
ticks up by one.

.. container:: shots

   .. image:: /assets/cadence-reps/fill.png
      :align: center
      :class: scaled-60
      :alt: Rep four, with the blue fill about two thirds of the way up and the digit turning yellow where it overlaps.

That's it. You never have to read anything. Lower the weight while the blue
climbs, finish the rep as it tops out, and the flash tells you "that's one".
It works in the corner of your eye, which matters when you're in a plank and
your phone is on the floor.

.. container:: shots

   .. image:: /assets/cadence-reps/flash.png
      :align: center
      :class: scaled-60
      :alt: The green flash that marks the end of a rep.

The flash lasts half a second, so a rep needs to be longer than that. That's
where the 0.6 second minimum comes from.

It counts out loud too
----------------------

If you'd rather not look at the screen at all, the app also says each number
as it flashes, using the voice your phone already has. The speaker icon in the
top corner turns it off, and the app remembers your choice. On a quiet
morning at home it's nice. In a crowded gym, you'll probably want it off.

One small detail I'm fond of: speech engines take a moment to start talking, so
the app begins each number a fraction of a second early. The voice and the
flash land together, instead of the voice trailing behind.

Pausing without losing your count
---------------------------------

Real life interrupts sets. Tap Pause and you get two buttons: Resume and Stop.

.. container:: shots

   .. image:: /assets/cadence-reps/paused.png
      :align: center
      :class: scaled-60
      :alt: The paused screen, showing rep six, a Resume button and a Stop button.

Resume doesn't throw you straight back in. You get a five-second run-up to get
back into position, and then the count carries on from where you left it. The
clock at the top only counts time you actually spent working, so pauses and
run-ups don't inflate your total. When the last rep flashes, the clock stops
and a Back button takes you home.

Things that quietly help
------------------------

A few small details that make it nicer to use mid-set:

- The screen stays awake during a set, so it doesn't go dark halfway through.
- Your phone's back gesture works like Stop, so you don't have to hunt for a
  button with sweaty hands.
- It works in landscape, if you prop the phone up against a wall.
- There's nothing to sign up for, and once it has loaded, it works offline.
  Add it to your home screen and it opens like any other app.

Try it
------

It lives at `cadencereps.raz.sg <https://cadencereps.raz.sg>`_. Start with something easy, say 10 reps at 3 seconds, and see how different a
familiar exercise feels when someone else is keeping time. If something breaks
or you'd like it to do something else, find me on
`LinkedIn <https://www.linkedin.com/in/razvan-voicu-89061711/>`_.
