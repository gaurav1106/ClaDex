const { spawn } = require('child_process');
const EventEmitter = require('events');

class McpManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map();
  }

  list() {
    return [...this.processes.entries()].map(([id, entry]) => ({
      id,
      name: entry.server.name,
      status: entry.status,
      error: entry.error || ''
    }));
  }

  start(server) {
    if (!server?.id || !server.enabled || this.processes.has(server.id)) return;

    const child = spawn(server.command, server.args || [], {
      env: { ...process.env, ...(server.env || {}) },
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const entry = { child, server, status: 'Running', error: '' };
    this.processes.set(server.id, entry);
    this.emitStatus();

    child.stderr.on('data', (chunk) => {
      entry.error = chunk.toString();
      this.emitStatus();
    });

    child.on('exit', (code) => {
      entry.status = code === 0 ? 'Stopped' : 'Error';
      entry.error = code === 0 ? '' : `Exited with code ${code}`;
      this.emitStatus();
    });
  }

  stop(id) {
    const entry = this.processes.get(id);
    if (!entry) return;
    entry.status = 'Stopped';
    entry.child.kill();
    this.processes.delete(id);
    this.emitStatus();
  }

  stopAll() {
    for (const id of this.processes.keys()) this.stop(id);
  }

  emitStatus() {
    this.emit('status', this.list());
  }
}

module.exports = {
  McpManager
};
