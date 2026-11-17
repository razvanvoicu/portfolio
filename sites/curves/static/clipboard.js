'use strict';
const CurveClipboard=(()=>{
 async function copy(field,clipboard,doc){
  if(clipboard && typeof clipboard.writeText==='function'){
   try{await clipboard.writeText(field.value);return;}catch{}
  }
  field.focus();field.select();
  if(!doc.execCommand('copy'))throw new Error('Copy failed.');
 }
 return {copy};
})();
if(typeof module!=='undefined')module.exports=CurveClipboard;
