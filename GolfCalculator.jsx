import { useState, useEffect, useCallback, Fragment } from "react";

const INITIAL_STATE = {
  screen: "setup",
  players: ["", "", "", ""],
  rate: 100,
  oRate: 100,
  npRate: 100,
  npCarry: false,
  gsRate: 0,
  handicaps: [0, 0, 0, 0],
  hcMe: 0,
  hcHalfPt: 0,
  hcTotalPt: 0,
  vegasOptions: { cap9: false, birdieReverse: false, fixedPairs: false, push: false, simpleCalc: false, headTie: false },
  scores: Array.from({ length: 18 }, () => [0, 0, 0, 0]),
  pars: Array.from({ length: 18 }, () => 4),
  teeOrders: Array.from({ length: 18 }, () => [0, 1, 2, 3]),
  nearpin: Array.from({ length: 18 }, () => -1),
  olympic: Array.from({ length: 18 }, () => ({
    entries: [
      { rank: "", active: false },
      { rank: "", active: false },
      { rank: "", active: false },
      { rank: "", active: false },
    ],
  })),
};

function loadState() {
  try {
    const s = localStorage.getItem("golf-calc-v4");
    if (s) {
      const p = JSON.parse(s);
      if (!p.teeOrders) p.teeOrders = Array.from({ length: 18 }, () => [0, 1, 2, 3]);
      if (!p.pars) p.pars = Array.from({ length: 18 }, () => 4);
      if (!p.oRate) p.oRate = p.rate || 100;
      if (!p.npRate) p.npRate = 100;
      if (p.npCarry === undefined) p.npCarry = false;
      if (p.gsRate === undefined) p.gsRate = 0;
      if (!p.handicaps) p.handicaps = [0, 0, 0, 0];
      if (p.hcMe === undefined) p.hcMe = 0;
      if (p.hcHalfPt === undefined) p.hcHalfPt = 0;
      if (p.hcTotalPt === undefined) p.hcTotalPt = 0;
      if (!p.nearpin) p.nearpin = Array.from({ length: 18 }, () => -1);
      return p;
    }
  } catch {}
  return null;
}

function saveState(state) {
  try { localStorage.setItem("golf-calc-v4", JSON.stringify(state)); } catch {}
}

function loadCourses() {
  try {
    const c = localStorage.getItem("golf-courses");
    if (c) return JSON.parse(c);
  } catch {}
  return [];
}

function saveCourses(courses) {
  try { localStorage.setItem("golf-courses", JSON.stringify(courses)); } catch {}
}

export default function GolfCalculator() {
  const [state, setState] = useState(() => loadState() || INITIAL_STATE);
  useEffect(() => { saveState(state); }, [state]);
  const up = useCallback((patch) => setState((p) => ({ ...p, ...patch })), []);

  const { screen, players, rate, oRate, npRate, npCarry, gsRate, handicaps, hcMe, hcHalfPt, hcTotalPt, vegasOptions: vo, scores, pars, teeOrders, nearpin, olympic } = state;

  // --- Par ---
  function cyclePar(hole) {
    const np = [...pars];
    np[hole] = np[hole] === 3 ? 4 : np[hole] === 4 ? 5 : 3;
    up({ pars: np });
  }

  // --- Tee Order ---
  function handleScore(hole, pi, val) {
    const ns = scores.map((h, i) => i === hole ? h.map((s2, j) => j === pi ? val : s2) : [...h]);
    const no = teeOrders.map((o) => [...o]);
    for (let h = 0; h < 18; h++) {
      const sc = ns[h];
      if (sc.some((v) => v === 0)) continue;
      const cur = no[h];
      const sorted = [...Array(4).keys()].sort((a, b) => sc[a] !== sc[b] ? sc[a] - sc[b] : cur.indexOf(a) - cur.indexOf(b));
      const next = h === 17 ? 0 : h + 1;
      if (ns[next].every((v) => v === 0)) no[next] = sorted;
    }
    up({ scores: ns, teeOrders: no });
  }

  function swapTee(hole, i1, i2) {
    const no = teeOrders.map((o) => [...o]);
    [no[hole][i1], no[hole][i2]] = [no[hole][i2], no[hole][i1]];
    up({ teeOrders: no });
  }

  // --- Teams ---
  function getTeams(h) {
    if (vo.fixedPairs) return { tA: [0, 3], tB: [1, 2] };
    const o = teeOrders[h];
    return { tA: [o[0], o[3]], tB: [o[1], o[2]] };
  }

  // --- Vegas ---
  function combo(s1, s2) {
    let a = vo.cap9 ? Math.min(s1, 9) : s1;
    let b = vo.cap9 ? Math.min(s2, 9) : s2;
    return Math.min(a, b) * 10 + Math.max(a, b);
  }

  function vegasHole(h) {
    const sc = scores[h];
    if (sc.some((v) => v === 0)) return null;
    const { tA, tB } = getTeams(h);
    let sA = combo(sc[tA[0]], sc[tA[1]]);
    let sB = combo(sc[tB[0]], sc[tB[1]]);
    if (vo.birdieReverse) {
      const par = pars[h];
      if (sc[tA[0]] < par || sc[tA[1]] < par) sB = (sB % 10) * 10 + Math.floor(sB / 10);
      if (sc[tB[0]] < par || sc[tB[1]] < par) sA = (sA % 10) * 10 + Math.floor(sA / 10);
    }
    return { tA, tB, sA, sB, diff: sA - sB };
  }

  function vegasCum() {
    let cum = 0, pN = 0;
    const res = [];
    for (let i = 0; i < 18; i++) {
      const r = vegasHole(i);
      if (!r) { res.push(null); continue; }
      // Simple mode: just +1/-1 for win/loss. Normal: divide by 10 and ceil
      let d = r.diff === 0 ? 0 : vo.simpleCalc
        ? Math.sign(r.diff)
        : Math.sign(r.diff) * Math.ceil(Math.abs(r.diff) / 10);
      // Head tie: if tens digits are same, treat as tie (simpleCalc only)
      if (vo.simpleCalc && vo.headTie && Math.floor(r.sA / 10) === Math.floor(r.sB / 10)) d = 0;
      if (vo.push && d === 0) { pN++; res.push({ ...r, rounded: 0, pushed: true, cum }); continue; }
      if (vo.push && pN > 0) { d = Math.sign(d) * (Math.abs(d) + pN); pN = 0; }
      cum += d;
      res.push({ ...r, rounded: d, pushed: false, cum });
    }
    return res;
  }

  // --- Olympic ---
  const RP = { diamond: 5, gold: 4, silver: 3, bronze: 2, iron: 1 };
  function oPts(s = 0, e = 18) {
    const pts = [0, 0, 0, 0];
    for (let h = s; h < e; h++) olympic[h].entries.forEach((en, i) => { if (en.active && en.rank) pts[i] += RP[en.rank] || 0; });
    return pts;
  }

  // --- Personal Score ---
  function personalScores() {
    return players.map((_, pi) => {
      let f = 0, b = 0, fCount = 0, bCount = 0;
      let fPar = 0, bPar = 0;
      for (let h = 0; h < 9; h++) { if (scores[h][pi] > 0) { f += scores[h][pi]; fCount++; fPar += pars[h]; } }
      for (let h = 9; h < 18; h++) { if (scores[h][pi] > 0) { b += scores[h][pi]; bCount++; bPar += pars[h]; } }
      return { front: f, back: b, total: f + b, fCount, bCount, fPar, bPar, totalPar: fPar + bPar };
    });
  }

  // --- Settlement ---
  function calcSettle() {
    const vr = vegasCum();
    // Vegas settlement
    let vSettlements = [];
    const vPay = [0, 0, 0, 0];
    const vPts = [0, 0, 0, 0]; // per-player points for simpleCalc display
    if (vo.simpleCalc) {
      for (let h = 0; h < 18; h++) {
        const r = vr[h];
        if (!r || r.pushed) continue;
        const d = r.rounded;
        const winTeam = d < 0 ? r.tA : r.tB;
        const mult = Math.abs(d);
        winTeam.forEach((pi) => { vPts[pi] += mult; });
      }
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          const d = vPts[i] - vPts[j];
          if (d !== 0) {
            vSettlements.push({ from: d > 0 ? j : i, to: d > 0 ? i : j, amt: Math.abs(d) * rate, pts: Math.abs(d) });
            vPay[d > 0 ? i : j] += Math.abs(d) * rate;
            vPay[d > 0 ? j : i] -= Math.abs(d) * rate;
          }
        }
    } else {
      for (let h = 0; h < 18; h++) {
        const r = vr[h];
        if (!r || r.pushed) continue;
        const d = r.rounded;
        r.tA.forEach((pi) => { vPay[pi] -= d * rate; });
        r.tB.forEach((pi) => { vPay[pi] += d * rate; });
      }
    }
    const oP = oPts();
    const oS = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const d = oP[i] - oP[j];
        if (d !== 0) oS.push({ from: d > 0 ? j : i, to: d > 0 ? i : j, amt: Math.abs(d) * oRate, pts: Math.abs(d) });
      }
    // Grand Slam: player who achieved all 5 ranks gets gsRate from each other
    const gsAchieved = [false, false, false, false];
    if (gsRate > 0) {
      players.forEach((_, pi) => {
        const ranks = new Set();
        for (let h = 0; h < 18; h++) {
          const e = olympic[h].entries[pi];
          if (e.active && e.rank) ranks.add(e.rank);
        }
        if (ranks.size === 5) gsAchieved[pi] = true;
      });
    }
    const gsPay = [0, 0, 0, 0];
    gsAchieved.forEach((achieved, i) => {
      if (achieved) {
        gsPay[i] += gsRate * 3;
        players.forEach((_, j) => { if (j !== i) gsPay[j] -= gsRate; });
      }
    });
    // Nearpin: +1 point to the team of the winner (npRate per person)
    // -1 = not set, -2 = 該当なし (carry over), 0-3 = winner
    const npCount = [0, 0, 0, 0];
    const npPay = [0, 0, 0, 0];
    let npCarryCount = 0;
    for (let h = 0; h < 18; h++) {
      if (pars[h] !== 3) continue; // only par 3
      const w = nearpin[h];
      if (w === -1) continue; // not set
      if (w === -2) { // 該当なし
        if (npCarry) npCarryCount++;
        continue;
      }
      npCount[w]++;
      const mult = 1 + npCarryCount;
      npCarryCount = 0;
      const { tA, tB } = getTeams(h);
      const winTeam = tA.includes(w) ? tA : tB;
      const loseTeam = tA.includes(w) ? tB : tA;
      winTeam.forEach((pi) => { npPay[pi] += npRate * mult; });
      loseTeam.forEach((pi) => { npPay[pi] -= npRate * mult; });
    }
    // Handicap match: me vs each opponent only
    const hcMatches = [];
    const hcPay = [0, 0, 0, 0];
    if (hcHalfPt > 0 || hcTotalPt > 0) {
      const pScores = players.map((_, pi) => {
        let out = 0, inn = 0, outC = 0, inC = 0;
        for (let h = 0; h < 9; h++) { if (scores[h][pi] > 0) { out += scores[h][pi]; outC++; } }
        for (let h = 9; h < 18; h++) { if (scores[h][pi] > 0) { inn += scores[h][pi]; inC++; } }
        return { out, inn, total: out + inn, outC, inC };
      });
      const me = hcMe;
      for (let j = 0; j < 4; j++) {
        if (j === me) continue;
        const hcDiff = handicaps[me] - handicaps[j];
        const m = { p1: me, p2: j, hcDiff, results: [] };
        if (pScores[me].outC > 0 && pScores[j].outC > 0) {
          const rawDiff = pScores[me].out - pScores[j].out;
          const adjDiff = rawDiff - hcDiff;
          m.results.push({ label: "OUT", diff: adjDiff, winner: adjDiff < 0 ? me : adjDiff > 0 ? j : -1 });
        }
        if (pScores[me].inC > 0 && pScores[j].inC > 0) {
          const rawDiff = pScores[me].inn - pScores[j].inn;
          const adjDiff = rawDiff - hcDiff;
          m.results.push({ label: "IN", diff: adjDiff, winner: adjDiff < 0 ? me : adjDiff > 0 ? j : -1 });
        }
        if (pScores[me].outC + pScores[me].inC > 0 && pScores[j].outC + pScores[j].inC > 0) {
          const rawDiff = pScores[me].total - pScores[j].total;
          const adjDiff = rawDiff - hcDiff;
          m.results.push({ label: "トータル", diff: adjDiff, winner: adjDiff < 0 ? me : adjDiff > 0 ? j : -1 });
        }
        hcMatches.push(m);
        m.results.forEach((r2) => {
          const pt = r2.label === "トータル" ? hcTotalPt : hcHalfPt;
          if (r2.winner >= 0 && pt > 0) {
            hcPay[r2.winner] += pt;
            const loser = r2.winner === me ? j : me;
            hcPay[loser] -= pt;
          }
        });
      }
    }
    const tot = players.map((_, i) => {
      const v = Math.ceil(vPay[i]);
      let o = 0;
      oS.forEach((x) => { if (x.to === i) o += x.amt; if (x.from === i) o -= x.amt; });
      const np = npPay[i];
      const gs = gsPay[i];
      const hc = hcPay[i];
      return { v, o: Math.ceil(o), np, gs, hc, t: Math.ceil(v + o + np + gs) };
    });
    return { oP, oS, npCount, vSettlements, vPts, gsAchieved, hcMatches, tot };
  }

  if (screen === "setup")
    return <Setup players={players} rate={rate} oRate={oRate} npRate={npRate} npCarry={npCarry} gsRate={gsRate} handicaps={handicaps} hcMe={hcMe} hcHalfPt={hcHalfPt} hcTotalPt={hcTotalPt} pars={pars} vo={vo}
      onStart={(p, r, or2, nr, nc, gs, hc, hm, hhp, htp, v, coursePars) => up({
        players: p, rate: r, oRate: or2, npRate: nr, npCarry: nc, gsRate: gs, handicaps: hc, hcMe: hm, hcHalfPt: hhp, hcTotalPt: htp, vegasOptions: v, screen: "play",
        scores: Array.from({ length: 18 }, () => [0, 0, 0, 0]),
        pars: coursePars,
        teeOrders: Array.from({ length: 18 }, () => [0, 1, 2, 3]),
        nearpin: Array.from({ length: 18 }, () => -1),
        olympic: Array.from({ length: 18 }, () => ({
          entries: [{ rank: "", active: false }, { rank: "", active: false }, { rank: "", active: false }, { rank: "", active: false }],
        })),
      })}
      onResume={() => up({ screen: "play" })}
      hasData={scores.some((h) => h.some((s2) => s2 > 0))} />;

  if (screen === "settle")
    return <Settle players={players} rate={rate} oRate={oRate} npRate={npRate} gsRate={gsRate} handicaps={handicaps} hcHalfPt={hcHalfPt} hcTotalPt={hcTotalPt} nearpin={nearpin} settlement={calcSettle()} personal={personalScores()} pars={pars}
      onBack={() => up({ screen: "play" })}
      onReset={() => { localStorage.removeItem("golf-calc-v4"); setState(INITIAL_STATE); }} />;

  return <Play {...{ players, scores, pars, teeOrders, olympic, nearpin, vo, rate, oRate, npRate, npCarry }}
    getTeams={getTeams} vCum={vegasCum()} oPts={oPts} personal={personalScores()}
    onScore={handleScore} onSwap={swapTee} onPar={cyclePar}
    onNearpin={(h, pi) => {
      const nn = [...nearpin];
      nn[h] = nn[h] === pi ? -1 : pi;
      up({ nearpin: nn });
    }}
    onOly={(h, pi, changes) => {
      const nO = olympic.map((ho, i) => {
        if (i !== h) return { ...ho, entries: ho.entries.map((e) => ({ ...e })) };
        return { ...ho, entries: ho.entries.map((e, j) => j !== pi ? { ...e } : { ...e, ...changes }) };
      });
      up({ olympic: nO });
    }}
    onSettle={() => up({ screen: "settle" })}
    onSettings={() => up({ screen: "setup" })} />;
}

/* ======== COLORS & STYLES ======== */
const C = {
  bg: "#0a1f0e", card: "#122617", alt: "#1a3520",
  brd: "#2a5435", gold: "#d4a843", goldL: "#f0d078", goldD: "#8a6e2a",
  txt: "#e8f0ea", dim: "#8aaa90", mut: "#5a7a60",
  ok: "#4aaf5a", red: "#e05555", blue: "#5588cc", dia: "#88ccff", w: "#fff",
};

const S = {
  wrap: { minHeight: "100vh", background: `linear-gradient(180deg,${C.bg} 0%,#0d2812 50%,${C.bg} 100%)`, color: C.txt, fontFamily: "'Helvetica Neue','Hiragino Sans','Yu Gothic',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 100 },
  hdr: { background: `linear-gradient(135deg,${C.card} 0%,#0d2812 100%)`, borderBottom: `1px solid ${C.brd}`, padding: "20px 16px 16px", textAlign: "center" },
  card: { background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, margin: "12px", padding: 16 },
  inp: { width: "100%", background: C.alt, border: `1px solid ${C.brd}`, borderRadius: 8, color: C.txt, padding: "10px 12px", fontSize: 15, outline: "none", boxSizing: "border-box" },
  btn: { background: `linear-gradient(135deg,${C.gold},${C.goldD})`, color: C.bg, border: "none", borderRadius: 10, padding: "14px 24px", fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%", letterSpacing: 1 },
  btnO: { background: "transparent", color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" },
  sInp: { width: 52, height: 44, background: C.alt, border: `1px solid ${C.brd}`, borderRadius: 8, color: C.txt, fontSize: 20, fontWeight: 700, textAlign: "center", outline: "none" },
  tag: { display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
};

function Tog({ v, set }) {
  return (
    <div onClick={() => set(!v)} style={{ width: 44, height: 24, borderRadius: 12, background: v ? C.ok : C.alt, border: `1px solid ${v ? C.ok : C.brd}`, position: "relative", cursor: "pointer", transition: "all .2s", flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: C.w, position: "absolute", top: 2, left: v ? 22 : 2, transition: "left .2s" }} />
    </div>
  );
}

function TB({ t }) {
  return <span style={{ ...S.tag, background: t === "A" ? C.brd : "#1a3050", color: t === "A" ? C.goldL : C.blue }}>{t}</span>;
}

function ParBtn({ par, onClick }) {
  const colors = { 3: "#cc6688", 4: C.mut, 5: "#6688cc" };
  const labels = { 3: "S", 4: "M", 5: "L" };
  return (
    <button onClick={onClick} style={{
      background: `${colors[par]}25`, border: `1px solid ${colors[par]}`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
      color: colors[par], cursor: "pointer", letterSpacing: 1,
    }}>
      {labels[par]} Par{par}
    </button>
  );
}

/* ======== HANDICAP MEMO ======== */
function HandicapMemo() {
  const [memo, setMemo] = useState(() => {
    try { return localStorage.getItem("golf-handi-memo") || ""; } catch { return ""; }
  });
  const [open, setOpen] = useState(false);

  function handleChange(val) {
    setMemo(val);
    try { localStorage.setItem("golf-handi-memo", val); } catch {}
  }

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, letterSpacing: 1 }}>📝 ハンデメモ</div>
        <span style={{ fontSize: 12, color: C.mut }}>{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 6 }}>ハンデや取り決めを自由にメモ（自動保存）</div>
          <textarea
            style={{ ...S.inp, minHeight: 100, resize: "vertical", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit" }}
            placeholder={"例：\n田中さん ハンデ +5\n佐藤さん ハンデ -3"}
            value={memo}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ======== SETUP ======== */
function Setup({ players, rate, oRate, npRate, npCarry: initNpCarry, gsRate: initGsRate, handicaps: initHc, hcMe: initHcMe, hcHalfPt: initHhp, hcTotalPt: initHtp, pars: initPars, vo: vegOpts, onStart, onResume, hasData }) {
  const [p, setP] = useState([...players]);
  const [r, setR] = useState(rate);
  const [or2, setOr] = useState(oRate);
  const [nr, setNr] = useState(npRate);
  const [nc, setNc] = useState(initNpCarry);
  const [gs, setGs] = useState(initGsRate);
  const [hc, setHc] = useState([...initHc]);
  const [hcStr, setHcStr] = useState(initHc.map((v) => v === 0 ? "" : String(v)));
  const [hm, setHm] = useState(initHcMe);
  const [hhp, setHhp] = useState(initHhp);
  const [htp, setHtp] = useState(initHtp);
  const [vo, setVo] = useState({ ...vegOpts });
  const [coursePars, setCoursePars] = useState([...initPars]);
  const [courses, setCourses] = useState(() => loadCourses());
  const [newCourseName, setNewCourseName] = useState("");
  const [showCourseEdit, setShowCourseEdit] = useState(false);
  const ok = p.every((n) => n.trim());

  function handleSaveCourse() {
    if (!newCourseName.trim()) return;
    const updated = [...courses.filter((c) => c.name !== newCourseName.trim()), { name: newCourseName.trim(), pars: [...coursePars] }];
    setCourses(updated);
    saveCourses(updated);
    setNewCourseName("");
  }

  function handleLoadCourse(course) {
    setCoursePars([...course.pars]);
  }

  function handleDeleteCourse(name) {
    const updated = courses.filter((c) => c.name !== name);
    setCourses(updated);
    saveCourses(updated);
  }

  return (
    <div style={S.wrap}>
      <div style={S.hdr}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.gold, letterSpacing: 2, margin: 0 }}>GOLF SCORER</h1>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 4, marginTop: 4, textTransform: "uppercase" }}>Las Vegas &amp; Olympic</div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 8, letterSpacing: 1 }}>👤 プレイヤー登録</div>
        <div style={{ fontSize: 11, color: C.mut, marginBottom: 10, lineHeight: 1.5 }}>登録順 = 1H目の打順。2H以降はスコアで自動更新。</div>
        {p.map((name, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>打順 {i + 1}</span><TB t={i === 0 || i === 3 ? "A" : "B"} />
            </div>
            <input style={S.inp} placeholder="名前を入力..." value={name} onChange={(e) => { const n = [...p]; n[i] = e.target.value; setP(n); }} />
          </div>
        ))}
      </div>

      {/* Course Settings */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>⛳ コース設定</div>

        {/* Saved Courses */}
        {courses.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>保存済みコース:</div>
            {courses.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", marginBottom: 4, background: C.alt, borderRadius: 8, border: `1px solid ${C.brd}` }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleLoadCourse(c)} style={{ background: `${C.gold}25`, border: `1px solid ${C.gold}`, borderRadius: 6, color: C.gold, fontSize: 11, fontWeight: 600, padding: "4px 10px", cursor: "pointer" }}>読込</button>
                  <button onClick={() => handleDeleteCourse(c.name)} style={{ background: "transparent", border: `1px solid ${C.red}50`, borderRadius: 6, color: C.red, fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Current Par Display */}
        <button onClick={() => setShowCourseEdit(!showCourseEdit)} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 8, textDecoration: "underline" }}>
          {showCourseEdit ? "Par設定を閉じる ▲" : "Par設定を開く ▼"}
        </button>

        {showCourseEdit && (
          <div style={{ marginBottom: 12 }}>
            {[0, 9].map((start) => (
              <div key={start} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.mut, marginBottom: 4 }}>{start === 0 ? "OUT (1-9)" : "IN (10-18)"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 3 }}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const h = start + i;
                    const par = coursePars[h];
                    const colors3 = { 3: "#cc6688", 4: C.mut, 5: "#6688cc" };
                    return (
                      <button key={h} onClick={() => { const np = [...coursePars]; np[h] = par === 3 ? 4 : par === 4 ? 5 : 3; setCoursePars(np); }}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0", borderRadius: 6, border: `1px solid ${colors3[par]}60`, background: `${colors3[par]}15`, cursor: "pointer", color: colors3[par] }}>
                        <span style={{ fontSize: 9, color: C.mut }}>{h + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{par}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save Course */}
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...S.inp, flex: 1, fontSize: 13, padding: "8px 10px" }} placeholder="コース名を入力して保存..." value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} />
          <button onClick={handleSaveCourse} disabled={!newCourseName.trim()} style={{ background: C.gold, color: C.bg, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, padding: "8px 14px", cursor: "pointer", opacity: newCourseName.trim() ? 1 : 0.4, whiteSpace: "nowrap" }}>保存</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>💰 ポイント設定</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.goldL, marginBottom: 6, fontWeight: 500 }}>🎰 ラスベガス</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: C.dim }}>1点 =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 100 }} value={r || ""} onChange={(e) => setR(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 14, color: C.dim }}>ポイント</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.goldL, marginBottom: 6, fontWeight: 500 }}>🏅 オリンピック</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: C.dim }}>1点 =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 100 }} value={or2 || ""} onChange={(e) => setOr(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 14, color: C.dim }}>ポイント</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.goldL, marginBottom: 6, fontWeight: 500 }}>🎯 ニアピン</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: C.dim }}>1回 =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 100 }} value={nr || ""} onChange={(e) => setNr(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 14, color: C.dim }}>ポイント</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div><div style={{ fontSize: 13, fontWeight: 500 }}>持越し</div><div style={{ fontSize: 11, color: C.dim }}>該当なしの場合、次のPar3に繰越</div></div>
            <Tog v={nc} set={setNc} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.goldL, marginBottom: 6, fontWeight: 500 }}>🏆 グランドスラム</div>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 6 }}>オリンピック全種類(💎🥇🥈🥉🔩)達成ボーナス</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: C.dim }}>達成 =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 100 }} value={gs || ""} onChange={(e) => setGs(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 14, color: C.dim }}>ポイント</span>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🎰 ラスベガス オプション</div>
        {[
          { k: "cap9", l: "10打以上 → 9打計算", d: "ダブルスコア防止" },
          { k: "birdieReverse", l: "バーディー逆転", d: "相手チームの桁を入れ替え" },
          { k: "fixedPairs", l: "固定ペア", d: "打順が変わってもペアを変えない" },
          { k: "push", l: "プッシュ", d: "同点は次ホールに繰越" },
          { k: "simpleCalc", l: "単純計算", d: "勝ったチームに1点追加" },
          { k: "headTie", l: "頭同スコア持越し", d: "単純計算時、十の位が同じなら持越し" },
        ].map(({ k, l, d }) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.brd}22` }}>
            <div><div style={{ fontSize: 14, fontWeight: 500 }}>{l}</div><div style={{ fontSize: 11, color: C.dim }}>{d}</div></div>
            <Tog v={vo[k]} set={(v) => setVo({ ...vo, [k]: v })} />
          </div>
        ))}
      </div>

      {/* Handicap Match */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🏌️ ハンデマッチ</div>

        {/* Self selector */}
        <div style={{ fontSize: 11, color: C.mut, marginBottom: 6 }}>自分を選択:</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {p.map((name, i) => (
            <button key={i} onClick={() => setHm(i)} style={{ flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 12, fontWeight: hm === i ? 700 : 400, border: `1px solid ${hm === i ? C.gold : C.brd}`, background: hm === i ? `${C.gold}25` : "transparent", color: hm === i ? C.gold : C.mut, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hm === i ? "⭐ " : ""}{name || `P${i + 1}`}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.mut, marginBottom: 10, lineHeight: 1.5 }}>相手のハンデを設定。＋はあげる、−は貰う。</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {p.map((name, i) => {
            if (i === hm) return null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, color: C.dim, width: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{name || `P${i + 1}`}</span>
                <button onClick={() => { const nh = [...hc]; nh[i]--; setHc(nh); }}
                  style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.brd}`, background: C.alt, color: C.txt, fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>−</button>
                <div style={{ width: 36, textAlign: "center", fontSize: 18, fontWeight: 700, color: hc[i] > 0 ? C.ok : hc[i] < 0 ? C.red : C.dim }}>{hc[i]}</div>
                <button onClick={() => { const nh = [...hc]; nh[i]++; setHc(nh); }}
                  style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.brd}`, background: C.alt, color: C.txt, fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>＋</button>
              </div>
            );
          })}
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.dim }}>ハーフ勝ち =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 80, padding: "6px 8px" }} value={hhp || ""} onChange={(e) => setHhp(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 13, color: C.dim }}>pt</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.dim }}>トータル勝ち =</span>
            <input type="number" step="100" onFocus={(e) => e.target.select()} style={{ ...S.inp, width: 80, padding: "6px 8px" }} value={htp || ""} onChange={(e) => setHtp(parseInt(e.target.value) || 0)} />
            <span style={{ fontSize: 13, color: C.dim }}>pt</span>
          </div>
        </div>
      </div>

      {/* Handicap Memo */}
      <HandicapMemo />

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={{ ...S.btn, opacity: ok ? 1 : 0.4 }} disabled={!ok} onClick={() => {
          if (hasData && !confirm("前回のデータは削除されますが宜しいですか？")) return;
          onStart(p, r, or2, nr, nc, gs, hc, hm, hhp, htp, vo, coursePars);
        }}>スタート ⛳</button>
        {hasData && <button style={S.btnO} onClick={onResume}>前回のデータを再開</button>}
      </div>
    </div>
  );
}

/* ======== PLAY ======== */

function HoleScoreEntry({ players, order, teamA, scores, par, onScore }) {
  const [sel, setSel] = useState(null); // selected player index
  const [val, setVal] = useState(par);

  function handleSelect(pi) {
    if (sel === pi) { setSel(null); return; }
    setSel(pi);
    setVal(scores[pi] > 0 ? scores[pi] : par);
  }

  function handleSubmit() {
    if (sel === null) return;
    onScore(sel, val);
    // Move to next player without score
    const currentOrderIdx = order.indexOf(sel);
    let next = null;
    for (let i = 1; i <= 4; i++) {
      const ni = order[(currentOrderIdx + i) % 4];
      if (scores[ni] === 0 || (ni === sel && val === 0)) { next = ni; break; }
    }
    if (next !== null && next !== sel) {
      setSel(next);
      setVal(par);
    } else {
      setSel(null);
    }
  }

  return (
    <div>
      {/* Player score grid - tap to select/edit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, textAlign: "center" }}>
        {order.map((pi) => {
          const isSel = sel === pi;
          const hasScore = scores[pi] > 0;
          return (
            <button key={pi} onClick={() => handleSelect(pi)}
              style={{ padding: "6px 4px", borderRadius: 8, cursor: "pointer", border: `2px solid ${isSel ? C.gold : hasScore ? `${C.ok}60` : C.brd}`, background: isSel ? `${C.gold}20` : hasScore ? `${C.ok}10` : C.alt, transition: "all 0.15s" }}>
              <div style={{ fontSize: 10, color: teamA.includes(pi) ? C.goldL : C.blue, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{players[pi]}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: hasScore ? C.txt : C.mut }}>{hasScore ? scores[pi] : "−"}</div>
            </button>
          );
        })}
      </div>

      {/* Central input - shown when player selected */}
      {sel !== null && (
        <div style={{ marginTop: 10, padding: "12px", background: C.alt, borderRadius: 10, border: `1px solid ${C.gold}40` }}>
          <div style={{ textAlign: "center", fontSize: 12, color: C.gold, fontWeight: 600, marginBottom: 8 }}>
            {players[sel]} のスコア
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <button onClick={() => { if (val > 1) setVal(val - 1); }}
              style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${C.brd}`, background: C.card, color: C.txt, fontSize: 24, fontWeight: 700, cursor: "pointer" }}>−</button>
            <div style={{ width: 64, textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.txt }}>{val}</div>
              <div style={{ fontSize: 10, color: val === par ? C.dim : val < par ? C.ok : C.red, fontWeight: 600 }}>
                {val === par ? "PAR" : val < par ? `${val - par}` : `+${val - par}`}
              </div>
            </div>
            <button onClick={() => { if (val < 20) setVal(val + 1); }}
              style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${C.brd}`, background: C.card, color: C.txt, fontSize: 24, fontWeight: 700, cursor: "pointer" }}>＋</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setSel(null)}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.mut, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
            <button onClick={handleSubmit}
              style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${C.gold},${C.goldD})`, color: C.bg, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>確定 ✓</button>
          </div>
        </div>
      )}
    </div>
  );
}

const RANKS = {
  diamond: { l: "💎", c: C.dia, p: 5 },
  gold: { l: "🥇", c: "#ffd700", p: 4 },
  silver: { l: "🥈", c: "#c0c0c0", p: 3 },
  bronze: { l: "🥉", c: "#cd7f32", p: 2 },
  iron: { l: "🔩", c: "#888", p: 1 },
};

function Play({ players, scores, pars, teeOrders, olympic, nearpin, vo, rate, oRate, npRate, npCarry, getTeams, vCum, oPts, personal, onScore, onSwap, onPar, onNearpin, onOly, onSettle, onSettings }) {
  const [tab, setTab] = useState("vegas");
  const [half, setHalf] = useState(0);
  const [editH, setEditH] = useState(null);

  const hs = half * 9;
  const oAll = oPts();
  const oF = oPts(0, 9);
  const oB = oPts(9, 18);

  return (
    <div style={S.wrap}>
      <div style={S.hdr}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", padding: 4 }} onClick={onSettings}>⚙️</button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: 2, margin: 0 }}>GOLF SCORER</h1>
          <button style={{ background: C.gold, color: C.bg, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 11, padding: "6px 12px", cursor: "pointer" }} onClick={onSettle}>精算</button>
        </div>
      </div>

      {/* Half */}
      <div style={{ display: "flex", margin: "12px 12px 0", background: C.card, borderRadius: 10, border: `1px solid ${C.brd}`, overflow: "hidden" }}>
        {["OUT (1-9)", "IN (10-18)"].map((l, i) => (
          <button key={i} onClick={() => setHalf(i)} style={{ flex: 1, padding: 10, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", background: half === i ? C.gold : "transparent", color: half === i ? C.bg : C.dim, transition: "all .2s" }}>{l}</button>
        ))}
      </div>

      {/* Tab */}
      <div style={{ display: "flex", margin: "8px 12px 0", gap: 6 }}>
        {[{ id: "vegas", l: "🎰 ラスベガス" }, { id: "olympic", l: "🏅 オリンピック" }, { id: "summary", l: "📊 集計" }].map(({ id, l }) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 600, border: `1px solid ${tab === id ? C.gold : C.brd}`, borderRadius: 8, cursor: "pointer", background: tab === id ? `${C.gold}20` : "transparent", color: tab === id ? C.gold : C.dim }}>{l}</button>
        ))}
      </div>

      {/* ===== VEGAS ===== */}
      {tab === "vegas" && <>
        {Array.from({ length: 9 }, (_, idx) => {
          const h = hs + idx;
          const r = vCum[h];
          const order = teeOrders[h];
          const { tA, tB } = getTeams(h);
          const isEd = editH === h;

          return (
            <div key={h} style={{ ...S.card, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, minHeight: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...S.tag, background: C.gold, color: C.bg, fontSize: 13, fontWeight: 700, padding: "4px 10px" }}>{h + 1}</span>
                  <ParBtn par={pars[h]} onClick={() => onPar(h)} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 80, textAlign: "right" }}>
                  {r && !r.pushed && (
                    <span style={{ color: r.rounded < 0 ? C.ok : r.rounded > 0 ? C.red : C.dim }}>
                      {r.sA} vs {r.sB}
                      <span style={{ marginLeft: 8, fontSize: 12 }}>({r.rounded > 0 ? "+" : ""}{-r.rounded})</span>
                    </span>
                  )}
                  {r && r.pushed && <span style={{ ...S.tag, background: "#553a00", color: C.goldL, fontSize: 11 }}>PUSH</span>}
                </div>
              </div>

              {!vo.fixedPairs && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "6px 8px", background: `${C.alt}80`, borderRadius: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    {order.map((pi, pos) => (
                      <span key={pos} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <span style={{ color: C.mut, fontSize: 10, fontWeight: 700 }}>{pos + 1}.</span>
                        <span style={{ color: tA.includes(pi) ? C.goldL : C.blue, fontWeight: 500 }}>{players[pi]}</span>
                        {pos < 3 && <span style={{ color: C.mut, margin: "0 1px" }}>→</span>}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => setEditH(isEd ? null : h)} style={{ background: "none", border: "none", color: C.mut, fontSize: 14, cursor: "pointer", padding: "2px 4px" }}>✏️</button>
                </div>
              )}

              {isEd && !vo.fixedPairs && (
                <div style={{ marginBottom: 10, padding: 8, background: C.alt, borderRadius: 8, border: `1px solid ${C.brd}` }}>
                  <div style={{ fontSize: 11, color: C.gold, marginBottom: 8, fontWeight: 600 }}>打順を変更（タップで右と入替）</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {order.map((pi, pos) => (
                      <button key={pos} onClick={() => onSwap(h, pos, (pos + 1) % 4)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: `1px solid ${tA.includes(pi) ? C.gold : C.blue}40`, background: `${tA.includes(pi) ? C.gold : C.blue}15`, color: tA.includes(pi) ? C.goldL : C.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: C.mut }}>{pos + 1}番</div>
                        {players[pi]}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: C.mut, marginTop: 6, textAlign: "center" }}>
                    <TB t="A" /> {players[tA[0]]} &amp; {players[tA[1]]}{"　"}<TB t="B" /> {players[tB[0]]} &amp; {players[tB[1]]}
                  </div>
                </div>
              )}

              <HoleScoreEntry
                players={players}
                order={order}
                teamA={tA}
                scores={scores[h]}
                par={pars[h]}
                onScore={(pi, v) => onScore(h, pi, v)}
              />

              {/* Nearpin */}
              {pars[h] === 3 && (
                <div style={{ marginTop: 8, padding: "6px 8px", background: `${C.alt}80`, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: C.mut }}>🎯 ニアピン</span>
                    {npCarry && nearpin[h] === -2 && <span style={{ fontSize: 10, color: "#e8a030", fontWeight: 600 }}>→ 次に持越し</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {players.map((name, pi) => (
                      <button key={pi} onClick={() => onNearpin(h, pi)}
                        style={{ flex: 1, padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: nearpin[h] === pi ? 700 : 400, cursor: "pointer", border: `1px solid ${nearpin[h] === pi ? "#e8a030" : C.brd}`, background: nearpin[h] === pi ? "#e8a03025" : "transparent", color: nearpin[h] === pi ? "#e8a030" : C.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nearpin[h] === pi ? "🎯 " : ""}{name}
                      </button>
                    ))}
                    <button onClick={() => onNearpin(h, -2)}
                      style={{ padding: "5px 6px", borderRadius: 6, fontSize: 10, fontWeight: nearpin[h] === -2 ? 700 : 400, cursor: "pointer", border: `1px solid ${nearpin[h] === -2 ? C.red : C.brd}`, background: nearpin[h] === -2 ? `${C.red}20` : "transparent", color: nearpin[h] === -2 ? C.red : C.mut, whiteSpace: "nowrap", flexShrink: 0 }}>
                      なし
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ ...S.card, background: "#0d2015" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.goldL, marginBottom: 12, letterSpacing: 1 }}>ラスベガス 個人累計</div>
          {(() => {
            // Calculate per-person cumulative points
            const allPts = [0, 0, 0, 0];
            const halfPts = [0, 0, 0, 0];
            for (let h = 0; h < 18; h++) {
              const r = vCum[h];
              if (!r || r.pushed) continue;
              const d = r.rounded;
              if (vo.simpleCalc) {
                const winTeam = d < 0 ? r.tA : r.tB;
                const mult = Math.abs(d);
                winTeam.forEach((pi) => { allPts[pi] += mult; if (h >= hs && h < hs + 9) halfPts[pi] += mult; });
              } else {
                r.tA.forEach((pi) => { allPts[pi] -= d; if (h >= hs && h < hs + 9) halfPts[pi] -= d; });
                r.tB.forEach((pi) => { allPts[pi] += d; if (h >= hs && h < hs + 9) halfPts[pi] += d; });
              }
            }
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                {players.map((n, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: halfPts[i] > 0 ? C.ok : halfPts[i] < 0 ? C.red : C.dim }}>
                      {vo.simpleCalc ? halfPts[i] : (halfPts[i] > 0 ? "+" : "") + halfPts[i]}
                    </div>
                    <div style={{ fontSize: 10, color: C.mut }}>{half === 0 ? "OUT" : "IN"}</div>
                    <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>
                      通算: {vo.simpleCalc ? allPts[i] : (allPts[i] > 0 ? "+" : "") + allPts[i]}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Personal Scores in Vegas */}
        <div style={{ ...S.card, background: "#0d2015" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.goldL, marginBottom: 12, letterSpacing: 1 }}>⛳ 個人スコア ({half === 0 ? "OUT" : "IN"})</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
            {players.map((n, i) => {
              const p = personal[i];
              const halfScore = half === 0 ? p.front : p.back;
              const halfPar = half === 0 ? p.fPar : p.bPar;
              const halfCount = half === 0 ? p.fCount : p.bCount;
              const diff = halfScore - halfPar;
              return (
                <div key={i}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.goldL }}>{halfScore || "-"}</div>
                  {halfCount > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: diff > 0 ? C.red : diff < 0 ? C.ok : C.dim }}>
                    {diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff}
                  </div>}
                  <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>通算: {p.total || "-"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </>}

      {/* ===== OLYMPIC ===== */}
      {tab === "olympic" && <>
        {Array.from({ length: 9 }, (_, idx) => {
          const h = hs + idx;
          return (
            <div key={h} style={{ ...S.card, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ ...S.tag, background: C.gold, color: C.bg, fontSize: 13, fontWeight: 700, padding: "4px 10px" }}>{h + 1}</span>
              </div>
              {players.map((name, pi) => {
                const e = olympic[h].entries[pi];
                return (
                  <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: pi < 3 ? `1px solid ${C.brd}22` : "none" }}>
                    <button style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${e.active ? C.ok : C.brd}`, background: e.active ? `${C.ok}30` : C.alt, color: e.active ? C.ok : C.mut, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
                      onClick={() => onOly(h, pi, e.active ? { active: false, rank: "" } : { active: true })}>
                      {e.active ? "✓" : ""}
                    </button>
                    <span style={{ fontSize: 13, width: 60, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: e.active ? C.txt : C.mut }}>{name}</span>
                    {e.active && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {Object.entries(RANKS).map(([k, { l, c, p }]) => (
                          <button key={k} onClick={() => onOly(h, pi, { rank: k })} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${e.rank === k ? c : C.brd}`, background: e.rank === k ? `${c}25` : "transparent", fontSize: 14, cursor: "pointer", color: c, fontWeight: e.rank === k ? 700 : 400 }}>
                            {l}<span style={{ fontSize: 10, marginLeft: 2 }}>{p}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ ...S.card, background: "#0d2015" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.goldL, marginBottom: 12, letterSpacing: 1 }}>オリンピック 累計</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
            {players.map((n, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</div>
                <div style={{ fontSize: 10, color: C.mut, marginBottom: 2 }}>OUT: {oF[i]}</div>
                <div style={{ fontSize: 10, color: C.mut, marginBottom: 4 }}>IN: {oB[i]}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.goldL }}>{oAll[i]}</div>
                <div style={{ fontSize: 10, color: C.mut }}>pts</div>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 600, marginTop: 4 }}>{(oAll[i] * oRate).toLocaleString()}pt</div>
              </div>
            ))}
          </div>
          {/* Point difference summary */}
          {(() => {
            const max = Math.max(...oAll);
            const hasScores = max > 0;
            if (!hasScores) return null;
            return (
              <div style={{ borderTop: `1px solid ${C.brd}`, marginTop: 12, paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>トップとの差:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                  {players.map((n, i) => {
                    const diff = oAll[i] - max;
                    return (
                      <div key={i} style={{ fontSize: 12, fontWeight: 600, color: diff === 0 ? C.ok : C.red }}>
                        {diff === 0 ? "TOP" : `${diff}pts`}
                        <div style={{ fontSize: 10, color: C.mut }}>{diff === 0 ? "" : `${(diff * oRate).toLocaleString()}pt`}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </>}

      {/* ===== SUMMARY ===== */}
      {tab === "summary" && <>
        {/* Personal Scores */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>⛳ 個人スコア</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.brd}` }}>
                  <th style={{ padding: "6px 4px", color: C.dim, textAlign: "left" }}></th>
                  {players.map((n, i) => <th key={i} style={{ padding: "6px 2px", color: C.dim, textAlign: "center", fontSize: 10 }}>{n}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.brd}22` }}>
                  <td style={{ padding: "6px 4px", color: C.mut, fontSize: 11 }}>OUT</td>
                  {personal.map((p, i) => <td key={i} style={{ textAlign: "center", fontWeight: 600, color: p.front > 0 ? C.txt : C.mut }}>{p.front || "-"}</td>)}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.brd}22` }}>
                  <td style={{ padding: "6px 4px", color: C.mut, fontSize: 11 }}>IN</td>
                  {personal.map((p, i) => <td key={i} style={{ textAlign: "center", fontWeight: 600, color: p.back > 0 ? C.txt : C.mut }}>{p.back || "-"}</td>)}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.brd}` }}>
                  <td style={{ padding: "8px 4px", color: C.gold, fontWeight: 700 }}>合計</td>
                  {personal.map((p, i) => <td key={i} style={{ textAlign: "center", fontWeight: 700, fontSize: 18, color: C.goldL }}>{p.total || "-"}</td>)}
                </tr>
                <tr>
                  <td style={{ padding: "6px 4px", color: C.mut, fontSize: 11 }}>Par比</td>
                  {personal.map((p, i) => {
                    const diff = p.total - p.totalPar;
                    const played = p.fCount + p.bCount;
                    return <td key={i} style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: played === 0 ? C.mut : diff > 0 ? C.red : diff < 0 ? C.ok : C.dim }}>
                      {played === 0 ? "-" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff}
                    </td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Vegas table */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🎰 ラスベガス スコア一覧</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.brd}` }}>
                  <th style={{ padding: "6px 4px", color: C.dim, textAlign: "left" }}>H</th>
                  <th style={{ padding: "6px 2px", color: C.mut, textAlign: "center", fontSize: 10 }}>Par</th>
                  {players.map((n, i) => <th key={i} style={{ padding: "6px 2px", color: C.dim, textAlign: "center", fontSize: 10 }}>{n}</th>)}
                  <th style={{ padding: "6px 4px", color: C.goldL, textAlign: "center", fontSize: 10 }}>A</th>
                  <th style={{ padding: "6px 4px", color: C.blue, textAlign: "center", fontSize: 10 }}>B</th>
                  <th style={{ padding: "6px 4px", color: C.dim, textAlign: "right", fontSize: 10 }}>累計</th>
                </tr>
              </thead>
              <tbody>
                {[0, 9].map((st, si) => (
                  <Fragment key={si}>
                    {Array.from({ length: 9 }, (_, i) => {
                      const h = st + i;
                      const sc = scores[h];
                      const r = vCum[h];
                      return (
                        <tr key={h} style={{ borderBottom: `1px solid ${C.brd}22` }}>
                          <td style={{ padding: "5px 4px", fontWeight: 600, color: C.gold }}>{h + 1}</td>
                          <td style={{ textAlign: "center", color: C.mut, fontSize: 11 }}>{pars[h]}</td>
                          {sc.map((v, j) => {
                            const col = v === 0 ? C.mut : v < pars[h] ? C.ok : v > pars[h] ? C.red : C.txt;
                            return <td key={j} style={{ textAlign: "center", color: col, fontWeight: v && v < pars[h] ? 700 : 400 }}>{v || "-"}</td>;
                          })}
                          <td style={{ textAlign: "center", color: C.goldL, fontWeight: 600 }}>{r ? r.sA : "-"}</td>
                          <td style={{ textAlign: "center", color: C.blue, fontWeight: 600 }}>{r ? r.sB : "-"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: r ? (r.pushed ? C.goldD : r.cum < 0 ? C.ok : r.cum > 0 ? C.red : C.dim) : C.mut }}>
                            {r ? (r.pushed ? "P" : (r.cum > 0 ? "+" : "") + r.cum) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {st === 0 && <tr key="mid"><td colSpan={8} style={{ padding: 4, fontSize: 10, color: C.mut, textAlign: "center", borderBottom: `2px solid ${C.brd}` }}>— ハーフ —</td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Olympic table */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🏅 オリンピック ポイント一覧</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.brd}` }}>
                  <th style={{ padding: "6px 4px", color: C.dim, textAlign: "left" }}>H</th>
                  {players.map((n, i) => <th key={i} style={{ padding: "6px 2px", color: C.dim, textAlign: "center", fontSize: 10 }}>{n}</th>)}
                </tr>
              </thead>
              <tbody>
                {[0, 9].map((st, si) => (
                  <Fragment key={si}>
                    {Array.from({ length: 9 }, (_, i) => {
                      const h = st + i;
                      return (
                        <tr key={h} style={{ borderBottom: `1px solid ${C.brd}22` }}>
                          <td style={{ padding: "5px 4px", fontWeight: 600, color: C.gold }}>{h + 1}</td>
                          {olympic[h].entries.map((e, j) => (
                            <td key={j} style={{ textAlign: "center" }}>
                              {e.active && e.rank ? <span>{RANKS[e.rank]?.l} <span style={{ fontSize: 10, color: C.dim }}>{RANKS[e.rank]?.p}</span></span> : <span style={{ color: C.mut }}>-</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {st === 0 && <tr key="m2"><td colSpan={5} style={{ padding: 4, fontSize: 10, color: C.mut, textAlign: "center", borderBottom: `2px solid ${C.brd}` }}>— ハーフ —</td></tr>}
                  </Fragment>
                ))}
                <tr style={{ borderTop: `2px solid ${C.brd}` }}>
                  <td style={{ padding: "8px 4px", fontWeight: 700, color: C.gold }}>計</td>
                  {oAll.map((p, i) => <td key={i} style={{ textAlign: "center", fontWeight: 700, fontSize: 16, color: C.goldL, padding: "8px 0" }}>{p}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  );
}

/* ======== SETTLE ======== */
function Settle({ players, rate, oRate, npRate, gsRate, handicaps, hcHalfPt, hcTotalPt, nearpin, settlement, personal, pars, onBack, onReset }) {
  const { oP, oS, npCount, vSettlements, vPts, gsAchieved, hcMatches, tot } = settlement;
  const totalPar = pars.reduce((a, b) => a + b, 0);
  return (
    <div style={S.wrap}>
      <div style={S.hdr}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button style={{ background: "none", border: "none", color: C.gold, fontSize: 14, cursor: "pointer" }} onClick={onBack}>← 戻る</button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: 2, margin: 0 }}>精算</h1>
          <div style={{ width: 50 }} />
        </div>
      </div>

      {/* Personal Scores */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>⛳ 個人スコア</div>
        {players.map((n, i) => {
          const p = personal[i];
          const diff = p.total - p.totalPar;
          const played = p.fCount + p.bCount;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.brd}22` : "none" }}>
              <span style={{ fontSize: 14 }}>{n}</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.goldL }}>{p.total || "-"}</span>
                {played > 0 && <span style={{ fontSize: 12, marginLeft: 8, fontWeight: 600, color: diff > 0 ? C.red : diff < 0 ? C.ok : C.dim }}>
                  ({diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff})
                </span>}
                <div style={{ fontSize: 10, color: C.mut }}>{p.front} / {p.back}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🎰 ラスベガス収支</div>
        {vPts.some((v) => v > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center", marginBottom: 12 }}>
            {players.map((n, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.goldL }}>{vPts[i]}</div>
                <div style={{ fontSize: 10, color: C.mut }}>勝ち</div>
              </div>
            ))}
          </div>
        )}
        {players.map((n, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.brd}22` : "none" }}>
            <span style={{ fontSize: 14 }}>{n}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: tot[i].v > 0 ? C.ok : tot[i].v < 0 ? C.red : C.dim }}>
              {tot[i].v > 0 ? "+" : ""}{tot[i].v.toLocaleString()}pt
            </span>
          </div>
        ))}
        {vSettlements.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>支払い詳細:</div>
            {vSettlements.map((x, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                <span><span style={{ color: C.red }}>{players[x.from]}</span> → <span style={{ color: C.ok }}>{players[x.to]}</span></span>
                <span style={{ color: C.gold, fontWeight: 600 }}>{x.amt.toLocaleString()}pt <span style={{ fontSize: 10, color: C.mut }}>({x.pts}差)</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🏅 オリンピック結果</div>
        {players.map((n, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.brd}22` : "none" }}>
            <span style={{ fontSize: 14 }}>{n} <span style={{ fontSize: 11, color: C.mut }}>{oP[i]}pts</span></span>
            <span style={{ fontSize: 16, fontWeight: 700, color: tot[i].o > 0 ? C.ok : tot[i].o < 0 ? C.red : C.dim }}>
              {tot[i].o > 0 ? "+" : ""}{tot[i].o.toLocaleString()}pt
            </span>
          </div>
        ))}
      </div>

      {/* Grand Slam */}
      {gsAchieved.some((a) => a) && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🏆 グランドスラム</div>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>全種類達成ボーナス: {gsRate.toLocaleString()}pt（他3名から受取）</div>
          {players.map((n, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.brd}22` : "none" }}>
              <span style={{ fontSize: 14 }}>{gsAchieved[i] ? "🏆 " : ""}{n}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: tot[i].gs > 0 ? C.ok : tot[i].gs < 0 ? C.red : C.dim }}>
                {tot[i].gs > 0 ? "+" : ""}{tot[i].gs.toLocaleString()}pt
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nearpin */}
      {npCount.some((c) => c > 0) && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🎯 ニアピン結果</div>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>1回 = チームに+{npRate.toLocaleString()}pt</div>
          {players.map((n, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.brd}22` : "none" }}>
              <span style={{ fontSize: 14 }}>{n} {npCount[i] > 0 ? `🎯×${npCount[i]}` : ""}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: tot[i].np > 0 ? C.ok : tot[i].np < 0 ? C.red : C.dim }}>
                {tot[i].np > 0 ? "+" : ""}{tot[i].np.toLocaleString()}pt
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Handicap Match */}
      {hcMatches.length > 0 && (hcHalfPt > 0 || hcTotalPt > 0) && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 12, letterSpacing: 1 }}>🏌️ ハンデマッチ</div>
          <div style={{ fontSize: 11, color: C.mut, marginBottom: 10 }}>ハーフ勝ち={hcHalfPt.toLocaleString()}pt　トータル勝ち={hcTotalPt.toLocaleString()}pt</div>
          {hcMatches.map((m, mi) => {
            const hasResults = m.results.length > 0;
            if (!hasResults) return null;
            return (
              <div key={mi} style={{ padding: "8px 0", borderBottom: mi < hcMatches.length - 1 ? `1px solid ${C.brd}22` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{players[m.p1]} vs {players[m.p2]}</span>
                  <span style={{ fontSize: 11, color: C.mut }}>ハンデ差 {Math.abs(m.hcDiff) || 0}{m.hcDiff !== 0 ? ` (${players[m.hcDiff > 0 ? m.p1 : m.p2]}に${Math.abs(m.hcDiff)}枚)` : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {m.results.map((r2, ri) => (
                    <div key={ri} style={{ flex: 1, textAlign: "center", padding: "4px", borderRadius: 6, background: `${C.alt}80`, fontSize: 11 }}>
                      <div style={{ color: C.mut, marginBottom: 2 }}>{r2.label}</div>
                      <div style={{ fontWeight: 700, color: r2.winner === -1 ? C.dim : C.ok }}>
                        {r2.winner === -1 ? "引分" : `${players[r2.winner]}勝ち`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 10, marginTop: 8 }}>
            {players.map((n, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                <span>{n}</span>
                <span style={{ fontWeight: 700, color: tot[i].hc > 0 ? C.ok : tot[i].hc < 0 ? C.red : C.dim }}>
                  {tot[i].hc > 0 ? "+" : ""}{tot[i].hc.toLocaleString()}pt
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...S.card, background: "#0d2015", border: `1px solid ${C.gold}40` }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.goldL, marginBottom: 12, letterSpacing: 1 }}>💰 ラスベガス・オリンピック最終収支</div>
        <div style={{ fontSize: 12, color: C.mut, marginBottom: 12 }}>🎰 1点={rate.toLocaleString()}pt　🏅 1点={oRate.toLocaleString()}pt{npRate > 0 ? `　🎯 1回=${npRate.toLocaleString()}pt` : ""}{gsRate > 0 ? `　🏆 ${gsRate.toLocaleString()}pt` : ""}</div>
        {players.map((n, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? `1px solid ${C.brd}33` : "none" }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{n}</span>
              <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>
                V: {tot[i].v > 0 ? "+" : ""}{tot[i].v.toLocaleString()}{"　"}O: {tot[i].o > 0 ? "+" : ""}{tot[i].o.toLocaleString()}{tot[i].np !== 0 ? `　N: ${tot[i].np > 0 ? "+" : ""}${tot[i].np.toLocaleString()}` : ""}{tot[i].gs !== 0 ? `　G: ${tot[i].gs > 0 ? "+" : ""}${tot[i].gs.toLocaleString()}` : ""}
              </div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: tot[i].t > 0 ? C.ok : tot[i].t < 0 ? C.red : C.dim }}>
              {tot[i].t > 0 ? "+" : ""}{tot[i].t.toLocaleString()}pt
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={S.btnO} onClick={onBack}>← スコアに戻る</button>
        <button style={{ ...S.btnO, borderColor: C.red, color: C.red }} onClick={() => { if (confirm("データをリセットしますか？")) onReset(); }}>リセット</button>
      </div>
    </div>
  );
}
