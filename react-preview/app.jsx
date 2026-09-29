import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as ru from '../dist/course.js';
import * as en from '../dist/course.en.js';
import { createProgressStore, PROGRESS_KEY } from '../dist/progress-store.js';
import { metrics, readRoute, prepareImport, backupJSON } from './model.mjs';
import './style.css';

const store = createProgressStore({ lessons: ru.lessons, missions: ru.missions });
const accents = ['#b7c6ff', '#c9ee92', '#ffcf88', '#d8bdff', '#ffbab6', '#a9e6dd', '#f4bde7', '#cbdc9f'];
const symbols = ['✦', '◉', '♡', '☾', '◇', '⌂', '☀', '∞'];
const errorCopy = {
  INVALID_STORED: ['Сохранённые данные повреждены. В «Прогрессе» можно восстановить проверенную резервную копию. Мы ничего не стираем.', 'Saved data is invalid. Restore a valid backup in Progress. Nothing has been erased.'],
  STORAGE_FAILED: ['Не удалось сохранить или прочитать данные. Проверьте доступ к хранилищу и повторите. Несохранённый текст пока остаётся в этой вкладке.', 'Storage could not be read or written. Check browser storage and retry. Unsaved text remains in this tab for now.'],
  LOCK_UNAVAILABLE: ['Безопасное сохранение недоступно. Нужен браузер с Web Locks и HTTPS или localhost.', 'Safe saving is unavailable. Use a browser with Web Locks over HTTPS or localhost.'],
  LOCK_TIMEOUT: ['Хранилище занято другой вкладкой. Повторите сохранение.', 'Another tab is using storage. Please retry saving.'],
  NOTE_CONFLICT: ['Эту заметку изменили в другой вкладке. Ваш черновик сохранён здесь. Скопируйте его перед сравнением; чужой текст не перезаписан.', 'Another tab changed this note. Your draft is retained here. Copy it before comparing; the other text was not overwritten written.'],
  INVALID_FILE: ['Файл не подходит: нужен полный корректный экспорт v1 размером до 512 КиБ. Данные не заменены.', 'Use a complete valid v1 backup up to 512 KiB. Saved data has not been replaced.'],
  IMPORT_CONFLICT: ['Данные изменились после подтверждения. Импорт отменён — начните его заново.', 'Data changed after the confirmation snapshot. Import was cancelled; start again.'],
  UNSAVED: ['Сначала сохраните или скопируйте несохранённые заметки. Импорт пока заблокирован.', 'Save or copy unsaved notes first. Import is blocked while drafts exist.'],
};

function Mascot() {
  return <div className="mascot" aria-hidden="true"><span className="satellite">✦</span><span className="planet"><i/><i/><b/></span><span className="orbit"/></div>;
}

function App() {
  const [lang, setLang] = useState(new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ru');
  const t = (a, b) => lang === 'ru' ? a : b;
  const course = lang === 'ru' ? ru : en;
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(0);
  const [route, setRoute] = useState(() => readRoute(location.hash, ru.lessons));
  const [moduleId, setModuleId] = useState(ru.modules[0].id);
  const [now, setNow] = useState(Date.now());
  const drafts = useRef(new Map());
  const timers = useRef(new Map());
  const [, redrawDrafts] = useState(0);
  const fileRef = useRef(null);
  const hasDrafts = () => drafts.current.size > 0;
  const explain = (code) => (errorCopy[code] || errorCopy.STORAGE_FAILED)[lang === 'ru' ? 0 : 1];
  const refresh = useCallback(() => {
    try {
      const next = store.read();
      setState((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      setError((old) => old === 'INVALID_STORED' || old === 'STORAGE_FAILED' ? null : old);
    } catch (e) { setState(null); setError(e.code || 'STORAGE_FAILED'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh();
    const onStorage = (e) => { if (e.key === PROGRESS_KEY || e.key === null) refresh(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onHash = () => { setRoute(readRoute(location.hash, ru.lessons)); setNotice(''); };
    const unload = (e) => { if (hasDrafts()) { e.preventDefault(); e.returnValue = ''; } };
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
    document.title = t('Орбиты общения', 'Conversation Orbits') + ' · React preview';
    const url = new URL(location.href); url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
  }, [lang]);
  useEffect(() => {
    document.getElementById('page-title')?.focus();
    const selected = ru.lessons.find((l) => l.id === route.id);
    if (selected) setModuleId(selected.moduleId);
  }, [route.view, route.id]);

  async function write(action) {
    setPending((n) => n + 1); setNotice('');
    try { await action(); refresh(); setError(null); setNow(Date.now()); return true; }
    catch (e) { setError(e.code || 'STORAGE_FAILED'); return false; }
    finally { setPending((n) => n - 1); }
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
    setNotice('');
    try {
      const prepared = await prepareImport(file, store, hasDrafts);
      if (!confirm(t('Заменить сохранённый прогресс этой резервной копией? Это заменит уроки, заметки и задания.',
        'Replace saved progress with this backup? Lessons, notes and missions will be replaced.'))) return;
      if (hasDrafts()) throw Object.assign(new Error('UNSAVED'), { code: 'UNSAVED' });
      if (await write(() => store.replace(prepared.imported, prepared.token))) setNotice(t('Резервная копия восстановлена.', 'Backup restored.'));
    } catch (e) { setError(e.code || 'INVALID_FILE'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }
  function exportFile() {
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
  const lesson = course.lessons.find((l) => l.id === route.id);
  const review = stats?.due[0] || course.lessons.find((l) => state?.completed[l.id]) || next;
  const go = (hash) => { location.hash = hash; };
  const nav = [['path', '✦', t('Маршрут', 'Learn')], ['missions', '◎', t('В жизни', 'Real life')], ['progress', '▥', t('Прогресс', 'Progress')]];

  return <div className="app-shell">
    <a className="skip" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t('К содержанию', 'Skip to content')}</a>
    <aside className="sidebar">
      <a className="brand" href="#path"><span className="brand-icon">◉</span><span>{t('орбиты', 'orbits')}<small>{t('общения', 'of conversation')}</small></span></a>
      <nav aria-label={t('Основная навигация', 'Main navigation')}>{nav.map(([id, icon, name]) =>
        <button key={id} className={`nav-item ${route.view === id || id === 'path' && lesson ? 'active' : ''}`}
          aria-current={route.view === id ? 'page' : undefined} onClick={() => go(id)}><span aria-hidden="true">{icon}</span>{name}</button>)}</nav>
      <div className="sidebar-note"><span>✦</span><p>{t('Не идеальные слова. Настоящее внимание.', 'Not perfect words. Real attention.')}</p></div>
      <small className="preview-label">REACT PREVIEW · 0.1</small>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="small-brand">{t('Орбиты общения', 'Conversation Orbits')}</span>
        <div className="top-stats" aria-label={t('Прогресс', 'Progress')}><span className="xp" data-testid="xp">✦ {stats ? stats.xp : '—'} XP</span><span>{stats ? stats.count : '—'} / {course.lessons.length}</span></div>
        <button className="language" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} aria-label={t('Switch to English', 'Переключить на русский')}>{lang === 'ru' ? 'EN' : 'RU'}</button>
      </header>
      <main id="main-content" tabIndex={-1}>
        {error && <div className="alert" role="alert"><p>{explain(error)}</p><button className="secondary" onClick={refresh}>{t('Проверить снова', 'Check again')}</button><button className="secondary" onClick={() => go('progress')}>{t('Резервная копия', 'Backup')}</button></div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {!loaded ? <p role="status">{t('Читаем ваш прогресс…', 'Reading your progress…')}</p> : <>
          {route.view === 'path' && <div className="dashboard">
            <div className="journey"><section className="hero"><div><span className="eyebrow">{t('МАЛЕНЬКИЙ ШАГ. БОЛЬШЕ ПОНИМАНИЯ.', 'SMALL STEPS. MORE UNDERSTANDING.')}</span>
              <h1 id="page-title" tabIndex={-1}>{t('Ближе друг', 'A little closer')}<br/>{t('к другу.', 'to each other.')}</h1>
              <p>{t('Учимся слышать, говорить и договариваться — по одному разговору.', 'Practice listening, speaking and finding common ground. One conversation at a time.')}</p>
              <button className="primary" onClick={() => go(`lesson/${next.id}`)}>{t('Продолжить путь', 'Continue your journey')} <span aria-hidden="true">→</span></button></div><Mascot/></section>
              <div className="unit-picker"><label htmlFor="unit">{t('Ваша орбита', 'Your orbit')}</label><select id="unit" value={module.id} onChange={(e) => setModuleId(e.target.value)}>{course.modules.map((m, i) => <option key={m.id} value={m.id}>{String(i + 1).padStart(2, '0')} · {m.title}</option>)}</select></div>
              <section className="unit" style={{ '--accent': accents[unitIndex] }} aria-labelledby="unit-title"><div className="unit-header"><span className="unit-symbol" aria-hidden="true">{symbols[unitIndex]}</span><div><span className="eyebrow">{t('ОРБИТА', 'ORBIT')} {unitIndex + 1} / {course.modules.length}</span><h2 id="unit-title">{module.title}</h2><p>{module.description}</p></div></div>
                <ol className="lesson-path">{unitLessons.map((l, i) => {
                  const done = !!state?.completed[l.id]; const current = l.id === next.id;
                  return <li key={l.id} className={`path-stop stop-${i} ${done ? 'complete' : ''}`}>
                    <button className={`planet-button ${current ? 'current' : ''}`} aria-label={`${l.title} · ${done ? t('пройдено', 'completed') : t('начать урок', 'start lesson')}`} onClick={() => go(`lesson/${l.id}`)}>{done ? '✓' : symbols[unitIndex]}</button>
                    <div><span className="lesson-kicker">{t('ШАГ', 'STEP')} {i + 1} · {l.minutes} {t('мин', 'min')}</span><h3>{l.title}</h3><span className="lesson-state">{done ? t('Можно повторить', 'Ready to revisit') : current ? t('Начнём здесь', 'Start here') : t('Открыт для вас', 'Explore any time')}</span></div>
                  </li>;
                })}</ol><div className="unit-finish"><span aria-hidden="true">✧</span>{t('Каждый разговор — новая возможность.', 'Every conversation is another opportunity.')}</div>
              </section></div>
            <aside className="right-rail"><section className="goal card"><div className="card-heading"><h2>{t('Шаг на сегодня', 'A step for today')}</h2><span aria-hidden="true">☀</span></div><p>{t('Один новый урок. Без гонки и давления.', 'One new lesson. No rush, no pressure.')}</p><progress value={Math.min(stats?.today || 0, 1)} max={1} aria-label={t('Один новый урок сегодня', 'One new lesson today')}/><strong>{stats?.today ? t('Ваш шаг сделан ✓', 'You took your step ✓') : t('Начните с любопытства', 'Start with curiosity')}</strong></section>
              <section className="card practice-card"><span className="big-symbol" aria-hidden="true">↺</span><h2>{t('Закрепим хорошее', 'Make it stick')}</h2><p>{stats?.due.length ? `${stats.due.length} ${t('уроков пора повторить', 'lessons ready for review')}` : t('Один вопрос, чтобы вспомнить важное.', 'One question to revisit something useful.')}</p><button className="secondary" onClick={() => go(`practice/${review.id}`)}>{t('Короткая практика', 'Quick practice')}</button></section>
              <section className="kind-note"><span aria-hidden="true">♡</span><p>{t('Здесь нет «плохих партнёров» и потерянных жизней. Можно ошибаться, делать паузу и возвращаться.', 'No “bad partners”, no lost lives. You can make mistakes, take a break and return.')}</p></section>
            </aside></div>}
          {lesson && <Lesson key={`${route.view}/${lesson.id}`} lesson={lesson} mode={route.view} state={state} pending={pending} t={t} write={write} notePanel={notePanel} go={go}/>}
          {route.view === 'missions' && <section className="content-page"><span className="eyebrow">{t('ИЗ ПРИЛОЖЕНИЯ — В РАЗГОВОР', 'FROM PRACTICE TO CONVERSATION')}</span><h1 id="page-title" tabIndex={-1}>{t('Маленькие дела.', 'Little actions.')}<br/>{t('Настоящее внимание.', 'Real attention.')}</h1><p className="lead">{t('Попробуйте, когда обоим комфортно. Отметка — ваша запись, а не оценка отношений.', 'Try these when you both feel comfortable. Checkmarks are your records, not relationship scores.')}</p><div className="missions-grid">{course.missions.map((m, i) => <article className="card mission" key={m.id} style={{ '--accent': accents[i] }}><span className="mission-icon" aria-hidden="true">{symbols[i]}</span><h2>{m.title}</h2><p>{m.description}</p>{m.steps.map((step, j) => <label className="mission-step" key={j}><input type="checkbox" checked={!!state?.missionSteps[m.id]?.[j]} disabled={!state || !!pending} onChange={(e) => write(() => store.setMissionStep(m.id, j, e.target.checked))}/><span>{step}</span></label>)}</article>)}</div></section>}
          {route.view === 'progress' && <section className="content-page"><span className="eyebrow">{t('ВАШ ПУТЬ, ВАШ ТЕМП', 'YOUR JOURNEY, YOUR PACE')}</span><h1 id="page-title" tabIndex={-1}>{t('Уже получается.', 'Look how far you’ve come.')}</h1><p className="lead">{t('Опыт за завершённые уроки — не оценка вас или ваших отношений.', 'Lesson experience is not a score for you or your relationship.')}</p>
            <div className="metric-grid"><div className="card"><span>✦</span><strong data-testid="xp-total">{stats ? stats.xp : '—'}</strong><p>{t('очков опыта', 'experience points')}</p></div><div className="card"><span>◉</span><strong>{stats ? `${stats.count}/${stats.total}` : '—'}</strong><p>{t('уроков завершено', 'lessons completed')}</p></div><div className="card"><span>☀</span><strong>{stats ? stats.streak : '—'}</strong><p>{t('дней подряд с новым уроком', 'consecutive days with a new lesson')}</p></div></div>
            <p className="muted">{t('Серия учитывает только первое завершение урока по местной дате. Повторы не добавляют XP. Паузы не отнимают накопленный опыт.', 'The series counts only first lesson completions by local date. Replays do not add XP. Breaks never remove earned experience.')}</p>
            <section className="card backup"><h2>{t('Ваш прогресс — у вас', 'Your progress stays with you')}</h2><p>{t('Данные сохраняются в этом браузере, без отправки на сервер. Скачивайте резервную копию перед очисткой браузера или сменой устройства.', 'Data stays in this browser and is not sent to a server. Export a backup before clearing browser data or changing devices.')}</p><div className="button-row"><button className="primary" disabled={!state} onClick={exportFile}>{t('Скачать копию', 'Export backup')}</button><button className="secondary" onClick={() => fileRef.current?.click()}>{t('Восстановить из файла', 'Restore from file')}</button><input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" aria-label={t('Резервная копия JSON', 'JSON backup')} onChange={(e) => importFile(e.target.files?.[0])}/></div>{hasDrafts() && <p role="status">{t('Есть несохранённые заметки. Экспорт их не включает; импорт заблокирован.', 'There are unsaved notes. Export excludes them; import is blocked.')}</p>}</section>
            {course.lessons.filter((l) => state?.notes[l.id] || drafts.current.has(l.id)).map((l) => <details className="card" key={l.id}><summary>{l.title}</summary>{notePanel(l.id)}</details>)}
          </section>}
        </>}
        <footer><details><summary>{t('Бережно к себе и вашим данным', 'Care for yourself and your data')}</summary><p>{t('Это учебный тренажёр, не терапия. Он не определяет характер по полу и не доказывает улучшение отношений. При угрозах или насилии важнее безопасность, а не выполнение заданий.', 'This is a learning tool, not therapy. It does not define character by gender or prove relationship improvement. In situations involving threats or violence, safety comes before exercises.')}</p><p>{t('RU и EN используют одно хранилище. Черновики остаются только в открытой вкладке, не в резервной копии. При переходе на эту версию перезагрузите старые вкладки.', 'RU and EN share storage. Unsaved drafts live only in the open tab and are not backups. Reload older tabs when switching to this version.')}</p></details><small>{t('Орбиты общения · экспериментальный React-интерфейс', 'Conversation Orbits · experimental React interface')}</small></footer>
      </main>
    </div>
  </div>;
}

function Lesson({ lesson, mode, state, pending, t, write, notePanel, go }) {
  const [step, setStep] = useState(mode === 'practice' ? 2 : 0);
  const [choice, setChoice] = useState(null); // Never prefill a saved correct answer.
  const [feedback, setFeedback] = useState(null);
  useEffect(() => { document.getElementById('page-title')?.focus(); }, [step]);
  async function check() {
    if (choice === null || feedback === 'done' || pending) return;
    if (!lesson.quiz.correct.includes(choice)) { setFeedback('retry'); return; }
    const storeMode = mode === 'practice' ? state?.completed[lesson.id] ? 'review' : 'practice' : 'lesson';
    if (await write(() => store.answer(lesson.id, choice, storeMode))) setFeedback('done');
  }
  return <section className="lesson-screen"><div className="lesson-top"><button className="secondary" onClick={() => go('path')}>← {t('К маршруту', 'Back to path')}</button><span>{mode === 'practice' ? t('ПРАКТИКА', 'PRACTICE') : `${t('ШАГ', 'STEP')} ${step + 1}/3`}</span></div>
    <progress value={feedback === 'done' ? 3 : step + 1} max={3} aria-label={t('Шаг урока', 'Lesson step')}/>
    <article className="lesson-card"><span className="eyebrow">{lesson.minutes} {t('МИНУТ НА ПОЛНЫЙ УРОК', 'MINUTES FOR THE FULL LESSON')}</span><h1 id="page-title" tabIndex={-1}>{lesson.title}</h1>
      {step === 0 && <><p className="lead">{lesson.summary}</p><div className="principle"><span aria-hidden="true">✦</span><p>{lesson.principle}</p></div><h2>{t('Как это звучит', 'What it can sound like')}</h2><blockquote>{lesson.example}</blockquote><button className="primary" onClick={() => setStep(1)}>{t('Попробуем', 'Let’s try it')} →</button></>}
      {step === 1 && <><h2>{t('Один шаг в жизни', 'One real-life step')}</h2><p className="lead">{lesson.action}</p>{notePanel(lesson.id)}<p className="muted">{t('Можно обдумать сейчас и попробовать позже. Участие другого человека — только по согласию.', 'Reflect now and try it later. The other person’s participation is always optional.')}</p><div className="button-row"><button className="secondary" onClick={() => setStep(0)}>{t('Назад', 'Back')}</button><button className="primary" onClick={() => setStep(2)}>{t('Проверить понимание', 'Check understanding')} →</button></div></>}
      {step === 2 && <><h2 id="quiz-prompt">{lesson.quiz.prompt}</h2><div className="choices" role="group" aria-labelledby="quiz-prompt">{lesson.quiz.choices.map((text, i) => <button key={i} className={`choice ${choice === i ? 'selected' : ''}`} aria-pressed={choice === i} disabled={!!pending || feedback === 'done'} onClick={() => { setChoice(i); setFeedback(null); }}><span className="choice-number" aria-hidden="true">{i + 1}</span>{text}</button>)}</div>
        {feedback === 'retry' && <div className="feedback retry" role="status"><strong>{t('Хорошая попытка. Посмотрим ещё раз.', 'Good try. Let’s look again.')}</strong><p>{lesson.quiz.explanation}</p></div>}
        {feedback === 'done' ? <div className="feedback success" role="status"><span className="celebrate" aria-hidden="true">✦</span><h2>{mode === 'practice' ? t('Практика сохранена!', 'Practice saved!') : t('Урок завершён!', 'Lesson complete!')}</h2><p>{lesson.quiz.explanation}</p><p>{mode === 'practice' ? t('Практика не отмечает полный урок пройденным и не начисляет XP.', 'Practice does not complete a full lesson or award XP.') : t('Прогресс сохранён. Опыт начисляется один раз за урок.', 'Progress saved. Experience is counted once per lesson.')}</p><button className="primary" onClick={() => go('path')}>{t('Вернуться к маршруту', 'Return to your path')} →</button></div> : <div className="button-row">{mode !== 'practice' && <button className="secondary" onClick={() => setStep(1)}>{t('Назад', 'Back')}</button>}<button className="primary" disabled={choice === null || !!pending || !state} onClick={check}>{pending ? t('Сохраняем…', 'Saving…') : t('Проверить ответ', 'Check answer')}</button></div>}
      </>}
    </article>
  </section>;
}

class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal"><h1>Не удалось открыть экран / Could not open this screen</h1><p>Сохранённые данные не удалены. Скопируйте несохранённый текст перед перезагрузкой. / Saved data has not been deleted. Copy unsaved text before reloading.</p><button onClick={() => location.reload()}>Перезагрузить / Reload</button></main> : this.props.children; }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
