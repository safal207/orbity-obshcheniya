import React, { useEffect, useState } from 'react';
import { reviewQueue, answerReview } from './review.mjs';
import { ResultDetails } from './result-details.jsx';
import { LumiAnimation } from './lumi.jsx';
import { AnswerFeedback, useAnswerError } from './answer-feedback.jsx';
import { vibrateOnSavedProgress } from './haptics.mjs';

export function Review({ state, course, store, pending, t, write, notePanel, go, onSync }) {
  const revealAnswerError = useAnswerError();
  const [queue, setQueue] = useState(() => reviewQueue(state, course.lessons));
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const stale = !!state && !!queue?.some((id) => !state.completed[id]);
  const lesson = course.lessons.find((item) => item.id === queue?.[position]);

  useEffect(() => { if (queue === null && state) setQueue(reviewQueue(state, course.lessons)); }, [state, queue, course.lessons]);
  useEffect(() => { document.getElementById('page-title')?.focus(); }, [position, stale, queue?.length]);

  function restart() {
    setQueue(reviewQueue(state, course.lessons)); setPosition(0); setChoice(null); setFeedback(null);
    onSync();
  }
  function next() {
    if (pending || saving || stale || !state || feedback !== 'done') return;
    setPosition((index) => index + 1); setChoice(null); setFeedback(null);
  }
  async function check() {
    if (!lesson || choice === null || feedback === 'done' || pending || saving || stale || !state) return;
    if (!lesson.quiz.correct.includes(choice)) { setFeedback('retry'); return; }
    setSaving(true);
    if (await write(() => answerReview(store, lesson, choice))) {
      setFeedback('done');
      vibrateOnSavedProgress(position === queue.length - 1 ? 'milestone' : 'step');
    } else revealAnswerError();
    setSaving(false);
  }

  if (!state || queue === null) return <section className="lesson-screen"><article className="lesson-card">
    <h1 id="page-title" tabIndex={-1}>{t('Повторение пока недоступно.', 'Review is currently unavailable.')}</h1>
    <p>{t('Проверьте сохранённый прогресс и попробуйте снова.', 'Check your saved progress and try again.')}</p>
  </article></section>;
  if (stale) return <section className="lesson-screen"><article className="lesson-card">
    <h1 id="page-title" tabIndex={-1}>{t('Сохранённый прогресс изменился.', 'Your saved progress has changed.')}</h1>
    <p>{t('Соберём повторение заново из завершённых уроков.', 'Build a new review from your completed lessons.')}</p>
    <button className="primary" disabled={!!pending || saving} onClick={restart}>{t('Обновить повторение', 'Refresh review')}</button>
  </article></section>;
  if (!queue.length) return <section className="lesson-screen" data-testid="review-empty"><article className="lesson-card">
    <span className="eyebrow">{t('ПОВТОРЕНИЕ', 'REVIEW')}</span>
    <h1 id="page-title" tabIndex={-1}>{t('Сначала пройдите один урок.', 'Complete a lesson first.')}</h1>
    <p className="lead">{t('После него здесь появится вопрос, к которому можно вернуться.', 'Then a question you can revisit will appear here.')}</p>
    <button className="primary" onClick={() => go('path')}>{t('Начать', 'Get started')} →</button>
  </article></section>;
  if (position >= queue.length) return <section className="lesson-screen" data-testid="review-complete">
    <progress value={queue.length} max={queue.length} aria-label={t('Вопросы повторения', 'Review questions')}/>
    <article className="lesson-card"><span className="eyebrow">{t('ПОВТОРЕНИЕ ЗАВЕРШЕНО', 'REVIEW COMPLETE')}</span>
      <h1 id="page-title" tabIndex={-1}>{t('Вы освежили навыки.', 'You refreshed your skills.')}</h1>
      <LumiAnimation t={t} mood="success"/>
      <p className="lead">{t('Вернитесь к ним в следующем разговоре.', 'Bring them into your next conversation.')}</p>
      <p>{t('Вопросов пройдено', 'Questions completed')}: {queue.length}. {t('Повторение не добавляет XP.', 'Review does not add XP.')}</p>
      <button className="primary" onClick={() => go('path')}>{t('К следующему шагу', 'Next step')} →</button>
    </article>
  </section>;
  return <section className="lesson-screen" data-testid="review-session">
    <div className="lesson-top"><button className="secondary" onClick={() => go('path')}>← {t('К маршруту', 'Back to path')}</button><span>{t('ПОВТОРЕНИЕ · ВОПРОС', 'REVIEW · QUESTION')} {position + 1}/{queue.length}</span></div>
    <progress value={feedback === 'done' ? position + 1 : position} max={queue.length} aria-label={t('Вопросы повторения', 'Review questions')}/>
    <article className="lesson-card"><span className="eyebrow">{lesson.title}</span><h1 id="page-title" tabIndex={-1}>{lesson.quiz.prompt}</h1>
      <div className="choices" role="group" aria-label={t('Варианты ответа', 'Answer choices')}>{lesson.quiz.choices.map((text, index) => <button key={index} className={`choice ${choice === index ? 'selected' : ''}`} aria-pressed={choice === index} disabled={!!pending || saving || feedback === 'done'} onClick={() => { setChoice(index); setFeedback(null); }}><span className="choice-number" aria-hidden="true">{index + 1}</span>{text}</button>)}</div>
      {feedback === 'retry' && <AnswerFeedback kind="retry" t={t} title={t('Попробуем другой ответ.', 'Let’s try another answer.')} explanation={lesson.principle} actionLabel={t('Выбрать другой ответ', 'Choose another answer')} onAction={() => { setChoice(null); setFeedback(null); }}/>}
      {feedback === 'done' && <AnswerFeedback kind="success" t={t} title={t('Повторение сохранено!', 'Review saved!')} explanation={lesson.quiz.explanation} actionLabel={position + 1 < queue.length ? t('Следующий вопрос', 'Next question') : t('Посмотреть результат', 'See the result')} onAction={next} disabled={!!pending || saving}>
        <ResultDetails key={lesson.id} lesson={lesson} t={t} notePanel={notePanel}/>
        <p className="muted">{t('Следующее повторение — через три дня. XP не изменились.', 'Next review is in three days. XP is unchanged.')}</p>
      </AnswerFeedback>}
      {!feedback && <button className="primary" disabled={choice === null || !!pending || saving} onClick={check}>{pending || saving ? t('Сохраняем…', 'Saving…') : t('Проверить ответ', 'Check answer')}</button>}
    </article>
  </section>;
}
