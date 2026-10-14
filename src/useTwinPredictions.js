import { useEffect, useRef, useState } from 'react';
import { buildPredictionRequest, validatePrediction } from './twinData.js';

export default function useTwinPredictions(series, time, model, enabled) {
  const [entries,setEntries]=useState({});
  const [loading,setLoading]=useState(false);
  const revision=useRef(0);
  const eligible=series.records.filter(r=>Date.parse(r.observed_at)<=time);
  const next=enabled ? eligible.find(r=>!entries[r.observed_at])?.observed_at : null;
  useEffect(()=>{
    if(!next){setLoading(false);return;}
    const generation=++revision.current, controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    const request=buildPredictionRequest(series,next,model);
    setLoading(true);
    (async()=>{
      try {
        const response=await fetch(`${model.url.replace(/\/$/,'')}/api/v2/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal,cache:'no-store'});
        if(!response.ok) throw new Error(`예측 API HTTP ${response.status}`);
        const result=validatePrediction(await response.json(),request);
        if(generation===revision.current)setEntries(old=>({...old,[next]:{result}}));
      } catch(e) {
        if(generation===revision.current)setEntries(old=>({...old,[next]:{error:e.name==='AbortError'?'응답 제한 시간 초과':e.message}}));
      } finally {clearTimeout(timeout);if(generation===revision.current)setLoading(false);}
    })();
    return ()=>{++revision.current;clearTimeout(timeout);controller.abort();};
  },[next,series,model]);
  return {entries,loading,retry:()=>setEntries(old=>Object.fromEntries(Object.entries(old).filter(([,v])=>!v.error)))};
}
