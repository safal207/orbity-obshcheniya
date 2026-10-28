import React from 'react';
import { practiceProgress } from './practice-progress.mjs';
import './product-progress.css';

export function PracticeProgress({ personal, now, t, go, dailyCopy, focus }) {
  if (!personal.loaded) return <section className="card" role="status">{t('Читаем ваши фразы и наблюдения…', 'Loading your phrases and reflections…')}</section>;
  if (personal.error) return <section className="card" data-testid="practice-unavailable">
    <h2>{t('Личный результат пока недоступен', 'Your personal result is unavailable')}</h2>
    <p>{t('Не удалось прочитать личный путь. Сохранённые данные не изменены. Можно проверить доступ или восстановить полную копию ниже.',
      'Your personal path could not be read. Saved data has not been changed. Check storage access or restore a full backup below.')}</p>
    <button className="secondary" onClick={personal.refresh}>{t('Перечитать личный путь', 'Reload my personal path')}</button>
  </section>;
  const { status, first, last, outcomes, action } = practiceProgress(personal.state, now);
  const outcomeLabel = value => value === 'tried' ? t('Удалось попробовать', 'I tried it')
    : value === 'difficult' ? t('Было трудно', 'It was difficult') : t('Пока не было случая', 'No chance yet');
  const nextSteps = {
    start: [t('Начните с одной своей фразы', 'Start with one phrase of your own'),
      t('За первое занятие разберёте обычную ситуацию и сохраните слова, которые хотите попробовать. Около 5 минут.',
        'Explore an everyday situation and save words you would like to try in your first session. About 5 minutes.'), dailyCopy, 'today'],
    reflect: [t('Как получилось с этой фразой?', 'How did this phrase work for you?'),
      t('Если хотите, отметьте свой опыт. Ответ «Пока не было случая» тоже подходит. Это не оценка отношений.',
        'If you wish, record your experience. “No chance yet” is a valid answer too. This is not a relationship score.'),
      t('Рассказать, как получилось', 'Reflect on my experience'), 'today/experience'],
    rehearse: [t('Можно потренировать один небольшой шаг', 'You can rehearse one small step'),
      t('Вы отметили, что было трудно. Короткая практика поможет ещё раз разобрать ясную просьбу, прежде чем пробовать её в разговоре.',
        'You recorded that it was difficult. Revisit a clear request in a short practice before trying it in a conversation.'),
      t('Потренировать просьбу', 'Practise a request'), 'practice/needs-1'],
    prepare: [t('Подготовьтесь без спешки', 'Prepare at your own pace'),
      t('Случая пока не было. Можно пройти шаги одной ясной просьбы и выбрать удобный момент. Разговор с другим человеком необязателен.',
        'There has not been a chance yet. Explore the steps of a clear request and choose a suitable moment. A conversation with someone else is optional.'),
      t('Подготовить следующий разговор', 'Prepare for a conversation'), 'mission/clear-request'],
    continue: [t('Продолжите с новой ситуацией', 'Continue with a new situation'),
      t('Ваш опыт сохранён. Следующее занятие поможет найти слова для ещё одной повседневной ситуации.',
        'Your experience is saved. The next session helps you find words for another everyday situation.'), dailyCopy, 'today'],
    apply: [t(status.phase === 'week-done' ? 'Возьмите одну фразу на следующую неделю' : 'Один шаг за пределами урока',
      status.phase === 'week-done' ? 'Take one phrase into next week' : 'One step beyond the lesson'),
      t('Вы отметили попытку. Выберите одну сохранённую фразу и подходящий момент для практики. Новые уроки не обязательны.',
        'You recorded an attempt. Choose a saved phrase and a suitable moment to practise. New lessons are optional.'),
      t('Открыть практику в жизни', 'Open real-life practice'), 'mission/clear-request'],
  };
  const [title, description, label, target] = nextSteps[action];
  return <section className="practice-progress" data-testid="practice-progress" aria-labelledby="practice-result-title">
    <div className="card practice-result">
      <span className="eyebrow">{t('МОИ СЛОВА И МОЙ ОПЫТ', 'MY WORDS AND EXPERIENCE')}</span>
      <h2 id="practice-result-title">{t('Мой личный результат', 'My personal result')}</h2>
      <p>{t('Практикую: говорить о своих потребностях.', 'Practising: expressing my needs.')} {status.completedCount}/7 {t('занятий сохранено.', 'sessions saved.')}</p>
      {focus && <div className="focus-context" data-testid="saved-focus"><strong>{t('Моя тема курса: ', 'My course topic: ')}{focus.title}</strong><p>{focus.reason}</p><button className="text-action" onClick={() => go(focus.route)}>{t('Вернуться к этой теме', 'Return to this topic')}</button></div>}
      {last ? <>
        <h3>{t('Моя последняя фраза', 'My latest phrase')}</h3>
        <blockquote className="personal-written" data-testid="progress-phrase">{last.phrase}</blockquote>
        {last.plan && <p className="personal-written" data-testid="progress-plan"><strong>{t('Где попробую: ', 'Where I will try it: ')}</strong>{last.plan}</p>}
        <h3>{t('Что я заметил(а)', 'What I noticed')}</h3>
        {last.reflection ? <div data-testid="progress-reflection"><p><strong>{outcomeLabel(last.reflection.outcome)}</strong></p>{last.reflection.note && <p className="personal-written">{last.reflection.note}</p>}</div>
          : <p>{t('Опыт применения пока не записан. Можно вернуться к нему, когда будет удобно.', 'No experience has been recorded yet. You can return to it whenever it suits you.')}</p>}
        <dl className="practice-counts" aria-label={t('Мои отметки об опыте', 'My experience records')}>
          <div><dt>{t('Попробовал(а)', 'Tried it')}</dt><dd data-testid="outcome-tried">{outcomes.tried}</dd></div>
          <div><dt>{t('Было трудно', 'Difficult')}</dt><dd>{outcomes.difficult}</dd></div>
          <div><dt>{t('Не было случая', 'No chance')}</dt><dd>{outcomes['no-chance']}</dd></div>
          <div><dt>{t('Без отметки', 'Not recorded')}</dt><dd>{outcomes.unrecorded}</dd></div>
        </dl>
        <p className="muted">{t('Это ваши наблюдения, а не измерение качества отношений. Пустая отметка не означает неудачу.',
          'These are your observations, not a measure of relationship quality. An empty record does not mean failure.')}</p>
        {status.phase === 'week-done' && <details className="phrase-comparison" data-testid="progress-comparison"><summary>{t('Мои слова в первом и седьмом занятии', 'My words in sessions one and seven')}</summary>
          <h3>{t('Первое занятие', 'First session')}</h3><blockquote className="personal-written">{first.phrase}</blockquote>
          <h3>{t('Седьмое занятие', 'Seventh session')}</h3><blockquote className="personal-written">{last.phrase}</blockquote>
          {personal.state.profile.baseline !== null && <p>{t(`Моя самооценка на старте: ${personal.state.profile.baseline}/5. Сравните свои ощущения сейчас — это личное наблюдение, а не доказательство эффекта курса.`,
            `My starting self-rating: ${personal.state.profile.baseline}/5. Compare how it feels now — this is a personal observation, not evidence of course effectiveness.`)}</p>}
        </details>}
      </> : <p data-testid="practice-empty">{t('Здесь появятся ваши фразы, планы и наблюдения. Уроки курса и личные занятия учитываются отдельно.',
        'Your phrases, plans and observations will appear here. Course lessons and personal sessions are counted separately.')}</p>}
    </div>
    <section className="card next-practice" aria-labelledby="next-practice-title" data-testid={`next-practice-${action}`}>
      <span className="eyebrow">{t('ОДИН СЛЕДУЮЩИЙ ШАГ', 'ONE NEXT STEP')}</span>
      <h2 id="next-practice-title">{title}</h2><p>{description}</p>
      <div className="button-row"><button className="primary" onClick={() => go(target)}>{label}</button>
        {last && target !== 'today' && <button className="secondary" onClick={() => go('today')}>{dailyCopy}</button>}</div>
    </section>
  </section>;
}
