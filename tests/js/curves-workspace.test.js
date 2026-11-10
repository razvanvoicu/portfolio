const {test}=require('node:test');
const assert=require('node:assert/strict');
global.JsFormula=require('../../sites/formulas/static/jsformula.js');
const Workspace=require('../../sites/curves/static/workspace.js');
const formula={code:'100 * Math.cos(2 * Math.PI * t)',state:{variables:[{id:'v1',name:'t',text:'0'}],workspace:{blocks:{blocks:[]}}}};
const source={id:'c1',name:'Circle',type:'equation',mode:'cartesian',formulas:{x:formula,y:formula}};
const combination={id:'c2',name:'Scaled',type:'scale',mode:'cartesian',formulas:{},source1:'c1',factor:'2'};
const state={curves:[source,combination],draft:{...combination},editing:'c2',dialog:null};
const file={format:'curves-workspace',version:1,workspace:state};
const copy=()=>structuredClone(file);
test('workspace export preserves curves, order, editor state, and draft',()=>{const imported=Workspace.validate(JSON.parse(JSON.stringify(file)));assert.deepEqual(imported,state);});
test('rejects malformed files, missing sources, and executable formula code',()=>{
  assert.throws(()=>Workspace.validate({}));
  let candidate=copy();candidate.workspace.curves[1].source1='missing';assert.throws(()=>Workspace.validate(candidate),/missing source/);
  candidate=copy();candidate.workspace.curves[0].formulas.x.code='globalThis.alert(1)';assert.throws(()=>Workspace.validate(candidate));
  candidate=copy();candidate.workspace.curves.push(candidate.workspace.curves[0]);assert.throws(()=>Workspace.validate(candidate),/duplicate/);
});
test('reports imported names that already exist',()=>{
 const incoming={curves:[{name:'Circle'},{name:'New'}]};
 assert.deepEqual(Workspace.clashes(state,incoming),['Circle']);
});

test('merge renames clashes and remaps references even when IDs overlap',()=>{
 const current=structuredClone(state);
 const incoming=structuredClone(state);
 incoming.curves[1].name='Circle_2';incoming.draft={...incoming.curves[1],name:'Edited'};
 const result=Workspace.merge(current,incoming,'rename','imported',()=> 'new-id-'+Math.random(),true);
 assert.deepEqual(result.curves.map(c=>c.name),['Circle','Scaled','Circle_3','Circle_2']);
 assert.equal(result.curves[3].source1,result.curves[2].id);
 assert.equal(result.draft.name,'Edited');assert.equal(result.draft.source1,result.curves[2].id);
 assert.equal(result.editing,result.curves[3].id);
});
test('clobber preserves existing IDs and dependencies and keeps the chosen draft',()=>{
 const current=structuredClone(state), incoming=structuredClone(state);
 incoming.curves[0].id='incoming-id';incoming.curves[0].formulas.x.code='50';incoming.curves[1].source1='incoming-id';
 current.draft.name='Current unfinished draft';
 const result=Workspace.merge(current,incoming,'clobber','current',()=> 'new-id-'+Math.random(),true);
 assert.equal(result.curves[0].id,'c1');assert.equal(result.curves[0].formulas.x.code,'50');
 assert.equal(result.curves[1].source1,'c1');assert.equal(result.draft.name,'Current unfinished draft');
});
test('clobber refreshes a clean selected draft from its replacement',()=>{
 const incoming=structuredClone(state);incoming.curves[1].factor='3';
 const result=Workspace.merge(state,incoming,'clobber','current',()=> 'new-id',false);
 assert.equal(result.draft.factor,'3');assert.equal(result.editing,'c2');
});
test('merge keeps a new current draft distinct from imported curve IDs',()=>{
 const current={curves:[],draft:{...source,id:'c1',name:'New draft'},editing:null,dialog:null};
 const incoming=structuredClone(state);
 const result=Workspace.merge(current,incoming,'rename','current',()=> 'fresh-id',true);
 assert.equal(result.draft.id,'c1');assert.equal(result.curves[0].id,'fresh-id');
 assert.equal(result.curves[1].source1,'fresh-id');
});
test('multi-curve concatenations validate and merge all source references',()=>{
 const incoming=structuredClone(state);
 incoming.curves.push({id:'c3',name:'Multi',type:'concat',mode:'cartesian',formulas:{},concatCount:'3',concatSources:['c1','c2','c1'],concatFractions:['.2','.3']});
 assert.deepEqual(Workspace.references(incoming.curves[2]),['c1','c2','c1']);
 Workspace.validate({format:'curves-workspace',version:1,workspace:incoming});
 let id=0;const merged=Workspace.merge(state,incoming,'rename','current',()=>`new${++id}`,false);
 const multi=merged.curves.find(c=>c.name==='Multi');
 assert.deepEqual(multi.concatSources,[merged.curves[2].id,merged.curves[3].id,merged.curves[2].id]);
 const malformed=structuredClone(incoming);malformed.curves[2].concatSources[2]='missing';
 assert.throws(()=>Workspace.validate({format:'curves-workspace',version:1,workspace:malformed}),/missing source/);
});

test('reverse is a single-source dependency that can be imported and remapped',()=>{
 const incoming=structuredClone(state);
 incoming.curves.push({id:'c3',name:'Backwards',type:'reverse',mode:'cartesian',formulas:{},source1:'c1'});
 assert.deepEqual(Workspace.references(incoming.curves[2]),['c1']);
 Workspace.validate({format:'curves-workspace',version:1,workspace:incoming});
 let id=0;const merged=Workspace.merge(state,incoming,'rename','current',()=>`new${++id}`,false);
 assert.equal(merged.curves.find(c=>c.name==='Backwards').source1,merged.curves[2].id);
});
test('shift and morph are tracked as source dependencies across workspace merges',()=>{
 const incoming=structuredClone(state);
 incoming.curves.push({id:'shift',name:'Shifted',type:'shift',mode:'cartesian',formulas:{},source1:'c1',shiftStart:'0.25'});
 incoming.curves.push({id:'morph',name:'Morph',type:'morph',mode:'cartesian',formulas:{},source1:'shift',source2:'c2',morphFactor:'0.5'});
 assert.deepEqual(Workspace.references(incoming.curves[3]),['shift','c2']);
 Workspace.validate({format:'curves-workspace',version:1,workspace:incoming});
 let id=0;const result=Workspace.merge(state,incoming,'rename','current',()=>`new${++id}`,false);
 const shifted=result.curves.find(c=>c.name==='Shifted'), morph=result.curves.find(c=>c.name==='Morph');
 assert.equal(shifted.source1,result.curves[2].id);assert.equal(morph.source1,shifted.id);assert.equal(morph.source2,result.curves[3].id);
});
test('morph second-curve shift survives workspace import and merge',()=>{
 const incoming=structuredClone(state);
 incoming.curves.push({id:'morph',name:'Morph',type:'morph',mode:'cartesian',formulas:{},source1:'c1',source2:'c2',morphFactor:'0.5',morphShift:'1/4'});
 const file={format:'curves-workspace',version:1,workspace:incoming};
 assert.equal(Workspace.validate(JSON.parse(JSON.stringify(file))).curves[2].morphShift,'1/4');
 let id=0;const result=Workspace.merge(state,incoming,'rename','current',()=>`new${++id}`,false);
 assert.equal(result.curves.find(c=>c.name==='Morph').morphShift,'1/4');
});
