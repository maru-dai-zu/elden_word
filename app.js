// ════════════════════════════════════════════════
// SM-2 SPACED REPETITION SYSTEM
// ════════════════════════════════════════════════
const SM2 = {
  NEW_PER_DAY: 20,
  LEARNING_STEPS: [1, 10],
  GRADUATING_INTERVAL: 1,
  EASY_INTERVAL: 4,
  STARTING_EF: 2.5,
  MIN_EF: 1.3,

  newCard(idx) {
    return { idx, interval: 0, ef: SM2.STARTING_EF, due: Date.now(), reps: 0, lapses: 0, state: 'new', step: 0 };
  },

  review(card, rating) {
    const now = Date.now();
    const c = { ...card };
    if (c.state === 'new' || c.state === 'learning') {
      if (rating === 0) { c.step = 0; c.due = now + SM2.LEARNING_STEPS[0] * 60000; c.state = 'learning'; }
      else if (rating === 1) { c.step = Math.max(0, c.step - 1); c.due = now + SM2.LEARNING_STEPS[c.step] * 60000; c.state = 'learning'; }
      else if (rating === 2) {
        if (c.step < SM2.LEARNING_STEPS.length - 1) { c.step++; c.due = now + SM2.LEARNING_STEPS[c.step] * 60000; c.state = 'learning'; }
        else { c.interval = SM2.GRADUATING_INTERVAL; c.due = now + c.interval * 86400000; c.state = 'review'; }
      } else { c.interval = SM2.EASY_INTERVAL; c.due = now + c.interval * 86400000; c.state = 'review'; }
    } else {
      if (rating === 0) { c.lapses++; c.step = 0; c.due = now + SM2.LEARNING_STEPS[0] * 60000; c.state = 'learning'; c.ef = Math.max(SM2.MIN_EF, c.ef - 0.2); }
      else {
        let ni;
        if (rating === 1) { ni = Math.max(1, Math.round(c.interval * 1.2)); c.ef = Math.max(SM2.MIN_EF, c.ef - 0.15); }
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

  nextIntervalLabel(card, rating) {
    const c = { ...card };
    if (c.state === 'new' || c.state === 'learning') {
      if (rating === 0) return SM2.LEARNING_STEPS[0] + '分後';
      if (rating === 1) return SM2.LEARNING_STEPS[Math.max(0, c.step - 1)] + '分後';
      if (rating === 2) {
        if (c.step < SM2.LEARNING_STEPS.length - 1) return SM2.LEARNING_STEPS[c.step + 1] + '分後';
        return SM2.GRADUATING_INTERVAL + '日後';
      }
      return SM2.EASY_INTERVAL + '日後';
    } else {
      if (rating === 0) return SM2.LEARNING_STEPS[0] + '分後';
      const intervals = [
        Math.max(1, Math.round(c.interval * 1.2)),
        Math.max(1, Math.round(c.interval * c.ef)),
        Math.max(1, Math.round(c.interval * c.ef * 1.3))
      ];
      const days = intervals[rating - 1];
      return days >= 30 ? Math.round(days / 30) + 'ヶ月後' : days + '日後';
    }
  }
};

// ════════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════════
const Storage = {
  async getSRSData() {
    try { const r = await window.storage.get('srs-cards'); return r ? JSON.parse(r.value) : {}; } catch { return {}; }
  },
  async setSRSData(data) {
    try { await window.storage.set('srs-cards', JSON.stringify(data)); } catch {}
  },
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
let srsData = {};
let historyFilter = 'all';
let historyPage = 0;
let cachedHistory = [];
const HIST_PER_PAGE = 30;

let qState = { mode: 'j2e', queue: [], cur: null, opts: [], ci: 0, answered: false, rq: 0, rc: 0, rt: 10 };
let srsSession = { queue: [], cur: null, revealed: false };

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
  if (id === 'srs') updateSRSDash();
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
  const learned = Object.values(srsData).filter(c => c.state === 'review' || c.state === 'mature').length;
  document.getElementById('s-learned').textContent = learned;
}

// ════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════
function setMode(m) {
  qState.mode = m;
  ['j2e', 'e2j', 'rd'].forEach(x => document.getElementById('m-' + x).classList.remove('active'));
  document.getElementById('m-' + m).classList.add('active');
  qState.queue = shuffle([...vocabulary]);
  qState.rq = 0; qState.rc = 0;
  loadQ();
}

function loadQ() {
  if (qState.rq >= qState.rt) { showRoundResults(); return; }
  if (qState.queue.length < 4) qState.queue = shuffle([...vocabulary]);
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
  document.getElementById('lore-text').innerHTML = `<div class="generating"><div class="gd"></div><div class="gd"></div><div class="gd"></div><span>古の語録を紐解いている…</span></div>`;

  updateGlobalStats();
  updateDueBadge();
  const sp = document.getElementById('streak-pill');
  if (gStats.streak >= 3) { sp.style.display = 'inline-flex'; document.getElementById('streak-n').textContent = gStats.streak; }
  else sp.style.display = 'none';

  await Storage.setStats(gStats);
  await Storage.addHistory({ k: qState.cur.k, r: qState.cur.r, m: qState.cur.m, result: ok ? 'correct' : 'wrong', mode: qState.mode, ts: Date.now(), type: 'quiz' });
  genLore(qState.cur, 'lore-text');
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
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 120, messages: [{ role: 'user', content: `2 sentences in Japanese, Elden Ring style, for a JLPT quiz player scoring ${qState.rc}/${qState.rt}. Dark and poetic. Bold key words with <strong>.` }] }) });
    const d = await resp.json();
    const txt = d.content?.[0]?.text;
    if (txt) { document.getElementById('r-lore-text').innerHTML = txt; document.getElementById('r-lore').style.display = 'block'; }
  } catch {}
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
// SRS
// ════════════════════════════════════════════════
function updateSRSDash() {
  const now = Date.now();
  const due = Object.values(srsData).filter(c => c.due <= now).length;
  const learned = Object.values(srsData).filter(c => c.state === 'review' || c.state === 'mature').length;
  const mature = Object.values(srsData).filter(c => c.state === 'mature').length;
  const newAvail = Math.min(SM2.NEW_PER_DAY, vocabulary.length - Object.keys(srsData).length);
  document.getElementById('srs-due').textContent = due;
  document.getElementById('srs-new').textContent = newAvail;
  document.getElementById('srs-learned').textContent = learned;
  document.getElementById('srs-mature').textContent = mature;
  updateDueBadge();
  startSRSSession();
}

function startSRSSession() {
  document.getElementById('srs-complete').style.display = 'none';
  document.getElementById('srs-study-area').style.display = 'block';
  const now = Date.now();
  const dueCards = shuffle(Object.values(srsData).filter(c => c.due <= now));
  const usedIdxs = new Set(Object.keys(srsData).map(Number));
  const newIdxs = [];
  for (let i = 0; i < vocabulary.length && newIdxs.length < SM2.NEW_PER_DAY; i++) {
    if (!usedIdxs.has(i)) newIdxs.push(i);
  }
  const newCards = newIdxs.slice(0, Math.max(0, SM2.NEW_PER_DAY - dueCards.length)).map(i => SM2.newCard(i));
  srsSession.queue = [...dueCards, ...newCards];
  if (srsSession.queue.length === 0) { showSRSComplete(); return; }
  loadSRSCard();
}

function loadSRSCard() {
  if (srsSession.queue.length === 0) { showSRSComplete(); return; }
  srsSession.cur = srsSession.queue.shift();
  srsSession.revealed = false;
  const card = srsSession.cur;
  const word = vocabulary[card.idx];
  if (!word) { loadSRSCard(); return; }

  const remaining = srsSession.queue.length + 1;
  const due = srsSession.queue.filter(c => c.state !== 'new').length + (card.state !== 'new' ? 1 : 0);
  const newCount = remaining - due;
  const qb = document.getElementById('srs-queue-bar');
  qb.innerHTML = '';
  if (due > 0) qb.innerHTML += `<div class="queue-item qi-review">復習 ${due}</div>`;
  if (newCount > 0) qb.innerHTML += `<div class="queue-item qi-new">新規 ${newCount}</div>`;
  qb.innerHTML += `<div class="queue-item qi-due">残り ${remaining}</div>`;

  const lvlMap = { new: 'lvl-0', learning: 'lvl-1', review: 'lvl-2', mature: 'lvl-3' };
  const lvlLabel = { new: '新規', learning: '学習中', review: '復習', mature: '定着' };
  document.getElementById('srs-badge').innerHTML = `記憶修練 · ${card.state === 'new' ? 'NEW' : 'REVIEW'} <span class="srs-level ${lvlMap[card.state]}">${lvlLabel[card.state]}</span>`;
  document.getElementById('srs-num').textContent = '# ' + String(card.idx + 1).padStart(4, '0');
  document.getElementById('srs-word').textContent = word.k;
  document.getElementById('srs-read').textContent = word.r !== word.k ? word.r : '';
  document.getElementById('srs-reveal-area').style.display = 'block';
  document.getElementById('srs-answer-area').style.display = 'none';
  [0, 1, 2, 3].forEach(r => { document.getElementById('int-' + r).textContent = SM2.nextIntervalLabel(card, r); });
}

function revealAnswer() {
  srsSession.revealed = true;
  const word = vocabulary[srsSession.cur.idx];
  document.getElementById('srs-meaning').textContent = word.m;
  document.getElementById('srs-reveal-area').style.display = 'none';
  document.getElementById('srs-answer-area').style.display = 'block';
  document.getElementById('srs-lore-text').innerHTML = `<div class="generating"><div class="gd"></div><div class="gd"></div><div class="gd"></div><span>古の語録を紐解いている…</span></div>`;
  genLore(word, 'srs-lore-text');
}

async function rateSRS(rating) {
  if (!srsSession.revealed) return;
  const card = srsSession.cur;
  const word = vocabulary[card.idx];
  const updated = SM2.review(card, rating);
  srsData[card.idx] = updated;
  if (rating <= 1 && card.state === 'review') srsSession.queue.push(updated);
  await Storage.setSRSData(srsData);
  await Storage.addHistory({ k: word.k, r: word.r, m: word.m, result: rating >= 2 ? 'correct' : 'wrong', mode: 'srs', ts: Date.now(), type: 'srs', rating, interval: updated.interval, state: updated.state });
  if (rating >= 2) { gStats.correct++; gStats.streak++; } else { gStats.wrong++; gStats.streak = 0; }
  gStats.total++;
  await Storage.setStats(gStats);
  updateGlobalStats();
  updateDueBadge();
  loadSRSCard();
}

function showSRSComplete() {
  document.getElementById('srs-study-area').style.display = 'none';
  document.getElementById('srs-complete').style.display = 'block';
  document.getElementById('srs-done-msg').textContent = `本日の修練完了。${Object.keys(srsData).length}語が記録された。`;
  const future = Object.values(srsData).filter(c => c.due > Date.now());
  if (future.length > 0) {
    const next = future.sort((a, b) => a.due - b.due)[0];
    const mins = Math.round((next.due - Date.now()) / 60000);
    const label = mins < 60 ? mins + '分後' : Math.round(mins / 60) + '時間後';
    document.getElementById('srs-next-review').textContent = `次の復習カードは${label}に訪れる。怠るな、褪せ人よ。`;
  } else {
    document.getElementById('srs-next-review').textContent = '全ての修練が完了した。黄金樹の加護あれ。';
  }
  updateSRSDash();
}

function updateDueBadge() {
  const due = Object.values(srsData).filter(c => c.due <= Date.now()).length;
  const badge = document.getElementById('due-badge');
  if (due > 0) { badge.style.display = 'inline-block'; badge.textContent = due; }
  else badge.style.display = 'none';
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
  ['all', 'correct', 'wrong', 'srs'].forEach(x => document.getElementById('hf-' + x).classList.remove('active'));
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
// LORE GENERATION
// ════════════════════════════════════════════════
async function genLore(word, targetId) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 180,
        messages: [{ role: 'user', content: `Write a 2-sentence item description in Japanese for the word "${word.k}" (${word.r}) meaning "${word.m}". Style: Elden Ring / Dark Souls — dark, poetic, slightly archaic. Bold "${word.k}" with <strong> tags. Output only the description.` }] })
    });
    const d = await resp.json();
    const txt = d.content?.[0]?.text || '';
    document.getElementById(targetId).innerHTML = txt || `褪せ人の旅路に宿る知識の欠片。<strong>${word.k}</strong>とは、${word.m}を意味する古き言葉。`;
  } catch {
    const fb = [
      `褪せ人よ、この言葉を胸に刻め。<strong>${word.k}</strong>——${word.m}。黄金樹の根元に眠る知識の欠片。`,
      `古き王国の語録に記された言葉。<strong>${word.k}</strong>の意味を知る者は霧の中にも道を見出す。`
    ];
    document.getElementById(targetId).innerHTML = fb[Math.floor(Math.random() * fb.length)];
  }
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
  if (activePage === 'page-srs') {
    if (!srsSession.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); revealAnswer(); return; }
    if (srsSession.revealed) { if (e.key === '1') rateSRS(0); else if (e.key === '2') rateSRS(1); else if (e.key === '3') rateSRS(2); else if (e.key === '4') rateSRS(3); }
  }
});

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
async function init() {
  createEmbers();
  gStats = await Storage.getStats();
  srsData = await Storage.getSRSData();
  updateGlobalStats();
  updateDueBadge();
  qState.queue = shuffle([...vocabulary]);
  loadQ();
  setTimeout(() => document.getElementById('loading').classList.add('hidden'), 1400);
}

init();
