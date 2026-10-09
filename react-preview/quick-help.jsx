import React, { useEffect, useRef, useState } from 'react';
import { Lumi } from './lumi.jsx';

const situations = [
  {
    id: 'conflict',
    icon: '☾',
    ru: {
      title: 'Мы поссорились',
      step: 'Сначала снизьте накал. Не пытайтесь решить весь спор, пока вы оба заведены. Предложите короткую паузу и назовите время возвращения к разговору.',
      phrase: '«Я сейчас уже плохо слушаю. Давай сделаем паузу на 20 минут и вернёмся к одному вопросу — без списка старых обид».',
      why: 'Пауза работает лучше, когда другой человек понимает, что вы не исчезаете и тема не брошена.',
    },
    en: {
      title: 'We had a fight',
      step: 'Lower the heat first. Do not solve the whole conflict while either of you is flooded. Suggest a short pause and name when you will return.',
      phrase: '“I am not listening well anymore. Can we take 20 minutes and come back to one issue — without reopening everything?”',
      why: 'A pause is clearer when the other person knows you are coming back and the topic is not being abandoned.',
    },
    target: 'module/conflict',
  },
  {
    id: 'request',
    icon: '◇',
    ru: {
      title: 'Хочу о чём-то попросить',
      step: 'Скажите, что конкретно произошло, почему это важно для вас и какое действие вы просите. Оставьте место для ответа «нет» или другого варианта.',
      phrase: '«Мне важно заранее понимать планы. Можешь написать до шести, если задерживаешься? Если неудобно — давай придумаем другой способ».',
      why: 'Конкретная просьба понятнее общей претензии и не требует от другого угадывать нужное действие.',
    },
    en: {
      title: 'I need to ask for something',
      step: 'Name what happened, why it matters to you, and the specific action you are asking for. Leave room for “no” or another option.',
      phrase: '“It helps me to know the plan ahead of time. Could you text me by six if you are running late? If that does not work, let’s find another way.”',
      why: 'A specific request is easier to answer than a broad complaint and does not make the other person guess.',
    },
    target: 'module/needs',
  },
  {
    id: 'unheard',
    icon: '◎',
    ru: {
      title: 'Кажется, меня не слышат',
      step: 'Сократите сообщение до одной мысли. Назовите наблюдение и попросите человека сначала вернуть услышанный смысл, а не сразу соглашаться.',
      phrase: '«Можно я скажу одну вещь, а ты сначала скажешь, как ты её понял(а)? Мне важно убедиться, что я объяснил(а) ясно».',
      why: 'Проверка понимания отделяет “не согласен” от “не понял” и часто снимает лишний спор.',
    },
    en: {
      title: 'I do not feel heard',
      step: 'Reduce your message to one point. Name the observation and ask the other person to reflect back what they heard before agreeing or disagreeing.',
      phrase: '“Can I say one thing, and could you first tell me what you heard? I want to make sure I explained it clearly.”',
      why: 'Checking understanding separates “I disagree” from “I did not understand,” which can prevent an unnecessary argument.',
    },
    target: 'module/listening',
  },
  {
    id: 'apology',
    icon: '♡',
    ru: {
      title: 'Хочу извиниться',
      step: 'Не объясняйте намерения раньше, чем признаете действие и его влияние. Извинение можно закончить вопросом о том, что сейчас было бы полезно.',
      phrase: '«Я сказал(а) это резко и вижу, что тебе было больно. Мне жаль. Я не хочу оправдываться. Что сейчас помогло бы немного восстановить разговор?»',
      why: 'Сначала признание воздействия, потом контекст. Так “извини, но…” не обнуляет само извинение.',
    },
    en: {
      title: 'I want to apologize',
      step: 'Do not explain your intention before naming what you did and its impact. You can end the apology by asking what would help now.',
      phrase: '“I said that harshly, and I can see it hurt you. I am sorry. I do not want to defend it. What would help us repair this conversation a little?”',
      why: 'Acknowledging the impact before adding context keeps “sorry, but…” from cancelling the apology.',
    },
    target: 'module/conflict',
  },
  {
    id: 'money',
    icon: '⌂',
    ru: {
      title: 'Надо поговорить о деньгах',
      step: 'Не начинайте с суммы в момент раздражения. Сначала договоритесь о времени, откройте одни и те же цифры и выберите один вопрос, который хотите решить сегодня.',
      phrase: '«Хочу спокойно посмотреть наши расходы, без поиска виноватого. Давай сегодня 20 минут посмотрим цифры и решим только один вопрос — бюджет на следующий месяц?»',
      why: 'Общий набор фактов и одна задача уменьшают риск превратить разговор о деньгах в спор обо всём сразу.',
    },
    en: {
      title: 'We need to talk about money',
      step: 'Do not start with a number in the middle of frustration. Agree on a time, look at the same figures, and choose one decision for today.',
      phrase: '“I want us to look at our spending calmly, without finding someone to blame. Can we spend 20 minutes on the numbers and decide just one thing — next month’s budget?”',
      why: 'Shared facts and one decision make it less likely that a money conversation turns into a fight about everything.',
    },
    target: 'module/household',
  },
];

function PhraseCopy({ phrase, t }) {
  const [state, setState] = useState('');
  const phraseRef = useRef(null);
  const request = useRef(0);
  // A new scenario/language mounts a new control. Its pending request must not
  // announce a result for the phrase now on screen or update an unmounted view.
  useEffect(() => () => { request.current += 1; }, []);

  async function copyPhrase() {
    const activeRequest = ++request.current;
    setState('copying');
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(phrase);
      if (request.current === activeRequest) setState('copied');
    } catch {
      if (request.current === activeRequest) setState('failed');
    }
  }

  function selectPhrase() {
    const node = phraseRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    node.focus();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return <>
    <blockquote ref={phraseRef} tabIndex={-1} data-testid="quick-help-phrase">{phrase}</blockquote>
    <div className="button-row">
      <button className="secondary" disabled={state === 'copying'} onClick={copyPhrase}>{state === 'copying' ? t('Копируем…', 'Copying…') : t('Скопировать фразу', 'Copy phrase')}</button>
      {state === 'failed' && <button className="secondary" onClick={selectPhrase}>{t('Выделить фразу', 'Select phrase')}</button>}
    </div>
    {state && <p role="status" data-testid="quick-help-copy-status">{state === 'copied' ? t('Фраза скопирована.', 'Phrase copied.') : state === 'copying' ? t('Копируем фразу…', 'Copying the phrase…') : t('Не удалось скопировать автоматически. Выделите фразу и скопируйте её через меню устройства или Ctrl/Cmd+C.', 'Could not copy automatically. Select the phrase and copy it using your device menu or Ctrl/Cmd+C.')}</p>}
  </>;
}

export function QuickHelp({ t, lang, scenarioId, go }) {
  const selected = situations.find((item) => item.id === scenarioId) || null;
  const copy = selected?.[lang] || null;

  return <section className="content-page quick-help" data-testid="quick-help">
    <span className="eyebrow">{t('ПОМОГИ МНЕ СЕЙЧАС', 'HELP ME NOW')}</span>
    <h1 id="page-title" tabIndex={-1}>{selected ? copy.title : t('Что происходит прямо сейчас?', 'What is happening right now?')}</h1>
    {!selected ? <>
      <p className="lead">{t('Выберите ближайшую ситуацию. Луми даст один следующий шаг и пример фразы — без теста, регистрации и записи в прогресс.', 'Choose the closest situation. Lumi will give you one next step and a sample phrase — no quiz, sign-in, or progress tracking.')}</p>
      <Lumi t={t} message={t('Не нужно чинить весь разговор. Найдём один следующий шаг.', 'You do not have to fix the whole conversation. Let’s find one next step.')}/>
      <div className="quick-help-grid">
        {situations.map((item) => <button key={item.id} className="quick-help-choice" onClick={() => go(`now/${item.id}`)}>
          <span aria-hidden="true">{item.icon}</span>
          <strong>{item[lang].title}</strong>
          <small>{t('Один шаг + пример фразы', 'One step + a sample phrase')}</small>
        </button>)}
      </div>
      <div className="quick-help-footer">
        <button className="secondary" onClick={() => go('start')}>{t('Лучше пройти 3 вопроса и разобраться глубже', 'I would rather answer 3 questions and go deeper')}</button>
      </div>
    </> : <>
      <Lumi t={t} mood="support" message={t('Сейчас не нужен идеальный разговор. Нужен следующий безопасный шаг.', 'You do not need a perfect conversation right now. You need the next safe step.')}/>
      <article className="quick-help-result card">
        <span className="quick-help-result-icon" aria-hidden="true">{selected.icon}</span>
        <h2>{t('Сначала сделайте это', 'Start with this')}</h2>
        <p className="lead">{copy.step}</p>
        <h2>{t('Можно сказать так', 'You could say')}</h2>
        <PhraseCopy key={`${selected.id}:${lang}`} phrase={copy.phrase} t={t}/>
        <p className="muted">{copy.why}</p>
        <div className="button-row">
          <button className="primary" onClick={() => go(selected.target)}>{t('Открыть подходящую орбиту', 'Open the matching orbit')} →</button>
          <button className="secondary" onClick={() => go('now')}>← {t('Другая ситуация', 'Another situation')}</button>
        </div>
      </article>
    </>}
    <p className="quick-help-safety">{t('Если есть страх, угрозы, принуждение или риск насилия, важнее безопасность и помощь людей или служб, которым вы доверяете, а не продолжение разговора.', 'If there is fear, threats, coercion, or risk of violence, prioritize safety and trusted people or services rather than continuing the conversation.')}</p>
  </section>;
}

export const QUICK_HELP_IDS = situations.map((item) => item.id);
