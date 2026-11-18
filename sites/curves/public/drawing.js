'use strict';
const CurveDrawing = (() => {
  const defaults={startColor:'#74e1c1',endColor:'#74e1c1',thickness:'3'};
  function settings(value){
    const result={...defaults,...value},raw=result.thickness;
    const thickness=typeof raw==='string' && raw.trim()?Number(raw):NaN;
    result.thickness=Number.isFinite(thickness)?String(Math.max(3,Math.min(25,Math.round(thickness)))):defaults.thickness;
    return result;
  }
  function colorAt(start,end,t){
    const position=t<=0.5 ? 2*t : 2*(1-t);
    const result=[0,2,4].map(i=>{
      const a=parseInt(start.slice(i+1,i+3),16),b=parseInt(end.slice(i+1,i+3),16);
      return Math.round(a+(b-a)*position).toString(16).padStart(2,'0');
    });
    return '#'+result.join('');
  }
  function draw(ctx,pieces,width,options){
    const thickness=Number(options.thickness);
    if(!options.thickness.trim() || !Number.isFinite(thickness) || thickness<=0)throw new Error('Enter a positive thickness.');
    if(!/^#[0-9a-f]{6}$/i.test(options.startColor)||!/^#[0-9a-f]{6}$/i.test(options.endColor))throw new Error('Choose valid drawing colors.');
    ctx.lineWidth=thickness;ctx.lineCap='round';ctx.lineJoin='round';
    const uniform=options.startColor.toLowerCase()===options.endColor.toLowerCase();
    for(const piece of pieces){
      let previous=null;const steps=Math.max(2,Math.ceil(1200*(piece.b-piece.a)));
      if(uniform){ctx.beginPath();ctx.strokeStyle=options.startColor;}
      const times=Array.from({length:steps+1},(_,i)=>piece.a+(piece.b-piece.a)*i/steps);
      if(!uniform && piece.a<0.5 && piece.b>0.5){
        const index=times.findIndex(t=>t>=0.5);
        if(times[index]!==0.5)times.splice(index,0,0.5);
      }
      for(const t of times){
        const [x,y]=piece.point(t);
        if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)){previous=null;continue;}
        const current={x:(x+100)*width/200,y:(100-y)*width/200,t};
        if(uniform){if(previous)ctx.lineTo(current.x,current.y);else ctx.moveTo(current.x,current.y);}
        else if(previous){
          const gradient=ctx.createLinearGradient(previous.x,previous.y,current.x,current.y);
          gradient.addColorStop(0,colorAt(options.startColor,options.endColor,previous.t));
          gradient.addColorStop(1,colorAt(options.startColor,options.endColor,current.t));
          ctx.strokeStyle=gradient;ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(current.x,current.y);ctx.stroke();
        }
        previous=current;
      }
      if(uniform)ctx.stroke();
    }
  }
  return {defaults,settings,colorAt,draw};
})();
if(typeof module!=='undefined')module.exports=CurveDrawing;
