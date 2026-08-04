// questions.js

function toSimpleFraction(decimal) {
  const pairs = [[1,2],[3,2],[1,3],[2,3],[1,4],[3,4]];
  for (const [n, d] of pairs) {
    if (Math.abs(Math.abs(decimal) - n / d) < 0.001) {
      return decimal < 0 ? [-n, d] : [n, d];
    }
  }
  return null;
}

function formatSlopeLatex(slope) {
  if (slope === 1)  return '';
  if (slope === -1) return '-';
  const frac = toSimpleFraction(slope);
  if (frac) {
    const [n, d] = frac;
    return n < 0
      ? `-\\dfrac{${Math.abs(n)}}{${d}}`
      : `\\dfrac{${n}}{${d}}`;
  }
  return String(slope);
}

function formatEquationLatex(slope, intercept) {
  const sp = formatSlopeLatex(slope);
  let ip = '';
  if (intercept > 0) ip = ` + ${intercept}`;
  else if (intercept < 0) ip = ` - ${Math.abs(intercept)}`;
  return `\\( y = ${sp}x${ip} \\)`;
}

// 注意: スラッシュ分数（1/2 など）は画面のどこにも出さない方針のため、
// テキスト用の分数フォーマッタは廃止した。表示は main.js の slopeHTML()（縦分数）を使う。

// 問題バンク（基本問題4問 + 追加問題）
const QUESTION_BANK = [
  { slope: 1,    intercept:  2 },  // 基本問題1（正の整数の傾き）
  { slope: 2,    intercept: -3 },  // 基本問題2（正の整数の傾き・負の切片）
  { slope: -2,   intercept:  1 },  // 基本問題3（負の整数の傾き）
  { slope: -1/2, intercept: -2 },  // 基本問題4（分数の傾き）
  { slope: 3,    intercept: -2 },
  { slope: -1,   intercept:  3 },
  { slope: 1/2,  intercept:  2 },
  { slope: -1/2, intercept: -1 },
  { slope: 3/2,  intercept: -2 },
  { slope: -3/2, intercept:  2 },
  { slope: 1/4,  intercept: -1 },
  { slope: -1/4, intercept:  1 },
  { slope: 3/4,  intercept:  0 },
  { slope: -3/4, intercept: -2 },
  { slope: 2,    intercept:  3 },
  { slope: -3,   intercept:  1 },
  { slope: -2,   intercept: -3 },
  { slope: 1,    intercept: -2 },
  { slope: -1,   intercept: -1 },
  { slope: 1/3,  intercept:  2 },
  { slope: 2/3,  intercept: -1 },
  { slope: -2/3, intercept:  3 },
  { slope: 3,    intercept:  0 },
  { slope: -2,   intercept:  0 },
  { slope: 1/2,  intercept: -3 },
];

function shuffled(list) {
  return list.slice().sort(() => Math.random() - 0.5);
}

function hasFractionSlope(q) {
  return !Number.isInteger(q.slope);
}

function generateSession(count = 5, course = 'draw') {
  const normalizedCourse = course === 'read' ? 'read' : 'draw';
  // 基本問題4問から2問は必ず出す
  const selected = shuffled(QUESTION_BANK.slice(0, 4)).slice(0, 2);
  const rest = shuffled(QUESTION_BANK.slice(4));
  const minFractional = Math.min(2, count);

  for (const q of rest) {
    const fractionCount = selected.filter(hasFractionSlope).length;
    if (fractionCount >= minFractional) break;
    if (hasFractionSlope(q) && !selected.includes(q)) selected.push(q);
  }

  // 右上がりだけに偏らないよう、負の傾きを最低1問は含める。
  if (!selected.some(q => q.slope < 0)) {
    const negative = rest.find(q => q.slope < 0 && !selected.includes(q));
    if (negative) selected.push(negative);
  }

  for (const q of rest) {
    if (selected.length >= count) break;
    if (!selected.includes(q)) selected.push(q);
  }

  const session = selected.slice(0, count);
  const ordered = normalizedCourse === 'read'
    ? session.sort((a, b) => {
        const rank = q => (Number.isInteger(q.slope) ? 0 : 2) + (q.slope < 0 ? 1 : 0);
        return rank(a) - rank(b);
      })
    : shuffled(session);

  return ordered.map((q, i) => {
    const item = {
      ...q,
      course: normalizedCourse,
      answerKind: normalizedCourse === 'read' ? 'equation' : 'graph',
      sessionId: i,
    };
    item.id = questionId(item);
    return item;
  });
}

// 問題の一意なID。復習モードでの重複防止に使う（値ベースなので出題順に依存しない）
function questionId(q) {
  const course = q.course === 'read' ? 'read' : 'draw';
  const kind = q.answerKind || (course === 'read' ? 'equation' : 'graph');
  return `q_${course}_${kind}_${q.slope}_${q.intercept}`;
}

// 間違えた問題（不正解＋ギブアップ）だけを抽出する。IDで重複を除く。
function buildReviewSet(answers) {
  const seen = new Set();
  const out  = [];
  for (const a of (answers || [])) {
    if (!a || a.correct || !a.q) continue;
    const id = a.q.id || questionId(a.q);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      slope: a.q.slope,
      intercept: a.q.intercept,
      course: a.q.course === 'read' ? 'read' : 'draw',
      answerKind: a.q.answerKind || (a.q.course === 'read' ? 'equation' : 'graph'),
      id,
    });
  }
  return out.map((q, i) => ({ ...q, sessionId: i }));
}
