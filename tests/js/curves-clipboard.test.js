const {test}=require('node:test');
const assert=require('node:assert/strict');
const Clipboard=require('../../sites/curves/static/clipboard.js');
test('copies through the Clipboard API when available',async()=>{
 const writes=[];await Clipboard.copy({value:'[t, t]'}, {writeText:async text=>writes.push(text)}, {});
 assert.deepEqual(writes,['[t, t]']);
});
test('copies the selected dialog field when the Clipboard API is absent or rejected',async()=>{
 for(const clipboard of [undefined,{writeText:async()=>{throw new Error('denied');}}]){
  const calls=[],field={value:'[t, 0]',focus:()=>calls.push('focus'),select:()=>calls.push('select')};
  await Clipboard.copy(field,clipboard,{execCommand:command=>(calls.push(command),true)});
  assert.deepEqual(calls,['focus','select','copy']);
 }
});
test('reports a failed browser copy',async()=>{
 await assert.rejects(Clipboard.copy({focus(){},select(){}},undefined,{execCommand:()=>false}),/Copy failed/);
});
