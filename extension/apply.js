globalThis.__pageAnswerApply = async selections => {
  const state=globalThis.__pageAnswerHelper;
  if(!state || state.url!==location.href)return {error:'The page changed. Scan again.'};
  const selected=new Set(selections.flatMap(s=>s.optionIds||[]));
  for(const group of state.questions){
    const answer=selections.find(s=>s.questionId===group.id);
    if(group.kind==='text'){
      const el=state.refs.get(group.id)?.el;
      if(!el?.isConnected||el.disabled||el.readOnly||typeof answer?.text!=='string'||!answer.text.trim()||answer.text.length>group.maxLength)return {error:'The text answer or its field is invalid.'};
      continue;
    }
    if(!answer || !answer.optionIds?.length || (!group.multiple && answer.optionIds.length!==1))return {error:'An answer could not be determined.'};
    for(const option of group.options){
      const ref=state.refs.get(option.id);
      if(!ref?.el.isConnected || ref.el.disabled || ref.el.getAttribute('aria-disabled')==='true')return {error:'The question controls changed.'};
    }
  }
  for(const group of state.questions){
    if(group.kind==='text'){
      const el=state.refs.get(group.id).el;
      if(!el.isConnected)return {error:'The answer field changed.'};
      const value=selections.find(s=>s.questionId===group.id).text;
      const win=el.ownerDocument.defaultView;
      const prototype=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);
      el.dispatchEvent(new win.Event('input',{bubbles:true}));
      el.dispatchEvent(new win.Event('change',{bubbles:true}));
      continue;
    }
    if(group.kind==='select'){
      const selectedOptions=group.options.filter(option=>selected.has(option.id)).map(option=>state.refs.get(option.id));
      const el=state.refs.get(group.options[0].id).el;
      if(!el.isConnected)return {error:'The dropdown changed while selecting answers.'};
      if(el.multiple){
        const wanted=new Set(selectedOptions.map(ref=>ref.optionIndex));
        for(const [index,option] of [...el.options].entries())option.selected=wanted.has(index);
      }else{
        const setter=Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLSelectElement.prototype,'selectedIndex').set;
        setter.call(el,selectedOptions[0].optionIndex);
      }
      const EventType=el.ownerDocument.defaultView.Event;
      el.dispatchEvent(new EventType('input',{bubbles:true}));
      el.dispatchEvent(new EventType('change',{bubbles:true}));
      continue;
    }
    for(const option of group.options){
      const el=state.refs.get(option.id).el;
      if(!el.isConnected)return {error:'The page changed while selecting answers.'};
      const ref=state.refs.get(option.id);
    const checked=group.kind==='select'?Boolean(el.options[ref.optionIndex]?.selected):el.matches('input')?el.checked:(el.getAttribute('aria-checked')==='true'||el.getAttribute('aria-pressed')==='true');
      const want=selected.has(option.id);
      if(checked!==want && (group.multiple || want))el.click();
    }
  }
  for(const group of state.questions){
    if(group.kind==='text'){
      const el=state.refs.get(group.id).el;
      if(!el.isConnected||el.value!==selections.find(s=>s.questionId===group.id).text)return {error:'Could not verify the filled answer.'};
      continue;
    }
    for(const option of group.options){
    const el=state.refs.get(option.id).el;
    const ref=state.refs.get(option.id);
    const checked=group.kind==='select'?Boolean(el.options[ref.optionIndex]?.selected):el.matches('input')?el.checked:(el.getAttribute('aria-checked')==='true'||el.getAttribute('aria-pressed')==='true');
    if(!el.isConnected||checked!==selected.has(option.id))return {error:'Could not verify that the answers were selected.'};
  }
  }
  return {ok:true};
};
