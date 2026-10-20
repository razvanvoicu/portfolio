const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'),import('../../sites/speedlimit/static/config.mjs')]);
const origin=[103.85,1.3];
const point=(x,y)=>[origin[0]+x/(111194.9266*Math.cos(origin[1]*Math.PI/180)),origin[1]+y/111194.9266];
const sign=(x,y,limit,id,heading=0)=>[...point(x,y),limit,heading,id];

test('linear cone boundaries at 60, 30 and 0 metres, mirrored behind',async()=>{
  const [m,{CONFIG:c}]=await modules;
  for (const [d,angle] of [[60,20],[30,55],[0,90]]) {
    const inside=angle-0.001, radius=d ? d-0.001 : 0;
    const s=point(radius*Math.sin(inside*Math.PI/180),radius*Math.cos(inside*Math.PI/180));
    assert.equal(m.signInCone(origin,s,0,c),true);
    const back=point(radius*Math.sin(inside*Math.PI/180),-radius*Math.cos(inside*Math.PI/180));
    assert.equal(m.signInCone(origin,back,0,c,true),true);
    if(d) assert.equal(m.signInCone(origin,point(d*Math.sin((angle+0.1)*Math.PI/180),d*Math.cos((angle+0.1)*Math.PI/180)),0,c),false);
  }
  assert.equal(m.signInCone(origin,point(0,60.1),0,c),false);
  assert.equal(m.signInCone(origin,point(0,-20),0,c),false);
});

test('candidate does not apply early; an 80m GPS gap confirms passage without a fix inside 30m',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.DriveTracker([sign(5,0,60,1)],c);
  t.update(point(0,-55));t.update(point(0,-40));
  assert.equal(t.limit,50); assert.equal(t.encounters.has(1),true);
  t.update(point(0,40)); assert.equal(t.limit,60);
  const opposite=new m.DriveTracker([sign(5,0,60,1,180)],c);
  for(const y of [-55,-40,40])opposite.update(point(0,y));assert.equal(opposite.limit,50);
  const side=new m.DriveTracker([sign(45,0,60,1)],c);
  for(const y of [-55,-40,40,55])side.update(point(0,y));assert.equal(side.limit,50);
});

test('reject ramp sign once, restore 90, suppress reapplication until another passed sign; later revisit can apply',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.DriveTracker([sign(0,-150,90,1),sign(0,0,50,2),sign(0,200,90,3)],c);
  for(const y of [-180,-160,-140,-60,-40,10])t.update(point(0,y),1000);
  assert.equal(t.limit,50); assert.equal(t.rejectChange(8000),true); assert.equal(t.limit,90);
  t.update(point(0,20),8100);assert.equal(t.limit,90);
  // Even a new encounter with the rejected ID cannot reapply it yet.
  t.encounters.delete(2);t.update(point(0,-40),8200);t.update(point(0,10),8300);assert.equal(t.limit,90);
  for(const y of [70,140,190,210])t.update(point(0,y),8400);
  assert.equal(t.rejectedSignId,null);
  t.update(point(0,300),8500);t.update(point(0,-100),8600);
  t.update(point(0,-40),8700);t.update(point(0,10),8800); assert.equal(t.limit,50);
});

test('reject school entry restores state; reject exit restores active school zone',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const markers=[[...point(0,0),null,0,1,'school-start'],[...point(0,100),null,0,2,'school-end']];
  const t=new m.DriveTracker([],c,markers);
  t.update(point(0,-40),0);t.update(point(0,10),100);
  assert.equal(t.limit,40);t.rejectChange(200);assert.equal(t.limit,50);assert.equal(t.schoolZone,null);
  t.update(point(0,110),300);assert.equal(t.limit,50);
  const u=new m.DriveTracker([],c,markers);
  u.update(point(0,-40),0);u.update(point(0,10),100);u.update(point(0,110),200);
  assert.equal(u.limit,50);u.rejectChange(300);assert.equal(u.limit,40);assert.equal(u.schoolZone.limit,50);
});

test('Clementi southbound real data: 60 sign then school entry and exit with sparse fixes',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const data=await import('../../sites/speedlimit/static/road-data.js');
  const t=new m.DriveTracker(data.SPEED_SIGNS.filter(s=>[78850,78851,78852].includes(s[4])),c,
    data.SCHOOL_SIGNS.filter(s=>[30634,33040,31080,31314].includes(s[4])));
  for(const [lon,lat] of [[103.77129,1.3051],[103.77129,1.30499],[103.77129,1.30428]])t.update([lon,lat]);
  assert.equal(t.limit,60);
  for(const p of [[103.77045,1.3014],[103.77022,1.30065]])t.update(p);
  assert.equal(t.limit,40);assert.equal(t.schoolZone.limit,60);
  for(const p of [[103.77004,1.2995],[103.76996,1.2988]])t.update(p);
  assert.equal(t.limit,60);assert.equal(t.schoolZone,null);
});
