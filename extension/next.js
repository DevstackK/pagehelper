(() => {
  const phase=globalThis.__pageAnswerNavigationPhase||'after-fill';
  const roots=[];
  const visible=el=>{
    if(!el?.isConnected||!el.getClientRects().length)return false;
    for(let node=el;node;node=node.parentElement||node.getRootNode()?.host){
      const style=node.ownerDocument.defaultView.getComputedStyle(node);
      if(node.hidden||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;
    }
    return true;
  };
  const discover=root=>{roots.push(root);for(const el of root.querySelectorAll('*')){if(el.shadowRoot)discover(el.shadowRoot);if(el.tagName==='IFRAME'||el.tagName==='FRAME'){try{if(visible(el)&&el.contentDocument?.body)discover(el.contentDocument);}catch{}}}};
  discover(document);
  const all=roots.flatMap(root=>[...root.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]')]);
  const enabled=el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true';
  const label=el=>(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ');
  const checks=all.filter(el=>enabled(el)&&/^(check answers|check my answers)$/i.test(label(el)));
  const next=all.filter(el=>enabled(el)&&/^(next|continue|next question|next page|next exercise|proceed)\s*[→›»>]?$|^[→›»>]\s*(next|next exercise)$/i.test(label(el)));
  const results=()=>roots.map(root=>(root.body||root).textContent||'').join('\n').match(/(?:you (?:have )?scored|your (?:score|result)|\b\d+\s*(?:out of|\/)\s*\d+\b|\b\d+\s*%)[^\n]{0,80}/gi)?.join('\n')||'';
  if(phase==='after-fill'&&checks.length){
    if(checks.length!==1)return {action:'blocked',reason:'More than one Check answers button is visible.'};
    globalThis.__pageAnswerNavigation={check:checks[0],beforeResults:results(),started:Date.now()};
    checks[0].click();return {action:'check',label:'Check answers'};
  }
  if(phase==='after-check'){
    const state=globalThis.__pageAnswerNavigation;
    // Do not skip the exercise while answer checking is still in flight.
    const changedResults=Boolean(results())&&(!state||results()!==state.beforeResults);
    const checkFinished=state&&!visible(state.check)&&!checks.length;
    if(!changedResults&&!checkFinished)return {action:'waiting',reason:'Waiting for checked answers.'};
  }
  if(next.length===1){const text=label(next[0]);next[0].click();return {action:'next',label:text};}
  if(next.length>1)return {action:'blocked',reason:'More than one Next button is visible.'};
  // A numbered exercise link must advance exactly one page within this lesson.
  const candidates=[];
  for(const root of roots){
    const doc=root.ownerDocument||root;
    let current;try{current=new URL(doc.location.href);}catch{continue;}
    const path=current.pathname.replace(/\/+$/,'');
    const match=path.match(/^(.*)\/(\d+)$/);
    const page=match?Number(match[2]):1;
    const base=match?match[1]:path;
    for(const link of root.querySelectorAll('a[href]')){
      if(!enabled(link))continue;
      let target;try{target=new URL(link.href,doc.location.href);}catch{continue;}
      if(target.origin!==current.origin||target.search!==current.search)continue;
      const targetPath=target.pathname.replace(/\/+$/,'');
      if(targetPath!==`${base}/${page+1}`)continue;
      if(!new RegExp(`^(?:exercise\\s*)?${page+1}$`,'i').test(label(link))&&!/\bnext\b/i.test(label(link))&&!link.relList.contains('next'))continue;
      candidates.push(link);
    }
  }
  const destinations=new Set(candidates.map(link=>link.href));
  if(destinations.size===1){const link=candidates[0];const text=label(link);link.click();return {action:'next',label:`Exercise ${text}`};}
  return {action:'blocked',reason:destinations.size>1?'Multiple next-exercise destinations found.':'No next exercise link or Next button found. This may be the final exercise.'};
})();
