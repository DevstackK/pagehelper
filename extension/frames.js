async function trainingFrames(tabId){
  const frames=await chrome.webNavigation.getAllFrames({tabId});
  const adDomains=/(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|openx\.net|pubmatic\.com|rubiconproject\.com|smartadserver\.com|seedtag\.com|gumgum\.com|adsrvr\.org|omnitagjs\.com|a-mo\.net|casalemedia\.com|openwebmp\.com|onetag-sys\.com|360yield\.com|apester\.com|cookiebot\.com|aniview\.com)$/i;
  const excluded=new Set();
  for(const frame of frames||[])if(frame.frameId!==0&&/^https?:/.test(frame.url)&&adDomains.test(new URL(frame.url).hostname))excluded.add(frame.frameId);
  for(let changed=true;changed;){changed=false;for(const frame of frames||[])if(excluded.has(frame.parentFrameId)&&!excluded.has(frame.frameId)){excluded.add(frame.frameId);changed=true;}}
  return (frames||[]).filter(frame=>!excluded.has(frame.frameId)).filter(frame=>/^https?:/.test(frame.url)||frame.url==='about:blank'||frame.url==='about:srcdoc');
}
async function scanTrainingTab(tabId){
  // Most quizzes live in the main document. Do not scan unrelated ad frames
  // once the main page provides usable questions.
  try{
    const [main]=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['scan.js']});
    if(main?.result?.questions?.length)return {chosen:main,attempts:[main]};
  }catch{}
  const frames=await trainingFrames(tabId);
  const attempts=await Promise.all(frames.map(async frame=>{
    try{
      const [scan]=await chrome.scripting.executeScript({target:{tabId,frameIds:[frame.frameId]},files:['scan.js']});
      return {...scan,origin:/^https?:/.test(frame.url)?new URL(frame.url).origin:frame.url};
    }catch(error){return {frameId:frame.frameId,origin:/^https?:/.test(frame.url)?new URL(frame.url).origin:frame.url,error:error.message};}
  }));
  const readable=attempts.filter(scan=>scan.result);
  // Prefer the main document when it includes its accessible child questions.
  const chosen=readable.find(scan=>scan.frameId===0&&scan.result.questions.length)||readable.find(scan=>scan.result.questions.length)||readable.find(scan=>scan.frameId===0)||readable[0];
  return {chosen,attempts};
}
