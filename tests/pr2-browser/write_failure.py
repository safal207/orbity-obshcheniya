#!/usr/bin/env python3
"""Legacy lesson write-failure acceptance. Synthetic data; no app-file edits.

Inject one key-scoped QuotaExceededError through the browser Storage API after
bookmark persistence. Native reads and Web Locks remain intact. This tests
handling of an injected rejection, not physical disk/quota exhaustion.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import socket
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone

from playwright.sync_api import expect, sync_playwright
import acceptance as harness

OUT = harness.ROOT / 'pr2-browser-artifacts' / 'write-failure'
TARGET = 'map-2'


def raw_saved(page) -> str | None:
    return page.evaluate('(key) => localStorage.getItem(key)', harness.KEY)


def show_progress(page, expected_count: int) -> None:
    # Same-document navigation also checks the live app state before a reload.
    page.evaluate("location.hash = '#progress'")
    bar = page.locator('#main [role="progressbar"]')
    expect(bar).to_have_attribute('aria-valuemax', '32')
    expect(bar).to_have_attribute('aria-valuenow', str(expected_count))


def open_question(page, url: str) -> int:
    page.goto(f'{url}#lesson/{TARGET}')
    page.locator(f'[data-open-question="{TARGET}"]').click()
    choice = page.evaluate('''async (id) => {
      const {lessons} = await import('/course.js');
      return lessons.find(lesson => lesson.id === id).quiz.correct[0];
    }''', TARGET)
    button = page.locator(f'[data-answer-id="{TARGET}"][data-mode="lesson"][data-choice="{choice}"]')
    expect(button).to_be_visible()
    expect(button).to_be_enabled()
    return choice


def run_case(browser, lang: str, record: dict) -> None:
    case_dir = OUT / lang
    case_dir.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page.set_default_timeout(5000)
    page.set_default_navigation_timeout(12000)
    record.update(status='RUNNING', completed_phases=[], page_errors=[], unexpected_dialogs=[])
    page.on('pageerror', lambda error: record['page_errors'].append(str(error)))
    def dismiss_dialog(dialog):
        record['unexpected_dialogs'].append(dialog.type)
        dialog.dismiss()
    page.on('dialog', dismiss_dialog)
    url = harness.BASE + ('/en.html' if lang == 'en' else '/')
    try:
        response = page.goto(url)
        assert response.status == 200
        assert page.evaluate('window.isSecureContext && !!navigator.locks')
        assert raw_saved(page) is None, 'Use a fresh context, never user progress'
        # Seed meaningful unrelated progress through the real UI, not a store mock.
        note = harness.open_note(page, 'map-1', lang == 'en', complete_lesson=True)
        note.fill('SYNTHETIC baseline note - keep exactly')
        harness.wait_notes(page, {'map-1': 'SYNTHETIC baseline note - keep exactly'})
        expect(page.locator('[data-note-status="map-1"]')).to_contain_text('Note saved' if lang == 'en' else 'Заметка сохранена')
        choice = open_question(page, url)
        before_raw = raw_saved(page)
        before = json.loads(before_raw)
        assert set(before['completed']) == {'map-1'}
        assert TARGET not in before['answers'] and TARGET not in before['review']
        assert before['currentLessonId'] == TARGET, 'Bookmark must finish before fault injection'
        header = page.locator('#header-progress').inner_text()
        harness.write_json(case_dir / 'before.json', before)
        record['completed_phases'].append('Existing note/lesson saved; target bookmark and question ready')

        page.evaluate('''(key) => {
          const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
          const original = descriptor.value;
          const probe = { calls: 0, attempted: null, errorName: 'QuotaExceededError' };
          const reject = function(name, value) {
            if (this === localStorage && String(name) === key) {
              probe.calls++;
              probe.attempted = String(value);
              throw new DOMException('Synthetic PR2 acceptance rejection', probe.errorName);
            }
            return Reflect.apply(original, this, [name, value]);
          };
          Object.defineProperty(Storage.prototype, 'setItem', { ...descriptor, value: reject });
          window.pr2WriteFault = probe;
          window.restorePR2WriteFault = () => {
            Object.defineProperty(Storage.prototype, 'setItem', descriptor);
            return Storage.prototype.setItem === original;
          };
        }''', harness.KEY)
        button = page.locator(f'[data-answer-id="{TARGET}"][data-mode="lesson"][data-choice="{choice}"]')
        button.click()
        error_text = 'Could not save or read progress.' if lang == 'en' else 'Не удалось сохранить или прочитать прогресс.'
        expect(page.locator('#toast.show')).to_contain_text(error_text)
        expect(page.locator('.result.good')).to_have_count(0)
        expect(button).to_be_visible()
        expect(page.locator('#header-progress')).to_have_text(header)
        # Wait for the native transaction lock to drain; do not replace the lock.
        page.evaluate('(key) => navigator.locks.request(key, () => {})', harness.KEY)
        fault = page.evaluate('window.pr2WriteFault')
        record['fault'] = fault
        assert fault['calls'] == 1, 'The lesson action must actually reach the rejecting write'
        attempted = json.loads(fault['attempted'])
        assert attempted['completed'].get(TARGET), 'Reject the completion write, not a bookmark or wrong answer'
        assert raw_saved(page) == before_raw, 'Any persisted byte change on rejection is a failure'
        record['error_text'] = page.locator('#toast').inner_text()
        record['completed_phases'].append('One completion write rejected; visible error; no success or saved changes')
        page.screenshot(path=str(case_dir / 'rejected.png'), full_page=True)

        show_progress(page, 1)
        assert raw_saved(page) == before_raw, 'In-memory navigation must not hide an optimistic completion'
        record['live_progress_count_after_rejection'] = 1
        assert page.evaluate('window.restorePR2WriteFault()') is True
        page.reload()
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '1')
        assert raw_saved(page) == before_raw, 'Rejected completion must stay absent after reload'
        record['before_sha256'] = hashlib.sha256(before_raw.encode()).hexdigest()
        record['after_rejection_sha256'] = hashlib.sha256(raw_saved(page).encode()).hexdigest()
        harness.write_json(case_dir / 'after-rejection.json', json.loads(raw_saved(page)))
        record['completed_phases'].append('Live Progress and reloaded Progress still show one completed lesson')

        # Positive control: identical correct-answer action works without the fault.
        retry_choice = open_question(page, url)
        assert retry_choice == choice and raw_saved(page) == before_raw
        page.locator(f'[data-answer-id="{TARGET}"][data-mode="lesson"][data-choice="{choice}"]').click()
        expect(page.locator('.result.good')).to_be_visible()
        after = json.loads(raw_saved(page))
        assert set(after['completed']) == {'map-1', TARGET}
        assert after['completed']['map-1'] == before['completed']['map-1']
        assert after['answers'] == {**before['answers'], TARGET: choice}
        assert after['review'][TARGET] > after['completed'][TARGET]
        assert {k: v for k, v in after['review'].items() if k != TARGET} == before['review']
        for field in ['notes', 'missionSteps', 'focusModule', 'currentLessonId', 'guidedFlow']:
            assert after[field] == before[field], f'Unrelated field changed: {field}'
        after_raw = raw_saved(page)
        show_progress(page, 2)
        page.reload()
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '2')
        assert raw_saved(page) == after_raw
        harness.write_json(case_dir / 'after-retry.json', after)
        page.screenshot(path=str(case_dir / 'retry-progress.png'), full_page=True)
        assert not record['page_errors'], record['page_errors']
        assert not record['unexpected_dialogs'], record['unexpected_dialogs']
        record['completed_phases'].append('Fault removed; same answer persists; unrelated state preserved after reload')
        record['status'] = 'PASS'
    except Exception as error:
        record['status'] = 'BLOCKED' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error) else 'FAIL'
        record['error'] = str(error)
        record['traceback'] = traceback.format_exc()
        raise
    finally:
        harness.write_json(case_dir / 'result.json', record)
        try:
            context.tracing.stop(path=str(case_dir / 'trace.zip'))
        finally:
            context.close()  # Fault patch cannot escape this isolated context.


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        'repository': 'safal207/orbity-obshcheniya', 'target_sha': harness.HEAD,
        'harness_sha': os.environ.get('HARNESS_SHA'), 'workflow_sha': os.environ.get('GITHUB_SHA'),
        'run_url': os.environ.get('RUN_URL'), 'status': 'NOT_RUN',
        'started_at': datetime.now(timezone.utc).isoformat(), 'cases': [],
        'environment': {'playwright_python': importlib.metadata.version('playwright'),
                        'viewport': {'width': 1280, 'height': 900}, 'python': sys.version},
        'scope': 'One legacy lesson write-rejection scenario in separate RU and EN contexts, plus retry control',
        'non_claims': ['Synthetic Storage.setItem rejection, not actual quota or disk exhaustion',
                       'Not corrupt-storage/backup restore acceptance', 'Not physical Android, manual accessibility or visual acceptance',
                       'Not full PR approval, React acceptance or deployment'],
    }
    server = None
    try:
        manifest = harness.verify_source()
        harness.write_json(OUT / 'source-manifest.json', manifest)
        report['source_verification'] = {'status': 'PASS', 'matching_files': len(manifest['files'])}
        report['environment']['node'] = subprocess.check_output(['node', '--version'], text=True).strip()
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', 5187)) == 0:
                raise RuntimeError('Port 5187 occupied; refusing an unknown server')
        with (OUT / 'server.log').open('w', encoding='utf-8') as log:
            server = subprocess.Popen(['node', 'server.mjs'], cwd=harness.SOURCE, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 5
            while True:
                if server.poll() is not None:
                    raise RuntimeError('Exact-source server exited')
                with socket.socket() as sock:
                    if sock.connect_ex(('127.0.0.1', 5187)) == 0:
                        break
                if time.monotonic() > deadline:
                    raise RuntimeError('Exact-source server did not start')
                time.sleep(.05)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                report['environment']['chromium'] = browser.version
                try:
                    for lang in ['ru', 'en']:
                        case = {'language': lang}
                        report['cases'].append(case)
                        run_case(browser, lang, case)
                finally:
                    browser.close()
        assert len(report['cases']) == 2 and all(case['status'] == 'PASS' for case in report['cases'])
        report['status'] = 'PASS'
    except Exception as error:
        report['status'] = 'BLOCKED' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error) else 'FAIL'
        report['error'] = str(error)
        report['traceback'] = traceback.format_exc()
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        harness.write_json(OUT / 'result.json', report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'PASS' else 2 if report['status'] == 'BLOCKED' else 1


if __name__ == '__main__':
    sys.exit(main())
