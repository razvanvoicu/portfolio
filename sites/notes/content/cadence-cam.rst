.. raw:: html

   <style>
     img.width-200-percent {
       width: 200% !important;
       margin-left: -50% !important;
     }
   </style>
   
Have Your Phone Count Your Reps
===============================

Since COVID, a lot of us have gotten used to exercising at home. There is no
commute, no queue for a machine, and no audience when the last few reps become
less graceful than the first few.

It has also become surprisingly cheap to bring the gym home. Stationary bikes,
stair climbers, elliptical cross-trainers and arm-cranking bikes are easy to
find without spending a fortune. The catch is that cheap equipment can feel,
well, cheap — especially when it comes to resistance.

When the resistance is no longer standard
-----------------------------------------

Many of these machines use eddy-current resistance. In simple terms, magnets
create drag against a moving metal part without touching it. It is quiet and
smooth, but on inexpensive equipment the maximum resistance is often rather
weak.

I have a habit of fixing that by finding ways to add powerful neodymium
magnets. The extra magnetic field can increase the resistance many times over
and turn a gentle spin into a serious workout.

There is one obvious casualty: the machine's calorie counter. It was calibrated
for the resistance the manufacturer supplied, not my collection of extra
magnets. Its estimate no longer means much — and the calorie figures on budget
machines tend to be fairly approximate even before anyone modifies them.

My first answer involved an Arduino
------------------------------------

For a while, I built Arduino-based counters. They worked: sensors watched the
machine, a small screen showed the pace and totals, and my own formula produced
a calorie estimate that matched the exercise I was actually doing.

.. container:: shots

   .. image:: /assets/cadencecam/arduino-calorie-counter.jpg
      :class: width-200-percent
      :align: center
      :alt: An Arduino-based workout display showing steps, time, pace, calories, and height climbed.

I enjoyed the result more than the process. I would rather write software than
solder wires — not that an Arduino lets you avoid software. It simply gives you
software *and* wires.

That led to a more convenient question: could a phone already sitting in a
drawer do the sensing instead?

Let the camera watch the movement
---------------------------------

Almost every exercise machine has something that moves in a regular cycle: a
pedal, a flywheel, a handle, a step or a leg. A phone camera can watch that
movement, detect each repetition and measure its frequency. From those two
signals, a customizable formula can estimate calories.

That is how `CadenceCam <https://cadencecam.raz.sg>`_ emerged.

Open it on one phone, choose **Counter**, allow camera access and point the
phone at the repeating movement. The first few seconds let it settle into the
rhythm, then the count follows the machine one rep at a time.

.. container:: shots

   .. image:: /assets/cadencecam/counter-screen.png
      :align: center
      :alt: CadenceCam Counter watching a stationary bike and counting repetitions.

   .. image:: /assets/cadencecam/counter-live.gif
      :align: center
      :alt: CadenceCam Counter increasing one rep at a time from 24 through 28 while a stationary bike pedal moves.

The camera image is processed on the phone; CadenceCam does not need to record
or upload video. The Counter phone can concentrate on the movement and nothing
else.

Two devices make the setup practical
------------------------------------

The best camera position is rarely the best screen position. On a stationary
bike, the Counter phone may be low beside a pedal, facing away from you or
otherwise impossible to read while riding. That is why CadenceCam has a second
role: **Dashboard**.

Open the Dashboard on another phone, tablet, or even a laptop and put it
in a place where you can see the screen clearly while exercising. 
It mirrors the live rep count and adds the figures you
actually want in front of you: elapsed time, current pace and estimated
calories.

.. container:: shots

   .. image:: /assets/cadencecam/dashboard-screen.png
      :class: width-200-percent
      :align: center
      :alt: CadenceCam Dashboard showing live repetitions, pace, time, and estimated calories.

The Dashboard is also the remote control. Press **Start** and the Counter begins
recording reps for a new workout. Press **Stop** when you are done, and the
session is completed without reaching down to the phone beside the pedal.

Teach it what the exercise means
--------------------------------

A repetition does not burn the same amount of energy on every machine, at every
setting, or for every person. CadenceCam therefore lets you enter your weight
and create presets for different exercises.

Each preset can have its own description and factor. It can calculate from the
plain rep count, or use repetition frequency so a faster pace contributes more
to the estimate. The aim is not to pretend a phone is a laboratory. It is to
give you a consistent, adjustable model that still makes sense after the
equipment has been modified.

.. container:: shots

   .. image:: /assets/cadencecam/settings-screen.png
      :class: width-200-percent
      :align: center
      :alt: CadenceCam Settings with weight, calorie factor, and a customizable exercise preset based on rep count or frequency.

CadenceCam also keeps a workout history, so the useful part is not only the
number on today's screen. You can look back at completed sessions and compare
your pace, duration and estimated effort over time.

Private by design
-----------------

CadenceCam runs in the browser, so there is no app to install in the usual
sense. You can optionally install it as a Progressive Web App for easier
access, but it remains the same browser-based application.

All movement detection and calorie calculations happen in the browser. After
the initial pairing, the Counter and Dashboard communicate directly over your
local network, without sending the live workout through a server.

The only data CadenceCam stores is your exercise history. If you no longer want
to keep it, you can delete it at any time.

Give it a try
-------------

Put one phone where it can see the pedal, put the Dashboard where you can see
it, and ride. CadenceCam handles the counting while you keep your eyes forward
and your attention on the workout — no soldering iron required.
