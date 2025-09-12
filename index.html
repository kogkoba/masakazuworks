// ===== 設定 =====
const CFG = window.APP_CONFIG;
// JSONで読む（セル改行でも安全）
const SHEET_JSON_BASE =
  `https://docs.google.com/spreadsheets/d/${CFG.sheetId}/gviz/tq?tqx=out:json&sheet=`;

// localStorage（日付別ポイント & 正誤）
const LS_TODAY = `revquiz:points:${new Date().toISOString().slice(0,10)}`;
const LS_KEY = (subject) => `revquiz:${subject}:progress`;

// ===== DOM（nullセーフ） =====
const subjectPanel = document.getElementById('subjectPanel');
const subjectTitle = document.getElementById('subjectTitle');
const weekSelect   = document.getElementById('weekSelect');
const startBtn     = document.getElementById('startBtn');

const topPointEl   = document.getElementById('pointTodayTop');
const topResetBtn  = document.getElementById('resetTodayTop');
const pointTodayEl = document.getElementById('pointToday');
const resetTodayBtn= document.getElementById('resetToday');

const quizPanel = document.getElementById('quizPanel');
const backBtn = document.getElementById('backBtn');
const qIndexEl = document.getElementById('qIndex');
const qTotalEl = document.getElementById('qTotal');
const qWeekEl  = document.getElementById('qWeek');
const qImageWrap = document.getElementById('qImageWrap');
const qImage = document.getElementById('qImage');
const qText  = document.getElementById('qText');
const answerInput = document.getElementById('answerInput');
const submitBtn = document.getElementById('submitBtn');
const skipBtn   = document.getElementById('skipBtn');
const nextBtn   = document.getElementById('nextBtn');

// 状態
let currentSubject = null;
let allRows = [];       // 全件
let quizRows = [];      // 出題用
let order = 'random';   // random | sequential
let pool  = 'all';      // all | wrong_or_blank
let scope = 'all';      // all | byweek
let seqIndex = 0;
// 1問につきスコア加算は1回だけにするフラグ
let canGradeThisQuestion = true;

// ===== ポイント =====
const loadPointsToday = ()=> Number(localStorage.getItem(LS_TODAY) || '0');
const savePointsToday = (v)=> localStorage.setItem(LS_TODAY, String(v));
function updateTodayCounters(){
  const v = loadPointsToday();
  if(topPointEl)   topPointEl.textContent = v;
  if(pointTodayEl) pointTodayEl.textContent = v;
}
function addPoint(n=1){ savePointsToday(loadPointsToday()+n); updateTodayCounters(); }
function resetTodayPoints(){ savePointsToday(0); updateTodayCounters(); }
topResetBtn?.addEventListener('click', resetTodayPoints);
resetTodayBtn?.addEventListener('click', resetTodayPoints);
updateTodayCounters();

// ===== gviz JSON 読み込み（ヘッダー堅牢化） =====
async function fetchSheetRows(subject){
  const res  = await fetch(SHEET_JSON_BASE + encodeURIComponent(subject));
  const text = await res.text();
  const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}')+1));
  const table = json.table;

  // すべてのセル値を文字列に
  const grid = table.rows.map(r => (r.c||[]).map(c => (c && c.v != null ? String(c.v) : '')));

  // 1) col.label を試す
  let labels = (table.cols||[]).map(c => (c.label || '').trim());
  const want = new Set(["id","week","question","answer","alt_answers","image_url","enabled"]);
  let okCount = labels.filter(x => want.has(x)).length;

  // 2) ラベルに欲しいものが無ければ、先頭行をヘッダーとして再解釈
  if(okCount < 3 && grid.length){
    const cand = grid[0].map(s => (s||'').trim());
    const match = cand.filter(x => want.has(x)).length;
    if(match >= 3){
      labels = cand;
      grid.shift(); // データからヘッダー行を除外
    }else{
      // 3) 最後の手段：既知の並びを固定採用
      labels = ["id","week","question","answer","alt_answers","image_url","enabled"];
    }
  }

  // オブジェクト化
  const rows = grid.map(arr => {
    const obj = {};
    for(let i=0;i<labels.length;i++){
      const key = labels[i] || `col${i}`;
      obj[key] = (arr[i] || '').trim();
    }
    return obj;
  });
  return rows;
}

// enabledの解釈（空=有効、FALSE/0/NO/無効のみ無効）
function parseEnabled(v){
  const s=(v||'').toString().trim().toUpperCase();
  if(s==='') return true;
  if(['FALSE','F','0','OFF','NO','無効'].includes(s)) return false;
  return true;
}

function normalizeRow(r, idx){
  const map = CFG.columnMap;
  let id = (r[map.id]||'').trim();
  if(!id){
    // IDが空の行は安全な仮IDを付与（シート変更しても衝突しにくい）
    const w = (r[map.week]||'').trim() || 'ALL';
    id = `R${idx+1}:${w}`;
  }
  return {
    id,
    week: (r[map.week]||'').trim(),
    question: (r[map.question]||'').trim(),
    answer: (r[map.answer]||'').trim(),
    alt: (r[map.alt]||'').trim(),
    img: (r[map.img]||'').trim(),
    enabled: parseEnabled(r[map.enabled])
  };
}

// ===== 進捗 =====
function getProgress(subject){
  try{ return JSON.parse(localStorage.getItem(LS_KEY(subject))||'{}'); }
  catch(e){ return {}; }
}
function setProgress(subject, prog){ localStorage.setItem(LS_KEY(subject), JSON.stringify(prog)); }
function markResultLocal(subject, id, isCorrect){
  if(!id) return;
  const p = getProgress(subject);
  p[id] = isCorrect ? "TRUE" : "FALSE";
  setProgress(subject, p);
}

// ===== GAS送信（任意） =====
async function sendResultToGAS({subject, id, isCorrect, week}) {
  if(!CFG.gasUrl) return; // オプション
  try{
    await fetch(CFG.gasUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'mark',
        subject,
        id,
        week: week || '',
        result: isCorrect ? 'TRUE' : 'FALSE',
        ts: new Date().toISOString()
      })
    });
  }catch(e){
    // ネットワークエラー等は握りつぶし（学習を止めない）
    console.warn('GAS送信に失敗:', e);
  }
}
function markResult(subject, row, isCorrect){
  markResultLocal(subject, row.id, isCorrect);
  sendResultToGAS({subject, id: row.id, isCorrect, week: row.week});
}

// ===== フィルタ/並び替え =====
function filterByPool(rows){
  if(pool==='all') return rows;
  const prog = getProgress(currentSubject);
  return rows.filter(r => (prog[r.id]!=="TRUE")); // 未回答 or FALSE
}
function orderize(rows){
  if(order==='sequential') return rows.slice();
  return rows.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'ja', { numeric: true, sensitivity: 'base' });
}

// ===== セグメントUI =====
function setScope(newScope){
  scope = newScope;
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.scope===scope));
  if(weekSelect){
    const byWeek = (scope==='byweek');
    weekSelect.classList.toggle('hidden', !byWeek);
    weekSelect.disabled = !byWeek;
  }
}
document.querySelectorAll('.seg-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> setScope(btn.dataset.scope));
});

// ===== ラジオ =====
document.querySelectorAll('input[name="pool"]').forEach(r=>{
  r.addEventListener('change', ()=> pool = r.value);
});
document.querySelectorAll('input[name="order"]').forEach(r=>{
  r.addEventListener('change', ()=> order = r.value);
});

// ===== 科目タブ =====
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    currentSubject = btn.dataset.subject;
    if(subjectTitle) subjectTitle.textContent = `科目：${currentSubject}`;
    subjectPanel?.classList.remove('hidden');

    const poolRadio  = document.querySelector('input[name="pool"]:checked');
    const orderRadio = document.querySelector('input[name="order"]:checked');
    pool  = poolRadio ? poolRadio.value : 'all';
    order = orderRadio ? orderRadio.value : 'random';

    // ★ JSONで取得（改行安全）＋ 必須列チェック
    const raw = await fetchSheetRows(currentSubject);
    allRows = raw.map((r,i)=>normalizeRow(r,i))
                 .filter(r => r.question && r.answer && r.enabled !== false);

    // 週プルダウン（件数つき／自然順）
    const buckets = allRows.reduce((m, r) => {
      const w=(r.week||'').trim(); if(!w) return m;
      m[w]=(m[w]||0)+1; return m;
    },{});
    const forced = (CFG.forceWeeks && CFG.forceWeeks[currentSubject]) || null;
    const weeks = forced || Object.keys(buckets).sort(naturalCompare);

    if(weekSelect){
      weekSelect.disabled = false;
      weekSelect.innerHTML =
        `<option value="">授業回を選択</option>` +
        weeks.map(w=>`<option value="${w}">${w}${buckets[w]?`（${buckets[w]}問）`:''}</option>`).join('');
    }
    setScope('all');
    updateTodayCounters();
  });
});

// ===== スタート =====
startBtn?.addEventListener('click', ()=>{
  let rows = allRows;
  if(scope==='byweek'){
    const w = weekSelect?.value;
    if(!w){ alert('授業回を選んでください'); return; }
    rows = rows.filter(r=> r.week===w);
  }
  rows = filterByPool(rows);
  rows = orderize(rows);

  if(rows.length===0){ alert('出題対象がありません'); return; }

  quizRows = rows;
  seqIndex = 0;
  if(qTotalEl) qTotalEl.textContent = quizRows.length;
  showQuestion(0);
  subjectPanel?.classList.add('hidden');
  quizPanel?.classList.remove('hidden');
});

// ===== 画面遷移 =====
backBtn?.addEventListener('click', ()=>{
  quizPanel?.classList.add('hidden');
  subjectPanel?.classList.remove('hidden');
  updateTodayCounters();
});

// ===== 回答操作（Enterで採点/次へ） =====
submitBtn?.addEventListener('click', ()=> grade());
answerInput?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    const isNextVisible = nextBtn && !nextBtn.classList.contains('hidden');
    if(isNextVisible){ next(); } else { grade(); }
  }
});
// 入力欄にフォーカスがない時でも Enter で「次へ」
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && quizPanel && !quizPanel.classList.contains('hidden')){
    const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if(!isInput && nextBtn && !nextBtn.classList.contains('hidden')){
      e.preventDefault();
      next();
    }
  }
});

skipBtn?.addEventListener('click', ()=>{
  if(!canGradeThisQuestion) return; // 二重実行防止
  canGradeThisQuestion = false;
  showFeedback(false, `スキップしました。答え：${fmtAnswer(cur().answer)}`);
  markResult(currentSubject, cur(), false);
  nextBtn?.classList.remove('hidden');
});
nextBtn?.addEventListener('click', ()=> next());

// ===== 出題/採点 =====
function cur(){ return quizRows[seqIndex]; }

function showQuestion(idx){
  seqIndex = idx;
  canGradeThisQuestion = true; // ★この問題はまだ採点していない
  const row = cur();
  if(qIndexEl) qIndexEl.textContent = (idx+1);
  if(qWeekEl)  qWeekEl.textContent = row.week ? `（${row.week}）` : '';
  if(qText)    qText.textContent = row.question || '';

  if(row.img && qImage && qImageWrap){
    qImage.src = row.img;
    qImageWrap.classList.remove('hidden');
  }else{
    qImageWrap?.classList.add('hidden');
    if(qImage) qImage.removeAttribute('src');
  }

  if(answerInput){
    answerInput.value = '';
    answerInput.placeholder = 'ここにタイピング';
    answerInput.focus();
  }
  const fb = document.getElementById('feedback');
  if(fb) fb.textContent='';
  nextBtn?.classList.add('hidden');
}

function sanitize(s){ return (s||'').toString().trim().replace(/\s+/g,''); }
function normalizeKana(s){
  return s.normalize('NFKC')
          .replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function fmtAnswer(a){ return a; }

function grade(){
  if(!canGradeThisQuestion) return; // ★同一問題での二重加点をブロック
  canGradeThisQuestion = false;

  const row = cur();
  const input  = normalizeKana(sanitize(answerInput?.value));
  const target = normalizeKana(sanitize(row.answer));
  const alts = (row.alt||'')
    .split(/[\/|、,，．。]| or /i) // 区切り強化（全角句読点にも対応）
    .map(s=> normalizeKana(sanitize(s)))
    .filter(Boolean);
  const ok = input && (input===target || alts.includes(input));

  if(ok){
    showFeedback(true, '正解！+1P');
    addPoint(1);
    markResult(currentSubject, row, true);
  }else{
    const show = row.answer + (row.alt ? `（別解：${row.alt}）` : '');
    showFeedback(false, `ざんねん…　正解：${show}`);
    markResult(currentSubject, row, false);
  }

  // 採点後は入力を無効化して「次へ」に誘導（誤タップ防止）
  if(answerInput) answerInput.blur();
  nextBtn?.classList.remove('hidden');
}

function showFeedback(isOk, text){
  const fb = document.getElementById('feedback');
  if(!fb) return;
  fb.className = 'feedback '+(isOk?'ok':'ng');
  fb.textContent = text;
}

function next(){
  // 既に採点済みでないまま次へを押した場合は未正解扱いで記録（任意仕様）
  if(canGradeThisQuestion){
    canGradeThisQuestion = false;
    const row = cur();
    markResult(currentSubject, row, false);
  }

  if(seqIndex+1 < quizRows.length){
    showQuestion(seqIndex+1);
  }else{
    const fb = document.getElementById('feedback');
    if(fb){
      fb.className='feedback ok';
      fb.textContent='終了！おつかれさま！';
    }
    nextBtn?.classList.add('hidden');
    updateTodayCounters();
  }
}
