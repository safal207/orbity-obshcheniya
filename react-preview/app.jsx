import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as ru from '../dist/course.js';
import * as en from '../dist/course.en.js';
import { createProgressStore, PROGRESS_KEY, hasLessonStart } from '../dist/progress-store.js';
import { metrics, prepareImport, backupJSON } from './model.mjs';
import { learningRoute, resumeTarget, nextLesson } from './navigation.mjs';
import { TopicPicker, Guided } from './guided.jsx';
import { Review } from './review.jsx';
import { ResultDetails } from './result-details.jsx';
import { QuickHelp } from './quick-help.jsx';
import './style.css';
import './lumi.css';
import { Lumi, LumiPortrait, LumiTip } from './lumi.jsx';
import { vibrateOnSavedProgress } from './haptics.mjs';

const store = createProgressStore({ lessons: ru.lessons, missions: ru.missions, requireLessonStart: true });
const accents = ['#b7c6ff', '#c9ee92', '#ffcf88', '#d8bdff', '#ffbab6', '#a9e6dd', '#f4bde7', '#cbdc9f'];
const symbols = ['✦', '◉', '♡', '☾', '◇', '⌂', '☀', '∞'];
const errorCopy = {
  LESSON_NOT_STARTED: ['Начните этот урок с первого шага. Сохранённое место могло измениться в другой вкладке; ответ не записан.', 'Start this lesson from step one. Another tab may have changed your saved place; the answer was not saved.'],
  INVALID_STORED: ['Сохранённые данные повреждены. В «Прогрессе» можно восстановить проверенную резервную копию. Мы ничего не стираем.', 'Saved data is invalid. Restore a valid backup in Progress. Nothing has been erased.'],
  STORAGE_FAILED: ['Не удалось сохранить или прочитать данные. Проверьте доступ к хранилищу и повторите. Несохранённый текст пока остаётся в этой вкладке.', 'Storage could not be read or written. Check browser storage and retry. Unsaved text remains in this tab for now.'],
  LOCK_UNAVAILABLE: ['Безопасное сохранение недоступно. Нужен браузер с Web Locks и HTTPS или localhost.', 'Safe saving is unavailable. Use a browser with Web Locks over HTTPS or localhost.'],
  LOCK_TIMEOUT: ['Хранилище занято другой вкладкой. Повторите сохранение.', 'Another tab is using storage. Please retry saving.'],
  NOTE_CONFLICT: ['Эту заметку изменили в другой вкладке. Ваш черновик сохранён здесь. Скопируйте его перед сравнением; чужой текст не перезаписан.', 'Another tab changed this note. Your draft is retained here. Copy it before comparing; the other text was not overwritten.'],
  INVALID_FILE: ['Файл не подходит: нужен полный корректный экспорт v1 размером до 512 КиБ. Данные не заменены.', 'Use a complete valid v1 backup up to 512 KiB. Saved data has not been replaced.'],
  IMPORT_CONFLICT: ['Данные изменились после подтверждения. Импорт отменён — начните его заново.', 'Data changed after the confirmation snapshot. Import was cancelled; start again.'],
  FLOW_CONFLICT: ['Тема или данные изменились в другой вкладке. Ответ не сохранён. Продолжите с актуального вопроса или выберите тему снова.', 'The topic or data changed in another tab. Your answer was not saved. Continue from the current question or choose a topic again.'],
  UNSAVED: ['Сначала сохраните или скопируйте несохранённые заметки. Импорт пока заблокирован.', 'Save or copy unsaved notes first. Import is blocked while drafts exist.'],
};
const routeTipCopy = {
  start: ['Выберите ситуацию, которая ближе сейчас. Остальное подождёт.', 'Choose the situation that feels closest right now. The rest can wait.'],
  guided: ['Не ищите идеальный ответ. Отмечайте то, что действительно замечаете.', 'Do not look for the perfect answer. Notice what is actually true for you.'],
  lesson: ['Один урок — одна идея. Возьмите ту, которую реально попробуете в разговоре.', 'One lesson, one idea. Take the one you can actually try in a conversation.'],
  practice: ['Это не экзамен. Достаточно вспомнить одну полезную мысль.', 'This is not a test. Remembering one useful idea is enough.'],
  review: ['Повтор — не проверка вас. Просто освежите то, что хочется сохранить.', 'Review is not a score for you. Just refresh what you want to keep.'],
  missions: ['Лучше один маленький шаг в жизни, чем три идеальных в голове.', 'One small real-life step beats three perfect steps in your head.'],
  mission: ['Пусть шаг будет добровольным, безопасным и выполнимым сегодня.', 'Keep the step voluntary, safe, and doable today.'],
  progress: ['Смотрите на прогресс как на след практики, а не как на оценку отношений.', 'Treat progress as a trace of practice, not a score for your relationship.'],
};
function App() {
  const [lang, setLang] = useState(() => {
    const query = new URLSearchParams(location.search).get('lang');
    return query === 'ru' || query === 'en' ? query : location.pathname.endsWith('/en.html') ? 'en' : 'ru';
  });
  const t = (a, b) => lang === 'ru' ? a : b;
  const course = lang === 'ru' ? ru : en;
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(0);
  const pendingWrites = useRef(0);
  const [route, setRoute] = useState(() => learningRoute(location.hash, ru.lessons, ru.missions));
  const [moduleId, setModuleId] = useState(ru.modules[0].id);
  const [now, setNow] = useState(Date.now());
  const drafts = useRef(new Map());
  const timers = useRef(new Map());
  const [, redrawDrafts] = useState(0);
  const fileRef = useRef(null);
  const restoredModule = useRef(false);
  const restoreSavedModuleOnPath = useRef(false);
  const navigationIntent = useRef(0);
  const [routeTip, setRouteTip] = useState(null);
  const routeTipTimer = useRef(null);
  const seenRouteTips = useRef(new Set());
  const hasDrafts = () => drafts.current.size > 0;
  const explain = (code) => (errorCopy[code] || errorCopy.STORAGE_FAILED)[lang === 'ru' ? 0 : 1];
  const refresh = useCallback(() => {
    try {
      const next = store.read();
      setState((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      setNow(Date.now());
      setError((old) => old === 'INVALID_STORED' || old === 'STORAGE_FAILED' ? null : old);
      return true;
    } catch (e) { setState(null); setError(e.code || 'STORAGE_FAILED'); return false; }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    refresh();
    const onStorage = (e) => { if (e.key === PROGRESS_KEY || e.key === null) refresh(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onHash = () => {
      navigationIntent.current++;
      const nextRoute = learningRoute(location.hash, ru.lessons, ru.missions);
      // A deliberate return restores the saved orbit; storage events alone do not.
      if (nextRoute.view === 'path' && !nextRoute.id && !nextRoute.moduleId) {
        restoreSavedModuleOnPath.current = true;
      }
      setRoute(nextRoute); setNotice('');
    };
    const unload = (e) => { if (hasDrafts() || pendingWrites.current > 0) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('storage', onStorage); addEventListener('focus', refresh);
    addEventListener('hashchange', onHash); addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', onVisible);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      removeEventListener('storage', onStorage); removeEventListener('focus', refresh);
      removeEventListener('hashchange', onHash); removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', onVisible); clearInterval(clock);
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('Орбиты общения', 'Conversation Orbits');
    const url = new URL(location.href); url.searchParams.set('lang', lang);
    history.replaceState(history.state, '', url);
  }, [lang]);
  useEffect(() => {
    document.getElementById('page-title')?.focus();
    const selected = ru.lessons.find((l) => l.id === route.id);
    if (selected) setModuleId(selected.moduleId);
    else if (route.moduleId && ru.modules.some((m) => m.id === route.moduleId)) setModuleId(route.moduleId);
  }, [route.view, route.id, route.moduleId, route.missionId, route.scenarioId, loaded]);
  useEffect(() => {
    clearTimeout(routeTipTimer.current);
    setRouteTip(null);
    if (!loaded || !routeTipCopy[route.view] || seenRouteTips.current.has(route.view)) return undefined;
    seenRouteTips.current.add(route.view);
    routeTipTimer.current = setTimeout(() => setRouteTip(route.view), 180);
    return () => clearTimeout(routeTipTimer.current);
  }, [route.view, loaded]);
  useEffect(() => {
    if (!loaded || !state) return;
    const unlinkedPath = route.view === 'path' && !route.id && !route.moduleId;
    if (!unlinkedPath || (restoredModule.current && !restoreSavedModuleOnPath.current)) return;
    // Explicit routes win, and unrelated storage events must not move an active path.
    restoredModule.current = true;
    restoreSavedModuleOnPath.current = false;
    setModuleId(state.focusModule ?? ru.modules[0].id);
  }, [loaded, state, route.view, route.id, route.moduleId]);

  async function write(action) {
    // The stable unload handler needs the live count, including before a render.
    pendingWrites.current++;
    setPending((n) => n + 1); setNotice('');
    try {
      await action();
      // A committed write and a readable UI snapshot are separate outcomes.
      // Preserve refresh's error; recovery must reread, not repeat the write.
      if (!refresh()) return false;
      setError(null); return true;
    }
    catch (e) { refresh(); setError(e.code || 'STORAGE_FAILED'); return false; }
    finally { pendingWrites.current--; setPending((n) => n - 1); }
  }
  async function selectModule(id) {
    const intent = ++navigationIntent.current;
    let committed = false;
    const readable = await write(async () => {
      await store.selectModule(id);
      committed = true;
    });
    if (!readable) {
      // A committed choice still needs display recovery after a failed reread.
      // A rejected write must not opt this tab into another tab's orbit changes.
      if (committed) restoreSavedModuleOnPath.current = true;
      return;
    }
    if (intent !== navigationIntent.current) {
      restoreSavedModuleOnPath.current = true;
      return;
    }
    // Do not display an unsaved choice, or move a screen visited during a lock wait.
    setModuleId(id);
    // Keep explicit legacy module links consistent with a newly saved selection.
    if (route.moduleId) location.hash = `module/${id}`;
  }
  async function go(hash) {
    const intent = ++navigationIntent.current;
    const destination = learningRoute(hash, ru.lessons, ru.missions);
    // Explicit lesson navigation establishes the v1 bookmark, never completion.
    if (destination.view === 'lesson' && !await write(() => store.selectLesson(destination.id))) return;
    // Do not steal navigation back after a lock wait if the user left meanwhile.
    if (intent === navigationIntent.current) location.hash = hash;
  }
  async function start(topic) {
    const intent = ++navigationIntent.current;
    if (await write(() => store.startGuided(topic)) && intent === navigationIntent.current) location.hash = `guided/${topic}`;
  }
  async function saveDraft(id) {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    const draft = drafts.current.get(id);
    if (!draft || draft.status === 'saving') return;
    draft.status = 'saving'; redrawDrafts((n) => n + 1);
    try {
      await store.saveNote(id, draft.value, draft.base);
      drafts.current.delete(id); refresh();
    } catch (e) { draft.status = 'error'; draft.error = e.code || 'STORAGE_FAILED'; }
    redrawDrafts((n) => n + 1);
  }
  function editNote(id, value) {
    const old = drafts.current.get(id);
    if (old?.status === 'saving') return;
    const draft = { value, base: old?.base ?? state?.notes[id] ?? '', status: 'dirty' };
    clearTimeout(timers.current.get(id));
    if (value === draft.base) { drafts.current.delete(id); timers.current.delete(id); }
    else {
      drafts.current.set(id, draft);
      timers.current.set(id, setTimeout(() => saveDraft(id), 700));
    }
    redrawDrafts((n) => n + 1);
  }
  function notePanel(id) {
    const draft = drafts.current.get(id);
    return <section className="note-box">
      <label htmlFor={`note-${id}`}>{t('Моя мысль · необязательно', 'My reflection · optional')}</label>
      <textarea id={`note-${id}`} maxLength={2000} value={draft?.value ?? state?.notes[id] ?? ''}
        disabled={!state || draft?.status === 'saving'} onChange={(e) => editNote(id, e.target.value)}
        placeholder={t('Что я попробую в следующем разговоре?', 'What will I try in my next conversation?')}/>
      <p className="save-state" role="status">{draft ? draft.status === 'error' ? explain(draft.error) :
        draft.status === 'saving' ? t('Сохраняем…', 'Saving…') : t('Есть несохранённый текст…', 'Unsaved text…') :
        state ? Object.hasOwn(state.notes, id) ? t('Сохранено на этом устройстве', 'Saved on this device') : t('Заметка сохраняется автоматически', 'Notes save automatically') : t('Сохранение недоступно', 'Saving unavailable')}</p>
      {draft && <button className="secondary" disabled={draft.status === 'saving'} onClick={() => saveDraft(id)}>
        {t('Сохранить / повторить', 'Save / retry')}</button>}
    </section>;
  }
  async function importFile(file) {
    if (!file) return;
    if (pendingWrites.current > 0) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setNotice('');
    try {
      const prepared = await prepareImport(file, store, hasDrafts);
      if (!confirm(t('Заменить сохранённый прогресс этой резервной копией? Это заменит уроки, заметки и задания.',
        'Replace saved progress with this backup? Lessons, notes and missions will be replaced.'))) return;
      if (hasDrafts()) throw Object.assign(new Error('UNSAVED'), { code: 'UNSAVED' });
      if (await write(() => store.replace(prepared.imported, prepared.token))) {
        const currentRoute = learningRoute(location.hash, ru.lessons, ru.missions);
        if (!currentRoute.id && !currentRoute.moduleId) {
          setModuleId(prepared.imported.focusModule ?? ru.modules[0].id);
        } else {
          restoreSavedModuleOnPath.current = true;
        }
        setNotice(t('Резервная копия восстановлена.', 'Backup restored.'));
      }
    } catch (e) { setError(e.code || 'INVALID_FILE'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }
  function exportFile() {
    if (pendingWrites.current > 0) return;
    try {
      const snapshot = store.read();
      const url = URL.createObjectURL(new Blob([backupJSON(snapshot)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'orbity-progress-v1.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(t('Экспортирован сохранённый прогресс. Несохранённые черновики в файл не входят.', 'Saved progress exported. Unsaved drafts are not included.'));
    } catch (e) { setError(e.code || 'STORAGE_FAILED'); }
  }
  const stats = metrics(state, course.lessons, now);
  const module = course.modules.find((m) => m.id === moduleId) || course.modules[0];
  const unitIndex = course.modules.indexOf(module);
  const unitLessons = course.lessons.filter((l) => l.moduleId === module.id);
  const next = unitLessons.find((l) => !state?.completed[l.id]) || unitLessons[0];
  const selectedLesson = course.lessons.find((l) => l.id === route.id);
  const review = stats?.due[0] || course.lessons.find((l) => state?.completed[l.id]) || next;
  const lesson = selectedLesson;
  const mission = course.missions.find((item) => item.id === route.missionId);
  const resume = resumeTarget(state, course.lessons);
  const savedNext = nextLesson(state, course.lessons);
  const guidedTopic = route.topic || state?.guidedFlow?.topic;
  const activeNav = ['lesson', 'practice', 'review', 'start', 'guided', 'now'].includes(route.view) ? 'path' : route.view === 'mission' ? 'missions' : route.view;
  const nav = [['path', '✦', t('Маршрут', 'Learn')], ['missions', '◎', t('В жизни', 'Real life')], ['progress', '▥', t('Прогресс', 'Progress')]];
  return <div className="app-shell">
    <a className="skip" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t('К содержанию', 'Skip to content')}</a>
    <aside className="sidebar">
      <a className="brand" href="#path"><span className="brand-icon">◉</span><span>{t('орбиты', 'orbits')}<small>{t('общения', 'of conversation')}</small></span></a>
      <nav aria-label={t('Основная навигация', 'Main navigation')}>{nav.map(([id, icon, name]) =>
        <button key={id} className={`nav-item ${activeNav === id ? 'active' : ''}`}
          aria-current={activeNav === id ? 'page' : undefined} onClick={() => go(id)}><span aria-hidden="true">{icon}</span>{name}</button>)}</nav>
      <div className="sidebar-note"><span>✦</span><p>{t('Не идеальные слова. Настоящее внимание.', 'Not perfect words. Real attention.')}</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="small-brand">{t('Орбиты общения', 'Conversation Orbits')}</span>
        <div className="top-stats" aria-label={stats ? t(`Прогресс: ${stats.xp} XP, ${stats.count} из ${course.lessons.length} уроков`, `Progress: ${stats.xp} XP, ${stats.count} of ${course.lessons.length} lessons`) : t('Прогресс загружается', 'Progress is loading')}><span className="xp" data-testid="xp">✦ {stats ? stats.xp : '—'} XP <span className="mobile-count" aria-hidden="true">· {stats ? stats.count : '—'}/{course.lessons.length}</span></span><span className="lesson-count">{stats ? stats.count : '—'} / {course.lessons.length}</span></div>
        <button className="language" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} aria-label={t('Switch to English', 'Переключить на русский')}>{lang === 'ru' ? 'EN' : 'RU'}</button>
      </header>
      <main id="main-content" tabIndex={-1}>
        {error && <div className="alert" role="alert"><LumiPortrait mood="support"/><p>{explain(error)}</p><button className="secondary" onClick={refresh}>{t('Проверить снова', 'Check again')}</button><button className="secondary" onClick={() => go('progress')}>{t('Резервная копия', 'Backup')}</button></div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {routeTip && <LumiTip t={t} message={t(...routeTipCopy[routeTip])} onClose={() => setRouteTip(null)}/>}
        {!loaded ? <p role="status">{t('Читаем ваш прогресс…', 'Reading your progress…')}</p> : <>
          {route.view === 'path' && <div className="dashboard">
            <div className="journey"><section className="hero"><div><span className="eyebrow">{t('МАЛЕНЬКИЙ ШАГ. БОЛЬШЕ ПОНИМАНИЯ.', 'SMALL STEPS. MORE UNDERSTANDING.')}</span>
              <h1 id="page-title" tabIndex={-1}>{t('Ближе друг', 'A little closer')}<br/>{t('к другу.', 'to each other.')}</h1>
              <p>{t('Учимся слышать, говорить и договариваться — по одному разговору.', 'Practice listening, speaking and finding common ground. One conversation at a time.')}</p>
              <div className="button-row"><button className="primary" data-testid="resume" disabled={!resume || !!pending} onClick={() => go(resume)}>{state?.guidedFlow ? t('Продолжить знакомство', 'Continue the introduction') : t('Продолжить путь', 'Continue your journey')} <span aria-hidden="true">→</span></button>
                <button className="secondary help-now-button" data-testid="help-now" onClick={() => go('now')}>✦ {t('Помоги мне сейчас', 'Help me now')}</button>
                <button className="secondary" onClick={() => go('start')}>{t('Выбрать ситуацию', 'Choose a situation')}</button></div>
              {state && <p className="muted" data-testid="resume-label">{state.guidedFlow ? state.guidedFlow.step < 3 ? `${t('Сохранён вопрос', 'Saved question')} ${state.guidedFlow.step + 1}/3` : t('Три вопроса готовы — откройте результат.', 'Three questions are ready — open the result.') : savedNext ? `${t('Следующий урок', 'Next lesson')}: ${savedNext.title}` : t('Все уроки пройдены.', 'All lessons completed.')}</p>}
            </div><Lumi t={t} hero mood={error ? 'support' : 'idle'} message={error ? t('Сначала разберёмся с сообщением выше.', 'Let’s address the message above first.') : undefined}/></section>
              <div className="unit-picker"><label htmlFor="unit">{t('Ваша орбита', 'Your orbit')}</label><select id="unit" value={module.id} disabled={!state || !!pending} aria-busy={!!pending} onChange={(e) => selectModule(e.target.value)}>{course.modules.map((m, i) => <option key={m.id} value={m.id}>{String(i + 1).padStart(2, '0')} · {m.title}</option>)}</select></div>
              <section className="unit" style={{ '--accent': accents[unitIndex] }} aria-labelledby="unit-title"><div className="unit-header"><span className="unit-symbol" aria-hidden="true">{symbols[unitIndex]}</span><div><span className="eyebrow">{t('ОРБИТА', 'ORBIT')} {unitIndex + 1} / {course.modules.length}</span><h2 id="unit-title">{module.title}</h2><p>{module.description}</p></div></div>
                <ol className="lesson-path">{unitLessons.map((l, i) => {
                  const done = !!state?.completed[l.id]; const current = l.id === next.id;
                  return <li key={l.id} className={`path-stop stop-${i} ${done ? 'complete' : ''}`}>
                    <button className={`planet-button ${current ? 'current' : ''}`} disabled={!state || !!pending} aria-label={`${l.title} · ${done ? t('пройдено', 'completed') : t('начать урок', 'start lesson')}`} onClick={() => go(`lesson/${l.id}`)}>{done ? '✓' : symbols[unitIndex]}</button>
                    <div><span className="lesson-kicker">{t('ШАГ', 'STEP')} {i + 1} · {l.minutes} {t('мин', 'min')}</span><h3>{l.title}</h3><span className="lesson-state">{done ? t('Можно повторить', 'Ready to revisit') : current ? t('Начнём здесь', 'Start here') : t('Открыт для вас', 'Explore any time')}</span></div>
                  </li>;
                })}</ol><div className="unit-finish"><span aria-hidden="true">✧</span>{t('Каждый разговор — новая возможность.', 'Every conversation is another opportunity.')}</div>
              </section></div>
            <aside className="right-rail"><section className="goal card"><div className="card-heading"><h2>{t('Шаг на сегодня', 'A step for today')}</h2><span aria-hidden="true">☀</span></div><p>{t('Один новый урок. Без гонки и давления.', 'One new lesson. No rush, no pressure.')}</p><progress value={Math.min(stats?.today || 0, 1)} max={1} aria-label={t('Один новый урок сегодня', 'One new lesson today')}/><strong>{stats?.today ? t('Ваш шаг сделан ✓', 'You took your step ✓') : t('Начните с любопытства', 'Start with curiosity')}</strong></section>
              <section className="card practice-card"><span className="big-symbol" aria-hidden="true">↺</span><h2>{t('Закрепим хорошее', 'Make it stick')}</h2><p>{stats?.due.length ? `${stats.due.length} ${t('уроков пора повторить', 'lessons ready for review')}` : t('Один вопрос, чтобы вспомнить важное.', 'One question to revisit something useful.')}</p><button className="secondary" onClick={() => go(`practice/${review.id}`)}>{t('Короткая практика', 'Quick practice')}</button><div className="button-row"><button className="secondary" onClick={() => go('review')}>{t('Повторить пройденное', 'Review completed lessons')}</button></div></section>
              <section className="kind-note"><span aria-hidden="true">♡</span><p>{t('Здесь нет «плохих партнёров» и потерянных жизней. Можно ошибаться, делать паузу и возвращаться.', 'No “bad partners”, no lost lives. You can make mistakes, take a break and return.')}</p></section>
            </aside></div>}
          {route.view === 'now' && <QuickHelp t={t} lang={lang} scenarioId={route.scenarioId} go={go}/>}
          {route.view === 'start' && <TopicPicker state={state} pending={pending} t={t} start={start}/>}
          {route.view === 'guided' && (guidedTopic ? <Guided key={guidedTopic} topic={guidedTopic} state={state} course={course} store={store} pending={pending} t={t} write={write} notePanel={notePanel} go={go} onSync={() => setError((current) => current === 'FLOW_CONFLICT' ? null : current)}/> : <TopicPicker state={state} pending={pending} t={t} start={start}/>)}
          {route.view === 'review' && <Review state={state} course={course} store={store} pending={pending} t={t} write={write} notePanel={notePanel} go={go} onSync={() => setError((current) => current === 'FLOW_CONFLICT' ? null : current)}/>}
          {lesson && <Lesson key={`${route.view}/${lesson.id}`} lesson={lesson} mode={route.view} step={route.step ?? 2} state={state} pending={pending} t={t} write={write} notePanel={notePanel} go={go}/>}
          {route.view === 'missions' && <section className="content-page"><span className="eyebrow">{t('ИЗ ПРИЛОЖЕНИЯ — В РАЗГОВОР', 'FROM PRACTICE TO CONVERSATION')}</span><h1 id="page-title" tabIndex={-1}>{t('Маленькие дела.', 'Little actions.')}<br/>{t('Настоящее внимание.', 'Real attention.')}</h1><p className="lead">{t('Попробуйте, когда обоим комфортно. Отметка — ваша запись, а не оценка отношений.', 'Try these when you both feel comfortable. Checkmarks are your records, not relationship scores.')}</p><div className="missions-grid">{course.missions.map((m, i) => <article className="card mission" key={m.id} style={{ '--accent': accents[i] }}><span className="mission-icon" aria-hidden="true">{symbols[i]}</span><h2>{m.title}</h2><p>{m.description}</p>{m.steps.map((step, j) => <label className="mission-step" key={j}><input type="checkbox" checked={!!state?.missionSteps[m.id]?.[j]} disabled={!state || !!pending} onChange={(e) => write(() => store.setMissionStep(m.id, j, e.target.checked))}/><span>{step}</span></label>)}<button className="secondary" disabled={!!pending} onClick={() => go(`mission/${m.id}`)}>{t('Открыть пошагово', 'Open step by step')}</button></article>)}</div></section>}
          {route.view === 'mission' && mission && <MissionDetail mission={mission} state={state} pending={pending} t={t} write={write} go={go}/>}

          {route.view === 'about' && <section className="content-page"><span className="eyebrow">{t('О ПОДХОДЕ', 'ABOUT THE APPROACH')}</span><h1 id="page-title" tabIndex={-1}>{t('О подходе', 'About the approach')}</h1><p className="lead">{t('Меньше догадок. Больше вопросов к конкретному человеку.', 'Fewer assumptions. More questions for the person in front of you.')}</p><p>{t('Это независимый образовательный тренажёр с оригинальными упражнениями. Он помогает практиковать слушание, ясные просьбы и восстановление разговора, но не оценивает отношения и не заменяет терапию.', 'This is an independent learning tool with original exercises. It helps you practise listening, clear requests and conversation repair, but it does not score relationships or replace therapy.')}</p><p className="muted">{t('При давлении, угрозах или страхе важнее безопасность и поддержка людей или служб, которым вы доверяете.', 'When there is pressure, threats or fear, safety and trusted support matter more than completing an exercise.')}</p></section>}
          {route.view === 'progress' && <section className="content-page"><span className="eyebrow">{t('ВАШ ПУТЬ, ВАШ ТЕМП', 'YOUR JOURNEY, YOUR PACE')}</span><h1 id="page-title" tabIndex={-1}>{t('Уже получается.', 'Look how far you’ve come.')}</h1><p className="lead">{t('Опыт за завершённые уроки — не оценка вас или ваших отношений.', 'Lesson experience is not a score for you or your relationship.')}</p>
            <Lumi t={t} message={t('Пауза не отнимает опыт. Возвращайтесь, когда будет удобно.', 'Breaks do not remove experience. Return when it suits you.')}/>
            <div className="metric-grid"><div className="card"><span>✦</span><strong data-testid="xp-total">{stats ? stats.xp : '—'}</strong><p>{t('очков опыта', 'experience points')}</p></div><div className="card"><span>◉</span><strong>{stats ? `${stats.count}/${stats.total}` : '—'}</strong><p>{t('уроков завершено', 'lessons completed')}</p></div><div className="card"><span>☀</span><strong>{stats ? stats.streak : '—'}</strong><p>{t('дней подряд с новым уроком', 'consecutive days with a new lesson')}</p></div></div>
            <p className="muted">{t('Серия учитывает только первое завершение урока по местной дате. Повторы не добавляют XP. Паузы не отнимают накопленный опыт.', 'The series counts only first lesson completions by local date. Replays do not add XP. Breaks never remove earned experience.')}</p>
            <section className="card backup"><h2>{t('Ваш прогресс — у вас', 'Your progress stays with you')}</h2><p>{t('Данные сохраняются в этом браузере, без отправки на сервер. Скачивайте резервную копию перед очисткой браузера или сменой устройства.', 'Data stays in this browser and is not sent to a server. Export a backup before clearing browser data or changing devices.')}</p><div className="button-row"><button className="primary" disabled={!state || !!pending} onClick={exportFile}>{t('Скачать копию', 'Export backup')}</button><button className="secondary" disabled={!!pending} onClick={() => fileRef.current?.click()}>{t('Восстановить из файла', 'Restore from file')}</button><input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" disabled={!!pending} aria-label={t('Резервная копия JSON', 'JSON backup')} onChange={(e) => importFile(e.target.files?.[0])}/></div>{hasDrafts() && <p role="status">{t('Есть несохранённые заметки. Экспорт их не включает; импорт заблокирован.', 'There are unsaved notes. Export excludes them; import is blocked.')}</p>}</section>
            {course.lessons.filter((l) => state?.notes[l.id] || drafts.current.has(l.id)).map((l) => <details className="card" key={l.id}><summary>{l.title}</summary>{notePanel(l.id)}</details>)}
          </section>}
        </>}
        <footer><details><summary>{t('Бережно к себе и вашим данным', 'Care for yourself and your data')}</summary><p>{t('Это учебный тренажёр, не терапия. Он не определяет характер по полу и не доказывает улучшение отношений. При угрозах или насилии важнее безопасность, а не выполнение заданий.', 'This is a learning tool, not therapy. It does not define character by gender or prove relationship improvement. In situations involving threats or violence, safety comes before exercises.')}</p><p>{t('RU и EN используют одно хранилище. Черновики остаются только в открытой вкладке, не в резервной копии. При переходе на эту версию перезагрузите старые вкладки.', 'RU and EN share storage. Unsaved drafts live only in the open tab and are not backups. Reload older tabs when switching to this version.')}</p><p>{t('Адрес сохраняет экран урока при обновлении и переходах Назад/Вперёд. При открытии главной кнопка продолжения возвращает к сохранённому уроку или вопросу знакомства.', 'The address preserves the lesson screen on reload and Back/Forward. From the home page, Continue returns to your saved lesson or introduction question.')}</p></details><small>{t('Орбиты общения · маленькие шаги к пониманию', 'Conversation Orbits · small steps toward understanding')}</small></footer>
      </main>
    </div>
  </div>;
}
function MissionDetail({ mission, state, pending, t, write, go }) {
  const steps = state?.missionSteps?.[mission.id] || [];
  const nextIndex = mission.steps.findIndex((_, index) => !steps[index]);
  const complete = nextIndex < 0;
  const current = complete ? mission.steps.length - 1 : nextIndex;

  useEffect(() => {
    document.getElementById('page-title')?.focus();
  }, [mission.id, current, complete]);

  async function setStep(index, value) {
    if (await write(() => store.setMissionStep(mission.id, index, value)) && value) {
      vibrateOnSavedProgress(index === mission.steps.length - 1 ? 'milestone' : 'step');
    }
  }

  return <section className="lesson-screen" data-testid="mission-detail">
    <div className="lesson-top">
      <button className="secondary" onClick={() => go('missions')}>← {t('К заданиям', 'Back to missions')}</button>
      <span>{complete ? t('ЗАДАНИЕ ВЫПОЛНЕНО', 'MISSION COMPLETE') : `${t('ШАГ', 'STEP')} ${current + 1}/${mission.steps.length}`}</span>
    </div>
    <progress value={complete ? mission.steps.length : current} max={mission.steps.length} aria-label={t('Прогресс задания', 'Mission progress')}/>
    <article className="lesson-card">
      <span className="eyebrow">{t('ПРАКТИКА В ЖИЗНИ', 'REAL-LIFE PRACTICE')}</span>
      <h1 id="page-title" tabIndex={-1}>{mission.title}</h1>
      <p className="lead">{mission.description}</p>
      {complete ? <div className="feedback success" role="status">
        <LumiPortrait mood="success"/>
        <h2>{t('Все три шага отмечены.', 'All three steps are checked.')}</h2>
        <p>{t('Это ваша запись о практике, а не оценка отношений. При желании можно вернуться к последнему шагу.', 'This is your practice record, not a relationship score. You can return to the last step if you want.')}</p>
        <div className="button-row">
          <button className="secondary" disabled={!!pending || !state} onClick={() => setStep(mission.steps.length - 1, false)}>← {t('Вернуть последний шаг', 'Undo last step')}</button>
          <button className="primary" onClick={() => go('missions')}>{t('К другим заданиям', 'Other missions')} →</button>
        </div>
      </div> : <>
        <div className="principle"><span aria-hidden="true">{current + 1}</span><p data-testid="mission-step">{mission.steps[current]}</p></div>
        <p className="muted">{t('Делайте шаг только в безопасной и добровольной ситуации. Можно остановиться и вернуться позже.', 'Take this step only in a safe, voluntary situation. You can stop and return later.')}</p>
        <div className="button-row">
          {current > 0 && <button className="secondary" disabled={!!pending || !state} onClick={() => setStep(current - 1, false)}>← {t('Вернуться к предыдущему шагу', 'Back to previous step')}</button>}
          <button className="primary" disabled={!!pending || !state} onClick={() => setStep(current, true)}>{pending ? t('Сохраняем…', 'Saving…') : t('Отметить выполненным', 'Mark complete')} →</button>
        </div>
      </>}
    </article>
  </section>;
}
function Lesson({ lesson, mode, step, state, pending, t, write, notePanel, go }) {
  const needsStart = mode === 'lesson' && step === 2 && !hasLessonStart(state, lesson.id);
  const [choice, setChoice] = useState(null);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => { setChoice(null); setFeedback(null); document.getElementById('page-title')?.focus(); }, [step]);
  const setStep = (index) => go(`lesson/${lesson.id}/${index}`);
  async function check() {
    if (choice === null || feedback === 'done' || pending) return;
    if (!lesson.quiz.correct.includes(choice)) { setFeedback('retry'); return; }
    const storeMode = mode === 'practice' ? state?.completed[lesson.id] ? 'review' : 'practice' : 'lesson';
    if (await write(() => store.answer(lesson.id, choice, storeMode))) {
      setFeedback('done');
      vibrateOnSavedProgress('milestone');
    }
  }
  return <section className="lesson-screen"><div className="lesson-top"><button className="secondary" onClick={() => go('path')}>← {t('К маршруту', 'Back to path')}</button><span>{mode === 'practice' ? t('ПРАКТИКА', 'PRACTICE') : `${t('ШАГ', 'STEP')} ${step + 1}/3`}</span></div>
    <progress value={needsStart ? 0 : feedback === 'done' ? 3 : step + 1} max={3} aria-label={t('Шаг урока', 'Lesson step')}/>
    <article className="lesson-card"><span className="eyebrow">{lesson.minutes} {t('МИНУТ НА ПОЛНЫЙ УРОК', 'MINUTES FOR THE FULL LESSON')}</span><h1 id="page-title" tabIndex={-1}>{lesson.title}</h1>
      {step === 0 && <><p className="lead">{lesson.summary}</p><div className="principle"><span aria-hidden="true">✦</span><p>{lesson.principle}</p></div><h2>{t('Как это звучит', 'What it can sound like')}</h2><blockquote>{lesson.example}</blockquote><button className="primary" disabled={!!pending || !state} onClick={() => setStep(1)}>{t('Попробуем', 'Let’s try it')} →</button></>}
      {step === 1 && <><h2>{t('Один шаг в жизни', 'One real-life step')}</h2><p className="lead">{lesson.action}</p>{notePanel(lesson.id)}<p className="muted">{t('Можно обдумать сейчас и попробовать позже. Участие другого человека — только по согласию.', 'Reflect now and try it later. The other person’s participation is always optional.')}</p><div className="button-row"><button className="secondary" disabled={!!pending} onClick={() => setStep(0)}>{t('Назад', 'Back')}</button><button className="primary" disabled={!!pending || !state} onClick={() => setStep(2)}>{t('Проверить понимание', 'Check understanding')} →</button></div></>}
      {needsStart && <section data-testid="lesson-start-required"><h2>{t('Сначала начнём урок', 'Let’s start the lesson first')}</h2>
        <p className="lead">{t('Ссылка на итоговый вопрос не подтверждает начало урока. Начните с первого шага — заметки и пройденные уроки останутся на месте.', 'A link to the final question does not confirm a lesson start. Begin with step one; your notes and completed lessons stay intact.')}</p>
        <button className="primary" disabled={!state || !!pending} onClick={() => go(`lesson/${lesson.id}`)}>{t('Начать урок с первого шага', 'Start this lesson from step one')}</button>
      </section>}
      {step === 2 && !needsStart && <><h2 id="quiz-prompt">{lesson.quiz.prompt}</h2><div className="choices" role="group" aria-labelledby="quiz-prompt">{lesson.quiz.choices.map((text, i) => <button key={i} className={`choice ${choice === i ? 'selected' : ''}`} aria-pressed={choice === i} disabled={!!pending || feedback === 'done'} onClick={() => { setChoice(i); setFeedback(null); }}><span className="choice-number" aria-hidden="true">{i + 1}</span>{text}</button>)}</div>
        {feedback === 'retry' && <div className="feedback retry" role="status"><LumiPortrait mood="support"/><strong>{t('Хорошая попытка. Посмотрим ещё раз.', 'Good try. Let’s look again.')}</strong><p>{lesson.quiz.explanation}</p></div>}
        {feedback === 'done' ? <div className="feedback success" role="status"><LumiPortrait mood="success"/><h2>{mode === 'practice' ? t('Практика сохранена!', 'Practice saved!') : t('Урок завершён!', 'Lesson complete!')}</h2><p>{lesson.quiz.explanation}</p><ResultDetails lesson={lesson} t={t} notePanel={notePanel}/><p>{mode === 'practice' ? t('Практика не отмечает новый урок завершённым и не добавляет XP.', 'Practice does not complete a new lesson or award XP.') : t('20 XP за первое завершение. Повторы не начисляют опыт снова.', '20 XP for the first completion. Replays do not add more experience.')}</p><button className="primary" onClick={() => go('path')}>{t('Вернуться к маршруту', 'Return to the path')} →</button></div> : <div className="button-row">{mode !== 'practice' && <button className="secondary" disabled={!!pending} onClick={() => setStep(1)}>{t('Назад', 'Back')}</button>}<button className="primary" disabled={choice === null || !!pending || !state} onClick={check}>{pending ? t('Сохраняем…', 'Saving…') : t('Проверить ответ', 'Check answer')}</button></div>}
      </>}
    </article></section>;
}
class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal"><h1>Не удалось открыть экран / Could not open this screen</h1><p>Сохранённые данные не удалены. Скопируйте несохранённый текст перед перезагрузкой. / Saved data has not been deleted. Copy unsaved text before reloading.</p><button onClick={() => location.reload()}>Перезагрузить / Reload</button></main> : this.props.children; }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
