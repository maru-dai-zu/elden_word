// ════════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════════
const Storage = {
  async getHistory() {
    try { const r = await window.storage.get('quiz-history'); return r ? JSON.parse(r.value) : []; } catch { return []; }
  },
  async addHistory(entry) {
    try {
      let h = await Storage.getHistory();
      h.unshift(entry);
      if (h.length > 2000) h = h.slice(0, 2000);
      await window.storage.set('quiz-history', JSON.stringify(h));
    } catch {}
  },
  async getStats() {
    try { const r = await window.storage.get('global-stats'); return r ? JSON.parse(r.value) : { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 }; } catch { return { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 }; }
  },
  async setStats(s) {
    try { await window.storage.set('global-stats', JSON.stringify(s)); } catch {}
  }
};

// ════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════
let gStats = { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 };
let historyFilter = 'all';
let historyPage = 0;
let cachedHistory = [];
const HIST_PER_PAGE = 30;

let qState = { mode: 'j2e', queue: [], cur: null, opts: [], ci: 0, answered: false, rq: 0, rc: 0, rt: 10 };

// ════════════════════════════════════════════════
// EMBERS
// ════════════════════════════════════════════════
function createEmbers() {
  const c = document.getElementById('embers');
  for (let i = 0; i < 12; i++) {
    const e = document.createElement('div');
    e.className = 'ember';
    e.style.left = Math.random() * 100 + 'vw';
    e.style.animationDuration = (9 + Math.random() * 11) + 's';
    e.style.animationDelay = (Math.random() * 10) + 's';
    const sz = (1 + Math.random() * 2) + 'px';
    e.style.width = e.style.height = sz;
    e.style.background = Math.random() > 0.7 ? '#c45c1a' : '#c9a84c';
    c.appendChild(e);
  }
}

// ════════════════════════════════════════════════
// PAGE NAV
// ════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('tab-' + id).classList.add('active');
  if (id === 'history') renderHistory();
}

// ════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function fmtTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'たった今';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '時間前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '日前';
  return new Date(ts).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function updateGlobalStats() {
  document.getElementById('s-correct').textContent = gStats.correct;
  const tot = gStats.correct + gStats.wrong;
  const acc = tot > 0 ? Math.round(gStats.correct / tot * 100) : 0;
  document.getElementById('s-acc').textContent = tot > 0 ? acc + '%' : '-';
  document.getElementById('s-accbar').style.width = acc + '%';
  document.getElementById('s-streak').textContent = gStats.streak;
  document.getElementById('s-total').textContent = gStats.total;
}

// ════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════
function setMode(m) {
  qState.mode = m;
  ['j2e', 'e2j', 'rd'].forEach(x => document.getElementById('m-' + x).classList.remove('active'));
  document.getElementById('m-' + m).classList.add('active');
  const pool = m === 'rd' ? vocabulary.filter(v => /[\u4e00-\u9faf]/.test(v.k)) : vocabulary;
  qState.queue = shuffle([...pool]);
  qState.rq = 0; qState.rc = 0;
  loadQ();
}

function loadQ() {
  if (qState.rq >= qState.rt) { showRoundResults(); return; }
  if (qState.queue.length < 4) {
    const pool = qState.mode === 'rd' ? vocabulary.filter(v => /[\u4e00-\u9faf]/.test(v.k)) : vocabulary;
    qState.queue = shuffle([...pool]);
  }
  qState.cur = qState.queue.pop();
  qState.answered = false;

  const wrongs = shuffle(vocabulary.filter(v => v !== qState.cur)).slice(0, 3);
  const all = shuffle([qState.cur, ...wrongs]);
  qState.opts = all;
  qState.ci = all.indexOf(qState.cur);

  const m = qState.mode;
  document.getElementById('q-num').textContent = '# ' + String(gStats.total + 1).padStart(4, '0');
  if (m === 'j2e') {
    document.getElementById('q-word').textContent = qState.cur.k;
    document.getElementById('q-read').textContent = qState.cur.r !== qState.cur.k ? qState.cur.r : '';
    document.getElementById('q-badge').textContent = 'JP → EN · 意味を答えよ';
  } else if (m === 'e2j') {
    document.getElementById('q-word').textContent = qState.cur.m;
    document.getElementById('q-read').textContent = '';
    document.getElementById('q-badge').textContent = 'EN → JP · 言葉を答えよ';
  } else {
    document.getElementById('q-word').textContent = qState.cur.k;
    document.getElementById('q-read').textContent = '';
    document.getElementById('q-badge').textContent = 'READING · 読み方を答えよ';
  }

  const og = document.getElementById('opts-grid');
  og.innerHTML = '';
  all.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt';
    btn.setAttribute('data-n', ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][i]);
    btn.textContent = m === 'j2e' ? opt.m : m === 'e2j' ? opt.k + (opt.k !== opt.r ? '\n' + opt.r : '') : opt.r;
    btn.onclick = () => answerQ(i);
    og.appendChild(btn);
  });

  document.getElementById('result-panel').classList.remove('visible');
  document.getElementById('quiz-card').style.display = 'block';
  document.getElementById('results-card').style.display = 'none';
  updateQProg();
}

async function answerQ(idx) {
  if (qState.answered) return;
  qState.answered = true;
  gStats.total++;
  qState.rq++;

  const btns = document.querySelectorAll('.opt');
  const ok = idx === qState.ci;
  btns[idx].classList.add(ok ? 'correct' : 'wrong');
  btns[qState.ci].classList.add('correct');
  btns.forEach(b => b.disabled = true);

  if (ok) { gStats.correct++; gStats.streak++; qState.rc++; }
  else { gStats.wrong++; gStats.streak = 0; }
  if (gStats.streak > gStats.maxStreak) gStats.maxStreak = gStats.streak;

  const j = document.getElementById('judgment');
  const ok_msgs = ['RUNE OBTAINED', 'GRACE FOUND', '知識を得た', 'KNOWLEDGE GAINED', 'ERDTREE BLESSES'];
  const ng_msgs = ['YOU DIED', '語彙なき者', 'GRACE LOST', 'FELLED', 'MAIDENLESS'];
  j.textContent = ok ? ok_msgs[Math.floor(Math.random() * ok_msgs.length)] : ng_msgs[Math.floor(Math.random() * ng_msgs.length)];
  j.className = 'judgment ' + (ok ? 'cj' : 'wj');

  document.getElementById('lore-meaning').textContent = qState.cur.k + ' — ' + qState.cur.m;
  document.getElementById('result-panel').classList.add('visible');

  updateGlobalStats();
  const sp = document.getElementById('streak-pill');
  if (gStats.streak >= 3) { sp.style.display = 'inline-flex'; document.getElementById('streak-n').textContent = gStats.streak; }
  else sp.style.display = 'none';

  await Storage.setStats(gStats);
  await Storage.addHistory({ k: qState.cur.k, r: qState.cur.r, m: qState.cur.m, result: ok ? 'correct' : 'wrong', mode: qState.mode, ts: Date.now(), type: 'quiz' });
}

function nextQ() {
  if (qState.rq >= qState.rt) showRoundResults();
  else loadQ();
}

async function showRoundResults() {
  document.getElementById('quiz-card').style.display = 'none';
  document.getElementById('results-card').style.display = 'block';
  const pct = Math.round(qState.rc / qState.rt * 100);
  const tiers = [[100,'ELDEN LORD','完璧なる知識。エルデンリングは汝を認めた。'],[80,'CHAMPION','偉大なる褪せ人よ。語彙の黄金樹が輝く。'],[60,'TARNISHED','まだ道は続く。再び語彙の試練に挑め。'],[40,'FELLED','語彙なき者よ。もっと修行が必要だ。'],[0,'YOU DIED','黄金律に背きし者。最初から始めよ。']];
  const [, title, msg] = tiers.find(([t]) => pct >= t);
  document.getElementById('r-title').textContent = title;
  document.getElementById('r-score').textContent = qState.rc + '/' + qState.rt;
  document.getElementById('r-msg').textContent = msg;
}

function newRound() {
  qState.rq = 0; qState.rc = 0;
  qState.queue = shuffle([...vocabulary]);
  loadQ();
}

function updateQProg() {
  const p = qState.rq / qState.rt;
  const c = 138.2;
  document.getElementById('prog-ring').style.strokeDashoffset = c - p * c;
  document.getElementById('prog-count').textContent = qState.rq + '/' + qState.rt;
  document.getElementById('prog-label').textContent = '語彙の試練 · 残り ' + (qState.rt - qState.rq) + '問';
}

// ════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════
async function renderHistory() {
  cachedHistory = await Storage.getHistory();
  renderHistoryPage();
}

function setHistFilter(f) {
  historyFilter = f;
  historyPage = 0;
  ['all', 'correct', 'wrong'].forEach(x => document.getElementById('hf-' + x).classList.remove('active'));
  document.getElementById('hf-' + f).classList.add('active');
  renderHistoryPage();
}

function histPage(dir) { historyPage += dir; renderHistoryPage(); }

function renderHistoryPage() {
  let data = cachedHistory;
  if (historyFilter === 'correct') data = data.filter(h => h.result === 'correct');
  else if (historyFilter === 'wrong') data = data.filter(h => h.result === 'wrong');
  else if (historyFilter === 'srs') data = data.filter(h => h.type === 'srs');

  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / HIST_PER_PAGE));
  historyPage = Math.max(0, Math.min(historyPage, pages - 1));
  const slice = data.slice(historyPage * HIST_PER_PAGE, (historyPage + 1) * HIST_PER_PAGE);

  const correct = cachedHistory.filter(h => h.result === 'correct').length;
  const wrong = cachedHistory.filter(h => h.result === 'wrong').length;
  document.getElementById('hist-summary').textContent = `総計 ${cachedHistory.length}問 · 正解 ${correct} · 不正解 ${wrong}`;

  const tbody = document.getElementById('hist-tbody');
  tbody.innerHTML = '';
  const empty = document.getElementById('hist-empty');

  if (slice.length === 0) {
    empty.style.display = 'block';
    document.getElementById('hist-pagination').style.display = 'none';
  } else {
    empty.style.display = 'none';
    const modeLabel = { j2e: '日→英', e2j: '英→日', rd: '読み', srs: '◈ SRS' };
    const ratingLabel = ['また忘れた', '難しかった', '覚えていた', '簡単だった'];
    slice.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="hist-word">${h.k}</div><div class="hist-read">${h.r !== h.k ? h.r : ''}</div><div class="hist-meaning">${h.m}</div></td>
        <td><span class="${h.result === 'correct' ? 'tag-correct' : 'tag-wrong'}">${h.result === 'correct' ? '✓ 正解' : '✗ 不正解'}</span>${h.rating !== undefined ? `<div style="font-size:9px;color:var(--fog);margin-top:3px;font-family:'Cinzel',serif;letter-spacing:1px">${ratingLabel[h.rating]}</div>` : ''}</td>
        <td><div class="hist-mode">${modeLabel[h.mode] || h.mode}</div></td>
        <td><div class="hist-time">${fmtTime(h.ts)}</div></td>`;
      tbody.appendChild(tr);
    });
    const pag = document.getElementById('hist-pagination');
    if (pages > 1) {
      pag.style.display = 'flex';
      document.getElementById('hist-prev').disabled = historyPage === 0;
      document.getElementById('hist-next').disabled = historyPage >= pages - 1;
      document.getElementById('hist-page-info').textContent = (historyPage + 1) + ' / ' + pages;
    } else { pag.style.display = 'none'; }
  }
}

async function clearHistory() {
  if (!confirm('履歴を全て削除しますか？')) return;
  try { await window.storage.delete('quiz-history'); } catch {}
  cachedHistory = [];
  renderHistoryPage();
}

// ════════════════════════════════════════════════
// KEYBOARD
// ════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  const activePage = document.querySelector('.page.active').id;
  if (activePage === 'page-quiz') {
    if (qState.answered && e.key === 'Enter') { nextQ(); return; }
    if (!qState.answered) { const m = { '1': 0, '2': 1, '3': 2, '4': 3 }; if (m[e.key] !== undefined) answerQ(m[e.key]); }
  }
});

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
async function init() {
  createEmbers();
  gStats = await Storage.getStats();
  updateGlobalStats();
  qState.queue = shuffle([...vocabulary]);
  loadQ();
  setTimeout(() => document.getElementById('loading').classList.add('hidden'), 1400);
}

init();
