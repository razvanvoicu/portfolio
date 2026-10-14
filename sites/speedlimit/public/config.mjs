// Agreed driving rules. Distances are metres, angles degrees, speeds km/h.
export const CONFIG = Object.freeze({
  defaultLimitKph: 50,
  signRadiusM: 30,
  signBearingToleranceDeg: 45,
  turnAngleDeg: 60,
  minMovementM: 5,
  positionHistoryLength: 4,
  turnHistoryDistanceM: 30,
  minimumAudibleLimitKph: 60,
  maxFixAgeMs: 8000,
  futureFixToleranceMs: 1000,
});
