const {test}=require('node:test');
const assert=require('node:assert/strict');
global.JsFormula=require('../../sites/formulas/static/jsformula.js');
global.CurveFormula=require('../../sites/curves/static/curve-formula.js');
const Curves=require('../../sites/curves/static/curves.js');
const formula=code=>({code,state:{variables:[{name:'t',text:'0'}]}});
const base={id:'a',type:'equation',mode:'cartesian',formulas:{x:formula('100*t'),y:formula('20')}};
const other={id:'b',type:'equation',mode:'polar',formulas:{r:formula('50'),theta:formula('2*Math.PI*t')}};
const lookup=id=>({a:base,b:other})[id];
function compare(curve){
 const original=Curves.build(curve,lookup),text=CurveFormula.exportPieces(original),imported=CurveFormula.pieces(text),evaluate=Function('t',`return (${text})`);
 assert.equal(imported.length,original.length,curve.type);
 original.forEach((p,i)=>{assert.ok(Math.abs(p.a-imported[i].a)<1e-12);assert.ok(Math.abs(p.b-imported[i].b)<1e-12);for(const t of [p.a,(p.a+p.b)/2,p.b]){const a=p.point(t),b=imported[i].point(t);for(let j=0;j<2;j++)assert.ok(Math.abs(a[j]-b[j])<1e-8,`${curve.type} t=${t}: ${a} != ${b}`);}});
 for(const t of [0,.137,.719,1]){const p=imported.find((p,i)=>p.a===p.b?t===p.a:t>=p.a&&(t<p.b||i===imported.length-1));if(p){const a=p.point(t),b=evaluate(t);for(let j=0;j<2;j++)assert.ok(Math.abs(a[j]-b[j])<1e-8);}}
}
test('exported expressions reproduce each combination and preserve piece boundaries',()=>{
 for(const curve of [base,other,
  {id:'c',type:'translate',source1:'a',dx:'5',dy:'-3'},
  {id:'c',type:'rotate',source1:'a',alpha:'Math.PI/3'},
  {id:'c',type:'scale',source1:'a',factor:'2'},
  {id:'c',type:'scale',source1:'a',factor:'2',scaleAxis:'x'},
  {id:'c',type:'scale',source1:'a',factor:'2',scaleAxis:'y'},
  {id:'c',type:'slice',source1:'a',from:'.2',to:'.8'},
  {id:'c',type:'reverse',source1:'a'},
  {id:'c',type:'shift',source1:'a',shiftStart:'.3'},
  {id:'c',type:'shift',source1:'a',shiftStart:'1'},
  {id:'c',type:'concat',source1:'a',source2:'b'},
  {id:'c',type:'iterate',source1:'a',n:'4',alpha:'Math.PI/2',dx:'0',dy:'0'},
  {id:'c',type:'morph',source1:'a',source2:'b',morphFactor:'.4',morphShift:'.2'},
  {id:'c',type:'successiveMorph',source1:'a',source2:'b',successiveStart:'.8',successiveEnd:'.2',epsilon:'.3'},
  {id:'c',type:'splice',source1:'a',source2:'b',n:'4',epsilon:'.1',dropStart:'.05',dropEnd:'.05'},
  {id:'c',type:'splice',source1:'a',source2:'b',n:'4',epsilon:'.25',dropStart:'.1',dropEnd:'.15'}])compare(curve);
});
test('imports math expressions and rejects executable or unknown JavaScript',()=>{
 assert.deepEqual(CurveFormula.pieces('[Math.cos(t), t < 0.5 ? 3 : 4]')[0].point(.25),[Math.cos(.25),3]);
 for(const value of ['[alert(1), 0]','[window.location, 0]','[other, t]','[1, 2, 3]'])assert.throws(()=>CurveFormula.pieces(value));
});
test('analytical morphs use the shared factor and validate its presence',()=>{
 const expression='[m*t, (1-m)*t, m=0.25]';
 assert.equal(CurveFormula.parse(expression).hasMorph,true);
 assert.deepEqual(CurveFormula.pieces(expression)[0].point(1),[.25,.75]);
 assert.deepEqual(CurveFormula.pieces(expression,.8)[0].point(1),[.8,1-.8]);
 assert.deepEqual(CurveFormula.pieces('[m*t, m]')[0].point(1),[.5,.5]);
 assert.equal(CurveFormula.parse('[m*t, t]').hasMorph,true);
 assert.throws(()=>CurveFormula.parse('[m*t, m, m=2]'),/between 0 and 1/);
});
test('symbolic Simple Morph exports retain both curves even at factor endpoints',()=>{
 for(const factor of ['0','1']){
  const curve={id:'m',type:'morph',source1:'a',source2:'b',morphFactor:factor,morphShift:'0',symbolicMorph:true};
  const text=CurveFormula.exportPieces(Curves.build(curve,lookup),Number(factor));
  assert.equal(CurveFormula.parse(text).hasMorph,true);
  const points=CurveFormula.pieces(text,.5)[0].point(.25);
  const a=Curves.build(base,lookup)[0].point(.25),b=Curves.build(other,lookup)[0].point(.25);
  assert.ok(points.every((v,i)=>Math.abs(v-(a[i]+b[i])/2)<1e-10));
 }
});
test('successive morph coordinates remain parameterized when the interval wraps',()=>{
 const xys=CurveFormula.successiveCoordinates(Curves.build(base,lookup),Curves.build(other,lookup));
 for(const coordinate of xys){const result=JsFormula.compile(coordinate);assert.ok(result.names.every(name=>['t','s1','s2','e'].includes(name)));}
 const fn=Function('t','s1','s2','e',`return [${xys.join(',')}];`);
 for(const [s1,s2,e] of [[.1,.8,.2],[.8,.2,.3],[.2,.6,.3]]){
  const c={id:'c',type:'successiveMorph',source1:'a',source2:'b',successiveStart:String(s1),successiveEnd:String(s2),epsilon:String(e)},pieces=Curves.build(c,lookup);
  for(const t of [.01,.15,.35,.52,.74,.93]){const p=pieces.find(p=>p.a<=t&&t<p.b).point(t),q=fn(t,s1,s2,e);p.forEach((v,i)=>assert.ok(Math.abs(v-q[i])<1e-8));}
 }
});
test('successive morph expression carries only its parameters and remains editable',()=>{
 const sources=[Curves.build(base,lookup),Curves.build(other,lookup)],params={s1:.8,s2:.2,e:.3};
 const expression=CurveFormula.successiveExpression(...sources,params),parsed=CurveFormula.parse(expression);
 assert.deepEqual(parsed.successive,params);
 const source={id:'c',type:'successiveMorph',source1:'a',source2:'b',successiveStart:'.8',successiveEnd:'.2',epsilon:'.3'},original=Curves.build(source,lookup);
 for(const t of [.01,.15,.35,.52,.74,.93]){const a=original.find(p=>p.a<=t&&t<p.b).point(t),b=CurveFormula.pieces(expression)[0].point(t);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8));}
 const changed={s1:.1,s2:.7,e:.2},points=CurveFormula.pieces(expression,undefined,changed);
 assert.notDeepEqual(points[0].point(.1),CurveFormula.pieces(expression)[0].point(.1));
});
test('successive morph export selects the source piece next to a transition',()=>{
 const first=[{a:0,b:.5,expression:()=>['0','0']},{a:.5,b:1,expression:()=>['100','0']}];
 const second=[{a:0,b:1,expression:()=>['0','0']}];
 const expression=CurveFormula.successiveExpression(first,second,{s1:.501,s2:.8,e:.1});
 const pieces=CurveFormula.pieces(expression),t=.5005;
 assert.deepEqual(pieces.find(p=>p.a<=t&&t<p.b).point(t),[100,0]);
});
