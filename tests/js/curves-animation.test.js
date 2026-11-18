const {test}=require('node:test');
const assert=require('node:assert/strict');
global.Curves=require('../../sites/curves/static/curves.js');
global.JsFormula=require('../../sites/formulas/static/jsformula.js');
global.CurveFormula=require('../../sites/curves/static/curve-formula.js');
const Animation=require('../../sites/curves/static/animation.js');
test('successive animation positions wrap, and epsilon oscillates around its midpoint',()=>{
 assert.ok(Math.abs(Animation.orbit(.9,1000,5)-.1)<1e-12);
 assert.ok(Math.abs(Animation.wrap(-.2)-.8)<1e-12);
 assert.equal(Animation.oscillation(.1,.05,0),.1);
 assert.ok(Math.abs(Animation.oscillation(.1,.05,.25)-.15)<1e-12);
 assert.ok(Math.abs(Animation.oscillation(.1,.05,.75)-.05)<1e-12);
});
test('successive animation exchanges speeds before points cross',()=>{
 const formula=code=>({code,state:{variables:[{name:'t',text:'0'}]}});
 const first={id:'a',type:'equation',mode:'cartesian',formulas:{x:formula('0'),y:formula('0')}};
 const second={id:'b',type:'equation',mode:'cartesian',formulas:{x:formula('100'),y:formula('200')}};
 const lookup=id=>({a:first,b:second})[id];
 const curve={id:'s',type:'successiveMorph',source1:'a',source2:'b',successiveStart:'.5',successiveEnd:'.5',epsilon:'.1'};
 function point(pieces,t){return pieces.find((p,i)=>p.a<=t && (t<p.b || (t===1 && i===pieces.length-1))).point(t);}
 const moving={...Animation.successiveDefaults,position1:.3,position2:.7,relative:.4,speed1:'1',speed2:'2'};
 Animation.advanceSuccessive(moving,1000);
 assert.ok(Math.abs(moving.relative-.2)<1e-12);
 assert.ok(Math.abs(moving.position1-.15)<1e-12);
 assert.ok(Math.abs(moving.position2-.35)<1e-12);
 assert.equal(moving.swapped,true);assert.equal(moving.speed1,'1');assert.equal(moving.speed2,'2');
 const settings=Animation.settings({shift:{enabled:true,phase:.25},successive:{enabled:true,position1:.2,position2:.8,relative:.6,midpoint:.1,amplitude:0}});
 const base=Curves.build(Animation.animatedCurve(curve,settings),lookup),shifted=Animation.apply(base,settings);
 assert.deepEqual(point(shifted,0),point(base,.25));
});
test('speed swaps prevent crossings with close starts and long frames',()=>{
 const initial={...Animation.successiveDefaults,position1:.2,position2:.22,relative:.02,speed1:'1',speed2:'2'};
 const a={...initial};Animation.advanceSuccessive(a,100);assert.equal(a.swapped,true);assert.ok(Math.abs(a.relative-.07)<1e-12);
 const away={...initial,speed1:'2',speed2:'1'};Animation.advanceSuccessive(away,10);assert.equal(away.swapped,false);assert.ok(away.relative>.02);
 const big={...initial},small={...initial};Animation.advanceSuccessive(big,400000);for(let i=0;i<4000;i++)Animation.advanceSuccessive(small,100);
 assert.ok(Math.abs(big.position1-small.position1)<1e-9);assert.ok(Math.abs(big.relative-small.relative)<1e-9);assert.equal(big.swapped,small.swapped);
 assert.ok(big.relative>=.05 && big.relative<=.95);
});
test('shift animation moves from 0 toward 1, then wraps to 0 repeatedly',()=>{
 assert.deepEqual([0,.25,.75,1,1.25,1.75,2].map(Animation.shiftAt),[0,.25,.75,0,.25,.75,0]);
});
test('animation shifts the drawing without modifying its source pieces',()=>{
 const pieces=[{a:0,b:1,point:t=>[t,0]}];
 const shifted=Animation.apply(pieces,{shift:{enabled:true,phase:.25}});
 assert.equal(shifted[0].point(0)[0],.25);assert.equal(pieces[0].point(0)[0],0);
});
test('duration controls elapsed time for a complete forward cycle',()=>{
 assert.equal(Animation.advance(0,1250,5),.25);
 assert.equal(Animation.shiftAt(Animation.advance(0,2500,5)),.5);
 assert.equal(Animation.shiftAt(Animation.advance(0,5000,5)),0);
 assert.equal(Animation.shiftAt(Animation.advance(0,250,0.5)),.5);
 assert.equal(Animation.advance(.9,1000,5),.10000000000000009);
});
test('animation settings default to stopped five-second cycles',()=>{
 const morph={enabled:false,duration:'5',phase:0,min:0,max:1},successive={...Animation.successiveDefaults},rotation={speed:0,phase:0};
 assert.deepEqual(Animation.settings(),{shift:{enabled:false,duration:'5',phase:0},morph,successive,rotation});
 assert.deepEqual(Animation.settings({shift:{enabled:true,duration:'2',phase:1}}),{shift:{enabled:true,duration:'2',phase:1},morph,successive,rotation});
});
test('rotation speed determines direction and rate and zero pauses',()=>{
 assert.equal(Animation.advanceRotation(.25,1000,.25),0);
 assert.equal(Animation.advanceRotation(.25,1000,-.25),.5);
 assert.equal(Animation.advanceRotation(.25,4000,.25),.25);
 assert.equal(Animation.advanceRotation(.25,1000,0),.25);
 assert.equal(Animation.advanceRotation(0,1000,1),0);
 assert.deepEqual(Animation.settings({rotation:{period:-4,phase:.2}}).rotation,{speed:-.1,phase:.2});
 assert.deepEqual(Animation.settings({rotation:{period:.5,phase:.2}}).rotation,{speed:.1,phase:.2});
 assert.deepEqual(Animation.settings({rotation:{speed:-.5,phase:.2}}).rotation,{speed:-.1,phase:.2});
 assert.deepEqual(Animation.settings({rotation:{speed:.04,phase:.2}}).rotation,{speed:.04,phase:.2});
});
test('shared rotation applies to morphs independently of their animation toggle',()=>{
 const formula=code=>({code,state:{variables:[{name:'t',text:'0'}]}});
 const first={id:'a',type:'equation',mode:'cartesian',formulas:{x:formula('100'),y:formula('0')}};
 const second={id:'b',type:'equation',mode:'cartesian',formulas:{x:formula('50'),y:formula('0')}};
 const find=id=>({a:first,b:second})[id],settings=Animation.settings({rotation:{speed:.1,phase:Animation.advanceRotation(0,2500,.1)}});
 for(const curve of [{id:'m',type:'morph',source1:'a',source2:'b',morphFactor:'.5',morphShift:'0'},
  {id:'s',type:'successiveMorph',source1:'a',source2:'b',successiveStart:'.2',successiveEnd:'.8',epsilon:'.1'}]){
  const pieces=Curves.build(Animation.animatedCurve(curve,settings),find),p=pieces.find(x=>x.a<=.5&&.5<x.b).point(.5);
  assert.ok(Math.abs(p[0])<1e-10);assert.ok(p[1]<0);
 }
});
test('morph animation changes only the preview definition',()=>{
 const curve={type:'morph',morphFactor:'0.1'}, animations=Animation.settings({morph:{enabled:true,min:.2,max:.8,phase:.5}});
 assert.ok(Math.abs(Number(Animation.animatedCurve(curve,animations).morphFactor)-.8)<1e-12);
 assert.equal(curve.morphFactor,'0.1');
 assert.equal(Animation.animatedCurve({type:'equation'},animations).type,'equation');
});
test('analytical curves with m animate without changing the stored expression',()=>{
 const curve={type:'analytic',expression:'[t, m*t, m=0.2]'};
 const animations=Animation.settings({morph:{enabled:true,min:0,max:1,phase:.5}});
 assert.equal(Animation.isMorph(curve),true);
 const animated=Animation.animatedCurve(curve,animations);
 assert.deepEqual(Curves.build({...animated,id:'test'},()=>{})[0].point(.5),[.5,.5]);
 assert.equal(curve.expression,'[t, m*t, m=0.2]');
 assert.equal(Animation.isMorph({type:'analytic',expression:'[t, t]'}),false);
});
test('disabled shift leaves the source unshifted',()=>{
 const pieces=[{a:0,b:1,point:t=>[t,0]}];
 assert.equal(Animation.apply(pieces,{shift:{enabled:false,phase:.75}})[0].point(0)[0],0);
});
test('morph oscillates sinusoidally between the selected limits',()=>{
 const f=phase=>Animation.morphAt(phase,.2,.8);
 assert.equal(f(0),.2);assert.ok(Math.abs(f(.25)-.5)<1e-12);
 assert.ok(Math.abs(f(.5)-.8)<1e-12);assert.ok(Math.abs(f(.75)-.5)<1e-12);assert.equal(f(1),.2);
 assert.equal(Animation.morphAt(.3,.4,.4),.4);
});
