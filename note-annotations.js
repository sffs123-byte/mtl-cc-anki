/* CNU NoteFormatControls / NoteComments interaction port for the static MTL app.
 * Same palette, two-row controls, text-linked comments and copy privacy.
 * No clinical content, existing card IDs or SRS storage is changed. */
(() => {
  'use strict';
  const GUIDE_KEY = STORAGE_PREFIX + 'guide_edits_v1';
  const COLORS = ['#172033','#c53030','#e67e22','#138a5b','#2563eb','#7c3aed','#f07ab8'];
  const HIGHLIGHTS = [['노랑','#fff3b0'],['주황','#ffe0bf'],['빨강','#ffd6d9']];
  const COMMENT_PREFIX = 'data-note-comment-';
  let guideEdits = {};
  try { guideEdits = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}'); } catch (_) {}
  let selected = null, panel = null;
  const undoStack=[],redoStack=[];
  // The displayed root's own revision, not the merged whole-storage object.
  // Merging another card must never bless stale HTML in an untouched surface.
  const renderedRevision=new WeakMap();
  function rememberRevision(root,id,guide){if(root)renderedRevision.set(root,{id,guide,value:(guide?guideEdits:edits)[id],html:root.innerHTML});}
  const toolbar = document.createElement('div');
  toolbar.id = 'noteFormatToolbar'; toolbar.className = 'cnuNoteToolbar'; toolbar.hidden = true;
  toolbar.setAttribute('role','toolbar'); toolbar.setAttribute('aria-label','선택한 글 서식과 댓글');
  toolbar.innerHTML = `<div class="noteFormatRow" role="group" aria-label="기본 서식과 형광펜">
    <button data-action="bold" aria-label="굵게"><b>B</b></button><button data-action="underline" aria-label="밑줄"><u>U</u></button><button data-action="strike" aria-label="취소선"><s>S</s></button><button data-action="clear" aria-label="서식 지우기">지움</button><i></i>
    ${HIGHLIGHTS.map(([name,color])=>`<button class="noteHighlight" data-action="highlight" data-value="${color}" style="--highlight:${color}" aria-label="형광펜 ${name}">▰</button>`).join('')}
    <button data-action="highlight-clear" aria-label="형광펜 지우기" title="형광펜만 지우기">⌫</button></div>
    <div class="noteFormatRow noteFormatSecondary" role="group" aria-label="글자색과 댓글"><span>글자색</span>${COLORS.map(color=>`<button class="noteColor" data-action="color" data-value="${color}" style="--swatch:${color}" aria-label="글자색 ${color}"></button>`).join('')}<button data-action="comment" aria-label="댓글 달기">☏ 댓글</button></div>`;
  document.body.append(toolbar);
  const status = document.createElement('div'); status.id = 'noteSaveStatus'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); document.body.append(status);
  let statusTimer;
  function report(message, error=false) { status.textContent=message; status.classList.toggle('error',error); status.hidden=false; clearTimeout(statusTimer); if(!error)statusTimer=setTimeout(()=>status.hidden=true,1800); }
  function surface(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const root = el?.closest('[id^="ans-content-"], [id^="guide-"], #quizAnsContent, #quizGuide');
    if (!root || root.id.startsWith('guide-btn-')) return null;
    const quiz = root.id==='quizAnsContent'||root.id==='quizGuide';
    const guide = root.id==='quizGuide'||root.id.startsWith('guide-');
    const id = quiz ? activeQuizCardId : root.id.slice(guide?6:12);
    return id && QUIZ_DATA[id] ? {root,id,guide} : null;
  }
  function persist(target) {
    const {root,id,guide}=target, html=root.innerHTML;
    const latest=JSON.parse(localStorage.getItem(guide?GUIDE_KEY:EDITS_KEY)||'{}');
    const known=renderedRevision.get(root);
    if(!known||known.id!==id||known.guide!==guide||latest[id]!==known.value) {const error=new Error('This answer was changed in another tab. Reload before annotating.');error.code='ANNOTATION_CONFLICT';throw error;}
    if(guide) { const next={...latest,[id]:html}; localStorage.setItem(GUIDE_KEY,JSON.stringify(next)); guideEdits=next; }
    else { const previous=edits; edits={...latest,[id]:html}; try {saveEdits();} catch(e){edits=previous;throw e;} }
    const ids=guide?['guide-'+id, ...(activeQuizCardId===id?['quizGuide']:[])]:['ans-content-'+id,...(activeQuizCardId===id?['quizAnsContent']:[])];
    ids.forEach(key=>{const other=document.getElementById(key);if(other&&(!guide||other.dataset.loaded||key==='quizGuide')){if(other!==root)other.innerHTML=html;rememberRevision(other,id,guide);}});
    report('서식·댓글 저장됨');
  }
  function remember(target,before) {
    const after=target.root.innerHTML;if(before===after)return;
    undoStack.push({id:target.id,guide:target.guide,before,after});if(undoStack.length>50)undoStack.shift();redoStack.length=0;
  }
  function undoAnnotation(redo=false) {
    const stack=redo?redoStack:undoStack, item=stack.at(-1);if(!item)return false;
    const active=surface(document.activeElement)||surface(window.getSelection()?.anchorNode)||selected;
    if(!active||active.id!==item.id||active.guide!==item.guide)return false;
    const expected=redo?item.before:item.after;
    if(active.root.innerHTML!==expected)return false;
    try {active.root.innerHTML=redo?item.after:item.before;persist(active);stack.pop();(redo?undoStack:redoStack).push(item);selected=null;toolbar.hidden=true;report(redo?'다시 적용됨':'서식·댓글 되돌림');return true;}
    catch(error){active.root.innerHTML=expected;report('최신 수정본과 충돌하여 되돌리지 못했습니다. 새로고침해 주세요.',true);return true;}
  }
  function hydrateGuides() {
    for(const id of ALL_IDS) {const root=document.getElementById('guide-'+id);if(root&&root.dataset.loaded){if(guideEdits[id]&&root.innerHTML!==guideEdits[id])root.innerHTML=guideEdits[id];rememberRevision(root,id,true);}}
    const quiz=document.getElementById('quizGuide');if(quiz){if(guideEdits[activeQuizCardId]&&quiz.innerHTML!==guideEdits[activeQuizCardId])quiz.innerHTML=guideEdits[activeQuizCardId];rememberRevision(quiz,activeQuizCardId,true);}
  }
  // Wrap only render boundaries; the app's existing drawing/editing/backup code stays intact.
  const renderBase=renderQuizCard; renderQuizCard=function(...args){if(panel)closeComment();selected=null;toolbar.hidden=true;const r=renderBase(...args);const root=document.getElementById('quizAnsContent'),card=document.getElementById('ans-content-'+args[0]);if(root&&card&&renderedRevision.has(card))renderedRevision.set(root,{...renderedRevision.get(card)});else rememberRevision(root,args[0],false);hydrateGuides();return r;};
  const guideBase=toggleGuide; toggleGuide=function(...args){const r=guideBase(...args);hydrateGuides();return r;};
  const quizGuideBase=toggleQuizGuide; toggleQuizGuide=function(...args){const r=quizGuideBase(...args);hydrateGuides();return r;};
  const applyEditsBase=applyEdits;applyEdits=function(...args){const r=applyEditsBase(...args);ALL_IDS.forEach(id=>rememberRevision(document.getElementById('ans-content-'+id),id,false));return r;};
  function saveFailure(error){report(error.code==='ANNOTATION_CONFLICT'?'다른 탭의 최신 수정본이 있습니다. 현재 입력을 복사한 뒤 새로고침해 주세요.':'저장하지 못했습니다. 저장공간을 확인해 주세요.',true);}
  saveEdit=function(id){const root=document.getElementById('ans-content-'+id);try{persist({root,id,guide:false});root.contentEditable='false';root.classList.remove('editing');removeEditToolbar(id);document.getElementById('save-'+id).style.display='none';}catch(error){saveFailure(error);}};
  const toggleQuizEditBase=toggleQuizEdit;toggleQuizEdit=function(id){
    const root=document.getElementById('quizAnsContent'),closing=root?.contentEditable==='true';
    if(!closing)return toggleQuizEditBase(id);
    try{persist({root,id,guide:false});root.contentEditable='false';root.classList.remove('editing');removeEditToolbar('quiz-'+id);setTimeout(()=>showQuizStaticDraw(id),30);}catch(error){saveFailure(error);}
  };
  // The old backup helper always wrote its entire in-memory edits object, even
  // with no open editor. Flush only actual dirty roots into the latest store.
  flushEditableChangesForBackup=function(){
    const dirty=new Map();
    ALL_IDS.forEach(id=>{const root=document.getElementById('ans-content-'+id);if(root?.contentEditable==='true'&&root.innerHTML!==renderedRevision.get(root)?.html)dirty.set(id,{root,id,guide:false});});
    const quiz=document.getElementById('quizAnsContent');if(activeQuizCardId&&quiz?.contentEditable==='true'&&quiz.innerHTML!==renderedRevision.get(quiz)?.html)dirty.set(activeQuizCardId,{root:quiz,id:activeQuizCardId,guide:false});
    const latest=JSON.parse(localStorage.getItem(EDITS_KEY)||'{}');
    for(const target of dirty.values()){const known=renderedRevision.get(target.root);if(!known||latest[target.id]!==known.value){const error=new Error('다른 탭에서 수정된 답안이 있습니다. 현재 입력을 보존하고 새로고침해 주세요.');error.code='ANNOTATION_CONFLICT';saveFailure(error);throw error;}latest[target.id]=target.root.innerHTML;}
    if(dirty.size)localStorage.setItem(EDITS_KEY,JSON.stringify(latest));edits=latest;
    for(const target of dirty.values()){
      const ids=['ans-content-'+target.id,...(activeQuizCardId===target.id?['quizAnsContent']:[])];
      ids.forEach(id=>{const root=document.getElementById(id);if(root){if(root!==target.root)root.innerHTML=target.root.innerHTML;rememberRevision(root,target.id,false);}});
    }
  };
  function captureSelection() {
    if(panel || toolbar.contains(document.activeElement)) return;
    const selection=window.getSelection();
    if(!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()){toolbar.hidden=true;selected=null;return;}
    const range=selection.getRangeAt(0), start=surface(range.startContainer), end=surface(range.endContainer);
    if(!start||!end||start.root!==end.root){toolbar.hidden=true;selected=null;return;}
    selected={...start,range:range.cloneRange(),quote:selection.toString()};
    positionToolbar();
  }
  function positionToolbar() {
    if(!selected?.root.isConnected){toolbar.hidden=true;return;}
    const rect=selected.range.getBoundingClientRect();
    if(!rect.width&&!rect.height){toolbar.hidden=true;return;}
    toolbar.hidden=false;
    const width=toolbar.offsetWidth,height=toolbar.offsetHeight;
    toolbar.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left+(rect.width-width)/2))+'px';
    toolbar.style.top=Math.max(8,Math.min(innerHeight-height-8,rect.top>height+12?rect.top-height-8:rect.bottom+8))+'px';
  }
  document.addEventListener('selectionchange',()=>{if(!panel)captureSelection();});
  document.addEventListener('pointerup',()=>setTimeout(captureSelection,0));
  document.addEventListener('keyup',event=>{if(event.key==='Shift'||event.key.startsWith('Arrow'))captureSelection();});
  window.addEventListener('resize',()=>{if(selected&&!panel)positionToolbar();});
  document.addEventListener('scroll',()=>{if(selected&&!panel)positionToolbar();},true);
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());

  const INLINE = new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','FONT','MARK','A','SMALL','SUP','SUB']);
  // Isolate selected leaves before editing styles. This removes a highlight from
  // only the selected words, even inside a larger pre-existing colored run.
  function isolateInline(text,root) {
    let current=text;
    while(current.parentElement && current.parentElement!==root && INLINE.has(current.parentElement.tagName)) {
      const parent=current.parentElement;
      if(current.previousSibling) {const before=parent.cloneNode(false);while(parent.firstChild!==current)before.append(parent.firstChild);parent.before(before);}
      if(current.nextSibling) {const after=parent.cloneNode(false);while(current.nextSibling)after.append(current.nextSibling);parent.after(after);}
      current=parent;
    }
  }
  function selectedLeaves(target) {
    const {root,range}=target, nodes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {const n=walker.currentNode;if(!n.textContent||!range.intersectsNode(n))continue;
      const start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;
      if(end>start)nodes.push({n,start,end});}
    return nodes.map(({n,start,end})=>{if(end<n.length)n.splitText(end);const picked=start?n.splitText(start):n;isolateInline(picked,root);return picked;});
  }
  function stripStyle(text,root,properties,clearTags=false) {
    let parent=text.parentElement;
    while(parent&&parent!==root&&INLINE.has(parent.tagName)) {
      properties.forEach(prop=>parent.style.removeProperty(prop));
      if(properties.includes('color'))parent.removeAttribute('color');
      const next=parent.parentElement;
      if(clearTags && ['B','STRONG','I','EM','U','S','STRIKE','MARK','FONT','SMALL','SUP','SUB'].includes(parent.tagName)) {
        const shell=document.createElement('span');for(const a of [...parent.attributes])shell.setAttribute(a.name,a.value);while(parent.firstChild)shell.append(parent.firstChild);parent.replaceWith(shell);
      }
      parent=next;
    }
  }
  function unwrapSemantic(parent) {
    const shell=document.createElement('span');for(const attr of [...parent.attributes])shell.setAttribute(attr.name,attr.value);while(parent.firstChild)shell.append(parent.firstChild);parent.replaceWith(shell);return shell;
  }
  function clearHighlight(text,root) {
    let parent=text.parentElement;
    while(parent&&parent!==root&&INLINE.has(parent.tagName)) {parent.style.removeProperty('background-color');const next=parent.parentElement;if(parent.tagName==='MARK')unwrapSemantic(parent);parent=next;}
  }
  function removeDecoration(text,root,decoration) {
    let parent=text.parentElement;
    while(parent&&parent!==root&&INLINE.has(parent.tagName)) {
      const lines=parent.style.textDecorationLine.split(/\s+/).filter(x=>x&&x!==decoration);
      if(parent.style.textDecorationLine.includes(decoration)){parent.style.textDecorationLine=lines.join(' ')||'none';}
      const next=parent.parentElement;
      if((decoration==='underline'&&parent.tagName==='U')||(decoration==='line-through'&&['S','STRIKE'].includes(parent.tagName)))unwrapSemantic(parent);
      parent=next;
    }
  }
  function applyToSelection(action,value,comment) {
    if(!selected?.root.isConnected || !selected.quote.trim())return false;
    const target=selected,before=target.root.innerHTML;
    try {
      const leaves=selectedLeaves(target);if(!leaves.length)return false;
      const boldOff=action==='bold'&&leaves.every(n=>Number(getComputedStyle(n.parentElement).fontWeight)>=600);
      const decorations=action==='underline'?'underline':'line-through';
      const decorationOff=['underline','strike'].includes(action)&&leaves.every(n=>{let p=n.parentElement;while(p&&p!==target.root){if(getComputedStyle(p).textDecorationLine.includes(decorations))return true;p=p.parentElement;}return false;});
      for(const leaf of leaves) {
        const span=document.createElement('span');
        if(action==='clear') {stripStyle(leaf,target.root,['color','background-color','font-weight','font-style','font-size','text-decoration','text-decoration-line'],true);span.style.cssText='font-weight:normal;font-style:normal;text-decoration:none;';}
        if(action==='highlight'||action==='highlight-clear'){clearHighlight(leaf,target.root);if(action==='highlight')span.style.backgroundColor=value;}
        if(action==='color'){stripStyle(leaf,target.root,['color']);span.style.color=value;}
        if(action==='bold')span.style.fontWeight=boldOff?'normal':'700';
        if(action==='underline'||action==='strike') {if(decorationOff)removeDecoration(leaf,target.root,decorations);else span.style.textDecorationLine=decorations;}
        if(action==='comment')for(const [key,val] of Object.entries(comment))span.setAttribute(COMMENT_PREFIX+key,val);
        leaf.replaceWith(span);span.append(leaf);
      }
      const range=document.createRange();range.setStart(leaves[0],0);range.setEnd(leaves.at(-1),leaves.at(-1).length);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);selected={...target,range:range.cloneRange(),quote:selection.toString()};
      persist(target);remember(target,before);positionToolbar();return true;
    } catch(error) {target.root.innerHTML=before;selected=null;toolbar.hidden=true;report(error.code==='ANNOTATION_CONFLICT'?'다른 탭의 최신 수정본이 있습니다. 새로고침 후 다시 선택해 주세요.':'저장하지 못했습니다. 저장공간을 확인하고 다시 시도하세요.',true);console.error('Annotation save failed',error);return false;}
  }
  toolbar.addEventListener('click',event=>{const btn=event.target.closest('button');if(!btn||!selected)return;if(btn.dataset.action==='comment')openComment();else applyToSelection(btn.dataset.action,btn.dataset.value);});

  function marks(root,id){return [...root.querySelectorAll('[data-note-comment-id]')].filter(n=>n.getAttribute(COMMENT_PREFIX+'id')===id);}
  function closeComment(){if(!panel)return;const origin=panel.origin;panel.backdrop.remove();panel=null;if(origin?.isConnected)origin.focus({preventScroll:true});toolbar.hidden=true;}
  function openComment(existing,target) {
    if(panel)closeComment();
    target=target||selected;if(!target)return;
    if(!existing) {const found=target.root.querySelectorAll('[data-note-comment-id]');existing=[...found].find(el=>target.range.intersectsNode(el));}
    const id=existing?.getAttribute(COMMENT_PREFIX+'id');
    const matching=id?marks(target.root,id):[];
    const quote=id?matching.map(n=>n.textContent).join(''):target.quote;
    const text=existing?.getAttribute(COMMENT_PREFIX+'text')||'';
    const backdrop=document.createElement('div');backdrop.className='noteCommentBackdrop';
    backdrop.innerHTML='<section class="noteCommentDialog" role="dialog" aria-modal="true" aria-labelledby="noteCommentTitle"><header><h2 id="noteCommentTitle"></h2><button aria-label="댓글 닫기" data-close>×</button></header><div class="noteCommentContent"><div class="noteCommentQuoteLabel">선택한 글</div><blockquote class="noteCommentQuote"></blockquote><p class="noteCommentBody"></p><label for="noteCommentInput">댓글 내용</label><textarea id="noteCommentInput" rows="5" maxlength="2000" placeholder="이 부분에 대한 메모를 남겨 보세요."></textarea><div class="noteCommentCount"></div><p class="noteCommentError" role="alert"></p></div><footer><button data-delete class="noteCommentDanger">삭제</button><button data-cancel>취소</button><button data-save class="noteCommentPrimary"></button></footer></section>';
    document.body.append(backdrop);toolbar.hidden=true;
    panel={backdrop,target,id,quote,text,origin:existing||target.root,mode:id?'view':'create',confirmDelete:false};
    const input=backdrop.querySelector('textarea');input.value=text;
    backdrop.querySelector('.noteCommentQuote').textContent=quote;
    const draw=()=>{if(!panel)return;const view=panel.mode==='view';backdrop.querySelector('h2').textContent=panel.mode==='create'?'댓글 달기':view?'댓글':'댓글 수정';backdrop.querySelector('.noteCommentBody').textContent=panel.text;backdrop.querySelector('.noteCommentBody').hidden=!view;input.hidden=view;backdrop.querySelector('label').hidden=view;backdrop.querySelector('[data-delete]').hidden=!panel.id;backdrop.querySelector('[data-save]').textContent=view?'수정':'저장';backdrop.querySelector('.noteCommentCount').textContent=view?'':input.value.length+' / 2000';backdrop.querySelector('[data-save]').disabled=!view&&!input.value.trim();(view?backdrop.querySelector('[data-close]'):input).focus({preventScroll:true});};
    input.addEventListener('input',()=>{backdrop.querySelector('.noteCommentCount').textContent=input.value.length+' / 2000';backdrop.querySelector('[data-save]').disabled=!input.value.trim();});
    backdrop.querySelector('[data-close]').onclick=closeComment;backdrop.querySelector('[data-cancel]').onclick=closeComment;
    backdrop.querySelector('[data-save]').onclick=()=>{
      if(panel.mode==='view'){panel.mode='edit';draw();return;}
      const text=input.value.trim();if(!text||text.length>2000)return;
      if(!panel.target.root.isConnected){backdrop.querySelector('.noteCommentError').textContent='연결된 글이 변경되었습니다. 다시 선택해 주세요.';return;}
      if(panel.id) {const before=panel.target.root.innerHTML;try {for(const node of marks(panel.target.root,panel.id)){node.setAttribute(COMMENT_PREFIX+'text',text);node.setAttribute(COMMENT_PREFIX+'updated-at',new Date().toISOString());}persist(panel.target);remember(panel.target,before);closeComment();}catch(error){panel.target.root.innerHTML=before;backdrop.querySelector('.noteCommentError').textContent=error.code==='ANNOTATION_CONFLICT'?'다른 탭의 최신 수정본이 있습니다. 새로고침 후 다시 시도해 주세요.':'댓글을 저장하지 못했습니다.';}}
      else {selected=panel.target;const now=new Date().toISOString();if(applyToSelection('comment',null,{id:'note-'+crypto.randomUUID(),text,author:'','created-at':now,'updated-at':now}))closeComment();}
    };
    backdrop.querySelector('[data-delete]').onclick=()=>{
      if(!panel.target.root.isConnected){backdrop.querySelector('.noteCommentError').textContent='연결된 글이 변경되었습니다. 다시 선택해 주세요.';return;}
      if(!panel.confirmDelete){panel.confirmDelete=true;backdrop.querySelector('.noteCommentError').textContent='댓글만 삭제할까요? 선택한 글과 서식은 유지됩니다.';backdrop.querySelector('[data-delete]').textContent='댓글 삭제 확인';return;}
      const before=panel.target.root.innerHTML;try {for(const node of marks(panel.target.root,panel.id))for(const attr of [...node.attributes])if(attr.name.startsWith(COMMENT_PREFIX))node.removeAttribute(attr.name);persist(panel.target);remember(panel.target,before);closeComment();}catch(error){panel.target.root.innerHTML=before;backdrop.querySelector('.noteCommentError').textContent=error.code==='ANNOTATION_CONFLICT'?'다른 탭의 최신 수정본이 있습니다. 새로고침 후 다시 시도해 주세요.':'댓글을 삭제하지 못했습니다.';}
    };
    draw();
  }
  document.addEventListener('keydown',event=>{
    if(!panel){
      if((event.metaKey||event.ctrlKey)&&!event.isComposing&&['z','y'].includes(event.key.toLowerCase())&&!event.target.closest?.('textarea,input')){
        if(undoAnnotation(event.shiftKey||event.key.toLowerCase()==='y')){event.preventDefault();event.stopImmediatePropagation();}
      }
      return;
    }
    if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();closeComment();}
    if(event.key==='Tab'){event.preventDefault();const els=[...panel.backdrop.querySelectorAll('button:not(:disabled),textarea')].filter(el=>!el.hidden);const at=els.indexOf(document.activeElement);els[(at+(event.shiftKey?-1:1)+els.length)%els.length]?.focus();}
    if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.isComposing){event.preventDefault();panel.backdrop.querySelector('[data-save]').click();}
  },true);
  // Native typed-text undo remains owned by the browser. Do not replay stale
  // whole-HTML annotations over a later unsaved typing operation.
  document.addEventListener('input',event=>{if(surface(event.target)){undoStack.length=0;redoStack.length=0;}});
  document.addEventListener('click',event=>{
    if(panel || window.getSelection()?.toString())return;
    const mark=event.target.closest?.('[data-note-comment-id]'),target=surface(mark);
    if(mark&&target){event.preventDefault();openComment(mark,target);}
  });
  // iOS/WebKit can suppress synthesized click after this app's touch handlers.
  // A short stationary touch opens the mark; scrolling/long-press selection do not.
  let commentTouch=null;
  document.addEventListener('pointerdown',event=>{
    const mark=event.target.closest?.('[data-note-comment-id]');
    commentTouch=event.pointerType==='touch'&&mark?{mark,x:event.clientX,y:event.clientY,time:performance.now(),pointerId:event.pointerId}:null;
  });
  document.addEventListener('pointercancel',()=>{commentTouch=null;});
  document.addEventListener('pointerup',event=>{
    const touch=commentTouch;commentTouch=null;
    if(panel||!touch||touch.pointerId!==event.pointerId||performance.now()-touch.time>650||Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>10||window.getSelection()?.toString())return;
    const target=surface(touch.mark);if(target&&touch.mark.isConnected)openComment(touch.mark,target);
  });
  document.addEventListener('copy',event=>{
    const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0),target=surface(range.startContainer);if(!target||surface(range.endContainer)?.root!==target.root)return;
    const box=document.createElement('div');let content=range.cloneContents(),ancestor=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    while(ancestor&&ancestor!==target.root&&target.root.contains(ancestor)){const shell=ancestor.cloneNode(false);shell.append(content);content=shell;ancestor=ancestor.parentElement;}
    box.append(content);box.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(a.name.startsWith(COMMENT_PREFIX))el.removeAttribute(a.name);}));
    event.preventDefault();event.clipboardData.setData('text/plain',selection.toString());event.clipboardData.setData('text/html',box.innerHTML);
  });
  window.addEventListener('DOMContentLoaded',hydrateGuides);
  document.addEventListener('pointerdown',event=>{if(!panel&&!toolbar.contains(event.target)&&!surface(event.target)){toolbar.hidden=true;selected=null;}});
})();
