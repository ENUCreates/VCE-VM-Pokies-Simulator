import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------
// THE MATHS
// Each reel has 64 virtual stops. Weights below.
// Pay table tuned so theoretical RTP ≈ 87.3% — close to the legal
// minimum return for Victorian gaming venues (87%).
// All payouts scale linearly with the bet, so the RTP is the same
// at every bet level — only the dollars lost per spin change.
// ---------------------------------------------------------------
const SYMBOLS = [
  { icon: "🍒", name: "Cherry", weight: 20, triplePay: 5 },
  { icon: "🍋", name: "Lemon", weight: 16, triplePay: 10 },
  { icon: "🔔", name: "Bell", weight: 12, triplePay: 20 },
  { icon: "⭐", name: "Star", weight: 8, triplePay: 40 },
  { icon: "💎", name: "Diamond", weight: 5, triplePay: 120 },
  { icon: "7️⃣", name: "Seven", weight: 3, triplePay: 500 },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0); // 64
const PAIR_PAY = 0.5; // per $1 bet
const BET_OPTIONS = [1, 2, 5, 10];

// Theoretical figures (computed once, shown in the ledger)
const theoretical = (() => {
  let tripleEV = 0, tripleProb = 0, pairProb = 0;
  SYMBOLS.forEach((s) => {
    const p = s.weight / TOTAL_WEIGHT;
    tripleEV += Math.pow(p, 3) * s.triplePay;
    tripleProb += Math.pow(p, 3);
    pairProb += 3 * p * p * (1 - p);
  });
  const rtp = tripleEV + pairProb * PAIR_PAY;
  return {
    rtp,
    houseEdge: 1 - rtp,
    hitRate: tripleProb + pairProb,
    pairProb,
    tripleProb,
  };
})();

function randomSymbol() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SYMBOLS[0];
}

function evaluate(reels, bet) {
  const [a, b, c] = reels;
  if (a.name === b.name && b.name === c.name) {
    return { payout: a.triplePay * bet, kind: "triple", symbol: a };
  }
  if (a.name === b.name || a.name === c.name || b.name === c.name) {
    return { payout: PAIR_PAY * bet, kind: "pair", symbol: null };
  }
  return { payout: 0, kind: "loss", symbol: null };
}

const money = (n) =>
  (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const START_BALANCE = 50;

export default function PokiesSimulator() {
  const [reels, setReels] = useState([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]);
  const [bet, setBet] = useState(1);
  const [balance, setBalance] = useState(START_BALANCE);
  const [stats, setStats] = useState({ spins: 0, wagered: 0, returned: 0, ldw: 0, trueWins: 0, biggestWin: 0 });
  const [history, setHistory] = useState([{ spin: 0, balance: START_BALANCE, expected: START_BALANCE }]);
  const [lastResult, setLastResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [showMaths, setShowMaths] = useState(false);
  const spinTimer = useRef(null);

  const broke = balance < bet;
  const flatBroke = balance < Math.min(...BET_OPTIONS);

  const applySpins = useCallback((n, curBalance, curStats, curHistory, betAmt) => {
    let bal = curBalance;
    const st = { ...curStats };
    const hist = [...curHistory];
    let finalReels = reels;
    let finalResult = null;

    for (let i = 0; i < n; i++) {
      if (bal < betAmt) break;
      bal -= betAmt;
      const r = [randomSymbol(), randomSymbol(), randomSymbol()];
      const res = evaluate(r, betAmt);
      bal += res.payout;
      st.spins += 1;
      st.wagered += betAmt;
      st.returned += res.payout;
      if (res.payout > 0 && res.payout < betAmt) st.ldw += 1;
      if (res.payout >= betAmt) st.trueWins += 1;
      if (res.payout > st.biggestWin) st.biggestWin = res.payout;
      finalReels = r;
      finalResult = res;
      // Expected balance is driven by total money wagered, not spin count —
      // so doubling the bet makes this line fall twice as fast per spin.
      const expected = Math.max(0, START_BALANCE - theoretical.houseEdge * st.wagered);
      if (n <= 10 || i % Math.ceil(n / 120) === 0 || i === n - 1) {
        hist.push({ spin: st.spins, balance: +bal.toFixed(2), expected: +expected.toFixed(2) });
      }
    }
    return { bal, st, hist, finalReels, finalResult };
  }, [reels]);

  const spinOnce = () => {
    if (spinning || broke) return;
    setSpinning(true);
    setLastResult(null);
    let ticks = 0;
    spinTimer.current = setInterval(() => {
      setReels([randomSymbol(), randomSymbol(), randomSymbol()]);
      ticks++;
      if (ticks >= 8) {
        clearInterval(spinTimer.current);
        const { bal, st, hist, finalReels, finalResult } = applySpins(1, balance, stats, history, bet);
        setReels(finalReels);
        setBalance(bal);
        setStats(st);
        setHistory(hist);
        setLastResult(finalResult);
        setSpinning(false);
      }
    }, 70);
  };

  const fastForward = (n) => {
    if (spinning || broke) return;
    const { bal, st, hist, finalReels, finalResult } = applySpins(n, balance, stats, history, bet);
    setReels(finalReels);
    setBalance(bal);
    setStats(st);
    setHistory(hist);
    setLastResult(finalResult);
  };

  const reset = () => {
    clearInterval(spinTimer.current);
    setSpinning(false);
    setBalance(START_BALANCE);
    setStats({ spins: 0, wagered: 0, returned: 0, ldw: 0, trueWins: 0, biggestWin: 0 });
    setHistory([{ spin: 0, balance: START_BALANCE, expected: START_BALANCE }]);
    setLastResult(null);
    setReels([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]);
  };

  const actualRTP = stats.wagered > 0 ? stats.returned / stats.wagered : null;
  const net = stats.returned - stats.wagered;

  const machineMessage = useMemo(() => {
    if (flatBroke) return { text: "INSERT MORE CREDIT", cls: "msg-broke" };
    if (broke) return { text: "CREDIT TOO LOW — LOWER YOUR BET", cls: "msg-broke" };
    if (!lastResult) return { text: "PRESS SPIN TO PLAY", cls: "msg-idle" };
    if (lastResult.kind === "triple")
      return { text: `★ JACKPOT LINE! YOU WIN ${money(lastResult.payout)} ★`, cls: "msg-win" };
    if (lastResult.kind === "pair")
      return { text: `WINNER! ${money(lastResult.payout)}`, cls: "msg-win" };
    return { text: "SO CLOSE — SPIN AGAIN!", cls: "msg-lose" };
  }, [lastResult, broke, flatBroke]);

  const ledgerVerdict = useMemo(() => {
    if (!lastResult) return null;
    if (lastResult.kind === "triple")
      return { text: `Genuine win: +${money(lastResult.payout - bet)} net this spin.`, tone: "good" };
    if (lastResult.kind === "pair")
      return { text: `“Win” of ${money(lastResult.payout)} on a ${money(bet)} bet → net ${money(lastResult.payout - bet)}. A loss disguised as a win.`, tone: "bad" };
    return { text: `No return. Net ${money(-bet)} this spin.`, tone: "bad" };
  }, [lastResult, bet]);

  return (
    <div className="sim-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap');
        .sim-root { font-family:'IBM Plex Sans',sans-serif; max-width:1060px; margin:0 auto; padding:12px; color:#1a1a1a; }
        .sim-header { text-align:center; margin-bottom:14px; }
        .sim-header h1 { font-family:'Bungee',cursive; font-size:clamp(20px,3.4vw,30px); margin:0; letter-spacing:1px; }
        .sim-header h1 .lit { color:#c2186b; } .sim-header h1 .dim { color:#1d3b5c; }
        .sim-header p { margin:4px 0 0; color:#555; font-size:14px; }
        .split { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
        @media (max-width:760px){ .split { grid-template-columns:1fr; } }

        /* ---- THE MACHINE (left): loud, dark, seductive ---- */
        .machine { background:linear-gradient(165deg,#2b0a3d 0%,#12041f 70%); border-radius:18px; padding:18px; color:#fff;
                   box-shadow:0 8px 30px rgba(43,10,61,.45), inset 0 0 0 3px #ffb52e, inset 0 0 0 6px #6d1ea8; }
        .machine-title { font-family:'Bungee',cursive; text-align:center; font-size:18px; color:#ffb52e; text-shadow:0 0 12px rgba(255,181,46,.7); margin-bottom:10px; }
        .reels { display:flex; gap:10px; justify-content:center; margin:10px 0; }
        .reel { width:86px; height:96px; background:#fffdf4; border-radius:10px; display:flex; align-items:center; justify-content:center;
                font-size:46px; box-shadow:inset 0 -10px 16px rgba(0,0,0,.18), 0 0 0 3px #ffb52e; transition:transform .07s; }
        .reel.spin { transform:translateY(2px) scale(.97); filter:blur(1px); }
        .msg { text-align:center; font-family:'Bungee',cursive; font-size:15px; min-height:42px; display:flex; align-items:center; justify-content:center; border-radius:8px; padding:6px 8px; }
        .msg-win { color:#0f2a12; background:#ffe75e; animation:flash .5s steps(2) 4; }
        .msg-lose { color:#ffd1e6; } .msg-idle { color:#cbb4ff; } .msg-broke { color:#ff7b7b; }
        @keyframes flash { 50% { background:#fff9c9; } }
        .credit-row { display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:14px; margin:8px 2px; color:#ffe75e; }
        .bet-row { display:flex; align-items:center; justify-content:center; gap:6px; margin:8px 0 2px; flex-wrap:wrap; }
        .bet-label { font-family:'Bungee',cursive; font-size:11px; color:#ffb52e; letter-spacing:1px; margin-right:2px; }
        .bet-btn { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:13px; padding:7px 14px; border-radius:8px; cursor:pointer;
                   border:2px solid #9a6bd1; background:transparent; color:#d9c4ff; }
        .bet-btn:hover { background:#3a1660; }
        .bet-btn.active { background:#ffb52e; border-color:#ffb52e; color:#2b0a3d; box-shadow:0 0 12px rgba(255,181,46,.7); }
        .bet-btn:disabled { opacity:.35; cursor:not-allowed; }
        .btn-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:8px; }
        .spin-btn { font-family:'Bungee',cursive; font-size:18px; padding:12px 34px; border:none; border-radius:999px; cursor:pointer;
                    background:radial-gradient(circle at 30% 30%,#ff5fa2,#c2186b); color:#fff; box-shadow:0 4px 0 #7c0f44, 0 0 18px rgba(255,95,162,.6); }
        .spin-btn:active { transform:translateY(3px); box-shadow:0 1px 0 #7c0f44; }
        .spin-btn:disabled { opacity:.45; cursor:not-allowed; }
        .ff-btn { font-family:'IBM Plex Mono',monospace; font-size:12px; padding:8px 12px; border-radius:8px; border:1px solid #9a6bd1; background:transparent; color:#d9c4ff; cursor:pointer; }
        .ff-btn:hover { background:#3a1660; } .ff-btn:disabled { opacity:.4; cursor:not-allowed; }
        .paytable { margin-top:14px; background:rgba(255,255,255,.06); border-radius:10px; padding:10px; font-size:13px; }
        .paytable h3 { font-family:'Bungee',cursive; font-size:12px; color:#ffb52e; margin:0 0 6px; text-align:center; }
        .paytable table { width:100%; border-collapse:collapse; font-family:'IBM Plex Mono',monospace; }
        .paytable td { padding:3px 4px; border-bottom:1px dashed rgba(255,255,255,.15); }
        .paytable td:last-child { text-align:right; color:#9be7a4; }
        .odds { color:#b9a3e0; font-size:11px; }

        /* ---- THE LEDGER (right): clinical, quiet, honest ---- */
        .ledger { background:#fcfcfa; border:1px solid #d8d5cc; border-radius:6px; padding:18px; font-family:'IBM Plex Mono',monospace; }
        .ledger h2 { font-family:'IBM Plex Sans',sans-serif; font-weight:600; font-size:15px; letter-spacing:2px; text-transform:uppercase; color:#1d3b5c; border-bottom:2px solid #1d3b5c; padding-bottom:6px; margin:0 0 12px; }
        .lrow { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px dotted #ddd; }
        .lrow .neg { color:#b3261e; font-weight:600; } .lrow .pos { color:#0e7a3a; font-weight:600; }
        .verdict { margin:10px 0; padding:9px 11px; font-size:12.5px; border-left:4px solid; background:#f4f1ea; }
        .verdict.bad { border-color:#b3261e; } .verdict.good { border-color:#0e7a3a; }
        .chart-wrap { margin-top:10px; }
        .chart-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#777; margin-bottom:4px; }
        .reset-btn { margin-top:10px; width:100%; padding:8px; font-family:'IBM Plex Mono',monospace; font-size:13px; border:1px solid #1d3b5c; background:#fff; color:#1d3b5c; cursor:pointer; border-radius:4px; }
        .reset-btn:hover { background:#1d3b5c; color:#fff; }
        .maths-toggle { margin-top:14px; width:100%; text-align:left; background:none; border:none; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; font-weight:600; font-size:13px; color:#1d3b5c; padding:6px 0; }
        .maths { font-size:12.5px; line-height:1.55; color:#333; background:#f4f1ea; padding:10px 12px; border-radius:4px; font-family:'IBM Plex Sans',sans-serif; }
        .maths code { font-family:'IBM Plex Mono',monospace; background:#fff; padding:0 3px; }
      `}</style>

      <div className="sim-header">
        <h1><span className="lit">THE MACHINE</span> <span style={{color:'#999'}}>vs</span> <span className="dim">THE MATHS</span></h1>
        <p>A pokies simulator for VCE VM Numeracy — the left side is what the machine tells you; the right side is what your money is actually doing.</p>
      </div>

      <div className="split">
        {/* ============ MACHINE ============ */}
        <div className="machine">
          <div className="machine-title">⚡ LUCKY SOUTHERN STARS ⚡</div>
          <div className="reels">
            {reels.map((s, i) => (
              <div key={i} className={`reel ${spinning ? "spin" : ""}`}>{s.icon}</div>
            ))}
          </div>
          <div className={`msg ${machineMessage.cls}`}>{machineMessage.text}</div>
          <div className="credit-row">
            <span>CREDIT {money(balance)}</span>
            <span>BET {money(bet)}</span>
          </div>
          <div className="bet-row">
            <span className="bet-label">BET PER SPIN</span>
            {BET_OPTIONS.map((b) => (
              <button
                key={b}
                className={`bet-btn ${bet === b ? "active" : ""}`}
                onClick={() => setBet(b)}
                disabled={spinning || balance < b}
              >
                ${b}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="spin-btn" onClick={spinOnce} disabled={spinning || broke}>SPIN</button>
          </div>
          <div className="btn-row">
            <button className="ff-btn" onClick={() => fastForward(10)} disabled={spinning || broke}>+10 spins</button>
            <button className="ff-btn" onClick={() => fastForward(100)} disabled={spinning || broke}>+100 spins</button>
            <button className="ff-btn" onClick={() => fastForward(1000)} disabled={spinning || broke}>+1000 spins</button>
          </div>

          <div className="paytable">
            <h3>PAYS — ${bet} BET</h3>
            <table><tbody>
              {SYMBOLS.slice().reverse().map((s) => {
                const p = s.weight / TOTAL_WEIGHT;
                const oneIn = Math.round(1 / Math.pow(p, 3));
                return (
                  <tr key={s.name}>
                    <td>{s.icon}{s.icon}{s.icon}</td>
                    <td className="odds">1 in {oneIn.toLocaleString()}</td>
                    <td>${(s.triplePay * bet).toLocaleString()}</td>
                  </tr>
                );
              })}
              <tr>
                <td>any pair</td>
                <td className="odds">1 in {(1 / theoretical.pairProb).toFixed(1)}</td>
                <td>{money(PAIR_PAY * bet)}</td>
              </tr>
            </tbody></table>
          </div>
        </div>

        {/* ============ LEDGER ============ */}
        <div className="ledger">
          <h2>Session Ledger</h2>
          <div className="lrow"><span>Spins</span><span>{stats.spins}</span></div>
          <div className="lrow"><span>Total wagered</span><span>{money(stats.wagered)}</span></div>
          <div className="lrow"><span>Total returned</span><span>{money(stats.returned)}</span></div>
          <div className="lrow"><span>Net position</span><span className={net < 0 ? "neg" : "pos"}>{money(net)}</span></div>
          <div className="lrow"><span>“Wins” paying less than the bet</span><span className="neg">{stats.ldw}</span></div>
          <div className="lrow"><span>Wins paying ≥ the bet</span><span>{stats.trueWins}</span></div>
          <div className="lrow"><span>Your actual return rate</span><span>{actualRTP === null ? "—" : (actualRTP * 100).toFixed(1) + "%"}</span></div>
          <div className="lrow"><span>Machine's long-run return rate</span><span>{(theoretical.rtp * 100).toFixed(1)}%</span></div>
          <div className="lrow"><span>Expected loss per spin at ${bet} bet</span><span className="neg">{money(-theoretical.houseEdge * bet)}</span></div>

          {ledgerVerdict && (
            <div className={`verdict ${ledgerVerdict.tone}`}>{ledgerVerdict.text}</div>
          )}
          {broke && !flatBroke && (
            <div className="verdict bad">
              Not enough credit for a ${bet} spin. The machine helpfully suggests lowering your bet — anything to keep the money moving through it.
            </div>
          )}
          {flatBroke && (
            <div className="verdict bad">
              Balance can no longer cover any bet. Starting with $50, the maths predicted this — on average the machine keeps about 13 cents of every dollar wagered, every spin, at every bet level, forever.
            </div>
          )}

          <div className="chart-wrap">
            <div className="chart-title">Balance vs spins (grey dashed = expected balance)</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={history} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#e5e2d8" />
                <XAxis dataKey="spin" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} domain={[0, "auto"]} />
                <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => `Spin ${l}`} contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                <ReferenceLine y={START_BALANCE} stroke="#bbb" strokeDasharray="1 3" />
                <Line type="monotone" dataKey="expected" stroke="#999" strokeDasharray="5 4" dot={false} strokeWidth={1.4} name="Expected" isAnimationActive={false} />
                <Line type="monotone" dataKey="balance" stroke="#b3261e" dot={false} strokeWidth={2} name="Actual" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <button className="reset-btn" onClick={reset}>Reset session — new $50</button>

          <button className="maths-toggle" onClick={() => setShowMaths(!showMaths)}>
            {showMaths ? "▾" : "▸"} The maths behind the machine
          </button>
          {showMaths && (
            <div className="maths">
              <p style={{marginTop:0}}>Each reel has 64 weighted stops — rarer symbols have fewer stops. The chance of three sevens is <code>(3/64)³ ≈ 1 in 9,700</code>.</p>
              <p><b>Expected value:</b> add up (probability × payout) for every outcome. At a $1 bet that totals about <code>$0.873</code> returned per spin — an expected loss of about <code>12.7 cents</code>. This is the <b>house edge</b>.</p>
              <p><b>Changing the bet changes nothing — and everything.</b> Every payout scales with the bet, so the return rate is {(theoretical.rtp*100).toFixed(1)}% whether you bet $1 or $10. What changes is the <i>dollar</i> loss: expected loss per spin is <code>{(theoretical.houseEdge).toFixed(3)} × bet</code> — about 13c at $1, $1.27 at $10. At 10 spins a minute, a $10 bettor expects to lose around $760 an hour. Same percentages, very different consequences.</p>
              <p><b>Return to player (RTP):</b> Victorian law requires gaming machines in venues to return at least 87% of money wagered — over the machine's lifetime, not your session.</p>
              <p><b>Losses disguised as wins:</b> about {(theoretical.pairProb*100).toFixed(0)}% of spins pay back only half the bet. The machine flashes "WINNER!" — but you've lost money. Including these, something "good" happens on about {(theoretical.hitRate*100).toFixed(0)}% of spins, which is why it never <i>feels</i> like you're losing 13% of turnover.</p>
              <p style={{marginBottom:0}}><b>Discussion prompts:</b> Run 100 spins at $1, reset, then 100 spins at $10 — compare how fast the dashed line falls. Why does the red line sometimes sit above it? If a venue's machines take $200,000 a week in bets, estimate what they keep.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
