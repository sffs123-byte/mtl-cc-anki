/* Provided explanations are render-only. Never change the CC revision or personal stores. */
(() => {
  'use strict';
  const packet=window.MTLCCKeywordSeeds, attr='data-cc-seed-id';
  const byId=new Map(),byCard=new Map(),reports=new Map(),rendered=new WeakMap(),sourceRows=new Map();
  for(const seed of packet?.comments||[]){byId.set(seed.id,seed);for(const id of seed.cardIds){if(!byCard.has(id))byCard.set(id,[]);byCard.get(id).push(seed);}}
  const norm=s=>s.replace(/\s+/gu,' ').trim();
  function enabled(id){const v=window.MTLCCVersion;return !!(v?.ready&&!v.legacy&&!v.fallback&&v.revision===packet?.sourceRevision&&window.MTLCCReplacement?.packetSha256===packet?.sourcePacketSha256&&byCard.has(id));}
  function clean(root){for(const el of [...root.querySelectorAll('['+attr+']')].reverse())el.replaceWith(...el.childNodes);}
  function html(root){if(!root)return '';if(!root.querySelector('['+attr+']'))return root.innerHTML;const copy=root.cloneNode(true);clean(copy);return copy.innerHTML;}
  function textMap(cell){
    const nodes=[],walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let raw='';
    while(walker.nextNode()){const n=walker.currentNode;nodes.push({node:n,start:raw.length,end:raw.length+n.length});raw+=n.textContent;}
    let text='',map=[];
    for(let i=0;i<raw.length;){if(/\s/u.test(raw[i])){const start=i;while(i<raw.length&&/\s/u.test(raw[i]))i++;if(text&&i<raw.length){text+=' ';map.push([start,i]);}}else{text+=raw[i];map.push([i,i+1]);i++;}}
    return {nodes,text,map};
  }
  function resolve(root,seed){
    const row=root.querySelectorAll('tr')[seed.rowIndex],cell=row&&[...row.children].filter(n=>['TD','TH'].includes(n.tagName))[seed.cellIndex];
    if(!cell)return {reason:'cell_missing'};
    const mapped=textMap(cell),a=seed.anchor;
    // Strict full-cell equality is deliberate: a shifted row or changed user text is not guessed.
    if(mapped.text!==a.cellText)return {reason:'cell_changed'};
    const hits=[];let p=0;while((p=mapped.text.indexOf(seed.quote,p))>=0){hits.push(p);p+=seed.quote.length;}
    const start=hits[seed.occurrence];
    if(start===undefined||start!==a.normalizedStart||mapped.text.slice(Math.max(0,start-a.prefix.length),start)!==a.prefix||mapped.text.slice(start+seed.quote.length,start+seed.quote.length+a.suffix.length)!==a.suffix)return {reason:'quote_mismatch'};
    const rawStart=mapped.map[start]?.[0],rawEnd=mapped.map[start+seed.quote.length-1]?.[1];
    if(rawStart===undefined||rawEnd===undefined)return {reason:'range_missing'};
    return {cell,mapped,rawStart,rawEnd};
  }
  function selectionOffsets(root){
    const sel=getSelection();if(!sel?.rangeCount)return null;const r=sel.getRangeAt(0);
    if(!root.contains(r.startContainer)||!root.contains(r.endContainer))return null;
    const start=r.cloneRange();start.selectNodeContents(root);start.setEnd(r.startContainer,r.startOffset);
    const end=r.cloneRange();end.selectNodeContents(root);end.setEnd(r.endContainer,r.endOffset);
    return {start:start.toString().length,end:end.toString().length};
  }
  function restoreSelection(root,offsets){
    if(!offsets)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let at=0,start,end;
    while(walker.nextNode()){const n=walker.currentNode;
      if(!start&&offsets.start<=at+n.length)start=[n,Math.max(0,offsets.start-at)];
      if(offsets.end<=at+n.length){end=[n,Math.max(0,offsets.end-at)];break;}at+=n.length;
    }
    if(start&&end){const r=document.createRange();r.setStart(...start);r.setEnd(...end);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);}
  }
  function decorate(root,id,guide=false){
    if(!root)return;
    const canonical=html(root),previous=rendered.get(root);
    if(enabled(id)&&previous?.id===id&&previous.guide===guide&&previous.html===canonical&&root.nextElementSibling?.classList.contains('cc-seed-access'))return;
    const selection=selectionOffsets(root);
    clean(root);
    let access=root.nextElementSibling;if(access?.classList.contains('cc-seed-access'))access.remove();
    if(!enabled(id)){restoreSelection(root,selection);return;}
    if(!sourceRows.has(id)){const box=document.createElement('div');box.innerHTML=window.MTLCCReplacement.replacements[id].a;sourceRows.set(id,box.querySelectorAll('tr').length);}
    const structureChanged=root.querySelectorAll('tr').length!==sourceRows.get(id);
    const failures=[],placed=[];
    for(const seed of byCard.get(id)){
      const hit=structureChanged?{reason:'structure_changed'}:resolve(root,seed);if(hit.reason){failures.push({seedId:seed.id,cardId:id,surface:guide?'guide':'answer',reason:hit.reason});continue;}
      for(const {node,start,end} of hit.mapped.nodes){const lo=Math.max(start,hit.rawStart)-start,hi=Math.min(end,hit.rawEnd)-start;if(hi<=lo)continue;
        if(hi<node.length)node.splitText(hi);const picked=lo?node.splitText(lo):node;
        const span=document.createElement('span');span.setAttribute(attr,seed.id);span.title='키워드 설명 · '+seed.quote;span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label',seed.quote+' 키워드 설명');picked.replaceWith(span);span.append(picked);
      }
      placed.push(seed.id);
    }
    rendered.set(root,{id,guide,html:canonical});
    reports.set(root.id,{cardId:id,surface:guide?'guide':'answer',placed,unmatched:failures});
    // Outside the answer: excluded from recall grading, source text, edits and copyQA.
    access=document.createElement('div');access.className='cc-seed-access';access.contentEditable='false';
    const button=document.createElement('button');button.type='button';button.textContent='키워드 설명 '+byCard.get(id).length+'개'+(failures.length?' · 내 수정본 미연결 '+failures.length+'개':'');
    button.onclick=()=>window.MTLCCSeedOpen?.({root,id,guide,seedIds:byCard.get(id).map(s=>s.id),quote:'키워드 설명',missing:true},button);
    access.append(button);root.after(access);
    restoreSelection(root,selection);
    // Guides start display:none. Follow their explicit display changes, never show on a hidden guide.
    const sync=()=>{access.hidden=guide&&root.style.display==='none';};sync();
    if(!root.__ccSeedDisplayObserver){root.__ccSeedDisplayObserver=new MutationObserver(()=>{const next=root.nextElementSibling;if(next?.classList.contains('cc-seed-access'))next.hidden=guide&&root.style.display==='none';});root.__ccSeedDisplayObserver.observe(root,{attributes:true,attributeFilter:['style']});}
  }
  function marks(root,seedId){return [...root.querySelectorAll('['+attr+']')].filter(el=>el.getAttribute(attr)===seedId);}
  function targetFromMark(mark,target){const seedId=mark.getAttribute(attr),all=marks(target.root,seedId);if(!all.length)return null;const range=document.createRange();range.setStartBefore(all[0]);range.setEndAfter(all.at(-1));return {...target,range,quote:byId.get(seedId)?.quote||range.toString(),seedIds:[seedId]};}
  function forTarget(target,existing){
    if(!enabled(target.id))return [];
    const found=new Set(target.seedIds||[]);
    const personalId=existing?.getAttribute('data-note-comment-id');
    const personal=personalId?[...target.root.querySelectorAll('[data-note-comment-id]')].filter(x=>x.getAttribute('data-note-comment-id')===personalId):[];
    for(const mark of target.root.querySelectorAll('['+attr+']')){
      if(personal.some(p=>p.contains(mark)||mark.contains(p))||target.range?.intersectsNode(mark))found.add(mark.getAttribute(attr));
    }
    return [...found].map(id=>byId.get(id)).filter(Boolean);
  }
  window.MTLCCSeeds={html,clean,decorate,enabled,marks,targetFromMark,forTarget,byId,byCard,reports,norm};
})();
