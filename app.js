/***** 設定 *****/
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx8QDPVmasQfRcp990Pe-cLsbCPFtgwGfP29NvsTbjCTg5KQCezLdEvxSj8yqdz8PO9Yw/exec';
const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};

/***** 状態 *****/
const state = {
  subject: "国語",   // 初期科目
  pool: "all",       // all | wrong_blank
  order: "seq",      // seq | shuffle
  rows: [],
  i: 0,
  todayCount: 0
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
  const el = document.querySelector('#pointTodayTop');
  if (el) el.textContent = String(state.todayCount);
}
function saveTodayPoint(){
  localStorage.setItem(todayKey(), String(state.todayCount));
}

/***** ステータス表示 *****/
function setStatus(txt){
  const st = document.querySelector('#status');
  if (st) st.textContent = txt || '';
}

/***** 出題の取得 *****/
async function loadQuestions(){
  const sheetName = SUBJECTS[state.subject].sheetName;
  const url = `${GAS_URL}?action=get&sheetName=${encodeURIComponent(sheetName)}&pool=${state.pool}`;

  setStatus(`読み込み中…（科目：${state.subject}）`);
  try{
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'fetch_error');

    state.rows = Array.isArray(json.rows) ? json.rows : [];
    if (state.order === 'shuffle') shuffle(state.rows);
    state.i = 0;

    const totalEl = document.querySelector('#total');
    if (totalEl) totalEl.textContent = `全${state.rows.length}問`;

    if (state.rows.length === 0){
      setStatus(`「${state.subject}」に該当の問題がありません（フィルタを見直してね）`);
      renderQuestion(null);
      return;
    }
    setStatus('');
    renderQuestion(state.rows[state.i]);
  }catch(e){
    console.error(e);
    setStatus('読み込みに失敗しました');
  }
}

/***** 1問描画 *****/
function renderQuestion(row){
  const qEl = document.querySelector('#q');
  const img = document.querySelector('#img');
  const ans = document.querySelector('#ans');
  const idxEl = document.querySelector('#idx');
  const msgEl = document.querySelector('#msg');

  if (!row){
    if (qEl) qEl.textContent = '問題がありません';
    if (img){ img.removeAttribute('src'); img.style.display='none'; }
    if (ans) ans.value = '';
    if (idxEl) idxEl.textContent = '0 / 0';
    if (msgEl) msgEl.textContent = '';
    return;
  }

  if (qEl) qEl.textContent = row.question;
  if (img){
    if (row.image_url){ img.src = row.image_url; img.style.display=''; }
    else { img.removeAttribute('src'); img.style.display='none'; }
  }
  if (ans){ ans.value=''; ans.focus(); }
  if (idxEl) idxEl.textContent = `${state.i+1} / ${state.rows.length}`;
  if (msgEl) msgEl.textContent = '';
}

/***** 回答処理 → G列ログ（正解→空白 / 不正解→TRUE） *****/
async function submitAnswer(){
  if (state.i >= state.rows.length) return;

  const row = state.rows[state.i];
  const ansEl = document.querySelector('#ans');
  const user = norm(ansEl ? ansEl.value : '');

  const corrects = new Set([norm(row.answer), ...parseAlts(row.alt_answers)]);
  const correct = corrects.has(user);

  const msg = document.querySelector('#msg');
  if (msg) msg.textContent = correct ? '正解！' : `不正解… 正：${row.answer}`;

  try{
    await fetch(GAS_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
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

  if (correct){
    state.todayCount += 1;
    saveTodayPoint();
    const p = document.querySelector('#pointTodayTop');
    if (p) p.textContent = String(state.todayCount);
  }

  state.i += 1;
  if (state.i >= state.rows.length) finishSet();
  else renderQuestion(state.rows[state.i]);
}

/***** セット終了表示 *****/
function finishSet(){
  const qEl = document.querySelector('#q');
  const img = document.querySelector('#img');
  const idxEl = document.querySelector('#idx');
  if (qEl) qEl.textContent = 'おしまい！おつかれさま 🙌';
  if (img){ img.removeAttribute('src'); img.style.display='none'; }
  if (idxEl) idxEl.textContent = `${state.rows.length} / ${state.rows.length}`;
}

/***** イベント結線（委譲+フォールバック） *****/
function bindEvents(){
  // 科目切替（data-subject が無い場合はボタンの文字を使う）
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-subject], .chip, button');
    if (!btn) return;

    // data-subject があればそれを、無ければ表示テキストを採用
    const cand = (btn.dataset && btn.dataset.subject) ? btn.dataset.subject : btn.textContent.trim();
    if (!cand) return;
    if (!SUBJECTS[cand]) return;  // 未対応ラベルは無視

    // 見た目
    document.querySelectorAll('[data-subject], .chip').forEach(b=>{
      // ラベル一致でハイライト（data-subject優先）
      const name = (b.dataset && b.dataset.subject) ? b.dataset.subject : b.textContent.trim();
      b.classList.toggle('primary', name === cand);
    });

    if (state.subject !== cand){
      state.subject = cand;
      loadQuestions();
    }
  });

  // フィルタ切替
  document.addEventListener('change', (e)=>{
    const p = e.target.closest('input[name="pool"]');
    if (p){ state.pool = p.value; loadQuestions(); return; }
    const o = e.target.closest('input[name="order"]');
    if (o){ state.order = o.value; loadQuestions(); return; }
  });

  // 送信
  const input = document.querySelector('#ans');
  if (input) input.addEventListener('keydown', e=>{ if (e.key==='Enter') submitAnswer(); });
  const sb = document.querySelector('#submit');
  if (sb) sb.addEventListener('click', submitAnswer);

  // 本日ポイントリセット
  const rst = document.querySelector('#resetTodayTop');
  if (rst) rst.addEventListener('click', ()=>{
    state.todayCount = 0;
    saveTodayPoint();
    const el = document.querySelector('#pointTodayTop');
    if (el) el.textContent = '0';
  });
}

/***** 初期化 *****/
window.addEventListener('DOMContentLoaded', async ()=>{
  bindEvents();
  loadTodayPoint();

  // 初期ボタンの見た目同期（data-subject 無くてもOK）
  const buttons = [...document.querySelectorAll('[data-subject], .chip, button')];
  const first = buttons.find(b => {
    const name = (b.dataset && b.dataset.subject) ? b.dataset.subject : b.textContent.trim();
    return name === state.subject;
  });
  if (first){
    buttons.forEach(b=>{
      const name = (b.dataset && b.dataset.subject) ? b.dataset.subject : b.textContent.trim();
      b.classList.toggle('primary', b === first || name === state.subject);
    });
  }

  await loadQuestions();
});
