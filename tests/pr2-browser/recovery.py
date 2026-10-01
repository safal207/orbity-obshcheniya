#!/usr/bin/env python3
"""Legacy corrupt-storage recovery acceptance. Synthetic data; no app-file edits.

For RU and EN separately, create a valid saved state through the real UI, corrupt
only the progress key, reject an invalid backup without touching the corrupt raw
bytes, then restore the valid backup through the real file input + confirm flow.
"""
from __future__ import annotations

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

OUT = harness.ROOT / 'pr2-browser-artifacts' / 'recovery'
TARGET = 'map-2'
CORRUPT = '{"completed":'
NOTE = 'SYNTHETIC backup note - restore exactly'


def raw_saved(page) -> str | None:
    return page.evaluate('(key) => localStorage.getItem(key)', harness.KEY)


def upload_json(page, payload: object, name: str) -> None:
    page.locator('[data-import]').set_input_files({
        'name': name,
        'mimeType': 'application/json',
        'buffer': json.dumps(payload, ensure_ascii=False).encode('utf-8'),
    })


def run_case(browser, lang: str, record: dict) -> None:
    case_dir = OUT / lang
    case_dir.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page.set_default_timeout(5000)
    page.set_default_navigation_timeout(12000)
    record.update(status='RUNNING', completed_phases=[], page_errors=[], unexpected_dialogs=[], restore_dialogs=[])
    page.on('pageerror', lambda error: record['page_errors'].append(str(error)))
    allow_restore = {'value': False}

    def handle_dialog(dialog):
        if allow_restore['value'] and dialog.type == 'confirm':
            record['restore_dialogs'].append(dialog.message)
            dialog.accept()
        else:
            record['unexpected_dialogs'].append({'type': dialog.type, 'message': dialog.message})
            dialog.dismiss()

    page.on('dialog', handle_dialog)
    url = harness.BASE + ('/en.html' if lang == 'en' else '/')
    try:
        response = page.goto(url)
        assert response.status == 200
        assert page.evaluate('window.isSecureContext && !!navigator.locks')
        assert raw_saved(page) is None, 'Use a fresh context, never user progress'

        # Build a meaningful backup state only through the app UI.
        note = harness.open_note(page, 'map-1', lang == 'en', complete_lesson=True)
        note.fill(NOTE)
        harness.wait_notes(page, {'map-1': NOTE})
        expect(page.locator('[data-note-status="map-1"]')).to_contain_text(
            'Note saved' if lang == 'en' else 'Заметка сохранена')
        page.goto(f'{url}#lesson/{TARGET}')
        page.wait_for_function(
            '''({key, target}) => {
              const raw = localStorage.getItem(key);
              if (!raw) return false;
              try { return JSON.parse(raw).currentLessonId === target; } catch { return false; }
            }''',
            arg={'key': harness.KEY, 'target': TARGET},
        )
        saved = json.loads(raw_saved(page))
        assert set(saved['completed']) == {'map-1'}
        assert saved['notes']['map-1'] == NOTE
        assert saved['currentLessonId'] == TARGET
        assert TARGET not in saved['completed']
        backup = {'version': 1, 'savedAt': '2026-10-01T00:00:00.000Z', **saved}
        harness.write_json(case_dir / 'valid-backup.json', backup)
        record['completed_phases'].append('Valid lesson/note/bookmark state created through the real UI')

        # Move to a read-only screen before corruption so reload itself cannot create a new write.
        page.evaluate("location.hash = '#progress'")
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '1')
        page.evaluate('(args) => localStorage.setItem(args.key, args.raw)', {'key': harness.KEY, 'raw': CORRUPT})
        assert raw_saved(page) == CORRUPT
        page.reload()
        corrupt_message = (
            'Saved data is malformed. Nothing was overwritten.' if lang == 'en'
            else 'Сохранённые данные повреждены. Ничего не перезаписано.'
        )
        expect(page.locator('#toast.show')).to_contain_text(corrupt_message)
        assert raw_saved(page) == CORRUPT, 'Corrupt raw bytes were silently replaced during reload'
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '0')
        page.screenshot(path=str(case_dir / 'corrupt-visible.png'), full_page=True)
        record['completed_phases'].append('Corrupt stored bytes preserved; localized recovery guidance is visible')

        # A structurally invalid backup must fail before confirm and cannot overwrite corruption.
        invalid = {**backup, 'completed': {'map-1': 'not-a-timestamp'}}
        upload_json(page, invalid, 'invalid-backup.json')
        invalid_message = (
            'The progress file is malformed or has an unsupported structure.' if lang == 'en'
            else 'Файл прогресса повреждён или имеет неподдерживаемую структуру.'
        )
        expect(page.locator('#toast.show')).to_contain_text(invalid_message)
        assert raw_saved(page) == CORRUPT
        assert not record['restore_dialogs'] and not record['unexpected_dialogs'], 'Invalid backup must not reach confirmation'
        record['completed_phases'].append('Invalid backup rejected before confirmation; corrupt bytes unchanged')

        # The valid backup may replace the corrupt token only after explicit confirmation.
        allow_restore['value'] = True
        upload_json(page, backup, 'valid-backup.json')
        success_message = 'Progress imported' if lang == 'en' else 'Прогресс загружен'
        expect(page.locator('#toast.show')).to_contain_text(success_message)
        allow_restore['value'] = False
        expected_confirm = 'Replace current progress' if lang == 'en' else 'Заменить текущий прогресс'
        assert len(record['restore_dialogs']) == 1 and expected_confirm in record['restore_dialogs'][0]
        restored_raw = raw_saved(page)
        restored = json.loads(restored_raw)
        assert restored == saved, 'Validated backup did not restore the exact normalized saved state'
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '1')
        expect(page.locator('#main a.primary-button')).to_have_attribute('href', f'#lesson/{TARGET}')
        page.screenshot(path=str(case_dir / 'restored-live.png'), full_page=True)
        record['completed_phases'].append('Valid backup restored exact progress/note/bookmark after explicit confirmation')

        page.reload()
        assert raw_saved(page) == restored_raw
        expect(page.locator('#main [role="progressbar"]')).to_have_attribute('aria-valuenow', '1')
        expect(page.locator('#main a.primary-button')).to_have_attribute('href', f'#lesson/{TARGET}')
        reloaded = json.loads(raw_saved(page))
        assert reloaded['notes']['map-1'] == NOTE
        assert reloaded['currentLessonId'] == TARGET
        assert set(reloaded['completed']) == {'map-1'}
        page.screenshot(path=str(case_dir / 'restored-after-reload.png'), full_page=True)
        assert not record['page_errors'], record['page_errors']
        assert not record['unexpected_dialogs'], record['unexpected_dialogs']
        harness.write_json(case_dir / 'restored.json', reloaded)
        record['completed_phases'].append('Reload preserves restored progress, note and route bookmark')
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
            context.close()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        'repository': 'safal207/orbity-obshcheniya', 'target_sha': harness.HEAD,
        'harness_sha': os.environ.get('HARNESS_SHA'), 'workflow_sha': os.environ.get('GITHUB_SHA'),
        'run_url': os.environ.get('RUN_URL'), 'status': 'NOT_RUN',
        'started_at': datetime.now(timezone.utc).isoformat(), 'cases': [],
        'environment': {'playwright_python': importlib.metadata.version('playwright'),
                        'viewport': {'width': 1280, 'height': 900}, 'python': sys.version},
        'scope': 'Corrupt-storage to valid-backup recovery through the legacy RU and EN UIs',
        'non_claims': ['Synthetic localStorage corruption, not physical disk corruption',
                       'One bounded restore path, not universal storage recovery',
                       'Not physical Android, manual accessibility or complete visual acceptance',
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
