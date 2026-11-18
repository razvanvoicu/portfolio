// Exported from the Curves app ("curves-animation" file, successive morph).
// The exported expression repeats the same morph weight in every segment, so
// only what differs per segment is kept here:
//   end  - the segment covers t up to (excluding) this value, as in "t < end ? ..."
//   from - the first curve there: ['c', radius, turns] is a circle point,
//          ['l', t0, width, x0, x1, y0, y1] is a straight join from (x0,y0) to (x1,y1)
//   to   - the second curve there: one of the keys of `second` in curve.mjs
// Each segment blends from -> to with the successive-morph weight built from s1, s2 and e.
export const segments = [
  [0.09, ['c', 50, 0.1], 'spiral'],
  [0.09999999999999999, ['l', 0.09, 0.009999999999999995, 40.45084971874737, 30.901699437494745, 29.389262614623657, 95.10565162951535], 'spiral'],
  [0.19, ['c', 100, 0.2], 'spiral'],
  [0.19999999999999998, ['l', 0.19, 0.010000000000000009, 30.901699437494745, -15.450849718747378, 95.10565162951535, 47.552825814757675], 'spiral'],
  [0.2, ['c', 50, 0.30000000000000004], 'spiral'],
  [0.29, ['c', 50, 0.30000000000000004], 'spiral'],
  [0.3, ['l', 0.29, 0.010000000000000009, -15.450849718747378, -80.90169943749473, 47.552825814757675, 58.77852522924732], 'spiral'],
  [0.39, ['c', 100, 0.4], 'spiral'],
  [0.39999999999999997, ['l', 0.39, 0.010000000000000009, -80.90169943749473, -50, 58.77852522924732, 6.123233995736766e-15], 'spiral'],
  [0.4, ['c', 50, 0.5], 'bulb'],
  [0.42500000000000004, ['c', 50, 0.5], 'bulb'],
  [0.49, ['c', 50, 0.5], 'return'],
  [0.49999999999999994, ['l', 0.49, 0.010000000000000009, -50, -80.90169943749476, 6.123233995736766e-15, -58.7785252292473], 'return'],
  [0.5, ['c', 100, 0.6], 'return'],
  [0.59, ['c', 100, 0.6], 'return'],
  [0.6, ['l', 0.59, 0.010000000000000009, -80.90169943749476, -15.450849718747378, -58.7785252292473, -47.552825814757675], 'return'],
  [0.69, ['c', 50, 0.7], 'return'],
  [0.7, ['l', 0.69, 0.010000000000000009, -15.450849718747378, 30.901699437494724, -47.552825814757675, -95.10565162951536], 'return'],
  [0.7899999999999999, ['c', 100, 0.7999999999999999], 'return'],
  [0.7999999999999999, ['l', 0.7899999999999999, 0.010000000000000009, 30.901699437494724, 40.450849718747364, -95.10565162951536, -29.389262614623668], 'return'],
  [0.8899999999999999, ['c', 50, 0.9], 'return'],
  [0.8999999999999999, ['l', 0.8899999999999999, 0.010000000000000009, 40.450849718747364, 100, -29.389262614623668, -2.4492935982947064e-14], 'return'],
  [0.9750000000000001, ['c', 100, 1], 'return'],
  [0.9899999999999999, ['c', 100, 1], 'tail'],
  [Infinity, ['l', 0.9899999999999999, 0.01000000000000012, 100, 40.45084971874737, -2.4492935982947064e-14, 29.389262614623657], 'tail'],
];

export const animations = {
  shift: { enabled: true, duration: '3.98218804749854', phase: 0.5583639486285008 },
  successive: {
    enabled: true,
    speed1: '5.8717474531179',
    speed2: '10.4336837323989',
    position1: 0.6555992415395757,
    position2: 0.9992367963570128,
    relative: 0.34363755481743713,
    swapped: true,
    trigger: 0.0518272662384011,
    midpoint: 0.0555371704193974,
    amplitude: 0.00248321412607831,
    period: '12.0263123742781',
    phase: 0.9925168020501451,
  },
};

export const drawing = { startColor: '#af0856', endColor: '#c35418', thickness: 15 };
export const canvas = { startColor: '#2c3a33', endColor: '#090c12' };
// Thickness in the Curves app is in pixels of its 800 px preview canvas.
export const referenceWidth = 800;
