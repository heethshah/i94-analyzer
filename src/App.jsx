import { useState, useEffect, useRef, useCallback } from "react";

// ── PDF.js loader ─────────────────────────────────────────────────
if (typeof window !== "undefined" && !window["pdfjs-dist/build/pdf"]) {
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  document.head.appendChild(s);
}

// ── Design tokens ─────────────────────────────────────────────────
const T = {
  cream:    "#F5F0E8",
  paper:    "#EDE8DC",
  ink:      "#1A1208",
  inkLight: "#3D3526",
  terra:    "#C4432A",
  sand:     "#D4A96A",
  sage:     "#5C7A5F",
  muted:    "#9A8E7A",
  border:   "#D5CCBA",
  stamp:    "#8B4513",
};

// ── Responsive breakpoint hook ────────────────────────────────────
function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === "undefined") return "lg";
    const w = window.innerWidth;
    if (w < 480) return "xs";
    if (w < 768) return "sm";
    if (w < 1024) return "md";
    return "lg";
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 480) setBp("xs");
      else if (w < 768) setBp("sm");
      else if (w < 1024) setBp("md");
      else setBp("lg");
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return {
    bp,
    isMobile:  bp === "xs" || bp === "sm",
    isTablet:  bp === "md",
    isDesktop: bp === "lg",
    isSmall:   bp === "xs",
  };
}

// ── Helpers ───────────────────────────────────────────────────────
function parseI94PDF(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const rows = [];
  const dateRx = /^(\d{4}-\d{2}-\d{2})$/;
  const typeRx = /^(Arrival|Departure)$/i;
  for (let i = 0; i < lines.length; i++) {
    if (dateRx.test(lines[i])) {
      const date = lines[i];
      if (i + 1 < lines.length && typeRx.test(lines[i + 1])) {
        rows.push({ date, type: lines[i + 1], location: lines[i + 2] || "" });
        i += 2;
      }
    }
  }
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  return rows;
}

function addDays(str, n) {
  const d = new Date(str); d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function diffDays(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function analyze(rows) {
  if (!rows.length) return null;
  const today = new Date().toISOString().split("T")[0];
  const events = rows.map(r => ({ date: r.date, type: r.type.toLowerCase(), location: r.location }));
  const segs = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i], next = events[i + 1];
    const end = next ? next.date : today;
    if (e.type === "arrival") {
      segs.push({ from: e.date, to: end, status: "inside" });
    } else {
      segs.push({ from: e.date, to: e.date, status: "inside" });
      segs.push({ from: addDays(e.date, 1), to: end, status: "outside" });
    }
  }
  const merged = [];
  for (const s of segs) {
    if (merged.length && merged[merged.length-1].status === s.status && merged[merged.length-1].to === s.from)
      merged[merged.length-1].to = s.to;
    else merged.push({ ...s });
  }
  const firstY = +events[0].date.slice(0,4), lastY = +today.slice(0,4);
  const yearStats = {};
  for (let y = firstY; y <= lastY; y++) {
    const ys = `${y}-01-01`, ye = `${y}-12-31`;
    let inside = 0, outside = 0;
    for (const s of merged) {
      const from = s.from > ys ? s.from : ys;
      const to   = s.to   < ye ? s.to   : ye;
      if (from > to) continue;
      const d = diffDays(from, to) + 1;
      if (s.status === "inside") inside += d; else outside += d;
    }
    if (inside + outside > 0) yearStats[y] = { inside, outside, total: inside+outside, leap: isLeap(y) };
  }
  let totalIn = 0, totalOut = 0;
  Object.values(yearStats).forEach(y => { totalIn += y.inside; totalOut += y.outside; });
  const last = events[events.length-1];
  const streak = last.type === "arrival" ? diffDays(last.date, today) + 1 : 0;
  let longest = 0;
  for (const s of merged) if (s.status === "outside") longest = Math.max(longest, diffDays(s.from, s.to));
  return { yearStats, totalIn, totalOut, streak, longest, events };
}

// ── Split-flap counter ────────────────────────────────────────────
function SplitFlap({ value, duration = 1600 }) {
  const [display, setDisplay] = useState(0);
  const [tick, setTick] = useState(false);
  useEffect(() => {
    let frame = 0; const total = 20;
    const iv = setInterval(() => {
      frame++;
      if (frame < total) { setDisplay(Math.floor(Math.random() * value)); setTick(t => !t); }
      else { setDisplay(value); clearInterval(iv); }
    }, duration / total);
    return () => clearInterval(iv);
  }, [value]);
  return (
    <span style={{ fontFamily: "'Courier Prime', monospace", display: "inline-block", transition: "transform 0.06s", transform: tick ? "scaleY(0.92)" : "scaleY(1)" }}>
      {display}
    </span>
  );
}

// ── Ink-draw bar ──────────────────────────────────────────────────
function InkBar({ pct, color, delay = 0, height = 10 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 80 + delay); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ height, background: T.border, borderRadius: 2, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${w}%`, background: color, borderRadius: 2, transition: `width 1.3s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }} />
    </div>
  );
}

// ── Passport stamp ────────────────────────────────────────────────
function Stamp({ children, color = T.terra, rotate = -2, size = "sm" }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `${size === "sm" ? 1.5 : 2}px solid ${color}`,
      borderRadius: 3, padding: size === "sm" ? "2px 7px" : "3px 12px",
      color, fontSize: size === "sm" ? 9 : 10,
      fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
      transform: `rotate(${rotate}deg)`, opacity: 0.8,
      fontFamily: "'Courier Prime', monospace", flexShrink: 0,
      whiteSpace: "nowrap",
    }}>{children}</div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, delay = 0, compact = false }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      background: T.cream, border: `1px solid ${T.border}`, borderRadius: 3,
      padding: compact ? "14px 16px" : "20px 22px",
      position: "relative", overflow: "hidden",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) rotate(0deg)" : "translateY(28px) rotate(0.8deg)",
      transition: "all 0.7s cubic-bezier(0.16,1,0.3,1)",
      boxShadow: "2px 3px 0 #D5CCBA",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderStyle: "solid", borderWidth: "0 18px 18px 0", borderColor: `transparent ${T.paper} transparent transparent` }} />
      <div style={{ fontSize: compact ? 18 : 22, marginBottom: compact ? 8 : 12 }}>{icon}</div>
      <div style={{ fontSize: compact ? 28 : 38, fontWeight: 700, color: T.ink, fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>
        <SplitFlap value={value} />
      </div>
      <div style={{ fontSize: 9, color: T.muted, marginTop: compact ? 6 : 8, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'Courier Prime', monospace" }}>{label}</div>
      <div style={{ position: "absolute", bottom: compact ? 8 : 10, right: compact ? 8 : 10, transform: "rotate(4deg)", opacity: 0.7 }}>
        <Stamp color={color}>days</Stamp>
      </div>
    </div>
  );
}

// ── Ring donut ────────────────────────────────────────────────────
function RingChart({ inside, outside }) {
  const [go, setGo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGo(true), 400); return () => clearTimeout(t); }, []);
  const total = inside + outside, pct = inside / total;
  const r = 58, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 170, aspectRatio: "1", margin: "0 auto" }}>
      <svg viewBox="0 0 160 160" width="100%" height="100%" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={80} cy={80} r={r} fill="none" stroke={T.border} strokeWidth={13} />
        <circle cx={80} cy={80} r={r} fill="none" stroke={T.terra} strokeWidth={13}
          strokeDasharray={`${(1-pct)*circ} ${circ}`} strokeDashoffset={-pct*circ} />
        <circle cx={80} cy={80} r={r} fill="none" stroke={T.sage} strokeWidth={13}
          strokeDasharray={`${go ? pct*circ : 0} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.5s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "clamp(16px,3.5vw,24px)", fontWeight: 700, color: T.ink, fontFamily: "'Playfair Display', serif" }}>{(pct*100).toFixed(0)}%</div>
        <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'Courier Prime', monospace" }}>in USA</div>
      </div>
    </div>
  );
}

// ── Year card ─────────────────────────────────────────────────────
function YearCard({ year, data, index, compact = false }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), index * 90 + 150); return () => clearTimeout(t); }, [index]);
  const inPct  = (data.inside  / data.total) * 100;
  const outPct = (data.outside / data.total) * 100;
  return (
    <div style={{
      background: T.cream, border: `1px solid ${T.border}`, borderRadius: 3,
      padding: compact ? "12px 14px" : "16px 20px",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateX(0) rotate(0deg)" : "translateX(-32px) rotate(-0.3deg)",
      transition: `all 0.65s cubic-bezier(0.16,1,0.3,1) ${index*55}ms`,
      boxShadow: "1px 2px 0 #D5CCBA",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: compact ? 18 : 22, fontWeight: 700, color: T.ink, fontFamily: "'Playfair Display', serif" }}>{year}</span>
          {data.leap && <span style={{ fontSize: 9, color: T.sand, fontFamily: "'Courier Prime', monospace", letterSpacing: 1 }}>LEAP</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Stamp color={T.sage}  rotate={1}>{inPct.toFixed(0)}% in</Stamp>
          <Stamp color={T.terra} rotate={-1}>{outPct.toFixed(0)}% out</Stamp>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: T.sage,  fontFamily: "'Courier Prime', monospace", letterSpacing: 0.8, textTransform: "uppercase" }}>Inside USA</span>
            <span style={{ fontSize: 10, color: T.ink,   fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}>{data.inside} days</span>
          </div>
          <InkBar pct={inPct}  color={T.sage}  delay={index * 55} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: T.terra, fontFamily: "'Courier Prime', monospace", letterSpacing: 0.8, textTransform: "uppercase" }}>Outside USA</span>
            <span style={{ fontSize: 10, color: T.ink,   fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}>{data.outside} days</span>
          </div>
          <InkBar pct={outPct} color={T.terra} delay={index * 55 + 120} />
        </div>
      </div>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────
function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "28px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ fontSize: 9, color: T.muted, fontFamily: "'Courier Prime', monospace", letterSpacing: 2.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

// ── Upload screen ─────────────────────────────────────────────────
function UploadScreen({ onData }) {
  const { isMobile, isSmall } = useBreakpoint();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [mounted, setMounted]   = useState(false);
  const inputRef = useRef();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const waitForPdfJs = () => new Promise(res => {
    const check = () => window["pdfjs-dist/build/pdf"] ? res() : setTimeout(check, 100);
    check();
  });

  const processFile = async (file) => {
    setLoading(true); setError("");
    try {
      let text = "";
      if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        await waitForPdfJs();
        const lib = window["pdfjs-dist/build/pdf"];
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const ab = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: ab }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i);
          const ct = await pg.getTextContent();
          text += ct.items.map(x => x.str).join("\n") + "\n";
        }
      } else { text = await file.text(); }
      const rows = parseI94PDF(text);
      if (!rows.length) setError("Couldn't find travel data. Make sure this is an I-94 PDF from i94.cbp.dhs.gov.");
      else onData(analyze(rows), rows);
    } catch(e) { setError("Error: " + e.message); }
    setLoading(false);
  };

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) processFile(f);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: isSmall ? 16 : 24, position: "relative", overflow: "hidden" }}>
      {/* Ruled lines */}
      {[...Array(10)].map((_, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, height: 1, background: T.border, top: `${8 + i * 10}%`, opacity: 0.35 }} />
      ))}
      {/* Watermark — hidden on very small screens */}
      {!isSmall && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-18deg)", fontSize: "clamp(40px,8vw,100px)", fontFamily: "'Playfair Display', serif", fontWeight: 700, color: T.border, opacity: 0.18, whiteSpace: "nowrap", userSelect: "none", pointerEvents: "none" }}>
          TRAVEL RECORD
        </div>
      )}

      <div style={{
        position: "relative", zIndex: 1, maxWidth: 520, width: "100%",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(40px)",
        transition: "all 1s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: isSmall ? 24 : 36 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
            <Stamp color={T.terra} rotate={-4} size="md">Official</Stamp>
            <Stamp color={T.sage}  rotate={3}  size="md">Document</Stamp>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: isSmall ? 48 : "clamp(40px,9vw,72px)", fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1 }}>
            I-94<br /><span style={{ color: T.terra }}>Analyzer</span>
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
            <div style={{ flex: 1, height: 1, background: T.ink }} />
            <div style={{ width: 5, height: 5, background: T.terra, transform: "rotate(45deg)" }} />
            <div style={{ flex: 1, height: 1, background: T.ink }} />
          </div>
          <p style={{ color: T.muted, fontSize: isSmall ? 12 : 13, fontFamily: "'Courier Prime', monospace", lineHeight: 1.8, margin: 0 }}>
            Upload your travel history · Know your days
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
          style={{
            border: `2px dashed ${dragging ? T.terra : T.border}`,
            borderRadius: 4, padding: isSmall ? "32px 20px" : "44px 32px",
            textAlign: "center", cursor: "pointer",
            background: dragging ? `${T.terra}08` : T.cream,
            transition: "all 0.3s ease",
            boxShadow: dragging ? `0 0 0 4px ${T.terra}22, 2px 3px 0 #D5CCBA` : "2px 3px 0 #D5CCBA",
            position: "relative",
            // Disable hover drag styling on mobile since no drag support
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* Corner marks */}
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: "absolute",
              top: i < 2 ? 10 : "auto", bottom: i >= 2 ? 10 : "auto",
              left: i%2===0 ? 10 : "auto", right: i%2===1 ? 10 : "auto",
              width: 12, height: 12,
              borderTop:    i < 2  ? `2px solid ${T.muted}` : "none",
              borderBottom: i >= 2 ? `2px solid ${T.muted}` : "none",
              borderLeft:   i%2===0 ? `2px solid ${T.muted}` : "none",
              borderRight:  i%2===1 ? `2px solid ${T.muted}` : "none",
              opacity: 0.4,
            }} />
          ))}
          <input ref={inputRef} type="file" accept=".pdf,.txt,application/pdf"
            style={{ display: "none" }}
            onChange={e => e.target.files[0] && processFile(e.target.files[0])} />

          {loading ? (
            <div>
              <div style={{ fontSize: isSmall ? 36 : 44, marginBottom: 12, display: "inline-block", animation: "soar 1.4s ease-in-out infinite" }}>✈️</div>
              <div style={{ color: T.inkLight, fontFamily: "'Courier Prime', monospace", fontSize: 13, letterSpacing: 1 }}>Analyzing travel record...</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: isSmall ? 40 : 48, marginBottom: 12 }}>🛂</div>
              <div style={{ fontSize: isSmall ? 16 : 18, fontWeight: 700, color: T.ink, marginBottom: 6, fontFamily: "'Playfair Display', serif" }}>
                {isMobile ? "Tap to upload your I-94 PDF" : "Drop your I-94 PDF here"}
              </div>
              {!isMobile && (
                <div style={{ fontSize: 12, color: T.muted, fontFamily: "'Courier Prime', monospace", marginBottom: 20, letterSpacing: 0.5 }}>
                  or click to browse · from i94.cbp.dhs.gov
                </div>
              )}
              {isMobile && (
                <div style={{ fontSize: 11, color: T.muted, fontFamily: "'Courier Prime', monospace", marginBottom: 18, letterSpacing: 0.5 }}>
                  from i94.cbp.dhs.gov
                </div>
              )}
              <div style={{ display: "inline-block", background: T.ink, color: T.cream, borderRadius: 2, padding: isSmall ? "10px 24px" : "10px 28px", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Courier Prime', monospace", boxShadow: "2px 2px 0 " + T.terra }}>
                Choose File
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: `${T.terra}12`, border: `1px solid ${T.terra}66`, borderRadius: 3, fontSize: 12, color: T.terra, fontFamily: "'Courier Prime', monospace" }}>
            ⚠ {error}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 10, color: T.muted, marginTop: 16, fontFamily: "'Courier Prime', monospace", letterSpacing: 0.5, lineHeight: 1.6 }}>
          🔒 All processing is local — your data never leaves this device
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Courier+Prime:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes soar { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-10px) rotate(3deg)} }
        * { box-sizing: border-box; }
        html { -webkit-text-size-adjust: 100%; }
        body { margin: 0; background: ${T.paper}; }
      `}</style>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard({ analysis, rows, onReset }) {
  const { isMobile, isSmall, isTablet } = useBreakpoint();
  const { yearStats, totalIn, totalOut, streak, longest } = analysis;
  const years = Object.keys(yearStats).sort();
  const [hIn, setHIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setHIn(true), 80); return () => clearTimeout(t); }, []);

  const pad = isSmall ? "16px" : isMobile ? "20px" : "32px 24px";
  const compact = isSmall || isMobile;

  // Donut + bar: stack on mobile, side-by-side on tablet+
  const splitCols = isMobile ? "1fr" : "minmax(0,1fr) minmax(0,2fr)";

  return (
    <div style={{ minHeight: "100vh", background: T.paper, fontFamily: "'DM Sans', sans-serif", color: T.ink }}>

      {/* Top bar */}
      <div style={{
        background: T.ink, color: T.cream,
        padding: isSmall ? "10px 16px" : "12px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        opacity: hIn ? 1 : 0, transition: "opacity 0.8s ease",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: isSmall ? 14 : 16 }}>🛂</span>
          {!isSmall && (
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: T.sand }}>I-94 Analyzer</span>
          )}
        </div>
        <button onClick={onReset} style={{
          background: "transparent", border: `1px solid ${T.sand}55`, borderRadius: 2,
          color: T.sand, fontFamily: "'Courier Prime', monospace",
          fontSize: isSmall ? 9 : 10, letterSpacing: 1.5,
          padding: isSmall ? "5px 10px" : "5px 14px",
          cursor: "pointer", textTransform: "uppercase", transition: "opacity 0.2s",
          WebkitTapHighlightColor: "transparent",
        }}>← New Upload</button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: pad }}>

        {/* Page title */}
        <div style={{
          marginBottom: compact ? 20 : 32,
          opacity: hIn ? 1 : 0,
          transform: hIn ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: isSmall ? 26 : "clamp(24px,5vw,44px)", fontFamily: "'Playfair Display', serif", fontWeight: 700, lineHeight: 1.1 }}>
              Travel Record
            </h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Stamp color={T.terra} rotate={-2}>{rows.length} events</Stamp>
              <Stamp color={T.sage}  rotate={1}>{years.length} years</Stamp>
            </div>
          </div>
          {!isSmall && (
            <p style={{ color: T.muted, fontSize: 10, fontFamily: "'Courier Prime', monospace", margin: "4px 0 14px", letterSpacing: 0.5 }}>
              Source: U.S. Customs & Border Protection · i94.cbp.dhs.gov
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: T.ink }} />
            <div style={{ width: 5, height: 5, background: T.terra, transform: "rotate(45deg)" }} />
            <div style={{ width: 5, height: 5, background: T.terra, transform: "rotate(45deg)" }} />
            <div style={{ width: 5, height: 5, background: T.terra, transform: "rotate(45deg)" }} />
            <div style={{ flex: 1, height: 1, background: T.ink }} />
          </div>
        </div>

        {/* Stat cards — 2 cols on mobile, 4 on desktop */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isSmall ? "1fr 1fr" : isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: compact ? 10 : 14,
          marginBottom: compact ? 16 : 24,
        }}>
          <StatCard label="Days Inside USA"     value={totalIn}  icon="🇺🇸" color={T.sage}  delay={180} compact={compact} />
          <StatCard label="Days Outside USA"    value={totalOut} icon="✈️"  color={T.terra} delay={300} compact={compact} />
          <StatCard label="USA Streak"          value={streak}   icon="🔥"  color={T.sand}  delay={420} compact={compact} />
          <StatCard label="Longest Trip Abroad" value={longest}  icon="🌍"  color={T.stamp} delay={540} compact={compact} />
        </div>

        {/* Donut + bar chart */}
        <div style={{ display: "grid", gridTemplateColumns: splitCols, gap: compact ? 10 : 14, marginBottom: 8 }}>

          {/* Donut */}
          <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: 3, padding: compact ? 16 : 24, boxShadow: "2px 3px 0 #D5CCBA", minWidth: 0, overflow: "hidden", display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: "center", justifyContent: "center", gap: isMobile ? 20 : 0, position: "relative" }}>
            {!isSmall && (
              <div style={{ position: "absolute", top: 10, right: 12, transform: "rotate(5deg)" }}>
                <Stamp color={T.muted}>Overall</Stamp>
              </div>
            )}
            <div style={{ fontSize: 10, color: T.muted, fontFamily: "'Courier Prime', monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: isMobile ? 0 : 12, marginTop: isMobile ? 0 : 12, flexShrink: 0 }}>Split</div>
            <div style={{ width: isMobile ? 120 : "100%", maxWidth: 170, flexShrink: 0 }}>
              <RingChart inside={totalIn} outside={totalOut} />
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 8 : 18, flexWrap: "wrap", justifyContent: "center", alignItems: isMobile ? "flex-start" : "center" }}>
              <div style={{ textAlign: isMobile ? "left" : "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.sage,  fontFamily: "'Courier Prime', monospace" }}>{totalIn}d</div>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, textTransform: "uppercase" }}>Inside</div>
              </div>
              <div style={{ textAlign: isMobile ? "left" : "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.terra, fontFamily: "'Courier Prime', monospace" }}>{totalOut}d</div>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1, textTransform: "uppercase" }}>Outside</div>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: 3, padding: compact ? 16 : 24, boxShadow: "2px 3px 0 #D5CCBA", minWidth: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 9, color: T.muted, fontFamily: "'Courier Prime', monospace", letterSpacing: 2, textTransform: "uppercase" }}>Days by Year</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[["Inside", T.sage], ["Outside", T.terra]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 1, background: c }} />
                    <span style={{ fontSize: 9, color: T.muted, fontFamily: "'Courier Prime', monospace", textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
              {years.map((y, i) => {
                const d = yearStats[y], total = d.inside + d.outside;
                const inP = (d.inside / total) * 100, outP = (d.outside / total) * 100;
                return (
                  <div key={y}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, minWidth: 0 }}>
                      <span style={{ fontSize: compact ? 12 : 14, fontFamily: "'Playfair Display', serif", fontWeight: 700, color: T.ink, flexShrink: 0 }}>{y}</span>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: T.sage,  fontFamily: "'Courier Prime', monospace" }}>🇺🇸 {d.inside}d</span>
                        <span style={{ fontSize: 10, color: T.terra, fontFamily: "'Courier Prime', monospace" }}>✈️ {d.outside}d</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", height: 8, borderRadius: 2, overflow: "hidden", gap: 2, width: "100%" }}>
                      <div style={{ width: `${inP}%`, background: T.sage,  transition: `width 1.2s cubic-bezier(0.16,1,0.3,1) ${i*70}ms`,    borderRadius: "2px 0 0 2px" }} />
                      {d.outside > 0 && <div style={{ width: `${outP}%`, background: T.terra, transition: `width 1.2s cubic-bezier(0.16,1,0.3,1) ${i*70+80}ms`, borderRadius: "0 2px 2px 0" }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Yearly breakdown */}
        <Divider label="Yearly Breakdown" />
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10, marginBottom: 8 }}>
          {years.map((y, i) => <YearCard key={y} year={y} data={yearStats[y]} index={i} compact={compact} />)}
        </div>

        {/* Travel log table */}
        <Divider label="Travel Log" />
        <div style={{ background: T.cream, border: `1px solid ${T.border}`, borderRadius: 3, boxShadow: "2px 3px 0 #D5CCBA", marginBottom: 28, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isSmall ? 11 : 12, minWidth: 380 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.ink}`, background: T.paper }}>
                  {["#", "Date", "Type", "Port", "Gap"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: compact ? "8px 10px" : "10px 14px", fontSize: 9, fontFamily: "'Courier Prime', monospace", letterSpacing: 2, textTransform: "uppercase", color: T.muted, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r, i) => {
                  const rev = [...rows].reverse();
                  const prev = rev[i + 1];
                  const gap = prev ? Math.abs(Math.round((new Date(r.date) - new Date(prev.date)) / 86400000)) : null;
                  const isArr = r.type.toLowerCase() === "arrival";
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.cream : T.paper }}>
                      <td style={{ padding: compact ? "8px 10px" : "10px 14px", color: T.muted, fontFamily: "'Courier Prime', monospace", fontSize: 10 }}>{rows.length - i}</td>
                      <td style={{ padding: compact ? "8px 10px" : "10px 14px", fontFamily: "'Courier Prime', monospace", color: T.ink, fontWeight: 700, whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: compact ? "8px 10px" : "10px 14px" }}>
                        <span style={{ display: "inline-block", border: `1.5px solid ${isArr ? T.sage : T.terra}`, color: isArr ? T.sage : T.terra, borderRadius: 2, padding: "2px 6px", fontSize: 8, fontWeight: 700, fontFamily: "'Courier Prime', monospace", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                          {isArr ? "▼ ARR" : "▲ DEP"}
                        </span>
                      </td>
                      <td style={{ padding: compact ? "8px 10px" : "10px 14px", fontFamily: "'Courier Prime', monospace", color: T.inkLight, letterSpacing: 1, fontSize: 11 }}>{r.location}</td>
                      <td style={{ padding: compact ? "8px 10px" : "10px 14px" }}>
                        {gap !== null
                          ? <span style={{ fontFamily: "'Courier Prime', monospace", color: T.stamp, fontWeight: 700 }}>{gap}d</span>
                          : <span style={{ color: T.muted }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", paddingBottom: 32, borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
          <p style={{ fontSize: 10, color: T.muted, fontFamily: "'Courier Prime', monospace", lineHeight: 2, margin: 0 }}>
            Source: U.S. Customs and Border Protection · i94.cbp.dhs.gov<br />
            <span style={{ color: T.terra }}>⚠ Informational only. Consult an immigration attorney for legal advice.</span>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Courier+Prime:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        html { -webkit-text-size-adjust: 100%; }
        body { margin: 0; background: ${T.paper}; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${T.paper}; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
        tr:hover td { background: ${T.border}33 !important; transition: background 0.15s; }
        button:active { opacity: 0.7; }
      `}</style>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const handleData = (a, r) => { setData(a); setRows(r); };
  if (!data) return <UploadScreen onData={handleData} />;
  return <Dashboard analysis={data} rows={rows} onReset={() => { setData(null); setRows([]); }} />;
}
