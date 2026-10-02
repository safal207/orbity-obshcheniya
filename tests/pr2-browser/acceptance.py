#!/usr/bin/env python3
"""Exact-commit legacy acceptance for PR #2. Synthetic data and localhost only.

The workflow supplies separate pinned application and current-harness checkouts.
No application-store monkeypatch, mock Web Locks, merge, or deployment.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import socket
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.pr2-browser-source'
KEY = 'orbity-dialoga-progress-v1'
BASE = 'http://127.0.0.1:5187'
HEAD = '5a5f4c2c71a5474e82c9fef22ad32bb302cf7602'


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def git(directory: Path, *args: str) -> str:
    return subprocess.check_output(['git', '-C', str(directory), *args], text=True).strip()


def verify_source() -> dict:
    # Two different checkouts: current PR harness versus the exact legacy target.
    assert Path(git(SOURCE, 'rev-parse', '--show-toplevel')).resolve() == SOURCE.resolve()
    assert git(SOURCE, 'rev-parse', 'HEAD') == HEAD, 'Wrong legacy target checkout'
    harness_head = git(ROOT, 'rev-parse', 'HEAD')
    assert harness_head == os.environ['HARNESS_SHA'], 'Harness checkout is not the requested PR head'
    assert git(SOURCE, 'rev-parse', 'HEAD:dist') == '56a59ed457fbdf2a8e22506733df4736afbbb093'
    files = []
    application_paths = []
    for line in git(SOURCE, 'ls-tree', '-r', 'HEAD').splitlines():
        metadata, path = line.split('\t', 1)
        mode, kind, blob = metadata.split()
        assert kind == 'blob' and mode == '100644', f'Unexpected source entry: {path}'
        data = (SOURCE / path).read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        assert actual == blob, f'Target bytes changed: {path}'
        # Browser evidence is reusable only while the served application runtime
        # stays byte-identical. Harness/docs/workflow files may evolve independently.
        if path == 'server.mjs' or path.startswith('dist/'):
            assert git(ROOT, 'rev-parse', f'HEAD:{path}') == blob, f'PR application drift: {path}'
            application_paths.append(path)
        files.append({'path': path, 'git_blob': blob})
    assert len(files) == 18, 'Unexpected baseline file set'
    assert len(application_paths) == 9, 'Unexpected application runtime file set'
    return {'target_sha': HEAD, 'harness_sha': harness_head, 'files': files, 'application_paths': application_paths}


def read_saved(page) -> dict:
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


def wait_notes(page, expected: dict) -> None:
    page.wait_for_function('''({key, expected}) => {
      const state = JSON.parse(localStorage.getItem(key));
      return state && Object.entries(expected).every(([id, text]) => state.notes[id] === text);
    }''', arg={'key': KEY, 'expected': expected}, timeout=4000)


def open_note(page, lesson_id: str, english: bool, *, complete_lesson: bool):
    mode = 'lesson' if complete_lesson else 'practice'
    page.goto(f"{BASE}/{'en.html' if english else ''}#{mode}/{lesson_id}")
    if complete_lesson:
        page.locator(f'[data-open-question="{lesson_id}"]').click()
    correct = page.evaluate('''async ({id, english}) => {
      const {lessons} = await import(english ? '/course.en.js' : '/course.js');
      return lessons.find(l => l.id === id).quiz.correct[0];
    }''', {'id': lesson_id, 'english': english})
    page.locator(f'[data-answer-id="{lesson_id}"][data-choice="{correct}"]').click()
    expect(page.locator('.result.good')).to_be_visible()
    disclosure = page.locator('.note-disclosure')
    if disclosure.get_attribute('open') is None:
        disclosure.locator('summary').click()
    note = page.locator(f'[data-note-id="{lesson_id}"]')
    expect(note).to_be_visible()
    return note


def ensure_note_open(page) -> None:
    # An accepted write in the other tab can re-render and close a disclosure.
    # Reopen it through the UI before taking the deterministic shared lock.
    disclosure = page.locator('.note-disclosure')
    if disclosure.get_attribute('open') is None:
        disclosure.locator('summary').click()
    expect(disclosure.locator('textarea')).to_be_visible()


def hold_real_lock(page) -> None:
    page.evaluate('''(key) => {
      window.acceptanceLockReady = false;
      window.acceptanceLockPromise = navigator.locks.request(key, () => {
        window.acceptanceLockReady = true;
        return new Promise(resolve => { window.releaseAcceptanceLock = resolve; });
      });
    }''', KEY)
    page.wait_for_function('window.acceptanceLockReady === true', timeout=2000)


def wait_queued(page, count: int) -> None:
    page.wait_for_function('''async ({key, count}) => {
      const snapshot = await navigator.locks.query();
      return snapshot.pending.filter(l => l.name === key).length >= count;
    }''', arg={'key': KEY, 'count': count}, timeout=2000)


def release_lock(page) -> None:
    page.evaluate('''async () => {
      if (window.releaseAcceptanceLock) window.releaseAcceptanceLock();
      if (window.acceptanceLockPromise) await window.acceptanceLockPromise;
    }''')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--chromium', help='Optional installed Chromium executable; no security/policy overrides are applied.')
    parser.add_argument('--output', type=Path, default=ROOT / 'pr2-browser-artifacts')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    report = {
        'repository': 'safal207/orbity-obshcheniya', 'target_sha': HEAD,
        'harness_sha': os.environ.get('HARNESS_SHA'),
        'workflow_sha': os.environ.get('GITHUB_SHA'),
        'run_url': os.environ.get('RUN_URL'),
        'scope': 'One legacy UI scenario: two RU/EN tabs, independent saved edits, same-note conflict, reload.',
        'status': 'NOT_RUN', 'started_at': datetime.now(timezone.utc).isoformat(),
        'environment': {'playwright_python': importlib.metadata.version('playwright'), 'viewport': {'width': 1280, 'height': 900}},
        'source_verification': 'NOT_RUN', 'completed_phases': [], 'page_errors': [],
        'remote_mutations': [], 'non_claims': ['One two-tab scenario only; not complete browser acceptance', 'Not full PR approval', 'No physical Android or screen-reader acceptance', 'Unsaved conflicting draft is not a backup'],
    }
    server = browser = context = None
    server_log = None
    tab_a = tab_b = None
    try:
        manifest = verify_source()
        report['source_verification'] = {'status': 'PASS', 'matching_files': len(manifest['files']), 'matching_application_files': len(manifest['application_paths'])}
        write_json(out / 'source-manifest.json', manifest)
        report['environment']['node'] = subprocess.check_output(['node', '--version'], text=True).strip()
        report['environment']['python'] = sys.version
        # Fail rather than attach to an unknown service on the test port.
        with socket.socket() as s:
            if s.connect_ex(('127.0.0.1', 5187)) == 0:
                raise RuntimeError('Port 5187 is occupied; refusing to test unknown bytes.')
        server_log = (out / 'server.log').open('w', encoding='utf-8')
        server = subprocess.Popen(['node', 'server.mjs'], cwd=SOURCE, stdout=server_log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 5
        while True:
            if server.poll() is not None:
                raise RuntimeError('Exact-source server exited. Inspect server.log.')
            with socket.socket() as s:
                if s.connect_ex(('127.0.0.1', 5187)) == 0:
                    break
            if time.monotonic() > deadline:
                raise RuntimeError('Exact-source server did not start.')
            time.sleep(.05)
        with sync_playwright() as playwright:
            try:
                options = {'headless': True}
                if args.chromium:
                    options['executable_path'] = args.chromium
                browser = playwright.chromium.launch(**options)
                report['environment']['chromium'] = browser.version
                context = browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
                context.tracing.start(screenshots=True, snapshots=True, sources=True)
                unexpected_dialogs = []
                def handle_dialog(dialog):
                    if dialog.type == 'beforeunload':
                        dialog.accept()  # Losing synthetic draft is archived before reload.
                    else:
                        unexpected_dialogs.append(dialog.type)
                        dialog.dismiss()
                # A fresh isolated context has no access to the user's real storage.
                tab_a, tab_b = context.new_page(), context.new_page()
                for name, page in [('RU', tab_a), ('EN', tab_b)]:
                    page.set_default_timeout(5000)
                    page.set_default_navigation_timeout(12000)
                    page.on('pageerror', lambda error, n=name: report['page_errors'].append({'tab': n, 'error': str(error)}))
                    page.on('dialog', handle_dialog)

                response = tab_a.goto(BASE + '/')
                assert response.status == 200
                assert tab_a.evaluate('window.isSecureContext && !!navigator.locks'), 'Real Web Locks required'
                assert read_saved(tab_a) is None, 'Context must start with no saved user data'
                report['completed_phases'].append('Actual legacy UI loaded with native Web Locks')

                # Both progress writes and note edits use real UI events, not store calls.
                note_a = open_note(tab_a, 'map-1', False, complete_lesson=True)
                note_b = open_note(tab_b, 'listening-1', True, complete_lesson=True)
                assert set(read_saved(tab_a)['completed']) == {'map-1', 'listening-1'}
                # Reloading a full-lesson URL legitimately updates the bookmark.
                # Switch to read-only practice routes before the save/reload probe;
                # subsequent note transactions must preserve the entire snapshot.
                note_a = open_note(tab_a, 'map-1', False, complete_lesson=False)
                note_b = open_note(tab_b, 'listening-1', True, complete_lesson=False)
                baseline = read_saved(tab_a)
                first_a, first_b = 'SYNTHETIC RU note A', 'SYNTHETIC EN note B'
                ensure_note_open(tab_a)
                ensure_note_open(tab_b)
                hold_real_lock(tab_a)
                try:
                    note_a.fill(first_a)
                    wait_queued(tab_a, 1)
                    note_b.fill(first_b)
                    wait_queued(tab_a, 2)
                    assert read_saved(tab_a) == baseline, 'A queued edit must not mutate storage before acquiring the lock'
                    expect(tab_a.locator('[data-note-status="map-1"]')).to_contain_text('Сохраняем')
                    expect(tab_b.locator('[data-note-status="listening-1"]')).to_contain_text(re.compile('saving', re.I))
                finally:
                    release_lock(tab_a)
                wait_notes(tab_a, {'map-1': first_a, 'listening-1': first_b})
                saved = read_saved(tab_a)
                assert saved == {**baseline, 'notes': {**baseline['notes'], 'map-1': first_a, 'listening-1': first_b}}
                for page in [tab_a, tab_b]:
                    page.reload()
                    assert read_saved(page) == saved
                write_json(out / 'independent-after-reload.json', saved)
                report['completed_phases'].append('Independent notes/progress retained after both tabs reload')

                # Reopen through UI. Practice is not a new lesson completion.
                note_a = open_note(tab_a, 'map-1', False, complete_lesson=False)
                note_b = open_note(tab_b, 'map-1', True, complete_lesson=False)
                expect(note_a).to_have_value(first_a)
                expect(note_b).to_have_value(first_a)
                baseline = read_saved(tab_a)
                winner, losing_draft = 'SYNTHETIC accepted revision A', 'SYNTHETIC conflicting draft B - not saved'
                ensure_note_open(tab_a)
                ensure_note_open(tab_b)
                hold_real_lock(tab_a)
                try:
                    note_a.fill(winner)
                    wait_queued(tab_a, 1)
                    note_b.fill(losing_draft)
                    wait_queued(tab_a, 2)
                    assert read_saved(tab_a) == baseline
                finally:
                    release_lock(tab_a)
                wait_notes(tab_a, {'map-1': winner, 'listening-1': first_b})
                expect(tab_b.locator('[data-note-status="map-1"]')).to_contain_text(re.compile('another tab', re.I))
                expect(note_b).to_have_value(losing_draft)
                saved = read_saved(tab_a)
                assert saved == {**baseline, 'notes': {**baseline['notes'], 'map-1': winner}}
                # Preserve the losing synthetic draft BEFORE intentionally reloading.
                write_json(out / 'conflict-before-reload.json', {'saved': saved, 'unsaved_draft': note_b.input_value(), 'unsaved_draft_is_not_persisted': True})
                tab_b.screenshot(path=str(out / 'conflict-en.png'), full_page=True)
                report['completed_phases'].append('Same-note conflict rejected visibly; losing draft retained in its tab')

                for page in [tab_a, tab_b]:
                    page.reload()
                    assert read_saved(page) == saved
                write_json(out / 'conflict-after-reload.json', {'ru': read_saved(tab_a), 'en': read_saved(tab_b)})
                note_a = open_note(tab_a, 'map-1', False, complete_lesson=False)
                note_b = open_note(tab_b, 'map-1', True, complete_lesson=False)
                expect(note_a).to_have_value(winner)
                expect(note_b).to_have_value(winner)
                assert read_saved(tab_a)['completed'] == baseline['completed']
                assert read_saved(tab_b)['notes']['listening-1'] == first_b
                ensure_note_open(tab_a)
                ensure_note_open(tab_b)
                tab_a.screenshot(path=str(out / 'final-ru.png'), full_page=True)
                tab_b.screenshot(path=str(out / 'final-en.png'), full_page=True)
                assert not report['page_errors'], report['page_errors']
                assert not unexpected_dialogs, unexpected_dialogs
                report['completed_phases'].append('Both reloaded UIs display accepted saved note; other note/progress preserved')
                report['status'] = 'PASS'
            except Exception as error:
                report['status'] = 'BLOCKED' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error) else 'FAIL'
                report['error'] = str(error)
                report['traceback'] = traceback.format_exc()
                report['unexecuted_after_block'] = 'No two-tab persistence verdict can be made' if report['status'] == 'BLOCKED' else None
            finally:
                if context:
                    try:
                        context.tracing.stop(path=str(out / 'trace.zip'))
                    finally:
                        context.close()
                if browser:
                    browser.close()
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
        if server_log:
            server_log.close()
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write_json(out / 'result.json', report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'PASS' else 2 if report['status'] == 'BLOCKED' else 1


if __name__ == '__main__':
    sys.exit(main())
