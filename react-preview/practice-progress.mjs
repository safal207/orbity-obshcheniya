import { dailyStatus } from './personal-path.mjs';

export function practiceProgress(state, now = Date.now()) {
  const status = dailyStatus(state, now);
  const sessions = state?.sessions || [];
  const outcomes = { tried: 0, difficult: 0, 'no-chance': 0, unrecorded: 0 };
  for (const session of sessions) outcomes[session.reflection?.outcome || 'unrecorded']++;
  const last = sessions.at(-1) || null;
  let action;
  if (!last) action = 'start';
  else if (!last.reflection) action = 'reflect';
  else if (last.reflection.outcome === 'difficult') action = 'rehearse';
  else if (last.reflection.outcome === 'no-chance') action = 'prepare';
  else if (status.phase === 'ready') action = 'continue';
  else action = 'apply';
  return { status, first: sessions[0] || null, last, outcomes, action };
}

export function learningFocus(state, modules, lang = 'ru') {
  const id = state?.focusModule || state?.guidedFlow?.topic;
  const module = modules.find(item => item.id === id);
  if (!module) return null;
  const reason = id === 'listening'
    ? ['Чтобы вас услышали, полезно назвать, какого внимания или помощи вы хотите. Это и тренируем в личном пути.',
      'Naming the attention or help you want can make your request clearer. This is what the personal path practises.']
    : id === 'conflict'
      ? ['После паузы можно вернуться к одной потребности и конкретной просьбе. В личном пути подготовим ваши слова.',
        'After a pause, you can return to one need and a specific request. The personal path helps you prepare your words.']
      : ['В личном пути будем формулировать свои потребности и просьбы. К выбранной теме курса можно вернуться в любое время.',
        'The personal path practises expressing your needs and requests. You can return to your chosen course topic at any time.'];
  return { id, title: module.title, reason: reason[lang === 'en' ? 1 : 0], route: `module/${id}` };
}
