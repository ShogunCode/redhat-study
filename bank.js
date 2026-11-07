let loading;
export function loadBank() {
  loading ??= fetch(new URL('study.json', import.meta.url)).then(response => {
    if (!response.ok) throw new Error('Could not download the study questions. Please try again.');
    return response.json();
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function selectItems(data, state, filters, lessonId, concepts) {
  const {mode, exam, focus, difficulty} = filters;
  const latest = new Map(state.attempts.map(a => [a.question_id, a.timestamp]));
  function choose(pool, count, balanced = false) {
    const remaining = shuffle(pool);
    const result = [], topics = new Map(), skills = new Map(), families = new Set();
    while (result.length < count) {
      const candidates = remaining.filter(q => !families.has(q.scenario_family));
      if (!candidates.length) break;
      candidates.sort((a,b) =>
        (balanced && ((topics.get(a.lesson_id)||0) - (topics.get(b.lesson_id)||0)
          || (skills.get(a.skill)||0) - (skills.get(b.skill)||0))) ||
        (latest.get(a.id)||'').localeCompare(latest.get(b.id)||''));
      const q = candidates[0];
      result.push(q);
      families.add(q.scenario_family);
      topics.set(q.lesson_id, (topics.get(q.lesson_id)||0)+1);
      skills.set(q.skill, (skills.get(q.skill)||0)+1);
    }
    return result;
  }
  const all = [...data.bank, ...data.advanced];
  if (mode === 'mixed' || mode === 'assessment') {
    return choose(all.filter(q => (mode !== 'assessment' || q.exams.includes('EX380'))
      && (exam === 'all' || q.exams.includes(exam) || (exam === 'openshift' && q.exams.some(e => e === 'EX280' || e === 'EX380')))
      && (focus === 'all' || focus === q.skill || (focus === 'yaml' && ['configuration','interpretation'].includes(q.skill)))
      && (difficulty === 'all' || difficulty === q.difficulty)), 10, true);
  }
  if (mode === 'mistakes') {
    const source = state.sessions.find(s => s.id === filters.source_session);
    const wrong = source.items.filter(q => source.feedback[q.id]?.correct === false);
    const ids = new Set(wrong.flatMap(q => q.concept_ids));
    const fresh = choose(all.filter(q => !latest.has(q.id) && q.concept_ids.some(id => ids.has(id))), wrong.length);
    const families = new Set(fresh.map(q => q.scenario_family));
    return fresh.concat(choose(wrong.filter(q => !families.has(q.scenario_family)), wrong.length - fresh.length));
  }
  const due = concepts.filter(c => c.status === 'Review due').sort((a,b) => a.due.localeCompare(b.due));
  if (mode === 'review') {
    const pools = due.map(c => choose(data.bank.filter(q => q.lesson_id === c.id), 10));
    const result = [];
    while (pools.some(p => p.length) && result.length < 10) {
      for (const pool of pools) if (pool.length && result.length < 10) result.push(pool.shift());
    }
    return result;
  }
  const pool = data.bank.filter(q => q.lesson_id === lessonId);
  if (mode === 'topic') return choose(pool, 10, true);
  const review = choose(data.bank.filter(q => q.lesson_id !== lessonId && due.some(c => c.id === q.lesson_id)), 2);
  const stages = review.length ? ['guided','transfer','application'] : ['intro','guided','transfer','application'];
  return review.concat(stages.flatMap(stage => pool.filter(q => q.guided !== false && q.stage === stage && q.kind !== 'yaml_repair'))).slice(0,10);
}
