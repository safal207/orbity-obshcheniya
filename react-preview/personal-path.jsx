import React, { useEffect, useRef, useState } from 'react';
import { dailyStatus } from './personal-path.mjs';
import { personalPathContent } from './personal-path-content.mjs';
import { LumiPortrait } from './lumi.jsx';
import './personal-path.css';

const addresses = ['her', 'him', 'neutral'];
const outcomes = ['tried', 'difficult', 'no-chance'];
const emptyDraft = { phrase: '', plan: '' };

function errorText(error, t) {
  const code = typeof error === 'string' ? error : error?.code;
  const messages = {
    PERSONAL_STORAGE_FAILED: ['Не удалось сохранить на устройстве. Ваш текст остаётся здесь. Проверьте доступ к хранилищу и повторите.', 'Could not save on this device. Your text is still here. Check storage access and try again.'],
    PERSONAL_INVALID_STORED: ['Не удалось прочитать личный путь. Сохранённые данные не изменены. Попробуйте перечитать их.', 'Your personal path could not be read. Stored data has not been changed. Try reading it again.'],
    PERSONAL_LOCK_UNAVAILABLE: ['Браузер сейчас не позволяет безопасно сохранить личный путь. Ваш текст остаётся здесь.', 'This browser cannot safely save your personal path right now. Your text is still here.'],
    PERSONAL_LOCK_TIMEOUT: ['Другая вкладка занята сохранением. Подождите немного и повторите. Ваш текст остаётся здесь.', 'Another tab is busy saving. Wait a moment and try again. Your text is still here.'],
    PERSONAL_CONFLICT: ['Личный путь изменился в другой вкладке. Проверьте сохранённые данные ниже. Ваш черновик остаётся здесь.', 'Your personal path changed in another tab. Review the saved information below. Your draft is still here.'],
    PERSONAL_DONE_TODAY: ['Сегодня занятие уже завершено. Ниже — сохранённая фраза. Ваш новый черновик не потерян.', 'A session has already been completed today. The saved phrase is below. Your new draft has been kept.'],
    PERSONAL_INVALID_INPUT: ['Проверьте поля и повторите сохранение. Ваш текст остаётся здесь.', 'Check the fields and try saving again. Your text is still here.'],
    PERSONAL_NOT_REGISTERED: ['Сначала сохраните профиль на этом устройстве.', 'First, save a profile on this device.']
  };
  return error?.messageForUser || t(...(messages[code] || ['Не удалось сохранить изменение. Ваш текст остаётся здесь. Попробуйте ещё раз.', 'Could not save the change. Your text is still here. Please try again.']));
}

/** Form drafts deliberately live here, not in the course progress store. The parent
 * keeps this component mounted across routes and guards unloading while dirty. */
export function PersonalPath({ lang, state, loaded, error, store, run, refresh, now = Date.now(), active, onDirtyChange, go }) {
  const t = (ru, en) => lang === 'en' ? en : ru;
  const content = personalPathContent[lang === 'en' ? 'en' : 'ru'];
  const status = dailyStatus(state, now);
  const [address, setAddress] = useState('neutral');
  const [baseline, setBaseline] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [reflectionDrafts, setReflectionDrafts] = useState({});
  const [editingReflection, setEditingReflection] = useState(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState('');
  const saving = useRef(false);
  const heading = useRef(null);
  const errorRef = useRef(null);
  const phaseRef = useRef(`${status.phase}:${status.index}`);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const dirty = Object.values(drafts).some(draft => draft.phrase || draft.plan) ||
    Object.values(reflectionDrafts).some(draft => draft.outcome || draft.note);

  useEffect(() => { onDirtyChange?.(Boolean(dirty)); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    const key = `${status.phase}:${status.index}`;
    if (phaseRef.current !== key && active) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start' });
    }
    phaseRef.current = key;
  }, [active, status.phase, status.index]);
  useEffect(() => {
    if (errorAttempt && active) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [errorAttempt, active]);

  function showError(value) { setFailure(value); setErrorAttempt(attempt => attempt + 1); }
  async function mutate(action, after) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setFailure(null);
    setNotice('');
    try {
      const result = await run(action);
      after?.(result);
    } catch (cause) { showError(cause); }
    finally { saving.current = false; setPending(false); }
  }
  function changeDraft(index, field, value) {
    setDrafts(previous => ({ ...previous, [index]: { ...(previous[index] || emptyDraft), [field]: value } }));
    setFailure(null);
  }
  function changeReflection(index, field, value) {
    setReflectionDrafts(previous => ({ ...previous, [index]: {
      ...(previous[index] || { outcome: state.sessions[index]?.reflection?.outcome || '', note: state.sessions[index]?.reflection?.note || '', revision: state.revision }),
      [field]: value
    } }));
    setFailure(null);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t('Текст скопирован.', 'Text copied.'));
    } catch {
      setNotice(t('Не удалось скопировать автоматически. Можно выделить текст и скопировать его вручную.', 'Could not copy automatically. You can select the text and copy it manually.'));
    }
  }
  function exportPhrases() {
    const lines = [t('Мой путь · Говорить о своих потребностях', 'My path · Expressing my needs'), '', ...state.sessions.flatMap(session => [
      `${t('Занятие', 'Session')} ${session.index + 1}: ${content[session.index].title}`,
      session.phrase,
      ...(session.plan ? [`${t('Мой план', 'My plan')}: ${session.plan}`] : []),
      ...(session.reflection ? [`${t('Как получилось', 'How it went')}: ${outcomeLabel(session.reflection.outcome)}`, session.reflection.note] : []), ''
    ])];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orbity-my-phrases.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(t('Подготовлен файл с вашими фразами. Это текст для себя, а не резервная копия профиля.', 'Your phrases file is ready. It is a text file for you, not a profile backup.'));
  }
  function addressLabel(value) {
    return value === 'her' ? t('Для неё', 'For her') : value === 'him' ? t('Для него', 'For him') : t('Без обращения', 'No preference');
  }
  function outcomeLabel(value) {
    return value === 'tried' ? t('Удалось попробовать', 'I tried it') : value === 'difficult' ? t('Было трудно', 'It was difficult') : t('Пока не было случая', 'No chance yet');
  }
  const completed = state?.sessions || [];
  const current = content[status.index];
  const draft = drafts[status.index] || emptyDraft;
  const lastSession = completed.at(-1);
  const retainedDrafts = Object.entries(drafts).filter(([index, value]) => Number(index) < completed.length && (value.phrase || value.plan));
  const visibleError = failure || error;
  const title = !loaded ? t('Мой личный путь', 'My personal path') : status.phase === 'new' ? t('Начнём с того, что важно вам', 'Start with what matters to you') : status.phase === 'week-done' ? t('Семь шагов — ваши слова', 'Seven steps, in your own words') : status.phase === 'done-today' ? t('На сегодня достаточно', 'That is enough for today') : current.title;

  function reflectionCard(session) {
    if (!session) return null;
    const saved = session.reflection;
    const local = reflectionDrafts[session.index];
    const value = local || { outcome: saved?.outcome || '', note: saved?.note || '', revision: state.revision };
    const stale = local && local.revision !== state.revision;
    const editing = !saved || editingReflection === session.index || Boolean(local);
    return <section className="personal-card personal-reflection" aria-labelledby={`daily-reflection-title-${session.index}`} data-testid="daily-reflection">
      <span className="personal-eyebrow">{t('Необязательно · вернуться к опыту', 'Optional · reflect on your experience')}</span>
      <h2 id={`daily-reflection-title-${session.index}`}>{t('Удалось попробовать?', 'Did you get to try it?')}</h2>
      <p>{t(`К занятию ${session.index + 1}: «${content[session.index].title}». Можно потренироваться для себя; разговор с другим человеком не обязателен.`, `For session ${session.index + 1}: “${content[session.index].title}”. Practising on your own counts; a conversation with someone else is optional.`)}</p>
      {saved && <div className="personal-saved-reflection" data-testid="daily-reflection-saved">
        <strong>{t('Сохранённый ответ', 'Saved reflection')}: {outcomeLabel(saved.outcome)}</strong>
        {saved.note && <p className="personal-written">{saved.note}</p>}
        {!editing && <button type="button" className="secondary" disabled={pending} onClick={() => {
          setEditingReflection(session.index);
          setReflectionDrafts(previous => ({ ...previous, [session.index]: { ...saved, revision: state.revision } }));
        }}>{t('Изменить ответ', 'Edit reflection')}</button>}
      </div>}
      {editing && <form onSubmit={event => {
        event.preventDefault();
        if (!value.outcome) { showError({ messageForUser: t('Выберите, как получилось. Можно ответить «Пока не было случая».', 'Choose how it went. “No chance yet” is a valid answer.') }); return; }
        if (stale) { showError({ code: 'PERSONAL_CONFLICT' }); return; }
        mutate(() => store.reflect({ index: session.index, outcome: value.outcome, note: value.note, expectedRevision: value.revision }), () => {
          setReflectionDrafts(previous => { const next = { ...previous }; delete next[session.index]; return next; });
          setEditingReflection(null);
          setNotice(t('Ответ сохранён. Можно двигаться в своём темпе.', 'Reflection saved. Keep going at your own pace.'));
        });
      }}>
        <fieldset disabled={pending || Boolean(error)}>
          <legend className="visually-hidden">{t('Как получилось', 'How it went')}</legend>
          <div className="personal-outcomes">{outcomes.map(outcome => <label key={outcome} className={value.outcome === outcome ? 'selected' : ''}>
            <input type="radio" name={`daily-reflection-${session.index}`} value={outcome} checked={value.outcome === outcome}
              data-testid={`daily-outcome-${outcome}`} onChange={() => changeReflection(session.index, 'outcome', outcome)}/>
            <span>{outcomeLabel(outcome)}</span>
          </label>)}</div>
          <label className="personal-field" htmlFor={`daily-reflection-note-${session.index}`}>{t('Что заметили? Необязательно', 'What did you notice? Optional')}</label>
          <textarea id={`daily-reflection-note-${session.index}`} data-testid="daily-reflection-note" maxLength={1000} value={value.note}
            onChange={event => changeReflection(session.index, 'note', event.target.value)} rows={3}/>
          {stale && <div className="personal-inline-note">
            <p>{t('Данные изменились, пока вы писали. Выше показан актуальный сохранённый ответ, если он есть. Ваш текст в поле сохранён.', 'Data changed while you were writing. The current saved reflection, if any, is shown above. Your text is still in the field.')}</p>
            <button type="button" className="secondary" data-testid="daily-reflection-review" onClick={() => {
              setReflectionDrafts(previous => ({ ...previous, [session.index]: { ...previous[session.index], revision: state.revision } }));
              setFailure(null);
            }}>{t('Данные проверены — оставить мой черновик', 'I reviewed it — keep my draft')}</button>
          </div>}
          <button className="secondary" type="submit" data-testid="daily-reflect-save" disabled={pending || Boolean(stale)}>{pending ? t('Сохраняем…', 'Saving…') : t('Сохранить ответ', 'Save reflection')}</button>
          {local && <button className="personal-text-button" type="button" onClick={() => {
            setReflectionDrafts(previous => { const next = { ...previous }; delete next[session.index]; return next; });
            setEditingReflection(null);
          }}>{t('Отменить изменения ответа', 'Discard reflection changes')}</button>}
        </fieldset>
      </form>}
    </section>;
  }

  return <section className="personal-path" data-testid="personal-path">
    <header className="personal-heading">
      <span className="personal-eyebrow">{t('Мой путь · говорить о своих потребностях', 'My path · expressing my needs')}</span>
      <h1 ref={heading} id={active ? 'page-title' : undefined} tabIndex={-1}>{title}</h1>
      {state && <div className="personal-progress">
        <div className="personal-progress-dots" aria-hidden="true">{content.map((_, index) => <span key={index} className={index < completed.length ? 'complete' : index === status.index && status.phase === 'ready' ? 'current' : ''}>{index < completed.length ? '✓' : index + 1}</span>)}</div>
        <p>{t(`Завершено ${completed.length} из 7 занятий`, `${completed.length} of 7 sessions completed`)}<span> · {t('Пропуски не обнуляют путь', 'Missed days do not reset your path')}</span></p>
      </div>}
    </header>
    {visibleError && <div className="alert personal-error" data-testid="daily-error" role="alert" tabIndex={-1} ref={errorRef}>
      <p>{errorText(visibleError, t)}</p>
      {error && <button className="secondary" type="button" onClick={() => { const result = refresh(); if (result !== undefined) setFailure(null); }}>{t('Перечитать данные', 'Read data again')}</button>}
    </div>}
    <p className="personal-status" role="status" aria-live="polite">{notice}</p>
    {error && !state && dirty && <section className="personal-card personal-retained" data-testid="daily-draft-recovery">
      <h2>{t('Ваш текст остаётся здесь', 'Your text is still here')}</h2>
      <p>{t('Пока сохранённый путь недоступен, новые изменения не сохраняются. Можно скопировать черновики ниже. После восстановления доступа вы сможете продолжить.', 'While the saved path is unavailable, new changes cannot be saved. You can copy your drafts below. You can continue when storage access is restored.')}</p>
      {Object.entries(drafts).filter(([, value]) => value.phrase || value.plan).map(([index, value]) => <div className="personal-recovery-entry" data-testid="daily-recovery-phrase" key={`phrase-${index}`}>
        <h3>{t(`Фраза · занятие ${Number(index) + 1}`, `Phrase · session ${Number(index) + 1}`)}</h3>
        <blockquote className="personal-written">{value.phrase}</blockquote>
        {value.plan && <p className="personal-written">{value.plan}</p>}
        <div className="personal-actions"><button className="secondary" type="button" onClick={() => copy([value.phrase, value.plan].filter(Boolean).join('\n'))}>{t('Скопировать черновик', 'Copy draft')}</button>
          <button className="personal-text-button" type="button" disabled={pending} onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[index]; return next; })}>{t('Убрать этот черновик', 'Discard this draft')}</button></div>
      </div>)}
      {Object.entries(reflectionDrafts).map(([index, value]) => <div className="personal-recovery-entry" data-testid="daily-recovery-reflection" key={`reflection-${index}`}>
        <h3>{t(`Ответ об опыте · занятие ${Number(index) + 1}`, `Reflection · session ${Number(index) + 1}`)}</h3>
        {value.outcome && <p>{outcomeLabel(value.outcome)}</p>}
        {value.note && <p className="personal-written">{value.note}</p>}
        <div className="personal-actions"><button className="secondary" type="button" onClick={() => copy([value.outcome ? outcomeLabel(value.outcome) : '', value.note].filter(Boolean).join('\n'))}>{t('Скопировать ответ', 'Copy reflection')}</button>
          <button className="personal-text-button" type="button" disabled={pending} onClick={() => {
            setReflectionDrafts(previous => { const next = { ...previous }; delete next[index]; return next; });
            if (editingReflection === Number(index)) setEditingReflection(null);
          }}>{t('Убрать этот черновик', 'Discard this draft')}</button></div>
      </div>)}
    </section>}
    {!loaded ? <p>{t('Читаем ваш путь…', 'Loading your path…')}</p> : <>
      {status.phase === 'new' && !error && <form className="personal-card personal-onboarding" data-testid="daily-profile" onSubmit={event => { event.preventDefault(); mutate(() => store.register({ address, baseline })); }}>
        <div className="personal-lumi"><LumiPortrait/><p>{t('Я Луми. Помогу каждый день находить слова для того, что важно вам.', 'I’m Lumi. Each day, I’ll help you find words for what matters to you.')}</p></div>
        <h2>{t('Одна фраза в день, которую можно использовать в жизни', 'One phrase a day that you can use in real life')}</h2>
        <ol className="personal-cycle">
          <li>{t('Разберём одну обычную ситуацию.', 'Explore one everyday situation.')}</li>
          <li>{t('Вы напишете свою фразу и сохраните её.', 'Write and save your own phrase.')}</li>
          <li>{t('Завтра вернёмся к опыту и сделаем следующий шаг.', 'Return to your experience tomorrow and take the next step.')}</li>
        </ol>
        <p className="personal-muted">{t('7 коротких занятий, примерно по 5 минут. Можно идти с перерывами и практиковаться самостоятельно.', '7 short sessions, about 5 minutes each. You can take breaks and practise on your own.')}</p>
        <fieldset disabled={pending}>
          <legend>{t('Как оформить ваш профиль?', 'How would you like to set up your profile?')}</legend>
          <div className="personal-addresses">{addresses.map(value => <button key={value} className={address === value ? 'selected' : ''} type="button"
            data-testid={`daily-address-${value}`} aria-pressed={address === value} onClick={() => setAddress(value)}>{addressLabel(value)}</button>)}</div>
          <p className="personal-muted">{t('Упражнения одинаковые для всех. Обращение можно изменить.', 'The exercises are the same for everyone. You can change this preference.')}</p>
          <fieldset className="personal-baseline">
            <legend>{t('Насколько легко вам говорить о своих потребностях? Необязательно', 'How easy is it for you to express your needs? Optional')}</legend>
            <div className="personal-scale">{[1, 2, 3, 4, 5].map(value => <label key={value} className={baseline === value ? 'selected' : ''}>
              <input type="radio" name="daily-baseline" value={value} checked={baseline === value} data-testid={`daily-baseline-${value}`} onChange={() => setBaseline(value)}/>
              <span>{value}</span>
            </label>)}</div>
            <div className="personal-scale-labels"><span>{t('1 — пока трудно', '1 — difficult for now')}</span><span>{t('5 — легко', '5 — easy')}</span></div>
            {baseline !== null && <button type="button" className="personal-text-button" onClick={() => setBaseline(null)}>{t('Пропустить оценку', 'Skip this rating')}</button>}
          </fieldset>
          <p className="personal-local-note">{t('Профиль и фразы сохраняются только в этом браузере на этом устройстве. Очистка данных браузера может их удалить. Пока без регистрации и синхронизации.', 'Your profile and phrases are saved only in this browser on this device. Clearing browser data can remove them. There is no sign-in or sync yet.')}</p>
          <button className="primary" type="submit" data-testid="daily-register" disabled={pending}>{pending ? t('Сохраняем…', 'Saving…') : t('Начать первый шаг', 'Start my first step')}</button>
        </fieldset>
      </form>}

      {status.phase === 'ready' && state && <>
        <div className="personal-lumi personal-session-lumi"><LumiPortrait/><p>{current.lumi}</p></div>
        <p className="personal-session-meta">{t(`Занятие ${status.index + 1} из 7 · около 5 минут`, `Session ${status.index + 1} of 7 · about 5 minutes`)}</p>
        <section className="personal-card personal-example" aria-labelledby="daily-situation-title">
          <span className="personal-step">{t('1 · Заметим ситуацию', '1 · Notice the situation')}</span>
          <h2 id="daily-situation-title">{current.skill}</h2>
          <p>{current.situation}</p><p className="personal-principle">{current.principle}</p>
          <div className="personal-example-phrase"><span>{t('Например', 'For example')}</span><blockquote>{current.example}</blockquote></div>
        </section>
        <form className="personal-card personal-practice" onSubmit={event => {
          event.preventDefault();
          if (draft.phrase.trim().length < 8) {
            showError({ messageForUser: t('Напишите свою фразу — хотя бы 8 знаков. Можно начать с подсказки под полем.', 'Write your own phrase — at least 8 characters. The hint below the field can help you start.') });
            return;
          }
          const index = status.index;
          const submitted = { ...draft };
          mutate(() => store.complete({ index, ...submitted }), () => {
            setDrafts(previous => { const next = { ...previous }; if (next[index]?.phrase === submitted.phrase && next[index]?.plan === submitted.plan) delete next[index]; return next; });
          });
        }}>
          <fieldset disabled={pending || Boolean(error)}>
            <legend className="personal-step">{t('2 · Найдём ваши слова', '2 · Find your own words')}</legend>
            <label htmlFor="daily-phrase" className="personal-field personal-field-title">{current.prompt}</label>
            <textarea id="daily-phrase" data-testid="daily-phrase" value={draft.phrase} maxLength={2000} rows={5} aria-describedby="daily-phrase-hint daily-draft-note"
              onChange={event => changeDraft(status.index, 'phrase', event.target.value)}/>
            <p id="daily-phrase-hint" className="personal-hint">{t('Можно начать так: ', 'You can start with: ')}{current.starter}</p>
            <div className="personal-self-check"><h3>{t('Проверьте себя', 'A quick self-check')}</h3><ul>{current.checks.map(check => <li key={check}>{check}</li>)}</ul>
              <p>{t('Оценку за фразу никто не ставит. Вы решаете, подходят ли вам эти слова.', 'Your phrase is not graded. You decide whether these words work for you.')}</p></div>
            <label htmlFor="daily-plan" className="personal-field">{t('Где хотите попробовать? Необязательно', 'Where would you like to try it? Optional')}</label>
            <textarea id="daily-plan" data-testid="daily-plan" value={draft.plan} maxLength={500} rows={3} aria-describedby="daily-plan-hint"
              onChange={event => changeDraft(status.index, 'plan', event.target.value)}/>
            <p className="personal-hint" id="daily-plan-hint">{current.plan}</p>
            <p className="personal-muted" id="daily-draft-note">{t('Пока это черновик. Фраза сохранится после завершения занятия.', 'This is still a draft. Your phrase is saved when you finish the session.')}</p>
            <button className="primary" type="submit" data-testid="daily-complete" disabled={pending || Boolean(error)}>{pending ? t('Сохраняем…', 'Saving…') : t('Сохранить фразу и завершить занятие', 'Save my phrase and finish')}</button>
          </fieldset>
        </form>
        {reflectionCard(lastSession)}
      </>}

      {(status.phase === 'done-today' || status.phase === 'week-done') && lastSession && <>
        <section className="personal-card personal-done" data-testid="daily-done">
          <div className="personal-lumi"><LumiPortrait mood="success"/><p>{t('Фраза сохранена. Вы нашли слова для своей потребности.', 'Your phrase is saved. You found words for your own need.')}</p></div>
          <h2>{t('Ваша фраза', 'Your phrase')}</h2>
          <blockquote className="personal-written" data-testid="daily-saved-phrase">{lastSession.phrase}</blockquote>
          {lastSession.plan && <div className="personal-plan"><strong>{t('Где хотите попробовать', 'Where you would like to try it')}</strong><p className="personal-written">{lastSession.plan}</p></div>}
          <button type="button" className="secondary" onClick={() => copy(lastSession.phrase)}>{t('Скопировать фразу', 'Copy my phrase')}</button>
          {status.phase === 'done-today' && <div className="personal-tomorrow"><h3>{t('Следующий шаг — завтра', 'Your next step is tomorrow')}</h3><p>{content[lastSession.index].tomorrow}</p><p>{t('Можно вернуться позже: пропуск дня ничего не обнулит. Сегодня можно попробовать фразу для себя или в подходящем разговоре.', 'You can return later: missing a day will not reset anything. Today, you can practise your phrase alone or in a suitable conversation.')}</p></div>}
          <button type="button" className="primary" onClick={() => go('path')}>{t('Вернуться на главную', 'Back to home')}</button>
        </section>
        {status.phase === 'week-done' && <section className="personal-card personal-week" data-testid="daily-week-summary" aria-labelledby="daily-week-title">
          <span className="personal-eyebrow">{t('Путь из 7 занятий завершён', 'Your 7-session path is complete')}</span>
          <h2 id="daily-week-title">{t('Что изменилось в ваших словах?', 'What has changed in your words?')}</h2>
          <p>{t('Это повод заметить свой опыт, а не оценка отношений. Посмотрите, стало ли проще назвать потребность и предложить понятное действие.', 'This is a chance to notice your own experience, not a score for your relationship. See whether naming your need and suggesting a clear action feels easier.')}</p>
          <div className="personal-comparison"><div><h3>{t('Первое занятие', 'Your first session')}</h3><blockquote className="personal-written">{completed[0].phrase}</blockquote></div><div><h3>{t('Седьмое занятие', 'Your seventh session')}</h3><blockquote className="personal-written">{lastSession.phrase}</blockquote></div></div>
          {state.profile.baseline !== null && <p>{t(`В начале пути ваша оценка лёгкости разговора была ${state.profile.baseline} из 5. Как бы вы описали своё ощущение сейчас?`, `At the start, you rated the ease of expressing your needs ${state.profile.baseline} out of 5. How would you describe it now?`)}</p>}
          <p>{t('Выберите одну фразу, к которой хочется вернуться на следующей неделе. Все ваши фразы доступны ниже; их можно скачать.', 'Choose one phrase to revisit next week. All your phrases are available below and can be downloaded.')}</p>
        </section>}
        {reflectionCard(lastSession)}
      </>}

      {retainedDrafts.map(([index, value]) => <section className="personal-card personal-retained" data-testid="daily-retained-draft" key={index}>
        <h2>{t('Ваш несохранённый черновик', 'Your unsaved draft')}</h2>
        <p>{t(`Занятие ${Number(index) + 1} уже сохранено в другой вкладке. Этот текст не заменил сохранённую фразу. Можно скопировать его или убрать черновик.`, `Session ${Number(index) + 1} was saved in another tab. This text did not replace the saved phrase. You can copy it or discard the draft.`)}</p>
        <blockquote className="personal-written">{value.phrase}</blockquote>
        {value.plan && <p className="personal-written">{value.plan}</p>}
        <div className="personal-actions"><button className="secondary" type="button" onClick={() => copy([value.phrase, value.plan].filter(Boolean).join('\n'))}>{t('Скопировать черновик', 'Copy draft')}</button>
          <button className="personal-text-button" type="button" disabled={pending} onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[index]; return next; })}>{t('Убрать этот черновик', 'Discard this draft')}</button></div>
      </section>)}

      {state && Object.keys(reflectionDrafts).filter(index => Number(index) !== lastSession?.index).map(index =>
        <div key={index} data-testid="daily-retained-reflection">{reflectionCard(completed[Number(index)])}</div>)}

      {state && <>
        {completed.length > 0 && <details className="personal-card personal-history"><summary>{t(`Мои сохранённые фразы · ${completed.length}`, `My saved phrases · ${completed.length}`)}</summary>
          <ol>{completed.map(session => <li key={session.index}><h3>{session.index + 1}. {content[session.index].title}</h3><p className="personal-written">{session.phrase}</p>{session.plan && <p className="personal-written"><strong>{t('Мой план: ', 'My plan: ')}</strong>{session.plan}</p>}</li>)}</ol>
          <button className="secondary" type="button" onClick={exportPhrases}>{t('Скачать фразы текстовым файлом', 'Download my phrases as text')}</button>
          <p className="personal-muted">{t('Файл для чтения. Он не восстанавливает профиль в приложении.', 'A file for reading. It cannot restore your profile in the app.')}</p>
        </details>}
        <details className="personal-card personal-settings"><summary>{t('Мой профиль на этом устройстве', 'My profile on this device')}</summary>
          <p>{t('Обращение: ', 'Preference: ')}<strong>{addressLabel(state.profile.address)}</strong></p>
          <div className="personal-addresses">{addresses.map(value => <button key={value} type="button" aria-pressed={state.profile.address === value}
            className={state.profile.address === value ? 'selected' : ''} disabled={pending || Boolean(error)} onClick={() => {
              if (state.profile.address !== value) mutate(() => store.updateAddress(value), () => setNotice(t('Обращение изменено.', 'Preference updated.')));
            }}>{addressLabel(value)}</button>)}</div>
          <p className="personal-muted">{t('Упражнения одинаковые для всех. Профиль и фразы хранятся только в этом браузере. Регистрации, синхронизации и общего профиля пары пока нет.', 'The exercises are the same for everyone. Your profile and phrases are stored only in this browser. Sign-in, sync and shared couple profiles are not available yet.')}</p>
        </details>
      </>}
    </>}
  </section>;
}
