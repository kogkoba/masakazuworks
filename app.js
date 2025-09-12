console.log('[quiz-app] boot');

/***** 設定 *****/// ここを新URLに置き換え

const GAS_URL = "https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbx51jPktIPrLQ-Dc8lmhkLn7RAOf8fcLy6vGqpkBEFxGAcHaTEgwpqr_gEnEj7pLDscrw/exec";

const SUBJECTS = {
  "算数": { gid: 0 },
  "国語": { gid: 162988483 },
  "理科": { gid: 1839969673 },
  "社会": { gid: 2143649641 },
};

/***** JSONP ユーティリティ *****/
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "__cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    s.src = url + sep + 'callback=' + cb;
    s.async = true;

    window[cb] = (data) => {
      try { resolve(data); }
      finally {
        delete window[cb];
        document.body.removeChild(s);
      }
    };
    s.onerror = () => {
      delete window[cb];
      document.body.removeChild(s);
      reject(new Error('jsonp_error'));
    };
    document.body.appendChild(s);
  });
}

/***** 状態 *****/
const state = {
  subject: "国語",
  pool: "all",           // all | wrong_blank
  order: "random",       // random | sequential
  scope: "all",          // all | byweek
  week: null,
  rows: [],
  i: 0,
  todayCount: 0,
};

/***** ユーティリティ *****/
const norm = s => String(s ?? '').trim().replace(/\s+/g, '');
function parseAlts(s){
  return String(s ?? '')
    .split(/[|｜,，；;／/・\s]+/)
    .map(x => norm(x))
    .filter(Boolean);
}
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
const todayKey = () => {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `point_${d.getFullYear()}-${m}-${day}`;
};
function loadTodayPoint(){
  const v = Number(localStorage.getItem(todayKey()) || 0);
  state.todayCount = Number.isFinite(v) ? v : 0;
  [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')]
    .forEach(el => { if (el) el.textContent = String(state.todayCount); });
}
function saveTodayPoint(){
  localStorage.setItem(todayKey(), String(state.todayCount));
}

/***** 表示切替とステータス *****/
function showPanel(panelId) {
  document.querySelector('#subjectPanel').classList.add('hidden');
  document.querySelector('#quizPanel').classList.add('hidden');
  document.querySelector(panelId).classList.remove('hidden');
}
function setStatus(txt){
  const st = document.querySelector('#status');
  if (st) st.textContent = txt || '';
}

/***** 授業回の選択肢を生成（JSONP）*****/
async function loadWeeks() {
  const gid = SUBJECTS[state.subject].gid;
  const url = `${GAS_URL}?action=get&gid=${gid}&pool=all`;
  try {
    const json = await jsonp(url);
    console.log('[loadWeeks]', json);
    if (!json.ok) throw new Error(json.error || 'fetch_error');

    const rows = Array.isArray(json.rows) ? json.rows : [];
    const weeks = [...new Set(rows.map(row => row.week).filter(Boolean))].sort();

    const weekSelect = document.querySelector('#weekSelect');
    if (weekSelect) {
      weekSelect.innerHTML = '<option value="">- 授業回を選択 -</option>';
      weeks.forEach(week => {
        const option = document.createElement('option');
        option.value = week;
        option.textContent = week;
        weekSelect.appendChild(option);
      });
    }
  } catch(e) {
    console.error('Failed to load weeks', e);
  }
}

/***** 出題の取得（JSONP）*****/
async function loadQuestions(){
  const gid = SUBJECTS[state.subject].gid;
  const url = `${GAS_URL}?action=get&gid=${gid}&pool=${encodeURIComponent(state.pool)}`;

  setStatus(`読み込み中…（科目：${state.subject}）`);
  try{
    const json = await jsonp(url);
    console.log('[loadQuestions]', json);
    if (!json.ok) throw new Error(json.error || 'fetch_error');

    let rows = Array.isArray(json.rows) ? json.rows : [];
    if (state.scope === 'byweek' && state.week) {
      rows = rows.filter(row => String(row.week) === String(state.week));
    }
    if (state.order === 'random') shuffle(rows);
    state.rows = rows;
    state.i = 0;

    const totalEl = document.querySelector('#qTotal');
    if (totalEl) totalEl.textContent = `${state.rows.length}`;

    if (state.rows.length === 0){
      setStatus(`「${state.subject}」に該当の問題がありません（フィルタを見直してね）`);
      return;
    }
    setStatus('');
    showPanel('#quizPanel');
    renderQuestion(state.rows[state.i]);
  }catch(e){
    console.error(e);
    setStatus('読み込みに失敗しました');
  }
}

/***** 1問描画 *****/
function renderQuestion(row){
  const qEl = document.querySelector('#qText');
  const imgWrap = document.querySelector('#qImageWrap');
  const imgEl = document.querySelector('#qImage');
  const ansEl = document.querySelector('#answerInput');
  const idxEl = document.querySelector('#qIndex');
  const feedbackEl = document.querySelector('#feedback');
  const weekEl = document.querySelector('#qWeek');

  if (!row){
    if (qEl) qEl.textContent = '問題がありません';
    if (imgEl){ imgEl.removeAttribute('src'); }
    if (imgWrap){ imgWrap.classList.add('hidden'); }
    if (ansEl) ansEl.value = '';
    if (idxEl) idxEl.textContent = '0';
    if (feedbackEl) feedbackEl.textContent = '';
    if (weekEl) weekEl.textContent = '';
    return;
  }

  if (qEl) qEl.textContent = row.question || '';
  if (imgEl && imgWrap){
    if (row.image_url) {
      imgEl.src = row.image_url;
      imgWrap.classList.remove('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgWrap.classList.add('hidden');
    }
  }
  if (ansEl){ ansEl.value=''; ansEl.focus(); }
  if (idxEl) idxEl.textContent = `${state.i+1}`;
  if (feedbackEl){ feedbackEl.textContent = ''; feedbackEl.classList.remove('ok','ng'); }
  if (weekEl) weekEl.textContent = row.week ? String(row.week) : '';
}

/***** 回答処理 → GETでログ（JSONP）*****/
async function submitAnswer(correctOverride=null){
  if (state.i >= state.rows.length) return;

  const row = state.rows[state.i];
  const ansEl = document.querySelector('#answerInput');
  const user = norm(ansEl ? ansEl.value : '');

  const corrects = new Set([norm(row.answer), ...parseAlts(row.alt_answers)]);
  const correct = (correctOverride === null) ? corrects.has(user) : !!correctOverride;

  const feedbackEl = document.querySelector('#feedback');
  if (feedbackEl) {
    feedbackEl.textContent = correct ? '正解！' : `不正解… 正：${row.answer}`;
    feedbackEl.classList.toggle('ok', correct);
    feedbackEl.classList.toggle('ng', !correct);
  }

  // JSONPでログ（GET）
  try {
    const gid = SUBJECTS[state.subject].gid;
    const url = `${GAS_URL}?action=log&gid=${gid}&id=${encodeURIComponent(row.id)}&correct=${correct ? '1' : '0'}`;
    const res = await jsonp(url);
    console.log('[submitAnswer] log result:', res);
  } catch(e){
    console.error('log failed', e);
  }

  if (correct){
    state.todayCount += 1;
    saveTodayPoint();
    [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')]
      .forEach(el => { if (el) el.textContent = String(state.todayCount); });
  }

  state.i += 1;
  if (state.i >= state.rows.length) finishSet();
  else renderQuestion(state.rows[state.i]);
}

/***** セット終了表示 *****/
function finishSet(){
  const qEl = document.querySelector('#qText');
  const imgWrap = document.querySelector('#qImageWrap');
  const idxEl = document.querySelector('#qIndex');
  const ansEl = document.querySelector('#answerInput');
  if (qEl) qEl.textContent = 'おしまい！おつかれさま 🙌';
  if (imgWrap) imgWrap.classList.add('hidden');
  if (idxEl) idxEl.textContent = `${state.rows.length}`;
  if (ansEl) ansEl.value = '';
}

/***** イベント結線（同じ科目でもパネルを開く）*****/
function bindEvents(){
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-subject]');
    if (!btn) return;

    const cand = btn.dataset.subject;
    const changed = (state.subject !== cand);
    state.subject = cand;

    document.querySelectorAll('[data-subject]').forEach(b=>{
      b.classList.toggle('primary', b.dataset.subject === cand);
    });

    const subjectTitle = document.querySelector('#subjectTitle');
    if (subjectTitle) subjectTitle.textContent = cand;
    showPanel('#subjectPanel');

    state.scope = 'all';
    state.week = null;
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.scope === 'all');
    });
    const weekSelect = document.querySelector('#weekSelect');
    if (weekSelect) {
      weekSelect.classList.add('hidden');
      weekSelect.value = '';
    }

    if (changed) loadWeeks();
    else if (!weekSelect || weekSelect.options.length <= 1) loadWeeks();
  });

  document.addEventListener('change', (e)=>{
    const p = e.target.closest('input[name="pool"]');
    if (p) state.pool = p.value;
    const o = e.target.closest('input[name="order"]');
    if (o) state.order = o.value;
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn[data-scope]');
    if (!btn) return;
    state.scope = btn.dataset.scope;

    document.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.scope === state.scope);
    });

    const weekSelect = document.querySelector('#weekSelect');
    if (state.scope === 'byweek') {
      weekSelect.classList.remove('hidden');
      if (!weekSelect.options.length || weekSelect.options.length <= 1) loadWeeks();
    } else {
      weekSelect.classList.add('hidden');
      state.week = null;
      weekSelect.value = '';
    }
  });

  const weekSelect = document.querySelector('#weekSelect');
  if (weekSelect) {
    weekSelect.addEventListener('change', (e) => {
      state.week = e.target.value || null;
    });
  }

  const startBtn = document.querySelector('#startBtn');
  if (startBtn) startBtn.addEventListener('click', loadQuestions);

  const backBtn = document.querySelector('#backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=>{ showPanel('#subjectPanel'); });

  const input = document.querySelector('#answerInput');
  if (input) input.addEventListener('keydown', e=>{ if (e.key==='Enter') submitAnswer(); });
  const sb = document.querySelector('#submitBtn');
  if (sb) sb.addEventListener('click', () => submitAnswer());

  const skipBtn = document.querySelector('#skipBtn');
  if (skipBtn) skipBtn.addEventListener('click', () => submitAnswer(false));

  const rstTop = document.querySelector('#resetTodayTop');
  if (rstTop) rstTop.addEventListener('click', resetTodayPoint);
  const rstBottom = document.querySelector('#resetToday');
  if (rstBottom) rstBottom.addEventListener('click', resetTodayPoint);
}

function resetTodayPoint(){
  state.todayCount = 0;
  saveTodayPoint();
  [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')]
    .forEach(el => { if (el) el.textContent = '0'; });
}

/***** 初期化 *****/
window.addEventListener('DOMContentLoaded', ()=>{
  bindEvents();
  loadTodayPoint();
  showPanel('#subjectPanel');

  const initialSubjectBtn = document.querySelector(`[data-subject="${state.subject}"]`);
  if (initialSubjectBtn) initialSubjectBtn.classList.add('primary');
  const subjectTitle = document.querySelector('#subjectTitle');
  if (subjectTitle) subjectTitle.textContent = state.subject;

  loadWeeks();
});
