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
