/* Curve geometry. Each piece retains its own parameter interval so jumps are never joined. */
const Curves = (() => {
  const MATH_NAMES = ['PI','E','SQRT2','abs','acos','acosh','asin','asinh','atan','atan2','atanh','cbrt','ceil','cos','cosh','exp','floor','hypot','log','log10','log2','max','min','pow','round','sign','sin','sinh','sqrt','tan','tanh','trunc'];
  const MATH_VALUES = MATH_NAMES.map(n => Math[n]);
  const MATH_SET = new Set(MATH_NAMES);
  function constant(source) {
    const parsed = JsFormula.compile(String(source));
    if (parsed.names.length) throw new Error('Use a constant expression for transformation values.');
    const value = Function(...MATH_NAMES, '"use strict"; return (' + source + ')')(...MATH_VALUES);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Enter a finite number.');
    return value;
  }
  function coordinate(formula) {
    if (!formula || !formula.code || !formula.state) throw new Error('Complete both coordinate formulas.');
    const variables = formula.state.variables;
    const names = variables.map(v => v.name);
    const values = variables.map(v => {
      if (v.name === 't') return 0;
      const value = v.text.trim() === 'true' ? true : v.text.trim() === 'false' ? false : v.text.trim() === '' ? NaN : Number(v.text);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Check the formula’s variable values.');
      return value;
    });
    const extraNames = MATH_NAMES.filter(n => !names.includes(n));
    const extraValues = extraNames.map(n => Math[n]);
    const fn = Function(...extraNames, ...names, '"use strict"; return (' + formula.code + ')');
    const result=t => fn(...extraValues, ...values.map((v, i) => names[i] === 't' ? t : v));
    result.expression=t=>formula.code.replace(/[A-Za-z_$][A-Za-z0-9_$]*/g,(name,offset,source)=>{
      if (offset > 0 && source[offset-1] === '.') return name;
      const i = names.indexOf(name);
      if (i >= 0) return '(' + (name === 't' ? t : String(values[i])) + ')';
      if (MATH_SET.has(name)) return 'Math.' + name;
      return name;
    });
    return result;
  }
  const mapPieces = (pieces, scale, offset) => pieces.map(p => ({a: offset + scale*p.a, b: offset + scale*p.b, point: t => p.point((t-offset)/scale), expression:t=>p.expression(`((${t})-(${offset}))/(${scale})`)}));
  const transform = (pieces, angle, dx, dy) => { const c=Math.cos(angle), s=Math.sin(angle); return pieces.map(p => ({...p, point(t) { const [x,y]=p.point(t); return [c*x-s*y+dx,s*x+c*y+dy]; },expression(t){const [x,y]=p.expression(t);return [`(${c})*(${x})-(${s})*(${y})+(${dx})`,`(${s})*(${x})+(${c})*(${y})+(${dy})`];}})); };
  function intersect(pieces, a, b) { return pieces.flatMap(p => { const lo=Math.max(a,p.a), hi=Math.min(b,p.b); return hi > lo ? [{...p,a:lo,b:hi}] : []; }); }
  function shift(pieces, start) {
    if(start<0 || start>1)throw new Error('Starting point S must be between 0 and 1.');
    if(start===0)return pieces;
    if(start===1){const last=pieces[pieces.length-1];return [{a:0,b:0,point:()=>last.point(1),expression:()=>last.expression('1')},...pieces];}
    return [...mapPieces(intersect(pieces,start,1),1,-start),...mapPieces(intersect(pieces,0,start),1,1-start)];
  }
  function covering(pieces, a, b) {
    const midpoint = a + (b - a) / 2;
    const exact = pieces.find(p => p.a <= midpoint && midpoint < p.b);
    if (exact) return exact;
    if (!pieces.length) throw new Error('A source curve has no segments.');
    return pieces.reduce((best, p) => {
      const gap = q => midpoint < q.a ? q.a - midpoint : midpoint > q.b ? midpoint - q.b : 0;
      return gap(p) <= gap(best) ? p : best;
    });
  }
  function successive(first,second,start,distance,epsilon){
    const normalize=value=>value-Math.floor(value);
    const points=new Set([0,1,normalize(start),normalize(start+distance)]);
    for(const piece of [...first,...second]){if(piece.a>0&&piece.a<1)points.add(piece.a);if(piece.b>0&&piece.b<1)points.add(piece.b);}
    if(epsilon>0 && distance>0){
      if(2*epsilon<=distance){points.add(normalize(start+epsilon));points.add(normalize(start+distance-epsilon));}
      else points.add(normalize(start+distance/2));
    }
    const cuts=[...points].sort((a,b)=>a-b),result=[];
    for(let i=0;i<cuts.length-1;i++){
      const a=cuts[i],b=cuts[i+1],center=a+(b-a)/2,mid=center===b?a:center,base=normalize(start),turn=mid<base?1:0,u=mid+turn-base;
      const left=covering(first,a,b),right=covering(second,a,b);
      if(u>=distance){result.push({...left,a,b});continue;}
      if(epsilon===0 || (u>=epsilon && distance-u>=epsilon)){result.push({...right,a,b});continue;}
      let weight,weightExpression;
      if(u<=distance/2){weight=t=>(t+turn-base)/epsilon;weightExpression=t=>`((${t})+(${turn})-(${base}))/(${epsilon})`;}
      else {weight=t=>(distance-(t+turn-base))/epsilon;weightExpression=t=>`((${distance})-((${t})+(${turn})-(${base})))/(${epsilon})`;}
      result.push({a,b,point(t){const f=weight(t),[x1,y1]=left.point(t),[x2,y2]=right.point(t);return [(1-f)*x1+f*x2,(1-f)*y1+f*y2];},expression(t){const f=weightExpression(t),[x1,y1]=left.expression(t),[x2,y2]=right.expression(t);return [`(1-(${f}))*(${x1})+(${f})*(${x2})`,`(1-(${f}))*(${y1})+(${f})*(${y2})`];}});
    }
    return result;
  }
  function isClosed(pieces) {
    if (!pieces.length) return false;
    const start = pieces[0].point(pieces[0].a), end = pieces[pieces.length - 1].point(pieces[pieces.length - 1].b);
    return start.every(Number.isFinite) && end.every(Number.isFinite) && Math.hypot(start[0] - end[0], start[1] - end[1]) < 1e-4;
  }
  function needsSweepClosure(first, second) {
    if (!isClosed(first) || !isClosed(second)) return false;
    const a = first[0].point(first[0].a), b = second[0].point(second[0].a);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) >= 1e-4;
  }
  const SWEEP_BODY_END = 0.999;
  function sweep(first,second,p,epsilon,swapped=false){
    const [from,to]=swapped?[second,first]:[first,second];
    if(p===0)return from;
    if(p===1)return to;
    const start=p*(1+epsilon)-epsilon,end=p*(1+epsilon);
    const points=new Set([0,1]);
    if(start>0&&start<1)points.add(start);
    if(end>0&&end<1)points.add(end);
    for(const piece of [...from,...to]){if(piece.a>0&&piece.a<1)points.add(piece.a);if(piece.b>0&&piece.b<1)points.add(piece.b);}
    const cuts=[...points].sort((a,b)=>a-b),body=[];
    for(let i=0;i<cuts.length-1;i++){
      const a=cuts[i],b=cuts[i+1],mid=a+(b-a)/2;
      const left=covering(from,a,b),right=covering(to,a,b);
      if(epsilon===0){body.push(mid<p?{...right,a,b}:{...left,a,b});continue;}
      if(mid<=start){body.push({...right,a,b});continue;}
      if(mid>=end){body.push({...left,a,b});continue;}
      const weight=t=>(end-t)/epsilon,weightExpression=t=>`((${end})-(${t}))/(${epsilon})`;
      body.push({a,b,point(t){const f=weight(t),[x1,y1]=left.point(t),[x2,y2]=right.point(t);return [(1-f)*x1+f*x2,(1-f)*y1+f*y2];},expression(t){const f=weightExpression(t),[x1,y1]=left.expression(t),[x2,y2]=right.expression(t);return [`(1-(${f}))*(${x1})+(${f})*(${x2})`,`(1-(${f}))*(${y1})+(${f})*(${y2})`];}});
    }
    if(!needsSweepClosure(from,to))return body;
    const endPoint=body[body.length-1].point(1),startPoint=body[0].point(0);
    const endExpr=body[body.length-1].expression('1'),startExpr=body[0].expression('0');
    const result=mapPieces(body,SWEEP_BODY_END,0);
    result.push({
      a:SWEEP_BODY_END,b:1,
      point(t){const u=(t-SWEEP_BODY_END)/(1-SWEEP_BODY_END);return [endPoint[0]+u*(startPoint[0]-endPoint[0]),endPoint[1]+u*(startPoint[1]-endPoint[1])];},
      expression(t){const u=`((${t})-(${SWEEP_BODY_END}))/(${1-SWEEP_BODY_END})`;return [0,1].map(i=>`(${endExpr[i]})+(${u})*((${startExpr[i]})-(${endExpr[i]}))`);}
    });
    return result;
  }
  function build(curve, lookup, seen = new Set()) {
    if (!curve) throw new Error('Choose a source curve.');
    if (seen.has(curve.id)) throw new Error('A curve cannot depend on itself.');
    const next = new Set(seen); next.add(curve.id);
    const source = key => {const pieces=build(lookup(curve[key]), lookup, next);return curve.rotationAngle!==undefined && ['morph','successiveMorph','sweepMorph'].includes(curve.type)?transform(pieces,curve.rotationAngle,0,0):pieces;};
    if (curve.type === 'equation') {
      const x=coordinate(curve.formulas[curve.mode === 'polar' ? 'r' : 'x']);
      const y=coordinate(curve.formulas[curve.mode === 'polar' ? 'theta' : 'y']);
      return [{a:0,b:1,point:curve.mode === 'polar' ? t => {const r=x(t), angle=y(t); return [r*Math.cos(angle),r*Math.sin(angle)];} : t => [x(t),y(t)],expression:curve.mode==='polar'?t=>{const r=x.expression(t),a=y.expression(t);return [`(${r})*Math.cos(${a})`,`(${r})*Math.sin(${a})`];}:t=>[x.expression(t),y.expression(t)]}];
    }
    if(curve.type==='analytic'){const pieces=CurveFormula.pieces(curve.expression,curve.morphOverride);return curve.rotationAngle!==undefined?transform(pieces,curve.rotationAngle,0,0):pieces;}
    if(curve.type==='successiveMorph' && typeof curve.expression==='string'){
      const parsed=CurveFormula.parse(curve.expression);
      if(!parsed.successive) throw new Error('Successive morph expression must include s1, s2, and e.');
      const params={s1:constant(curve.successiveStart),s2:constant(curve.successiveEnd),e:constant(curve.epsilon)};
      if(params.s1<0||params.s1>1||params.s2<0||params.s2>1||params.e<=0||params.e>1) throw new Error('Invalid successive morph parameters.');
      const pieces=CurveFormula.pieces(curve.expression,undefined,params);
      return curve.rotationAngle!==undefined?transform(pieces,curve.rotationAngle,0,0):pieces;
    }
    if(curve.type==='sweepMorph' && typeof curve.expression==='string'){
      const parsed=CurveFormula.parse(curve.expression);
      if(!parsed.sweep) throw new Error('Sweep morph expression must include p and e.');
      const params={p:constant(curve.sweepFactor ?? '0'),e:constant(curve.epsilon ?? '0.1'),sw:curve.sweepSwapped?1:0};
      if(params.p<0||params.p>1||params.e<0||params.e>1) throw new Error('Invalid sweep morph parameters.');
      const pieces=CurveFormula.pieces(curve.expression,undefined,params);
      return curve.rotationAngle!==undefined?transform(pieces,curve.rotationAngle,0,0):pieces;
    }
    if (curve.type === 'concat') {
      const count=curve.concatCount === undefined ? 2 : constant(curve.concatCount);
      if (!Number.isSafeInteger(count) || count<2) throw new Error('Number of curves N must be an integer of at least 2.');
      const sources=curve.concatSources ?? [curve.source1,curve.source2];
      const fractions=curve.concatFractions ?? ['0.5'];
      if (!Array.isArray(sources) || sources.length<count || !Array.isArray(fractions) || fractions.length<count-1) throw new Error('Choose every curve and enter each time fraction.');
      const durations=fractions.slice(0,count-1).map(fraction=>constant(fraction));
      if (durations.some(value=>value<0)) throw new Error('Time fractions must be nonnegative.');
      let total=0, correction=0;
      for(const value of durations){const adjusted=value-correction, nextTotal=total+adjusted;correction=(nextTotal-total)-adjusted;total=nextTotal;}
      if (total>1) throw new Error('Time fractions must total at most 1.');
      durations.push(1-total);
      const parts=sources.slice(0,count).map(id=>build(lookup(id),lookup,next));
      const result=[];let offset=0, offsetCorrection=0;
      for(let i=0;i<count;i++){
        if(durations[i]>0)result.push(...mapPieces(parts[i],durations[i],offset));
        const adjusted=durations[i]-offsetCorrection, nextOffset=offset+adjusted;offsetCorrection=(nextOffset-offset)-adjusted;offset=nextOffset;
      }
      return result;
    }
    if(curve.type==='successiveMorph'){
      if(typeof curve.expression==='string'){
        const parsed=CurveFormula.parse(curve.expression); if(!parsed.successive) throw new Error('Successive morph expression must include s1, s2, and e.');
        const params={s1:constant(curve.successiveStart),s2:constant(curve.successiveEnd),e:constant(curve.epsilon)};
        if(params.s1<0||params.s1>1||params.s2<0||params.s2>1||params.e<=0||params.e>1) throw new Error('Invalid successive morph parameters.');
        const pieces=CurveFormula.pieces(curve.expression,undefined,params); return curve.rotationAngle!==undefined?transform(pieces,curve.rotationAngle,0,0):pieces;
      }
      const first=source('source1');
      const second=source('source2'),s1=constant(curve.successiveStart),s2=constant(curve.successiveEnd),epsilon=constant(curve.epsilon);
      if(s1<0||s1>1||s2<0||s2>1)throw new Error('s1 and s2 must be between 0 and 1.');
      if(epsilon<=0||epsilon>1)throw new Error('Transition length ε must be greater than 0 and at most 1.');
      const start=s1===1?0:s1,end=s2===1?0:s2;
      const distance=curve.successiveDistance??(end>=start?end-start:1-start+end);
      if(typeof distance!=='number'||!Number.isFinite(distance)||distance<0||distance>1)throw new Error('Invalid successive morph interval.');
      return distance===0?first:successive(first,second,start,distance,epsilon);
    }
    if(curve.type==='sweepMorph'){
      const first=source('source1'),second=source('source2');
      const p=constant(curve.sweepFactor ?? '0'),epsilon=constant(curve.epsilon ?? '0.1');
      if(p<0||p>1)throw new Error('Morph parameter p must be between 0 and 1.');
      if(epsilon<0||epsilon>1)throw new Error('Morph width ε must be between 0 and 1.');
      return sweep(first,second,p,epsilon,Boolean(curve.sweepSwapped));
    }
    const first=source('source1');
    if (curve.type === 'morph') {
      const factor=constant(curve.morphFactor), second=shift(source('source2'),constant(curve.morphShift ?? '0'));
      if(factor<0 || factor>1)throw new Error('Morph factor must be between 0 and 1.');
      if (factor===0 && !curve.symbolicMorph) return first;
      if (factor===1 && !curve.symbolicMorph) return second;
      const result=[];let i=0,j=0;
      while(i<first.length && j<second.length){
        const left=first[i], right=second[j], a=Math.max(left.a,right.a), b=Math.min(left.b,right.b);
        if(b>a || (b===a && (left.a===left.b || right.a===right.b)))result.push({a,b,point(t){const [x1,y1]=left.point(t), [x2,y2]=right.point(t);return [(1-factor)*x1+factor*x2,(1-factor)*y1+factor*y2];},expression(t){const [x1,y1]=left.expression(t),[x2,y2]=right.expression(t),f=curve.symbolicMorph?'m':String(factor),inverse=curve.symbolicMorph?'1-m':String(1-factor);return [`(${inverse})*(${x1})+(${f})*(${x2})`,`(${inverse})*(${y1})+(${f})*(${y2})`];}});
        if(left.b<=right.b)i++;
        if(right.b<=left.b)j++;
      }
      return result;
    }
    if (curve.type === 'shift') return shift(first,constant(curve.shiftStart));
    if (curve.type === 'reverse') return first.slice().reverse().map(p => ({...p,a:1-p.b,b:1-p.a,point:t => p.point(1-t),expression:t=>p.expression(`1-(${t})`)}));
    if (curve.type === 'translate') return transform(first,0,constant(curve.dx),constant(curve.dy));
    if (curve.type === 'rotate') return transform(first,constant(curve.alpha),0,0);
    if (curve.type === 'scale') {
      const factor=constant(curve.factor);
      if (factor <= 0) throw new Error('Scaling factor F must be positive.');
      const axis=curve.scaleAxis??'both';if(!['x','y','both'].includes(axis))throw new Error('Choose a valid scaling axis.');
      const xFactor=axis==='y'?1:factor,yFactor=axis==='x'?1:factor;
      return first.map(p => ({...p, point(t) { const [x,y]=p.point(t); return [xFactor*x,yFactor*y]; },expression(t){const [x,y]=p.expression(t);return [`(${xFactor})*(${x})`,`(${yFactor})*(${y})`];}}));
    }
    if (curve.type === 'slice') {
      const a=constant(curve.from), b=constant(curve.to);
      if (!(a>=0 && b<=1 && a<b)) throw new Error('Slice bounds must satisfy 0 ≤ start < end ≤ 1.');
      return mapPieces(intersect(first,a,b),1/(b-a),-a/(b-a));
    }
    const n=constant(curve.n);
    if (!Number.isSafeInteger(n) || n<1) throw new Error('N must be a positive integer.');
    if (curve.type === 'iterate') {
      const angle=constant(curve.alpha), dx=constant(curve.dx), dy=constant(curve.dy);
      let current=first, result=[];
      for (let k=0;k<n;k++) { result.push(...mapPieces(current,1/n,k/n)); current=transform(current,angle,dx,dy); }
      return result;
    }
    if (curve.type === 'splice') {
      if (n%2) throw new Error('N must be even for splicing.');
      const epsilon=constant(curve.epsilon ?? '0');
      if (epsilon < 0 || epsilon > 1/n) throw new Error('Epsilon must satisfy 0 ≤ ε ≤ 1/N.');
      const dropStart=constant(curve.dropStart ?? '0'), dropEnd=constant(curve.dropEnd ?? '0');
      if (dropStart < 0 || dropEnd < 0 || dropStart+dropEnd > 1/n) throw new Error('Drops must be nonnegative and total at most 1/N.');
      const second=source('source2'), result=[];
      const duration=Math.max(0,(1-n*epsilon)/n);
      const retained=1/n-(dropStart+dropEnd);
      const segments=Array.from({length:n}, (_,k) => {
        const sourcePieces=k%2 ? second : first, start=k/n+dropStart;
        if (retained>0) return intersect(sourcePieces,start,(k+1)/n-dropEnd);
        const piece=sourcePieces.find(p=>p.a<=start && (start<p.b || (start===1 && p.b===1)));
        return [{a:start,b:start,point:()=>piece.point(start),expression:()=>piece.expression(String(start))}];
      });
      for (let k=0;k<n;k++) {
        const pieces=segments[k], following=segments[(k+1)%n];
        const start=k*(duration+epsilon);
        if (duration > 0 && retained > 0) { const scale=duration/retained; result.push(...mapPieces(pieces,scale,start-scale*(k/n+dropStart))); }
        else if (duration > 0) { const point=pieces[0].point(pieces[0].a),expr=pieces[0].expression(String(pieces[0].a)); result.push({a:start,b:start+duration,point:()=>point,expression:()=>expr}); }
        if (epsilon > 0) {
          const endPiece=pieces[pieces.length-1], nextPiece=following[0];
          const end=endPiece.point((k+1)/n-dropEnd), next=nextPiece.point(((k+1)%n)/n+dropStart);
          const a=start+duration, b=k===n-1 ? 1 : a+epsilon;
          result.push({a,b,point(t) {const u=(t-a)/(b-a);return [end[0]+u*(next[0]-end[0]),end[1]+u*(next[1]-end[1])];},expression(t){const u=`((${t})-(${a}))/(${b-a})`;return [0,1].map(i=>`(${end[i]})+(${u})*((${next[i]})-(${end[i]}))`);}});
        }
      }
      return result;
    }
    throw new Error('Unknown curve type.');
  }
  return { build, constant, shift };
})();
if (typeof module !== 'undefined') module.exports = Curves;
