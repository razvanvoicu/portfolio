A Speed Limit App for Singapore
===============================

On a motorbike, wind and engine noise can swallow a polite beep, and a small
navigation warning can go unnoticed. I wanted something I had not found in
other apps: speed warnings prominent enough to demand attention, both by
sound and by colour.

There is more reason to pay attention now. Singapore's Traffic Police have
stepped up speeding enforcement, expanding operations and activating speed
detection in more red-light cameras across the island. Their
`2025 road traffic report <https://www.police.gov.sg/-/media/SPF/Media-Room/Statistics/Annual-Road-Traffic-Situation-2025/Annual-Road-Traffic-Situation-2025.pdf>`_
describes the expansion of speeding enforcement. More locations can now
detect speeding, including junctions previously associated with red-light offences.

`speedlimit <https://speedlimit.raz.sg/>`_ is my answer: a Singapore-only speed
monitor with a large speed reading, the estimated limit, and warnings that
become harder to miss as your speed rises. It is especially useful on a
motorbike: the visual warning still helps when wind drowns out the sound.

Start a drive
-------------

Open the app on your phone, secure it in a suitable mount, and tap **Start
drive** before setting off. Allow location access and make sure media sound
is audible. The app shows your GPS speed and updates the estimated limit as
you travel. Where supported, it keeps the screen awake while running.

The speed is **bright green** within the alert threshold and **red** above
it. A small excess produces a repeating gentle chime. Further above it, the
sound becomes deliberately unpleasant and the background turns **pink**.
The warning continues until you return within the threshold.

.. figure:: /assets/speedlimit/motorbike-alerts.png
   :width: 100%
   :alt: Illustrative mounted-phone views showing green at 70 in an 80 zone, a gentle alert at 81, and the urgent red-on-pink warning at 85.

   AI-generated illustrations of the three alert states, with zero tolerance
   and the default 3 km/h gentle-alert range. These are not road-test photographs.

Choose when it warns
--------------------

The hamburger menu contains **Tolerance** and **Gentle alert range**. Your
choices are saved on the phone, and separate test buttons let you hear both
sounds before a journey.

Tolerance is subtracted from the road limit. With a 70 km/h limit and a
tolerance of 2, green lasts up to **68 km/h**, inclusive; above that, the speed
turns red. A negative tolerance delays the warning: -2 makes that threshold
72 km/h. It changes the alert, not the legal limit.

The gentle range defaults to **3 km/h above the threshold**. With that
68 km/h threshold, the gentle sound applies above 68 and through 71,
inclusive. Above 71, the urgent sound and pink background take over. Adjust
the range to suit how soon you want the stronger warning.

Changing roads and school zones
-------------------------------

The displayed limit follows the road information and signs available to the
app. Where it cannot establish a mapped limit, it uses detected signs or the
Singapore default of **50 km/h**, and labels the fallback.

On detecting a **School Zone** sign, it displays **40 km/h**. At **End of
School Zone**, it restores the limit that applied before entry. Sound alerts
are disabled whenever the displayed limit is below 60 km/h, including in a
school zone; the speed colours and pink warning still work. The app treats
school-zone signs as 40 km/h throughout and does not interpret flashing lights.

.. figure:: /assets/speedlimit/school-zone.png
   :width: 100%
   :alt: Illustrative dashboard-mounted phone showing 38 km/h in a 40 school zone, then 52 km/h after the preceding 60 limit is restored.

   AI-generated illustration: entering a school zone and restoring the
   preceding limit after leaving it.

A nearby exit-ramp sign can be mistaken for one on your road. If the limit
changes incorrectly, **tap it within seven seconds** to restore the previous
value. The rejected sign stays ignored until another qualifying sign is
encountered. It can apply again on a later visit when you take that exit.

Keep the app visible during the journey. You can add it to your home screen
from the browser menu; on an iPhone, use **Share → Add to Home Screen**.
Once cached, it can work offline, and your location stays on the phone.
If GPS speed is unavailable or the signal becomes stale, the speed reading
and alerts pause until fresh information arrives. Monitoring is unavailable
outside Singapore.

Coverage is incomplete, and GPS or sign data can be wrong. Follow the posted
signs and make settings changes before setting off. When finished, tap
**Stop drive**.
