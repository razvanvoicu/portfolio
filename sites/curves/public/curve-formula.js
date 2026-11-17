'use strict';
const CurveFormula=(()=>{
 const number='(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
 const condition=new RegExp('^\\s*t\\s*(<|===)\\s*('+number+')\\s*\\?');
 let cachedSource=null,cachedFactor=null,cachedPieces=null;
 let parsedSource=null,parsedResult=null;
 function splitArray(source,start){
  if(source[start]!=='[')throw new Error('Expected [x, y].');
  let depth=0,commas=[];
  for(let i=start+1;i<source.length;i++){
   const c=source[i];if(c==='(')depth++;else if(c===')')depth--;
   else if(c===',' && depth===0){commas.push(i);if(commas.length>2)throw new Error('Expected [x, y] or [x, y, m=value].');}
   else if(c===']' && depth===0){if(!commas.length)throw new Error('Expected [x, y].');return {x:source.slice(start+1,commas[0]).trim(),y:source.slice(commas[0]+1,commas[1]??i).trim(),m:commas.length===2?source.slice(commas[1]+1,i).trim():null,end:i+1};}
   if(depth<0 || c==='[')throw new Error('Invalid coordinate expression.');
  }
  throw new Error('The coordinate array is incomplete.');
 }
 function parse(source){
  if(typeof source!=='string' || !source.trim())throw new Error('Enter a curve expression.');
  if(source===parsedSource)return parsedResult;
  let rest=source.trim().replace(/;\s*$/,''),start=0,result=[],usesX=false,usesY=false,factor=null;
  while(true){
   const match=condition.exec(rest);let end=1,zero=false;
   if(match){end=Number(match[2]);zero=match[1]==='===';rest=rest.slice(match[0].length).trimStart();
    if(!Number.isFinite(end)||end<start||end>1||(zero && end!==start)||(!zero && end<=start))throw new Error('Invalid segment boundary.');}
   const entry=splitArray(rest,0);rest=rest.slice(entry.end).trimStart();
   const formulas=[entry.x,entry.y],parsed=formulas.map(s=>JsFormula.compile(s));
   for(const p of parsed)if(p.names.some(name=>name!=='t' && name!=='m')||p.type==='bool')throw new Error('Coordinates must be numeric expressions using only t and m.');
   usesX ||= parsed[0].names.includes('m');usesY ||= parsed[1].names.includes('m');
   if(entry.m!==null){const assignment=/^m\s*=\s*(.+)$/.exec(entry.m);if(!assignment)throw new Error('The third value must be m=value.');const p=JsFormula.compile(assignment[1]);if(p.names.length||p.type==='bool')throw new Error('The morph factor must be a constant.');const value=Function('"use strict";return ('+assignment[1]+');')();if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new Error('The morph factor must be between 0 and 1.');if(factor!==null && factor!==value)throw new Error('All segments must use the same morph factor.');factor=value;}
   const fn=Function('t','m','"use strict"; return ['+formulas.join(',')+'];');
   result.push({a:start,b:end,formulas,fn});if(!match){if(rest)throw new Error('Unexpected text after the curve expression.');break;}
   if(!rest.startsWith(':'))throw new Error('Expected : between curve segments.');rest=rest.slice(1).trimStart();if(!zero)start=end;
  }
  parsedSource=source;parsedResult={segments:result,hasMorph:usesX||usesY,factor:factor??0.5};return parsedResult;
 }
 function pieces(source,overrideFactor){
  if(source===cachedSource && overrideFactor===cachedFactor)return cachedPieces;
  const parsed=parse(source),factor=overrideFactor??parsed.factor;
  const result=parsed.segments.map(({a,b,formulas,fn})=>({a,b,point:t=>fn(t,factor),expression:(t,symbolic=false)=>formulas.map(s=>s.replace(/\b(t|m)\b/g,(_,name)=>`(${name==='t'?t:symbolic?'m':factor})`))}));
  cachedSource=source;cachedFactor=overrideFactor;cachedPieces=result;return result;
 }
 function exportPieces(parts,morphFactor){
  if(!parts.length)throw new Error('The curve has no segments.');
  return parts.map((part,i)=>{const [x,y]=part.expression('t',morphFactor!==undefined),pair=`[${x}, ${y}${morphFactor!==undefined?`, m=${morphFactor}`:''}]`;if(i===parts.length-1)return pair;return `t ${part.a===part.b?'===':'<'} ${part.b} ? ${pair} :\n`;}).join('');
 }
 return {parse,pieces,exportPieces};
})();
if(typeof module!=='undefined')module.exports=CurveFormula;
