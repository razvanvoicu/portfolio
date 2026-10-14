const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'),import('../../sites/speedlimit/static/config.mjs')]);
const origin = [103.85,1.3];
function point(east, north) { return [origin[0]+east/(111194.9266*Math.cos(origin[1]*Math.PI/180)),origin[1]+north/111194.9266]; }
test('sign distance and bearing boundaries, north wraparound, opposite traffic', async()=>{
  const [m,{CONFIG:c}] = await modules;
  const signs = [[...origin,80,0,1]];
  assert.ok(m.qualifyingSign(origin,signs,45,c));
  assert.ok(m.qualifyingSign(origin,signs,315,c));
  assert.equal(m.qualifyingSign(origin,signs,45.01,c),null);
  assert.equal(m.qualifyingSign(origin,signs,180,c),null);
  assert.ok(m.qualifyingSign(point(0,29.99),signs,0,c));
  assert.equal(m.qualifyingSign(point(0,30.01),signs,0,c),null);
  assert.ok(m.angleDifference(m.averageBearing([359,1]),0)<0.001);
});
test('retained limit, stopped GPS jitter and four-position queue',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t = new m.DriveTracker([[...origin,80,0,1]],c);
  assert.equal(t.limit,50);
  for(const y of [-20,-10,0,10,20,40,60]) t.update(point(0,y));
  assert.equal(t.limit,80);
  const history=JSON.stringify([t.positions,t.headings,t.heading]);
  for(let i=0;i<1000;i++)t.update(point(i%2,60+i%2));
  assert.equal(JSON.stringify([t.positions,t.headings,t.heading]),history);
  assert.equal(t.positions.length,4);
  t.update(point(0,70)); assert.equal(t.limit,80);
});
test('left and right turns reset retained limit, smaller turns do not',async()=>{
  const [m,{CONFIG:c}] = await modules;
  for(const direction of [-1,1]) {
    const t=new m.DriveTracker([[...origin,80,0,1]],c);
    for(const y of [-20,-10,0,10,20,30,40])t.update(point(0,y));
    assert.equal(t.limit,80);
    t.update(point(6*direction,40)); assert.equal(t.limit,80);
    t.update(point(12*direction,40)); assert.equal(t.limit,50);
  }
});
test('new qualifying sign replaces old limit and audio cut-off is inclusive',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...origin,80,0,1],[...point(0,100),60,0,2]],c);
  for(let y=-20;y<=100;y+=10)t.update(point(0,y));
  assert.equal(t.limit,60);
  assert.equal(m.shouldSound(100,50,0,c),false);
  assert.equal(m.shouldSound(61,60,0,c),true);
  assert.equal(m.shouldSound(58,60,2,c),false);
});
test('smaller successive direction changes accumulate into a sharp turn',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const t=new m.DriveTracker([[...origin,80,0,1]],c);
  for(const y of [-18,-12,-6,0,6,12,18,24,30])t.update(point(0,y));
  let east=0,north=30;
  for(const heading of [20,40,60,81]) {
    east+=6*Math.sin(heading*Math.PI/180);north+=6*Math.cos(heading*Math.PI/180);
    t.update(point(east,north));
  }
  assert.equal(t.limit,50);
});
test('configuration controls distance, angle, default and history settings',async()=>{
  const [m,{CONFIG:c}] = await modules;
  const config={...c,defaultLimitKph:40,signRadiusM:10,signBearingToleranceDeg:20,
    minMovementM:8,positionHistoryLength:2,turnAngleDeg:80};
  const t=new m.DriveTracker([[...origin,80,0,1]],config);
  assert.equal(t.limit,40);
  t.update(point(0,-15));t.update(point(0,-9));assert.equal(t.heading,null);
  t.update(point(0,-6));assert.equal(t.limit,80);
  assert.equal(m.qualifyingSign(origin,t.signs,21,config),null);
  assert.equal(m.qualifyingSign(point(0,11),t.signs,0,config),null);
});
