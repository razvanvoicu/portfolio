'use strict';
const CurveAnimation=(()=>{
  const defaults={enabled:false,duration:'5',phase:0};
  const morphDefaults={enabled:false,duration:'5',phase:0,min:0,max:1};
  const successiveDefaults={enabled:false,speed1:'5',speed2:'5',position1:0,position2:0,relative:0,swapped:false,trigger:0.05,midpoint:0.1,amplitude:0,period:'5',phase:0};
  const sweepDefaults={enabled:false,duration:'5',phase:0,swapped:false,epsilon:0.1};
  const rotationDefaults={speed:0,phase:0};
  function settings(value){
    const old=value?.rotation, legacy=old?.period;
    const previousSpeed=old?.speed??(legacy ? 1/legacy:0),speed=Math.max(-0.1,Math.min(0.1,previousSpeed));
    return {...value,shift:{...defaults,...value?.shift},morph:{...morphDefaults,...value?.morph},successive:{...successiveDefaults,...value?.successive},sweep:{...sweepDefaults,...value?.sweep},rotation:{speed,phase:old?.phase??0}};
  }
  // The shift travels from 0 to 1 over one cycle, then wraps to 0.
  function shiftAt(phase){return ((phase%1)+1)%1;}
  function advance(phase,elapsedMs,durationSeconds){return (phase+elapsedMs/(durationSeconds*1000))%1;}
  function morphAt(phase,min,max){return min+(max-min)*(1-Math.cos(2*Math.PI*phase))/2;}
  function wrap(value){return value-Math.floor(value);}
  function orbit(position,elapsedMs,periodSeconds){return wrap(position+elapsedMs/(periodSeconds*1000));}
  function oscillation(midpoint,amplitude,phase){return midpoint+amplitude*Math.sin(2*Math.PI*phase);}
  function advanceRotation(phase,elapsedMs,speed){return speed===0?phase:wrap(phase-speed*(elapsedMs/1000));}
  function advanceSweep(animation,elapsedMs){
    const total=animation.phase+elapsedMs/(Number(animation.duration)*1000);
    const flips=Math.floor(total);
    if(((flips%2)+2)%2===1)animation.swapped=!animation.swapped;
    animation.phase=total-flips;
  }
  function advanceSuccessive(animation,elapsedMs){
    const v1=1/Number(animation.speed1),v2=1/Number(animation.speed2),elapsed=elapsedMs/1000;
    const original=wrap(animation.position2-animation.position1),lower=animation.trigger,upper=1-lower,width=upper-lower;
    let d=original,remaining=elapsed,velocity=animation.swapped?v1-v2:v2-v1;
    if((d<lower && velocity<0)||(d>upper && velocity>0)){animation.swapped=!animation.swapped;velocity=-velocity;}
    if(velocity!==0 && (d<lower || d>upper)){
      const boundary=d<lower?lower:upper,time=(boundary-d)/velocity;
      if(remaining<time){d+=velocity*remaining;remaining=0;}else{d=boundary;remaining-=time;}
    }
    if(velocity!==0 && remaining>0){
      const phase=wrap(((velocity>0?d-lower:2*width-(d-lower))+Math.abs(velocity)*remaining)/(2*width))*2*width;
      d=lower+(phase<=width?phase:2*width-phase);
      const positive=phase<width;
      animation.swapped=positive!==(v2-v1>0);
    }
    animation.position1=wrap(animation.position1+(v1+v2)*elapsed/2-(d-original)/2);
    animation.position2=wrap(animation.position1+d);
    animation.relative=d;
    animation.phase=advance(animation.phase,elapsedMs,Number(animation.period));
  }
  function apply(pieces,animations){
    let result=pieces;
    if(animations.shift.enabled)result=Curves.shift(result,shiftAt(animations.shift.phase));
    return result;
  }
  function isMorph(curve){return curve.type==='morph' || (curve.type==='analytic' && !!curve.expression && CurveFormula.parse(curve.expression).hasMorph);}
  function isRotatable(curve){return curve.type==='successiveMorph'||curve.type==='sweepMorph'||isMorph(curve);}
  function animatedCurve(curve,animations){
    const a=animations.successive,sw=animations.sweep;
    let result=curve;
    if(curve.type==='successiveMorph' && a?.enabled)result={...curve,successiveStart:String(a.position1),successiveEnd:String(a.position2),epsilon:String(oscillation(a.midpoint,a.amplitude,a.phase))};
    if(curve.type==='sweepMorph' && sw?.enabled)result={...curve,sweepFactor:String(sw.phase),epsilon:String(sw.epsilon),sweepSwapped:Boolean(sw.swapped)};
    const m=animations.morph;if(m.enabled&&isMorph(curve)){const value=morphAt(m.phase,m.min,m.max);result=curve.type==='analytic'?{...result,morphOverride:value}:{...result,morphFactor:String(value)};}
    if(isRotatable(curve) && animations.rotation?.phase)result={...result,rotationAngle:animations.rotation.phase*2*Math.PI};
    return result;
  }
  return {defaults,morphDefaults,successiveDefaults,sweepDefaults,rotationDefaults,settings,shiftAt,advance,morphAt,wrap,orbit,oscillation,advanceRotation,advanceSuccessive,advanceSweep,isMorph,isRotatable,animatedCurve,apply};
})();
if(typeof module!=='undefined')module.exports=CurveAnimation;
