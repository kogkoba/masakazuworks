/***** 設定 *****/
const SHEET_ID = '1L3dUsXqIPQSAhZJE1VbduKXJeABrx2Ob3w1YfqXG4aA';

/***** ユーティリティ（JSON返却）*****/
function outJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetByName(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`シートが見つかりません: ${name}`);
  return sh;
}

/***** GET: 出題取得
 * /exec?action=get&sheetName=国語&pool=all|wrong_blank
*****/
function doGet(e) {
  try {
    const action = String(e.parameter.action || '').trim();
    if (action !== 'get') return outJSON({ ok:false, error:'unknown_action' });

    const sheetName = String(e.parameter.sheetName || '').trim();
    const pool      = String(e.parameter.pool || 'all').trim(); // all | wrong_blank

    const sh = getSheetByName(sheetName);
    const last = sh.getLastRow();
    if (last < 2) return outJSON({ ok:true, rows:[] });

    // A:G
    const values = sh.getRange(2, 1, last - 1, 7).getValues();

    const rows = values
      .filter(r => {
        if (pool === 'all') return true;
        if (pool === 'wrong_blank') {
          const g = r[6];
          const isTrue  = (g === true) || (String(g).toUpperCase() === 'TRUE');
          const isBlank = (g === '' || g === null);
          return isTrue || isBlank;
        }
        return true;
      })
      .map(r => ({
        id: String(r[0]),                 // A
        week: r[1],                       // B
        question: r[2],                   // C
        answer: String(r[3]),             // D
        alt_answers: String(r[4] || ''),  // E
        image_url: String(r[5] || ''),    // F
        wrong_flag: String(r[6] || '')    // G
      }));

    return outJSON({ ok:true, rows });
  } catch (err) {
    return outJSON({ ok:false, error: String(err) });
  }
}

/***** POST: 結果ログ（正解→空白 / 不正解→TRUE）*****/
function doPost(e) {
  try {
    const data = parsePayload(e);  // JSONでもformでもOKにする
    const action = String(data.action || '').trim();
    if (action !== 'log') return outJSON({ ok:false, error:'unknown_action' });

    const sheetName = String(data.sheetName || '').trim();
    const id        = String(data.id || '').trim();
    const correct   = !!data.correct;  // parsePayload側で厳密変換済み
    if (!sheetName || !id) return outJSON({ ok:false, error:'bad_params' });

    const sh = getSheetByName(sheetName);
    const last = sh.getLastRow();
    if (last < 2) return outJSON({ ok:false, error:'no_rows' });

    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const idx = ids.indexOf(id);
    if (idx === -1) return outJSON({ ok:false, error:`id_not_found:${id}` });

    const row = 2 + idx;
    const colG = 7;
    sh.getRange(row, colG).setValue(correct ? '' : true);  // 正解＝解除, 不正解＝TRUE
    SpreadsheetApp.flush();

    return outJSON({ ok:true, row, id, correct });
  } catch (err) {
    return outJSON({ ok:false, error: String(err) });
  }
}

/***** 受信データを堅牢にパース（JSON/text/plain/form全部OK）*****/
function parsePayload(e){
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (_) {}
  const p = (e && e.parameter) || {};

  const toBool = (v) => {
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1';
  };

  const pick = (k, def=null) => (body[k] !== undefined ? body[k] : (p[k] !== undefined ? p[k] : def));

  return {
    action:   pick('action', ''),
    sheetName:pick('sheetName', ''),
    id:       pick('id', ''),
    correct:  toBool(pick('correct', false)),
  };
}
