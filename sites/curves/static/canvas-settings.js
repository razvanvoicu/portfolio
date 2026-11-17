'use strict';
const CurveCanvas=(()=>{
 const defaults={grid:true,startColor:'#090c12',endColor:'#090c12',type:'radial',angle:0};
 const settings=value=>({...defaults,...value});
 function paint(ctx,width,options){
  const half=width/2;
  let gradient;
  if(options.type==='radial')gradient=ctx.createRadialGradient(half,half,0,half,half,Math.SQRT2*half);
  else {
   const radians=options.angle*Math.PI/180, x=Math.cos(radians), y=-Math.sin(radians);
   const extent=half*(Math.abs(x)+Math.abs(y));
   gradient=ctx.createLinearGradient(half-x*extent,half-y*extent,half+x*extent,half+y*extent);
  }
  gradient.addColorStop(0,options.startColor);gradient.addColorStop(1,options.endColor);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,width);
  if(options.grid){ctx.lineWidth=1;for(let i=0;i<=10;i++){let v=i*width/10;ctx.strokeStyle=i===5?'#4a5a73':'#1a2534';ctx.beginPath();ctx.moveTo(v,0);ctx.lineTo(v,width);ctx.moveTo(0,v);ctx.lineTo(width,v);ctx.stroke();}}
 }
 return {defaults,settings,paint};
})();
if(typeof module!=='undefined')module.exports=CurveCanvas;
