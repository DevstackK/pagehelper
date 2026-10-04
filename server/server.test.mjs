import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,validateSelections} from './server.mjs';
const questions=[{id:'q0',question:'2 + 2?',multiple:false,options:[{id:'a0',text:'4'},{id:'a1',text:'5'}]}];
async function setup(t,fetchImpl=async()=>Response.json({choices:[{message:{content:'4'}}]}),config={}){
 const server=createServer({token:'test-secret',endpoint:'https://example.invalid',model:'test',fetchImpl,...config});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 return async(body={text:'2 + 2?'},headers={})=>fetch(`http://127.0.0.1:${server.address().port}/answer`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-secret',...headers},body:JSON.stringify(body)});
}
test('returns answer, sends page as data',async t=>{
 const request=await setup(t,async(url,opts)=>{const data=JSON.parse(opts.body);assert.equal(JSON.parse(data.messages[1].content).pageText,'2 + 2?');return Response.json({choices:[{message:{content:'4'}}]});});
 const res=await request();assert.equal(res.status,200);assert.deepEqual(await res.json(),{answer:'4'});
});
test('rejects invalid token',async t=>{const request=await setup(t);assert.equal((await request(undefined,{Authorization:'Bearer wrong'})).status,401);});
test('rejects ordinary website origin',async t=>{const request=await setup(t);assert.equal((await request(undefined,{Origin:'https://attacker.example'})).status,403);});
test('allows extension origin',async t=>{const request=await setup(t);const origin='chrome-extension://'+'a'.repeat(32);const res=await request(undefined,{Origin:origin});assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),origin);});
test('validates input size and shape',async t=>{const request=await setup(t);for(const body of [{text:''},{text:4},{text:'a'.repeat(50001)},{text:'abc',question:42},{text:'abc',mode:'select',questions:[]}])assert.equal((await request(body)).status,400);});
test('handles upstream errors without exposing upstream body',async t=>{const request=await setup(t,async()=>new Response('secret',{status:401}));const res=await request();assert.equal(res.status,502);assert.ok(!(await res.text()).includes('secret'));});
test('accepts valid selections',async t=>{const request=await setup(t,async()=>Response.json({choices:[{message:{content:JSON.stringify({selections:[{questionId:'q0',optionIds:['a0']}]})}}]}));const res=await request({text:'2+2?',mode:'select',questions});assert.equal(res.status,200);assert.deepEqual((await res.json()).selections,[{questionId:'q0',optionIds:['a0']}]);});
test('rejects uncertain or invented selections',async t=>{for(const value of [{selections:[]},{selections:[{questionId:'q0',optionIds:['a99']}]},{selections:[{questionId:'q0',optionIds:['a0','a1']}]}])assert.throws(()=>validateSelections(value,questions));const request=await setup(t,async()=>Response.json({choices:[{message:{content:'{"selections":[]}'}}]}));assert.equal((await request({text:'test',mode:'select',questions})).status,422);});

test('Claude uses Messages API headers and top-level system prompt',async t=>{
 const request=await setup(t,async(url,opts)=>{
  const body=JSON.parse(opts.body);
  assert.equal(opts.headers['x-api-key'],'test-anthropic-key');
  assert.equal(opts.headers['anthropic-version'],'2023-06-01');
  assert.equal(opts.headers.Authorization,undefined);
  assert.equal(body.max_tokens,4096);assert.equal(typeof body.system,'string');
  assert.equal(body.messages.length,1);assert.equal(body.messages[0].role,'user');
  assert.equal(JSON.parse(body.messages[0].content).pageText,'2 + 2?');
  return Response.json({stop_reason:'end_turn',content:[{type:'thinking',thinking:'not an answer'},{type:'text',text:'4'}]});
 },{provider:'anthropic',apiKey:'test-anthropic-key'});
 assert.deepEqual(await (await request()).json(),{answer:'4'});
});
test('Claude selections work with automatic mode',async t=>{
 const selections=[{questionId:'q0',optionIds:['a0']}];
 const request=await setup(t,async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({selections})}]}),{provider:'anthropic',apiKey:'test-key'});
 const res=await request({text:'2+2?',mode:'select',questions});assert.equal(res.status,200);assert.deepEqual(await res.json(),{selections});
});
test('Claude rejects truncated answers',async t=>{
 const request=await setup(t,async()=>Response.json({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]}),{provider:'anthropic',apiKey:'test-key'});
 assert.equal((await request()).status,502);
});
test('Claude requires a key and rejects unsupported providers',()=>{
 assert.throws(()=>createServer({provider:'anthropic'}),/ANTHROPIC_API_KEY/);
 assert.throws(()=>createServer({provider:'unknown'}),/AI_PROVIDER/);
});
