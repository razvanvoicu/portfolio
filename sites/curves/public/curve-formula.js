'use strict';
const CurveFormula=(()=>{
 const number='(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
 const condition=new RegExp('^\\s*t\\s*(<|===)\\s*('+number+')\\s*\\?');
 let cachedSource=null,cachedFactor=null,cachedParameters=null,cachedPieces=null;
 let parsedSource=null,parsedResult=null;
 function roundSig(value){const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)<1e-12)return 0;const r=Number(n.toPrecision(3));return Object.is(r,-0)?0:r;}
 function splitArray(source,start){
  if(source[start]!=='[')throw new Error('Expected [x, y].');
  let depth=0,commas=[];
  for(let i=start+1;i<source.length;i++){
   const c=source[i];if(c==='(')depth++;else if(c===')')depth--;
   else if(c===',' && depth===0){commas.push(i);if(commas.length>4)throw new Error('Too many curve parameters.');}
   else if(c===']' && depth===0){if(!commas.length)throw new Error('Expected [x, y].');return {x:source.slice(start+1,commas[0]).trim(),y:source.slice(commas[0]+1,commas[1]??i).trim(),extra:commas.slice(1).map((pos,index)=>source.slice(pos+1,commas[index+2]??i).trim()),end:i+1};}
   if(depth<0 || c==='[')throw new Error('Invalid coordinate expression.');
  }
  throw new Error('The coordinate array is incomplete.');
 }
 function parse(source){
  if(typeof source!=='string' || !source.trim())throw new Error('Enter a curve expression.');
  if(source===parsedSource)return parsedResult;
  let rest=source.trim().replace(/;\s*$/,''),start=0,result=[],usesX=false,usesY=false,factor=null,parameters=null,sweep=null;
  while(true){
   const match=condition.exec(rest);let end=1,zero=false;
   if(match){end=Number(match[2]);zero=match[1]==='===';rest=rest.slice(match[0].length).trimStart();
    if(!Number.isFinite(end)||end<start||end>1||(zero && end!==start)||(!zero && end<=start))throw new Error('Invalid segment boundary.');}
   const entry=splitArray(rest,0);rest=rest.slice(entry.end).trimStart();
   const formulas=[entry.x,entry.y],parsed=formulas.map(s=>JsFormula.compile(s));
   for(const p of parsed)if(p.names.some(name=>!['t','m','s1','s2','e','p','sw'].includes(name))||p.type==='bool')throw new Error('Coordinates must be numeric expressions using t and the morph parameters.');
   usesX ||= parsed[0].names.includes('m');usesY ||= parsed[1].names.includes('m');
   const values={};for(const extra of entry.extra){const assignment=/^(m|s1|s2|e|p|sw)\s*=\s*(.+)$/.exec(extra);if(!assignment || assignment[1] in values)throw new Error('Invalid or repeated morph parameter.');const p=JsFormula.compile(assignment[2]);if(p.names.length||p.type==='bool')throw new Error('Morph parameters must be constant.');const value=Function('"use strict";return ('+assignment[2]+');')();if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Morph parameters must be finite.');values[assignment[1]]=value;}
   if('m' in values){if(values.m<0||values.m>1)throw new Error('The morph factor must be between 0 and 1.');if(factor!==null && factor!==values.m)throw new Error('All segments must use the same morph factor.');factor=values.m;}
   const usesSweep=parsed.some(item=>item.names.some(name=>['p','sw'].includes(name)))||['p','sw'].some(name=>name in values);
   const usesSuccessive=parsed.some(item=>item.names.some(name=>['s1','s2'].includes(name)))||['s1','s2'].some(name=>name in values)||(!usesSweep && (parsed.some(item=>item.names.includes('e'))||'e' in values));
   if(usesSuccessive && usesSweep)throw new Error('Cannot mix successive morph and sweep morph parameters.');
   if(usesSuccessive){if(!['s1','s2','e'].every(name=>name in values)||'m' in values||usesX||usesY)throw new Error('Provide s1, s2, and e for a successive morph.');if(values.s1<0||values.s1>1||values.s2<0||values.s2>1||values.e<=0||values.e>1)throw new Error('s1 and s2 must be between 0 and 1, and e must be greater than 0 and at most 1.');const next={s1:values.s1,s2:values.s2,e:values.e};if(parameters && JSON.stringify(parameters)!==JSON.stringify(next))throw new Error('All segments must use the same morph parameters.');parameters=next;}
   if(usesSweep){if(!['p','e'].every(name=>name in values)||'m' in values||usesX||usesY)throw new Error('Provide p and e for a sweep morph.');const sw=values.sw??0;if(values.p<0||values.p>1||values.e<0||values.e>1||(sw!==0 && sw!==1))throw new Error('p and e must be between 0 and 1, and sw must be 0 or 1.');const next={p:values.p,e:values.e,sw};if(sweep && JSON.stringify(sweep)!==JSON.stringify(next))throw new Error('All segments must use the same morph parameters.');sweep=next;}
   const fn=Function('t','m','s1','s2','e','p','sw','"use strict"; return ['+formulas.join(',')+'];');
   result.push({a:start,b:end,formulas,fn});if(!match){if(rest)throw new Error('Unexpected text after the curve expression.');break;}
   if(!rest.startsWith(':'))throw new Error('Expected : between curve segments.');rest=rest.slice(1).trimStart();if(!zero)start=end;
  }
  parsedSource=source;parsedResult={segments:result,hasMorph:usesX||usesY,factor:factor??0.5,successive:parameters,sweep};return parsedResult;
 }
 function pieces(source,overrideFactor,overrideParameters){
  const parameterKey=JSON.stringify(overrideParameters??null);
  if(source===cachedSource && overrideFactor===cachedFactor && parameterKey===cachedParameters)return cachedPieces;
  const parsed=parse(source),factor=overrideFactor??parsed.factor,parameters=overrideParameters??parsed.successive??parsed.sweep;
  const result=parsed.segments.map(({a,b,formulas,fn})=>({a,b,point:t=>fn(t,factor,parameters?.s1,parameters?.s2,parameters?.e,parameters?.p,parameters?.sw??0),expression:(t,symbolic=false)=>formulas.map(s=>s.replace(/\b(t|m|s1|s2|e|p|sw)\b/g,(_,name)=>`(${name==='t'?t:name==='m'?(symbolic?'m':factor):name==='sw'?(parameters?.sw??0):parameters?.[name]})`))}));
  cachedSource=source;cachedFactor=overrideFactor;cachedParameters=parameterKey;cachedPieces=result;return result;
 }
 function exportPieces(parts,morphFactor){
  if(!parts.length)throw new Error('The curve has no segments.');
  return parts.map((part,i)=>{const [x,y]=part.expression('t',morphFactor!==undefined),pair=`[${x}, ${y}${morphFactor!==undefined?`, m=${roundSig(morphFactor)}`:''}]`;if(i===parts.length-1)return pair;return `t ${part.a===part.b?'===':'<'} ${part.b} ? ${pair} :\n`;}).join('');
 }
 function coordinate(parts,index){
  if(!parts.length)throw new Error('A source curve has no segments.');
  return parts.map((part,i)=>{const value=`(${part.expression('t')[index]})`;if(i===parts.length-1)return value;return `(t ${part.a===part.b?'===':'<'} ${part.b} ? ${value} : `;}).join('')+')'.repeat(parts.length-1);
 }
 function covering(pieces,a,b){const midpoint=a+(b-a)/2,exact=pieces.find(p=>p.a<=midpoint&&midpoint<p.b);if(exact)return exact;if(!pieces.length)throw new Error('A source curve has no segments.');return pieces.reduce((best,p)=>{const gap=q=>midpoint<q.a?q.a-midpoint:midpoint>q.b?midpoint-q.b:0;return gap(p)<=gap(best)?p:best;});}
 function successiveCoordinates(first,second){
  const start='(s1-Math.floor(s1))',end='(s2-Math.floor(s2))';
  const distance=`((${end}-${start}+1)%1)`,offset=`((t-${start}+1)%1)`;
  const weight=`(${distance}===0 || ${offset}>=${distance} ? 0 : Math.min(1,Math.min(${offset}/e,(${distance}-${offset})/e)))`;
  return [0,1].map(i=>`((1-${weight})*${coordinate(first,i)}+${weight}*${coordinate(second,i)})`);
 }
 function successiveExpression(first,second,parameters){
  const boundaries=new Set([0,1]);for(const p of [...first,...second]){if(p.a>0&&p.a<1)boundaries.add(p.a);if(p.b>0&&p.b<1)boundaries.add(p.b);}
  const cuts=[...boundaries].sort((a,b)=>a-b),segments=[];
  for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1],[x,y]=successiveCoordinates([covering(first,a,b)],[covering(second,a,b)]);segments.push({a,b,pair:`[${x}, ${y}, s1=${roundSig(parameters.s1)}, s2=${roundSig(parameters.s2)}, e=${roundSig(parameters.e)}]`});}
  return segments.map((part,i)=>i===segments.length-1?part.pair:`t < ${part.b} ? ${part.pair} :\n`).join('');
 }
 const SWEEP_BODY_END=0.999;
 function piecePoint(piece,t){if(typeof piece.point==='function')return piece.point(t);const [x,y]=piece.expression(String(t));return Function('"use strict"; return ['+x+','+y+'];')();}
 function isClosed(parts){if(!parts.length)return false;try{const a=piecePoint(parts[0],parts[0].a),b=piecePoint(parts[parts.length-1],parts[parts.length-1].b);return a.every(Number.isFinite)&&b.every(Number.isFinite)&&Math.hypot(a[0]-b[0],a[1]-b[1])<1e-4;}catch{return false;}}
 function needsSweepClosure(first,second){if(!isClosed(first)||!isClosed(second))return false;const a=piecePoint(first[0],first[0].a),b=piecePoint(second[0],second[0].a);return Math.hypot(a[0]-b[0],a[1]-b[1])>=1e-4;}
 function sweepWeightExpr(time){
  const base=`(e===0 ? (p===1 ? 1 : (${time}<p ? 1 : 0)) : Math.max(0,Math.min(1,(p*(1+e)-${time})/e)))`;
  return `(sw ? 1-(${base}) : (${base}))`;
 }
 function sweepCoordinates(first,second,time='t'){
  const weight=sweepWeightExpr(time);
  const coord=(parts,index)=>parts.length===1?`(${parts[0].expression(time)[index]})`:coordinate(parts,index).replace(/\bt\b/g,time);
  return [0,1].map(i=>`((1-${weight})*${coord(first,i)}+${weight}*${coord(second,i)})`);
 }
 function sweepExpression(first,second,parameters){
  const boundaries=new Set([0,1]);for(const p of [...first,...second]){if(p.a>0&&p.a<1)boundaries.add(p.a);if(p.b>0&&p.b<1)boundaries.add(p.b);}
  const cuts=[...boundaries].sort((a,b)=>a-b),segments=[];
  const sw=parameters.sw?1:0, closed=needsSweepClosure(first,second);
  const suffix=`p=${roundSig(parameters.p)}, e=${roundSig(parameters.e)}, sw=${sw}`;
  const time=closed?`(t/${SWEEP_BODY_END})`:'t';
  for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1],[x,y]=sweepCoordinates([covering(first,a,b)],[covering(second,a,b)],time);segments.push({a:closed?a*SWEEP_BODY_END:a,b:closed?b*SWEEP_BODY_END:b,pair:`[${x}, ${y}, ${suffix}]`});}
  if(closed){
   const w0=sweepWeightExpr('0'), w1=sweepWeightExpr('1');
   const c1End=first[first.length-1].expression('1'),c2End=second[second.length-1].expression('1');
   const c1Start=first[0].expression('0'),c2Start=second[0].expression('0');
   const u=`((t-${SWEEP_BODY_END})/(${1-SWEEP_BODY_END}))`;
   const [x,y]=[0,1].map(i=>{const m1=`((1-${w1})*(${c1End[i]})+${w1}*(${c2End[i]}))`,m0=`((1-${w0})*(${c1Start[i]})+${w0}*(${c2Start[i]}))`;return `((${m1})+(${u})*((${m0})-(${m1})))`;});
   segments.push({a:SWEEP_BODY_END,b:1,pair:`[${x}, ${y}, ${suffix}]`});
  }
  return segments.map((part,i)=>i===segments.length-1?part.pair:`t < ${part.b} ? ${part.pair} :\n`).join('');
 }
 return {parse,pieces,exportPieces,successiveCoordinates,successiveExpression,sweepCoordinates,sweepExpression};
})();
if(typeof module!=='undefined')module.exports=CurveFormula;
