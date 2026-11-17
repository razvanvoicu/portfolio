const {test}=require('node:test');
const assert=require('node:assert/strict');
global.Curves=require('../../sites/curves/static/curves.js');
global.JsFormula=require('../../sites/formulas/static/jsformula.js');
global.CurveFormula=require('../../sites/curves/static/curve-formula.js');
const Animation=require('../../sites/curves/static/animation.js');
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
 const morph={enabled:false,duration:'5',phase:0,min:0,max:1};
 assert.deepEqual(Animation.settings(),{shift:{enabled:false,duration:'5',phase:0},morph});
 assert.deepEqual(Animation.settings({shift:{enabled:true,duration:'2',phase:1}}),{shift:{enabled:true,duration:'2',phase:1},morph});
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
