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
  rangeMode: "all",   // all | byWeek
  week: null,         // 例: "2025-W36"
  pool: "all",        // all | wrong_blank
  order: "seq",       // seq | shuffle
  questions: [],      // 絞り込み後の問題
  idx: 0,
  score: 0,
  phase: "answering", // "answering"（解答入力中）| "review"（採点後/次待ち）
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

// === CSVをシートから読み込む ===
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
    return [
      {id:"G4M00001", week:"2025-W36", question:"3×4の答えは？", answer:"12", alt_answers:"12", image_url:"", enabled:""}
    ];
  }
}

// === CSVを配列に変換 ===
function parseCSV(text){
  text = text.replace(/\r/g, "");
  const rows = [];
  let i = 0, field = "", row = [], inQ = false;

  const pushField = () => { row.push(field); field=""; };
  const pushRow   = () => { rows.push(row); row=[]; };

  while(i < text.length){
    const c = text[i];
    if(inQ){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if(c === '"'){ inQ = true; i++; continue; }
    if(c === ","){ pushField(); i++; continue; }
    if(c === "\n"){ pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  if(field.length || row.length){ pushField(); pushRow(); }

  if(rows.length === 0) return [];
  const header = rows[0].map(s => s.trim());
  return rows.slice(1).filter(r => r.some(v => v !== "")).map(cols => {
    const obj = {};
    header.forEach((h, idx) => obj[h] = (cols[idx] ?? "").trim());
    return obj;
  });
}

/***** GAS書き込み *****/
async function setFlag({sheetName, id, result}){
  const body = JSON.stringify({ sheetName, id, result });
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" }, // プリフライト回避
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

/***** 画面遷移 *****/
function go(toId){
  ["#step1","#step2","#step3","#step4","#quiz","#loading"].forEach(hide);
  show(toId);
}

// STEP1 科目選択
// STEP1 科目選択
$("#step1").addEventListener("click", async (ev)=>{
  const btn = ev.target.closest("button[data-subject]");
  if(!btn) return;
  state.subject = btn.dataset.subject;
  state.sheetName = SUBJECTS[state.subject].sheetName;

  go("#loading");

  const all = await fetchQuestions(state.subject);
  state._all = all;

  // 週（授業回）候補を作成
  const weeks = [...new Set(all.map(r => (r.week ?? "").trim()).filter(Boolean))].sort();

  const sel = $("#weekSelect");
  const picker = $("#weekPicker");
  if (!sel)  console.error("#weekSelect が見つかりません");
  if (!picker) console.error("#weekPicker が見つかりません");

  if (sel) {
    sel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join("");
    // 何も無ければダミー（空）を1つ
    if (weeks.length === 0) {
      sel.innerHTML = `<option value="" disabled>(授業回なし)</option>`;
    }
  }

  setText("#subjectLabel", state.subject);

  // byWeek が選ばれているなら、ここで一度表示しておく
  if (picker) {
    if (state.rangeMode === "byWeek" && weeks.length > 0) {
      show("#weekPicker");
    } else {
      hide("#weekPicker");
    }
  }

  go("#step2");
});

// STEP2 範囲選択（ラジオの切替で表示/非表示を確実に切り替える）
document.querySelectorAll('input[name="range"]').forEach(r=>{
  r.addEventListener("change", ()=>{
    state.rangeMode = r.value;
    const picker = $("#weekPicker");
    if (!picker) return; // 要素が無ければ何もしない

    if (state.rangeMode === "byWeek") {
      show("#weekPicker");
    } else {
      hide("#weekPicker");
    }
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
  state.phase = "answering";

  $("#feedback").innerHTML = "";
  $("#btnNext").classList.add("hidden");
  $("#btnAnswer").classList.remove("hidden");
  $("#btnAnswer").disabled = false;
  $("#answerInput").disabled = false;
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
  // すでに採点済みなら無視（Enter連打防止）
  if (state.phase !== "answering") return;

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

  // 採点後は「次へ」待ちモードに
  state.phase = "review";
  $("#feedback").innerHTML = feedbackHtml;
  $("#btnAnswer").classList.add("hidden");
  $("#btnAnswer").disabled = true;
  $("#answerInput").disabled = true;
  $("#btnNext").classList.remove("hidden");

  // 書き込み
  try{
    await setFlag({ sheetName: state.sheetName, id: row.id, result: resultFlag });
  }catch(e){
    console.warn("GAS書き込み失敗", e);
  }
}

$("#btnAnswer").addEventListener("click", ()=> handleAnswer("answer"));
$("#btnSkip").addEventListener("click", ()=> handleAnswer("skip"));

// エンターキーでの動作を一括管理
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  // Shift+Enter でスキップ（任意）
  if (e.shiftKey && state.phase === "answering") {
    $("#btnSkip").click();
    e.preventDefault();
    return;
  }

  if (state.phase === "answering") {
    $("#btnAnswer").click();  // 採点
  } else if (state.phase === "review") {
    $("#btnNext").click();    // 次の問題へ
  }
  e.preventDefault();
});

// 次の問題へ
$("#btnNext").addEventListener("click", ()=>{
  state.idx++;
  if(state.idx >= state.questions.length){
    alert(`終了！ 正解数：${state.score} / ${state.questions.length}`);
    go("#step1");
  }else{
    renderQuestion(); // ← ここで phase を "answering" に戻す
  }
});
