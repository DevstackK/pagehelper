async function requestSiteAccess(tab){
  if(!tab?.id || !tab.url)throw new Error('Open the training website and click the extension icon on that tab.');
  const url=new URL(tab.url);
  if(!['https:','http:'].includes(url.protocol))throw new Error('Open a regular training website; browser settings and new-tab pages cannot be scanned.');
  const topOrigin=`${url.protocol}//${url.hostname}/*`;
  const topGranted=await chrome.permissions.request({origins:[topOrigin]});
  if(!topGranted)throw new Error('Allow access to the training website to continue.');
  const [main]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},files:['scan.js']});
  if(main?.result?.questions?.length)return;
  const frames=await trainingFrames(tab.id);
  const origins=[...new Set([url.href,...frames.map(frame=>frame.url)].filter(value=>/^https?:/.test(value)).map(value=>{const u=new URL(value);return `${u.protocol}//${u.hostname}/*`;}))];
  const granted=await chrome.permissions.request({origins});
  if(!granted)throw new Error('Site access was not granted. Click again and allow access to this training website.');
}
const $ = id => document.getElementById(id);
let controller;
let generation = 0;
const status = text => $('status').textContent = text;
chrome.storage.session.get('token').then(v => $('token').value = v.token || '');
$('save').onclick = async () => {await chrome.storage.session.set({token:$('token').value.trim()});status('Connection saved for this browser session.');};
function reset() { generation++; controller?.abort(); $('result').textContent=''; $('result-section').hidden=true; }
$('clear').onclick = () => {reset();$('content').value='';$('question').value='';$('source').textContent='No page scanned yet';status('Cleared.');};
$('scan').onclick = async () => {
  reset(); $('scan').disabled=true; status('Reading page text…');
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    await requestSiteAccess(tab);
    const {chosen,attempts}=await scanTrainingTab(tab.id);
    const page=chosen?.result;
    if (!page?.text) throw new Error('No readable text found. Paste the lesson or question below.');
    $('content').value=page.text; $('source').textContent=page.title || 'Current page';
    status(`Scanned ${attempts.filter(a=>a.result).length} frame(s). Found ${page.questions.length} question(s) and ${page.controlCount} choice controls. ${attempts.some(a=>a.error)?'Some frames could not be read. Save a debug report.':''}`);
  } catch(e) {status('Cannot scan this page. Click the extension icon on the target tab and try again, or paste the text below. ' + e.message);}
  finally {$('scan').disabled=false;}
};
$('answer').onclick = async () => {
  const text=$('content').value.trim(), token=$('token').value.trim();
  if(!text) return status('Scan a page or paste its text first.');
  if(!token) return status('Start the local server and paste its pairing token in Connection settings.');
  reset(); const run=generation; controller=new AbortController();
  const timer=setTimeout(()=>controller?.abort(),125000);
  $('answer').disabled=true; status('Finding questions and preparing explanations…');
  try {
    const response=await fetch('http://127.0.0.1:4319/answer',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text,question:$('question').value.trim()}),signal:controller.signal});
    const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Request failed.');
    if(run!==generation) return;
    $('result').textContent=data.answer; $('result-section').hidden=false; status('Answers ready.');
  } catch(e) {if(run===generation) status(e.name==='AbortError'?'Request timed out. Try again with less text.':`Unable to get answers: ${e.message}. Check that the server is running.`);}
  finally {clearTimeout(timer);$('answer').disabled=false;}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('result').textContent);status('Answers copied.');}catch{status('Could not copy. Select the answer text and copy manually.');}};

let autoStopped=true;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
$('stop').onclick=()=>{autoStopped=true;controller?.abort();status('Stopped.');};
async function navigateExercise(tabId,frameId,phase){
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});
  if(autoStopped)return {action:'stopped'};
  if(active?.id!==tabId)throw new Error('The active tab changed.');
  const target={tabId,frameIds:[frameId]};
  await chrome.scripting.executeScript({target,func:value=>{globalThis.__pageAnswerNavigationPhase=value;},args:[phase]});
  if(autoStopped)return {action:'stopped'};
  const [result]=await chrome.scripting.executeScript({target,files:['next.js']});
  return result.result;
}
async function waitForNewQuestions(tabId,previous){
  let lastError;
  for(let attempt=0;attempt<20&&!autoStopped;attempt++){
    await delay(600);
    const [active]=await chrome.tabs.query({active:true,currentWindow:true});
    if(active?.id!==tabId)throw new Error('The active tab changed.');
    try{
      const {chosen}=await scanTrainingTab(tabId);
      if(chosen?.result?.questions?.length&&JSON.stringify(chosen.result.questions)!==previous)return true;
    }catch(error){lastError=error;}
  }
  if(autoStopped)return false;
  throw new Error(lastError?`Next page could not be read: ${lastError.message}`:'The next exercise has not loaded supported questions. Save a debug report if it is visible.');
}
$('auto').onclick=async()=>{
  const token=$('token').value.trim();
  if(!token)return status('Enter the server pairing token in Connection settings first.');
  autoStopped=false; $('auto').disabled=true;$('scan').disabled=true;$('answer').disabled=true;$('stop').hidden=false;$('clear').disabled=true;$('debug').disabled=true;
  let previous='';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    await requestSiteAccess(tab);
    for(let step=0;step<50&&!autoStopped;step++){
      const [active]=await chrome.tabs.query({active:true,currentWindow:true});
      if(active?.id!==tab?.id)throw new Error('The active tab changed.');
      status('Scanning question…');
      const {chosen:scan,attempts}=await scanTrainingTab(tab.id);
      const page=scan?.result;
      if(!scan)throw new Error('No readable frames. Click Save debug report to inspect page access.');
      const questionTarget={tabId:tab.id,documentIds:[scan.documentId]};
      $('content').value=page?.text||'';$('source').textContent=page?.title||'Current page';
      if(!page?.questions?.length)throw new Error(page?.blockedFrames
        ? 'No question detected in accessible frames. Click Save debug report so the lesson structure can be checked.'
        : `Found ${page?.controlCount||0} choice controls, but no complete question. Open a question page, or click Save debug report so its format can be checked.`);
      const fingerprint=JSON.stringify(page.questions);
      if(fingerprint===previous)throw new Error('The question has not changed.');
      previous=fingerprint;
      $('content').value=page.text;$('source').textContent=page.title;
      status(`Found ${page.questions.length} question(s). Asking Claude…`);
      controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),125000);
      let response;
      try{response=await fetch('http://127.0.0.1:4319/answer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({text:page.text,mode:'select',questions:page.questions}),signal:controller.signal});}finally{clearTimeout(timer);}
      const data=await response.json();if(!response.ok)throw new Error(data.error||'AI request failed');
      if(autoStopped)break;
      const [now]=await chrome.tabs.query({active:true,currentWindow:true});
      if(now?.id!==tab.id)throw new Error('The active tab changed.');
      const [fresh]=await chrome.scripting.executeScript({target:questionTarget,files:['scan.js']});
      if(JSON.stringify(fresh.result?.questions)!==fingerprint)throw new Error('The questions changed during analysis.');
      if(autoStopped)break;
      status('Answer received. Selecting choices…');
      await chrome.scripting.executeScript({target:questionTarget,files:['apply.js']});
      // apply.js installs an isolated-world function; no page code receives the model response.
      const [result]=await chrome.scripting.executeScript({target:questionTarget,func:(selections)=>globalThis.__pageAnswerApply(selections),args:[data.selections]});
      if(result.result?.error)throw new Error(result.result.error);
      if(autoStopped)break;
      await delay(350);
      if(autoStopped)break;
      const [beforeNext]=await chrome.tabs.query({active:true,currentWindow:true});
      if(beforeNext?.id!==tab.id)throw new Error('The active tab changed.');
      if(autoStopped)break;
      let navigation=await navigateExercise(tab.id,scan.frameId,'after-fill');
      if(navigation.action==='check'){
        status('Answers filled. Checking results…');
        for(let attempt=0;attempt<25&&!autoStopped;attempt++){
          await delay(600);
          navigation=await navigateExercise(tab.id,scan.frameId,'after-check');
          if(navigation.action!=='waiting')break;
        }
      }
      if(autoStopped||navigation.action==='stopped')break;
      if(navigation.action!=='next'){
        status(navigation.reason||'Answers checked. No next exercise found.');break;
      }
      status('Opened the next exercise.');
      if(!$('keep-going').checked)break;
      status('Waiting for the next exercise to load…');
      if(!await waitForNewQuestions(tab.id,fingerprint))break;
      if(step===49)status('Stopped after 50 pages. Click Answer & move on to continue.');
    }
  }catch(e){status(autoStopped?'Stopped.':`Stopped: ${e.message}`);}
  finally{autoStopped=true;$('auto').disabled=false;$('scan').disabled=false;$('answer').disabled=false;$('stop').hidden=true;$('clear').disabled=false;$('debug').disabled=false;}
};

$('debug').onclick=async()=>{
  $('debug').disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    await requestSiteAccess(tab);
    const {attempts}=await scanTrainingTab(tab.id);
    const report={version:chrome.runtime.getManifest().version,time:new Date().toISOString(),frames:attempts.map(a=>({frameId:a.frameId,origin:a.origin,error:a.error,...(a.result?{title:a.result.title,questions:a.result.questions,controlCount:a.result.controlCount,blockedFrames:a.result.blockedFrames,diagnostics:a.result.diagnostics}:{})}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='page-answer-helper-debug.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    status('Debug report saved to Downloads. Send page-answer-helper-debug.json so detection can be checked.');
  }catch(e){status(`Debug report failed: ${e.message}`);}
  finally{$('debug').disabled=false;}
};
