"""Local-only foreground supervisor. Stops only its own API child; no PID-based kills."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'
STATE = RUNTIME / 'session.json'
LOCAL_HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def request(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Local-Token'] = token
    req = urllib.request.Request('http://127.0.0.1:4173' + path, data=data, headers=headers)
    with LOCAL_HTTP.open(req, timeout=3) as response:
        return json.load(response)


def config_env(path):
    config = read_json(path)
    mode = config.get('mode')
    if mode not in ('mock', 'file', 'http'):
        raise ValueError('mode must be mock/file/http')
    env = os.environ.copy()
    for key in ('PREDICTOR_MODE', 'PREDICTOR_FILE', 'PREDICTOR_URL', 'PREDICTOR_TIMEOUT_SECONDS'):
        env.pop(key, None)
    env['PREDICTOR_MODE'] = mode
    if mode == 'file':
        archive = (ROOT / config['file']).resolve()
        if not archive.is_file():
            raise ValueError('Prediction archive does not exist')
        env['PREDICTOR_FILE'] = str(archive)
    if mode == 'http':
        url = urlsplit(config['url'])
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.fragment:
            raise ValueError('Use an HTTP(S) URL without embedded credentials')
        timeout = float(config.get('timeout_seconds', 5))
        if not 0 < timeout <= 6:
            raise ValueError('timeout_seconds must be > 0 and <= 6 (UI timeout: 8 seconds)')
        env['PREDICTOR_URL'] = config['url']
        env['PREDICTOR_TIMEOUT_SECONDS'] = str(timeout)
    return mode, env


def run(config, startup_timeout=90):
    if not 5 <= startup_timeout <= 600:
        raise ValueError('startup-timeout must be between 5 and 600 seconds')
    if not (ROOT / 'dist/index.html').is_file():
        raise RuntimeError('Missing dist: run npm.cmd ci and npm.cmd run build first')
    mode, env = config_env(config)
    # Never take over a pre-existing service, even if it looks like our API.
    with socket.socket() as check:
        if os.name == 'nt':
            check.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        check.bind(('127.0.0.1', 8000))
    stop = threading.Event()
    token, session = secrets.token_urlsafe(32), secrets.token_hex(12)
    status = {'session': session, 'ready': False, 'mode': mode, 'url': 'http://127.0.0.1:4173'}

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def json_reply(self, code, value):
            body = json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == '/__local/status':
                return self.json_reply(200, status)
            return super().do_GET()

        def do_POST(self):
            if self.path != '/__local/stop' or not secrets.compare_digest(self.headers.get('X-Local-Token', ''), token):
                return self.json_reply(403, {'error': 'Not authorized'})
            self.json_reply(200, {'stopping': True})
            stop.set()

        def list_directory(self, path):
            self.send_error(404)
            return None

        def send_head(self):
            relative = unquote(urlsplit(self.path).path).lstrip('/')
            target = (ROOT / 'dist' / relative).resolve()
            if not target.is_relative_to((ROOT / 'dist').resolve()):
                self.send_error(404)
                return None
            return super().send_head()

        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

    class Server(http.server.ThreadingHTTPServer):
        allow_reuse_address = False
        daemon_threads = True

    server = Server(('127.0.0.1', 4173), functools.partial(Handler, directory=str(ROOT / 'dist')))
    RUNTIME.mkdir(exist_ok=True)
    api = None
    thread = None
    try:
        log_path = RUNTIME / 'api.log'
        previous_log = RUNTIME / 'api.previous.log'
        if log_path.exists():
            log_path.replace(previous_log)
        with log_path.open('w', encoding='utf-8') as log:
            log.write(f'Launcher started API child\nPython: {sys.executable}\nWorkspace: {ROOT}\nStartup timeout: {startup_timeout}s\n')
            log.flush()
            env['PYTHONUNBUFFERED'] = '1'
            api = subprocess.Popen([sys.executable, '-u', str(ROOT / 'scripts/api_worker.py')], cwd=ROOT, env=env, stdout=log, stderr=log)
            print(f'Starting API (up to {startup_timeout}s). Log: {log_path}', flush=True)
            state = {'session': session, 'token': token}
            STATE.write_text(json.dumps(state), encoding='utf-8')
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            started = time.monotonic()
            deadline = started + startup_timeout
            next_notice = started + 10
            last_probe = 'No health response yet'
            while time.monotonic() < deadline:
                if api.poll() is not None:
                    raise RuntimeError(f'API child exited with code {api.returncode}. Log: {log_path}')
                try:
                    with LOCAL_HTTP.open('http://127.0.0.1:8000/health', timeout=1) as response:
                        if response.status == 200 and json.load(response).get('status') == 'ok':
                            status['ready'] = True
                            break
                except (OSError, ValueError) as exc:
                    last_probe = type(exc).__name__
                if time.monotonic() >= next_notice:
                    print(f'Waiting for API: {int(time.monotonic()-started)}s; probe={last_probe}. See api.log for startup stage.', flush=True)
                    next_notice = time.monotonic() + 10
                if stop.wait(.2):
                    return
            if not status['ready']:
                raise RuntimeError(f'API startup timed out after {startup_timeout}s; child still running; health={last_probe}. Log: {log_path}. Check the last startup stage or traceback; no child-start line means Python has not reached the worker.')
            print(f"READY {status['url']} | predictor={mode} | Ctrl+C or stop.cmd to stop", flush=True)
            while not stop.wait(.25):
                if api.poll() is not None:
                    raise RuntimeError('API exited. Both services are stopping; see .runtime/api.log')
    finally:
        status['ready'] = False
        if thread:
            server.shutdown()
            thread.join(timeout=3)
        server.server_close()
        if api is not None and api.poll() is None:
            api.terminate()
            try:
                api.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait()
        if STATE.exists() and read_json(STATE).get('session') == session:
            STATE.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('run', 'status', 'stop'))
    parser.add_argument('--config', default=str(ROOT / 'launcher.example.json'))
    parser.add_argument('--startup-timeout', type=float, default=90)
    args = parser.parse_args()
    if args.command == 'run':
        run(args.config, args.startup_timeout)
        return
    if not STATE.exists():
        print('Not managed/running: no session file. No other process was touched.')
        return
    state = read_json(STATE)
    live = request('/__local/status')
    if live.get('session') != state.get('session'):
        raise RuntimeError('Session mismatch. No process was stopped.')
    if args.command == 'status':
        print(json.dumps(live))
    else:
        request('/__local/stop', data=b'{}', token=state['token'])
        for _ in range(100):
            if not STATE.exists():
                print('Stopped web and owned API.')
                return
            time.sleep(.1)
        raise RuntimeError('Stop still pending. Inspect the start console.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Stopped.')
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
