'use strict';
const CurveWorkspace = (() => {
  const types=new Set(['equation','analytic','translate','rotate','scale','reverse','shift','morph','successiveMorph','sweepMorph','slice','concat','iterate','splice']);
  function references(curve) {
    if(curve.type==='equation'||curve.type==='analytic'||((curve.type==='successiveMorph'||curve.type==='sweepMorph')&&typeof curve.expression==='string'))return [];
    if(curve.type==='concat')return curve.concatCount===undefined ? [curve.source1,curve.source2] : (curve.concatSources||[]).slice(0,Number(curve.concatCount));
    return ['splice','morph','successiveMorph','sweepMorph'].includes(curve.type) ? [curve.source1,curve.source2] : [curve.source1];
  }
  function validate(file) {
    if (!file || file.format!=='curves-workspace' || file.version!==1 || !file.workspace || !Array.isArray(file.workspace.curves)) throw new Error('This is not a supported curves workspace file.');
    const state=file.workspace, ids=new Set(), names=new Set();
    if(state.canvas!==undefined){const c=state.canvas;if(!c || typeof c!=='object' || Array.isArray(c) || typeof c.grid!=='boolean' || !/^#[0-9a-f]{6}$/i.test(c.startColor) || !/^#[0-9a-f]{6}$/i.test(c.endColor) || !['radial','transversal'].includes(c.type) || typeof c.angle!=='number' || !Number.isFinite(c.angle))throw new Error('The file contains invalid canvas settings.');}
    if(state.drawing!==undefined){
      const drawing=state.drawing;
      if(!drawing || typeof drawing!=='object' || Array.isArray(drawing) || !/^#[0-9a-f]{6}$/i.test(drawing.startColor) || !/^#[0-9a-f]{6}$/i.test(drawing.endColor) || typeof drawing.thickness!=='string')throw new Error('The file contains invalid drawing settings.');
    }
    if(state.animations!==undefined){
      const animations=state.animations, shift=animations?.shift;
      if(!animations || typeof animations!=='object' || Array.isArray(animations) || !shift || typeof shift!=='object' || typeof shift.enabled!=='boolean' || typeof shift.duration!=='string' || !Number.isFinite(Number(shift.duration)) || Number(shift.duration)<0.5 || Number(shift.duration)>20 || typeof shift.phase!=='number' || !Number.isFinite(shift.phase) || shift.phase<0 || shift.phase>=2)throw new Error('The file contains invalid animation settings.');
      if(animations.morph!==undefined){const m=animations.morph;if(!m || typeof m!=='object' || Array.isArray(m) || typeof m.enabled!=='boolean' || typeof m.duration!=='string' || !Number.isFinite(Number(m.duration)) || Number(m.duration)<0.5 || Number(m.duration)>20 || typeof m.phase!=='number' || !Number.isFinite(m.phase) || m.phase<0 || m.phase>=1 || typeof m.min!=='number' || typeof m.max!=='number' || !Number.isFinite(m.min) || !Number.isFinite(m.max) || m.min<0 || m.max>1 || m.min>m.max)throw new Error('The file contains invalid animation settings.');}
      if(animations.successive!==undefined){const a=animations.successive,periods=['speed1','speed2','period'];if(!a || typeof a!=='object' || Array.isArray(a) || typeof a.enabled!=='boolean' || periods.some(k=>typeof a[k]!=='string'||!Number.isFinite(Number(a[k]))||Number(a[k])<.5||Number(a[k])>20) || ['position1','position2','relative','midpoint','amplitude','phase'].some(k=>typeof a[k]!=='number'||!Number.isFinite(a[k])) || a.position1<0 || a.position1>=1 || a.position2<0 || a.position2>=1 || a.relative<0 || a.relative>=2 || a.phase<0 || a.phase>=1 || a.midpoint<=0 || a.midpoint>1 || a.amplitude<0 || a.amplitude>Math.min(.95*a.midpoint,1-a.midpoint))throw new Error('The file contains invalid animation settings.');}
      if(animations.successive!==undefined){const a=animations.successive;if((a.swapped!==undefined && typeof a.swapped!=='boolean') || (a.trigger!==undefined && (typeof a.trigger!=='number'||!Number.isFinite(a.trigger)||a.trigger<.05||a.trigger>.49)))throw new Error('The file contains invalid animation settings.');}
      if(animations.sweep!==undefined){const sw=animations.sweep;if(!sw || typeof sw!=='object' || Array.isArray(sw) || typeof sw.enabled!=='boolean' || typeof sw.duration!=='string' || !Number.isFinite(Number(sw.duration)) || Number(sw.duration)<.5 || Number(sw.duration)>20 || typeof sw.phase!=='number' || !Number.isFinite(sw.phase) || sw.phase<0 || sw.phase>=1 || (sw.swapped!==undefined && typeof sw.swapped!=='boolean') || typeof sw.epsilon!=='number' || !Number.isFinite(sw.epsilon) || sw.epsilon<0 || sw.epsilon>1)throw new Error('The file contains invalid animation settings.');}
      if(animations.rotation!==undefined){const r=animations.rotation,validSpeed=typeof r?.speed==='number' && Number.isFinite(r.speed) && r.speed>=-1 && r.speed<=1,validLegacy=r?.speed===undefined && typeof r?.period==='number' && Number.isFinite(r.period) && r.period>=-20 && r.period<=20;if(!r || typeof r!=='object' || Array.isArray(r) || (!validSpeed && !validLegacy) || typeof r.phase!=='number' || !Number.isFinite(r.phase) || r.phase<0 || r.phase>=1)throw new Error('The file contains invalid animation settings.');}
    }
    function curve(item) {
      if (!item || typeof item.id!=='string' || !item.id || typeof item.name!=='string' || !types.has(item.type) || !item.formulas || typeof item.formulas!=='object' || Array.isArray(item.formulas)) throw new Error('The file contains an invalid curve.');
      if(item.type==='analytic'){if(typeof item.expression!=='string')throw new Error('The file contains an invalid curve expression.');if(item.expression)CurveFormula.pieces(item.expression);}
      if(item.type==='successiveMorph'&&typeof item.expression==='string'){const parsed=CurveFormula.parse(item.expression);if(!parsed.successive)throw new Error('The successive morph expression must include s1, s2, and e.');}
      if(item.type==='sweepMorph'&&typeof item.expression==='string'){const parsed=CurveFormula.parse(item.expression);if(!parsed.sweep)throw new Error('The sweep morph expression must include p and e.');}
      for (const formula of Object.values(item.formulas)) {
        if (!formula || typeof formula.code!=='string' || !formula.state || !Array.isArray(formula.state.variables)) throw new Error('The file contains an invalid formula.');
        if (formula.state.variables.some(v=>!v || typeof v.id!=='string' || typeof v.name!=='string' || typeof v.text!=='string')) throw new Error('The file contains invalid formula variables.');
        if (formula.code) {
          const parsed=JsFormula.compile(formula.code);
          if (parsed.names.some(name=>!formula.state.variables.some(v=>v.name===name))) throw new Error('A formula refers to an unknown variable.');
        }
      }
      for (const key of ['source1','source2','dx','dy','alpha','factor','from','to','n','epsilon','dropStart','dropEnd','concatCount','shiftStart','morphFactor','morphShift','successiveStart','successiveEnd','sweepFactor']) {
        if (item[key]!==undefined && typeof item[key]!=='string') throw new Error('The file contains an invalid curve setting.');
      }
      if (item.sweepSwapped!==undefined && typeof item.sweepSwapped!=='boolean') throw new Error('The file contains an invalid curve setting.');
      for (const key of ['concatSources','concatFractions']) if(item[key]!==undefined && (!Array.isArray(item[key]) || item[key].some(value=>typeof value!=='string'))) throw new Error('The file contains invalid concatenation settings.');
      if (item.mode!==undefined && !['cartesian','polar'].includes(item.mode)) throw new Error('The file contains an invalid coordinate mode.');
      if (item.scaleAxis!==undefined && !['x','y','both'].includes(item.scaleAxis)) throw new Error('The file contains an invalid scaling axis.');
    }
    for (const item of state.curves) {curve(item);if(ids.has(item.id))throw new Error('The file contains duplicate curve IDs.');if(!item.name.trim() || names.has(item.name))throw new Error('The file contains missing or duplicate curve names.');ids.add(item.id);names.add(item.name);}
    curve(state.draft);
    if (state.editing!==null && (typeof state.editing!=='string' || !ids.has(state.editing) || state.draft.id!==state.editing)) throw new Error('The file contains an invalid selected curve.');
    if (state.dialog!==null && !['x','y','r','theta'].includes(state.dialog)) throw new Error('The file contains an invalid editor selection.');
    for (const item of state.curves) {
      if(item.type==='concat' && item.concatCount!==undefined){
        const n=Number(item.concatCount);
        if(!Number.isSafeInteger(n)||n<2||!Array.isArray(item.concatSources)||item.concatSources.length<n||!Array.isArray(item.concatFractions)||item.concatFractions.length<n-1)throw new Error('A saved concatenation is incomplete.');
      }
      if(references(item).some(id=>!ids.has(id))) throw new Error('A saved curve refers to a missing source.');
    }
    const byId=new Map(state.curves.map(item=>[item.id,item])), visited=new Set(), active=new Set();
    function visit(id) {
      if(active.has(id))throw new Error('The file contains cyclic curve references.');
      if(visited.has(id))return;
      active.add(id);const item=byId.get(id);
      for(const sourceId of references(item))visit(sourceId);
      active.delete(id);visited.add(id);
    }
    for(const id of ids)visit(id);
    return state;
  }
  function clashes(current,incoming) { const existing=new Set(current.curves.map(curve=>curve.name));return incoming.curves.filter(curve=>existing.has(curve.name)).map(curve=>curve.name); }
  function merge(current,incoming,mode,draftChoice,newId,currentDraftChanged) {
    const result=structuredClone(current), existingByName=new Map(result.curves.map(curve=>[curve.name,curve]));
    const usedIds=new Set(result.curves.map(curve=>curve.id));
    if(result.editing===null)usedIds.add(result.draft.id);
    const usedNames=new Set([...result.curves,...incoming.curves].map(curve=>curve.name));
    const idMap=new Map(), nameMap=new Map();
    const uniqueId=()=>{let id;do{id=newId();}while(usedIds.has(id));usedIds.add(id);return id;};
    for(const curve of incoming.curves) {
      const collision=existingByName.get(curve.name);
      const id=collision && mode==='clobber' ? collision.id : usedIds.has(curve.id) ? uniqueId() : curve.id;
      usedIds.add(id);idMap.set(curve.id,id);
      let name=curve.name;
      if(collision && mode==='rename'){let suffix=2;while(usedNames.has(`${curve.name}_${suffix}`))suffix++;name=`${curve.name}_${suffix}`;}
      usedNames.add(name);nameMap.set(curve.id,name);
    }
    const mapReferences=curve=>{for(const key of ['source1','source2'])if(idMap.has(curve[key]))curve[key]=idMap.get(curve[key]);if(Array.isArray(curve.concatSources))curve.concatSources=curve.concatSources.map(id=>idMap.get(id)??id);};
    for(const curve of incoming.curves) {
      const copy=structuredClone(curve);copy.id=idMap.get(curve.id);copy.name=nameMap.get(curve.id);mapReferences(copy);
      const index=result.curves.findIndex(existing=>existing.id===copy.id);
      if(index<0)result.curves.push(copy);else result.curves[index]=copy;
    }
    if(draftChoice==='imported') {
      result.draft=structuredClone(incoming.draft);
      const originalId=result.draft.id, source=incoming.curves.find(curve=>curve.id===originalId);
      if(idMap.has(originalId)) {result.draft.id=idMap.get(originalId);if(source && result.draft.name===source.name)result.draft.name=nameMap.get(originalId);}
      else if(usedIds.has(originalId))result.draft.id=uniqueId();
      mapReferences(result.draft);
      result.editing=incoming.editing===null ? null : idMap.get(incoming.editing);
      result.dialog=incoming.dialog;
    } else if(result.editing && !currentDraftChanged) {
      const selected=result.curves.find(curve=>curve.id===result.editing);
      if(selected)result.draft=structuredClone(selected);
    }
    validate({format:'curves-workspace',version:1,workspace:result});
    return result;
  }
  return {validate,clashes,merge,references};
})();
if (typeof module !== 'undefined') module.exports=CurveWorkspace;
