import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('.venv/bin/python')) {
  console.error('Run python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt first.')
  process.exit(1)
}
const api = spawn('.venv/bin/python', ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000', '--reload', '--reload-dir', 'backend'], { stdio: 'inherit' })
const web = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' })
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  api.kill('SIGTERM')
  web.kill('SIGTERM')
  process.exitCode = code
}
api.on('exit', code => stop(code ?? 1))
web.on('exit', code => stop(code ?? 1))
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
