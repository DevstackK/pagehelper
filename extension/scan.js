(() => {
  const chunks = [];
  const roots = [];
  let blockedFrames = 0;
  const adText=/stop seeing this ad|why this ad\?|ad was inappropriate|ad covered content|not interested in this ad|ads by google/i;
  const excluded=el=>Boolean(el.closest?.('ins.adsbygoogle,[id^="google_ads"],[id^="aswift"],[data-ad-slot],[data-ad-client],.adsbygoogle,[aria-label="Advertisement"],[aria-label="Advertisements"],[id*="Cookiebot"],[class*="Cookiebot"]'));
  const visible=el=>{
    if(excluded(el)||!el.getClientRects().length)return false;
    for(let current=el;current;current=current.parentElement||current.getRootNode()?.host){
      const style=current.ownerDocument.defaultView.getComputedStyle(current);
      if(current.hidden||current.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;
    }
    return true;
  };
  const discover = root => {
    roots.push(root);
    for(const el of root.querySelectorAll('*')) {
      if(excluded(el))continue;
      if(el.shadowRoot)discover(el.shadowRoot);
      if(el.tagName==='IFRAME' || el.tagName==='FRAME') {
        if(!visible(el)||/google_ads|doubleclick|googlesyndication|adservice|adsystem|advertisement/i.test([el.id,el.src,el.title].join(' ')))continue;
        try { const doc=el.contentDocument; if(doc?.body)discover(doc);else blockedFrames++; }
        catch { blockedFrames++; }
      }
    }
  };
  discover(document);
  let remaining = 40000;
  const visit = root => {
    for (const el of root.children || []) {
      if (!remaining) break;
      if(excluded(el))continue;
      if (['SCRIPT','STYLE','NOSCRIPT','INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable) continue;
      const style = getComputedStyle(el);
      if (el.hidden || el.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && el.getClientRects().length) {
          const text = node.textContent.trim().slice(0, remaining);
          chunks.push(text); remaining -= text.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) visit({children:[node]});
      }
    }
  };
  for(const root of roots)visit(root.body?{children:[root.body]}:root);
  const controls = roots.flatMap(root=>[...root.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],button[aria-pressed]')])
    .filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !excluded(el) && (visible(el) || [...(el.labels || [])].some(visible)));
  const groups = new Map();
  const namedKeys = new Map();
  const refs = new Map();
  const label = el => {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return (el.getAttribute('aria-label') || ids.map(id => (el.getRootNode().getElementById?.(id) || el.ownerDocument.getElementById(id))?.innerText || '').join(' ') || [...(el.labels || [])].map(l=>l.innerText).join(' ') || el.innerText || el.closest('label')?.innerText || el.parentElement?.querySelector('label,.answer-text,.option-text')?.innerText || (el.parentElement?.querySelectorAll('input,[role=radio],[role=checkbox]').length===1?el.parentElement.innerText:'') || '').trim();
  };
  controls.forEach((el, index) => {
    const container = el.closest('fieldset,[role="radiogroup"],[role="group"],.question,[data-question]') || el.parentElement?.parentElement;
    let key=container;
    if(el.name){
      const scope=el.form||el.getRootNode();
      if(!namedKeys.has(scope))namedKeys.set(scope,new Map());
      const names=namedKeys.get(scope);
      if(!names.has(el.name))names.set(el.name,{});
      key=names.get(el.name);
    }
    if (!key || adText.test(container?.innerText||'')) return;
    if (!groups.has(key)) groups.set(key,{id:`q${groups.size}`,question:(container?.innerText || '').slice(0,5000),multiple:el.type==='checkbox'||el.getAttribute('role')==='checkbox'||container?.getAttribute('aria-multiselectable')==='true',options:[]});
    const text = label(el); if (!text || adText.test(text)) return;
    const id = `a${index}`;
    refs.set(id,{el,label:text}); groups.get(key).options.push({id,text});
  });
  const questions = [...groups.values()].filter(g=>g.options.length>=2);
  const selects=roots.flatMap(root=>[...root.querySelectorAll('select')]).filter(el=>visible(el)&&!el.disabled&&!el.closest('nav,header,footer,[role="navigation"],[role="search"]'));
  for(const el of selects){
    const container=el.closest('.watu-question,.watupro-question,.question,[data-question],fieldset')||el.closest('p,li')||el.parentElement;
    if(!container || adText.test(container.innerText||''))continue;
    const text=(container.innerText||'').trim();
    // Exclude ordinary settings, locale, search and sorting dropdowns.
    const quizLike=el.matches('.watupro-gap,.answer')||Boolean(el.closest('.watu-question,.watupro-question,.question,[data-question],fieldset,[class*="quiz"],[id*="quiz"]'))||/\?|_{2,}|choose|complete|fill|select.*correct/i.test(text);
    if(!quizLike)continue;
    const clone=container.cloneNode(true);
    const siblings=[...container.querySelectorAll('select')];
    clone.querySelectorAll('select').forEach((select,index)=>select.replaceWith(`[blank ${index+1}]`));
    clone.querySelectorAll('input,textarea,script,style').forEach(node=>node.remove());
    const questionText=(clone.textContent||'').replace(/\s+/g,' ').trim();
    const options=[];
    for(const [index,option] of [...el.options].entries()){
      const text=(option.textContent||'').trim();
      if(option.disabled||option.hidden||!text||/^(?:[-–—\s]*|select(?: an? (?:answer|option))?|choose(?: an? (?:answer|option))?|please select)[. …-]*$/i.test(text))continue;
      const id=`s${selects.indexOf(el)}o${index}`;
      options.push({id,text});refs.set(id,{el,kind:'select',optionIndex:index,label:text});
    }
    if(options.length<2)continue;
    const id=`q${groups.size+selects.indexOf(el)}`;
    questions.push({id,question:`${questionText} — Answer blank ${siblings.indexOf(el)+1}.`,multiple:el.multiple,kind:'select',options});
  }
  const textFields=roots.flatMap(root=>[...root.querySelectorAll('input[type="text"],input:not([type]),textarea')]).filter(el=>visible(el)&&!el.disabled&&!el.readOnly&&!el.closest('nav,header,footer,[role="navigation"],[role="search"]'));
  let textCount=0;
  for(const el of textFields){
    // Require quiz-specific context; never treat a site search box as an answer.
    if(!el.matches('.watupro-gap,.answer')&&!el.closest('.watu-question,.watupro-question,.question,[data-question],[class*="quiz"],[id*="quiz"]'))continue;
    const container=el.closest('.watu-question,.watupro-question,.question,[data-question],fieldset')||el.closest('p,li')||el.parentElement;
    if(!container||adText.test(container.innerText||''))continue;
    const blankSelector='select,input[type="text"],input:not([type]),textarea';
    const siblings=[...container.querySelectorAll(blankSelector)];
    const clone=container.cloneNode(true);
    clone.querySelectorAll(blankSelector).forEach((field,index)=>field.replaceWith(`[blank ${index+1}]`));
    clone.querySelectorAll('input,script,style').forEach(node=>node.remove());
    const context=(clone.textContent||'').replace(/\s+/g,' ').trim();
    const id=`t${textCount++}`;
    const maxLength=el.maxLength>0?Math.min(el.maxLength,4000):4000;
    questions.push({id,kind:'text',question:`${context} — Fill only blank ${siblings.indexOf(el)+1}; do not repeat text outside the blank.`,multiple:false,options:[],maxLength});
    refs.set(id,{el,kind:'text'});
  }
  globalThis.__pageAnswerHelper = {refs,questions,url:location.href};
  const diagnostics=roots.flatMap(root=>[...root.querySelectorAll('input,button,[role],select,textarea,canvas,a[href]')]).slice(0,100).map(el=>({tag:el.tagName,type:el.getAttribute('type'),role:el.getAttribute('role'),className:typeof el.className==='string'?el.className.slice(0,200):'',text:el.tagName==='INPUT'&&['button','submit'].includes(el.type)?el.value:['INPUT','TEXTAREA','SELECT'].includes(el.tagName)?'':(el.innerText||el.getAttribute('aria-label')||'').slice(0,240),visible:Boolean(el.getClientRects().length),disabled:Boolean(el.disabled)}));
  return {diagnostics,title:document.title,text:chunks.join('\n'),frames:roots.reduce((n,r)=>n+r.querySelectorAll('iframe,frame').length,0),blockedFrames,controlCount:controls.length+selects.length+textCount,questions};
})();
