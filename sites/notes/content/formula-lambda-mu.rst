Recursion with λ and μ
======================

Once a calculator has conditional expressions, anonymous functions, and a
fixed-point operator, it stops being just an expression evaluator and becomes a
small functional programming language — without adding loops, mutable state, or
statements.

The **λ/μ** tab adds four building blocks to the Formula Builder:

- ``lambda(x, body)`` (or ``lambda(a, b, body)`` for multiple parameters) builds
  an anonymous function.
- ``mu(fn)`` computes the fixed point of a function whose first parameter is a
  reference to itself, enabling recursion.
- ``param`` refers to a bound lambda parameter (kept distinct from global
  variables).
- ``f(x)``, ``f(x, y)``, and ``f(x, y, z)`` apply a function value to arguments.

Because lambdas and ``mu`` are first-class values, they work identically over
numbers, booleans, strings, and dates, and they can be stored in variables via
either the text box or the graphic block editor.

Factorial with μ and λ
----------------------

Start with the textbook recursive function:

.. code-block:: javascript

   mu(lambda(f, x, x <= 0 ? 1 : x * f(x - 1)))

Read it from the inside out:

1. ``lambda(f, x, ...)`` defines a two-argument function that takes *the
   recursive function itself* as ``f`` and the input number as ``x``.
2. When ``x <= 0``, it returns the base case ``1``; otherwise it multiplies
   ``x`` by ``f(x - 1)``.
3. Wrapping that lambda in ``mu(...)`` ties the knot: ``mu`` hands back a
   one-argument function of type ``number → number`` where every call to ``f``
   re-enters the same function.

You can invoke it directly::

   (mu(lambda(f, x, x <= 0 ? 1 : x * f(x - 1))))(6)
   // => 720

Or store ``mu(lambda(f, x, x <= 0 ? 1 : x * f(x - 1)))`` in a variable named
``fact`` and call ``fact(10)`` (``3628800``) in the main formula. Because the
inferred type of ``fact`` is ``number → number``, the **Graph** button stays
active if you want to plot ``fact(x)`` over small values of ``x``. (A recursion
depth guard stops runaway recursion cleanly if a base case is missed.)

Testing primality with a recursive helper
-----------------------------------------

You can nest ``mu`` inside an outer ``lambda`` to hide internal loop state. A
trial-division primality test checks the edge cases up front (anything less than
2, non-integers, 2, and even numbers), then hands off to a recursive helper that
walks odd divisors ``3, 5, 7, ...`` until ``d * d > n``:

.. code-block:: javascript

   lambda(n,
     n < 2 || n !== floor(n) ? false :
     n === 2 ? true :
     n % 2 === 0 ? false :
     mu(lambda(check, d,
       d * d > n ? true :
       n % d === 0 ? false :
       check(d + 2)
     ))(3)
   )

Store that expression in a variable ``isPrime``. The type checker infers
``number → boolean`` (and automatically disables the Graph button, since the
result is a boolean rather than a number). Calling ``isPrime(N)`` gives::

   isPrime(1)   // => false
   isPrime(2)   // => true
   isPrime(97)  // => true
   isPrime(99)  // => false
   isPrime(997) // => true

Counting change in Singapore coins (using a string as an array)
---------------------------------------------------------------

The Formula Builder deliberately has no list or array type — only numbers,
booleans, strings, dates, durations, and functions. Yet strings plus ``find``,
``substring``, ``length``, and ``toNumber`` are all you need to represent a
list of numbers as a comma-separated string such as ``"50,20,10,5"`` (the four
circulating Singapore coin denominations in cents: 50¢, 20¢, 10¢, and 5¢).

Given a non-empty string ``coins``:

- Find the first separator with ``comma = find(coins, ",")``.
- The **head** coin is ``toNumber(comma === -1 ? coins : substring(coins, 0, comma))``.
- The **tail** of remaining coins is
  ``comma === -1 ? "" : substring(coins, comma + 1, length(coins) - comma - 1)``.

To avoid computing ``find(coins, ",")`` four times per step, we bind it once
with an immediately invoked ``lambda(comma, ...)(find(coins, ","))`` — the
standard lambda-calculus encoding of a ``let`` binding.

That gives the classic recursive Count Change recurrence — the number of ways to
make ``amount`` using ``coins`` equals the ways that use at least one of the
first coin plus the ways that skip the first coin altogether:

.. code-block:: javascript

   mu(lambda(cc, amount, coins,
     amount === 0 ? 1 :
     amount < 0 || length(coins) === 0 ? 0 :
     lambda(comma,
       cc(amount - toNumber(comma === -1 ? coins : substring(coins, 0, comma)), coins)
       + cc(amount, comma === -1 ? "" : substring(coins, comma + 1, length(coins) - comma - 1))
     )(find(coins, ","))
   ))

The type checker infers ``(number, string) → number``. Save it in a variable
``cc`` and evaluate it on Singapore's ``"50,20,10,5"`` denominations::

   cc(10, "50,20,10,5")  // => 2   (10; 5+5)
   cc(20, "50,20,10,5")  // => 4   (20; 10+10; 10+5+5; 5+5+5+5)
   cc(50, "50,20,10,5")  // => 13
   cc(100, "50,20,10,5") // => 49  ways to make $1.00
   cc(200, "50,20,10,5") // => 242 ways to make $2.00

Because the denominations live in a plain string, changing the coin set is a
single edit to the argument — no new syntax, no array type, just strings and
recursion.

Try pasting any of these into **Import** at
`formulas.raz.sg <https://formulas.raz.sg>`_ to watch them expand into blocks
and evaluate live.
