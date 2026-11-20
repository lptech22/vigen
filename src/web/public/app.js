(function () {
  'use strict';

  var ACTIONS = [
    { id: 'make', label: 'Make', hint: 'audio → render → QC → caption', primary: true },
    { id: 'preview', label: 'Preview', hint: 'draf cepat 540x960' },
    { id: 'still', label: 'Frame', hint: 'satu frame PNG' },
    { id: 'check', label: 'Check', hint: 'audit safe area' },
    { id: 'audio', label: 'Audio', hint: 'voice + musik + SFX' },
    { id: 'voice', label: 'Voice', hint: 'narasi → voice.txt' },
    { id: 'qc', label: 'QC', hint: 'periksa file final' },
    { id: 'publish', label: 'Publish', hint: 'caption + metadata' },
  ];

  var STATUS_TEXT = {
    queued: 'menunggu antrean',
    running: 'berjalan',
    done: 'selesai',
    failed: 'gagal',
    cancelled: 'dibatalkan',
  };

  var state = {
    session: null,
    projects: [],
    query: '',
    status: 'all',
    error: '',
    updated: null,
    loading: false,
    sheet: null,
    es: null,
    job: null,
    logLines: 0,
    tab: 'aksi',
    detail: null,
    filePath: 'scene.js',
    fileOriginal: '',
    fileDirty: false,
    createMode: 'template',
    creating: false,
    uploading: false,
  };

  var els = {
    engine: document.getElementById('engine'),
    workspacePath: document.getElementById('workspace-path'),
    workspaceNote: document.getElementById('workspace-note'),
    search: document.getElementById('search'),
    filters: document.getElementById('filters'),
    summary: document.getElementById('summary'),
    projects: document.getElementById('projects'),
    error: document.getElementById('error'),
    refresh: document.getElementById('refresh'),
    updated: document.getElementById('updated'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheet-title'),
    sheetSub: document.getElementById('sheet-sub'),
    sheetClose: document.getElementById('sheet-close'),
    actions: document.getElementById('actions'),
    options: document.getElementById('options'),
    job: document.getElementById('job'),
    jobStatus: document.getElementById('job-status'),
    jobCancel: document.getElementById('job-cancel'),
    jobBar: document.getElementById('job-bar'),
    jobLog: document.getElementById('job-log'),
    tabs: document.getElementById('tabs'),
    panes: {
      aksi: document.getElementById('pane-aksi'),
      file: document.getElementById('pane-file'),
      hasil: document.getElementById('pane-hasil'),
    },
    fileSelect: document.getElementById('file-select'),
    fileSave: document.getElementById('file-save'),
    fileNote: document.getElementById('file-note'),
    fileText: document.getElementById('file-text'),
    videoWrap: document.getElementById('video-wrap'),
    outList: document.getElementById('out-list'),
    captionBox: document.getElementById('caption-box'),
    captionText: document.getElementById('caption-text'),
    captionCopy: document.getElementById('caption-copy'),
    qcBox: document.getElementById('qc-box'),
    fileCopy: document.getElementById('file-copy'),
    newProject: document.getElementById('new-project'),
    create: document.getElementById('create'),
    createSub: document.getElementById('create-sub'),
    createForm: document.getElementById('create-form'),
    createModes: document.getElementById('create-modes'),
    createName: document.getElementById('create-name'),
    createNiche: document.getElementById('create-niche'),
    createPromptFields: document.getElementById('create-prompt-fields'),
    createDuration: document.getElementById('create-duration'),
    createVoices: document.getElementById('create-voices'),
    createScenes: document.getElementById('create-scenes'),
    createNote: document.getElementById('create-note'),
    createSubmit: document.getElementById('create-submit'),
    createClose: document.getElementById('create-close'),
    createCancel: document.getElementById('create-cancel'),
    voiceUpload: document.getElementById('voice-upload'),
    voiceFile: document.getElementById('voice-file'),
    voiceNote: document.getElementById('voice-note'),
    voiceList: document.getElementById('voice-list'),
    at: null,
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function request(url, options) {
    return fetch(url, Object.assign({
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }, options || {})).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          throw new Error('Sesi tidak valid. Buka URL bertoken dari terminal (vigen ui).');
        }
        if (!res.ok) throw new Error(data.error || ('Permintaan gagal (' + res.status + ')'));
        return data;
      });
    });
  }

  function load() {
    if (state.loading) return;
    state.loading = true;
    els.refresh.disabled = true;

    Promise.all([request('/api/session'), request('/api/projects')])
      .then(function (out) {
        state.session = out[0];
        state.projects = out[1].projects || [];
        state.error = '';
        state.updated = new Date();
        if (state.sheet) {
          var fresh = state.projects.filter(function (p) { return p.slug === state.sheet.slug; })[0];
          if (fresh) {
            state.sheet = fresh;
            els.sheetSub.textContent = fresh.slug + ' · ' + fresh.status;
          }
        }
      })
      .catch(function (err) {
        state.error = err.message || String(err);
      })
      .then(function () {
        state.loading = false;
        els.refresh.disabled = false;
        render();
      });
  }

  function clock(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function visibleProjects() {
    var q = state.query.trim().toLowerCase();
    return state.projects.filter(function (p) {
      if (state.status !== 'all' && p.status !== state.status) return false;
      if (!q) return true;
      return (p.name + ' ' + p.slug + ' ' + (p.niche || '')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function statusCounts() {
    var counts = { selesai: 0, 'siap render': 0, naskah: 0, baru: 0 };
    state.projects.forEach(function (p) {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });
    return counts;
  }

  function renderSummary() {
    els.summary.textContent = '';
    var counts = statusCounts();
    var items = [
      ['total', state.projects.length],
      ['selesai', counts.selesai],
      ['siap render', counts['siap render']],
      ['naskah', counts.naskah],
      ['baru', counts.baru],
    ];
    items.forEach(function (item) {
      var span = el('span', null, item[0] + ': ');
      span.appendChild(el('strong', null, item[1]));
      els.summary.appendChild(span);
    });
  }

  function metaItem(label, value) {
    var span = el('span', null, label + ' ');
    span.appendChild(el('b', null, value === undefined || value === null ? '–' : String(value)));
    return span;
  }

  function projectCard(p) {
    var card = el('button', 'card');
    card.type = 'button';
    card.dataset.status = p.status;
    card.dataset.slug = p.slug;

    var head = el('div', 'card-head');
    head.appendChild(el('h2', null, p.name));
    head.appendChild(el('span', 'status', p.status));
    card.appendChild(head);

    card.appendChild(el('p', 'slug', p.slug));

    var meta = el('div', 'meta');
    meta.appendChild(metaItem('scene', p.scenes));
    meta.appendChild(metaItem('voice', p.voices));
    meta.appendChild(metaItem('out', p.videos));
    var time = el('time', null, p.mtimeText || '-');
    time.dateTime = p.mtime ? new Date(p.mtime).toISOString() : '';
    meta.appendChild(time);
    card.appendChild(meta);

    card.addEventListener('click', function () { openSheet(p); });
    return card;
  }

  function renderEmpty() {
    var wrap = el('div', 'empty');
    if (state.projects.length === 0) {
      wrap.appendChild(el('p', null, 'Belum ada project di workspace ini.'));
      wrap.appendChild(el('code', null, 'vigen new "Konten 1"'));
      return wrap;
    }
    wrap.appendChild(el('p', null, 'Tidak ada project yang cocok dengan filter.'));
    return wrap;
  }

  function render() {
    var s = state.session;
    if (s) {
      els.engine.textContent = 'v' + s.engine;
      els.workspacePath.textContent = s.workspace;
      els.workspaceNote.textContent = s.workspaceReady
        ? ''
        : 'Folder ini belum ditandai sebagai workspace. Jalankan: vigen setup';
    }

    if (state.error) {
      els.error.hidden = false;
      els.error.textContent = state.error;
      els.projects.textContent = '';
      els.summary.textContent = '';
      return;
    }
    els.error.hidden = true;

    renderSummary();

    var list = visibleProjects();
    els.projects.textContent = '';
    if (!list.length) {
      els.projects.appendChild(renderEmpty());
    } else {
      list.forEach(function (p) {
        els.projects.appendChild(projectCard(p));
      });
    }

    els.updated.textContent = state.updated ? 'diperbarui ' + clock(state.updated) : '';
  }

  /* ---------- panel aksi ---------- */

  function renderOptions() {
    els.options.textContent = '';

    var forceWrap = el('label', 'opt');
    var force = el('input');
    force.type = 'checkbox';
    force.id = 'opt-force';
    forceWrap.appendChild(force);
    forceWrap.appendChild(el('span', null, 'paksa render ulang (make --force)'));
    els.options.appendChild(forceWrap);

    var atWrap = el('label', 'opt');
    var at = el('input');
    at.type = 'number';
    at.id = 'opt-at';
    at.min = '0';
    at.step = '0.1';
    at.value = '2.5';
    atWrap.appendChild(el('span', null, 'Frame pada detik'));
    atWrap.appendChild(at);
    els.options.appendChild(atWrap);

    var qcWrap = el('label', 'opt');
    var qcPreview = el('input');
    qcPreview.type = 'checkbox';
    qcPreview.id = 'opt-qc-preview';
    qcWrap.appendChild(qcPreview);
    qcWrap.appendChild(el('span', null, 'QC file preview 540x960'));
    els.options.appendChild(qcWrap);

    els.at = at;
  }

  function renderActions() {
    els.actions.textContent = '';
    ACTIONS.forEach(function (action) {
      var btn = el('button', 'action' + (action.primary ? ' primary' : ''));
      btn.type = 'button';
      btn.appendChild(el('strong', null, action.label));
      btn.appendChild(el('span', null, action.hint));
      btn.addEventListener('click', function () { runAction(action.id, btn); });
      els.actions.appendChild(btn);
    });
  }

  function flagsFor(action) {
    var flags = {};
    if (action === 'make') flags.force = Boolean(document.getElementById('opt-force')?.checked);
    if (action === 'still') flags.at = els.at ? els.at.value : undefined;
    if (action === 'qc') flags.preview = Boolean(document.getElementById('opt-qc-preview')?.checked);
    return flags;
  }

  function setBusy(busy) {
    var buttons = els.actions.querySelectorAll('button, input, select');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = busy;
  }

  function runAction(action, btn) {
    if (!state.sheet) return;
    if (action === 'voice') {
      var hasVoice = (state.detail?.files || []).some(function (f) {
        return f.path === 'voice.txt' && f.exists;
      });
      if (hasVoice && !confirm('voice.txt sudah ada dan akan ditimpa. Lanjut?')) return;
    }
    setBusy(true);
    state.logLines = 0;
    els.jobLog.textContent = '';
    els.job.hidden = false;
    els.jobStatus.textContent = 'mengirim ' + action + '…';
    els.jobBar.style.width = '0%';
    els.jobCancel.hidden = true;

    request('/api/projects/' + encodeURIComponent(state.sheet.slug) + '/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: action, flags: flagsFor(action) }),
    }).then(function (data) {
      attach(data.job);
    }).catch(function (err) {
      els.jobStatus.textContent = err.message;
      setBusy(false);
    });  }

  function renderJob(job) {
    state.job = job;
    if (!job) return;
    var status = STATUS_TEXT[job.status] || job.status;
    var text = job.label + ' · ' + status;
    if (job.status === 'queued' && job.queuePosition) text += ' (#' + job.queuePosition + ')';
    if (job.progress) text += ' · ' + job.progress.produced + '/' + job.progress.total + ' frame';
    els.jobStatus.textContent = text;
    els.jobStatus.dataset.status = job.status;
    els.jobCancel.hidden = !(job.status === 'running' || job.status === 'queued');
    els.jobBar.style.width = (job.progress ? job.progress.pct : 0) + '%';
    setBusy(job.status === 'running' || job.status === 'queued');
  }

  function appendLog(text) {
    var line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = text;
    var stick = els.jobLog.scrollTop + els.jobLog.clientHeight >= els.jobLog.scrollHeight - 24;
    els.jobLog.appendChild(line);
    state.logLines++;
    while (state.logLines > 600 && els.jobLog.firstChild) {
      els.jobLog.removeChild(els.jobLog.firstChild);
      state.logLines--;
    }
    if (stick) els.jobLog.scrollTop = els.jobLog.scrollHeight;
  }

  function attach(job) {
    closeEvents();
    if (!job) return;
    els.job.hidden = false;
    renderJob(job);
    if (job.logs && !state.logLines) {
      els.jobLog.textContent = '';
      job.logs.forEach(function (entry) { appendLog(entry.text); });
    }

    var es = new EventSource('/api/jobs/' + job.id + '/events');
    state.es = es;

    es.onmessage = function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === 'snapshot') {
        renderJob(data.job);
        if (data.job.logs && !state.logLines) {
          data.job.logs.forEach(function (entry) { appendLog(entry.text); });
        }
        if (isTerminal(data.job.status)) {
          closeEvents();
          load();
        }
        return;
      }
      if (data.type === 'log') {
        appendLog(data.line);
        return;
      }
      if (data.type === 'progress') {
        var j = state.job || job;
        j.progress = { produced: data.produced, total: data.total, pct: data.pct, fps: data.fps };
        renderJob(j);
        return;
      }
      if (data.type === 'status') {
        var cur = state.job || job;
        cur.status = data.status;
        cur.code = data.code;
        cur.error = data.error;
        renderJob(cur);
        if (isTerminal(data.status)) {
          closeEvents();
          load();
          if (state.sheet) loadDetail(state.sheet);
        }
      }
    };

    es.onerror = function () {
      // EventSource akan mencoba menyambung ulang; job tetap jalan di server.
      els.jobStatus.textContent = (STATUS_TEXT[job.status] || job.status) + ' · koneksi log terputus';
    };
  }

  function isTerminal(status) {
    return status === 'done' || status === 'failed' || status === 'cancelled';
  }

  function closeEvents() {
    if (state.es) {
      state.es.close();
      state.es = null;
    }
  }

  function pauseVideo() {
    var video = els.videoWrap.querySelector('video');
    if (!video) return;
    try { video.pause(); } catch { /* noop */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* noop */ }
  }

  /* ---------- detail: file + hasil ---------- */

  function humanBytes(n) {
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
  }

  function projectUrl(slug, path) {
    return '/api/projects/' + encodeURIComponent(slug) + path;
  }

  function switchTab(name) {
    if (state.fileDirty && state.tab === 'file' && name !== 'file') {
      if (!confirm('Perubahan belum disimpan. Buang?')) return;
      state.fileDirty = false;
      els.fileText.value = state.fileOriginal;
    }
    state.tab = name;
    if (name !== 'hasil') pauseVideo();
    var tabs = els.tabs.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].dataset.tab === name);
    }
    Object.keys(els.panes).forEach(function (key) {
      els.panes[key].classList.toggle('is-active', key === name);
    });

    if (name === 'file' && state.detail && els.fileText.hidden) {
      loadFile(state.filePath);
    }
    if (name === 'hasil' && state.detail) {
      renderHasil();
    }
  }

  function loadDetail(project, { keepFile = true } = {}) {
    return request(projectUrl(project.slug, ''))
      .then(function (data) {
        state.detail = data.project;
        renderFileOptions();
        renderVoiceList();
        if (state.tab === 'hasil') renderHasil();
        if (!keepFile) return loadFile(state.filePath);
      })
      .catch(function (err) {
        els.fileNote.textContent = err.message;
        els.fileNote.classList.add('err');
      });
  }

  function renderVoiceList() {
    var d = state.detail;
    if (!d) return;
    els.voiceList.textContent = '';
    if (!d.voice || !d.voice.length) {
      els.voiceList.appendChild(el('p', 'voice-empty',
        'Belum ada file audio. Unggah hasil TTS, lalu jalankan Audio atau Make.'));
      return;
    }
    d.voice.forEach(function (f) {
      var row = el('div', 'voice-row');
      row.appendChild(el('span', null, f.name));
      var right = el('span');
      right.appendChild(el('b', null, humanBytes(f.size)));
      right.appendChild(document.createTextNode(' · ' + f.mtimeText));
      row.appendChild(right);
      els.voiceList.appendChild(row);
    });
  }

  function renderFileOptions() {
    var d = state.detail;
    if (!d) return;
    els.fileSelect.textContent = '';
    (d.files || []).forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.path;
      opt.textContent = f.exists
        ? f.path + ' · ' + humanBytes(f.size) + ' · ' + f.mtimeText
        : f.path + ' (belum ada)';
      opt.disabled = !f.exists;
      els.fileSelect.appendChild(opt);
    });
    if ((d.files || []).some(function (f) { return f.path === state.filePath; })) {
      els.fileSelect.value = state.filePath;
    }
  }

  function loadFile(path) {
    if (!state.detail) return;
    state.filePath = path;
    els.fileNote.classList.remove('err');
    els.fileNote.textContent = 'memuat ' + path + '…';
    els.fileSave.disabled = true;

    return request(projectUrl(state.detail.slug, '/file?p=' + encodeURIComponent(path)))
      .then(function (data) {
        state.fileOriginal = data.text;
        state.fileDirty = false;
        els.fileText.hidden = false;
        els.fileText.value = data.text;
        els.fileSave.disabled = false;
        els.fileNote.textContent = humanBytes(data.size) + ' · diubah ' + data.mtimeText;
      })
      .catch(function (err) {
        els.fileText.hidden = true;
        els.fileText.value = '';
        els.fileNote.textContent = err.message;
        els.fileNote.classList.add('err');
      });
  }

  function saveFile() {
    if (!state.detail || els.fileText.hidden) return;
    els.fileSave.disabled = true;
    els.fileNote.classList.remove('err');
    els.fileNote.textContent = 'menyimpan…';

    request(projectUrl(state.detail.slug, '/file?p=' + encodeURIComponent(state.filePath)), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text: els.fileText.value }),
    }).then(function (data) {
      state.fileOriginal = els.fileText.value;
      state.fileDirty = false;
      els.fileNote.textContent = 'tersimpan ' + clock(new Date()) + ' · backup ' + data.backup;
      if (state.detail) {
        state.detail.files.forEach(function (f) {
          if (f.path === state.filePath) {
            f.size = data.size;
            f.mtime = data.mtime;
            f.mtimeText = data.mtimeText;
          }
        });
        renderFileOptions();
      }
    }).catch(function (err) {
      els.fileNote.textContent = err.message;
      els.fileNote.classList.add('err');
    }).then(function () {
      els.fileSave.disabled = false;
    });
  }

  function videoName() {
    return state.videoName || null;
  }

  function renderHasil() {
    var d = state.detail;
    if (!d) return;

    var videos = (d.out || []).filter(function (f) { return /\.(mp4|webm|mov)$/i.test(f.name); });
    els.videoWrap.textContent = '';

    if (!videos.length) {
      var hint = el('p', 'hint', 'Belum ada video di out/. Jalankan Make atau Preview dulu.');
      els.videoWrap.appendChild(hint);
      state.videoName = null;
    } else {
      var pick = videos.filter(function (v) { return v.name === videoName(); })[0] || videos[0];
      state.videoName = pick.name;
      var video = el('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = projectUrl(d.slug, '/asset?p=' + encodeURIComponent('out/' + pick.name));
      els.videoWrap.appendChild(video);
    }

    els.outList.textContent = '';
    (d.out || []).forEach(function (f) {
      var row = el('button', 'out-row' + (f.name === state.videoName ? ' is-active' : ''));
      row.type = 'button';
      row.appendChild(el('span', null, f.name));
      var right = el('span');
      right.appendChild(el('b', null, humanBytes(f.size)));
      right.appendChild(document.createTextNode(' · ' + f.mtimeText));
      row.appendChild(right);
      if (/\.(mp4|webm|mov)$/i.test(f.name)) {
        row.addEventListener('click', function () {
          state.videoName = f.name;
          renderHasil();
        });
      } else {
        row.style.cursor = 'default';
      }
      els.outList.appendChild(row);
    });

    if (d.caption) {
      els.captionBox.hidden = false;
      els.captionText.textContent = d.caption;
    } else {
      els.captionBox.hidden = true;
    }

    renderQc(d);
  }

  function renderQc(d) {
    els.qcBox.textContent = '';
    var qc = d.qc;
    if (!qc) {
      els.qcBox.appendChild(el('p', 'hint', 'Belum ada qc.json. Jalankan QC atau Make.'));
      return;
    }
    var head = el('div', 'qc-head');
    head.appendChild(el('span', qc.passed ? 'qc-pass' : 'qc-fail', qc.passed ? 'QC lulus' : 'QC gagal'));
    var when = qc.checkedAt ? new Date(qc.checkedAt) : null;
    head.appendChild(el('span', null, when && !isNaN(when) ? '· ' + clock(when) : ''));
    els.qcBox.appendChild(head);

    (qc.checks || []).forEach(function (c) {
      var row = el('div', 'qc-row' + (c.pass ? '' : ' fail'));
      row.appendChild(el('span', null, c.name));
      row.appendChild(el('b', null, c.detail));
      els.qcBox.appendChild(row);
    });
  }

  function copyText(text, done) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch { /* diam */ }
      document.body.removeChild(area);
    }
  }

  function flash(btn, label) {
    var original = btn.textContent;
    btn.textContent = label;
    setTimeout(function () { btn.textContent = original; }, 1500);
  }

  function copyCaption() {
    copyText(els.captionText.textContent || '', function () {
      flash(els.captionCopy, 'Tersalin');
    });
  }

  function copyFile() {
    if (els.fileText.hidden) return;
    copyText(els.fileText.value, function () {
      flash(els.fileCopy, 'Tersalin');
    });
  }

  /* ---------- buat project ---------- */

  function createNote(text, isError) {
    els.createNote.textContent = text || '';
    els.createNote.classList.toggle('err', Boolean(isError));
  }

  function setCreateMode(mode) {
    state.createMode = mode === 'prompt' ? 'prompt' : 'template';
    var modes = els.createModes.querySelectorAll('.mode');
    for (var i = 0; i < modes.length; i++) {
      modes[i].classList.toggle('is-active', modes[i].dataset.mode === state.createMode);
    }
    els.createPromptFields.hidden = state.createMode !== 'prompt';
    els.createSub.textContent = state.createMode === 'prompt'
      ? 'Project + prompt.txt untuk dikerjakan AI'
      : 'Project dengan 7 scene diorama siap diedit';
  }

  function openCreate() {
    if (state.creating) return;
    els.createForm.reset();
    els.createName.value = '';
    els.createNiche.value = '';
    els.createDuration.value = '45';
    els.createVoices.value = '1';
    els.createScenes.value = '8';
    createNote('');
    setCreateMode('template');
    els.create.hidden = false;
    document.body.classList.add('sheet-open');
    setTimeout(function () { els.createName.focus(); }, 50);
  }

  function closeCreate(force) {
    if (state.creating && !force) return;
    els.create.hidden = true;
    if (!state.sheet) document.body.classList.remove('sheet-open');
  }

  function submitCreate(event) {
    event.preventDefault();
    if (state.creating) return;

    var name = els.createName.value.trim();
    if (!name) {
      createNote('Nama project wajib diisi.', true);
      els.createName.focus();
      return;
    }

    var payload = { mode: state.createMode, name: name };
    var niche = els.createNiche.value.trim();
    if (niche) payload.niche = niche;
    if (state.createMode === 'prompt') {
      payload.duration = Number(els.createDuration.value);
      payload.voices = Number(els.createVoices.value);
      payload.scenes = Number(els.createScenes.value);
    }

    state.creating = true;
    els.createSubmit.disabled = true;
    createNote('membuat project…');

    request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (data) {
      state.creating = false;
      els.createSubmit.disabled = false;
      closeCreate(true);
      load();
      var startFile = payload.mode === 'prompt' ? 'prompt.txt' : 'scene.js';
      openSheet(data.project, startFile).then(function () {
        switchTab('file');
        if (state.filePath === 'prompt.txt') {
          els.fileNote.textContent += ' · copy ke AI, lalu tempel scene.js hasilnya';
        }
      });
    }).catch(function (err) {
      state.creating = false;
      els.createSubmit.disabled = false;
      createNote(err.message, true);
    });
  }

  /* ---------- unggah suara ---------- */

  var VOICE_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
  var VOICE_LIMIT = 50 * 1024 * 1024;

  function voiceNote(text, isError) {
    els.voiceNote.textContent = text || '';
    els.voiceNote.classList.toggle('err', Boolean(isError));
  }

  function uploadVoice(file) {
    if (!state.sheet || !file || state.uploading) return;
    if (!VOICE_EXT.test(file.name)) {
      voiceNote('Tipe file tidak didukung. Pilih mp3, wav, m4a, aac, ogg, atau flac.', true);
      return;
    }
    if (file.size > VOICE_LIMIT) {
      voiceNote('File terlalu besar (maks 50 MB).', true);
      return;
    }

    state.uploading = true;
    els.voiceUpload.disabled = true;
    voiceNote('mengunggah ' + file.name + ' (' + humanBytes(file.size) + ')…');

    request(projectUrl(state.sheet.slug, '/voice?name=' + encodeURIComponent(file.name)), {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', Accept: 'application/json' },
      body: file,
    }).then(function (data) {
      if (state.detail) state.detail.voice = data.voice;
      renderVoiceList();
      voiceNote('tersimpan ' + data.name + ' · ' + humanBytes(data.size) + ' · ' + data.mtimeText);
      loadDetail(state.sheet, { keepFile: true });
    }).catch(function (err) {
      voiceNote(err.message, true);
    }).then(function () {
      state.uploading = false;
      els.voiceUpload.disabled = false;
      els.voiceFile.value = '';
    });
  }

  function openSheet(project, startFile) {
    state.sheet = project;
    closeEvents();
    state.job = null;
    state.logLines = 0;
    state.detail = null;
    state.videoName = null;
    state.filePath = startFile || 'scene.js';
    state.fileOriginal = '';
    state.fileDirty = false;
    els.jobLog.textContent = '';
    els.jobBar.style.width = '0%';
    els.job.hidden = true;
    els.fileText.value = '';
    els.fileText.hidden = true;
    els.fileNote.textContent = '';
    els.fileNote.classList.remove('err');
    els.fileSave.disabled = true;
    els.outList.textContent = '';
    els.videoWrap.textContent = '';
    els.captionBox.hidden = true;
    els.qcBox.textContent = '';
    els.voiceList.textContent = '';
    els.voiceNote.textContent = '';
    els.voiceNote.classList.remove('err');
    els.sheetTitle.textContent = project.name;
    els.sheetSub.textContent = project.slug + ' · ' + project.status;
    els.sheet.hidden = false;
    document.body.classList.add('sheet-open');
    switchTab('aksi');
    renderActions();
    renderOptions();
    var ready = loadDetail(project, { keepFile: false });

    request('/api/projects/' + encodeURIComponent(project.slug) + '/job')
      .then(function (data) {
        if (!data.job) return;
        attach(data.job);
      })
      .catch(function () { /* belum ada job */ });

    return ready;
  }

  function closeSheet() {
    if (state.fileDirty && !confirm('Perubahan belum disimpan. Tutup tetap?')) return;
    closeEvents();
    pauseVideo();
    state.fileDirty = false;
    els.sheet.hidden = true;
    document.body.classList.remove('sheet-open');
    state.sheet = null;
    state.job = null;
  }

  /* ---------- event global ---------- */

  els.refresh.addEventListener('click', load);

  els.search.addEventListener('input', function () {
    state.query = els.search.value;
    render();
  });

  els.filters.addEventListener('click', function (event) {
    var chip = event.target.closest('.chip');
    if (!chip) return;
    state.status = chip.dataset.status;
    var chips = els.filters.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i] === chip);
    }
    render();
  });

  els.sheetClose.addEventListener('click', closeSheet);
  els.sheet.addEventListener('click', function (event) {
    if (event.target.dataset.close !== undefined) closeSheet();
  });

  els.newProject.addEventListener('click', openCreate);
  els.createClose.addEventListener('click', function () { closeCreate(); });
  els.createCancel.addEventListener('click', function () { closeCreate(); });
  els.create.addEventListener('click', function (event) {
    if (event.target.dataset.createClose !== undefined) closeCreate();
  });
  els.createModes.addEventListener('click', function (event) {
    var mode = event.target.closest('.mode');
    if (mode) setCreateMode(mode.dataset.mode);
  });
  els.createForm.addEventListener('submit', submitCreate);

  els.voiceUpload.addEventListener('click', function () { els.voiceFile.click(); });
  els.voiceFile.addEventListener('change', function () {
    uploadVoice(els.voiceFile.files && els.voiceFile.files[0]);
  });
  els.fileCopy.addEventListener('click', copyFile);

  els.tabs.addEventListener('click', function (event) {
    var tab = event.target.closest('.tab');
    if (tab) switchTab(tab.dataset.tab);
  });

  els.fileSelect.addEventListener('change', function () {
    var next = els.fileSelect.value;
    if (next === state.filePath) return;
    if (state.fileDirty && !confirm('Perubahan belum disimpan. Buang?')) {
      els.fileSelect.value = state.filePath;
      return;
    }
    state.fileDirty = false;
    els.fileText.hidden = true;
    loadFile(next);
  });

  els.fileText.addEventListener('input', function () {
    state.fileDirty = els.fileText.value !== state.fileOriginal;
  });

  els.fileSave.addEventListener('click', saveFile);
  els.captionCopy.addEventListener('click', copyCaption);

  els.fileText.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      saveFile();
    }
  });

  els.jobCancel.addEventListener('click', function () {
    if (!state.job) return;
    els.jobCancel.disabled = true;
    request('/api/jobs/' + state.job.id + '/cancel', { method: 'POST', headers: { Accept: 'application/json' } })
      .then(function (data) {
        els.jobStatus.textContent = 'membatalkan…';
        renderJob(data.job);
      })
      .catch(function (err) {
        els.jobStatus.textContent = err.message;
      })
      .then(function () { els.jobCancel.disabled = false; });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (!els.create.hidden) { closeCreate(); return; }
      if (state.sheet) closeSheet();
    }
    if (event.key === '/' && document.activeElement !== els.search && !state.sheet) {
      event.preventDefault();
      els.search.focus();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !state.sheet) load();
  });

  load();
})();
