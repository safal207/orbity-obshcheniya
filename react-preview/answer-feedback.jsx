import React, { useLayoutEffect, useRef, useState } from 'react';
import { LumiAnimation, LumiPortrait } from './lumi.jsx';
import './answer-feedback.css';

function reveal(target) {
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

// A failed save must reveal its error, never a successful next step.
export function useAnswerError() {
  const [failedAttempt, setFailedAttempt] = useState(0);
  useLayoutEffect(() => {
    if (failedAttempt) reveal(document.querySelector('.alert[role="alert"]'));
  }, [failedAttempt]);
  // Wait for React to commit the error, including on repeated failed attempts.
  return () => setFailedAttempt((attempt) => attempt + 1);
}

export function AnswerFeedback({ kind, title, explanation, actionLabel, onAction, disabled, t, children }) {
  const titleRef = useRef(null);
  useLayoutEffect(() => { reveal(titleRef.current); }, [kind]);

  function act(event) {
    const choices = event.currentTarget.closest('.lesson-card')?.querySelector('.choices');
    onAction();
    if (kind === 'retry') requestAnimationFrame(() => {
      choices?.querySelector('button')?.focus({ preventScroll: true });
      choices?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }

  return <div className={`feedback answer-feedback ${kind}`} role="status">
    <h2 ref={titleRef} tabIndex={-1} data-testid="answer-feedback-title">{title}</h2>
    <button className="primary answer-feedback-action" data-testid="answer-feedback-action"
      disabled={disabled} onClick={act}>{actionLabel} <span aria-hidden="true">{kind === 'retry' ? '↑' : '→'}</span></button>
    {kind === 'success' ? <LumiAnimation t={t} mood="success"/> : <LumiPortrait mood="support"/>}
    <p className="answer-explanation">{explanation}</p>
    {children}
  </div>;
}
