const { test } = require('node:test');
const assert = require('node:assert/strict');
global.JsFormula = require('../../sites/formulas/static/jsformula.js');
const Curves = require('../../sites/curves/static/curves.js');
const formula = code => ({ code, state: { variables: [{name:'t',text:'0'}] } });
const line = {id:'line',type:'equation',mode:'cartesian',formulas:{x:formula('100 - 200*t'),y:formula('100')}};
const defs = new Map([[line.id,line]]);
const lookup = id => defs.get(id);
const close = (actual,expected) => actual.forEach((x,i)=>assert.ok(Math.abs(x-expected[i])<1e-8, `${actual} != ${expected}`));
const make = (type, more) => ({id:type,type,source1:'line',...more});

test('equations, slicing, translation and rotation preserve coordinates', () => {
  close(Curves.build(line,lookup)[0].point(0.25), [50,100]);
  close(Curves.build(make('slice',{from:'0.25',to:'0.75'}),lookup)[0].point(0.5), [0,100]);
  close(Curves.build(make('translate',{dx:'5',dy:'-10'}),lookup)[0].point(0), [105,90]);
  close(Curves.build(make('rotate',{alpha:'Math.PI/2'}),lookup)[0].point(0), [-100,100]);
  const circle={id:'circle',type:'equation',mode:'polar',formulas:{r:formula('100'),theta:formula('2*Math.PI*t')}};
  close(Curves.build(circle,lookup)[0].point(.25),[0,100]);
});
test('iteration creates a square with successive rotations, and concatenation keeps pieces separate', () => {
  const pieces=Curves.build(make('iterate',{n:'4',alpha:'Math.PI/2',dx:'0',dy:'0'}),lookup);
  assert.equal(pieces.length,4);
  close(pieces[0].point(0),[100,100]);close(pieces[1].point(.25),[-100,100]);close(pieces[3].point(1),[100,100]);
  const joined=Curves.build(make('concat',{source2:'line'}),lookup);assert.deepEqual(joined.map(p=>[p.a,p.b]),[[0,.5],[.5,1]]);
});
test('splicing alternates intervals and rejects odd segment counts', () => {
  const other={...line,id:'other',formulas:{x:formula('0'),y:formula('0')}};defs.set('other',other);
  const pieces=Curves.build(make('splice',{source2:'other',n:'4'}),lookup);
  assert.deepEqual(pieces.map(p=>[p.a,p.b]),[[0,.25],[.25,.5],[.5,.75],[.75,1]]);
  close(pieces[0].point(.125),[75,100]);close(pieces[1].point(.375),[0,0]);
  assert.throws(()=>Curves.build(make('splice',{source2:'other',n:'3'}),lookup),/even/);
});
test('rejects cyclic references', () => {
  const cycle=make('translate',{source1:'loop',dx:'0',dy:'0'});cycle.id='loop';defs.set('loop',cycle);
  assert.throws(()=>Curves.build(cycle,lookup),/depend on itself/);
});

test('splice allocates equal time to curve segments and joins every pair, closing the path', () => {
  const other={...line,id:'other-splice',formulas:{x:formula('0'),y:formula('0')}};defs.set(other.id,other);
  const pieces=Curves.build(make('splice',{source2:other.id,n:'4',epsilon:'0.1'}),lookup);
  assert.equal(pieces.length,8);
  const bounds=[[0,.15],[.15,.25],[.25,.4],[.4,.5],[.5,.65],[.65,.75],[.75,.9],[.9,1]];
  pieces.forEach((piece,i)=>{assert.ok(Math.abs(piece.a-bounds[i][0])<1e-12);assert.ok(Math.abs(piece.b-bounds[i][1])<1e-12);});
  close(pieces[0].point(0),[100,100]);close(pieces[0].point(.15),[50,100]);
  close(pieces[1].point(.15),[50,100]);close(pieces[1].point(.25),[0,0]);
  close(pieces[7].point(.9),[0,0]);close(pieces[7].point(1),[100,100]);
});
test('splice handles zero and maximum joining time and rejects invalid epsilon', () => {
  const options={source2:'line',n:'4'};
  const zero=Curves.build(make('splice',{...options,epsilon:'0'}),lookup);
  assert.equal(zero.length,4);close(zero[3].point(1),[-100,100]);
  const max=Curves.build(make('splice',{...options,epsilon:'1/4'}),lookup);
  assert.equal(max.length,4);close(max[3].point(1),[100,100]);
  assert.throws(()=>Curves.build(make('splice',{...options,epsilon:'-0.01'}),lookup),/Epsilon/);
  assert.throws(()=>Curves.build(make('splice',{...options,epsilon:'0.26'}),lookup),/Epsilon/);
});

test('scaling multiplies both coordinates and preserves piece timing', () => {
  const joined=make('concat',{source2:'line'});defs.set('joined',joined);
  const pieces=Curves.build(make('scale',{source1:'joined',factor:'1/2'}),lookup);
  assert.deepEqual(pieces.map(p=>[p.a,p.b]),[[0,.5],[.5,1]]);
  close(pieces[0].point(.125),[25,50]);
  close(pieces[1].point(1),[-50,50]);
  close(Curves.build(make('scale',{factor:'2'}),lookup)[0].point(.5),[0,200]);
  for (const factor of ['0','-1','1/0','']) assert.throws(()=>Curves.build(make('scale',{factor}),lookup));
});

test('splice trims source segments in t units and joins their retained endpoints', () => {
  const other={...line,id:'trim-other',formulas:{x:formula('0'),y:formula('0')}};defs.set(other.id,other);
  const pieces=Curves.build(make('splice',{source2:other.id,n:'4',epsilon:'0.1',dropStart:'0.05',dropEnd:'0.1'}),lookup);
  close(pieces[0].point(0),[90,100]);close(pieces[0].point(.15),[70,100]);
  close(pieces[1].point(.15),[70,100]);close(pieces[1].point(.25),[0,0]);
  close(pieces[7].point(1),[90,100]);
  assert.throws(()=>Curves.build(make('splice',{source2:other.id,n:'4',epsilon:'0',dropStart:'0.2',dropEnd:'0.1'}),lookup),/Drops/);
});
test('splice accepts drops totaling the segment duration, retaining points', () => {
  const origin={...line,id:'point-origin',formulas:{x:formula('0'),y:formula('0')}};defs.set(origin.id,origin);
  const curve=make('splice',{source2:origin.id,n:'4',epsilon:'0.1',dropStart:'0.1',dropEnd:'0.15'});
  const pieces=Curves.build(curve,lookup);
  close(pieces[0].point(0),[80,100]);close(pieces[0].point(.15),[80,100]);
  close(pieces[1].point(.15),[80,100]);close(pieces[1].point(.25),[0,0]);
  close(pieces[7].point(1),[80,100]);
});
test('trimmed concentric circles join their single retained points', () => {
 const circle=(id,r)=>({id,type:'equation',mode:'polar',formulas:{r:formula(String(r)),theta:formula('2*Math.PI*t')}});
 defs.set('outer-circle',circle('outer-circle',100));defs.set('inner-circle',circle('inner-circle',50));
 const pieces=Curves.build({id:'cog',type:'splice',source1:'outer-circle',source2:'inner-circle',n:'4',epsilon:'0.1',dropStart:'0.125',dropEnd:'0.125'},lookup);
 close(pieces[0].point(0),[Math.SQRT1_2*100,Math.SQRT1_2*100]);
 close(pieces[1].point(.25),[-Math.SQRT1_2*50,Math.SQRT1_2*50]);
 close(pieces[7].point(1),[Math.SQRT1_2*100,Math.SQRT1_2*100]);
});

test('concatenation traverses any number of curves using their allocated fractions',()=>{
 const other={...line,id:'concat-other',formulas:{x:formula('10*t'),y:formula('0')}};defs.set(other.id,other);
 const curve=make('concat',{concatCount:'3',concatSources:['line',other.id,'line'],concatFractions:['0.2','0.3']});
 const parts=Curves.build(curve,lookup);
 assert.equal(parts.length,3);assert.deepEqual(parts.map(p=>[p.a,p.b]),[[0,.2],[.2,.5],[.5,1]]);
 close(parts[0].point(.1),[0,100]);close(parts[1].point(.35),[5,0]);close(parts[2].point(.75),[0,100]);
});
test('concatenation skips zero-time sources and validates fractions and N',()=>{
 const base={concatCount:'3',concatSources:['line','line','line'],concatFractions:['0','1']};
 const parts=Curves.build(make('concat',base),lookup);
 assert.equal(parts.length,1);assert.equal(parts[0].a,0);assert.equal(parts[0].b,1);
 assert.throws(()=>Curves.build(make('concat',{...base,concatFractions:['0.6','0.5']}),lookup),/at most 1/);
 assert.throws(()=>Curves.build(make('concat',{...base,concatFractions:['-0.1','0.5']}),lookup),/nonnegative/);
 assert.throws(()=>Curves.build(make('concat',{...base,concatCount:'1'}),lookup),/at least 2/);
 assert.throws(()=>Curves.build(make('concat',{...base,concatSources:['line','line','missing']}),lookup),/source curve/);
});
test('concatenation accepts decimal fractions that sum to one',()=>{
 const curve=make('concat',{concatCount:'6',concatSources:Array(6).fill('line'),concatFractions:['0.1','0.2','0.3','0.3','0.1']});
 const pieces=Curves.build(curve,lookup);assert.equal(pieces.length,5);
});

test('reverse traverses a curve from its end to its start',()=>{
 const reversed=Curves.build(make('reverse',{}),lookup);
 close(reversed[0].point(0),[-100,100]);close(reversed[0].point(.25),[-50,100]);close(reversed[0].point(1),[100,100]);
});
test('reverse reverses the order and time intervals of piecewise curves',()=>{
 const other={...line,id:'reverse-other',formulas:{x:formula('10*t'),y:formula('0')}};defs.set(other.id,other);
 const joined=make('concat',{source2:other.id,concatCount:'2',concatSources:['line',other.id],concatFractions:['0.2']});defs.set('reverse-joined',joined);
 const pieces=Curves.build(make('reverse',{source1:'reverse-joined'}),lookup);
 assert.equal(pieces.length,2);assert.ok(Math.abs(pieces[0].b-.8)<1e-12);assert.equal(pieces[1].b,1);
 close(pieces[0].point(0),[10,0]);close(pieces[0].point(.4),[5,0]);close(pieces[1].point(1),[100,100]);
});

test('simple morph interpolates corresponding coordinates',()=>{
 const second={id:'morph-line',type:'equation',mode:'cartesian',formulas:{x:formula('10*t'),y:formula('-20')}};defs.set(second.id,second);
 const morph=make('morph',{source2:second.id,morphFactor:'0.25'});
 const pieces=Curves.build(morph,lookup);
 close(pieces[0].point(.25),[.75*50+.25*2.5,.75*100+.25*(-20)]);
 close(Curves.build({...morph,morphFactor:'0'},lookup)[0].point(.25),[50,100]);
 close(Curves.build({...morph,morphFactor:'1'},lookup)[0].point(.25),[2.5,-20]);
});
test('morph preserves every piece boundary from both sources',()=>{
 const a=make('concat',{id:'morph-a',concatCount:'2',concatSources:['line','line'],concatFractions:['0.2']});
 const b=make('concat',{id:'morph-b',concatCount:'2',concatSources:['line','line'],concatFractions:['0.7']});
 defs.set(a.id,a);defs.set(b.id,b);
 const pieces=Curves.build(make('morph',{source1:a.id,source2:b.id,morphFactor:'0.5'}),lookup);
 assert.deepEqual(pieces.map(p=>[p.a,p.b]),[[0,.2],[.2,.7],[.7,1]]);
});

test('shift moves the starting point and preserves original parameter speed',()=>{
 const pieces=Curves.build(make('shift',{shiftStart:'0.25'}),lookup);
 assert.equal(pieces.length,2);close(pieces[0].point(0),[50,100]);close(pieces[0].point(.5),[-50,100]);
 close(pieces[0].point(.75),[-100,100]);close(pieces[1].point(.75),[100,100]);close(pieces[1].point(1),[50,100]);
 close(Curves.build(make('shift',{shiftStart:'0'}),lookup)[0].point(0),[100,100]);
 close(Curves.build(make('shift',{shiftStart:'1'}),lookup)[0].point(0),[-100,100]);
 assert.throws(()=>Curves.build(make('shift',{shiftStart:'-0.1'}),lookup),/between 0 and 1/);
 assert.throws(()=>Curves.build(make('shift',{shiftStart:'1.1'}),lookup),/between 0 and 1/);
});
test('morph requires a factor between 0 and 1',()=>{
 const options={source2:'line'};
 assert.throws(()=>Curves.build(make('morph',{...options,morphFactor:'-0.1'}),lookup),/between 0 and 1/);
 assert.throws(()=>Curves.build(make('morph',{...options,morphFactor:'1.1'}),lookup),/between 0 and 1/);
});
test('morph retains the starting point when its shifted source starts at t=1',()=>{
 const shifted=make('shift',{id:'shift-end',shiftStart:'1'});defs.set(shifted.id,shifted);
 const pieces=Curves.build(make('morph',{source1:shifted.id,source2:'line',morphFactor:'0.5'}),lookup);
 assert.equal(pieces[0].a,0);assert.equal(pieces[0].b,0);close(pieces[0].point(0),[0,100]);
});

test('morph shifts only the second curve and keeps its timing',()=>{
 const second={id:'shifted-morph-line',type:'equation',mode:'cartesian',formulas:{x:formula('10*t'),y:formula('0')}};defs.set(second.id,second);
 const morph=make('morph',{source2:second.id,morphFactor:'0.5',morphShift:'0.25'});
 const pieces=Curves.build(morph,lookup);
 close(pieces[0].point(0),[51.25,50]);close(pieces[0].point(.5),[3.75,50]);
 close(pieces[1].point(.75),[-25,50]);
 close(Curves.build({...morph,morphFactor:'0'},lookup)[0].point(.25),[50,100]);
 close(Curves.build({...morph,morphFactor:'1'},lookup)[0].point(0),[2.5,0]);
 close(Curves.build({...morph,morphShift:'0'},lookup)[0].point(0),[50,50]);
 const legacy={...morph};delete legacy.morphShift;close(Curves.build(legacy,lookup)[0].point(0),[50,50]);
 assert.throws(()=>Curves.build({...morph,morphShift:'-0.1'},lookup),/between 0 and 1/);
 assert.throws(()=>Curves.build({...morph,morphShift:'1.1'},lookup),/between 0 and 1/);
});
