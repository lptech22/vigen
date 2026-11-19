/** Klien CDP minimal tanpa dependensi (Node >= 20 punya WebSocket global). */
export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) {
          try { fn(msg.params); } catch { /* listener error diabaikan */ }
        }
      }
    });

    ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('koneksi CDP terputus'));
      }
      this.pending.clear();
    });
  }

  static connect(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* noop */ }
        reject(new Error(`timeout koneksi CDP ke ${url}`));
      }, timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new CDP(ws));
      }, { once: true });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`gagal koneksi CDP ke ${url}`));
      }, { once: true });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP sudah tertutup'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method} (${timeoutMs} ms)`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.ws.close(); } catch { /* noop */ }
  }
}
