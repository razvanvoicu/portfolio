const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/roads.mjs'),import('../../sites/speedlimit/static/config.mjs'),import('../../sites/speedlimit/static/core.mjs')]);
const origin=[103.85,1.3];
const point=(x,y)=>[origin[0]+x/(111194.9266*Math.cos(origin[1]*Math.PI/180)),origin[1]+y/111194.9266];
const feature=(road,limit,id,x)=>[road,limit,id,[point(x,-100),point(x,100)]];

test('Lanai manual sign activates 40 entering the real spur from either approach',async()=>{
  const [m,{CONFIG:c},core]=await modules;
  const data=await import('../../sites/speedlimit/static/network.mjs');
  const signs=await import('../../sites/speedlimit/static/road-data.js');
  const manualId='manual:hillview-avenue-lanai-40';
  assert.equal(signs.SPEED_SIGNS.filter(s=>s[4]===manualId).length,1);
  assert.deepEqual(signs.SPEED_SIGNS.find(s=>s[4]===86695),[103.7621193,1.3570469,40,288.60400129,86695]);
  for(const approach of [null,8986,10717]) {
    let route=data.ROAD_FEATURES.find(f=>f[2]===6084)[3];
    if(approach) {
      let points=data.ROAD_FEATURES.find(f=>f[2]===approach)[3];
      if(core.distance(points.at(-1),route[0])>core.distance(points[0],route[0]))points=[...points].reverse();
      route=[...points,...route];
    }
    const t=new m.RoadDriveTracker(signs.SPEED_SIGNS,c,signs.SCHOOL_SIGNS,data.ROAD_FEATURES,data.ROAD_IDENTITIES);
    t.update(route[0]);
    for(let i=1;i<route.length;i++) {
      const a=route[i-1],b=route[i],steps=Math.ceil(core.distance(a,b)/6);
      for(let j=1;j<=steps;j++)t.update(a.map((v,k)=>v+(b[k]-v)*j/steps));
    }
    assert.equal(t.limit,40,`approach ${approach}`);
    assert.equal(t.sign.id,manualId);
  }
  // The added sign faces entering traffic and must not apply when leaving.
  const t=new m.RoadDriveTracker(signs.SPEED_SIGNS.filter(s=>s[4]===manualId),c,[],[],[]);
  for(const x of [103.7618,103.7619,103.7620,103.7621,103.7622,103.7623])t.update([x,1.35662]);
  assert.equal(t.limit,50);
});
test('parallel roads: ambiguous initially, retain eligible previous road, then switch',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const matcher=new m.RoadMatcher([feature(0,60,1,0),feature(1,70,2,15)],[['A','Road A'],['B','Road B']],c);
  assert.equal(matcher.match(point(7,0),0).state,'uncertain');
  assert.equal(matcher.match(point(7,0),0,'A').road.code,'A');
  assert.equal(matcher.match(point(7,0),180,'B').road.code,'B');
  assert.equal(matcher.match(point(16,0),0,'A').road.code,'B');
  assert.equal(matcher.match(point(100,0),0,'B').state,'unmatched');
  assert.equal(matcher.match(point(0,0),90).state,'unmatched');
  assert.equal(matcher.match(point(0,0),null).state,'heading');
});
test('road limits apply without passing a sign; unresolved stretch uses default fallback',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.RoadDriveTracker([],c,[],[feature(0,60,1,0),feature(1,null,2,200)],[['A','Road A'],['B','Road B']]);
  t.update(point(0,0));t.update(point(0,10));assert.equal(t.limit,60);assert.equal(t.sign.kind,'road');
  // New road after a turn; this road has no mapped legal limit.
  t.update(point(200,0));t.update(point(200,10));t.update(point(200,20));t.update(point(200,30));
  assert.equal(t.limit,50);assert.equal(t.roadMatch.road.code,'B');assert.equal(t.sign,null);
});
test('road-based school entry saves statutory limit and end restores it',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const t=new m.RoadDriveTracker([],c,[
    [...point(0,0),null,0,1,'school-start'],[...point(0,100),null,0,2,'school-end']
  ],[feature(0,60,3,0)],[['A','Road A']]);
  t.update(point(0,-60));t.update(point(0,-50));assert.equal(t.limit,60);
  for(let y=-40;y<=40;y+=10)t.update(point(0,y));
  assert.equal(t.limit,40);assert.equal(t.schoolZone.limit,60);
  for(let y=50;y<=110;y+=10)t.update(point(0,y));assert.equal(t.limit,60);assert.equal(t.schoolZone,null);
});
test('config controls road radius, bearing and ambiguity independently of sign settings',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const matcher=new m.RoadMatcher([feature(0,60,1,0)],[['A','Road A']],{...c,roadMatchDistanceM:10,roadBearingToleranceDeg:20});
  assert.equal(matcher.match(point(9,0),19).state,'matched');
  assert.equal(matcher.match(point(11,0),0).state,'unmatched');
  assert.equal(matcher.match(point(0,0),21).state,'unmatched');
});
test('real Hillview Avenue main stretch gives 60 after joining mid-road in either direction',async()=>{
  const [m,{CONFIG:c}]=await modules;
  const data=await import('../../sites/speedlimit/static/network.mjs');
  const f=data.ROAD_FEATURES.find(f=>f[2]===3483);
  const i=Math.floor(f[3].length/2),a=f[3][i],b=f[3][i+1];
  for(const [from,to] of [[a,b],[b,a]]) {
    const t=new m.RoadDriveTracker([],c,[],data.ROAD_FEATURES,data.ROAD_IDENTITIES);
    t.update(from);t.update(to);
    assert.equal(t.roadMatch.road.code,'HIA00U');assert.equal(t.limit,60);assert.equal(t.sign.kind,'road');
  }
  // Estate spur and northern continuation are not assigned the main-road 60.
  assert.equal(data.ROAD_FEATURES.find(f=>f[2]===6084)[1],null);
  assert.equal(data.ROAD_FEATURES.find(f=>f[2]===5525)[1],null);
  assert.equal(data.ROAD_FEATURES.length,15364);
  assert.equal(data.NETWORK_INFO.verifiedRoadParts,data.ROAD_FEATURES.filter(f=>f[1]!==null).length);
  assert.ok(data.NETWORK_INFO.verifiedRoadParts>=1924);
});
