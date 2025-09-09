/***** 設定 *****/
const GAS_URL = "https://script.google.com/macros/s/AKfycbx9PKDGh-a5AkeSz5sPlJlCsJZSZGYa7iqCnIcLaCFAk1iHo0mi7T-RlLbZcTzWf9HBJw/exec";

// ここを差し替える ↓
const SHEET_ID = "1L3dUsXqIPQSAhZJE1VbduKXJeABrx2Ob3w1YfqXG4aA"; // ← 自分のシートIDに

const SUBJECTS = {
  "算数": { sheetName: "算数" },
  "国語": { sheetName: "国語" },
  "理科": { sheetName: "理科" },
  "社会": { sheetName: "社会" },
};


/***** 状態 *****/
const state = {
  subject: null,
  sheetName: null,
  rangeMode: "all",   // all | byWeek
  week: null,         // 例: "2025-W36"
  pool: "all",        // all | wrong_blank
  order: "seq",       // seq | shuffle
  questions: [],      // 絞り込み後の問題
  idx: 0,
  score: 0,
};

/***** ツール関数 *****/
const $ = (sel) => document.querySelector(sel);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const setText = (id, text) => ($(id).textContent = text);

function shuffleInPlace(arr){
  for (let i=arr.length-1;i>0;i--){
    const j = (Math.random()* (i+1))|0;
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

// CSVを使うならここをCSVパースに。今はJSON前提（配列）で実装。
async function fetchQuestions(subjectKey){
  const sheetName = SUBJECTS[subjectKey].sheetName;
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  try{
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`failed: ${url}`);
    const csv = await res.text();
    const rows = parseCSV(csv);
    return rows;
  }catch(e){
    console.warn(e);
    // フォールバック（最低限）
    return [
      {id:"G4M00001", week:"2025-W36", question:"3×4の答えは？", answer:"12", alt_answers:"12", image_url:"", enabled:""}
    ];
  }
}

async function setFlag({sheetName, id, result}){
  const body = JSON.stringify({ sheetName, id, result });
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" }, // ←ココ！
    body
  });
  return res.json(); // {status, sheet, row, col}
}

function normalizeAnswers(row){
  const base = (row.answer ?? "").toString().trim();
  const alts = (row.alt_answers ?? "")
    .toString()
    .split(/[、,;\/\s]+/)
    .map(s=>s.trim())
    .filter(Boolean);
  const set = new Set([base, ...alts]);
  return set;
}

function matchAnswer(row, userInput){
  const cand = normalizeAnswers(row);
  return cand.has(userInput.trim());
}

/***** 画面遷移とイベント *****/
function go(toId){
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(hide);
  show(toId);
}

// STEP1 科目
$("#step1").addEventListener("click", async (ev)=>{
  const btn = ev.target.closest("button[data-subject]");
  if(!btn) return;
  state.subject = btn.dataset.subject;
  state.sheetName = SUBJECTS[state.subject].sheetName;

  // データ取得 & 授業回（week）一覧の構築
  go("#loading");
  const all = await fetchQuestions(state.subject);
  state._all = all;
  const weeks = [...new Set(all.map(r=>r.week).filter(Boolean))].sort();
  const sel = $("#weekSelect");
  sel.innerHTML = weeks.map(w=>`<option value="${w}">${w}</option>`).join("");
  setText("#subjectLabel", state.subject);
  go("#step2");
});

// STEP2 範囲
document.querySelectorAll('input[name="range"]').forEach(r=>{
  r.addEventListener("change", ()=>{
    state.rangeMode = r.value;
    if(state.rangeMode === "byWeek"){
      show("#weekPicker");
    }else{
      hide("#weekPicker");
    }
  });
});
$("#toStep3").addEventListener("click", ()=>{
  state.rangeMode = document.querySelector('input[name="range"]:checked').value;
  if(state.rangeMode === "byWeek"){
    state.week = $("#weekSelect").value;
    setText("#rangeLabel", `授業回: ${state.week}`);
  }else{
    state.week = null;
    setText("#rangeLabel", "全授業");
  }
  go("#step3");
});
document.querySelectorAll('[data-back]').forEach(b=>{
  b.addEventListener("click", ()=> go(b.dataset.back));
});

// STEP3 出題対象
$("#toStep4").addEventListener("click", ()=>{
  state.pool = document.querySelector('input[name="pool"]:checked').value; // all | wrong_blank
  go("#step4");
});

// STEP4 出題順
$("#startQuiz").addEventListener("click", ()=>{
  state.order = document.querySelector('input[name="order"]:checked').value; // seq | shuffle

  // 絞り込み
  let rows = state._all.slice();
  if(state.rangeMode === "byWeek"){
    rows = rows.filter(r=>r.week === state.week);
  }
  if(state.pool === "wrong_blank"){
    rows = rows.filter(r => !(String(r.enabled).toUpperCase() === "TRUE" || r.enabled === true));
  }

  // 順序
  if(state.order === "shuffle") shuffleInPlace(rows);

  state.questions = rows;
  state.idx = 0;
  state.score = 0;
  setText("#score", "0");

  if(rows.length === 0){
    alert("出題対象が0件です。条件を変えてください。");
    go("#step3");
    return;
  }

  go("#quiz");
  renderQuestion();
});

/***** 出題・採点 *****/
function current(){ return state.questions[state.idx]; }

function renderQuestion(){
  const row = current();
  $("#feedback").innerHTML = "";
  $("#btnNext").classList.add("hidden");
  $("#answerInput").value = "";

  // 画像
  if(row.image_url){
    $("#img").src = row.image_url;
    $("#qImage").classList.remove("hidden");
  }else{
    $("#qImage").classList.add("hidden");
  }

  // 問題文
  $("#qText").textContent = row.question ?? "(問題文なし)";
  $("#answerInput").focus();
}

async function handleAnswer(kind){
  const row = current();
  let resultFlag = "BLANK";
  let feedbackHtml = "";

  if(kind === "skip"){
    resultFlag = "BLANK";
    feedbackHtml = `スキップしました。`;
  }else{
    const user = $("#answerInput").value;
    const ok = matchAnswer(row, user);
    if(ok){
      resultFlag = "TRUE";
      state.score++;
      setText("#score", String(state.score));
      feedbackHtml = `⭕ 正解！（答え：${row.answer}）`;
    }else{
      resultFlag = "FALSE";
      feedbackHtml = `❌ 不正解…（正答：${row.answer}）`;
    }
  }

  // 書き込み（id / sheetName / result）
  try{
    await setFlag({ sheetName: state.sheetName, id: row.id, result: resultFlag });
  }catch(e){
    console.warn("GAS書き込み失敗", e);
  }

  $("#feedback").innerHTML = feedbackHtml;
  $("#btnNext").classList.remove("hidden");
}

$("#btnAnswer").addEventListener("click", ()=> handleAnswer("answer"));
$("#btnSkip").addEventListener("click", ()=> handleAnswer("skip"));
$("#answerInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("#btnAnswer").click(); });

$("#btnNext").addEventListener("click", ()=>{
  state.idx++;
  if(state.idx >= state.questions.length){
    alert(`終了！ 正解数：${state.score} / ${state.questions.length}`);
    go("#step1");
  }else{
    renderQuestion();
  }
});
