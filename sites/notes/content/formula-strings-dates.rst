Strings, Dates, and Type Checking
=================================

A calculator that only knows numbers is fine for plotting sine waves, but real
scratchpad questions rarely stay numeric for long. How many days until a
deadline? What timestamp is 36 hours after a release window? How do you pull an
order number out of a log line or reformat a date string?

The Formula Builder now speaks **strings**, **UTC dates**, and **durations**,
backed by a Hindley-Milner type checker and an expression-aware variable editor.

Strings and regular expressions
-------------------------------

The **Strings** tab starts with a string constant block whose double quotes sit
outside the editable text box, so you type the raw text directly without
fighting quote marks. Next to it are the usual text primitives:

- ``length(s)``, ``trim(s)``, ``capitalize(s)``, ``toUpper(s)``, ``toLower(s)``
- ``substring(s, offset, len)``, ``append(a, b)``, ``times(s, count)``
- ``toString(x)`` and ``toNumber(s)`` for converting across types
- ``find(s, regexp)`` returning the zero-based index of the first match, or
  ``-1`` if nothing matches
- ``replace(s, regexp, replacement)`` and the four-argument
  ``replace(s, regexp, replacement, flags)``

A few quick examples you can paste straight into the **Import** dialog::

   capitalize(trim("  hello world  "))
   // => "Hello world"

   append(times("ha", 3), "!")
   // => "hahaha!"

   find("Order #4821 shipped", "[0-9]+")
   // => 7

   substring("Order #4821 shipped", 7, 4)
   // => "4821"

``replace`` supports backreferences in the replacement string: ``\1``
through ``\9`` expand to capture groups, and ``&`` expands to the entire match.
An optional fourth argument supplies regex flags such as ``"g"`` (global) or
``"gi"`` (global, case-insensitive)::

   replace("2026-11-29", "([0-9]{4})-([0-9]{2})-([0-9]{2})", "\3/\2/\1")
   // => "29/11/2026"

   replace("a=12, b=345", "[0-9]+", "[&]", "g")
   // => "a=[12], b=[345]"

   replace("Hello hello HELLO", "hello", "hi", "gi")
   // => "hi hi hi"

Dates and durations
-------------------

The **Dates** tab keeps dates and durations as distinct types, all anchored in
UTC so results do not shift depending on which browser timezone opens them.

Dates are built with ``from(...)``, ``dateOf(y, m, d)``,
``dateTimeOf(y, m, d, h, min, s)``, or ``now()``. ``from`` accepts ISO-8601
strings, common human-readable date formats, or an integer millisecond epoch
(as either a number or a digit string). Invalid calendar dates such as
``from("2026-02-30")`` are rejected outright rather than silently rolling over
into March::

   formatDate(from("2026-11-29"))
   // => "2026-11-29T00:00:00.000Z"

   formatDate(from("Nov 29, 2026"))
   // => "2026-11-29T00:00:00.000Z"

   formatDate(from(0))
   // => "1970-01-01T00:00:00.000Z"

Subtracting two dates with ``dateDiff(a, b)`` produces a (possibly negative)
duration, and adding or subtracting a duration with ``dateAdd(d, dur)`` or
``dateSub(d, dur)`` yields another date. Durations can be constructed with
``days``, ``hours``, ``minutes``, ``seconds``, ``millis``,
``duration(d, h, m, s, ms)``, or ``parseDuration(s)``, combined with
``durAdd`` / ``durSub`` / ``durScale`` / ``durDiv`` / ``durAbs``,
and converted to numbers with ``toDays`` through ``toMillis``::

   formatDuration(dateDiff(from("2026-12-25"), from("2026-11-29")))
   // => "26:00:00:00:000"

   formatDuration(dateDiff(from("2026-11-29"), from("2026-12-25")))
   // => "-26:00:00:00:000"

   formatDate(dateAdd(from("2026-11-29T09:30:00Z"), duration(2, 5, 45, 0, 0)))
   // => "2026-12-01T15:15:00.000Z"

   durDiv(days(7), hours(8))
   // => 21

   formatDuration(durScale(minutes(45), 4))
   // => "0:03:00:00:000"

When displayed without an explicit format, dates print as ISO-8601 strings and
durations print in colon-separated ``d:hh:mm:ss:SSS`` form. Both
``formatDate`` and ``formatDuration`` also accept a Unicode token pattern (with
literal text wrapped in single quotes ``'...'``)::

   formatDate(dateAdd(from("2026-11-29T09:30:00Z"), hours(36)), "yyyy-MM-dd HH:mm")
   // => "2026-11-30 21:30"

   formatDate(from("2026-11-29"), "cccc, LLLL d, yyyy")
   // => "Sunday, November 29, 2026"

   formatDuration(
     dateDiff(from("2026-12-25T12:00:00Z"), from("2026-11-29T09:30:00Z")),
     "d'd' hh'h' mm'm'"
   )
   // => "26d 02h 30m"

Individual components can be pulled out directly with ``year``, ``month``,
``day``, ``weekday``, ``hour``, ``minute``, ``second``, ``millisecond``, and
``toEpoch``. Dates and durations also support value equality (``===``, ``!==``)
and ordering (``<``, ``<=``, ``>``, ``>=``).

Variables as expressions and strict type checking
-------------------------------------------------

Variables are no longer restricted to bare numbers. Any variable can hold a full
expression — a parsed date like ``from("2026-12-31T23:59:59Z")``, a string, a
duration, or even a function — and every variable row has an edit button (``✎``)
that opens the block workspace for that variable. To keep dependency tracking
simple, variable definitions cannot reference other variables.

Behind the scenes, every formula and variable is checked by a Hindley-Milner
type inference engine before it runs. Arithmetic operators require numbers,
comparisons require matching orderable types, both branches of ``if/else`` must
agree on a type, and function calls check both arity and argument types. Trying
to evaluate ``"hello" + 1`` or ``from("2026-11-29") + days(1)`` reports the
exact mismatch instead of falling back to JavaScript coercion.

The graph button respects those inferred types too: it stays enabled only when
the formula represents a ``number → number`` mapping, and disables itself for
strings, dates, booleans, or multi-argument functions.

Try any of the expressions above at `formulas.raz.sg <https://formulas.raz.sg>`_
by opening **Import** and pasting them in.
