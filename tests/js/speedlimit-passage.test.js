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

test('Clementi southbound real data: generic school warnings do not replace the posted 60',async()=>{
  const [,{CONFIG:c}]=await modules;
  const data=await import('../../sites/speedlimit/static/road-data.js');
  const {RoadDriveTracker}=await import('../../sites/speedlimit/static/roads.mjs');
  const network=await import('../../sites/speedlimit/static/network.mjs');
  const t=new RoadDriveTracker(data.SPEED_SIGNS,c,data.SCHOOL_SIGNS,network.ROAD_FEATURES,network.ROAD_IDENTITIES);
  for(const [lon,lat] of [[103.77129,1.3051],[103.77129,1.30499],[103.77129,1.30428]])t.update([lon,lat]);
  assert.equal(t.limit,60);
  for(const p of [[103.77045,1.3014],[103.77022,1.30065]])t.update(p);
  assert.equal(t.limit,60);assert.equal(t.schoolZone,null);
  for(const p of [[103.77004,1.2995],[103.76996,1.2988]])t.update(p);
  assert.equal(t.limit,60);assert.equal(t.schoolZone,null);
});
