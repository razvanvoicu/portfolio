const {test}=require('node:test');
const assert=require('node:assert/strict');
const Canvas=require('../../sites/curves/static/canvas-settings.js');
function context(){
 const calls=[],gradient={addColorStop:(...args)=>calls.push(['stop',...args])};
 return {calls,createRadialGradient:(...a)=>(calls.push(['radial',...a]),gradient),createLinearGradient:(...a)=>(calls.push(['linear',...a]),gradient),fillRect:(...a)=>calls.push(['fill',...a]),beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>calls.push(['stroke'])};
}
test('radial background goes from center to corners and grid can be hidden',()=>{
 const ctx=context();Canvas.paint(ctx,200,Canvas.settings({grid:false,startColor:'#112233',endColor:'#445566'}));
 assert.deepEqual(ctx.calls[0],['radial',100,100,0,100,100,100*Math.SQRT2]);
 assert.deepEqual(ctx.calls.slice(1,3),[['stop',0,'#112233'],['stop',1,'#445566']]);
 assert.equal(ctx.calls.filter(c=>c[0]==='stroke').length,0);
});
test('transversal angles use Cartesian directions and the grid is drawn on top',()=>{
 const ctx=context();Canvas.paint(ctx,200,Canvas.settings({type:'transversal',angle:90}));
 const [kind,x1,y1,x2,y2]=ctx.calls[0];assert.equal(kind,'linear');
 assert.ok(Math.abs(x1-100)<1e-10 && Math.abs(x2-100)<1e-10);
 assert.ok(Math.abs(y1-200)<1e-10 && Math.abs(y2)<1e-10);
 assert.equal(ctx.calls.filter(c=>c[0]==='stroke').length,11);
});
