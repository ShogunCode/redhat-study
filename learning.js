const $ = selector => document.querySelector(selector);
const main = $('#main');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let path, session, pendingStart, routeVersion = 0;
let submissionKey = null;
const date = value => value ? new Date(value).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : 'Not scheduled';
const lesson = id => path.lessons.find(l => l.id === id);
const isYaml = q => ['yaml_completion','yaml_repair'].includes(q.kind);
const hasManifest = q => isYaml(q)||q.kind==='yaml_interpretation';
const scopeMatches = (l,scope) => scope==='all'||(scope==='openshift'?l.exams.some(e=>e!=='EX200'):l.exams.includes(scope));
const badge = status => `<span class="badge ${status === 'Review due' ? 'due' : status === 'Recall demonstrated' ? 'success' : ''}">${escape(status)}</span>`;
const button = (label, action, id='', style='primary') => `<button class="${style}" data-action="${action}" data-id="${escape(id)}">${label}</button>`;
const heading = (eyebrow, title, description) => `<div class="page-heading"><div><h1>${title}</h1>${description?`<p class="muted">${description}</p>`:''}</div></div>`;
const references = urls => `<div class="references">${urls.map((url, i) => `<a target="_blank" rel="noopener noreferrer" href="${escape(url)}">${i ? 'Related documentation' : 'Read the reference documentation'} ↗</a>`).join('<br>')}</div>`;

async function api(url, body, method) {
  if (document.querySelector('meta[name="study-storage"]')) return (await import('./study.js')).study(url, body);
  let response;
  try {
    response = await fetch('/learning' + url, {method:method || (body === undefined ? 'GET':'POST'), headers:{'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  } catch { throw new Error('Could not reach the workbench. Your submitted work is saved. Check the connection and try again.'); }
  if (!response.ok) {
    let error;
    try { error = (await response.json()).detail; } catch { /* status below */ }
    const message = typeof error === 'string' ? error : response.status === 422 ? 'Please check your selection and try again.' : 'The request failed. Please try again.';
    const err = new Error(message); err.status = response.status; throw err;
  }
  return response.json();
}

function notice(message) { $('#notice').textContent = message; }
function navigate(hash) { if (location.hash === '#' + hash) route(); else location.hash = hash; }
function focusHeading() { const h = main.querySelector('h1'); if(h) {h.tabIndex = -1; h.focus({preventScroll:true});} }
function resumeCard() {
  const s = path.active_session;
  return s ? `<div class="resume"><div><strong>${escape(lesson(s.lesson_id)?.title)}</strong><p>${s.cursor} / ${s.total} completed</p></div>${button('Resume session →','resume',s.id)}</div>` : '';
}
function modules(items) {
  return `<div class="module-list">${items.map(l => `<article class="module"><span class="module-number">${String(l.order).padStart(2,'0')}</span><div><h3><a href="#lesson/${l.id}">${escape(l.title)}</a></h3><p>${escape(l.subtitle)}${l.completed?' · Lesson completed':''}</p></div><div class="module-actions">${badge(l.progress.status)}${button('Open','lesson',l.id,'secondary')}</div></article>`).join('')}</div>`;
}

function practiceControls() {
  return `<form id="practice-form" class="practice-controls"><label>Track<select id="practice-exam" name="exam"><option value="openshift">OpenShift · EX280 + EX380</option><option value="EX280">EX280 · OpenShift administration</option><option value="EX380">EX380 · Advanced OpenShift</option><option value="EX200">EX200 · RHCSA / Linux</option><option value="all">All tracks</option></select></label><label>Focus<select name="focus"><option value="all">Mixed skills</option><option value="commands">Command syntax</option><option value="yaml">YAML config & interpretation</option><option value="resources">Resource fundamentals</option><option value="troubleshooting">Troubleshooting</option><option value="interview">Interview reasoning</option></select></label><label>Difficulty<select name="difficulty"><option value="all">Mixed difficulty</option><option value="easy">Foundation</option><option value="medium">Applied</option><option value="hard">Challenging</option></select></label><button class="primary" type="submit">Practise 10</button></form>`;
}

function wirePractice() {
  const form=$('#practice-form');if(!form)return;
  const scope=$('#practice-exam');
  scope.value=localStorage.getItem('practice-track')||'openshift';
  for(const name of ['focus','difficulty'])form.elements.namedItem(name).value=localStorage.getItem('practice-'+name)||'all';
  form.addEventListener('change',()=>{
    for(const name of ['focus','difficulty'])localStorage.setItem('practice-'+name,form.elements.namedItem(name).value);
  });
  function filterTopics(){
    localStorage.setItem('practice-track',scope.value);
    const container=$('#topic-list');
    if(container)container.innerHTML=modules(path.lessons.filter(l=>scopeMatches(l,scope.value)));
  }
  scope.addEventListener('change',filterTopics);filterTopics();
  form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('button');submit.disabled=true;
    const values=Object.fromEntries(new FormData(form));
    try{await start({mode:'mixed',...values});}catch(error){notice(error.message);}finally{submit.disabled=false;}
  });
}

function home() {
  const rec = path.recommended, l = lesson(rec.lesson_id);
  main.innerHTML = heading('', 'Overview', '') + resumeCard() + practiceControls() +
    `<section class="next-session"><div><span class="muted">${rec.mode==='review'?'Due review':'Next lesson'} · Up to 10 questions</span><h2>${rec.mode==='review'?`${path.due_count} concepts due`:escape(l.title)}</h2><p>${escape(rec.mode==='review'?rec.reason:l.objective)}</p></div>${button(rec.mode==='review'?'Review due concepts →':'Continue learning →','recommended')}</section>` +
    `<div class="section-head"><h2>Topics</h2><span>${path.bank_count} questions · <a href="#progress">${path.due_count} topics due for review</a></span></div><div id="topic-list"></div>`;
  wirePractice();
}

function pathway() {
  main.innerHTML = heading('','Topics','') + practiceControls() + `<div id="topic-list"></div>` +
  `<section class="next-session"><div><h2>Advanced scenarios</h2><p>Recovery, GitOps, security, monitoring and production operations.</p></div>${button('Start 10-question assessment →','assessment','','secondary')}</section>`;
  wirePractice();
}

function lessonView(id) {
  const l = lesson(id); if(!l) throw new Error('This lesson could not be found.');
  main.innerHTML = heading(`MODULE ${String(l.order).padStart(2,'0')} · ${escape(l.subtitle)}`,escape(l.title),escape(l.objective)) +
  `<div class="two-col"><section class="card"><ul class="teaching-list">${l.teaching.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><div class="callout">${escape(l.memory_cue)}</div>${references(l.references)}</section><section class="card"><h2>Practice</h2><p class="muted">Up to 10 questions</p>${!l.prerequisites_met ? `<p>Prerequisite: <a href="#lesson/${escape(l.prerequisites[0])}">${escape(lesson(l.prerequisites[0])?.title)}</a></p>` : ''}<div class="actions">${button('Start guided session →','start',id)}${button('Topic practice','topic',id,'secondary')}</div><p class="progress-evidence">${badge(l.progress.status)}<br>${l.progress.independent_successes} unaided successes · ${l.progress.variants} variants<br>Next review: ${escape(date(l.progress.due))}</p></section></div>${labCard(l)}`;
}

function labCard(l, open=false) {
  const saved = path.labs.find(x=>x.lesson_id===l.id);
  return `<section class="card lab-card"><details ${open ? 'open':''}><summary>${escape(l.title)} ${saved?.completed ? '✓':''}</summary><dl>${[['Starting state',l.lab.start],['Task',l.lab.task],['Verification',l.lab.verify],['Reset',l.lab.reset]].map(([k,v])=>`<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl><label class="notebook-label" for="notes-${l.id}">Evidence and observations</label><textarea id="notes-${l.id}" maxlength="5000">${escape(saved?.notes||'')}</textarea><label><input type="checkbox" id="lab-done-${l.id}" ${saved?.completed?'checked':''}> Verified in my lab</label><div class="actions" style="margin-top:12px">${button('Save notebook entry','save-lab',l.id,'secondary')}</div><p class="lab-saved" id="lab-status-${l.id}">${saved ? 'Saved '+escape(date(saved.timestamp)) : ''}</p></details></section>`;
}

async function progress(version) {
  const p = await api('/progress');
  if(version!==routeVersion)return;
  main.innerHTML = heading('','Progress & review','') +
  `<div class="section-head"><span>${path.due_count} concepts due · ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span>${path.due_count?button('Start review →','review'):''}</div><div class="table-wrap"><table class="history-table"><thead><tr><th>Topic</th><th>Status</th><th>Unaided correct</th><th>Next review</th><th></th></tr></thead><tbody>`+
  p.concepts.map(c=>`<tr><td><a href="#lesson/${c.id}">${escape(c.title)}</a><details><summary>Evidence</summary><p class="progress-evidence">${c.sessions} sessions · ${c.variants} variants<br>Delayed check: ${c.delayed_check?'passed':'not yet'} · Application: ${c.application_check?'passed':'not yet'}${c.last_miss?'<br>Last mistake needs review.':''}</p></details></td><td>${badge(c.status)}</td><td>${c.independent_successes}</td><td>${escape(date(c.due))}</td><td>${button('Practise','topic',c.id,'secondary')}</td></tr>`).join('') +
  `</tbody></table></div><details style="margin-top:12px"><summary>Review rules</summary><p class="progress-evidence">Recall requires three unaided correct answers across two sessions and two variants, including an application check and a check at least 24 hours later. Intervals: 1, 3, 7, 14, then 30 days. Hints and mistake retries do not advance intervals.</p></details>`+
  `<div class="section-head"><h2>Session history</h2><a href="./learning/export" data-export download>Export progress ↓</a></div><div class="card table-wrap"><table class="history-table"><thead><tr><th>Session</th><th>First answers</th><th>Status</th><th>Started</th></tr></thead><tbody>${p.history.map(s=>`<tr><td><a href="#session/${s.id}">${escape(lesson(s.lesson_id)?.title)} · ${escape(s.mode)}</a></td><td>${s.correct} / ${s.answered} answered</td><td>${escape(s.status)}</td><td>${escape(date(s.created_at))}</td></tr>`).join('')||'<tr><td colspan="4">Your first session will appear here.</td></tr>'}</tbody></table></div><div class="actions"><a href="./learning/export" data-export download>Export local learning history</a>${button('Reset local progress','reset','','text-button')}</div>`;
}

function teaching() {
  const l = lesson(session.lesson_id);
  main.innerHTML = `<div class="session-header"><span>GUIDED SESSION · ${session.items.length} questions</span><a href="#home">Pause & exit</a></div>` +
    heading('',escape(l.title),escape(l.objective)) +
    `<section class="card"><ul class="teaching-list">${l.teaching.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><div class="callout">${escape(l.memory_cue)}</div>${button('Begin practice →','begin')}<div style="margin-top:12px">${references(l.references)}</div></section>`;
}

function appendYaml(code, line) {
  const match=line.match(/^(\s*(?:- )?)([^:]+):(?=\s|$)(.*)$/);
  let value=line;
  if(match){
    code.append(match[1]);
    const key=document.createElement('span');key.className='yaml-key';key.textContent=match[2];
    code.append(key,':');value=match[3];
  } else {
    const prefix=line.match(/^(\s*(?:- )?)(.*)$/);
    code.append(prefix[1]);value=prefix[2];
  }
  const scalar=document.createElement('span'), trimmed=value.trim();
  scalar.className=/^(?:true|false|null|~)$/i.test(trimmed)?'yaml-keyword':
    /^[+-]?(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|0x[\da-f]+|0o[0-7]+)$/i.test(trimmed)?'yaml-number':
    trimmed.startsWith('#')?'yaml-comment':'yaml-string';
  scalar.textContent=value;code.append(scalar);
}

function paintCode(q, preview='', solved=false) {
  const box = $('#yaml-code'); if(!box) return;
  box.replaceChildren();
  q.manifest_template.trimEnd().split('\n').forEach((line,i)=>{
    const row=document.createElement('div'); row.className='code-line';
    const n=document.createElement('span'); n.className='line-num'; n.ariaHidden='true'; n.textContent=i+1;
    const code=document.createElement('span'); code.className='code-text';
    code.style.setProperty('--indent',line.match(/^\s*/)[0].length);
    const token=q.blank_token||'__BLANK__';
    if(line.includes(token)) {
      row.classList.add('target-line');
      const [before,after]=line.split(token); appendYaml(code,before);
      const shown=preview||q.initial_value||'choose a value';
      const blank=document.createElement('span'); blank.className='yaml-blank'; blank.textContent=shown; blank.setAttribute('aria-label',solved?'Correct value: '+preview:(q.kind==='yaml_repair'?'Field to repair: ':'Missing field: ')+shown); code.append(blank,after);
    } else {
      appendYaml(code,line);
    }
    row.append(n,code);box.append(row);
  });
}

function exerciseView() {
  const q=session.items[session.cursor], feedback=session.feedback[q.id], multi=q.kind==='multiple_selection';
  const selected=feedback?.selected||[];
  submissionKey = session.id + ':' + q.id;
  main.innerHTML = `<div class="session-header"><span>${escape(session.mode==='mixed'?'Mixed practice · '+(session.filters?.exam||'OpenShift'):lesson(q.lesson_id)?.title)} · ${escape(q.skill||session.mode)} · ${escape(q.difficulty||'')}</span><a href="#home">Pause & exit</a></div><div class="session-header"><strong>Question ${session.cursor+1} of ${session.items.length}</strong></div><div class="session-track" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="${session.items.length}" aria-valuenow="${session.cursor}"><span style="width:${session.cursor/session.items.length*100}%"></span></div>`+
  `<div class="session-layout ${!hasManifest(q)&&!q.evidence?'single':''}"><section class="exercise"><div class="exercise-intro"><h1>${escape(q.question)}</h1><p class="exercise-context">${escape(q.scenario.replace(' This is a practice workspace; no cluster changes are made.','').replace(' Output shown in questions is supplied practice evidence, not live command execution.','').replace(' This is a foundations bridge, not a complete EX380 syllabus.',''))}</p></div><form class="exercise-form" id="answer-form"><fieldset class="choice-set"><legend>${multi?'Select all that apply.':'Choose one answer.'}</legend>${q.choices.map(c=>`<label class="choice"><input type="${multi?'checkbox':'radio'}" name="answer" value="${escape(c.id)}" ${selected.includes(c.id)?'checked':''} ${feedback?'disabled':''}><span class="${isYaml(q)||q.kind==='command_choice'?'choice-code':''}">${escape(c.text)}</span></label>`).join('')}</fieldset><div id="preview-announcement" class="muted" style="font-size:.75rem" aria-live="polite"></div><div class="exercise-actions">${feedback?'':'<button type="submit" class="primary" id="check-answer">Check answer</button>'+button('Give me a hint','hint','','text-button')}</div><div id="question-error" class="question-error" role="alert"></div><div id="hint-box" class="hint-box" hidden></div><div id="feedback"></div></form></section>`+
  (hasManifest(q)?`<aside class="editor" aria-label="Resource YAML viewer"><div class="editor-title"><span class="resource-icon">YAML</span><div>${escape(q.resource_context?.kind || "Resource")} / ${escape(q.resource_context?.name || q.title)}<small>${q.resource_context?.namespace==="Cluster scoped"?"Cluster scoped":"Project: "+escape(q.resource_context?.namespace || "training")}</small></div></div><div class="editor-tabs"><span class="active">YAML</span></div><div class="editor-code" id="yaml-code" role="region" aria-label="YAML manifest" tabindex="0"></div></aside>`:q.evidence?`<aside class="evidence-panel"><h2>Supplied evidence</h2><pre class="evidence">${escape(q.evidence)}</pre></aside>`:'')+'</div>';
  paintCode(q);
  $('#answer-form').addEventListener('submit', submitAnswer);
  $('#answer-form').addEventListener('change',()=>{
    const value=$('input[name="answer"]:checked')?.value;
    const text=q.choices.find(c=>c.id===value)?.text;
    if(isYaml(q)){paintCode(q,text);$('#preview-announcement').textContent='Preview: '+text;}
  });
  if(feedback) renderFeedback(q, feedback, false);
  else if(session.hints.includes(q.id)) {
    const id=session.id, version=routeVersion;
    api(`/sessions/${id}/hint`,{}).then(result=>{
      if(version===routeVersion&&$('#hint-box')){$('#hint-box').hidden=false;$('#hint-box').textContent='Hint: '+result.hint;}
    }).catch(error=>notice(error.message));
  }
}

function renderFeedback(q, f, focus=true) {
  const correctChoice=f.choices.find(c=>c.correct);
  paintCode(q,correctChoice.text,true);
  main.querySelectorAll('input[name=answer]').forEach(input=>{
    input.disabled=true;const c=f.choices.find(c=>c.id===input.value);
    if(c.correct) input.closest('label').classList.add('answer-right');
    else if(f.selected.includes(c.id)) input.closest('label').classList.add('answer-wrong');
  });
  const actions=$('.exercise-actions'); if(actions) actions.replaceChildren();
  const relevant=f.choices.filter(c=>c.correct||f.selected.includes(c.id));
  $('#feedback').innerHTML=`<section class="feedback ${f.correct?'':'incorrect'}">${f.hinted?'<span class="eyebrow">Hint used</span>':''}<h2 tabindex="-1" id="verdict">${f.correct?'Correct':'Incorrect'}</h2><ul>${relevant.map(c=>`<li><strong>${c.correct?'Correct answer':'Your selection'}: ${escape(c.text)}</strong>${escape(c.explanation)}</li>`).join('')}</ul><p class="cue"><strong>Remember:</strong> ${escape(f.memory_cue)}</p><details><summary>Lab verification & references</summary><p>${escape(f.lab)}</p>${references(q.references)}</details>${button(session.cursor===session.items.length-1?'Finish & view results →':'Continue →','next')}</section>`;
  if(focus) $('#verdict').focus();
}

async function submitAnswer(event) {
  event.preventDefault();const q=session.items[session.cursor];
  const sessionId=session.id, version=routeVersion;
  const selected=[...main.querySelectorAll('input[name=answer]:checked')].map(e=>e.value);
  if(!selected.length){$('#question-error').textContent='Choose an answer before checking.';return;}
  const submit=$('#check-answer');submit.disabled=true;$('#question-error').textContent='';
  // Freeze the selected payload during a request, so a retry cannot silently change a first answer.
  const inputs=[...main.querySelectorAll('input[name=answer]')]; inputs.forEach(i=>i.disabled=true);
  try {
    const feedback=await api(`/sessions/${sessionId}/attempts`,{question_id:q.id,selected,idempotency_key:submissionKey});
    if(version!==routeVersion)return;
    session.feedback[q.id]=feedback;renderFeedback(q,feedback);
  } catch(error){
    if(version!==routeVersion)return;
    if(error.status===409){
      // A response may have been lost after the server recorded the first answer.
      try {
        const restored=await api(`/sessions/${sessionId}`);
        if(version!==routeVersion)return;
        if(restored.feedback[q.id]){
          session=restored;
          if(restored.status==='active')exerciseView();else summary();
          return;
        }
      }catch{ /* Preserve the existing answer controls and retry message. */ }
    }
    $('#question-error').textContent=error.message;inputs.forEach(i=>i.disabled=false);submit.disabled=false;
  }
}

async function sessionView(id, version) {
  const loaded = await api('/sessions/'+encodeURIComponent(id));
  if(version!==routeVersion)return;
  session=loaded;
  if(session.status==='complete'||session.status==='abandoned') return summary();
  if(session.mode==='learn'&&!session.teaching_seen) return teaching();
  exerciseView();
}

function summary() {
  const answers=Object.values(session.feedback), right=answers.filter(f=>f.correct).length;
  const wrong=session.items.filter(q=>session.feedback[q.id]&&!session.feedback[q.id].correct);
  const topics=[...new Set(session.items.map(q=>q.lesson_id))];
  main.innerHTML=heading('',session.status==='complete'?'Session results':'Archived session','')+
    `<section class="card"><div class="summary-score">${right}<small> / ${answers.length} correct</small></div><p class="muted">${answers.filter(f=>f.hinted).length} hints used${session.mode==='mistakes'?' · Mistake practice excluded from recall scoring':''}</p><div class="actions">${button('Back to overview →','home')}${wrong.length?button('Try mistakes again','mistakes',session.id,'secondary'):''}<a href="#progress">Review schedule</a></div></section>`+
    (wrong.length?`<section class="card"><h2>Mistakes to review</h2><ul class="result-list">${wrong.map(q=>`<li>${escape(q.question)}<span>${escape(session.feedback[q.id]?.choices.find(c=>c.correct)?.explanation||'Not answered')}</span></li>`).join('')}</ul></section>`:'')+
    (topics.length===1?labCard(lesson(topics[0])):`<details><summary>Topics practised</summary><ul>${topics.map(id=>`<li><a href="#lesson/${id}">${escape(lesson(id)?.title)}</a></li>`).join('')}</ul></details>`);
}

async function start(payload) {
  pendingStart=payload;
  try {const s=await api('/sessions',payload);navigate('session/'+s.id);}
  catch(error) {
    if(error.status===409){path=await api('/pathway');$('#replace-dialog').showModal();}
    else throw error;
  }
}

async function action(actionName, id, element) {
  if(actionName==='home')return navigate('home');
  if(actionName==='lesson')return navigate('lesson/'+id);
  if(actionName==='resume')return navigate('session/'+id);
  if(actionName==='recommended')return start(path.recommended);
  if(actionName==='start')return start({mode:'learn',lesson_id:id});
  if(actionName==='topic')return start({mode:'topic',lesson_id:id});
  if(actionName==='review')return start({mode:'review'});
  if(actionName==='assessment')return start({mode:'assessment',lesson_id:'advanced'});
  if(actionName==='mistakes')return start({mode:'mistakes',source_session:id,lesson_id:session.lesson_id});
  if(actionName==='begin'){session=await api(`/sessions/${session.id}/ready`,{});exerciseView();focusHeading();}
  if(actionName==='hint'){
    const result=await api(`/sessions/${session.id}/hint`,{});$('#hint-box').hidden=false;$('#hint-box').textContent='Hint: '+result.hint;
  }
  if(actionName==='next'){
    const version=routeVersion;
    const nextSession=await api(`/sessions/${session.id}/continue?question_id=${encodeURIComponent(session.items[session.cursor].id)}`,{});
    if(version!==routeVersion)return;
    session=nextSession;
    if(session.status==='complete')summary();else exerciseView();focusHeading();window.scrollTo(0,0);
  }
  if(actionName==='save-lab'){
    const saved=await api('/labs/'+id,{notes:$('#notes-'+id).value,completed:$('#lab-done-'+id).checked});
    path.labs=path.labs.filter(l=>l.lesson_id!==id).concat(saved);$('#lab-status-'+id).textContent='Saved '+date(saved.timestamp)+' · self-reported evidence';notice('Lab notebook saved.');
  }
  if(actionName==='reset'){$('#reset-confirmation').value='';$('#reset-error').textContent='';$('#reset-dialog').showModal();}
}

document.addEventListener('click',async event=>{
  const element=event.target.closest('[data-action]');if(!element)return;
  event.preventDefault(); if(element.disabled)return; element.disabled=true;notice('');
  try {await action(element.dataset.action,element.dataset.id,element);}
  catch(error){notice(error.message);}
  finally{element.disabled=false;}
});
$('#cancel-replace').onclick=()=>$('#replace-dialog').close();
$('#resume-existing').onclick=()=>{$('#replace-dialog').close();navigate('session/'+path.active_session.id);};
$('#replace-existing').onclick=async()=>{
  const element=$('#replace-existing');element.disabled=true;
  try {await start({...pendingStart,replace_active:true});$('#replace-dialog').close();}
  catch(error){notice(error.message);}finally{element.disabled=false;}
};
$('#cancel-reset').onclick=()=>$('#reset-dialog').close();
$('#confirm-reset').onclick=async()=>{
  if($('#reset-confirmation').value!=='RESET LOCAL PROGRESS'){$('#reset-error').textContent='Type RESET LOCAL PROGRESS to confirm.';return;}
  const element=$('#confirm-reset');element.disabled=true;
  try {await api('/reset',{confirmation:'RESET LOCAL PROGRESS'});$('#reset-dialog').close();navigate('home');notice('Local progress reset.');}
  catch(error){$('#reset-error').textContent=error.message;}finally{element.disabled=false;}
};

async function route() {
  const version=++routeVersion;
  const [rawPage,id]=location.hash.slice(1).split('/');
  const page=rawPage||'home';
  const current=page==='lesson'?'pathway':page==='session'?'home':page;
  document.querySelectorAll('[data-nav]').forEach(a=>a.dataset.nav===current?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  $('#breadcrumb').textContent=({home:'Overview',pathway:'Topics',progress:'Progress & review',labs:'Lab notebook',session:'Practice',lesson:'Topic'})[page]||'Overview';
  notice('');
  try {
    const next=await api('/pathway');if(version!==routeVersion)return;path=next;
    if(page==='session') await sessionView(id,version);
    else if(page==='lesson')lessonView(id);
    else if(page==='pathway')pathway();
    else if(page==='progress')await progress(version);
    else if(page==='labs')main.innerHTML=heading('','Lab notebook','')+path.lessons.map(l=>labCard(l)).join('');
    else home();
    if(version===routeVersion){focusHeading();window.scrollTo(0,0);}
  }catch(error){if(version===routeVersion)main.innerHTML=`<div class="error-box" role="alert"><h1>Could not open this view.</h1><p>${escape(error.message)}</p><div class="actions">${button('Try again','retry','','secondary')}<a href="#home">Back to overview</a></div></div>`;}
}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="retry"]'))route();});
window.addEventListener('hashchange',route);
route();



document.addEventListener('click', async event => {
  if (!event.target.closest('[data-export]') || !document.querySelector('meta[name="study-storage"]')) return;
  event.preventDefault();
  try {
    const history = await api('/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(history,null,2)], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openshift-progress.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notice(error.message); }
});
