import React, { useState } from 'react';
import portraits from './lumi-portraits.webp';

const frames = { idle: 0, success: 1, support: 2 };

/** Decorative art only: the adjacent, localized text carries all feedback. */
export function LumiPortrait({ mood = 'idle' }) {
  const [unavailable, setUnavailable] = useState(false);
  const safeMood = Object.hasOwn(frames, mood) ? mood : 'idle';
  return <span className="lumi-portrait" data-lumi-mood={safeMood} aria-hidden="true">
    <span className="lumi-fallback">✦</span>
    {!unavailable && <img src={portraits} alt="" width={576} height={192}
      draggable={false} decoding="async" onError={() => setUnavailable(true)}
      style={{ transform: `translateX(-${frames[safeMood] * 100 / 3}%)` }}/>}
  </span>;
}

/** No storage, timers, XP, inferred emotions, or live-region duplication. */
export function Lumi({ t, mood = 'idle', message, hero = false }) {
  return <div className={`lumi-card${hero ? ' lumi-hero' : ''}`} data-testid="lumi-companion">
    <LumiPortrait mood={mood}/>
    <div className="lumi-copy">
      <span className="lumi-name">{t('Луми · ваш спутник', 'Lumi · your companion')}</span>
      <p>{message || t('Один маленький шаг — в вашем темпе.', 'One small step, at your own pace.')}</p>
    </div>
  </div>;
}

/** Lightweight route hint: visual only, dismissible, and never reads or writes progress. */
export function LumiTip({ t, message, onClose }) {
  return <aside className="lumi-tip" data-testid="lumi-route-tip" aria-label={t('Совет Луми', 'Lumi tip')}>
    <LumiPortrait mood="support"/>
    <div className="lumi-tip-copy">
      <span className="lumi-name">{t('Луми рядом', 'Lumi is here')}</span>
      <p>{message}</p>
    </div>
    <button className="lumi-tip-close" type="button" onClick={onClose}
      aria-label={t('Скрыть совет Луми', 'Dismiss Lumi tip')}>×</button>
  </aside>;
}
