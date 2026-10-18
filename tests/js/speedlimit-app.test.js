const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function setup(signLimit = 70, schoolSigns = []) {
  const core = await import('../../sites/speedlimit/static/core.mjs');
  const roads = await import('../../sites/speedlimit/static/roads.mjs');
  const { CONFIG } = await import('../../sites/speedlimit/static/config.mjs');
  const elements = {};
  const get = id => elements[id] ||= {textContent:'', className:'', style:{}, value:'0', validity:{valid:true}, handlers:{},
    setAttribute(){}, addEventListener(name, fn){this.handlers[name]=fn;}, showModal(){}, close(){}};
  let now = Date.now(), gps, gpsError, cleared = false, saved = {}, gainValues = [];
  const timers = new Map(); let timerId = 0;
  const docHandlers = {};
  const context = {
    ...core, ...roads, CONFIG, ROAD_FEATURES:[], ROAD_IDENTITIES:[], NETWORK_INFO:{geometryDate:'test',verifiedRoadParts:0,roadParts:0}, DATA_INFO:{signCount:1,schoolSignCount:schoolSigns.length,retrieved:new Date(now).toISOString()}, SPEED_SIGNS:[[103.85,1.3,signLimit,0,1]], SCHOOL_SIGNS:schoolSigns,
    SG_POLYGONS:[[[[103.6,1.2],[104.1,1.2],[104.1,1.5],[103.6,1.5]]]],
    document:{getElementById:get,visibilityState:'visible',addEventListener:(name, fn)=>docHandlers[name]=fn},
    window:{isSecureContext:true, addEventListener(){}},
    navigator:{geolocation:{watchPosition(success, error){gps=success;gpsError=error;return 1;},clearWatch(){cleared=true;}}},
    localStorage:{getItem:key=>saved[key]??null,setItem:(key,value)=>saved[key]=value},
    setInterval:fn=>{timers.set(++timerId,fn);return timerId;}, clearInterval:id=>timers.delete(id),
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},
    Date:class extends Date {static now(){return now;}}, Intl, console,
  };
  context.window.AudioContext = class {
    constructor(){this.state='running';this.currentTime=0;this.destination={};}
    createOscillator(){return {type:'',frequency:{value:0,setValueAtTime(){}},connect(){},start(){}};}
    createGain(){return {gain:{value:0,cancelScheduledValues(){},setValueAtTime(value){gainValues.push(value);},linearRampToValueAtTime(value){gainValues.push(value);}},connect(){}};}
    addEventListener(){} async resume(){this.state='running';}
  };
  const code = fs.readFileSync('sites/speedlimit/static/app.js','utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(code, context);
  return {get, context, saved, docHandlers, timers, gainValues,
    start:async()=>{await get('start').onclick(); gps({timestamp:now, coords:{latitude:1.2999,longitude:103.85,accuracy:5,speed:0}}); gps({timestamp:now,coords:{latitude:1.3,longitude:103.85,accuracy:5,speed:0}});}, stop:()=>get('start').onclick(),
    position:(speed, extras={})=>gps({timestamp:now, coords:{latitude:1.3,longitude:103.85,accuracy:5,speed,...extras}}),
    error:code=>gpsError({code}), advance:ms=>{now+=ms; for(const fn of [...timers.values()])fn();},
    isCleared:()=>cleared,
    tolerance:value=>{get('tolerance').value=String(value);get('tolerance').handlers.change();},
  };
}
test('drive, signed tolerance, continuing alarm, recovery and stop', async () => {
  const app = await setup();
  app.tolerance(2); await app.start();
  app.position(68/3.6);
  assert.equal(app.get('speed').className,'reading good');
  app.position(68.1/3.6);
  assert.equal(app.get('speed').className,'reading over');
  assert.equal(app.get('speed').textContent,'68.1');
  assert.ok(app.gainValues.includes(0.16));
  const pulses = app.gainValues.length; app.advance(500);
  assert.ok(app.gainValues.length > pulses);
  app.position(68/3.6);
  assert.equal(app.gainValues.at(-1),0);
  app.tolerance(-2); app.position(72/3.6);
  assert.equal(app.get('speed').className,'reading good');
  app.position(72.1/3.6);
  assert.equal(app.get('speed').className,'reading over');
  await app.stop();
  assert.equal(app.isCleared(),true);
  assert.equal(app.get('speed').textContent,'—');
  assert.equal(app.gainValues.at(-1),0);
  assert.equal(app.saved['speedlimit.tolerance'],'-2');
});
test('stale GPS, denied permissions, unknown speed and outside Singapore suppress alarms', async () => {
  const app = await setup(); await app.start();
  app.position(30); assert.equal(app.get('speed').className,'reading over');
  app.advance(8100);
  assert.equal(app.get('status').textContent,'GPS SIGNAL LOST');
  assert.equal(app.get('speed').textContent,'—');
  assert.equal(app.gainValues.at(-1),0);
  app.position(null); assert.equal(app.get('speed').textContent,'—');
  app.position(30,{latitude:1.7});
  assert.equal(app.get('status').textContent,'OUTSIDE SINGAPORE');
  assert.equal(app.get('limit').textContent,70);
  app.position(30,{accuracy:80}); assert.equal(app.get('speed').textContent,'108.0');
  app.error(1); assert.match(app.get('status').textContent,/LOCATION DENIED/);
});
test('sign limit persists away from the sign and hiding clears a live alarm', async () => {
  const app = await setup(); await app.start();
  app.position(30,{longitude:103.9});
  assert.equal(app.get('speed').className,'reading over');
  assert.equal(app.get('limit').textContent,70);
  app.position(30); assert.equal(app.get('speed').className,'reading over');
  app.context.document.visibilityState='hidden'; app.docHandlers.visibilitychange();
  assert.equal(app.gainValues.at(-1),0);
  app.context.document.visibilityState='visible'; app.docHandlers.visibilitychange();
  assert.equal(app.get('speed').textContent,'—');
});

test('default 50 appears before starting and sub-60 limits never sound', async () => {
  const app = await setup(50);
  assert.equal(app.get('limit').textContent,50);
  await app.start(); app.position(30);
  assert.equal(app.get('speed').className,'reading over');
  assert.equal(app.gainValues.includes(0.16),false);
  assert.match(app.get('threshold').textContent,/silent/);
});
test('display enters silent school zone then restores the preceding limit and alarm', async () => {
  const app = await setup(60,[[103.85,1.301,null,0,2,'school-start'],[103.85,1.302,null,0,3,'school-end']]);
  await app.start();
  app.position(20,{latitude:1.3008});
  assert.equal(app.get('limit').textContent,40);
  assert.equal(app.get('limit-description').textContent,'School zone');
  assert.equal(app.get('speed').className,'reading over');
  assert.equal(app.gainValues.includes(0.16),false);
  app.position(20,{latitude:1.301});
  app.position(20,{latitude:1.3015});
  app.position(20,{latitude:1.3018});
  assert.equal(app.get('limit').textContent,60);
  assert.equal(app.gainValues.includes(0.16),true);
});
