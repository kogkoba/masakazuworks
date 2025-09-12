/***** 設定 *****/
// 新しいGASのデプロイURLを使用
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxiQ5xQsfh6uDXZYHshoLtAmnGbICKBFzv5bjOIYQwHuZ2s45Zt8O46-4x-4IzENcIzTA/exec';
const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};

/***** 状態 *****/
const state = {
  subject: "国語",       // 初期科目
  pool: "all",           // all | wrong_or_blank（GAS側は' all '以外ならフィルタ動作）
  order: "random",       // random | sequential
  rows: [],
  i: 0,
  todayCount: 0,
  scope: 'all',          // all | byweek
  week: null,
};

/***** ユーティリティ *****/
const norm = s => String(s ?? '').trim().replace(/\s+/g, '');
function parseAlts(s){
  return String(s ?? '')
    .split(/[\/｜|,，；;]+/)
    .map(x => norm(x))
    .filter(Boolean);
}
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
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
  state.todayCount = isNaN(v) ? 0 : v;
  const els = [document.querySelector('#pointTodayTop'), document.querySelector('#pointToday')];
  els.forEach(el => { if (el) el.textContent = String(state.todayCount); });
}
function saveTodayPoint(){
  localStorage.setItem(todayKey(), String(state.todayCount));
}

/***** 画面表示の切り替え *****/
function showPanel(panelId) {
  document.querySelector('#subjectPanel').classList.add('hidden');
  document.querySelector('#quizPanel').classList.add('hidden');
  document.querySelector(panelId).classList.remove('hidden');
}

/***** ステータス表示 *****/
function setStatus(txt){
  const st = document.querySelector('#status');
  if (st) st.textContent = txt || '';
}

/***** 出題の取得 *****/
async function loadQuestions(){
  const sheetName = SUBJECTS[state.subject].sheetName;
  // GAS 側は 'all' 以外ならフィルタになるため、UIの 'wrong_or_blank' はそのまま送ってOK
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=${encodeURIComponent(state.pool)}`;

  setStatus(`読み込み中…（科目：${state.subject}）`);
  try{
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'fetch_error');

    let rows = Array.isArray(json.rows) ? json.rows : [];

    // 授業回フィルタ（両側を正規化）
    if (state.scope === 'byweek' && state.week) {
      const target = String(state.week || '').trim();
      rows = rows.filter(row => String(row.week || '').trim() === target);
    }

    state.rows = rows;
    if (state.order === 'random') shuffle(state.rows);
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
    if (imgEl){ imgEl.removeAttribute('src'); imgWrap.classList.add('hidden'); }
    if (ansEl) ansEl.value = '';
    if (idxEl) idxEl.textContent = '0';
    if (feedbackEl) feedbackEl.textContent = '';
    if (weekEl) weekEl.textContent = '';
    return;
  }

  if (qEl) qEl.textContent = row.question || '';
  if (imgEl){
    if (row.image_url){ imgEl.src = row.image_url; imgWrap.classList.remove('hidden'); }
    else { imgEl.removeAttribute('src'); imgWrap.classList.add('hidden'); }
  }
  if (ansEl){ ansEl.value=''; ansEl.focus(); }
  if (idxEl) idxEl.textContent = `${state.i+1}`;
  if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.classList.remove('ok','ng'); }
  if (weekEl) weekEl.textContent = row.week ? String(row.week) : '';
}

/***** G列ログ送信（正解→空白 / 不正解→TRUE） *****/
async function sendLog(row, correct){
  try{
    await fetch(GAS_URL, {
      method:'POST',
      // プリフライト回避のため text/plain に
      headers:{ 'Content-Type':'text/plain; charset=utf-8' },
      body: JSON.stringify({
        action:'log',
        sheetName: SUBJECTS[state.subject].sheetName,
        id: row.id,
        correct
      })
    });
  }catch(e){
    console.error('log failed', e);
  }
}

/***** 回答処理 *****/
async function submitAnswer(){
  if (state.i >= state.rows.length) return;

  const row = state.rows[state.i];
  const ansEl = document.querySelector('#answerInput');
  const user = norm(ansEl ? ansEl.value : '');

  const corrects = new Set([norm(row.answer), ...parseAlts(row.alt_answers)]);
  const correct = corrects.has(user);

  const feedbackEl = document.querySelector('#feedback');
  if (feedbackEl) {
    feedbackEl.textContent = correct ? '正解！' : `不正解… 正：${row.answer}`;
    feedbackEl.classList.toggle('ok', correct);
    feedbackEl.classList.toggle('ng', !correct);
  }

  await sendLog(row, correct);

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

/***** スキップ（不正解として処理） *****/
async function skipQuestion(){
  if (state.i >= state.rows.length) return;
  const row = state.rows[state.i];

  const feedbackEl = document.querySelector('#feedback');
  if (feedbackEl) {
    feedbackEl.textContent = `スキップ：正解は「${row.answer}」`;
    feedbackEl.classList.remove('ok');
    feedbackEl.classList.add('ng');
  }

  await sendLog(row, false);
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

/***** 授業回の選択肢を生成 *****/
async function loadWeeks() {
  const sheetName = SUBJECTS[state.subject].sheetName;
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=all`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'fetch_error');
    
    const rows = Array.isArray(json.rows) ? json.rows : [];
    const weeks = [...new Set(
      rows
        .map(row => String(row.week || '').trim())
        .filter(Boolean)
    )].sort();

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
      loadWeeks();
    }
  });

  // フィルタ切替
  document.addEventListener('change', (e)=>{
    const p = e.target.closest('input[name="pool"]');
    if (p) state.pool = p.value;
    const o = e.target.closest('input[name="order"]');
    if (o) state.order = o.value;
  });

  // スコープ切替（全授業/授業回）
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
    } else {
      weekSelect.classList.add('hidden');
      state.week = null; // 授業回選択をリセット
    }
  });

  // 授業回選択
  const ws = document.querySelector('#weekSelect');
  if (ws) ws.addEventListener('change', (e) => {
    state.week = e.target.value;
  });

  // クイズ開始ボタン
  const startBtn = document.querySelector('#startBtn');
  if (startBtn) startBtn.addEventListener('click', loadQuestions);

  // メニューへ戻るボタン
  const backBtn = document.querySelector('#backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=>{ showPanel('#subjectPanel'); });

  // 送信（Enter）
  const input = document.querySelector('#answerInput');
  if (input) input.addEventListener('keydown', e=>{ if (e.key==='Enter') submitAnswer(); });
  const sb = document.querySelector('#submitBtn');
  if (sb) sb.addEventListener('click', submitAnswer);

  // スキップ
  const skipBtn = document.querySelector('#skipBtn');
  if (skipBtn) skipBtn.addEventListener('click', skipQuestion);

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
window.addEventListener('DOMContentLoaded', async ()=>{
  bindEvents();
  loadTodayPoint();
  showPanel('#subjectPanel');
  
  // 初期科目の見た目を設定
  const initialSubjectBtn = document.querySelector(`[data-subject="${state.subject}"]`);
  if (initialSubjectBtn) {
    initialSubjectBtn.classList.add('primary');
    const subjectTitle = document.querySelector('#subjectTitle');
    if (subjectTitle) subjectTitle.textContent = state.subject;
  }
  
  // 初期化時に授業回を読み込む
  loadWeeks();
});
