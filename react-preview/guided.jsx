import React, { useEffect, useState } from 'react';
import { GUIDED, answerGuided, nextLesson } from './navigation.mjs';
import { Lumi, LumiPortrait } from './lumi.jsx';
import { vibrateOnSavedProgress } from './haptics.mjs';

export function TopicPicker({ state, pending, t, start }) {
  const topics = [
    ['listening', '◉', 'Меня не слышат', 'I don’t feel heard'],
    ['conflict', '◇', 'Разговор быстро становится спором', 'Conversations turn into arguments'],
    ['needs', '♡', 'Трудно сказать, что мне нужно', 'It is hard to say what I need'],
  ];
  return <section className="lesson-screen"><article className="lesson-card">
    <span className="eyebrow">{t('ОДНА СИТУАЦИЯ · ТРИ ВОПРОСА', 'ONE SITUATION · THREE QUESTIONS')}</span>
    <h1 id="page-title" tabIndex={-1}>{t('Что сейчас хочется улучшить?', 'What would you like to work on?')}</h1>
    <p className="lead">{t('Выберите то, что ближе. Тему можно сменить позже.', 'Choose what feels relevant. You can change the topic later.')}</p>
    <Lumi t={t} message={t('Можно начать с того, что сейчас ближе. Правильной темы нет.', 'Start with what feels relevant. There is no right topic.')}/>
    <div className="choices" role="group" aria-label={t('Выбор темы', 'Choose a topic')}>
      {topics.map(([id, icon, ru, en]) => <button key={id} data-topic={id} className="choice" disabled={!state || !!pending} onClick={() => start(id)}>
        <span className="choice-number" aria-hidden="true">{icon}</span>{t(ru, en)}
      </button>)}
    </div><p className="muted">{t('Это знакомство с темой, не завершённые уроки: XP не начисляются.', 'This is an introduction, not completed lessons: no XP is awarded.')}</p>
  </article></section>;
}

export function Guided({ topic, state, course, store, pending, t, write, notePanel, go, onSync }) {
  const active = state?.guidedFlow;
  const [step, setStep] = useState(active?.topic === topic ? active.step : 0);
  const [choice, setChoice] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState('');
  const ids = GUIDED[topic];
  const lesson = course.lessons.find((l) => l.id === ids?.[step]);
  const stale = active?.topic !== topic || (active.step !== step && !(feedback === 'done' && active.step === step + 1));
  useEffect(() => { document.getElementById('page-title')?.focus(); }, [step, stale]);

  function sync() {
    setStep(active.step); setChoice(null); setFeedback(null); setCopyState('');
    // Acknowledge only the guided conflict; this does not write progress.
    onSync();
  }
  async function check() {
    if (!lesson || choice === null || feedback === 'done' || pending || saving || stale) return;
    if (!lesson.quiz.correct.includes(choice)) { setFeedback('retry'); return; }
    setSaving(true);
    const ok = await write(() => answerGuided(store, course.lessons, topic, step, choice));
    if (ok) {
      setFeedback('done');
      vibrateOnSavedProgress(step === ids.length - 1 ? 'milestone' : 'step');
    }
    setSaving(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(lesson.example); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  }
  if (!ids || (!saving && stale)) return <section className="lesson-screen"><article className="lesson-card">
    <h1 id="page-title" tabIndex={-1}>{t('Место обучения изменилось.', 'Your learning place has changed.')}</h1>
    <p>{t('В другой вкладке могла измениться тема или прогресс. Ответ не будет применён к другому вопросу.', 'Another tab may have changed the topic or progress. Your answer will not be applied to a different question.')}</p>
    <div className="button-row">{active?.topic === topic && <button className="primary" onClick={sync}>{t('Продолжить с сохранённого вопроса', 'Continue from the saved question')}</button>}
      <button className="secondary" onClick={() => go('start')}>{t('Выбрать тему', 'Choose a topic')}</button></div>
  </article></section>;
  if (step === ids.length) {
    const module = course.modules.find((m) => m.id === topic);
    const next = nextLesson({ ...state, guidedFlow: null, currentLessonId: null, focusModule: topic }, course.lessons);
    return <section className="lesson-screen"><progress value={3} max={3} aria-label={t('Вопросы знакомства', 'Introduction questions')}/><article className="lesson-card">
      <span className="eyebrow">{t('ТРИ ВОПРОСА ПРОЙДЕНЫ', 'THREE QUESTIONS COMPLETED')}</span>
      <h1 id="page-title" tabIndex={-1}>{t('Хорошее начало.', 'A good beginning.')}</h1>
      <p className="lead">{t('Продолжим тему', 'Continue with')} «{module.title}».</p>
      <p>{t('Вы попробовали три ситуации. Полные уроки и XP — отдельный следующий шаг.', 'You explored three situations. Full lessons and XP are a separate next step.')}</p>
      <div className="button-row"><button className="primary" disabled={!!pending || !state} onClick={() => go(next ? `lesson/${next.id}` : 'progress')}>{t('Продолжить тему', 'Continue this topic')}</button><button className="secondary" onClick={() => go('path')}>{t('Все орбиты', 'All orbits')}</button></div>
    </article></section>;
  }
  return <section className="lesson-screen"><div className="lesson-top"><button className="secondary" disabled={!!pending || saving} onClick={() => go('path')}>← {t('К маршруту', 'Back to path')}</button><span>{t('ВОПРОС', 'QUESTION')} {step + 1}/3</span></div>
    <progress value={feedback === 'done' ? step + 1 : step} max={3} aria-label={t('Вопросы знакомства', 'Introduction questions')}/>
    <article className="lesson-card"><span className="eyebrow">{lesson.title}</span><h1 id="page-title" tabIndex={-1}>{lesson.quiz.prompt}</h1>
      <div className="choices" role="group" aria-label={t('Варианты ответа', 'Answer choices')}>{lesson.quiz.choices.map((text, i) => <button key={i} className={`choice ${choice === i ? 'selected' : ''}`} aria-pressed={choice === i} disabled={!!pending || saving || feedback === 'done'} onClick={() => { setChoice(i); setFeedback(null); }}><span className="choice-number" aria-hidden="true">{i + 1}</span>{text}</button>)}</div>
      {feedback === 'retry' && <div className="feedback retry" role="status"><LumiPortrait mood="support"/><strong>{t('Попробуем другой ответ.', 'Let’s try another answer.')}</strong><p>{lesson.principle}</p></div>}
      {feedback === 'done' ? <div className="feedback success" role="status"><LumiPortrait mood="success"/><h2>{t('Да, так будет понятнее.', 'Yes, that makes it clearer.')}</h2><p>{lesson.quiz.explanation}</p>
        <details><summary>{t('Пример и своя заметка', 'Example and your reflection')}</summary><blockquote>{lesson.example}</blockquote><button className="secondary" onClick={copy}>{t('Скопировать пример', 'Copy example')}</button>{copyState && <p role="status">{copyState === 'copied' ? t('Пример скопирован.', 'Example copied.') : t('Не удалось скопировать. Выделите текст вручную.', 'Could not copy. Select the text manually.')}</p>}{notePanel(lesson.id)}</details>
        <p className="muted">{t('Вопрос сохранён. Полные уроки не отмечены; XP не изменились.', 'Question saved. Full lessons are not marked complete; XP is unchanged.')}</p>
        <button className="primary" onClick={sync}>{step < 2 ? t('Следующий вопрос', 'Next question') : t('Посмотреть результат', 'See the result')}</button>
      </div> : <button className="primary" disabled={choice === null || !!pending || saving || !state} onClick={check}>{pending || saving ? t('Сохраняем…', 'Saving…') : t('Проверить ответ', 'Check answer')}</button>}
    </article></section>;
}
