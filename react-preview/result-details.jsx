import React, { useState } from 'react';

export function ResultDetails({ lesson, t, notePanel }) {
  const [copyState, setCopyState] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(lesson.example); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  }
  return <details className="result-details">
    <summary>{t('Пример и своя заметка', 'Example and your reflection')}</summary>
    <blockquote>{lesson.example}</blockquote>
    <button className="secondary" onClick={copy}>{t('Скопировать пример', 'Copy example')}</button>
    {copyState && <p role="status">{copyState === 'copied' ? t('Пример скопирован.', 'Example copied.') : t('Не удалось скопировать. Выделите текст вручную.', 'Could not copy. Select the text manually.')}</p>}
    {notePanel(lesson.id)}
  </details>;
}
