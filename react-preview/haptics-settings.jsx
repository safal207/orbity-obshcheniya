import React, { useEffect, useState } from 'react';
import { readHaptics, setHapticsEnabled, syncHaptics, testHaptics } from './haptics.mjs';
import './haptics-settings.css';

const resultCopy = {
  requested: ['Браузер принял запрос. Почувствовали вибрацию? Приложение не может проверить работу вибромотора.', 'The browser accepted the request. Did you feel it? The app cannot verify the vibration motor.'],
  off: ['Сначала включите вибрацию переключателем выше.', 'Turn on vibration with the switch above first.'],
  unsupported: ['В этом браузере нет доступного API вибрации. Попробуйте открыть страницу в отдельном браузере на устройстве с поддержкой вибрации.', 'This browser does not expose the vibration API. Try opening the page in a standalone browser on a device that supports vibration.'],
  blocked: ['Браузер отклонил запрос на вибрацию. Проверьте настройки браузера и телефона.', 'The browser rejected the vibration request. Check your browser and phone settings.'],
  hidden: ['Вернитесь в эту вкладку и нажмите «Проверить» ещё раз.', 'Return to this tab and press Test again.'],
  gesture: ['Нажмите «Проверить» непосредственно на этой странице.', 'Press Test directly on this page.'],
  error: ['Не удалось отправить запрос на вибрацию. Прогресс обучения не изменён.', 'The vibration request could not be sent. Learning progress has not changed.'],
};

export function HapticsSettings({ t }) {
  const [preference, setPreference] = useState(() => readHaptics());
  const [result, setResult] = useState(null);
  useEffect(() => {
    const refresh = () => { setPreference(readHaptics()); setResult(null); };
    const onStorage = (event) => { if (syncHaptics(event)) refresh(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    let media;
    try { media = window.matchMedia('(prefers-reduced-motion: reduce)'); }
    catch { /* The explicit switch remains available. */ }
    media?.addEventListener?.('change', refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      media?.removeEventListener?.('change', refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const change = (event) => {
    setPreference(setHapticsEnabled(event.target.checked));
    setResult(null);
  };
  const test = () => { setResult(testHaptics()); };
  return <details className="haptics-settings" data-testid="haptics-settings">
    <summary>{t('Вибрация', 'Vibration')} · {preference.enabled ? t('вкл.', 'on') : t('выкл.', 'off')}</summary>
    <div className="haptics-controls">
      <label className="haptics-toggle">
        <input type="checkbox" role="switch" checked={preference.enabled} onChange={change} aria-describedby="haptics-description"/>
        <span>{t('Вибрация при прохождении', 'Vibration during learning')}</span>
      </label>
      <p id="haptics-description">{t('Короткий отклик только после сохранённого шага. Проверка ниже не меняет уроки, заметки или XP.', 'A short pulse only after a saved step. The test below does not change lessons, notes or XP.')}</p>
      {(preference.storage === 'ok' || preference.storage === 'session') && <p className="haptics-preference" data-testid="haptics-preference">{preference.mode === 'auto'
        ? t('Пока вы не выбрали вручную, учитывается уменьшение анимации. Переключатель задаёт вибрацию отдельно.', 'Until you choose manually, reduced motion is respected. The switch controls vibration separately.')
        : t('Вибрация выбрана вручную, независимо от настройки анимации.', 'Vibration is explicitly set, independently of motion settings.')}</p>}
      {preference.storage !== 'ok' && <p role="status" className="haptics-storage" data-testid="haptics-storage">{preference.storage === 'session'
        ? t('Не удалось подтвердить сохранение настройки. Сейчас выбор действует только в этой вкладке; после перезагрузки проверьте его снова.', 'The preference could not be confirmed as saved. Your choice currently applies only to this tab; check it again after reloading.')
        : t('Настройку не удалось прочитать. Выберите её вручную. Прогресс обучения не изменён.', 'The preference could not be read. Choose it manually. Learning progress has not changed.')}</p>}
      <button type="button" className="secondary" onClick={test} data-testid="haptics-test">{t('Проверить', 'Test')}</button>
      <p className="haptics-result" role="status" aria-atomic="true" data-testid="haptics-result">{result ? t(...resultCopy[result]) : ''}</p>
      <p className="haptics-help">{t('Если запрос принят, но отклика нет: проверьте системную вибрацию и режим «Не беспокоить», затем попробуйте отдельный браузер вместо встроенного. Данные сайта очищать не нужно.', 'If the request is accepted but you feel nothing: check system vibration and Do Not Disturb, then try a standalone browser instead of an in-app browser. You do not need to clear site data.')}</p>
    </div>
  </details>;
}
