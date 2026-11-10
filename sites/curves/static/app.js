'use strict';
const $ = s => document.querySelector(s);
const KEY='curves:workspace:v1';
const fresh = () => ({id:Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join(''),name:'',type:'equation',mode:'cartesian',formulas:{},source1:'',source2:'',dx:'0',dy:'0',alpha:'0',from:'0',to:'1',n:'4',epsilon:'0',dropStart:'0',dropEnd:'0'});
let state;
try { state=JSON.parse(localStorage.getItem(KEY)); } catch { /* start an empty workspace */ }
if (!state || !Array.isArray(state.curves) || !state.draft) state={curves:[],draft:fresh(),editing:null,dialog:null};
let slot=null;
let draggedCurve=null;
const persist=()=>{ try { localStorage.setItem(KEY,JSON.stringify(state)); $('#storage').textContent='Workspace saved locally'; } catch { $('#storage').textContent='Unable to save workspace'; } };
const lookup=id=>state.curves.find(c=>c.id===id);
const labels={equation:'Equations',translate:'Translation',rotate:'Rotation',scale:'Scaling',reverse:'Reverse',shift:'Shift',morph:'Simple morph',slice:'Slice',concat:'Concatenation',iterate:'Iterated concatenation',splice:'Splicing'};
function library(){
  $('#count').textContent=state.curves.length;
  const list=$('#library'); list.replaceChildren();
  if (!state.curves.length) { const p=document.createElement('p'); p.className='empty'; p.textContent='Your saved curves will appear here.'; list.append(p); }
  for(const curve of state.curves){
    const button=document.createElement('button'); button.className='item'+(state.editing===curve.id?' active':'');
    button.textContent=curve.name; button.title=curve.name; button.draggable=true;
    button.onclick=()=>{state.editing=curve.id;state.draft=structuredClone(curve);state.dialog=null;persist();render();};
    button.addEventListener('dragstart',event=>{draggedCurve=curve.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',curve.id);button.classList.add('dragging');});
    button.addEventListener('dragend',()=>{draggedCurve=null;list.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(item=>item.classList.remove('dragging','drop-before','drop-after'));});
    button.addEventListener('dragover',event=>{
      if(!draggedCurve || draggedCurve===curve.id)return;
      event.preventDefault();event.dataTransfer.dropEffect='move';
      list.querySelectorAll('.drop-before,.drop-after').forEach(item=>item.classList.remove('drop-before','drop-after'));
      button.classList.add(event.clientY < button.getBoundingClientRect().top+button.offsetHeight/2 ? 'drop-before' : 'drop-after');
    });
    button.addEventListener('dragleave',event=>{if(!button.contains(event.relatedTarget))button.classList.remove('drop-before','drop-after');});
    button.addEventListener('drop',event=>{
      if(!draggedCurve || draggedCurve===curve.id)return;
      event.preventDefault();
      const from=state.curves.findIndex(item=>item.id===draggedCurve);
      if(from<0)return;
      const after=event.clientY >= button.getBoundingClientRect().top+button.offsetHeight/2;
      const [moved]=state.curves.splice(from,1);
      const target=state.curves.findIndex(item=>item.id===curve.id);
      state.curves.splice(target+(after?1:0),0,moved);
      const scrollTop=list.scrollTop;draggedCurve=null;persist();library();list.scrollTop=scrollTop;fields();
    });
    list.append(button);
  }
}
function field(label,key,placeholder=''){
  const wrap=document.createElement('label'); wrap.className='field'; wrap.textContent=label;
  const input=document.createElement('input'); input.type='text'; input.value=state.draft[key]??(['epsilon','dropStart','dropEnd'].includes(key)?'0':''); input.placeholder=placeholder; input.autocomplete='off';
  input.addEventListener('input',()=>{state.draft[key]=input.value;persist();preview();}); wrap.append(input); return wrap;
}
function source(label,key){
  const wrap=document.createElement('label'); wrap.className='field'; wrap.textContent=label;
  const select=document.createElement('select'); const empty=document.createElement('option'); empty.value='';empty.textContent='Select a curve';select.append(empty);
  for(const curve of state.curves){if(curve.id===state.draft.id)continue;const option=document.createElement('option');option.value=curve.id;option.textContent=curve.name;select.append(option);}
  select.value=state.draft[key]||'';select.addEventListener('change',()=>{state.draft[key]=select.value;persist();preview();});wrap.append(select);return wrap;
}
function formula(key,label){
  const button=document.createElement('button');button.className='formula';button.type='button';
  const title=document.createElement('b');title.textContent=label+' ='; const value=document.createElement('span');value.textContent=state.draft.formulas[key]?.code||'Click to build formula';button.append(title,value);
  button.onclick=()=>openFormula(key);return button;
}
function concatValues(curve){
 return curve.concatCount===undefined
  ? {count:'2',sources:[curve.source1||'',curve.source2||''],fractions:['0.5']}
  : {count:curve.concatCount,sources:curve.concatSources||[],fractions:curve.concatFractions||[]};
}
function updateConcat(curve){
 if(curve.concatCount===undefined){const values=concatValues(curve);curve.concatCount=values.count;curve.concatSources=values.sources;curve.concatFractions=values.fractions;}
 if(!Array.isArray(curve.concatSources))curve.concatSources=[];
 if(!Array.isArray(curve.concatFractions))curve.concatFractions=[];
}
function concatFields(area,curve){
 const countField=document.createElement('label');countField.className='field';countField.textContent='Number of curves · N';
 const count=document.createElement('input');count.type='number';count.min='2';count.step='1';count.value=concatValues(curve).count;count.autocomplete='off';countField.append(count);area.append(countField);
 const rows=document.createElement('div');area.append(rows);
 function renderRows(){
  rows.replaceChildren();const values=concatValues(curve), n=Number(values.count);
  if(!Number.isSafeInteger(n)||n<2)return;
  for(let i=0;i<n;i++){
   const row=document.createElement('div');row.className='concat-row'+(i===n-1?' concat-last':'');
   const label=document.createElement('label');label.className='field';label.textContent=`Curve ${i+1}`;
   const select=document.createElement('select'), empty=document.createElement('option');empty.value='';empty.textContent='Select a curve';select.append(empty);
   for(const item of state.curves){if(item.id===curve.id)continue;const option=document.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}
   select.value=values.sources[i]||'';
   select.addEventListener('change',()=>{updateConcat(curve);while(curve.concatSources.length<=i)curve.concatSources.push('');curve.concatSources[i]=select.value;persist();preview();});
   label.append(select);row.append(label);
   if(i<n-1){
    const timeLabel=document.createElement('label');timeLabel.className='field';timeLabel.textContent='Time fraction';
    const time=document.createElement('input');time.type='text';time.value=values.fractions[i]??'';time.autocomplete='off';time.inputMode='decimal';
    time.addEventListener('input',()=>{updateConcat(curve);while(curve.concatFractions.length<=i)curve.concatFractions.push('');curve.concatFractions[i]=time.value;persist();preview();});
    timeLabel.append(time);row.append(timeLabel);
   }
   rows.append(row);
  }
 }
 count.addEventListener('input',()=>{updateConcat(curve);curve.concatCount=count.value;persist();renderRows();preview();});
 renderRows();
}
let morphFrame=0;
function morphControl(curve,key,labelText,id){
 const wrap=document.createElement('div');wrap.className='field';
 const label=document.createElement('label');label.textContent=labelText;label.htmlFor=id;
 const row=document.createElement('div');row.className='morph-control';
 const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='1';slider.step='any';slider.setAttribute('aria-label',labelText);
 const text=document.createElement('input');text.type='text';text.id=id;text.inputMode='decimal';text.autocomplete='off';text.value=curve[key]??'0';
 function syncSlider(){try{const value=Curves.constant(text.value);if(value>=0&&value<=1)slider.value=String(value);}catch{}}
 text.addEventListener('input',()=>{curve[key]=text.value;syncSlider();persist();preview();});
 slider.addEventListener('input',()=>{curve[key]=slider.value;text.value=slider.value;persist();if(!morphFrame)morphFrame=requestAnimationFrame(()=>{morphFrame=0;preview();});});
 syncSlider();row.append(slider,text);wrap.append(label,row);return wrap;
}
function fields(){
  const area=$('#fields');area.replaceChildren();const d=state.draft;
  if(d.type==='equation'){
    const toggle=document.createElement('div');toggle.className='switch';for(const mode of ['cartesian','polar']){const b=document.createElement('button');b.textContent=mode[0].toUpperCase()+mode.slice(1);b.className=d.mode===mode?'active':'';b.onclick=()=>{d.mode=mode;persist();fields();preview();};toggle.append(b);}area.append(toggle);
    if(d.mode==='polar')area.append(formula('r','R'),formula('theta','θ'));else area.append(formula('x','x'),formula('y','y'));
    const hint=document.createElement('p');hint.className='hint';hint.textContent='Use the variable t for time, from 0 to 1. Angles are in radians.';area.append(hint);return;
  }
  if(d.type==='concat'){concatFields(area,d);return;}
  area.append(source(['splice','morph'].includes(d.type)?'First curve':'Curve','source1'));
  if(['splice','morph'].includes(d.type))area.append(source('Second curve','source2'));
  if(d.type==='translate'||d.type==='iterate') area.append(field('ΔX','dx'),field('ΔY','dy'));
  if(d.type==='rotate'||d.type==='iterate') area.append(field('α · radians','alpha','Math.PI / 2'));
  if(d.type==='scale')area.append(field('Scaling factor · F','factor'));
  if(d.type==='shift')area.append(field('Starting point · S','shiftStart'));
  if(d.type==='morph')area.append(morphControl(d,'morphFactor','Morph factor · f','morph-factor'),morphControl(d,'morphShift','Second curve shift · S','morph-shift'));
  if(d.type==='slice')area.append(field('Start · t','from'),field('End · t','to'));
  if(d.type==='iterate'||d.type==='splice')area.append(field(d.type==='splice'?'Number of segments · N (even)':'Number of copies · N','n'));
  if(d.type==='splice')area.append(field('Drop at start · t','dropStart'),field('Drop at end · t','dropEnd'),field('Joining time · ε (0 to 1/N)','epsilon'));
  if(d.type==='iterate'){const p=document.createElement('p');p.className='hint';p.textContent='Each copy is rotated around the origin, then translated from the previous copy. The first copy is the original.';area.append(p);}
}
function render(){
 $('#name').value=state.draft.name;$('#type').value=state.draft.type;$('#heading').textContent=state.draft.name||'New curve';$('#delete').hidden=!state.editing;library();fields();preview();
}
function preview(){
 const canvas=$('#canvas'),ctx=canvas.getContext('2d'),w=canvas.width;ctx.clearRect(0,0,w,w);ctx.fillStyle='#090c12';ctx.fillRect(0,0,w,w);
 ctx.lineWidth=1;for(let i=0;i<=10;i++){let v=i*w/10;ctx.strokeStyle=i===5?'#4a5a73':'#1a2534';ctx.beginPath();ctx.moveTo(v,0);ctx.lineTo(v,w);ctx.moveTo(0,v);ctx.lineTo(w,v);ctx.stroke();}
 try{
  const pieces=Curves.build(state.draft,id=>id===state.draft.id?state.draft:lookup(id));
  ctx.strokeStyle='#74e1c1';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
  for(const piece of pieces){ctx.beginPath();let started=false;const steps=Math.max(2,Math.ceil(1200*(piece.b-piece.a)));for(let i=0;i<=steps;i++) {const t=piece.a+(piece.b-piece.a)*i/steps;const [x,y]=piece.point(t);if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)){started=false;continue;} const px=(x+100)*w/200,py=(100-y)*w/200;if(started)ctx.lineTo(px,py);else {ctx.moveTo(px,py);started=true;}}ctx.stroke();}
  $('#error').textContent='';return true;
 }catch(e){$('#error').textContent=e.message;return false;}
}
function openFormula(key){slot=key;state.dialog=key;persist();$('#formula-title').textContent='Edit '+({x:'x',y:'y',r:'R',theta:'θ'}[key]);$('#formula-frame').src='/editor.html';$('#formula-dialog').showModal();}
window.CurvesEditor={
 load(){return state.draft.formulas[slot]?.state||{variables:[{id:'v1',name:'t',text:'0'}],nextVarId:2};},
 save(editor,result){if(!slot)return;state.draft.formulas[slot]={state:editor,code:result.code||'',message:result.message||''};persist();fields();preview();}
};
function closeFormula(){const frame=$('#formula-frame');try{frame.contentWindow.flushSave();}catch{} state.dialog=null;persist();$('#formula-dialog').close();frame.src='about:blank';slot=null;fields();preview();}
$('#close-formula').onclick=closeFormula;$('#formula-dialog').addEventListener('cancel',e=>{e.preventDefault();closeFormula();});
$('#name').addEventListener('keydown',e=>{if(e.key==='Enter' && !e.isComposing){e.preventDefault();$('#save').click();}});
$('#name').addEventListener('input',e=>{state.draft.name=e.target.value;$('#heading').textContent=e.target.value||'New curve';persist();});
$('#type').addEventListener('change',e=>{if(e.target.value==='morph' && state.draft.morphFactor===undefined)state.draft.morphFactor='0';if(e.target.value==='concat' && state.draft.concatCount===undefined){state.draft.concatCount='';state.draft.concatSources=[];state.draft.concatFractions=[];}state.draft.type=e.target.value;persist();fields();preview();});
$('#new').onclick=()=>{state.editing=null;state.draft=fresh();state.dialog=null;persist();render();};
$('#save').onclick=()=>{
 const name=state.draft.name.trim();if(!name){$('#error').textContent='Enter a curve name.';return;}if(state.curves.some(c=>c.name===name&&c.id!==state.draft.id)){$('#error').textContent='A curve with this name already exists.';return;}if(!preview())return;
 if(state.draft.type==='concat' && state.draft.concatCount!==undefined){const n=Number(state.draft.concatCount);state.draft.concatSources=state.draft.concatSources.slice(0,n);state.draft.concatFractions=state.draft.concatFractions.slice(0,n-1);}
 state.draft.name=name;const i=state.curves.findIndex(c=>c.id===state.draft.id);if(i<0)state.curves.push(structuredClone(state.draft));else state.curves[i]=structuredClone(state.draft);state.editing=state.draft.id;persist();render();
};
$('#delete').onclick=()=>{
 const users=state.curves.filter(c=>c.id!==state.editing&&CurveWorkspace.references(c).includes(state.editing));
 if(users.length){$('#error').textContent='Cannot delete: used by '+users.map(c=>c.name).join(', ')+'.';return;}
 if(!confirm('Delete “'+state.draft.name+'”?'))return;state.curves=state.curves.filter(c=>c.id!==state.editing);state.editing=null;state.draft=fresh();persist();render();
};
$('#export').onclick=()=>{
 const file=new Blob([JSON.stringify({format:'curves-workspace',version:1,workspace:state},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file), link=document.createElement('a');
 link.href=url;link.download='curves-workspace.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
};
let importedWorkspace=null;
function importChoice(title,message,choices){
 $('#import-title').textContent=title;$('#import-message').textContent=message;
 const options=$('#import-options');options.replaceChildren();
 for(const [label,action] of choices){const button=document.createElement('button');button.className='clear';button.type='button';button.textContent=label;button.onclick=action;options.append(button);}
 if(!$('#import-dialog').open)$('#import-dialog').showModal();
}
function applyImported(next){
 try{localStorage.setItem(KEY,JSON.stringify(next));}catch{alert('Could not save the imported workspace. Your current workspace has not been changed.');return;}
 state=next;importedWorkspace=null;if($('#import-dialog').open)$('#import-dialog').close();render();
 if(state.dialog && ['x','y','r','theta'].includes(state.dialog))openFormula(state.dialog);
}
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
 return value;
}
function hasUnsavedDraft(workspace){
 const saved=workspace.curves.find(curve=>curve.id===workspace.editing);
 const defaults={...fresh(),id:''};
 const current={...defaults,...workspace.draft,id:''}, baseline={...defaults,...(saved||{}),id:''};
 return JSON.stringify(stable(current))!==JSON.stringify(stable(baseline));
}
function workspaceIsEmpty(){return !state.curves.length && !hasUnsavedDraft(state);}
function completeMerge(mode,choice){
 try{
  const next=CurveWorkspace.merge(state,importedWorkspace,mode,choice,()=>fresh().id,hasUnsavedDraft(state));
  applyImported(next);
 }catch(error){alert('Could not merge workspace: '+(error.message||'Invalid file.'));}
}
function selectMergeDraft(mode){
 const ours=hasUnsavedDraft(state), theirs=hasUnsavedDraft(importedWorkspace);
 if(ours && theirs){importChoice('Choose the draft','Both workspaces have an unsaved draft. Choose which draft to keep open.',[
   ['Keep current draft',()=>completeMerge(mode,'current')],
   ['Use imported draft',()=>completeMerge(mode,'imported')],
 ]);return;}
 completeMerge(mode,theirs?'imported':'current');
}
function mergeImported(){
 const conflicts=CurveWorkspace.clashes(state,importedWorkspace);
 if(!conflicts.length){selectMergeDraft('rename');return;}
 importChoice('Curve names already exist','These imported names already exist: '+conflicts.join(', ')+'. Choose how to resolve them.',[
  ['Rename imported curves',()=>selectMergeDraft('rename')],
  ['Replace existing curves',()=>selectMergeDraft('clobber')],
 ]);
}
$('#import').onclick=()=>$('#import-file').click();
$('#import-cancel').onclick=()=>{importedWorkspace=null;$('#import-dialog').close();};
$('#import-dialog').addEventListener('cancel',()=>{importedWorkspace=null;});
$('#import-file').addEventListener('change',async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{importedWorkspace=CurveWorkspace.validate(JSON.parse(await file.text()));}
 catch(error){alert('Could not import workspace: '+(error.message||'Invalid file.'));return;}
 if(workspaceIsEmpty()){applyImported(importedWorkspace);return;}
 importChoice('Import workspace','The current workspace is not empty. Choose how to import the file.',[
  ['Replace workspace',()=>applyImported(importedWorkspace)],
  ['Merge workspaces',()=>mergeImported()],
 ]);
});
$('#clear').onclick=()=>{if(!confirm('Delete all curves and clear the workspace?'))return;state={curves:[],draft:fresh(),editing:null,dialog:null};persist();render();};
render();if(state.dialog&&['x','y','r','theta'].includes(state.dialog))openFormula(state.dialog);
