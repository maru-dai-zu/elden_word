// ════════════════════════════════════════════════
// SM-2 SPACED REPETITION
// ════════════════════════════════════════════════
const SM2 = {
  STEPS: [1, 10],
  GRAD_INTERVAL: 1,
  EASY_INTERVAL: 4,
  START_EF: 2.5,
  MIN_EF: 1.3,

  newCard(idx) {
    return { idx, interval: 0, ef: this.START_EF, due: 0, reps: 0, lapses: 0, state: 'new', step: 0 };
  },

  review(card, rating) {
    const now = Date.now();
    const c = { ...card };
    if (c.state === 'new' || c.state === 'learning') {
      if (rating === 0) { c.step = 0; c.due = now + this.STEPS[0] * 60000; c.state = 'learning'; }
      else if (rating === 1) { c.step = Math.max(0, c.step - 1); c.due = now + this.STEPS[c.step] * 60000; c.state = 'learning'; }
      else if (rating === 2) {
        if (c.step < this.STEPS.length - 1) { c.step++; c.due = now + this.STEPS[c.step] * 60000; c.state = 'learning'; }
        else { c.interval = this.GRAD_INTERVAL; c.due = now + c.interval * 86400000; c.state = 'review'; }
      } else { c.interval = this.EASY_INTERVAL; c.due = now + c.interval * 86400000; c.state = 'review'; }
    } else {
      if (rating === 0) { c.lapses++; c.step = 0; c.due = now + this.STEPS[0] * 60000; c.state = 'learning'; c.ef = Math.max(this.MIN_EF, c.ef - 0.2); }
      else {
        let ni;
        if (rating === 1) { ni = Math.max(1, Math.round(c.interval * 1.2)); c.ef = Math.max(this.MIN_EF, c.ef - 0.15); }
        else if (rating === 2) { ni = Math.round(c.interval * c.ef); }
        else { ni = Math.round(c.interval * c.ef * 1.3); c.ef = c.ef + 0.1; }
        c.interval = Math.max(1, ni);
        c.due = now + c.interval * 86400000;
        c.state = c.interval >= 21 ? 'mature' : 'review';
        c.reps++;
      }
    }
    return c;
  },

  intervalLabel(card, rating) {
    const c = { ...card };
    if (c.state === 'new' || c.state === 'learning') {
      if (rating === 0) return this.STEPS[0] + '分後';
      if (rating === 1) return this.STEPS[Math.max(0, c.step - 1)] + '分後';
      if (rating === 2) {
        if (c.step < this.STEPS.length - 1) return this.STEPS[c.step + 1] + '分後';
        return this.GRAD_INTERVAL + '日後';
      }
      return this.EASY_INTERVAL + '日後';
    } else {
      if (rating === 0) return this.STEPS[0] + '分後';
      const intervals = [
        Math.max(1, Math.round(c.interval * 1.2)),
        Math.max(1, Math.round(c.interval * c.ef)),
        Math.max(1, Math.round(c.interval * c.ef * 1.3))
      ];
      const d = intervals[rating - 1];
      return d >= 30 ? Math.round(d / 30) + 'ヶ月後' : d + '日後';
    }
  }
};

// ════════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════════
const Storage = {
  getHistory() {
    try { return JSON.parse(localStorage.getItem('quiz-history') || '[]'); } catch { return []; }
  },
  addHistory(entry) {
    try {
      let h = this.getHistory();
      h.unshift(entry);
      if (h.length > 2000) h = h.slice(0, 2000);
      localStorage.setItem('quiz-history', JSON.stringify(h));
    } catch {}
  },
  getStats() {
    try { return JSON.parse(localStorage.getItem('global-stats') || 'null') || { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 }; } catch { return { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 }; }
  },
  setStats(s) {
    try { localStorage.setItem('global-stats', JSON.stringify(s)); } catch {}
  },
  getSRSData() {
    try { return JSON.parse(localStorage.getItem('srs-cards') || '{}'); } catch { return {}; }
  },
  setSRSData(data) {
    try { localStorage.setItem('srs-cards', JSON.stringify(data)); } catch {}
  }
};

// ════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════
let gStats = { correct: 0, wrong: 0, streak: 0, maxStreak: 0, total: 0 };
let srsData = {};
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
  if (id === 'chart') renderChart();
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
  updateDueBadge();
}

function updateDueBadge() {
  const due = Object.values(srsData).filter(c => c.due <= Date.now()).length;
  const badge = document.getElementById('due-badge');
  if (due > 0) { badge.style.display = 'inline-block'; badge.textContent = due; }
  else badge.style.display = 'none';
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

  const pool = qState.mode === 'rd' ? vocabulary.filter(v => /[\u4e00-\u9faf]/.test(v.k)) : vocabulary;

  // 復習期限カードを優先
  const dueCards = shuffle(Object.values(srsData).filter(c => c.due <= Date.now()));
  let word;

  if (dueCards.length > 0) {
    const card = dueCards[0];
    word = vocabulary[card.idx];
    if (!word) { delete srsData[card.idx]; loadQ(); return; }
    qState.cur = word;
    qState._dueCard = card;
    document.getElementById('q-badge').innerHTML =
      '<span style="color:#e07070;font-family:Cinzel,serif;font-size:8px;letter-spacing:2px">&#9672; 復習 ' + dueCards.length + '件</span>';
  } else {
    qState._dueCard = null;
    if (qState.queue.length < 4) qState.queue = shuffle([...pool]);
    word = qState.cur = qState.queue.pop();
    const m = qState.mode;
    if (m === 'j2e') document.getElementById('q-badge').textContent = 'JP \u2192 EN \xb7 \u610f\u5473\u3092\u7b54\u3048\u3088';
    else if (m === 'e2j') document.getElementById('q-badge').textContent = 'EN \u2192 JP \xb7 \u8a00\u8449\u3092\u7b54\u3048\u3088';
    else document.getElementById('q-badge').textContent = 'READING \xb7 \u8aad\u307f\u65b9\u3092\u7b54\u3048\u3088';
  }

  qState.answered = false;

  const m = qState.mode;
  document.getElementById('q-num').textContent = '# ' + String(gStats.total + 1).padStart(4, '0');

  if (m === 'rd') {
    // 読み方モード：入力方式
    document.getElementById('q-word').textContent = word.k;
    document.getElementById('q-read').textContent = '';
    const og = document.getElementById('opts-grid');
    og.innerHTML = '';
    og.style.cssText = 'display:block;margin-top:18px';

    const wrapper = document.createElement('div');
    wrapper.className = 'rd-input-wrap';
    wrapper.innerHTML =
      '<input type="text" id="rd-input" class="rd-input" placeholder="読み方を入力…" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<button class="rd-submit" id="rd-submit">答える ▶</button>';
    og.appendChild(wrapper);

    const inp = document.getElementById('rd-input');
    const sub = document.getElementById('rd-submit');
    setTimeout(() => inp.focus(), 50);

    const doSubmit = () => {
      if (qState.answered) return;
      answerRd(inp.value.trim());
    };
    sub.onclick = doSubmit;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });

  } else {
    // 選択肢モード（j2e / e2j）
    const og2 = document.getElementById('opts-grid');
    og2.style.cssText = '';
    const wrongs = shuffle(vocabulary.filter(v => v !== word)).slice(0, 3);
    const all = shuffle([word, ...wrongs]);
    qState.opts = all;
    qState.ci = all.indexOf(word);

    if (m === 'j2e' || qState._dueCard) {
      document.getElementById('q-word').textContent = word.k;
      document.getElementById('q-read').textContent = word.r !== word.k ? word.r : '';
    } else {
      document.getElementById('q-word').textContent = word.m;
      document.getElementById('q-read').textContent = '';
    }

    const og = document.getElementById('opts-grid');
    og.innerHTML = '';
    all.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.setAttribute('data-n', ['\u2160', '\u2161', '\u2162', '\u2163'][i]);
      btn.textContent = (m === 'j2e' || qState._dueCard) ? opt.m :
        opt.k + (opt.k !== opt.r ? '\n' + opt.r : '');
      btn.onclick = () => answerQ(i);
      og.appendChild(btn);
    });
  }

  document.getElementById('result-panel').classList.remove('visible');
  document.getElementById('srs-rate-area').style.display = 'none';
  document.getElementById('quiz-card').style.display = 'block';
  document.getElementById('results-card').style.display = 'none';
  updateQProg();
}

function answerQ(idx) {
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
  const ok_msgs = ['RUNE OBTAINED', 'GRACE FOUND', '\u77e5\u8b58\u3092\u5f97\u305f', 'KNOWLEDGE GAINED', 'ERDTREE BLESSES'];
  const ng_msgs = ['YOU DIED', '\u8a9e\u5f59\u306a\u304d\u8005', 'GRACE LOST', 'FELLED', 'MAIDENLESS'];
  j.textContent = ok ? ok_msgs[Math.floor(Math.random() * ok_msgs.length)] : ng_msgs[Math.floor(Math.random() * ng_msgs.length)];
  j.className = 'judgment ' + (ok ? 'cj' : 'wj');

  document.getElementById('lore-meaning').textContent = qState.cur.k + ' \u2014 ' + qState.cur.m;
  document.getElementById('result-panel').classList.add('visible');

  showSRSRating();

  updateGlobalStats();
  const sp = document.getElementById('streak-pill');
  if (gStats.streak >= 3) { sp.style.display = 'inline-flex'; document.getElementById('streak-n').textContent = gStats.streak; }
  else sp.style.display = 'none';

  Storage.setStats(gStats);
  Storage.addHistory({ k: qState.cur.k, r: qState.cur.r, m: qState.cur.m, result: ok ? 'correct' : 'wrong', mode: qState.mode, ts: Date.now(), type: 'quiz' });
}

function answerRd(input) {
  if (qState.answered) return;
  qState.answered = true;
  gStats.total++;
  qState.rq++;

  const correct = qState.cur.r;
  const ok = input === correct;

  const inp = document.getElementById('rd-input');
  const sub = document.getElementById('rd-submit');
  if (inp) { inp.disabled = true; inp.classList.add(ok ? 'rd-correct' : 'rd-wrong'); }
  if (sub) sub.disabled = true;

  if (ok) { gStats.correct++; gStats.streak++; qState.rc++; }
  else { gStats.wrong++; gStats.streak = 0; }
  if (gStats.streak > gStats.maxStreak) gStats.maxStreak = gStats.streak;

  const j = document.getElementById('judgment');
  const ok_msgs = ['RUNE OBTAINED', 'GRACE FOUND', '\u77e5\u8b58\u3092\u5f97\u305f', 'KNOWLEDGE GAINED', 'ERDTREE BLESSES'];
  const ng_msgs = ['YOU DIED', '\u8a9e\u5f59\u306a\u304d\u8005', 'GRACE LOST', 'FELLED', 'MAIDENLESS'];
  j.textContent = ok ? ok_msgs[Math.floor(Math.random() * ok_msgs.length)] : ng_msgs[Math.floor(Math.random() * ng_msgs.length)];
  j.className = 'judgment ' + (ok ? 'cj' : 'wj');

  const loreText = ok
    ? qState.cur.k + ' \u2014 ' + qState.cur.m
    : qState.cur.k + ' \u2014 \u6b63\u89e3: ' + correct + ' \u2014 ' + qState.cur.m;
  document.getElementById('lore-meaning').textContent = loreText;
  document.getElementById('result-panel').classList.add('visible');

  showSRSRating();
  updateGlobalStats();

  const sp = document.getElementById('streak-pill');
  if (gStats.streak >= 3) { sp.style.display = 'inline-flex'; document.getElementById('streak-n').textContent = gStats.streak; }
  else sp.style.display = 'none';

  Storage.setStats(gStats);
  Storage.addHistory({ k: qState.cur.k, r: qState.cur.r, m: qState.cur.m, result: ok ? 'correct' : 'wrong', mode: qState.mode, ts: Date.now(), type: 'quiz' });
}

// ════════════════════════════════════════════════
// SRS RATING
// ════════════════════════════════════════════════
function showSRSRating() {
  document.getElementById('srs-rate-area').style.display = 'block';
  const idx = vocabulary.indexOf(qState.cur);
  const card = srsData[idx] || SM2.newCard(idx);
  [0, 1, 2, 3].forEach(r => {
    document.getElementById('sq-int-' + r).textContent = SM2.intervalLabel(card, r);
  });
}

function rateSRS(rating) {
  const idx = vocabulary.indexOf(qState.cur);
  const card = srsData[idx] || SM2.newCard(idx);
  srsData[idx] = SM2.review(card, rating);
  Storage.setSRSData(srsData);
  document.getElementById('srs-rate-area').style.display = 'none';
  updateDueBadge();
  nextQ();
}

function nextQ() {
  if (qState.rq >= qState.rt) showRoundResults();
  else loadQ();
}

function showRoundResults() {
  document.getElementById('quiz-card').style.display = 'none';
  document.getElementById('results-card').style.display = 'block';
  const pct = Math.round(qState.rc / qState.rt * 100);
  const tiers = [[100,'ELDEN LORD','\u5b8c\u74a7\u306a\u308b\u77e5\u8b58\u3002\u30a8\u30eb\u30c7\u30f3\u30ea\u30f3\u30b0\u306f\u6c5d\u3092\u8a8d\u3081\u305f\u3002'],[80,'CHAMPION','\u5049\u5927\u306a\u308b\u892a\u305b\u4eba\u3088\u3002\u8a9e\u5f59\u306e\u9ec4\u91d1\u6a39\u304c\u8f1d\u304f\u3002'],[60,'TARNISHED','\u307e\u3060\u9053\u306f\u7d9a\u304f\u3002\u518d\u3073\u8a9e\u5f59\u306e\u8a66\u7df4\u306b\u6311\u3081\u3002'],[40,'FELLED','\u8a9e\u5f59\u306a\u304d\u8005\u3088\u3002\u3082\u3063\u3068\u4fee\u884c\u304c\u5fc5\u8981\u3060\u3002'],[0,'YOU DIED','\u9ec4\u91d1\u5f8b\u306b\u80cc\u304d\u3057\u8005\u3002\u6700\u521d\u304b\u3089\u59cb\u3081\u3088\u3002']];
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
  document.getElementById('prog-label').textContent = '\u8a9e\u5f59\u306e\u8a66\u7df4 \xb7 \u6b8b\u308a ' + (qState.rt - qState.rq) + '\u554f';
}

// ════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════
function renderHistory() {
  cachedHistory = Storage.getHistory();
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

  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / HIST_PER_PAGE));
  historyPage = Math.max(0, Math.min(historyPage, pages - 1));
  const slice = data.slice(historyPage * HIST_PER_PAGE, (historyPage + 1) * HIST_PER_PAGE);

  const correct = cachedHistory.filter(h => h.result === 'correct').length;
  const wrong = cachedHistory.filter(h => h.result === 'wrong').length;
  document.getElementById('hist-summary').textContent = '\u7dcf\u8a08 ' + cachedHistory.length + '\u554f \xb7 \u6b63\u89e3 ' + correct + ' \xb7 \u4e0d\u6b63\u89e3 ' + wrong;

  const tbody = document.getElementById('hist-tbody');
  tbody.innerHTML = '';
  const empty = document.getElementById('hist-empty');

  if (slice.length === 0) {
    empty.style.display = 'block';
    document.getElementById('hist-pagination').style.display = 'none';
  } else {
    empty.style.display = 'none';
    const modeLabel = { j2e: '\u65e5\u2192\u82f1', e2j: '\u82f1\u2192\u65e5', rd: '\u8aad\u307f' };
    slice.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="hist-word">' + h.k + '</div><div class="hist-read">' + (h.r !== h.k ? h.r : '') + '</div><div class="hist-meaning">' + h.m + '</div></td>' +
        '<td><span class="' + (h.result === 'correct' ? 'tag-correct' : 'tag-wrong') + '">' + (h.result === 'correct' ? '\u2713 \u6b63\u89e3' : '\u2717 \u4e0d\u6b63\u89e3') + '</span></td>' +
        '<td><div class="hist-mode">' + (modeLabel[h.mode] || h.mode) + '</div></td>' +
        '<td><div class="hist-time">' + fmtTime(h.ts) + '</div></td>';
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

function clearHistory() {
  if (!confirm('\u5c65\u6b74\u3092\u5168\u3066\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return;
  try { localStorage.removeItem('quiz-history'); } catch {}
  cachedHistory = [];
  renderHistoryPage();
}

// ════════════════════════════════════════════════
// KEYBOARD
// ════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  const activePage = document.querySelector('.page.active').id;
  if (activePage !== 'page-quiz') return;
  const rateArea = document.getElementById('srs-rate-area');
  const numMap = { '1': 0, '2': 1, '3': 2, '4': 3 };

  if (qState.answered) {
    if (rateArea.style.display !== 'none') {
      if (numMap[e.key] !== undefined) { rateSRS(numMap[e.key]); return; }
    } else if (e.key === 'Enter') { nextQ(); return; }
  }
  if (!qState.answered && numMap[e.key] !== undefined) answerQ(numMap[e.key]);
});


// ════════════════════════════════════════════════
// CHART / CALENDAR
// ════════════════════════════════════════════════
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;

function renderChart() {
  const today = new Date();
  const key = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  calSelectedDate = key;
  calYear = today.getFullYear();
  calMonth = today.getMonth();
  renderCalendar();
  renderDayDetail(key);
}

function calPrevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function calNextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function renderCalendar() {
  try {
  const label = document.getElementById('cal-month-label');
  if (!label) { console.error('cal-month-label not found'); return; }
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent = calYear + '年 · ' + months[calMonth];

  const history = Storage.getHistory();
  const dayStats = {};
  history.forEach(h => {
    if (!h || !h.ts) return;
    const d = new Date(h.ts);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (!dayStats[key]) dayStats[key] = { total: 0, correct: 0 };
    dayStats[key].total++;
    if (h.result === 'correct') dayStats[key].correct++;
  });

  const allTotals = Object.values(dayStats).map(d => d.total);
  const maxDay = allTotals.length > 0 ? Math.max(...allTotals) : 1;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const now = new Date();
  const todayKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  const grid = document.getElementById('cal-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.style.cssText = 'aspect-ratio:1;min-height:36px';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const stats = dayStats[key];
    const isToday = key === todayKey;
    const isSelected = key === calSelectedDate;
    const hasData = stats && stats.total > 0;
    const intensity = hasData ? Math.max(0.12, stats.total / maxDay) : 0;

    const cell = document.createElement('div');
    cell.style.cssText = [
      'aspect-ratio:1', 'min-height:36px',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:2px', 'cursor:pointer', 'overflow:hidden', 'position:relative',
      'border:1px solid ' + (isSelected ? 'var(--gold)' : isToday ? 'rgba(201,168,76,.45)' : 'rgba(201,168,76,.1)'),
      'background:' + (isSelected ? 'rgba(201,168,76,.18)' : hasData ? 'rgba(201,168,76,' + (intensity * 0.16) + ')' : 'rgba(13,11,9,.4)'),
      'transition:all .15s'
    ].join(';');

    const numEl = document.createElement('div');
    numEl.style.cssText = 'font-family:\'Cinzel\',serif;font-size:10px;line-height:1;color:' +
      (isSelected ? 'var(--gold)' : isToday ? 'var(--gold-light)' : hasData ? 'var(--parchment)' : 'var(--fog)');
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (hasData) {
      const dot = document.createElement('div');
      dot.style.cssText = 'font-size:7px;font-family:\'Cinzel\',serif;color:' + (isSelected ? 'var(--gold)' : 'rgba(201,168,76,.55)');
      dot.textContent = stats.total + '問';
      cell.appendChild(dot);

      const bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(0,0,0,.3)';
      const pct = Math.round(stats.correct / stats.total * 100);
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:' + pct + '%;background:' + (pct >= 80 ? 'var(--gold)' : pct >= 50 ? 'var(--ember)' : 'var(--blood)');
      bar.appendChild(fill);
      cell.appendChild(bar);
    }

    cell.addEventListener('click', () => {
      calSelectedDate = key;
      renderCalendar();
      renderDayDetail(key);
    });
    cell.addEventListener('mouseenter', () => {
      if (key !== calSelectedDate) cell.style.borderColor = 'rgba(201,168,76,.5)';
    });
    cell.addEventListener('mouseleave', () => {
      if (key !== calSelectedDate) cell.style.borderColor = isToday ? 'rgba(201,168,76,.45)' : 'rgba(201,168,76,.1)';
    });

    grid.appendChild(cell);
  }
  } catch(e) { console.error('renderCalendar error:', e); }
}

function renderDayDetail(key) {
  const history = Storage.getHistory();
  const [y, mo, d] = key.split('-').map(Number);
  const dayStart = new Date(y, mo - 1, d).getTime();
  const dayEnd = dayStart + 86400000;

  const dayHistory = history.filter(h => h.ts >= dayStart && h.ts < dayEnd);
  const correct = dayHistory.filter(h => h.result === 'correct').length;
  const wrong = dayHistory.filter(h => h.result === 'wrong').length;
  const total = dayHistory.length;

  document.getElementById('day-placeholder').style.display = 'none';
  document.getElementById('day-detail').style.display = 'block';

  const dateLabel = new Date(y, mo - 1, d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  document.getElementById('detail-date-label').textContent = dateLabel;
  document.getElementById('chart-summary').textContent = total > 0
    ? total + '問 学習済み · 正解 ' + correct + ' · 不正解 ' + wrong
    : 'この日の学習記録はありません';

  document.getElementById('today-correct').textContent = correct;
  document.getElementById('today-wrong').textContent = wrong;
  document.getElementById('today-total').textContent = total;

  const circ = 289.03;
  const dc = document.getElementById('donut-correct');
  const dw = document.getElementById('donut-wrong');
  if (total > 0) {
    const pct = Math.round(correct / total * 100);
    document.getElementById('donut-pct').textContent = pct + '%';
    const ca = (correct / total) * circ;
    const wa = (wrong / total) * circ;
    dc.style.strokeDashoffset = circ - ca;
    dc.style.strokeDasharray = ca + ' ' + (circ - ca);
    dw.style.strokeDashoffset = -ca;
    dw.style.strokeDasharray = wa + ' ' + (circ - wa);
  } else {
    document.getElementById('donut-pct').textContent = '—';
    dc.style.strokeDashoffset = circ; dc.style.strokeDasharray = '289.03';
    dw.style.strokeDashoffset = circ; dw.style.strokeDasharray = '289.03';
  }

  const hourly = Array(24).fill(0);
  dayHistory.forEach(h => { hourly[new Date(h.ts).getHours()]++; });

  const container = document.getElementById('hourly-chart');
  const emptyEl = document.getElementById('chart-empty');
  container.innerHTML = '';

  if (total === 0) {
    container.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  container.style.display = 'flex';
  emptyEl.style.display = 'none';

  const maxVal = Math.max(...hourly, 1);
  const chartH = 156;

  const yAxis = document.createElement('div');
  yAxis.style.cssText = 'position:absolute;left:0;top:0;bottom:24px;width:32px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;padding-right:6px';
  [maxVal, Math.round(maxVal / 2), 0].forEach(v => {
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-family:\'Cinzel\',serif;font-size:7px;color:rgba(74,69,64,.7);line-height:1';
    lbl.textContent = v;
    yAxis.appendChild(lbl);
  });
  container.appendChild(yAxis);

  const barsWrap = document.createElement('div');
  barsWrap.style.cssText = 'flex:1;display:flex;align-items:flex-end;gap:2px;height:' + (chartH + 24) + 'px;padding-bottom:24px;position:relative';
  [1, 0.5].forEach(frac => {
    const gl = document.createElement('div');
    gl.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:rgba(201,168,76,.07);bottom:' + (frac * chartH + 24) + 'px;pointer-events:none';
    barsWrap.appendChild(gl);
  });

  hourly.forEach((count, hour) => {
    const col = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative';
    const barH = count > 0 ? Math.max(4, Math.round((count / maxVal) * chartH)) : 2;
    const bar = document.createElement('div');
    bar.style.cssText = [
      'width:100%', 'height:0',
      'transition:height .55s ease ' + (hour * 16) + 'ms',
      'background:' + (count > 0 ? 'linear-gradient(to top,var(--gold-dark),var(--gold))' : 'rgba(201,168,76,.06)'),
      'border-top:1px solid ' + (count > 0 ? 'var(--gold)' : 'rgba(201,168,76,.1)'),
      'position:relative'
    ].join(';');
    if (count > 0) {
      const tip = document.createElement('div');
      tip.style.cssText = 'position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(13,11,9,.95);border:1px solid rgba(201,168,76,.3);padding:2px 6px;font-family:\'Cinzel\',serif;font-size:8px;color:var(--gold);white-space:nowrap;opacity:0;transition:opacity .15s;pointer-events:none;z-index:20';
      tip.textContent = count;
      bar.appendChild(tip);
      bar.addEventListener('mouseenter', () => tip.style.opacity = '1');
      bar.addEventListener('mouseleave', () => tip.style.opacity = '0');
    }
    const lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;bottom:-20px;font-family:\'Cinzel\',serif;font-size:7px;color:' + (count > 0 ? 'rgba(201,168,76,.7)' : 'rgba(74,69,64,.4)') + ';white-space:nowrap';
    lbl.textContent = (hour % 3 === 0) ? hour + 'h' : '';
    col.appendChild(bar);
    col.appendChild(lbl);
    barsWrap.appendChild(col);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = barH + 'px'; }));
  });

  container.appendChild(barsWrap);
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
function init() {
  createEmbers();
  gStats = Storage.getStats();
  srsData = Storage.getSRSData();
  updateGlobalStats();
  qState.queue = shuffle([...vocabulary]);
  loadQ();
  setTimeout(() => document.getElementById('loading').classList.add('hidden'), 1400);
}

init();
