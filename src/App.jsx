import { useState, useRef, useCallback } from "react";

// ─── SIMULATED AUTH (Real mein Supabase use karein) ───────────────────────────
const fakeDB = {};

const authService = {
  signup: (email, password, name) => {
    if (fakeDB[email]) return { error: "Email already registered!" };
    fakeDB[email] = { name, password, resumes: [] };
    return { user: { email, name, resumes: [] } };
  },
  login: (email, password) => {
    const u = fakeDB[email];
    if (!u || u.password !== password) return { error: "Invalid email or password" };
    return { user: { email, name: u.name, resumes: u.resumes } };
  },
  saveResume: (email, data) => {
    if (fakeDB[email]) {
      fakeDB[email].resumes.unshift(data);
    }
  },
  getResumes: (email) => fakeDB[email]?.resumes || [],
};

// ─── CLAUDE API ────────────────────────────────────────────────────────────────
const analyzeResume = async (fileBase64, fileType, resumeText) => {
  const isPDF = fileType === "application/pdf";
  const messageContent = isPDF ? [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
    { type: "text", text: ANALYSIS_PROMPT }
  ] : ANALYSIS_PROMPT + "\n\nRESUME:\n" + resumeText;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: messageContent }]
    })
  });
  const data = await res.json();
  const text = data.content?.map(i => i.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
};

const ANALYSIS_PROMPT = `You are an expert ATS analyzer for fresher/entry-level candidates. Return ONLY valid JSON, no markdown:
{
  "ats_score": <0-100>,
  "score_breakdown": {"keywords":<0-20>,"formatting":<0-20>,"skills_section":<0-20>,"experience_education":<0-20>,"contact_info":<0-20>},
  "overall_verdict": "<one sentence>",
  "strengths": ["<s1>","<s2>","<s3>"],
  "critical_issues": ["<i1>","<i2>","<i3>"],
  "suggestions": [
    {"priority":"HIGH","section":"<s>","tip":"<t>"},
    {"priority":"HIGH","section":"<s>","tip":"<t>"},
    {"priority":"MEDIUM","section":"<s>","tip":"<t>"},
    {"priority":"MEDIUM","section":"<s>","tip":"<t>"},
    {"priority":"LOW","section":"<s>","tip":"<t>"}
  ],
  "key_points_to_add": ["<k1>","<k2>","<k3>","<k4>","<k5>"],
  "missing_sections": ["<m1>","<m2>"],
  "fresher_tips": ["<ft1>","<ft2>","<ft3>"]
}`;

// ─── STYLES ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#07080f", card: "#0e111e", border: "#1c2340",
  accent: "#5b7fff", accentDim: "#1a2550",
  green: "#00e5a0", red: "#ff4d6d", yellow: "#ffc043",
  text: "#dde4ff", muted: "#606a90",
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${C.bg};color:${C.text};font-family:'Plus Jakarta Sans',sans-serif;}
input{outline:none;font-family:'Plus Jakarta Sans',sans-serif;}
button{cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
.fade-in{animation:fadeIn 0.4s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}
.inp:focus{border-color:${C.accent}!important;box-shadow:0 0 0 3px ${C.accent}22!important;}
.btn-primary:hover{background:#4a6ef5!important;transform:translateY(-1px);}
.btn-ghost:hover{background:${C.accentDim}!important;color:${C.accent}!important;}
.resume-card:hover{border-color:${C.accent}!important;transform:translateY(-2px);}
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const Input = ({ label, type = "text", value, onChange, placeholder, icon }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ fontSize: 12, color: C.muted, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: 0.5 }}>
      {label}
    </label>
    <div style={{ position: "relative" }}>
      {icon && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>{icon}</span>}
      <input
        className="inp"
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: `12px 14px 12px ${icon ? "42px" : "14px"}`,
          color: C.text, fontSize: 14, transition: "all 0.2s",
        }}
      />
    </div>
  </div>
);

const Btn = ({ children, onClick, variant = "primary", disabled, style = {} }) => (
  <button
    className={variant === "primary" ? "btn-primary" : "btn-ghost"}
    onClick={onClick} disabled={disabled}
    style={{
      background: variant === "primary" ? C.accent : "transparent",
      color: variant === "primary" ? "#fff" : C.accent,
      border: `1px solid ${variant === "primary" ? C.accent : C.border}`,
      padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
      transition: "all 0.2s", opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style,
    }}
  >
    {children}
  </button>
);

const ScoreRing = ({ score }) => {
  const r = 44; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red;
  return (
    <div style={{ position: "relative", width: 110, height: 110 }}>
      <svg width="110" height="110" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke={C.border} strokeWidth="8" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease", filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'JetBrains Mono'" }}>{score}</div>
        <div style={{ fontSize: 9, color: C.muted, fontFamily: "'JetBrains Mono'", letterSpacing: 1 }}>/ 100</div>
      </div>
    </div>
  );
};

const MiniBar = ({ label, value, max = 20 }) => {
  const pct = (value / max) * 100;
  const color = pct >= 75 ? C.green : pct >= 50 ? C.yellow : C.red;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
        <span style={{ fontSize: 11, color, fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 1.2s ease" }} />
      </div>
    </div>
  );
};

const Badge = ({ priority }) => {
  const map = { HIGH: [C.red, "#3d0d1a"], MEDIUM: [C.yellow, "#3d2d00"], LOW: [C.green, "#003d2a"] };
  const [c, bg] = map[priority] || map.LOW;
  return <span style={{ background: bg, color: c, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono'", border: `1px solid ${c}33` }}>{priority}</span>;
};

// ─── PAGES ────────────────────────────────────────────────────────────────────

// AUTH PAGE
const AuthPage = ({ onAuth }) => {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = () => {
    setError(""); setLoading(true);
    setTimeout(() => {
      const res = mode === "login"
        ? authService.login(email, password)
        : authService.signup(email, password, name);
      setLoading(false);
      if (res.error) setError(res.error);
      else onAuth(res.user);
    }, 600);
  };

  return (
    <div className="fade-in" style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(ellipse at 50% 0%, ${C.accentDim}55 0%, ${C.bg} 60%)`,
      padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, background: C.accentDim, borderRadius: 16,
            border: `1px solid ${C.accent}44`, marginBottom: 16,
          }}>
            <span style={{ fontSize: 28 }}>⚡</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>ResumeIQ</h1>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>AI-powered ATS Score for Freshers</p>
        </div>

        {/* Card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
          {/* Toggle */}
          <div style={{ display: "flex", background: C.bg, borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: mode === m ? C.accent : "transparent",
                  color: mode === m ? "#fff" : C.muted, fontWeight: 700, fontSize: 13,
                  transition: "all 0.2s",
                }}>
                {m === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          {mode === "signup" && <Input label="Full Name" value={name} onChange={setName} placeholder="Rahul Sharma" icon="👤" />}
          <Input label="Email Address" type="email" value={email} onChange={setEmail} placeholder="rahul@gmail.com" icon="✉️" />
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" icon="🔒" />

          {error && (
            <div style={{ background: "#3d0d1a", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.red, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <Btn onClick={submit} disabled={loading} style={{ width: "100%", marginTop: 4 }}>
            {loading ? "⏳ Please wait..." : mode === "login" ? "🚀 Login" : "✨ Create Account"}
          </Btn>

          <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16 }}>
            Demo ke liye koi bhi email/password use karo
          </p>
        </div>
      </div>
    </div>
  );
};

// DASHBOARD
const Dashboard = ({ user, onNewScan, onViewResult }) => {
  const resumes = authService.getResumes(user.email);
  const avg = resumes.length ? Math.round(resumes.reduce((a, r) => a + r.score, 0) / resumes.length) : null;

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>Namaste, {user.name || user.email.split("@")[0]} 👋</h2>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Apna resume score karo aur top companies mein shortlist ho jao</p>
        </div>
        <Btn onClick={onNewScan}>+ New Scan</Btn>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total Scans", val: resumes.length, icon: "📄" },
          { label: "Best Score", val: resumes.length ? Math.max(...resumes.map(r => r.score)) : "—", icon: "🏆" },
          { label: "Avg Score", val: avg || "—", icon: "📊" },
        ].map(({ label, val, icon }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>{val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* History */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 16, textTransform: "uppercase" }}>
          Resume History
        </div>
        {resumes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14 }}>Abhi tak koi resume scan nahi hua</div>
            <Btn onClick={onNewScan} style={{ marginTop: 16 }}>Pehla Resume Scan Karo</Btn>
          </div>
        ) : (
          resumes.map((r, i) => {
            const color = r.score >= 75 ? C.green : r.score >= 50 ? C.yellow : C.red;
            return (
              <div key={i} className="resume-card"
                onClick={() => onViewResult(r.result)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px", border: `1px solid ${C.border}`, borderRadius: 10,
                  marginBottom: 10, cursor: "pointer", transition: "all 0.2s",
                }}>
                <div style={{ fontSize: 24 }}>📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fileName}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{r.date}</div>
                </div>
                <div style={{
                  background: color + "22", color, border: `1px solid ${color}44`,
                  padding: "4px 14px", borderRadius: 20, fontSize: 16, fontWeight: 800,
                  fontFamily: "'JetBrains Mono'",
                }}>
                  {r.score}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// UPLOAD PAGE
const UploadPage = ({ user, onResult, onBack }) => {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const process = useCallback(async (file) => {
    setLoading(true); setError(null);
    try {
      let resumeText = "", fileBase64 = null;
      if (file.type === "application/pdf") {
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        fileBase64 = btoa(bin);
      } else {
        resumeText = await file.text();
      }
      const result = await analyzeResume(fileBase64, file.type, resumeText);
      const record = { fileName: file.name, date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), score: result.ats_score, result };
      authService.saveResume(user.email, record);
      onResult(result);
    } catch (e) {
      setError("Resume analyze nahi ho saka. Dobara try karo.");
    } finally {
      setLoading(false);
    }
  }, [user, onResult]);

  const onDrop = e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) process(f); };

  if (loading) return (
    <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 56, height: 56, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 24 }} />
      <div style={{ fontSize: 20, fontWeight: 700 }}>Analyzing your resume...</div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>AI aapka resume check kar raha hai ✨</div>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 600, margin: "0 auto", padding: "40px 16px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
        ← Back to Dashboard
      </button>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Resume Upload Karo</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>PDF, TXT, ya DOC format support karta hai</p>

      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 16, padding: "60px 24px", textAlign: "center",
          background: dragging ? C.accentDim + "33" : C.card, cursor: "pointer", transition: "all 0.3s",
        }}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) process(f); }} />
        <div style={{ fontSize: 56, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Resume yahan drop karo</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>ya click karke choose karo</div>
        <Btn onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>📂 File Browse Karo</Btn>
      </div>

      {error && <div style={{ background: "#3d0d1a", border: `1px solid ${C.red}44`, borderRadius: 10, padding: 14, marginTop: 16, color: C.red, fontSize: 13 }}>⚠️ {error}</div>}
    </div>
  );
};

// RESULTS PAGE
const ResultsPage = ({ result, onBack, onNewScan }) => {
  const [tab, setTab] = useState("overview");
  const tabs = [
    { id: "overview", label: "📊 Overview" },
    { id: "suggestions", label: "💡 Suggestions" },
    { id: "keywords", label: "🔑 Keywords" },
    { id: "fresher", label: "🎓 Fresher Tips" },
  ];
  const label = result.ats_score >= 80 ? "Excellent! 🎉" : result.ats_score >= 65 ? "Good 👍" : result.ats_score >= 50 ? "Average 📈" : "Needs Work 🔧";
  const color = result.ats_score >= 75 ? C.green : result.ats_score >= 50 ? C.yellow : C.red;

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 60px" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 13 }}>← Dashboard</button>
        <Btn onClick={onNewScan} variant="ghost" style={{ padding: "6px 16px", fontSize: 12 }}>+ New Scan</Btn>
      </div>

      {/* Score card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <ScoreRing score={result.ats_score} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color }}>{label}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 1.6 }}>{result.overall_verdict}</div>
          <MiniBar label="Keywords" value={result.score_breakdown?.keywords || 0} />
          <MiniBar label="Formatting" value={result.score_breakdown?.formatting || 0} />
          <MiniBar label="Skills" value={result.score_breakdown?.skills_section || 0} />
          <MiniBar label="Experience/Education" value={result.score_breakdown?.experience_education || 0} />
          <MiniBar label="Contact Info" value={result.score_breakdown?.contact_info || 0} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? C.accent : C.card,
            color: tab === t.id ? "#fff" : C.muted,
            border: `1px solid ${tab === t.id ? C.accent : C.border}`,
            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            whiteSpace: "nowrap", transition: "all 0.2s",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>✅ STRENGTHS</div>
            {result.strengths?.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#b0c4ff", marginBottom: 8, paddingLeft: 10, borderLeft: `2px solid ${C.green}44` }}>{s}</div>)}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>⚠️ ISSUES</div>
            {result.critical_issues?.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#b0c4ff", marginBottom: 8, paddingLeft: 10, borderLeft: `2px solid ${C.red}44` }}>{s}</div>)}
          </div>
          {result.missing_sections?.length > 0 && (
            <div style={{ gridColumn: "1/-1", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 12, color: C.yellow, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>📋 MISSING SECTIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {result.missing_sections.map((s, i) => <span key={i} style={{ background: "#3d2d00", color: C.yellow, fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${C.yellow}33` }}>+ {s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "suggestions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result.suggestions?.map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 12 }}>
              <div style={{ width: 30, height: 30, background: C.accentDim, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <Badge priority={s.priority} />
                  <span style={{ fontSize: 11, color: C.accent }}>{s.section}</span>
                </div>
                <div style={{ fontSize: 13, color: "#c8d8ff", lineHeight: 1.6 }}>{s.tip}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "keywords" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>IN RESUME ADD KARO YE KEY POINTS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {result.key_points_to_add?.map((k, i) => (
              <span key={i} style={{ background: C.accentDim, border: `1px solid ${C.accent}44`, color: "#a0b4ff", fontSize: 12, padding: "6px 14px", borderRadius: 20 }}>+ {k}</span>
            ))}
          </div>
          <div style={{ marginTop: 20, background: C.bg, borderRadius: 10, padding: 14, fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            💡 <strong style={{ color: C.accent }}>ATS Tip:</strong> In keywords ko Skills, Summary aur Experience mein naturally use karo. Exact match bohot zaroori hai!
          </div>
        </div>
      )}

      {tab === "fresher" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result.fresher_tips?.map((tip, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 24 }}>{["🎓", "💡", "🚀", "⭐", "🔥"][i % 5]}</span>
              <div style={{ fontSize: 13, color: "#c8d8ff", lineHeight: 1.7 }}>{tip}</div>
            </div>
          ))}
          <div style={{ background: `linear-gradient(135deg, ${C.card}, ${C.accentDim})`, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: C.accent, fontSize: 15 }}>🏆 Fresher Mantra</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>ATS score 70+ hone par resume HR tak pahunchta hai. Projects, internships, aur strong skills section freshers ke liye game-changer hai!</div>
          </div>
        </div>
      )}
    </div>
  );
};

// BACKEND PLAN PAGE
const BackendPlanPage = ({ onBack }) => {
  const sections = [
    {
      icon: "🏗️", title: "Tech Stack", color: C.accent,
      items: [
        "Frontend: Next.js 14 (React) — fast, SEO-friendly",
        "Backend: Next.js API Routes (serverless) — no separate server needed",
        "Database: Supabase (PostgreSQL) — free tier, 500MB storage",
        "Auth: Supabase Auth — email/password + Google OAuth",
        "File Storage: Supabase Storage — PDF files store karein",
        "AI: Anthropic Claude API — resume analyze karne ke liye",
      ]
    },
    {
      icon: "🗄️", title: "Database Tables", color: C.green,
      items: [
        "users → id, name, email, created_at",
        "resumes → id, user_id, file_name, file_url, ats_score, created_at",
        "resume_analysis → id, resume_id, score_breakdown, suggestions, keywords (JSON)",
        "Row Level Security (RLS) — har user sirf apna data dekh sakta hai",
      ]
    },
    {
      icon: "🌐", title: "Hosting Plan", color: C.yellow,
      items: [
        "Vercel (FREE) — Next.js ke liye best, auto-deploy from GitHub",
        "Domain: Namecheap ya GoDaddy se ~₹800/year mein lo",
        "SSL: Vercel automatic HTTPS deta hai — extra cost nahi",
        "CDN: Vercel Edge Network globally fast delivery",
      ]
    },
    {
      icon: "💰", title: "Monthly Cost", color: "#c084fc",
      items: [
        "Vercel Free Plan — ₹0/month (100GB bandwidth)",
        "Supabase Free Plan — ₹0/month (500MB DB, 1GB storage)",
        "Claude API — ~₹0.8 per resume scan (Sonnet pricing)",
        "Total for 100 users: ~₹80-200/month only!",
      ]
    },
    {
      icon: "🔐", title: "Security", color: C.red,
      items: [
        "JWT tokens via Supabase Auth",
        "API key server-side rakho (.env) — client ko never dena",
        "Rate limiting: max 5 scans/day per free user",
        "File validation: sirf PDF/DOCX allow karein",
      ]
    },
    {
      icon: "🚀", title: "Deploy Steps", color: C.green,
      items: [
        "1. GitHub pe repo banao → next.js project push karo",
        "2. Supabase.com pe project banao → DB tables create karo",
        "3. Vercel.com pe connect karo GitHub repo se",
        "4. Environment variables add karo (Supabase keys, Claude API key)",
        "5. Deploy! Link share karo friends ke saath 🎉",
      ]
    },
  ];

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 60px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, marginBottom: 24 }}>← Back</button>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>🏗️ Full Backend Plan</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>Iss website ko properly deploy karne ka complete roadmap</p>
      <div style={{ display: "grid", gap: 14 }}>
        {sections.map(({ icon, title, color, items }) => (
          <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color }}>{title}</span>
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ fontSize: 12, color: "#b0c4ff", marginBottom: 8, paddingLeft: 12, borderLeft: `2px solid ${color}44`, lineHeight: 1.6 }}>
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [currentResult, setCurrentResult] = useState(null);

  if (!user) return (
    <>
      <style>{css}</style>
      <AuthPage onAuth={(u) => { setUser(u); setPage("dashboard"); }} />
    </>
  );

  const handleResult = (result) => { setCurrentResult(result); setPage("result"); };

  return (
    <>
      <style>{css}</style>
      {/* Navbar */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: 16 }}>ResumeIQ</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setPage("backend")} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>🏗️ Backend Plan</button>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.accent }}>
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <button onClick={() => setUser(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Logout</button>
        </div>
      </div>

      {page === "dashboard" && <Dashboard user={user} onNewScan={() => setPage("upload")} onViewResult={(r) => { setCurrentResult(r); setPage("result"); }} />}
      {page === "upload" && <UploadPage user={user} onResult={handleResult} onBack={() => setPage("dashboard")} />}
      {page === "result" && currentResult && <ResultsPage result={currentResult} onBack={() => setPage("dashboard")} onNewScan={() => setPage("upload")} />}
      {page === "backend" && <BackendPlanPage onBack={() => setPage("dashboard")} />}
    </>
  );
}