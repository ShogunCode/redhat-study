import {loadBank, selectItems, shuffle} from './bank.js';

const stamp = () => new Date().toISOString();
const day = 86400000;
const empty = () => ({sessions:[], attempts:[], labs:[]});
function fail(status, message) { throw Object.assign(new Error(message), {status}); }

function conceptsFor(lessons, attempts) {
  return lessons.map(lesson => {
    const rows = attempts.filter(a => a.mode !== 'mistakes' && a.concept_ids.includes(lesson.id));
    const successes = rows.filter(a => a.correct && !a.hinted);
    const sessions = new Set(successes.map(a => a.session_id)).size;
    const variants = new Set(successes.map(a => a.scenario_family)).size;
    const delayed = successes.some(a => Date.parse(a.timestamp) >= Date.parse(rows[0].timestamp) + day);
    const application = successes.some(a => a.stage === 'application');
    const recall = successes.length >= 3 && sessions >= 2 && variants >= 2 && delayed && application;
    let due = null, step = 0, miss = null;
    const seen = new Set();
    for (const a of rows) {
      const time = Date.parse(a.timestamp);
      if (!a.correct) {
        due = time + day;
        step = 0;
        miss = a.question_id;
      } else if (!a.hinted && !seen.has(a.session_id)) {
        if (!due || time >= due) {
          due = time + day * [1,3,7,14,30][Math.min(step, recall ? 4 : 3)];
          step = Math.min(step + 1, 4);
          miss = null;
        }
      } else if (!due) due = time + day;
      seen.add(a.session_id);
    }
    const status = due && due <= Date.now() ? 'Review due' : miss ? 'Learning' : recall ? 'Recall demonstrated' : rows.length ? 'Learning' : 'New';
    return {id:lesson.id, title:lesson.title, status, attempts:rows.length, independent_successes:successes.length,
      sessions, variants, delayed_check:delayed, application_check:application, due:due ? new Date(due).toISOString() : null,
      last_miss:miss, recall_demonstrated:recall};
  });
}

function grade(state, session, body) {
  const {question_id, idempotency_key, selected} = body;
  const previous = session.idempotency[idempotency_key];
  if (previous) {
    if (previous.question_id !== question_id || previous.selection !== [...selected].sort().join()) fail(409, 'Submission key already used.');
    return session.feedback[question_id];
  }
  const q = session.items[session.cursor];
  if (session.status !== 'active' || q.id !== question_id || session.feedback[q.id]) fail(409, 'Question position changed. Reload this session.');
  const choices = new Set(selected);
  if (!choices.size || choices.size !== selected.length || !selected.every(id => q.choices.some(c => c.id === id))
    || (q.kind !== 'multiple_selection' && choices.size !== 1)) fail(422, 'Check your selection.');
  const correct = q.choices.every(c => choices.has(c.id) === c.correct);
  const hinted = session.hints.includes(q.id);
  const answer = q.choices.find(c => c.correct).text;
  const result = {correct, hinted, selected, choices:q.choices, memory_cue:q.memory_cue, lab:q.lab,
    solved_manifest:(q.manifest_template || '').replaceAll(q.blank_token || '__BLANK__', () => answer)};
  session.feedback[q.id] = result;
  session.idempotency[idempotency_key] = {question_id, selection:[...selected].sort().join()};
  const {concept_ids, skill, difficulty, exams, objective_group, scenario_family, content_version, stage} = q;
  state.attempts.push({session_id:session.id, question_id, concept_ids, skill, difficulty, exams, objective_group,
    scenario_family, content_version, stage, mode:session.mode, timestamp:stamp(), correct, hinted, selected, answer_revealed:false});
  return result;
}

function handle(url, body, state, data) {
  const parsed = new URL(url, 'https://study.invalid');
  const [,route,id,action] = parsed.pathname.split('/');
  const {sessions, attempts, labs} = state;
  const concepts = conceptsFor(data.lessons, attempts);
  const active = sessions.find(s => s.status === 'active');
  const completed = new Set(sessions.filter(s => s.status === 'complete' && s.mode === 'learn').map(s => s.lesson_id));
  const next = data.lessons.find(l => !completed.has(l.id) && !l.exams.includes('EX200'))?.id || 'advanced';
  if (route === 'pathway') {
    const due = concepts.filter(c => c.status === 'Review due');
    return {profile:'Browser learner', baseline:'OpenShift 4.18', lessons:data.lessons.map((l,i) =>
      ({...l, progress:concepts[i], completed:completed.has(l.id), prerequisites_met:l.prerequisites.every(p => completed.has(p))})),
      recommended:{mode:due.length ? 'review' : 'learn', lesson_id:next, reason:due.length ? 'Review ' + due[0].title + ' today.' : 'Build the next foundation with guided practice and an independent check.'},
      due_count:due.length, active_session:active ? {...active, total:active.items.length} : null,
      completed_sessions:sessions.filter(s => s.status === 'complete').length, labs, bank_count:data.bank.length + data.advanced.length};
  }
  if (route === 'progress') return {concepts,labs,history:[...sessions].reverse().map(s => ({
    id:s.id, lesson_id:s.lesson_id, mode:s.mode, status:s.status, total:s.items.length, answered:Object.keys(s.feedback).length,
    correct:Object.values(s.feedback).filter(f => f.correct).length, created_at:s.created_at, completed_at:s.completed_at}))};
  if (route === 'export') return {format_version:1, exported_at:stamp(), profile:'Browser learner', attempts, concepts, sessions, labs};
  if (route === 'reset') {
    if (body?.confirmation !== 'RESET LOCAL PROGRESS') fail(422, 'Confirm the reset.');
    Object.assign(state, empty());
    return {reset:true};
  }
  if (route === 'labs') {
    if (!data.lessons.some(l => l.id === id) || body.notes.length > 5000) fail(422, 'Check your notebook entry.');
    const saved = {lesson_id:id, completed:body.completed, notes:body.notes, timestamp:stamp(), verification:'Self-reported; no cluster execution'};
    state.labs = labs.filter(l => l.lesson_id !== id).concat(saved);
    return saved;
  }
  if (route !== 'sessions') fail(404, 'Unknown study activity.');
  if (!id) {
    if (active && !body.replace_active) fail(409, 'Resume your active session or explicitly replace it.');
    const filters = {exam:'openshift', focus:'all', difficulty:'all', mode:'learn', ...body};
    const lesson_id = body.lesson_id || next;
    const items = structuredClone(selectItems(data,state,filters,lesson_id,concepts));
    if (!items.length) fail(422, 'No suitable questions right now. Try a guided lesson or topic practice.');
    if (active) active.status = 'abandoned';
    for (const q of items) q.choices = shuffle(q.choices).map(c => ({...c,id:crypto.randomUUID()}));
    const s = {id:crypto.randomUUID(), lesson_id, mode:filters.mode, filters, status:'active', cursor:0,
      created_at:stamp(), completed_at:null, items, feedback:{}, hints:[], idempotency:{}, teaching_seen:false};
    sessions.push(s);
    return s;
  }
  const s = sessions.find(s => s.id === id);
  if (!s) fail(404, 'This session is unavailable in this browser.');
  if (!action) return s;
  if (action === 'attempts') return grade(state,s,body);
  if (action === 'ready') { s.teaching_seen = true; return s; }
  const q = s.items[s.cursor];
  if (action === 'continue') {
    const expected = parsed.searchParams.get('question_id');
    if (s.items[s.cursor-1]?.id === expected) return s;
    if (s.status !== 'active' || q?.id !== expected || !s.feedback[expected]) fail(409, 'Check the current question before continuing.');
    if (++s.cursor === s.items.length) { s.status = 'complete'; s.completed_at = stamp(); }
    return s;
  }
  if (action === 'hint' && s.status === 'active') {
    if (!s.hints.includes(q.id)) s.hints.push(q.id);
    return {hint:q.hint};
  }
  fail(409, 'Session is finished.');
}

let connection;
function database() {
  connection ??= new Promise((resolve,reject) => {
    const req = indexedDB.open('redhat-study-workbench',1);
    req.onupgradeneeded = () => req.result.createObjectStore('learner');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}

export async function study(url, body) {
  const [db,data] = await Promise.all([database(), loadBank()]);
  // A read/write transaction serializes updates across tabs and rolls back on failure.
  return new Promise((resolve,reject) => {
    const writing = body !== undefined;
    const tx = db.transaction('learner', writing ? 'readwrite' : 'readonly');
    const store = tx.objectStore('learner');
    const request = store.get('progress');
    let result;
    request.onsuccess = () => {
      try {
        const state = request.result || empty();
        result = handle(url,body,state,data);
        if (writing) store.put(state,'progress');
      } catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Browser storage is unavailable. Check storage settings and try again.'));
  });
}
