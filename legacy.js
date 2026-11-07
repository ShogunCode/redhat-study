import {loadBank, shuffle} from './bank.js';

export async function legacy(url, options) {
  const data = await loadBank();
  const {pathname,searchParams} = new URL(url,'https://study.invalid');
  const platform = searchParams.get('platform') || 'all';
  const difficulty = searchParams.get('difficulty') || 'all';
  const body = options?.body ? JSON.parse(options.body) : {};
  const linux = platform === 'openshift' ? [] : data.linux;
  const openshift = platform === 'rhcsa' ? [] : data.openshift.filter(q => difficulty === 'all' || difficulty === q.difficulty);
  const publicQuestion = q => ({id:q.id, objective:q.question, topic:'OpenShift: ' + q.topic, platform:'openshift',
    scenario:q.scenario, kind:q.kind, difficulty:q.difficulty, choices:shuffle(q.choices)});
  if (pathname === '/questions') return linux.concat(openshift.map(publicQuestion));
  if (pathname === '/fill_blank') {
    const blanks = platform === 'openshift' ? [] : data.blanks.map(q => ({...q, choices:shuffle([q.answer,...shuffle(q.incorrect).slice(0,3)])}));
    return shuffle(blanks.concat(openshift.filter(q => q.kind === 'fill_blank').map(publicQuestion)));
  }
  if (pathname === '/random') {
    const pools = shuffle(['easy','medium','hard']).map(level => shuffle(openshift.filter(q => q.difficulty === level)));
    const oc = [];
    while (pools.some(p => p.length)) for (const p of pools) if (p.length) oc.push(p.pop().id);
    const ids = shuffle(linux.map(q => q.id));
    const cap = platform === 'all' ? 5 : 10;
    const chosen = ids.slice(0,cap).concat(oc.slice(0,cap));
    const rest = shuffle([...ids,...oc].filter(id => !chosen.includes(id)));
    return shuffle(chosen.concat(rest).slice(0,10));
  }
  if (pathname === '/selection-answer') {
    const q = openshift.find(q => q.id === body.id);
    const choices = q.choices.map(c => ({...c, selected:body.selected.includes(c.id)}));
    const correct = choices.every(c => c.correct === c.selected);
    return {correct, feedback:correct ? 'Correct — all required choices selected.' : 'Review the selected and missed choices below.', choices};
  }
  if (pathname === '/answer') {
    const q = linux.find(q => q.id === body.id);
    const cmd = body.cmd.trim().replace(/\s+/g,' ');
    const correct = q.patterns.some(pattern => new RegExp('^(?:' + pattern + ')$').test(cmd));
    return {correct,feedback:(correct ? '✅ Correct!' : '❌ Not quite—try again.') + '\n' + (q.explanation || '')};
  }
  if (pathname.startsWith('/solution/')) return linux.find(q => String(q.id) === pathname.split('/')[2]).solution;
  throw new Error('Unknown practice activity.');
}
