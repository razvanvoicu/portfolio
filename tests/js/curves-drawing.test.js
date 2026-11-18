const {test}=require('node:test');
const assert=require('node:assert/strict');
const Drawing=require('../../sites/curves/static/drawing.js');
function context(){
 const lines=[],gradients=[];let current=null;
 return {lines,gradients,beginPath(){current={moves:[],lines:[]};},moveTo(x,y){current.moves.push([x,y]);},lineTo(x,y){current.lines.push([x,y]);},stroke(){lines.push({...current,style:this.strokeStyle,width:this.lineWidth});},createLinearGradient(){const stops=[];gradients.push(stops);return {addColorStop:(position,color)=>stops.push([position,color])};}};
}
test('drawing interpolates color over curve time and applies thickness',()=>{
 const ctx=context(),pieces=[{a:0,b:1,point:t=>[t*100,0]}];
 Drawing.draw(ctx,pieces,800,{startColor:'#000000',endColor:'#ffffff',thickness:'7'});
 assert.deepEqual(ctx.gradients[0][0],[0,'#000000']);
 assert.deepEqual(ctx.gradients.at(-1).at(-1),[1,'#000000']);
 assert.equal(Drawing.colorAt('#000000','#ffffff',.25),'#808080');
 assert.equal(Drawing.colorAt('#000000','#ffffff',.5),'#ffffff');
 assert.equal(Drawing.colorAt('#000000','#ffffff',.75),'#808080');
 assert.equal(Drawing.colorAt('#000000','#ffffff',1),'#000000');
 assert.equal(ctx.lines[0].width,7);
});
test('drawing keeps disconnected pieces separate and uses global t at boundaries',()=>{
 const ctx=context(),pieces=[{a:0,b:.5,point:t=>[t,0]},{a:.5,b:1,point:t=>[t,50]}];
 Drawing.draw(ctx,pieces,800,{startColor:'#ff0000',endColor:'#0000ff',thickness:'2.5'});
 assert.ok(ctx.gradients.length>0);
 assert.ok(ctx.lines.some((line,index)=>index>0&&line.moves.length&&line.moves[0][1]!==ctx.lines[index-1].moves?.[0]?.[1]));
});
test('drawing uses the new default and clamps existing widths to the slider range',()=>{
 assert.deepEqual(Drawing.settings(),{startColor:'#74e1c1',endColor:'#74e1c1',thickness:'3'});
 assert.equal(Drawing.settings({thickness:'2.5'}).thickness,'3');
 assert.equal(Drawing.settings({thickness:'30'}).thickness,'25');
 assert.equal(Drawing.settings({thickness:'12.5'}).thickness,'13');
 assert.equal(Drawing.settings({thickness:'12.4'}).thickness,'12');
 assert.equal(Drawing.settings({thickness:''}).thickness,'3');
 for(const thickness of ['', '0','-1'])assert.throws(()=>Drawing.draw(context(),[],800,{...Drawing.settings(),thickness}),/positive thickness/);
});
test('gradient reaches the midpoint color when the sampling grid misses t=0.5',()=>{
 const ctx=context(),pieces=[{a:.123,b:.789,point:t=>[t*100,0]}];
 Drawing.draw(ctx,pieces,800,{startColor:'#000000',endColor:'#ffffff',thickness:'2.5'});
 assert.ok(ctx.gradients.some(stops=>stops[1][1]==='#ffffff'));
 assert.ok(ctx.gradients.some(stops=>stops[0][1]==='#ffffff'));
});
test('shifting the drawing carries the start color to the shifted point',()=>{
 global.Curves=require('../../sites/curves/static/curves.js');
 const Animation=require('../../sites/curves/static/animation.js');
 const ctx=context(),pieces=[{a:0,b:1,point:t=>[100*t,0]}];
 const shifted=Animation.apply(pieces,{shift:{enabled:true,phase:.25}});
 Drawing.draw(ctx,shifted,800,{startColor:'#ff0000',endColor:'#0000ff',thickness:'2.5'});
 assert.equal(ctx.gradients[0][0][1],'#ff0000');
 assert.equal(ctx.lines[0].moves[0][0],500);
});
test('drawing rounds coordinates to two decimals and clamps the virtual canvas range',()=>{
 const ctx=context(),pieces=[{a:0,b:1,point:t=>[1000.6*t-100.4,1000*t+.004]}];
 Drawing.draw(ctx,pieces,200,{startColor:'#000000',endColor:'#000000',thickness:'3'});
 assert.deepEqual(ctx.lines[0].moves[0],[0,100]);
 assert.deepEqual(ctx.lines[0].lines.at(-1),[200,0]);
});
