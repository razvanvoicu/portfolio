AI in the Browser
=================

Modern browsers—yes, even those running on mobile phones—are
capable of far more than displaying pages and submitting forms.

.. container:: shots

   .. raw:: html

      <iframe
        width="284"
        height="633"
        src="https://www.youtube.com/embed/cc91dQHCDUM?autoplay=1&mute=1"
        title="CadenceCam Screen Recording"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>

I built `CadenceCam <https://cadencecam.raz.sg>`_
as a small demonstration of that idea.
An old phone runs a web app that uses the camera to detect
repetitive movement, counts repetitions, and sends the reps
signal over WebRTC (wifi only) to a dashboard. The dashboard,
running on a separate device, displays the reps and calculates
calories. The substantial computation (a model trained through
probabilistic learning) happens inside the browser, on the
device that captures the movement.

This approach has benefits beyond reducing latency.
Camera data can stay on the phone, communication between
devices can happen directly over the local network,
and the backend can be limited to the jobs that genuinely
require it, such as initial pairing and storing workout history.
**Less data travels to a server, privacy improves, and
infrastructure costs remain low.**

Not every workload belongs in the frontend.
But modern JavaScript engines, and increasingly
powerful mobile hardware have moved the boundary considerably.
Before adding another backend service, it may be worth asking:
could the user’s browser do this work instead?

`CadenceCam <https://cadencecam.raz.sg>`_
is my answer to that question—along with a practical
way to stop losing count halfway through a workout.
