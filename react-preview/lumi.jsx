import React, { useEffect, useRef, useState } from 'react';
import portraits from './lumi-portraits.webp';
import welcomeVideo from './lumi-welcome.mp4';
import welcomeWebm from './lumi-welcome.webm';
import welcomePoster from './lumi-welcome-poster.jpg';

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

/** A short, silent animation. Motion preferences and controls never touch progress. */
export function LumiAnimation({ t, mood = 'idle' }) {
  const videoRef = useRef(null);
  const failedSources = useRef(0);
  const inView = useRef(false);
  const userPaused = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const resumeVisible = () => {
      const video = videoRef.current;
      if (video && inView.current && !media.matches && !document.hidden && !userPaused.current && !video.ended) {
        video.play().catch(() => setPlaying(false));
      }
    };
    const onMotion = () => {
      setReducedMotion(media.matches);
      if (media.matches) videoRef.current?.pause();
    };
    const onVisibility = () => { if (document.hidden) videoRef.current?.pause(); else resumeVisible(); };
    media.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      if (!entry.isIntersecting) videoRef.current?.pause();
      else resumeVisible();
    });
    if (videoRef.current) observer.observe(videoRef.current);
    return () => {
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [unavailable]);

  async function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { userPaused.current = true; video.pause(); return; }
    userPaused.current = false;
    if (video.ended) video.currentTime = 0;
    try { await video.play(); }
    catch { setPlaying(false); } // Autoplay restrictions leave the poster and play control available.
  }

  function sourceFailed() {
    // A source error is not a video error; let the browser try the other codec first.
    if (++failedSources.current >= 2) setUnavailable(true);
  }

  if (unavailable) return <LumiPortrait mood={mood}/>;
  return <div className="lumi-welcome" data-lumi-mood={mood} aria-live="off">
    <video ref={videoRef} className="lumi-welcome-video" data-testid="lumi-welcome-video"
      poster={welcomePoster} width={544} height={544}
      muted playsInline autoPlay={!reducedMotion} preload={reducedMotion ? 'none' : 'auto'}
      aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onError={(event) => {
        if (event.target === event.currentTarget) setUnavailable(true);
      }}>
      <source src={welcomeWebm} type="video/webm" onError={sourceFailed}/>
      <source src={welcomeVideo} type="video/mp4" onError={sourceFailed}/>
    </video>
    <button className="lumi-welcome-toggle" type="button" data-testid="lumi-welcome-toggle"
      onClick={toggle} aria-label={playing ? t('Приостановить приветствие Луми', 'Pause Lumi greeting') : t('Включить приветствие Луми', 'Play Lumi greeting')}>
      <span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>
    </button>
  </div>;
}

/** No storage, timers, XP, inferred emotions, or live-region duplication. */
export function Lumi({ t, mood = 'idle', message, hero = false }) {
  return <div className={`lumi-card${hero ? ' lumi-hero' : ''}`} data-testid="lumi-companion">
    {hero ? <LumiAnimation t={t} mood={mood}/> : <LumiPortrait mood={mood}/>}
    <div className="lumi-copy">
      <span className="lumi-name">{t('Луми · ваш спутник', 'Lumi · your companion')}</span>
      <p>{message || t('Один маленький шаг — в вашем темпе.', 'One small step, at your own pace.')}</p>
    </div>
  </div>;
}

/** Lightweight route hint: visual only, dismissible, and never reads or writes progress. */
export function LumiTip({ t, message, onClose }) {
  return <aside className="lumi-tip" data-testid="lumi-route-tip" aria-label={t('Совет Луми', 'Lumi tip')}>
    <LumiAnimation t={t} mood="support"/>
    <div className="lumi-tip-copy">
      <span className="lumi-name">{t('Луми рядом', 'Lumi is here')}</span>
      <p>{message}</p>
    </div>
    <button className="lumi-tip-close" type="button" onClick={onClose}
      aria-label={t('Скрыть совет Луми', 'Dismiss Lumi tip')}>×</button>
  </aside>;
}
