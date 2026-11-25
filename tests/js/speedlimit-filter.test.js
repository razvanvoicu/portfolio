const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'), import('../../sites/speedlimit/static/config.mjs')]);
const origin = [103.85, 1.3];
const point = (x,y) => [origin[0]+x/(111194.9266*Math.cos(origin[1]*Math.PI/180)),origin[1]+y/111194.9266];
const sign = (north, limit, id) => [...point(0,north), limit, 0, id];

async function drive(limits, speed = 0, initial = 80) {
  const [{DriveTracker}, {CONFIG}] = await modules;
  const tracker = new DriveTracker(limits.map((limit,i)=>sign(i*150,limit,i+1)), {...CONFIG,defaultLimitKph:initial});
  for(let y=-60;y<=10;y+=10)tracker.update(point(0,y),speed);
  return tracker;
}

test('differences of 20 or more in either direction create candidates regardless of GPS speed', async () => {
  for(const [actual,incoming] of [[80,50],[90,50],[80,40],[90,40],[60,40],[50,70],[50,90]]) {
    for(const speed of [0,50,90,null]) {
      const t=await drive([incoming],speed,actual);
      assert.equal(t.limit,actual);assert.equal(t.candidate.limit,incoming);
      assert.equal(t.encounters.get(1).handled,true);
    }
  }
  const t=await drive([70]);assert.equal(t.limit,70);assert.equal(t.candidate,null);
});

test('candidate persists past sign expiry, stopped fixes and turns until explicitly accepted', async () => {
  const t=await drive([50]);
  for(let y=20;y<=150;y+=10)t.update(point(0,y));
  assert.equal(t.encounters.has(1),false);
  for(let x=10;x<=100;x+=10)t.update(point(x,150));
  assert.equal(t.limit,80);assert.equal(t.candidate.limit,50);
  assert.equal(t.acceptCandidate(),true);assert.equal(t.limit,50);assert.equal(t.sign.id,1);
  assert.equal(t.candidate,null);assert.equal(t.acceptCandidate(),false);
  t.reset();assert.equal(t.candidate,null);
});

test('an active-limit sign dismisses a proposal; three lower signs propose, swap, then confirm', async () => {
  const same=await drive([50,80]);
  for(let y=20;y<=170;y+=10)same.update(point(0,y));
  assert.equal(same.limit,80);assert.equal(same.candidate,null);assert.equal(same.sign.id,2);
  const t=await drive([50,50,50]);
  for(let y=20;y<=170;y+=10)t.update(point(0,y));
  assert.equal(t.limit,50);assert.equal(t.candidate.limit,80);assert.equal(t.candidate.kind,'default');
  for(let y=180;y<=320;y+=10)t.update(point(0,y));
  assert.equal(t.limit,50);assert.equal(t.candidate,null);assert.equal(t.sign.id,3);
});

test('80 then 80 after the second 50 reverses the swap, then confirms 80', async () => {
  const t=await drive([50,50,80,80]);
  for(let y=20;y<=170;y+=10)t.update(point(0,y));
  assert.equal(t.limit,50);assert.equal(t.candidate.limit,80);
  for(let y=180;y<=320;y+=10)t.update(point(0,y));
  assert.equal(t.limit,80);assert.equal(t.candidate.limit,50);assert.equal(t.sign.id,3);
  for(let y=330;y<=470;y+=10)t.update(point(0,y));
  assert.equal(t.limit,80);assert.equal(t.candidate,null);assert.equal(t.sign.id,4);
});

test('a tap after swapping restores the previous sign or default and clears doubt', async () => {
  const t=await drive([50,50]);
  for(let y=20;y<=170;y+=10)t.update(point(0,y));
  assert.equal(t.acceptCandidate(),true);assert.equal(t.limit,80);
  assert.equal(t.candidate,null);assert.equal(t.sign,null);assert.equal(t.fallbackSign,null);
  const signed=await drive([80,50,50]);
  for(let y=20;y<=320;y+=10)signed.update(point(0,y));
  assert.equal(signed.limit,50);assert.equal(signed.candidate.limit,80);
  assert.equal(signed.candidate.id,1);
  signed.acceptCandidate();assert.equal(signed.limit,80);assert.equal(signed.sign.id,1);
});

test('a third value replaces the candidate even if close to the active limit', async () => {
  const t=await drive([50,70,70]);
  for(let y=20;y<=170;y+=10)t.update(point(0,y));
  assert.equal(t.limit,80);assert.equal(t.candidate.limit,70);
  for(let y=180;y<=320;y+=10)t.update(point(0,y));
  assert.equal(t.limit,70);assert.equal(t.candidate.limit,80);
});

test('a corner recheck cannot confirm the candidate using the same passed sign', async () => {
  const t=await drive([50]);
  for(let x=6;x<=36;x+=6)t.update(point(x,10));
  assert.equal(t.limit,80);assert.equal(t.candidate.limit,50);
});

test('mapped limits clear pending candidates; a stored fallback can become a candidate at coverage end',async()=>{
  const [{},{CONFIG}]=await modules;
  const {RoadDriveTracker}=await import('../../sites/speedlimit/static/roads.mjs');
  const features=[[0,80,1,[point(0,-200),point(0,0)]],[0,null,2,[point(0,0),point(0,200)]],[0,60,3,[point(0,200),point(0,400)]]];
  const t=new RoadDriveTracker([sign(-100,50,1)],CONFIG,[],features,[['A','Road A']]);
  for(let y=-150;y<=0;y+=10)t.update(point(0,y));
  assert.equal(t.limit,80);assert.equal(t.candidate,null);
  for(let y=10;y<=100;y+=10)t.update(point(0,y));
  assert.equal(t.limit,80);assert.equal(t.candidate.limit,50,'fallback is offered without silently changing the actual limit');
  for(let y=110;y<=250;y+=10)t.update(point(0,y));
  assert.equal(t.limit,60);assert.equal(t.candidate,null);
});

test('explicit school entry clears candidates and restores the actual limit on exit',async()=>{
  const [{DriveTracker},{CONFIG}]=await modules;
  const t=new DriveTracker([sign(0,50,1)],{...CONFIG,defaultLimitKph:80},[
    [...point(0,150),40,0,2,'school-start'],[...point(0,300),null,0,3,'school-end']
  ]);
  for(let y=-60;y<=30;y+=10)t.update(point(0,y));
  assert.equal(t.candidate.limit,50);assert.equal(t.limit,80);
  for(let y=40;y<=170;y+=10)t.update(point(0,y));
  assert.equal(t.candidate,null);assert.equal(t.limit,40);
  for(let y=180;y<=320;y+=10)t.update(point(0,y));
  assert.equal(t.candidate,null);assert.equal(t.limit,80);
});
