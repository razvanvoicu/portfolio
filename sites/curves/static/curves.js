/* Curve geometry. Each piece retains its own parameter interval so jumps are never joined. */
const Curves = (() => {
  function constant(source) {
    const parsed = JsFormula.compile(String(source));
    if (parsed.names.length) throw new Error('Use a constant expression for transformation values.');
    const value = Function('"use strict"; return (' + source + ')')();
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
    const fn = Function(...names, '"use strict"; return (' + formula.code + ')');
    return t => fn(...values.map((v, i) => names[i] === 't' ? t : v));
  }
  const mapPieces = (pieces, scale, offset) => pieces.map(p => ({a: offset + scale*p.a, b: offset + scale*p.b, point: t => p.point((t-offset)/scale)}));
  const transform = (pieces, angle, dx, dy) => { const c=Math.cos(angle), s=Math.sin(angle); return pieces.map(p => ({...p, point(t) { const [x,y]=p.point(t); return [c*x-s*y+dx,s*x+c*y+dy]; }})); };
  function intersect(pieces, a, b) { return pieces.flatMap(p => { const lo=Math.max(a,p.a), hi=Math.min(b,p.b); return hi > lo ? [{...p,a:lo,b:hi}] : []; }); }
  function shift(pieces, start) {
    if(start<0 || start>1)throw new Error('Starting point S must be between 0 and 1.');
    if(start===0)return pieces;
    if(start===1){const last=pieces[pieces.length-1];return [{a:0,b:0,point:()=>last.point(1)},...pieces];}
    return [...mapPieces(intersect(pieces,start,1),1,-start),...mapPieces(intersect(pieces,0,start),1,1-start)];
  }
  function build(curve, lookup, seen = new Set()) {
    if (!curve) throw new Error('Choose a source curve.');
    if (seen.has(curve.id)) throw new Error('A curve cannot depend on itself.');
    const next = new Set(seen); next.add(curve.id);
    const source = key => build(lookup(curve[key]), lookup, next);
    if (curve.type === 'equation') {
      const x=coordinate(curve.formulas[curve.mode === 'polar' ? 'r' : 'x']);
      const y=coordinate(curve.formulas[curve.mode === 'polar' ? 'theta' : 'y']);
      return [{a:0,b:1,point:curve.mode === 'polar' ? t => {const r=x(t), angle=y(t); return [r*Math.cos(angle),r*Math.sin(angle)];} : t => [x(t),y(t)]}];
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
    const first=source('source1');
    if (curve.type === 'morph') {
      const factor=constant(curve.morphFactor), second=shift(source('source2'),constant(curve.morphShift ?? '0'));
      if(factor<0 || factor>1)throw new Error('Morph factor must be between 0 and 1.');
      if (factor===0) return first;
      if (factor===1) return second;
      const result=[];let i=0,j=0;
      while(i<first.length && j<second.length){
        const left=first[i], right=second[j], a=Math.max(left.a,right.a), b=Math.min(left.b,right.b);
        if(b>a || (b===a && (left.a===left.b || right.a===right.b)))result.push({a,b,point(t){const [x1,y1]=left.point(t), [x2,y2]=right.point(t);return [(1-factor)*x1+factor*x2,(1-factor)*y1+factor*y2];}});
        if(left.b<=right.b)i++;
        if(right.b<=left.b)j++;
      }
      return result;
    }
    if (curve.type === 'shift') return shift(first,constant(curve.shiftStart));
    if (curve.type === 'reverse') return first.slice().reverse().map(p => ({...p,a:1-p.b,b:1-p.a,point:t => p.point(1-t)}));
    if (curve.type === 'translate') return transform(first,0,constant(curve.dx),constant(curve.dy));
    if (curve.type === 'rotate') return transform(first,constant(curve.alpha),0,0);
    if (curve.type === 'scale') {
      const factor=constant(curve.factor);
      if (factor <= 0) throw new Error('Scaling factor F must be positive.');
      return first.map(p => ({...p, point(t) { const [x,y]=p.point(t); return [factor*x,factor*y]; }}));
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
        return [{a:start,b:start,point:()=>piece.point(start)}];
      });
      for (let k=0;k<n;k++) {
        const pieces=segments[k], following=segments[(k+1)%n];
        const start=k*(duration+epsilon);
        if (duration > 0 && retained > 0) { const scale=duration/retained; result.push(...mapPieces(pieces,scale,start-scale*(k/n+dropStart))); }
        else if (duration > 0) { const point=pieces[0].point(pieces[0].a); result.push({a:start,b:start+duration,point:()=>point}); }
        if (epsilon > 0) {
          const endPiece=pieces[pieces.length-1], nextPiece=following[0];
          const end=endPiece.point((k+1)/n-dropEnd), next=nextPiece.point(((k+1)%n)/n+dropStart);
          const a=start+duration, b=k===n-1 ? 1 : a+epsilon;
          result.push({a,b,point(t) {const u=(t-a)/(b-a);return [end[0]+u*(next[0]-end[0]),end[1]+u*(next[1]-end[1])];}});
        }
      }
      return result;
    }
    throw new Error('Unknown curve type.');
  }
  return { build, constant };
})();
if (typeof module !== 'undefined') module.exports = Curves;
