"""Unbuffered startup diagnostics before importing the API's dependencies."""
import faulthandler
from pathlib import Path
import sys
from datetime import datetime


def stage(message):
    print(f'[{datetime.now().isoformat(timespec="seconds")}] {message}', flush=True)


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    stage('Python child started; importing uvicorn')
    # If an import/startup hangs, show its stack before the supervisor times out.
    faulthandler.dump_traceback_later(30, repeat=True)
    import uvicorn
    stage('uvicorn imported; importing backend.app')
    from backend.app import app
    stage('backend.app imported; starting loopback listener 127.0.0.1:8000')

    class DiagnosticServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets=sockets)
            if self.started:
                faulthandler.cancel_dump_traceback_later()
                stage('Application and listener ready')

    DiagnosticServer(uvicorn.Config(app, host='127.0.0.1', port=8000)).run()


if __name__ == '__main__':
    main()
