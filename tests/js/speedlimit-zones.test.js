const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'),import('../../sites/speedlimit/static/config.mjs')]);
const origin = [103.85,1.3];
const point = (east,north) => [origin[0]+east/(111194.9266*Math.cos(origin[1]*Math.PI/180)),origin[1]+north/111194.9266];
const marker = (x,y,heading,id,kind) => [...point(x,y),kind==='school-start'?40:null,heading,id,kind];

test('generic and legacy unqualified school entries never impose 40 or create a speed zone',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.DriveTracker([[...point(0,-100),60,0,1]],c,[
    marker(0,0,0,2,'school-warning'),[...point(0,30),null,0,3,'school-start'],marker(0,150,0,4,'school-end')
  ]);
  for(let y=-150;y<=180;y+=10)t.update(point(0,y));
  assert.equal(t.limit,60);assert.equal(t.sign.id,1);assert.equal(t.schoolZone,null);
});

test('warning and inactive end markers do not suppress colocated ordinary speed signs',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.DriveTracker([[...point(0,-100),60,0,1],[...point(0,0),40,0,2],[...point(0,150),70,0,3]],c,[
    marker(0,0,0,4,'school-warning'),marker(0,150,0,5,'school-end')
  ]);
  for(let y=-150;y<=50;y+=10)t.update(point(0,y));
  assert.equal(t.limit,40);assert.equal(t.sign.id,2);assert.equal(t.schoolZone,null);
  for(let y=60;y<=180;y+=10)t.update(point(0,y));
  assert.equal(t.limit,70);assert.equal(t.sign.id,3);assert.equal(t.schoolZone,null);
});

test('generic school signs cannot clear a manually rejected limit',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.DriveTracker([[...point(0,-100),60,0,1]],c,[
    marker(0,0,0,2,'school-warning'),marker(0,150,0,3,'school-end')
  ]);
  for(let y=-150;y<=-90;y+=10)t.update(point(0,y),1000);
  assert.equal(t.limit,60);assert.equal(t.rejectChange(1001),true);
  for(let y=-80;y<=180;y+=10)t.update(point(0,y),1002);
  assert.equal(t.limit,50);assert.equal(t.rejectedSignId,1);assert.ok(t.manualOverride);
});
test('school entry saves 60 once, colocated 40 cannot overwrite it, end restores 60',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...point(0,-100),60,0,1],[...point(0,0),40,0,2]],c,
    [marker(0,0,0,3,'school-start'),marker(0,2,0,4,'school-start'),marker(0,150,0,5,'school-end')]);
  for(let y=-150;y<=100;y+=10)t.update(point(0,y));
  assert.equal(t.limit,40); assert.equal(t.schoolZone.limit,60);
  for(let y=110;y<=180;y+=10)t.update(point(0,y));
  assert.equal(t.limit,60);assert.equal(t.schoolZone,null);
});
test('school zone survives turns and other speed signs, stop jitter preserves saved limit',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...point(80,50),80,90,1]],c,
    [marker(0,0,0,2,'school-start'),marker(150,50,90,3,'school-end')]);
  for(let y=-50;y<=50;y+=10)t.update(point(0,y));
  assert.equal(t.limit,40);assert.equal(t.schoolZone.limit,50);
  for(let x=10;x<=100;x+=10)t.update(point(x,50));
  assert.equal(t.limit,40);assert.equal(t.schoolZone.limit,50);
  for(let i=0;i<100;i++)t.update(point(100+i%2,50+i%2));
  assert.equal(t.limit,40);assert.equal(t.schoolZone.limit,50);
  for(let x=110;x<=170;x+=10)t.update(point(x,50));
  assert.equal(t.limit,50);assert.equal(t.schoolZone,null);
});
test('opposite school markers do not apply; a later zone saves a fresh pre-zone limit',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...point(0,180),70,0,1]],c,
    [marker(0,0,180,2,'school-start'),marker(0,50,0,3,'school-start'),
     marker(0,110,0,4,'school-end'),marker(0,250,0,5,'school-start'),marker(0,320,0,6,'school-end')]);
  for(let y=-50;y<=10;y+=10)t.update(point(0,y));assert.equal(t.limit,50);
  for(let y=20;y<=60;y+=10)t.update(point(0,y));assert.equal(t.limit,40);
  for(let y=70;y<=130;y+=10)t.update(point(0,y));assert.equal(t.limit,50);
  for(let y=140;y<=190;y+=10)t.update(point(0,y));assert.equal(t.limit,70);
  for(let y=200;y<=260;y+=10)t.update(point(0,y));assert.equal(t.schoolZone.limit,70);
  for(let y=270;y<=340;y+=10)t.update(point(0,y));assert.equal(t.limit,70);
});
test('corner sign is rechecked beyond radius after heading catches up, in either turn direction',async()=>{
  const [m,{CONFIG:c}] = await modules;
  for(const direction of [-1,1]) {
    const t=new m.DriveTracker([[...point(0,0),60,direction===1?90:270,1]],c);
    for(const y of [-60,-45,-30,-15,0])t.update(point(0,y));
    assert.equal(t.limit,50);
    // First fix on the side road is still dominated by the old heading.
    t.update(point(25*direction,0));assert.equal(t.limit,50);
    // Now 50 m from the corner, but only 25 m since last seeing its sign.
    t.update(point(50*direction,0));assert.equal(t.limit,60);
  }
});
test('corner candidates expire after configured travel, not elapsed time',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...point(0,0),60,90,1]],{...c,signConeRangeM:30,signRecheckDistanceM:10});
  for(const y of [-60,-45,-30,-15,0])t.update(point(0,y));
  t.update(point(25,0));t.update(point(50,0));assert.equal(t.limit,50);
});
