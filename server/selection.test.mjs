import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../extension/apply.js',import.meta.url),'utf8');
function fixture(multiple=false){
 const nodes=[0,1].map(()=>({isConnected:true,disabled:false,checked:false,getAttribute:()=>null,matches:()=>true,click(){if(!multiple)nodes.forEach(n=>n.checked=false);this.checked=!this.checked;}}));
 const state={url:'https://example.test',questions:[{id:'q0',multiple,options:[{id:'a0'},{id:'a1'}]}],refs:new Map(nodes.map((el,i)=>['a'+i,{el}]))};
 const context=vm.createContext({location:{href:state.url},__pageAnswerHelper:state});vm.runInContext(code,context);
 return {nodes,state,apply:context.__pageAnswerApply,context};
}
test('selects radio and clears previous selection',async()=>{const {nodes,apply}=fixture();nodes[0].checked=true;assert.equal((await apply([{questionId:'q0',optionIds:['a1']}])).ok,true);assert.equal(nodes[0].checked,false);assert.equal(nodes[1].checked,true);});
test('checkbox selection clears incorrect checked options',async()=>{const {nodes,apply}=fixture(true);nodes[0].checked=true;assert.equal((await apply([{questionId:'q0',optionIds:['a1']}])).ok,true);assert.equal(nodes[0].checked,false);assert.equal(nodes[1].checked,true);});
test('stops if page or controls changed',async()=>{const {nodes,apply,context}=fixture();nodes[0].isConnected=false;assert.ok((await apply([{questionId:'q0',optionIds:['a1']}])).error);assert.equal(nodes[1].checked,false);context.location.href='https://other.test';assert.ok((await apply([])).error);});
test('does not report success when click failed',async()=>{const {nodes,apply}=fixture();nodes[1].click=()=>{};assert.ok((await apply([{questionId:'q0',optionIds:['a1']}])).error);});
