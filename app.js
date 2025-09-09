/***** 設定 *****/
const GAS_URL = "https://script.google.com/macros/s/AKfycbx9PKDGh-a5AkeSz5sPlJlCsJZSZGYa7iqCnIcLaCFAk1iHo0mi7T-RlLbZcTzWf9HBJw/exec";

// あなたのスプレッドシートID
const SHEET_ID = "1L3dUsXqIPQSAhZJE1VbduKXJeABrx2Ob3w1YfqXG4aA";

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
  rangeMode: "all",
  week: null,
  pool: "all",
  order: "seq",
  questions: [],
  idx: 0,
  score: 0,
  phase: "answering",
};

/***** ツール関数 *****/
const $ = (sel) => document.querySelector(sel);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");
const setText = (id, text) => ($(id).textContent = text);

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// === GViz JSON 読み込み ===
async function fetchQuestions(subjectKey){
  const sheetName = SUBJECTS[subjectKey].sheetName;
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  try{
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`failed: ${url}`);
    const text = await res.text();
    return parseGvizJson(text);
  }catch(e){
    console.warn(e);
    return [
      {id:"demo1", week:"demo", question:"3×4=?", answer:"12", alt_answers:"12", image_url:"", enabled:""}
    ];
  }
}

// === GViz JSON パース ===
function parseGvizJson(text){
  const m = text.match(/setResponse\(([\s\S]+)\);/);
  if(!m) return [];
  const data = JSON.parse(m[1]);
  const cols = data.table.cols.map(c => (c.label || "").toString().trim().toLowerCase());
  const out = [];
  for (const r of data.table.rows){
    const obj = {};
    (r.c || []).forEach((cell, idx) => {
      const key = cols[idx] || `col${idx}`;
      let v = cell && (cell.v != null ? cell.v : cell.f);
      if (v == null) v = "";
      obj[key] = String(v).trim();
    });
    if (Object.values(obj).some(v => v !== "")) out.push(obj);
  }
  return out;
}

/***** GAS書き込み *****/
async function setFlag({sheetName, id, result}){
  const body = JSON.stringify({ sheetName, id, result });
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body
  });
  return res.json();
}

function normalizeAnswers(row){
  const base = (row.answer ?? "").toString().trim();
  const alts = (row.alt_answers ?? "")
    .toString()
    .split(/[、,;\/\s]+/)
    .map(s=>s.trim())
    .filter(Boolean);
  return new Set([base, ...alts]);
}
function matchAnswer(row, userInput){
  return normalizeAnswers(row).has(userInput.trim());
}

/***** 画面遷移 *****/
function go(toId){
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(hide);
  show(toId);
}

// STEP1 科目選択
$("#step1").addEventListener("click", async (ev)=>{
  const btn = ev.target.closest("button[data-subject]");
  if(!btn) return;
  state.subject = btn.dataset.subject;
  state.sheetName = SUBJECTS[state.subject].sheetName;

  go("#loading");
  const all = await fetchQuestions(state.subject);
  state._all = all;

  // 授業回（week列）
  const weeks = [...new Set(all.map(r => (r["week"] || "").trim()).filter(Boolean))].sort();
  const sel = $("#weekSelect");
  if(sel){
    sel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join("");
    if(weeks.length === 0){
      sel.innerHTML = `<option value="" disabled>(授業回なし)</option>`;
    }
  }
  setText("#subjectLabel", state.subject);
  go("#step2");
});

// STEP2 範囲
document.querySelectorAll('input[name="range"]').forEach(r=>{
  r.addEventListener("change", ()=>{
    state.rangeMode = r.value;
    if (state.rangeMode === "byWeek") show("#weekPicker");
    else hide("#weekPicker");
  });
});
$("#toStep3").addEventListener("click", ()=>{
  state.rangeMode = document.querySelector('input[name="range"]:checked').value;
  if (state.rangeMode === "byWeek") {
    const sel = $("#weekSelect");
    state.week = sel ? sel.value : null;
    setText("#rangeLabel", state.week ? `授業回: ${state.week}` : "授業回を選択");
  } else {
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
  state.pool = document.querySelector('input[name="pool"]:checked').value;
  go("#step4");
});

// STEP4 出題順
$("#startQuiz").addEventListener("click", ()=>{
  state.order = document.querySelector('input[name="order"]:checked').value;

  let rows = state._all.slice();
  if(state.rangeMode === "byWeek"){
    rows = rows.filter(r => (r["week"] || "") === state.week);
  }
  if(state.pool === "wrong_blank"){
    rows = rows.filter(r => !(String(r.enabled).toUpperCase() === "TRUE" || r.enabled === true));
  }
  if(state.order === "shuffle") shuffleInPlace(rows);

  state.questions = rows;
  state.idx = 0;
  state.score = 0;
  setText("#score","0");

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
  state.phase = "answering";
  $("#feedback").innerHTML = "";
  $("#btnNext").classList.add("hidden");
  $("#btnAnswer").classList.remove("hidden");
  $("#btnAnswer").disabled = false;
  $("#answerInput").disabled = false;
  $("#answerInput").value = "";
  if(row.image_url){
    $("#img").src = row.image_url;
    $("#qImage").classList.remove("hidden");
  }else{
    $("#qImage").classList.add("hidden");
  }
  $("#qText").textContent = row.question ?? "(問題文なし)";
  $("#answerInput").focus();
}
async function handleAnswer(kind){
  if(state.phase !== "answering") return;
  const row = current();
  let resultFlag = "BLANK", feedbackHtml="";
  if(kind === "skip"){
    resultFlag="BLANK"; feedbackHtml="スキップしました。";
  }else{
    const user=$("#answerInput").value;
    if(matchAnswer(row,user)){
      resultFlag="TRUE"; state.score++; setText("#score",String(state.score));
      feedbackHtml=`⭕ 正解！（答え：${row.answer}）`;
    }else{
      resultFlag="FALSE"; feedbackHtml=`❌ 不正解…（正答：${row.answer}）`;
    }
  }
  state.phase="review";
  $("#feedback").innerHTML=feedbackHtml;
  $("#btnAnswer").classList.add("hidden");
  $("#btnAnswer").disabled=true;
  $("#answerInput").disabled=true;
  $("#btnNext").classList.remove("hidden");
  try{ await setFlag({ sheetName: state.sheetName, id: row.id, result: resultFlag }); }
  catch(e){ console.warn("GAS書き込み失敗",e); }
}
$("#btnAnswer").addEventListener("click",()=>handleAnswer("answer"));
$("#btnSkip").addEventListener("click",()=>handleAnswer("skip"));
document.addEventListener("keydown",(e)=>{
  if(e.key!=="Enter")return;
  if(e.shiftKey && state.phase==="answering"){ $("#btnSkip").click(); e.preventDefault(); return; }
  if(state.phase==="answering"){ $("#btnAnswer").click(); }
  else if(state.phase==="review"){ $("#btnNext").click(); }
  e.preventDefault();
});
$("#btnNext").addEventListener("click",()=>{
  state.idx++;
  if(state.idx>=state.questions.length){
    alert(`終了！ 正解数：${state.score} / ${state.questions.length}`);
    go("#step1");
  }else{
    renderQuestion();
  }
});
