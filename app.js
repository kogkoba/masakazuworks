// ===== 設定 =====
const CFG = window.APP_CONFIG;
// JSONで読む（セル改行でも安全）
const SHEET_JSON_BASE =
  `https://docs.google.com/spreadsheets/d/${CFG.sheetId}/gviz/tq?tqx=out:json&sheet=`;

// localStorageキー（日付別の4科合計ポイント）
const LS_TODAY = `revquiz:points:${new Date().toISOString().slice(0,10)}`;
// 科目ごとの正誤フラグ保存
const LS_KEY = (subject) => `revquiz:${subject}:progress`; // { [id]: "TRUE"|"FALSE"|"" }

// ===== DOM取得（nullセーフ） =====
const subjectPanel = document.getElementById('subjectPanel');
const subjectTitle = document.getElementById('subjectTitle');
const weekSelect   = document.getElementById('weekSelect');
const startBtn     = document.getElementById('startBtn');

const topPointEl = document.getElementById('pointTodayTop');
const topResetBtn = document.getElementById('resetTodayTop');
const pointTodayEl = document.getElementById('pointToday');
const resetTodayBtn = document.getElementById('resetToday');

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

let currentSubject = null;
let allRows = [];       // 全件
let quizRows = [];      // 出題用
let order = 'random';   // random | sequential
let pool  = 'all';      // all | wrong_or_blank
let scope = 'all';      // all | byweek
let seqIndex = 0;       // 順番モード用

// ===== ポイント管理 =====
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

// ===== gviz JSON 読み込み =====
async function fetchSheetRows(subject){
  const res  = await fetch(SHEET_JSON_BASE + encodeURIComponent(subject));
  const text = await res.text();
  // レスポンスは google.visualization.Query.setResponse({...}) 形式
  const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}')+1));
  const cols = json.table.cols.map(c => (c.label || c.id || '').trim());

  // 1行目はヘッダー行として扱われるので、そのまま使える
  const rows = json.table.rows.map(r => {
    const obj = {};
    (r.c || []).forEach((cell, i) => {
      obj[cols[i] || `col${i}`] = (cell && cell.v != null ? String(cell.v) : '').trim();
    });
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

function normalizeRow(r){
  return {
    id: (r[CFG.columnMap.id]||'').trim(),
    week: (r[CFG.columnMap.week]||'').trim(),
    question: (r[CFG.columnMap.question]||'').trim(),
    answer: (r[CFG.columnMap.answer]||'').trim(),
    alt: (r[CFG.columnMap.alt]||'').trim(),
    img: (r[CFG.columnMap.img]||'').trim(),
    enabled: parseEnabled(r[CFG.columnMap.enabled])
  };
}

// ===== 正誤フラグ（ブラウザ保存） =====
function getProgress(subject){
  try{ return JSON.parse(localStorage.getItem(LS_KEY(subject))||'{}'); }
  catch(e){ return {}; }
}
function setProgress(subject, prog){ localStorage.setItem(LS_KEY(subject), JSON.stringify(prog)); }
function markResult(subject, id, isCorrect){
  if(!id) return;
  const p = getProgress(subject);
  p[id] = isCorrect ? "TRUE" : "FALSE";
  setProgress(subject, p);
}

// ===== 絞り込み・並び替え =====
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
  return a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' });
}

// ===== セグメントUI =====
function setScope(newScope){
  scope = newScope;
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.scope===scope));
  weekSelect?.classList.toggle('hidden', scope!=='byweek');
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

    // 選択状態
    const poolRadio  = document.querySelector('input[name="pool"]:checked');
    const orderRadio = document.querySelector('input[name="order"]:checked');
    pool  = poolRadio ? poolRadio.value : 'all';
    order = orderRadio ? orderRadio.value : 'random';

    // ★ JSONで安全に取得（改行OK）
    const raw = await fetchSheetRows(currentSubject);
    // 必須：question がある・enabled が無効でない
    allRows = raw.map(normalizeRow)
                 .filter(r => r.question && r.enabled !== false);

    // 授業回プルダウン（件数つき）
    const buckets = allRows.reduce((m, r) => {
      const w=(r.week||'').trim(); if(!w) return m;
      m[w]=(m[w]||0)+1; return m;
    },{});
    const forced = (CFG.forceWeeks && CFG.forceWeeks[currentSubject]) || null;
    const weeks = forced || Object.keys(buckets).sort(naturalCompare);
    if(weekSelect){
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

// ===== 回答操作 =====
submitBtn?.addEventListener('click', ()=> grade());
answerInput?.addEventListener('keydown', (e)=> { if(e.key==='Enter'){ grade(); }});
skipBtn?.addEventListener('click', ()=>{
  showFeedback(false, `スキップしました。答え：${fmtAnswer(cur().answer)}`);
  markResult(currentSubject, cur().id, false);
  nextBtn?.classList.remove('hidden');
});
nextBtn?.addEventListener('click', ()=> next());

// ===== 出題/採点 =====
function cur(){ return quizRows[seqIndex]; }

function showQuestion(idx){
  seqIndex = idx;
  const row = cur();
  if(qIndexEl) qIndexEl.textContent = (idx+1);
  if(qWeekEl)  qWeekEl.textContent = row.week ? `（${row.week}）` : '';
  if(qText)    qText.textContent = row.question || '';

  if(row.img && qImage && qImageWrap){
    qImage.src = row.img;
    qImageWrap.classList.remove('hidden');
  }else{
    qImageWrap?.classList.add('hidden');
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
          .replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)); // カナ→ひら
}
function fmtAnswer(a){ return a; }

function grade(){
  const row = cur();
  const input  = normalizeKana(sanitize(answerInput?.value));
  const target = normalizeKana(sanitize(row.answer));
  const alts = (row.alt||'')
    .split(/[\/|、,]| or /i)
    .map(s=> normalizeKana(sanitize(s)))
    .filter(Boolean);
  const ok = input && (input===target || alts.includes(input));

  if(ok){
    showFeedback(true, '正解！+1P');
    addPoint(1);
    markResult(currentSubject, row.id, true);
  }else{
    const show = row.answer + (row.alt ? `（別解：${row.alt}）` : '');
    showFeedback(false, `ざんねん…　正解：${show}`);
    markResult(currentSubject, row.id, false);
  }
  nextBtn?.classList.remove('hidden');
}

function showFeedback(isOk, text){
  const fb = document.getElementById('feedback');
  if(!fb) return;
  fb.className = 'feedback '+(isOk?'ok':'ng');
  fb.textContent = text;
}

function next(){
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

