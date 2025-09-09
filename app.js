const view = document.getElementById('view');

// ルーティングっぽく：科目を押すと「出題範囲の選択」画面へ
document.querySelector('nav.subjects').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-subject]');
  if(!btn) return;
  const subject = btn.dataset.subject; // "kokugo" | "sansu" | "rika" | "shakai"
  renderScopePicker(subject);
});

// 「全期間 / 授業回」を選ぶ最初の画面
function renderScopePicker(subject){
  const subjectLabel = {kokugo:'国語', sansu:'算数', rika:'理科', shakai:'社会'}[subject] ?? subject;
  view.innerHTML = `
    <div class="card">
      <h2>${subjectLabel}：出題範囲を選択</h2>
      <div class="select-row">
        <label>
          全期間 or 授業回：
          <select id="rangeMode">
            <option value="all">全期間</option>
            <option value="week">授業回を指定</option>
          </select>
        </label>
        <label>
          授業回（例：G4-C00 など）：
          <input id="weekCode" placeholder="例: G4-C00" style="width:160px" />
        </label>
      </div>

      <div class="select-row">
        <label>
          出題モード：
          <select id="filterMode">
            <option value="all">全問</option>
            <option value="miss">不正解＆未回答のみ</option>
          </select>
        </label>
        <label>
          出題順：
          <select id="orderMode">
            <option value="seq">上から順に</option>
            <option value="rand">ランダム</option>
          </select>
        </label>
      </div>

      <div class="select-row">
        <button id="startBtn">クイズ開始</button>
        <button id="backBtn">戻る</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').onclick = () => {
    view.innerHTML = '';
  };

  document.getElementById('startBtn').onclick = () => {
    const rangeMode = document.getElementById('rangeMode').value;
    const weekCode  = document.getElementById('weekCode').value.trim();
    const filterMode= document.getElementById('filterMode').value;
    const orderMode = document.getElementById('orderMode').value;

    // ここで次の「出題画面」を呼ぶ（データ取得は後で実装）
    renderQuiz(subject, {rangeMode, weekCode, filterMode, orderMode});
  };
}

// 出題画面（ひとまず空の枠だけ。次ステップで実装）
function renderQuiz(subject, opts){
  view.innerHTML = `
    <div class="card">
      <h2>出題：${subject}（${opts.rangeMode === 'all' ? '全期間' : opts.weekCode}）</h2>
      <p>ここに問題文・画像・タイピング入力欄が表示されます。</p>
      <div class="select-row">
        <button id="backToScope">出題範囲にもどる</button>
      </div>
    </div>
  `;
  document.getElementById('backToScope').onclick = () => renderScopePicker(subject);
}
