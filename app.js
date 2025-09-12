console.log('[quiz-app] boot'); // 起動確認ログ

/***** 設定 *****/
// こぐれさんの最新デプロイURL
const GAS_URL = "https://script.google.com/macros/s/AKfycbxiQ5xQsfh6uDXZYHshoLtAmnGbICKBFzv5bjOIYQwHuZ2s45Zt8O46-4x-4IzENcIzTA/exec";

const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};

/***** 状態 *****/
const state = {
  subject: "国語",        // 初期表示で国語を選択
  pool: "all",            // all | wrong_blank
  order: "random",        // random | sequential
  scope: "all",           // all | byweek
  week: null,
  rows: [],
  i: 0,
  todayCount: 0,
};

/***** ユーティリティ *****/
const norm = s => String(s ?? '').trim().replace(/\s+/g, '');
function parseAlts(s){
  return String(s ?? '')
    .split(/[|｜,，；;／/・\s]+/)   // 区切り文字いろいろ対応
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
  const els = [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')];
  els.forEach(el => { if (el) el.textContent = String(state.todayCount); });
}
function saveTodayPoint(){
  localStorage.setItem(todayKey(), String(state.todayCount));
}

/***** 表示切替 *****/
function showPanel(panelId) {
  document.querySelector('#subjectPanel').classList.add('hidden');
  document.querySelector('#quizPanel').classList.add('hidden');
  document.querySelector(panelId).classList.remove('hidden');
}

/***** ステータス *****/
function setStatus(txt){
  const st = document.querySelector('#status');
  if (st) st.textContent = txt || '';
}

/***** 授業回の選択肢を生成 *****/
async function loadWeeks() {
  const sheetName = SUBJECTS[state.subject].sheetName;
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=all`;

  try {
    const res = await fetch(url);
    console.log('[loadWeeks] GET', url, res.status);
    const json = await res.json();
    console.log('[loadWeeks] rows=', json.rows?.length);

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

/***** 出題の取得 *****/
async function loadQuestions(){
  const sheetName = SUBJECTS[state.subject].sheetName;
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=${encodeURIComponent(state.pool)}`;

  setStatus(`読み込み中…（科目：${state.subject}）`);
  try{
    const res = await fetch(url);
    console.log('[loadQuestions] GET', url, res.status);
    const json = await res.json();
    console.log('[loadQuestions] rows=', json.rows?.length);

    if (!json.ok) throw new Error(json.error || 'fetch_error');

    let rows = Array.isArray(json.rows) ? json.rows : [];

    // 授業回フィルタ
    if (state.scope === 'byweek' && state.week) {
      rows = rows.filter(row => String(row.week) === String(state.week));
    }

    if (state.order === 'random') shuffle(rows); // sequentialなら並べ替えなし
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

/***** 回答処理（G列ログ：正解→空白 / 不正解→TRUE） *****/
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

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action:'log',
        sheetName: SUBJECTS[state.subject].sheetName,
        id: row.id,
        correct
      })
    });
    res.json().then(j => console.log('[submitAnswer] log result:', j)).catch(()=>{});
  } catch(e){
    console.error('log failed', e);
  }

  if (correct){
    state.todayCount += 1;
    saveTodayPoint();
    const els = [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')];
    els.forEach(el => { if (el) el.textContent = String(state.todayCount); });
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

/***** イベント結線 *****/
function bindEvents(){
  // 科目切替
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-subject]');
    if (!btn) return;
    const cand = btn.dataset.subject;
    if (state.subject !== cand){
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
      loadWeeks();
    }
  });

  // pool / order 切替
  document.addEventListener('change', (e)=>{
    const p = e.target.closest('input[name="pool"]');
    if (p) state.pool = p.value;
    const o = e.target.closest('input[name="order"]');
    if (o) state.order = o.value;
  });

  // スコープ切替
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

  // 授業回選択
  const weekSelect = document.querySelector('#weekSelect');
  if (weekSelect) {
    weekSelect.addEventListener('change', (e) => {
      state.week = e.target.value || null;
    });
  }

  // クイズ開始
  const startBtn = document.querySelector('#startBtn');
  if (startBtn) startBtn.addEventListener('click', loadQuestions);

  // メニューへ戻る
  const backBtn = document.querySelector('#backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=>{ showPanel('#subjectPanel'); });

  // 送信
  const input = document.querySelector('#answerInput');
  if (input) input.addEventListener('keydown', e=>{ if (e.key==='Enter') submitAnswer(); });
  const sb = document.querySelector('#submitBtn');
  if (sb) sb.addEventListener('click', () => submitAnswer());

  // わからない
  const skipBtn = document.querySelector('#skipBtn');
  if (skipBtn) skipBtn.addEventListener('click', () => submitAnswer(false));

  // 本日ポイントリセット
  const rstTop = document.querySelector('#resetTodayTop');
  if (rstTop) rstTop.addEventListener('click', resetTodayPoint);
  const rstBottom = document.querySelector('#resetToday');
  if (rstBottom) rstBottom.addEventListener('click', resetTodayPoint);
}

function resetTodayPoint(){
  state.todayCount = 0;
  saveTodayPoint();
  const els = [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')];
  els.forEach(el => { if (el) el.textContent = '0'; });
}

/***** 初期化 *****/
window.addEventListener('DOMContentLoaded', ()=>{
  console.log('[quiz-app] DOMContentLoaded');
  bindEvents();
  loadTodayPoint();
  showPanel('#subjectPanel');

  const initialSubjectBtn = document.querySelector(`[data-subject="${state.subject}"]`);
  if (initialSubjectBtn) initialSubjectBtn.classList.add('primary');
  const subjectTitle = document.querySelector('#subjectTitle');
  if (subjectTitle) subjectTitle.textContent = state.subject;

  loadWeeks();
});
