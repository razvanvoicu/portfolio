'use strict';
const CurveAnimation=(()=>{
  const defaults={enabled:false,duration:'5',phase:0};
  const morphDefaults={enabled:false,duration:'5',phase:0,min:0,max:1};
  function settings(value){return {...value,shift:{...defaults,...value?.shift},morph:{...morphDefaults,...value?.morph}};}
  // The shift travels from 0 to 1 over one cycle, then wraps to 0.
  function shiftAt(phase){return ((phase%1)+1)%1;}
  function advance(phase,elapsedMs,durationSeconds){return (phase+elapsedMs/(durationSeconds*1000))%1;}
  function morphAt(phase,min,max){return min+(max-min)*(1-Math.cos(2*Math.PI*phase))/2;}
  function apply(pieces,animations){
    let result=pieces;
    if(animations.shift.enabled)result=Curves.shift(result,shiftAt(animations.shift.phase));
    return result;
  }
  function isMorph(curve){return curve.type==='morph' || (curve.type==='analytic' && !!curve.expression && CurveFormula.parse(curve.expression).hasMorph);}
  function animatedCurve(curve,animations){const m=animations.morph;if(!m.enabled||!isMorph(curve))return curve;const value=morphAt(m.phase,m.min,m.max);return curve.type==='analytic'?{...curve,morphOverride:value}:{...curve,morphFactor:String(value)};}
  return {defaults,morphDefaults,settings,shiftAt,advance,morphAt,isMorph,animatedCurve,apply};
})();
if(typeof module!=='undefined')module.exports=CurveAnimation;
