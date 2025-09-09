const CFG = window.APP_CONFIG;
const view = document.getElementById("view");

// 科目クリック
document.querySelector("nav.subjects")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-subject]");
  if (!btn) return;
  const key = btn.dataset.subject;
  const subject = {kokugo:"国語",sansu:"算数",rika:"理科",shakai:"社会"}[key] || key;
  renderSubjectTop(subject);
});

// 科目トップ（タブ：全授業 / 授業を選ぶ）
function renderSubjectTop(subject){
  view.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">${subject}</h2>

      <div class="tabbar" style="display:flex;gap:8px;margin:8px 0 12px 0">
        <button class="tab active" data-tab="all">全授業</button>
        <button class="tab" data-tab="pick">授業を選ぶ</button>
      </div>

      <div id="tabContent"></div>

      <div class="select-row" style="margin-top:12px">
        <button id="backBtn">戻る</button>
      </div>
    </div>
  `;

  document.getElementById("backBtn").onclick = () => (view.innerHTML = "");
  renderAllLessonsPane(subject);
  view.querySelectorAll(".tabbar .tab").forEach(b=>{
    b.onclick = () => {
      view.querySelectorAll(".tabbar .tab").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      if (b.dataset.tab === "all") renderAllLessonsPane(subject);
      else renderPickLessonPane(subject);
    };
  });
}

// 全授業タブ（このSTEPではUIだけ）
function renderAllLessonsPane(subject){
  const box = document.getElementById("tabContent");
  box.innerHTML = `
    <div class="pane">
      <div class="select-row">
        <label>出題モード：
          <select id="filter_all">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>出題順：
          <select id="order_all">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>
      <div class="select-row">
        <button id="play_all">プレイする</button>
      </div>
    </div>
  `;
  // 次のSTEPでここにCSV読み込み→出題開始を実装
  document.getElementById("play_all").onclick = () => alert("次のSTEPで実装：全授業でプレイ");
}

// 授業を選ぶタブ（UIだけ・weekのプルダウンは次のSTEPで埋めます）
function renderPickLessonPane(subject){
  const box = document.getElementById("tabContent");
  box.innerHTML = `
    <div class="pane">
      <div class="select-row">
        <label>授業回（week）：
          <select id="week_pick"><option>（次のSTEPで自動取得）</option></select>
        </label>
        <label>出題モード：
          <select id="filter_pick">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>出題順：
          <select id="order_pick">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>
      <div class="select-row">
        <button id="play_pick">プレイする</button>
      </div>
    </div>
  `;
  document.getElementById("play_pick").onclick = () => alert("次のSTEPで実装：授業を選んでプレイ");
}
