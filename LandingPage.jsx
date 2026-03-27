import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { VoicePoweredOrb } from "./components/common/VoicePoweredOrb";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { TextPlugin } from "gsap/TextPlugin";

// ─── Tokens ────────────────────────────────────────────────────────────────────
const SANS  = "'Space Grotesk', Arial, sans-serif";
const SERIF = "'DM Serif Display', Georgia, serif";
const BG    = "#f4f8ff";
const BG2   = "#e8f0ff";
const BG3   = "#ffffff";
const FG    = "#0b1340";
const FG2   = "#1e3a8a";
const FG3   = "#64748b";
const P     = "#2563eb";
const B3    = "#3b82f6";
const B4    = "#60a5fa";
const GRAD  = "linear-gradient(135deg,#1d4ed8,#60a5fa)";
const BDR   = "rgba(37,99,235,0.18)";
const BDR2  = "rgba(37,99,235,0.07)";
const SH    = "0 4px 32px rgba(37,99,235,0.12),0 1px 4px rgba(0,0,0,0.05)";
const SH_LG = "0 20px 60px rgba(37,99,235,0.28),0 4px 20px rgba(0,0,0,0.1)";
const DARK  = "#1a3f96";

// Roadmap phone mockup mountain data
const MTN = [
  {opacity:0.25,color:"#312e81",points:"0,100 8,72 16,80 24,65 32,75 42,58 52,68 60,55 70,62 80,50 88,58 96,46 100,52 100,100"},
  {opacity:0.35,color:"#4338ca",points:"0,100 5,78 12,85 20,70 30,80 38,63 48,72 57,60 65,68 73,55 82,63 90,52 100,58 100,100"},
  {opacity:0.5, color:"#4f46e5",points:"0,100 6,82 14,88 22,75 32,84 40,68 50,76 59,65 68,72 76,60 85,68 93,57 100,62 100,100"},
  {opacity:0.65,color:"#6366f1",points:"0,100 4,87 10,92 18,80 28,88 36,73 46,80 55,70 63,77 72,65 80,73 88,63 96,68 100,72 100,100"},
  {opacity:0.8, color:"#818cf8",points:"0,100 3,90 9,94 16,84 24,90 32,77 42,84 50,75 58,80 66,70 74,76 82,67 90,73 97,68 100,74 100,100"},
];

// Origin Finance's hero video (used as placeholder — replace with own asset)
const HERO_VIDEO_WEBM = "https://cdn.prod.website-files.com/68acbc076b672f730e0c77b9%2F68bb73e8d95f81619ab0f106_Clouds1-transcode.webm";
const HERO_VIDEO_MP4  = "https://cdn.prod.website-files.com/68acbc076b672f730e0c77b9%2F68bb73e8d95f81619ab0f106_Clouds1-transcode.mp4";
const HERO_POSTER     = "https://cdn.prod.website-files.com/68acbc076b672f730e0c77b9%2F68bb73e8d95f81619ab0f106_Clouds1-poster-00001.jpg";

// ─── Section gradient bridge ───────────────────────────────────────────────────
const SG = ({ from, to, h = 180 }) => (
  <div style={{ height: h, background: `linear-gradient(to bottom,${from},${to})`, flexShrink: 0, pointerEvents: "none" }}/>
);

// ─── Typing cycle ──────────────────────────────────────────────────────────────
const CHAT_STRINGS = [
  "What career paths match my strengths?",
  "How do I stand out in college applications?",
  "What should I focus on this semester?",
  "Am I on track to reach my goals?",
];

function useTypingCycle(strings, { typeSpeed=72, backSpeed=48, backDelay=4500, startDelay=600 } = {}) {
  const [text, setText]   = useState("");
  const [idx,  setIdx]    = useState(0);
  const [phase, setPhase] = useState("start");
  useEffect(() => {
    const full = strings[idx];
    if (phase === "start")    { const t = setTimeout(() => setPhase("typing"), startDelay); return () => clearTimeout(t); }
    if (phase === "typing")   {
      if (text.length < full.length) { const t = setTimeout(() => setText(full.slice(0, text.length + 1)), typeSpeed); return () => clearTimeout(t); }
      const t = setTimeout(() => setPhase("deleting"), backDelay); return () => clearTimeout(t);
    }
    if (phase === "deleting") {
      if (text.length > 0) { const t = setTimeout(() => setText(s => s.slice(0, -1)), backSpeed); return () => clearTimeout(t); }
      setIdx(i => (i + 1) % strings.length); setPhase("typing");
    }
  }, [text, phase, idx, strings, typeSpeed, backSpeed, backDelay, startDelay]);
  return text;
}

// ─── FadeUp ────────────────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, style = {} }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={iv ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }} style={style}>
      {children}
    </motion.div>
  );
}

// ─── FeatureScrollBox ────────────────────────────────────────────────────────
function FeatureScrollBox({ children, style = {} }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["0 1", "1 0"]
  });
  const scale = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0.65, 1.04, 1.04, 0.65]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.15, 1, 1, 0.15]);
  return (
    <motion.div ref={ref} style={{ scale, opacity, ...style }}>
      {children}
    </motion.div>
  );
}

// ─── Stagger ───────────────────────────────────────────────────────────────────
function Stagger({ children, style = {}, className }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} className={className} style={style}
      variants={{ hidden:{}, show:{ transition:{ staggerChildren:0.1 }}}}
      initial="hidden" animate={iv ? "show" : "hidden"}>
      {children}
    </motion.div>
  );
}
const iV = { hidden:{ opacity:0 }, show:{ opacity:1, transition:{ duration:0.6, ease:[0.22,1,0.36,1] }}};

// ─── Buttons ───────────────────────────────────────────────────────────────────
function GradBtn({ children, onClick, style = {} }) {
  return (
    <motion.button onClick={onClick} whileHover={{ scale:1.04, boxShadow:`0 16px 48px rgba(37,99,235,0.6),0 0 0 2px rgba(96,165,250,0.35)` }}
      whileTap={{ scale:0.97 }}
      style={{ fontFamily:SANS, fontSize:"0.875rem", fontWeight:600, color:"#fff",
        background:GRAD, border:"none", borderRadius:999, padding:"0.85rem 2rem", cursor:"pointer",
        display:"inline-flex", alignItems:"center", gap:8,
        boxShadow:`0 6px 28px rgba(37,99,235,0.42)`, transition:"background 0.3s", ...style }}>
      {children}
    </motion.button>
  );
}

function GlowBtn({ children, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ position:"relative", display:"inline-flex" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ position:"absolute", inset:-1, borderRadius:999, overflow:"hidden", pointerEvents:"none" }}>
        <motion.div animate={{ rotate:[0,360] }} transition={{ duration:2.5, repeat:Infinity, ease:"linear" }}
          style={{ position:"absolute", top:"50%", left:"50%", width:"200%", height:"200%",
            marginLeft:"-100%", marginTop:"-100%",
            background:"conic-gradient(from 0deg at 50% 50%,rgba(255,255,255,0.6) 0deg,rgba(255,255,255,0) 60deg,rgba(255,255,255,0) 300deg,rgba(255,255,255,0.6) 360deg)" }}/>
      </div>
      <div style={{ position:"absolute", inset:0, borderRadius:999,
        background:"radial-gradient(85% 120% at 50% 120%,rgba(255,255,255,0.25) 0%,transparent 100%)",
        opacity: hov ? 1 : 0, transition:"opacity 0.9s", pointerEvents:"none" }}/>
      <button onClick={onClick} style={{
        position:"relative", fontFamily:SANS, fontSize:"0.875rem", fontWeight:600, color:"#fff",
        background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:999,
        padding:"0.85rem 2rem", cursor:"pointer", display:"flex", alignItems:"center", gap:8,
        backdropFilter:"blur(12px)" }}>
        {children}
      </button>
    </div>
  );
}

function PlainBtn({ children, onClick, color = FG3 }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontFamily:SANS, fontSize:"0.875rem", fontWeight:500, color: hov ? FG : color,
        background:"transparent", border:"none", cursor:"pointer",
        display:"inline-flex", alignItems:"center", gap:6, transition:"color 0.2s" }}>
      {children}
    </button>
  );
}

// ─── Label / Heading ───────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{ display:"inline-flex", alignItems:"center", fontFamily:SANS, fontSize:"0.7rem",
      fontWeight:700, letterSpacing:"0.16em", textTransform:"uppercase",
      background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
      backgroundClip:"text",
      border:`1.5px solid rgba(37,99,235,0.28)`, borderRadius:999,
      padding:"5px 16px", marginBottom:"1.25rem",
      background2:`rgba(37,99,235,0.06)`,
      boxShadow:"0 0 16px rgba(37,99,235,0.1)",
      position:"relative", overflow:"hidden" }}>
      <span style={{
        position:"absolute",inset:0,borderRadius:999,
        background:"linear-gradient(135deg,rgba(37,99,235,0.08),rgba(96,165,250,0.04))",
        pointerEvents:"none"
      }}/>
      <span style={{
        fontFamily:SANS, fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.16em",
        background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text", position:"relative"
      }}>{children}</span>
    </div>
  );
}

function Heading({ italic, rest, size = "3rem", light = false }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true });
  return (
    <h2 ref={ref} style={{ margin:0, lineHeight:1.08 }}>
      <em style={{ fontFamily:SERIF, fontStyle:"italic", fontWeight:400, fontSize:size,
        background: light ? "linear-gradient(135deg,#93c5fd,#fff)" : GRAD,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text", display:"inline",
        filter: light ? "none" : "drop-shadow(0 0 18px rgba(37,99,235,0.35))" }}>{italic}{" "}</em>
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:size,
        color: light ? "rgba(255,255,255,0.95)" : FG }}>{rest}</span>
      <motion.div initial={{ scaleX:0 }} animate={iv ? { scaleX:1 } : {}}
        transition={{ duration:1, delay:0.4, ease:[0.22,1,0.36,1] }}
        style={{ height:3, width:"42%", background:GRAD, borderRadius:3, marginTop:14, originX:0,
          boxShadow:`0 0 20px rgba(37,99,235,0.6),0 0 40px rgba(37,99,235,0.25)` }}/>
    </h2>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
const Svg = ({ size=18, color=FG, ch }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ch}</svg>
);
const ArrowRight   = ({ color=FG, size=18 }) => <Svg size={size} color={color} ch={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>;
const ArrowUpRight = ({ color=FG3 }) => <Svg size={14} color={color} ch={<><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>}/>;
const Star         = () => <svg width="14" height="14" viewBox="0 0 24 24" fill={P}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const Check        = ({ color=P }) => <Svg size={14} color={color} ch={<polyline points="20 6 9 17 4 12"/>}/>;
const Mic          = ({ color="#fff", size=22 }) => <Svg size={size} color={color} ch={<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></>}/>;

// ─── Radar helpers ─────────────────────────────────────────────────────────────
const RA = ["Problem Solving","Communication","Creativity","Leadership","Technical"];
const RS = [0.88, 0.76, 0.91, 0.64, 0.78];
const rPt = (a,r,cx,cy) => { const rad=(a-90)*Math.PI/180; return {x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)}; };
const rPoly = (sc,R,cx,cy) => sc.map((s,i)=>{ const p=rPt(360/sc.length*i,s*R,cx,cy); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");


// ─── Voice Orb (WebGL, via VoicePoweredOrb) ────────────────────────────────────
function VoiceBlob() {
  const [isRecording, setIsRecording] = useState(false);
  const bars = [0.45,0.8,1,0.65,0.9,0.55,0.95,0.72,0.5,0.85,0.62,0.92,0.68,0.48,0.75];
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"1.5rem"}}>
      {/* Orb — transparent WebGL canvas, no clip/ring wrapper */}
      <div style={{position:"relative",width:340,height:340}}>
        <VoicePoweredOrb
          hue={0}
          enableVoiceControl={isRecording}
          style={{width:"100%",height:"100%"}}
        />
        {/* Center mic button, floating above the transparent canvas */}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <motion.button
            onClick={() => setIsRecording(r => !r)}
            whileHover={{scale:1.08,boxShadow:`0 0 50px rgba(37,99,235,0.8),0 0 100px rgba(37,99,235,0.35)`}}
            whileTap={{scale:0.95}}
            style={{width:68,height:68,borderRadius:"50%",background:GRAD,border:"none",cursor:"pointer",
              boxShadow:`0 0 32px rgba(37,99,235,0.65),0 0 64px rgba(37,99,235,0.28)`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Mic size={24}/>
          </motion.button>
          <motion.div animate={{opacity:[0.4,1,0.4]}} transition={{duration:1.8,repeat:Infinity}}>
            <span style={{fontFamily:SANS,fontSize:"0.58rem",color:isRecording?"#60a5fa":P,
              letterSpacing:"0.16em",fontWeight:700}}>
              {isRecording ? "LISTENING" : "TAP TO SPEAK"}
            </span>
          </motion.div>
        </div>
      </div>
      {/* Waveform */}
      <div style={{display:"flex",gap:3,alignItems:"center",height:30}}>
        {bars.map((h,i)=>(
          <motion.div key={i}
            animate={{scaleY: isRecording ? [h,h*0.18+0.05,h] : [h*0.3,h*0.08,h*0.3]}}
            transition={{duration:0.55+i*0.055,repeat:Infinity,ease:"easeInOut",delay:i*0.036}}
            style={{width:3.5,height:26,borderRadius:4,
              background:`rgba(37,99,235,${h*0.65+0.15})`,
              boxShadow:`0 0 6px rgba(37,99,235,${h*0.4})`,
              transformOrigin:"center"}}/>
        ))}
      </div>
      <div style={{fontFamily:SANS,fontSize:"0.75rem",color:FG3,fontStyle:"italic",textAlign:"center",maxWidth:300,lineHeight:1.7}}>
        "I really enjoy solving problems and building things..."
      </div>
    </div>
  );
}

// ─── Clean Radar (ScoreVisual) — floating on light bg, no card chrome ──────────
function ScoreVisual() {
  const SIZE=300, cx=150, cy=150, R=104;
  const ref=useRef(null); const iv=useInView(ref,{once:true,margin:"-50px"});
  const avg=Math.round(RS.reduce((a,b)=>a+b,0)/RS.length*100);
  return (
    <div ref={ref} style={{position:"relative",width:360,display:"flex",flexDirection:"column",alignItems:"center",gap:"1.75rem"}}>
      {/* Ambient glow backdrop */}
      <div style={{position:"absolute",top:"0%",left:"50%",transform:"translateX(-50%)",
        width:340,height:340,borderRadius:"50%",
        background:"radial-gradient(ellipse,rgba(37,99,235,0.14) 0%,rgba(99,102,241,0.06) 50%,transparent 72%)",
        filter:"blur(32px)",pointerEvents:"none"}}/>

      {/* Radar SVG — clean, light-mode */}
      <motion.div initial={{opacity:0,scale:0.92}} animate={iv?{opacity:1,scale:1}:{}}
        transition={{duration:0.9,ease:[0.22,1,0.36,1]}}
        style={{position:"relative",zIndex:1}}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible">
          <defs>
            <linearGradient id="rfill3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.55"/>
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.08"/>
            </linearGradient>
            <linearGradient id="rstroke3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#93c5fd"/>
            </linearGradient>
            <filter id="rdglow3" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feComposite in="SourceGraphic" in2="b" operator="over"/>
            </filter>
            <filter id="rpolyglow3" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="9" result="b"/>
              <feComposite in="SourceGraphic" in2="b" operator="over"/>
            </filter>
          </defs>
          {/* Grid rings */}
          {[1,0.75,0.5,0.25].map((r,ri)=>(
            <polygon key={r} points={rPoly([r,r,r,r,r],R,cx,cy)}
              fill={`rgba(37,99,235,${0.04+(1-r)*0.04})`}
              stroke={`rgba(37,99,235,${0.14+ri*0.07})`}
              strokeWidth={r===1?"1.5":"0.75"}/>
          ))}
          {/* Axis lines */}
          {RA.map((_,i)=>{ const p=rPt(360/5*i,R,cx,cy); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(37,99,235,0.15)" strokeWidth="1"/>; })}
          {/* Slow-rotating dashed ring */}
          <motion.g animate={{rotate:360}} transition={{duration:28,repeat:Infinity,ease:"linear"}}
            style={{transformOrigin:`${cx}px ${cy}px`}}>
            <circle cx={cx} cy={cy} r={R*0.93} fill="none" stroke="rgba(96,165,250,0.22)" strokeWidth="1" strokeDasharray="4 9"/>
          </motion.g>
          {/* Data polygon with glow */}
          <motion.g style={{transformOrigin:`${cx}px ${cy}px`}}
            initial={{scale:0,opacity:0}} animate={iv?{scale:1,opacity:1}:{}}
            transition={{duration:1.5,delay:0.3,ease:[0.22,1,0.36,1]}}>
            <motion.polygon points={rPoly(RS,R,cx,cy)} fill="url(#rfill3)"
              stroke="url(#rstroke3)" strokeWidth="4" strokeLinejoin="round"
              filter="url(#rpolyglow3)"
              animate={{opacity:[0.5,1,0.5]}} transition={{duration:3.2,repeat:Infinity}}/>
            <polygon points={rPoly(RS,R,cx,cy)} fill="url(#rfill3)" fillOpacity="0.68"
              stroke="url(#rstroke3)" strokeWidth="2" strokeLinejoin="round"/>
          </motion.g>
          {/* Data points */}
          {RS.map((s,i)=>{
            const p=rPt(360/5*i,s*R,cx,cy);
            return (
              <g key={i}>
                <motion.circle cx={p.x} cy={p.y} r="9" fill="none" stroke="rgba(96,165,250,0.4)"
                  animate={iv?{r:[9,20],opacity:[0.5,0]}:{}} transition={{duration:2.1,delay:1+i*0.18,repeat:Infinity}}/>
                <motion.circle cx={p.x} cy={p.y} r="5" fill={P} stroke="#fff" strokeWidth="2"
                  filter="url(#rdglow3)"
                  initial={{scale:0}} animate={iv?{scale:[1,1.25,1]}:{}}
                  transition={{duration:2.4,delay:0.9+i*0.14,repeat:Infinity}}/>
                {iv&&(()=>{ const lp=rPt(360/5*i,s*R+22,cx,cy);
                  return <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9.5" fill={P} fontFamily={SANS} fontWeight="700">{Math.round(s*100)}%</text>; })()}
              </g>
            );
          })}
          {/* Axis labels */}
          {RA.map((label,i)=>{ const p=rPt(360/5*i,R*1.3,cx,cy);
            return <text key={label} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="10.5" fill={FG3} fontFamily={SANS} fontWeight="600">{label}</text>; })}
          {/* Center badge — white with score */}
          <circle cx={cx} cy={cy} r={28} fill="white" stroke={BDR} strokeWidth="1.5"
            filter="url(#rdglow3)"/>
          <text x={cx} y={cy-5} textAnchor="middle" dominantBaseline="middle" fontSize="16" fill={P} fontFamily={SANS} fontWeight="800">{avg}</text>
          <text x={cx} y={cy+10} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill={FG3} fontFamily={SANS} fontWeight="700" letterSpacing="1">AVG</text>
        </svg>
      </motion.div>

      {/* Career matches — clean light cards */}
      <motion.div initial={{opacity:0,y:16}} animate={iv?{opacity:1,y:0}:{}}
        transition={{duration:0.7,delay:0.5,ease:[0.22,1,0.36,1]}}
        style={{width:"100%",position:"relative",zIndex:1}}>
        <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.65rem",color:FG3,
          letterSpacing:"0.13em",textTransform:"uppercase",marginBottom:"1rem"}}>Top Career Matches</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[["Software Engineer",88,"#2563eb"],["Product Designer",82,"#7c3aed"],["UX Researcher",76,"#0891b2"]].map(([m,s,col],i)=>(
            <div key={m} style={{background:"white",border:`1px solid ${BDR2}`,borderRadius:12,
              padding:"0.75rem 1rem",boxShadow:`0 2px 12px rgba(37,99,235,0.07)`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{fontFamily:SANS,fontSize:"0.82rem",fontWeight:600,color:FG}}>{m}</span>
                <span style={{fontFamily:SANS,fontSize:"0.82rem",color:col,fontWeight:700}}>{s}%</span>
              </div>
              <div style={{background:`rgba(37,99,235,0.06)`,borderRadius:999,height:5,overflow:"hidden"}}>
                <motion.div initial={{width:0}} animate={iv?{width:`${s}%`}:{}}
                  transition={{duration:1.2,delay:0.85+i*0.15,ease:[0.22,1,0.36,1]}}
                  style={{height:"100%",background:`linear-gradient(90deg,${col},${B4})`,borderRadius:999,
                    boxShadow:`0 0 8px ${col}70`}}/>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Roadmap Phone Mockup — steep Origin Finance tilt, real roadmap UI ─────────
// Milestone icon: inline recreation of the actual MilestoneIcon 3D button
function PhoneMilestone({ status="not_started", type="pencil", side="left" }) {
  const STATUS_CLR = { completed:"#22C55E", in_progress:"#3B82F6", not_started:"#1E2D4A", locked:"#0F172A", skipped:"#F97316" };
  const back = STATUS_CLR[status] ?? STATUS_CLR.not_started;
  const icons = {
    video:   <path d="M8 5v14l11-7z" fill="rgba(232,237,245,0.9)"/>,
    reading: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="rgba(232,237,245,0.9)" strokeWidth="2" fill="none" strokeLinecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="rgba(232,237,245,0.9)" strokeWidth="2" fill="none" strokeLinecap="round"/></>,
    pencil:  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke="rgba(232,237,245,0.9)" strokeWidth="2" fill="none" strokeLinecap="round"/>,
    lock:    <><rect x="3" y="11" width="18" height="11" rx="2" stroke="#94a3b8" strokeWidth="2" fill="none"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#94a3b8" strokeWidth="2" fill="none"/></>,
    check:   <polyline points="20 6 9 17 4 12" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>,
  };
  const icon = status==="completed" ? "check" : status==="locked" ? "lock" : type;
  return (
    <div style={{position:"relative",width:32,height:32,flexShrink:0,willChange:"transform"}}>
      {/* Back (status color, rotated) */}
      <div style={{position:"absolute",inset:0,borderRadius:7,background:back,
        transform:"rotate(8deg)",transformOrigin:"100% 100%",
        backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",
        boxShadow:"3px -3px 5px hsla(223,10%,10%,0.22)"}}/>
      {/* Front (frosted glass) */}
      <div style={{position:"absolute",inset:0,borderRadius:7,
        background:"rgba(255,255,255,0.22)",
        boxShadow:"0 0 0 1.2px rgba(255,255,255,0.28) inset",
        backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width="14" height="14" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          {icons[icon]}
        </svg>
      </div>
    </div>
  );
}

function RoadmapCard() {
  const ref=useRef(null); const iv=useInView(ref,{once:true,margin:"-50px"});
  // Real milestone data matching actual RoadmapPage layout
  const milestones=[
    {status:"completed", type:"video",    label:"Intro to Careers"},
    {status:"completed", type:"reading",  label:"Research Fields"},
    {status:"completed", type:"pencil",   label:"Self-Reflection"},
    {status:"in_progress",type:"project", label:"Build Profile"},
    {status:"not_started",type:"reading", label:"Find Mentors"},
    {status:"locked",    type:"pencil",   label:"Set Goals"},
  ];
  return (
    <div ref={ref} style={{position:"relative",display:"flex",justifyContent:"center",
      alignItems:"center",padding:"3rem 0 1rem"}}>
      {/* Large ambient blooms */}
      <div style={{position:"absolute",width:520,height:400,borderRadius:"50%",
        background:"radial-gradient(ellipse,rgba(99,102,241,0.35) 0%,rgba(37,99,235,0.12) 45%,transparent 70%)",
        filter:"blur(60px)",pointerEvents:"none",top:"10%",zIndex:0}}/>
      <div style={{position:"absolute",width:280,height:280,right:"5%",bottom:"5%",borderRadius:"50%",
        background:"radial-gradient(circle,rgba(37,99,235,0.2) 0%,transparent 65%)",
        filter:"blur(40px)",pointerEvents:"none",zIndex:0}}/>

      {/* iPhone — steep Origin Finance angle: rotateX≈38, rotateY≈-8, gentle free-float */}
      <motion.div
        initial={{opacity:0,y:80,rotateX:58,rotateY:-14}}
        animate={iv?{opacity:1,y:[0,-14,0],rotateX:38,rotateY:[-8,-6,-8],rotateZ:[0,0.6,0]}:{}}
        transition={{
          opacity:{duration:0.7,ease:[0.22,1,0.36,1]},
          y:{duration:6,repeat:Infinity,ease:"easeInOut",delay:0.8},
          rotateX:{duration:1.2,ease:[0.22,1,0.36,1]},
          rotateY:{duration:7,repeat:Infinity,ease:"easeInOut",delay:0.8},
          rotateZ:{duration:9,repeat:Infinity,ease:"easeInOut",delay:0.8},
        }}
        style={{
          transformPerspective:1100,
          willChange:"transform",
          position:"relative",zIndex:1,
          width:290,
          borderRadius:52,
          border:"11px solid #1c1c1e",
          outline:"1.5px solid rgba(255,255,255,0.08)",
          background:"#000",
          boxShadow:[
            "0 100px 180px rgba(0,0,0,0.8)",
            "0 0 0 1px rgba(255,255,255,0.05)",
            "0 0 130px rgba(99,102,241,0.32)",
            "0 0 260px rgba(37,99,235,0.14)",
          ].join(","),
          overflow:"hidden",
          contain:"layout paint style",
        }}>

        {/* Status bar — Dynamic Island */}
        <div style={{height:52,background:"#000",position:"relative"}}>
          <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",
            width:110,height:28,borderRadius:999,background:"#000",
            border:"1px solid rgba(255,255,255,0.07)"}}/>
          <span style={{position:"absolute",left:14,top:15,fontFamily:SANS,fontSize:"0.6rem",
            fontWeight:700,color:"rgba(255,255,255,0.9)"}}>9:41</span>
          <div style={{position:"absolute",right:13,top:15,display:"flex",gap:4,alignItems:"center"}}>
            <svg width="13" height="10" viewBox="0 0 14 10" fill="none">
              <rect x="0" y="6" width="2.5" height="4" rx="0.6" fill="rgba(255,255,255,0.82)"/>
              <rect x="3.8" y="4" width="2.5" height="6" rx="0.6" fill="rgba(255,255,255,0.82)"/>
              <rect x="7.6" y="2" width="2.5" height="8" rx="0.6" fill="rgba(255,255,255,0.82)"/>
              <rect x="11.4" y="0" width="2.5" height="10" rx="0.6" fill="rgba(255,255,255,0.25)"/>
            </svg>
            <div style={{display:"flex",alignItems:"center",gap:1}}>
              <div style={{width:20,height:10,borderRadius:3,border:"1.5px solid rgba(255,255,255,0.5)",
                padding:"1.5px",display:"flex",alignItems:"center"}}>
                <div style={{width:"74%",height:"100%",borderRadius:1.5,background:"rgba(255,255,255,0.85)"}}/>
              </div>
              <div style={{width:2,height:5,borderRadius:1,background:"rgba(255,255,255,0.35)"}}/>
            </div>
          </div>
        </div>

        {/* App screen — exact RoadmapPage background */}
        <div style={{height:540,position:"relative",overflow:"hidden",isolation:"isolate",
          background:"linear-gradient(180deg,#1e1b4b 0%,#312e81 25%,#6366f1 50%,#c7d2fe 70%,#f8fafc 100%)"}}>
          {/* Stars */}
          {[{t:"3%",l:"8%"},{t:"7%",l:"22%"},{t:"2%",l:"48%"},{t:"5%",l:"65%"},{t:"9%",l:"80%"},{t:"13%",l:"40%"},{t:"16%",l:"88%"}].map((s,i)=>(
            <motion.div key={i} animate={{opacity:[0.15,0.85,0.15],scale:[1,1.6,1]}}
              transition={{duration:2+i*0.45,repeat:Infinity,delay:i*0.3}}
              style={{position:"absolute",top:s.t,left:s.l,width:2,height:2,borderRadius:"50%",
                background:"#fff",boxShadow:"0 0 4px rgba(255,255,255,0.8)"}}/>
          ))}
          {/* Mountain silhouettes — exact RoadmapPage layers */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"26%",zIndex:1}}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"100%",display:"block"}}>
              {MTN.map((m,i)=><polygon key={i} points={m.points} fill={m.color} opacity={m.opacity}/>)}
            </svg>
          </div>

          {/* Top bar — exact match: white frosted glass, indigo wordmark, centered mode badge */}
          <div style={{position:"absolute",top:0,left:0,right:0,zIndex:5,height:38,
            background:"rgba(248,250,252,0.98)",
            borderBottom:"1px solid rgba(0,0,0,0.06)",
            display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px"}}>
            {/* Left: mentorable wordmark */}
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              <span style={{fontFamily:"system-ui,sans-serif",fontWeight:700,fontSize:"0.68rem",
                color:"#4f46e5",letterSpacing:"-0.03em"}}>mentorable</span>
              <div style={{width:3.5,height:3.5,borderRadius:"50%",background:"#6366f1",
                boxShadow:"0 0 5px rgba(99,102,241,0.7)",flexShrink:0,marginBottom:1}}/>
            </div>
            {/* Center: mode badge */}
            <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",
              display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",
              borderRadius:999,border:"1.5px solid rgba(59,130,246,0.25)",
              background:"rgba(59,130,246,0.06)"}}>
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
              </svg>
              <span style={{fontFamily:SANS,fontSize:"0.48rem",fontWeight:700,color:"#3b82f6"}}>Discovery Mode</span>
            </div>
            {/* Right: confidence meter stub */}
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              <span style={{fontFamily:SANS,fontSize:"0.46rem",color:"#64748b",fontWeight:600}}>72%</span>
              <div style={{width:28,height:5,borderRadius:999,background:"rgba(99,102,241,0.12)",overflow:"hidden"}}>
                <div style={{width:"72%",height:"100%",background:"linear-gradient(90deg,#6366f1,#818cf8)",borderRadius:999}}/>
              </div>
            </div>
          </div>

          {/* Phase 1 header card — exact PhaseHeader style: #1e1b4b bg */}
          <motion.div
            initial={{opacity:0,y:-8}} animate={iv?{opacity:1,y:0}:{}}
            transition={{duration:0.5,delay:0.3}}
            style={{position:"absolute",top:44,left:8,right:8,zIndex:3,
              background:"#1e1b4b",borderRadius:10,padding:"8px 10px",overflow:"hidden"}}>
            {/* Gradient overlay like actual PhaseHeader */}
            <div style={{position:"absolute",inset:0,borderRadius:10,
              background:"linear-gradient(135deg,rgba(99,102,241,0.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                <span style={{fontSize:"0.46rem",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",
                  color:"rgba(165,180,252,0.8)"}}>Phase 1</span>
                <span style={{fontSize:"0.46rem",fontWeight:600,color:"rgba(255,255,255,0.45)",
                  background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",
                  borderRadius:999,padding:"1px 5px"}}>4 weeks</span>
              </div>
              <div style={{fontFamily:"system-ui,sans-serif",fontWeight:700,fontSize:"0.62rem",color:"white",
                marginBottom:2,lineHeight:1.2}}>Career Discovery</div>
              <div style={{fontSize:"0.46rem",color:"rgba(255,255,255,0.55)",marginBottom:6,lineHeight:1.4}}>
                Explore your strengths and interests
              </div>
              {/* Progress bar */}
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:"0.44rem",color:"rgba(255,255,255,0.4)"}}>Progress</span>
                <span style={{fontSize:"0.44rem",color:"rgba(255,255,255,0.5)",fontWeight:600}}>3/6 milestones</span>
              </div>
              <div style={{height:4,background:"rgba(255,255,255,0.1)",borderRadius:999,overflow:"hidden"}}>
                <motion.div initial={{width:0}} animate={iv?{width:"50%"}:{}}
                  transition={{duration:0.8,delay:0.5,ease:[0.22,1,0.36,1]}}
                  style={{height:"100%",background:"linear-gradient(90deg,#6366f1,#818cf8)",borderRadius:999}}/>
              </div>
            </div>
          </motion.div>

          {/* Path line — center vertical, exact PathLine colors */}
          <div style={{position:"absolute",left:"50%",marginLeft:-1.5,top:148,bottom:60,width:3,zIndex:2,
            background:"linear-gradient(180deg,#3B82F6 0%,#22C55E 50%,rgba(30,45,74,0.6) 50%,rgba(30,45,74,0.3) 100%)",
            borderRadius:999}}/>

          {/* Milestones — alternating left/right of center path */}
          {/* Milestones — icon + label on same side, label always outside icon (away from path) */}
          <div style={{position:"absolute",top:152,left:0,right:0,zIndex:3,overflow:"hidden"}}>
            {milestones.map((m,i)=>{
              const side = i%2===0 ? "left" : "right";
              const labelColor = m.status==="completed"  ? "rgba(74,222,128,0.95)"
                               : m.status==="in_progress"? "#ffffff"
                               : m.status==="locked"     ? "rgba(148,163,184,0.55)"
                               : "rgba(255,255,255,0.52)";
              const labelEl = (
                <span style={{
                  fontSize:"0.54rem", fontWeight:m.status==="in_progress"?700:500,
                  color:labelColor, lineHeight:1.25, letterSpacing:"0.01em",
                  textShadow:m.status==="in_progress"?"0 0 8px rgba(59,130,246,0.7)":"none",
                  maxWidth:50, flexShrink:0,
                  textAlign:side==="left"?"right":"left",
                }}>{m.label}</span>
              );
              return (
                <motion.div key={i}
                  initial={{opacity:0,x:side==="left"?-12:12}} animate={iv?{opacity:1,x:0}:{}}
                  transition={{duration:0.4,delay:0.5+i*0.1}}
                  style={{display:"flex",alignItems:"center",marginBottom:10}}>
                  {/* Left half: for side=left show [label · icon] flush right; else empty */}
                  <div style={{width:"50%",display:"flex",justifyContent:"flex-end",
                    alignItems:"center",paddingRight:10,gap:5}}>
                    {side==="left" && <>{labelEl}<PhoneMilestone status={m.status} type={m.type} side={side}/></>}
                  </div>
                  {/* Right half: for side=right show [icon · label] flush left; else empty */}
                  <div style={{width:"50%",display:"flex",justifyContent:"flex-start",
                    alignItems:"center",paddingLeft:10,gap:5}}>
                    {side==="right" && <><PhoneMilestone status={m.status} type={m.type} side={side}/>{labelEl}</>}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Phase 2 locked card — visible on the light bottom of screen */}
          <motion.div
            initial={{opacity:0}} animate={iv?{opacity:1}:{}}
            transition={{duration:0.5,delay:1.2}}
            style={{position:"absolute",bottom:62,left:8,right:8,zIndex:3,
              background:"rgba(255,255,255,0.88)",
              border:"1.5px dashed rgba(99,102,241,0.5)",
              borderRadius:10,padding:"7px 10px",
              backdropFilter:"blur(6px)",
              boxShadow:"0 2px 12px rgba(99,102,241,0.12)",
              display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:18,height:18,borderRadius:5,background:"rgba(99,102,241,0.08)",
              border:"1px solid rgba(99,102,241,0.25)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <div style={{fontFamily:"system-ui,sans-serif",fontWeight:700,fontSize:"0.52rem",color:"#4338ca"}}>Phase 2 — Skills Building</div>
              <div style={{fontSize:"0.44rem",color:"#6366f1",marginTop:1,fontWeight:500}}>Complete Phase 1 to unlock</div>
            </div>
          </motion.div>
        </div>

        {/* Home indicator */}
        <div style={{height:20,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:100,height:4,borderRadius:999,background:"rgba(255,255,255,0.18)"}}/>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Data flow (arc paths + animated particles) ────────────────────────────────
function DataFlow() {
  const ref=useRef(null); const iv=useInView(ref,{once:true,margin:"-60px"});
  const steps=[
    {n:1,stat:"2 min",sub:"voice interview",title:"Voice Onboarding",desc:"Our AI listens to your 2-minute voice interview and extracts your profile, values, and career instincts automatically."},
    {n:2,stat:"92",sub:"avg score",title:"Skill Scorecard",desc:"See your 5-axis skill radar, top career path matches, and personalized strengths — all from your voice data."},
    {n:3,stat:"4",sub:"phases",title:"Adaptive Roadmap",desc:"Phase-by-phase milestones generated from your unique scorecard, updated as you hit goals and grow."},
    {n:4,stat:"24/7",sub:"availability",title:"AI Guidance",desc:"Ask anything, anytime. Every answer is grounded in your personal data — not generic advice."},
  ];
  const NODE_X=[125,375,625,875];
  const ARCS=[
    {d:"M 125 48 Q 250 8 375 48", x1:125,mx:250,x2:375},
    {d:"M 375 48 Q 500 8 625 48", x1:375,mx:500,x2:625},
    {d:"M 625 48 Q 750 8 875 48", x1:625,mx:750,x2:875},
  ];
  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      {/* Arc connector SVG */}
      <svg viewBox="0 0 1000 80" style={{width:"100%",height:80,overflow:"visible",display:"block",marginBottom:"1.5rem"}}>
        <defs>
          <linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#60a5fa"/>
          </linearGradient>
          <filter id="pf"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        {/* Static faint arcs */}
        {ARCS.map((a,i)=><path key={i} d={a.d} fill="none" stroke="rgba(37,99,235,0.1)" strokeWidth="2"/>)}
        {/* Animated drawing arcs */}
        {ARCS.map((a,i)=>(
          <motion.path key={i} d={a.d} fill="none" stroke="url(#ag)" strokeWidth="2.5"
            filter="url(#pf)"
            initial={{pathLength:0,opacity:0}} animate={iv?{pathLength:1,opacity:1}:{}}
            transition={{duration:0.9,delay:0.25+i*0.22,ease:[0.22,1,0.36,1]}}/>
        ))}
        {/* Traveling particles (cx/cy animate along arc shape) */}
        {iv && ARCS.map((a,i)=>
          [0,1,2].map(j=>(
            <motion.circle key={`${i}-${j}`} r="4" fill={B4} filter="url(#pf)"
              animate={{cx:[a.x1,a.mx,a.x2], cy:[48,8,48], opacity:[0,1,1,0]}}
              transition={{duration:1.8,delay:j*0.6+i*0.2,repeat:Infinity,ease:"easeInOut"}}/>
          ))
        )}
        {/* Node circles */}
        {NODE_X.map((x,i)=>(
          <motion.g key={i} initial={{scale:0}} animate={iv?{scale:1}:{}}
            transition={{duration:0.5,delay:0.1+i*0.15,ease:[0.22,1,0.36,1]}}
            style={{transformOrigin:`${x}px 48px`}}>
            <circle cx={x} cy={48} r={12} fill="white" stroke={BDR} strokeWidth="2"/>
            <circle cx={x} cy={48} r={12} fill="none" stroke={P} strokeWidth="2"
              strokeDasharray="75" strokeDashoffset={75*(1-RS[i]||0.8)}/>
            <text x={x} y={48} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fill={P} fontFamily={SANS} fontWeight="700">{i+1}</text>
          </motion.g>
        ))}
      </svg>
      {/* Cards */}
      <Stagger style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1.5rem"}}>
        {steps.map((s)=>(
          <motion.div key={s.n} variants={iV}
            whileHover={{scale:1.025,boxShadow:SH_LG}}
            style={{background:BG3,border:`1px solid ${BDR}`,borderRadius:20,
              padding:"2rem 1.5rem",display:"flex",flexDirection:"column",gap:16,
              boxShadow:SH,position:"relative",overflow:"hidden",transition:"box-shadow 0.25s"}}>
            {/* Top accent bar */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:GRAD,
              boxShadow:`0 0 16px rgba(37,99,235,0.5)`}}/>
            {/* Big stat */}
            <div>
              <div style={{fontFamily:SANS,fontWeight:700,fontSize:"2.6rem",color:P,
                lineHeight:1,letterSpacing:"-0.04em",
                textShadow:`0 0 30px rgba(37,99,235,0.3)`}}>{s.stat}</div>
              <div style={{fontFamily:SANS,fontSize:"0.68rem",color:FG3,textTransform:"uppercase",
                letterSpacing:"0.1em",marginTop:4,fontWeight:600}}>{s.sub}</div>
            </div>
            <div>
              <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.95rem",color:FG,marginBottom:8}}>{s.title}</div>
              <div style={{fontFamily:SANS,fontWeight:300,fontSize:"0.8rem",color:FG3,lineHeight:1.78}}>{s.desc}</div>
            </div>
          </motion.div>
        ))}
      </Stagger>
    </div>
  );
}

// ─── Noise ─────────────────────────────────────────────────────────────────────
const Noise = () => (
  <div style={{position:"fixed",inset:0,zIndex:9999,pointerEvents:"none",opacity:0.018}}>
    <svg width="100%" height="100%"><filter id="nf"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#nf)"/></svg>
  </div>
);

// ─── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const [sc,setSc]=useState(false);
  useEffect(()=>{ const h=()=>setSc(window.scrollY>80); window.addEventListener("scroll",h,{passive:true}); return ()=>window.removeEventListener("scroll",h); },[]);
  const go=p=>{ window.history.pushState({},""  ,p); window.dispatchEvent(new PopStateEvent("popstate")); };
  return (
    <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,
      padding:"1.1rem 2.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"2rem",
      background:sc?"rgba(255,255,255,0.95)":"transparent",
      backdropFilter:sc?"blur(24px)":"none",WebkitBackdropFilter:sc?"blur(24px)":"none",
      borderBottom:sc?`1px solid ${BDR}`:"1px solid transparent",
      boxShadow:sc?`0 2px 40px rgba(37,99,235,0.1),0 1px 4px rgba(0,0,0,0.04)`:"none",
      transition:"all 0.35s"}}>
      <div style={{fontFamily:SANS,fontWeight:700,fontSize:"1.05rem",letterSpacing:"-0.03em",flexShrink:0,
        color:sc?FG:"#fff",transition:"color 0.35s"}}>mentorable</div>
      <div style={{display:"flex",alignItems:"center",gap:"2rem",flex:1}}>
        {["Features","How it works","Roadmap"].map(l=>(
          <button key={l} style={{fontFamily:SANS,fontSize:"0.85rem",fontWeight:400,
            color:sc?FG3:"rgba(255,255,255,0.72)",background:"transparent",border:"none",cursor:"pointer",transition:"color 0.2s"}}
            onMouseEnter={e=>e.currentTarget.style.color=sc?FG:"#fff"}
            onMouseLeave={e=>e.currentTarget.style.color=sc?"#64748b":"rgba(255,255,255,0.72)"}>{l}</button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"1.25rem"}}>
        {sc?(
          <><PlainBtn onClick={()=>go("/auth")}>Log In</PlainBtn>
          <GradBtn onClick={()=>go("/auth")}>Get Started <ArrowRight color="#fff"/></GradBtn></>
        ):(
          <><PlainBtn onClick={()=>go("/auth")} color="rgba(255,255,255,0.68)">Log In</PlainBtn>
          <GlowBtn onClick={()=>go("/auth")}>Get Started <ArrowRight color="#fff"/></GlowBtn></>
        )}
      </div>
    </nav>
  );
}

// ─── Galaxy ────────────────────────────────────────────────────────────────────
const GSLOTS=[{angle:0,label:"Engineering",sub:"STEM & tech"},{angle:45,label:"Medicine",sub:"Health sciences"},{angle:90,label:"Design",sub:"Creative & UX"},{angle:135,label:"Law",sub:"Policy & advocacy"},{angle:180,label:"Business",sub:"Entrepreneurship"},{angle:225,label:"Research",sub:"Academia"},{angle:270,label:"Education",sub:"Teaching"},{angle:315,label:"Leadership",sub:"Civic & nonprofit"}];
function Galaxy() {
  const SZ=700,RAD=230,IS=152,SP=30;
  return (
    <div style={{position:"relative",width:SZ,height:SZ,flexShrink:0,overflow:"hidden"}}>
      <div style={{position:"absolute",top:"50%",left:"50%",width:RAD*2,height:RAD*2,borderRadius:"50%",
        border:`1px solid ${BDR}`,transform:"translate(-50%,-50%)",pointerEvents:"none",
        boxShadow:`0 0 80px rgba(37,99,235,0.08)`}}/>
      <motion.div animate={{rotate:360}} transition={{duration:SP,repeat:Infinity,ease:"linear"}} style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        {GSLOTS.map(({angle,label,sub})=>{
          const r=(angle-90)*Math.PI/180,gx=SZ/2+RAD*Math.cos(r),gy=SZ/2+RAD*Math.sin(r);
          return (
            <motion.div key={label} animate={{rotate:-360}} transition={{duration:SP,repeat:Infinity,ease:"linear"}}
              style={{position:"absolute",left:gx-IS/2,top:gy-IS/2,width:IS,height:IS}}>
              <div
                style={{width:"100%",height:"100%",borderRadius:18,background:BG3,border:`1px solid ${BDR}`,
                  boxShadow:SH,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,cursor:"default"}}>
                <div style={{fontFamily:SANS,fontWeight:600,fontSize:"0.82rem",color:FG,textAlign:"center",padding:"0 8px"}}>{label}</div>
                <div style={{fontFamily:SANS,fontSize:"0.62rem",color:FG3,textAlign:"center",padding:"0 8px"}}>{sub}</div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}>
        {[0,1,2].map(i=>(
          <motion.div key={i} animate={{scale:[1,1.65+i*0.2],opacity:[0.22,0]}}
            transition={{duration:2.8,delay:i*0.9,repeat:Infinity,ease:"easeOut"}}
            style={{position:"absolute",inset:-22-i*12,borderRadius:"50%",border:`1px solid rgba(37,99,235,0.25)`}}/>
        ))}
        <div style={{width:182,height:182,borderRadius:"50%",background:GRAD,
          boxShadow:`0 0 70px rgba(37,99,235,0.5),0 0 140px rgba(37,99,235,0.22)`,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
          <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.92rem",color:"#fff"}}>mentorable</div>
          <div style={{fontFamily:SANS,fontSize:"0.62rem",color:"rgba(255,255,255,0.72)",textAlign:"center",lineHeight:1.5,padding:"0 18px"}}>AI Career Mentor</div>
        </div>
      </div>
    </div>
  );
}

// ─── Ask Anything response data ────────────────────────────────────────────────
const RESPONSES=[
  {r:"Based on your creativity (91%) and problem-solving (88%), your top fits are Software Engineer, Product Designer, and UX Researcher.",tags:["Creativity: 91%","Problem Solving: 88%","Technical: 78%"]},
  {r:"Your voice interview flagged strong leadership instincts. Lead with project outcomes — admissions teams respond to students who started things.",tags:["Communication: 76%","Self-Starter","Leadership: 64%"]},
  {r:"You're 2 milestones from finishing Phase 1. Reaching out to one mentor this month pushes your confidence score above 80.",tags:["Phase 1: 50%","Confidence: 72%","2 tasks left"]},
  {r:"Tracking ahead of schedule. Your scorecard improved 12 points since onboarding and your engagement is in the top 20% of students.",tags:["Score: 92/100","+12 since start","Top 20%"]},
];

// Module-level flag: resets on every page load/refresh, persists within SPA navigation
let _introPlayed = false;

// ─── Intro Animation ───────────────────────────────────────────────────────────
function IntroAnimation({ onComplete }) {
  const wrapperRef   = useRef(null);
  const bgRef        = useRef(null);
  const textContRef  = useRef(null);
  const brandRef     = useRef(null);
  const svgRef       = useRef(null);
  const path1Ref     = useRef(null);
  const path2Ref     = useRef(null);
  const path3Ref     = useRef(null);
  const dot1Ref      = useRef(null);
  const dot2Ref      = useRef(null);
  const dot3Ref      = useRef(null);
  const finalTextRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    gsap.registerPlugin(MotionPathPlugin, TextPlugin);

    let tl;

    // Defer one rAF so SVG is fully laid out and getTotalLength() works
    const rafId = requestAnimationFrame(() => {
      const paths = [path1Ref.current, path2Ref.current, path3Ref.current];
      paths.forEach(p => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 });
      });

      // Initial states
      gsap.set(brandRef.current, { y: 20, opacity: 0 });
      gsap.set([dot1Ref.current, dot2Ref.current, dot3Ref.current], {
        scale: 0, opacity: 0, transformOrigin: "50% 50%"
      });

      tl = gsap.timeline({
        onComplete: () => {
          document.body.style.overflow = "";
          onCompleteRef.current?.();
        }
      });
      tl.timeScale(1.5);

      // 1. Brand text rises in
      tl.to(brandRef.current, { y: 0, opacity: 1, duration: 1.5, ease: "power2.out" }, 0.5);

      // 2. Dots appear
      tl.to([dot1Ref.current, dot2Ref.current, dot3Ref.current], {
        scale: 1, opacity: 1, duration: 0.4, stagger: 0.1, ease: "back.out(1.5)"
      }, 1.5);

      // 3. Thinking wave — bounce using SVG attr cy
      const d1 = dot1Ref.current, d2 = dot2Ref.current, d3 = dot3Ref.current;
      tl.to(d1, { attr: { cy: 300 }, duration: 0.35, yoyo: true, repeat: 5, ease: "sine.inOut" }, 2.0);
      tl.to(d2, { attr: { cy: 300 }, duration: 0.35, yoyo: true, repeat: 5, ease: "sine.inOut" }, 2.12);
      tl.to(d3, { attr: { cy: 300 }, duration: 0.35, yoyo: true, repeat: 5, ease: "sine.inOut" }, 2.24);

      // 4. All dots merge to center node (400, 380)
      tl.to(d1, { attr: { cx: 400, cy: 380 }, duration: 0.55, ease: "power3.inOut" }, 4.4);
      tl.to(d2, { attr: { cx: 400, cy: 380 }, duration: 0.55, ease: "power3.inOut" }, 4.4);
      tl.to(d3, { attr: { cx: 400, cy: 380 }, duration: 0.55, ease: "power3.inOut" }, 4.4);

      // 5. Lines draw outward
      tl.to(paths, { strokeDashoffset: 0, opacity: 1, duration: 1.8, ease: "power2.inOut" }, 5.3);

      // 6. Dots travel along paths
      tl.to(d1, { duration: 3.5, ease: "power2.inOut", motionPath: { path: path1Ref.current, align: path1Ref.current, alignOrigin: [0.5, 0.5] } }, 5.8);
      tl.to(d2, { duration: 3.8, ease: "power2.inOut", motionPath: { path: path2Ref.current, align: path2Ref.current, alignOrigin: [0.5, 0.5] } }, 5.8);
      tl.to(d3, { duration: 3.2, ease: "power2.inOut", motionPath: { path: path3Ref.current, align: path3Ref.current, alignOrigin: [0.5, 0.5] } }, 5.8);

      // 7. Highlight path3, fade others
      tl.to([path1Ref.current, path2Ref.current, d1, d2], { opacity: 0, duration: 0.9, ease: "power2.inOut" }, 9.2);
      tl.to(path3Ref.current, { stroke: "#2563EB", strokeWidth: 16, duration: 0.9, ease: "power2.inOut" }, 9.2);

      // 8. Zoom dot3 to fill screen — use attr r instead of scale (SVG-safe)
      tl.to(d3, { attr: { r: 3200 }, duration: 2, ease: "power2.in" }, 9.8);

      // Make bg blue at the same moment as the dot fills screen
      tl.to(bgRef.current, { backgroundColor: "#2563EB", duration: 0.15 }, 11.5);
      tl.to([textContRef.current, path1Ref.current, path2Ref.current, path3Ref.current], { opacity: 0, duration: 0.1 }, 11.5);

      // 9. Final typed message
      tl.to(finalTextRef.current, { text: "Ready to start your journey?", duration: 2.2, ease: "power1.inOut" }, 12.0);

      // 10. Fade everything out
      tl.to(finalTextRef.current, { opacity: 0, duration: 1.2, ease: "power2.inOut" }, 15.2);
      tl.to(svgRef.current, { opacity: 0, duration: 1.2, ease: "power2.inOut" }, 15.2);
      tl.to(wrapperRef.current, { opacity: 0, duration: 1.2, ease: "power2.inOut" }, 15.2);
    });

    return () => {
      cancelAnimationFrame(rafId);
      document.body.style.overflow = "";
      tl?.kill();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", justifyContent: "center", alignItems: "center",
      pointerEvents: "all"
    }}>
      {/* Solid background */}
      <div ref={bgRef} style={{ position: "absolute", inset: 0, backgroundColor: "#FAFAFA", zIndex: 1 }} />

      {/* Centered stage */}
      <div style={{ position: "relative", width: 800, height: 600, zIndex: 5 }}>
        <div ref={textContRef} style={{ position: "absolute", top: 180, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10 }}>
          <h1 ref={brandRef} style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: 84, fontWeight: 500, color: "#2A2B2E", margin: 0, letterSpacing: "-2px" }}>mentorable</h1>
        </div>

        <svg ref={svgRef} viewBox="0 0 800 600" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 15, overflow: "visible" }}>
          <defs>
            <filter id="anim-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <path ref={path1Ref} d="M 400 380 C 350 440, 200 460, 120 550" fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round"/>
          <path ref={path2Ref} d="M 400 380 C 400 450, 400 500, 400 600" fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round"/>
          <path ref={path3Ref} d="M 400 380 C 450 440, 600 460, 680 550" fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round"/>

          <circle ref={dot1Ref} cx="370" cy="310" r="8" fill="#2563EB" filter="url(#anim-glow)"/>
          <circle ref={dot2Ref} cx="400" cy="310" r="8" fill="#2563EB" filter="url(#anim-glow)"/>
          <circle ref={dot3Ref} cx="430" cy="310" r="8" fill="#2563EB" filter="url(#anim-glow)"/>
        </svg>
      </div>

      {/* Final message */}
      <div style={{ position: "fixed", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", zIndex: 50, pointerEvents: "none" }}>
        <h1 ref={finalTextRef} style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: 80, fontWeight: 600, color: "#FFFFFF", margin: 0, letterSpacing: "-2.5px", textAlign: "center", lineHeight: 1.1, maxWidth: 1200, padding: "0 40px" }}></h1>
      </div>
    </div>
  );
}

// ─── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const go=p=>{ window.history.pushState({},""  ,p); window.dispatchEvent(new PopStateEvent("popstate")); };

  const typedText = useTypingCycle(CHAT_STRINGS);
  // Detect when typing has completed (text exactly matches one of the strings)
  const matchedIdx = CHAT_STRINGS.findIndex(s => s === typedText);
  const typingDone = matchedIdx >= 0;
  // Keep the last valid response visible during the exit animation
  const [savedIdx, setSavedIdx] = useState(0);
  useEffect(() => { if(matchedIdx >= 0) setSavedIdx(matchedIdx); }, [matchedIdx]);
  const cur = RESPONSES[savedIdx];
  const [showIntro, setShowIntro] = useState(() => !_introPlayed);

  return (
    <div style={{background:BG,minHeight:"100vh",color:FG,fontFamily:SANS,fontSize:16,lineHeight:"150%",overflowX:"hidden"}}>
      {showIntro && <IntroAnimation onComplete={() => { _introPlayed = true; window.scrollTo(0, 0); setShowIntro(false); }} />}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        html,body{overflow-x:hidden;max-width:100%;overflow-anchor:none;}
        *{box-sizing:border-box;margin:0;padding:0;}
        @media(max-width:900px){
          .lp-s{flex-direction:column!important;text-align:center;}
          .lp-hv{display:none!important;}
          .lp-g4{grid-template-columns:1fr 1fr!important;}
          .lp-gx{display:none!important;}
          .lp-fg{grid-template-columns:1fr!important;}
          .lp-fi{display:none!important;}
        }
        @media(max-width:560px){.lp-g4{grid-template-columns:1fr!important;}}
      `}</style>
      <Noise/>

      <Navbar/>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section
        style={{position:"relative",minHeight:"100vh",display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",padding:"8rem 2.5rem 5rem",
          textAlign:"center",overflow:"hidden",background:BG}}>
        {/* Origin Finance's cinematic clouds video */}
        <video autoPlay loop muted playsInline poster={HERO_POSTER}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",
            zIndex:0,opacity:0.88}}>
          <source src={HERO_VIDEO_WEBM} type="video/webm"/>
          <source src={HERO_VIDEO_MP4}  type="video/mp4"/>
        </video>
        {/* Gradient overlay — deep dark top, fades to soft blue-white at very bottom */}
        <div style={{position:"absolute",inset:0,zIndex:1,
          background:"linear-gradient(to bottom,rgba(5,3,28,0.85) 0%,rgba(8,15,55,0.75) 42%,rgba(20,45,110,0.5) 68%,rgba(180,210,255,0.22) 88%,rgba(244,248,255,0) 100%)"}}/>
        {/* Blue ambient orbs */}
        {[{w:400,h:400,t:"10%",l:"5%",o:0.14},{w:280,h:280,t:"60%",l:"78%",o:0.11}].map((o,i)=>(
          <motion.div key={i} style={{position:"absolute",width:o.w,height:o.h,borderRadius:"50%",
            background:"radial-gradient(circle,rgba(37,99,235,1) 0%,transparent 70%)",
            filter:"blur(55px)",top:o.t,left:o.l,zIndex:1,opacity:o.o}}
            animate={{scale:[1,1.25,1],opacity:[o.o,o.o*1.8,o.o]}}
            transition={{duration:7+i*3,repeat:Infinity,ease:"easeInOut"}}/>
        ))}
        {/* Hero content — revealed when page fades in after intro */}
        <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <FadeUp>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 14px",
              border:"1px solid rgba(255,255,255,0.24)",borderRadius:999,marginBottom:"2rem",
              background:"rgba(255,255,255,0.08)",backdropFilter:"blur(12px)"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 8px #22c55e"}}/>
              <span style={{fontFamily:SANS,fontSize:"0.72rem",color:"rgba(255,255,255,0.85)"}}>AI-powered career guidance for high schoolers</span>
            </div>
          </FadeUp>
          <FadeUp delay={0.05}>
            <h1 style={{margin:"0 0 1.5rem",maxWidth:760,letterSpacing:"-0.025em"}}>
              <motion.span
                initial={{opacity:0,y:24}} animate={{opacity:1,y:0}}
                transition={{duration:0.7,ease:[0.22,1,0.36,1]}}
                style={{
                  fontFamily:SANS, fontWeight:700,
                  fontSize:"clamp(3.8rem,8vw,7rem)", lineHeight:1.0,
                  background:"linear-gradient(135deg,#ffffff 0%,#93c5fd 55%,#60a5fa 100%)",
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                  backgroundClip:"text", display:"block",
                  filter:"drop-shadow(0 0 40px rgba(147,197,253,0.45))",
                }}>Own your future.</motion.span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p style={{fontFamily:SANS,fontWeight:500,fontSize:"1.2rem",color:"rgba(255,255,255,0.88)",
              lineHeight:1.75,maxWidth:560,margin:"0 0 0.6rem"}}>
              Mentorable is your personal AI career mentor.
            </p>
            <p style={{fontFamily:SANS,fontWeight:400,fontSize:"0.97rem",color:"rgba(255,255,255,0.5)",
              lineHeight:1.9,maxWidth:520,margin:"0 0 2.75rem"}}>
              Discover your strengths, get a personalized roadmap, and take action — all from a 2-minute voice conversation.
            </p>
          </FadeUp>
          <FadeUp delay={0.2}>
            <div style={{display:"flex",alignItems:"center",gap:"1rem",flexWrap:"wrap",justifyContent:"center"}}>
              <GlowBtn onClick={()=>go("/auth")}>Get Started <ArrowRight color="#fff"/></GlowBtn>
              <motion.button
                onClick={()=>document.getElementById("hiw")?.scrollIntoView({behavior:"smooth"})}
                whileHover={{background:"rgba(255,255,255,0.18)",borderColor:"rgba(255,255,255,0.5)"}}
                style={{fontFamily:SANS,fontSize:"0.9rem",fontWeight:600,color:"#fff",
                  background:"rgba(255,255,255,0.1)",
                  border:"1.5px solid rgba(255,255,255,0.32)",borderRadius:999,
                  padding:"0.82rem 1.75rem",cursor:"pointer",
                  display:"inline-flex",alignItems:"center",gap:8,
                  backdropFilter:"blur(10px)",transition:"background 0.2s,border-color 0.2s"}}>
                How it works <ArrowUpRight color="rgba(255,255,255,0.85)"/>
              </motion.button>
            </div>
          </FadeUp>
        </div>
        <motion.div animate={{y:[0,9,0],opacity:[0.35,0.75,0.35]}} transition={{duration:2.2,repeat:Infinity}}
          style={{position:"absolute",bottom:"2.5rem",left:"50%",transform:"translateX(-50%)",zIndex:2}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
        </motion.div>
      </section>

      {/* hero → light — sky-blue bridge */}
      <SG from="rgba(190,215,255,0.55)" to={BG} h={160}/>

      {/* ── SIMPLIFY YOUR JOURNEY ─────────────────────────────────────────────── */}
      <section id="hiw" style={{padding:"4rem 2.5rem 7rem",background:BG}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <FadeUp style={{marginBottom:"5rem",maxWidth:580}}>
            <Heading italic="Simplify" rest="your journey." size="clamp(2.8rem,5vw,4rem)"/>
          </FadeUp>
          {[
            {tag:"VOICE ONBOARDING",title:"Know yourself.",
              desc:"Talk for two minutes. Our AI listens for signals that forms and surveys miss — extracting your values, passions, and working style with precision.",
              items:["Interests and passions","Work style and values","Career curiosity and goals","Communication patterns"],
              visual:<VoiceBlob/>,
              bg:"linear-gradient(135deg,#f0f9ff 0%,#dbeafe 55%,#f0f9ff 100%)"},
            {tag:"SCORECARD",title:"See your strengths.",
              desc:"Get a personalized card that maps your skills, top career matches, and growth areas. Visual, shareable, and permanently yours.",
              items:["5-dimension skill radar","Top career path matches","Strength and growth labels","Downloadable + shareable"],
              visual:<ScoreVisual/>,
              bg:"linear-gradient(135deg,#eef2ff 0%,#c7d2fe 55%,#eef2ff 100%)"},
            {tag:"ROADMAP",title:"Follow your path.",
              desc:"A phase-by-phase career guide built specifically for you, updated as you take action and grow toward your goals.",
              items:["Phase-by-phase milestones","Adaptive to your progress","Confidence direction score","Unlocks as you grow"],
              visual:<RoadmapCard/>,
              bg:"linear-gradient(135deg,#faf5ff 0%,#ddd6fe 55%,#faf5ff 100%)"},
          ].map((feat,i)=>(
            <FeatureScrollBox key={feat.tag}>
              {/* Per-row wrapper */}
              <div style={{
                position:"relative",
                paddingTop:"3.5rem",
                paddingBottom:"3.5rem",
                marginBottom:"2.5rem",
              }}>
                {/* Full-width colored band — fills wrapper height exactly, extends horizontally */}
                {feat.bg && (
                  <div style={{
                    position:"absolute",
                    top:0, bottom:0,
                    left:"-7rem", right:"-7rem",
                    background:feat.bg,
                    borderRadius:36,
                    zIndex:0,
                    pointerEvents:"none",
                  }}/>
                )}

                <div style={{position:"relative",zIndex:1}}>
                  <div className="lp-s" style={{
                    display:"flex",alignItems:"center",gap:"5rem",
                    flexDirection:i%2===0?"row":"row-reverse",
                  }}>
                    {/* Cluely-style text panel */}
                    <div style={{flex:"0 0 44%"}}>
                      <div style={{
                        background: feat.bg ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.92)",
                        border:`1px solid rgba(37,99,235,${feat.bg?"0.14":"0.11"})`,
                        borderRadius:22,
                        padding:"2.25rem 2.5rem",
                        boxShadow:"0 4px 40px rgba(37,99,235,0.09),0 1px 4px rgba(0,0,0,0.04)",
                        backdropFilter:"blur(8px)",
                      }}>
                        <Label>{feat.tag}</Label>
                        <h3 style={{fontFamily:SANS,fontWeight:700,fontSize:"clamp(2rem,3.5vw,2.6rem)",
                          lineHeight:1.12,color:FG,marginBottom:"1rem",letterSpacing:"-0.02em"}}>{feat.title}</h3>
                        <p style={{fontFamily:SANS,fontWeight:400,fontSize:"0.92rem",color:FG3,
                          lineHeight:1.9,marginBottom:"1.75rem",maxWidth:380}}>{feat.desc}</p>
                        <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:13}}>
                          {feat.items.map(it=>(
                            <li key={it} style={{display:"flex",alignItems:"center",gap:12}}>
                              <div style={{width:20,height:20,borderRadius:6,background:`rgba(37,99,235,0.08)`,
                                border:`1px solid rgba(37,99,235,0.18)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                <Check/>
                              </div>
                              <span style={{fontFamily:SANS,fontSize:"0.875rem",color:FG2,fontWeight:500}}>{it}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="lp-fi" style={{flex:1,display:"flex",justifyContent:"center"}}>
                      {/* RoadmapCard has its own float — skip the outer float to avoid stacked transforms */}
                      {i === 2 ? feat.visual : (
                        <motion.div animate={{y:[0,-10,0]}} transition={{duration:5+i*1.2,repeat:Infinity,ease:"easeInOut"}}>
                          {feat.visual}
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </FeatureScrollBox>
          ))}
        </div>
      </section>

      {/* light → dark navy — TALL multi-stop for dramatic fade-in */}
      <div style={{height:380,background:`linear-gradient(to bottom,${BG} 0%,rgba(180,205,255,0.7) 28%,rgba(37,80,200,0.55) 58%,${DARK} 100%)`,pointerEvents:"none",flexShrink:0}}/>

      {/* ── ASK ANYTHING (dark island) ────────────────────────────────────────── */}
      <section style={{padding:"4rem 2.5rem 7rem",background:DARK,position:"relative",overflow:"hidden"}}>
        {/* Ambient orbs */}
        <div style={{position:"absolute",top:"-15%",left:"-8%",width:600,height:600,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(37,99,235,0.22) 0%,transparent 65%)",
          filter:"blur(70px)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:"-10%",right:"-6%",width:440,height:440,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(59,130,246,0.14) 0%,transparent 65%)",
          filter:"blur(60px)",pointerEvents:"none"}}/>
        <div style={{maxWidth:900,margin:"0 auto",position:"relative",zIndex:1}}>
          <FadeUp style={{marginBottom:"3.5rem"}}>
            <Heading italic="Ask" rest="anything." size="clamp(2.8rem,5vw,4rem)" light/>
            <p style={{fontFamily:SANS,fontWeight:300,fontSize:"0.95rem",
              color:"rgba(255,255,255,0.48)",lineHeight:1.95,maxWidth:480,marginTop:"1.1rem"}}>
              Every answer is grounded in your personal scorecard, roadmap, and real-world progress — not generic advice.
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div style={{position:"relative", minHeight: 340}}>
              {/* Rotating conic glow border */}
              <div style={{position:"absolute",inset:-1,borderRadius:20,overflow:"hidden",pointerEvents:"none"}}>
                <motion.div animate={{rotate:[0,360]}} transition={{duration:8,repeat:Infinity,ease:"linear"}}
                  style={{position:"absolute",top:"50%",left:"50%",width:"220%",height:"220%",marginLeft:"-110%",marginTop:"-110%",
                    background:"conic-gradient(from 0deg,rgba(37,99,235,0.7) 0deg,transparent 50deg,transparent 310deg,rgba(37,99,235,0.7) 360deg)"}}/>
              </div>
              {/* Card */}
              <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))",
                border:"1px solid rgba(255,255,255,0.07)",borderRadius:20,overflow:"hidden",
                boxShadow:`0 0 100px rgba(37,99,235,0.15),0 30px 80px rgba(0,0,0,0.5)`}}>
                {/* Input bar */}
                <div style={{padding:"1.2rem 1.6rem",
                  background:"linear-gradient(0deg,#0c1020,#181f35)",
                  borderBottom:"1px solid rgba(255,255,255,0.06)",
                  display:"flex",alignItems:"center",gap:14}}>
                  {/* Live indicator */}
                  <motion.div animate={{opacity:[1,0.2,1]}} transition={{duration:1.3,repeat:Infinity}}
                    style={{width:9,height:9,borderRadius:"50%",background:B4,flexShrink:0,
                      boxShadow:`0 0 12px ${B4}`}}/>
                  {/* Typed text */}
                  <span style={{fontFamily:"'Roboto Mono',monospace",fontSize:"0.92rem",color:"rgba(255,255,255,0.92)",
                    flex:1,minHeight:"1.3em",letterSpacing:"0.01em"}}>
                    {typedText}
                    <motion.span animate={{opacity:[1,0,1]}} transition={{duration:0.95,repeat:Infinity}}
                      style={{display:"inline-block",width:2,height:"0.85em",background:B4,
                        verticalAlign:"text-bottom",marginLeft:2,boxShadow:`0 0 8px ${B4}`}}/>
                  </span>
                  <div style={{padding:"5px 14px",background:`rgba(37,99,235,0.22)`,
                    border:`1px solid rgba(37,99,235,0.4)`,borderRadius:999,
                    fontFamily:SANS,fontSize:"0.65rem",color:B4,fontWeight:700,letterSpacing:"0.09em",flexShrink:0}}>
                    MENTORABLE AI
                  </div>
                </div>
                {/* Response — appears when typing completes */}
                <AnimatePresence>
                  {typingDone && (
                    <motion.div
                      initial={{opacity:0,height:0}}
                      animate={{opacity:1,height:"auto", transition:{duration:0.55,ease:[0.22,1,0.36,1]}}}
                      exit={{opacity:0,height:0, transition:{duration:1.6,ease:[0.4,0,0.2,1]}}}>
                      {/* White response panel */}
                      <div style={{background:"#ffffff",borderTop:"1px solid rgba(37,99,235,0.1)",
                        display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                        <div style={{padding:"1.75rem",borderRight:"1px solid rgba(37,99,235,0.08)"}}>
                          <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.68rem",color:FG3,
                            letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"0.85rem"}}>Insight</div>
                          <motion.p initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                            transition={{duration:0.45,delay:0.1}}
                            style={{fontFamily:SANS,fontWeight:400,fontSize:"0.875rem",
                              color:FG,lineHeight:1.9}}>
                            {cur.r}
                          </motion.p>
                        </div>
                        <div style={{padding:"1.75rem"}}>
                          <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.68rem",color:FG3,
                            letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"0.85rem"}}>Context signals</div>
                          <div style={{display:"flex",flexDirection:"column",gap:9}}>
                            {cur.tags.map((tag,i)=>(
                              <motion.div key={tag} initial={{opacity:0,x:14}} animate={{opacity:1,x:0}}
                                transition={{duration:0.4,delay:0.18+i*0.11}}
                                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                                  background:`rgba(37,99,235,0.05)`,border:`1px solid ${BDR}`,
                                  borderRadius:10}}>
                                <div style={{width:5,height:5,borderRadius:"50%",background:P,flexShrink:0,
                                  boxShadow:`0 0 6px rgba(37,99,235,0.5)`}}/>
                                <span style={{fontFamily:SANS,fontSize:"0.82rem",fontWeight:500,color:FG2}}>{tag}</span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* dark navy → light — TALL multi-stop fade-out */}
      <div style={{height:380,background:`linear-gradient(to bottom,${DARK} 0%,rgba(37,80,200,0.55) 42%,rgba(180,205,255,0.7) 72%,${BG} 100%)`,pointerEvents:"none",flexShrink:0}}/>

      {/* ── GALAXY ────────────────────────────────────────────────────────────── */}
      <section style={{padding:"4rem 2.5rem 7rem",background:BG,overflow:"hidden"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div className="lp-s" style={{display:"flex",alignItems:"center",gap:"5rem"}}>
            <FadeUp style={{flex:"0 0 36%"}}>
              <Label>Mentorable AI</Label>
              <Heading italic="Grow" rest="your potential." size="clamp(2.4rem,4vw,3.2rem)"/>
              <p style={{fontFamily:SANS,fontWeight:300,fontSize:"0.95rem",color:FG3,
                lineHeight:1.95,marginTop:"1.25rem",maxWidth:360}}>
                Mentorable AI synthesizes your voice interview, scorecard, and real-world progress to guide you toward any career domain — and many more beyond these eight.
              </p>
              <button onClick={()=>go("/auth")}
                style={{fontFamily:SANS,fontSize:"0.72rem",fontWeight:700,letterSpacing:"0.1em",
                  textTransform:"uppercase",color:P,background:"transparent",border:"none",
                  cursor:"pointer",marginTop:"2rem",display:"flex",alignItems:"center",gap:6,transition:"opacity 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.opacity="0.55"}
                onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                More about Mentorable AI <ArrowRight color={P} size={14}/>
              </button>
            </FadeUp>
            <div className="lp-gx" style={{flex:1,display:"flex",justifyContent:"center",overflow:"hidden"}}>
              <FadeUp delay={0.1}><Galaxy/></FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* light → BG2 */}
      <SG from={BG} to={BG2} h={80}/>

      {/* ── PLAN YOUR PATH ────────────────────────────────────────────────────── */}
      <section style={{padding:"4rem 2.5rem 7rem",background:BG2}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <FadeUp style={{marginBottom:"4.5rem"}}>
            <Heading italic="Plan" rest="your path." size="clamp(2.8rem,5vw,4rem)"/>
            <p style={{fontFamily:SANS,fontWeight:300,fontSize:"0.95rem",color:FG3,
              lineHeight:1.95,maxWidth:500,marginTop:"1.1rem"}}>
              Model your future — from college applications to first jobs — and see how every action moves you closer to your goals.
            </p>
          </FadeUp>
          <DataFlow/>
        </div>
      </section>

      {/* BG2 → BG2 (skip testimonials) */}
      <SG from={BG2} to={BG2} h={0}/>

      {/* ── DISCOVER WHAT'S NEW ───────────────────────────────────────────────── */}
      <section style={{padding:"4rem 2.5rem 7rem",background:BG2}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <FadeUp style={{marginBottom:"3rem"}}>
            <Heading italic="Discover" rest="what's new." size="clamp(2.4rem,4.5vw,3.4rem)"/>
          </FadeUp>
          <Stagger className="lp-fg" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1.25rem"}}>
            {[
              {tag:"PRODUCT",title:"Introducing Mentorable: AI-powered career guidance built for every high schooler",date:"March 2025"},
              {tag:"BEHIND THE BUILD",title:"How we built the voice interview: 2 minutes that change everything",date:"February 2025"},
              {tag:"PRODUCT",title:"Mentorable launches adaptive roadmap: your career path, updated in real time",date:"January 2025"},
            ].map(post=>(
              <motion.div key={post.title} variants={iV}
                whileHover={{scale:1.02,boxShadow:SH_LG}}
                style={{border:`1px solid ${BDR}`,borderRadius:18,overflow:"hidden",
                  display:"flex",flexDirection:"column",height:"100%",
                  background:BG3,cursor:"pointer",boxShadow:SH}}>
                <div style={{height:148,background:`linear-gradient(135deg,${BG2},rgba(37,99,235,0.1))`,
                  borderBottom:`1px solid ${BDR2}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontFamily:SANS,fontWeight:700,fontSize:"0.65rem",color:P,letterSpacing:"0.12em",
                    textTransform:"uppercase",border:`1px solid ${BDR}`,padding:"5px 13px",borderRadius:999,
                    background:`rgba(37,99,235,0.06)`}}>{post.tag}</div>
                </div>
                <div style={{padding:"1.4rem",flex:1,display:"flex",flexDirection:"column",gap:14}}>
                  <p style={{fontFamily:SANS,fontWeight:500,fontSize:"0.875rem",color:FG,lineHeight:1.55,flex:1}}>{post.title}</p>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontFamily:SANS,fontSize:"0.7rem",color:FG3}}>{post.date}</span>
                    <span style={{fontFamily:SANS,fontSize:"0.72rem",color:P,display:"flex",alignItems:"center",gap:4,fontWeight:600}}>
                      Read more <ArrowRight color={P} size={14}/>
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* BG2 → light */}
      <SG from={BG2} to={BG} h={80}/>

      {/* ── NEWSLETTER ───────────────────────────────────────────────────────── */}
      <section style={{padding:"5rem 2.5rem",background:BG}}>
        <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
          <FadeUp>
            <h3 style={{fontFamily:SANS,fontWeight:300,fontSize:"2rem",color:FG,marginBottom:"0.75rem",letterSpacing:"-0.02em"}}>Stay in the loop</h3>
            <p style={{fontFamily:SANS,fontWeight:300,fontSize:"0.9rem",color:FG3,lineHeight:1.9,marginBottom:"1.75rem"}}>
              Sign up for updates on new features, career insights, and Mentorable news.
            </p>
            <div style={{display:"flex",gap:8}}>
              <input type="email" placeholder="Enter your email"
                style={{flex:1,fontFamily:SANS,fontSize:"0.875rem",padding:"0.85rem 1.1rem",borderRadius:999,
                  background:BG3,border:`1px solid ${BDR}`,color:FG,outline:"none",
                  boxShadow:`0 2px 20px rgba(37,99,235,0.08)`}}/>
              <GradBtn onClick={()=>{}}>Subscribe</GradBtn>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* light → footer — dramatic multi-stop gradient */}
      <div style={{height:280,background:"linear-gradient(to bottom,#f4f8ff 0%,rgba(180,210,255,0.6) 22%,rgba(26,63,150,0.55) 55%,rgba(14,28,80,0.88) 78%,#0b1340 100%)",pointerEvents:"none",flexShrink:0}}/>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{padding:"4rem 2.5rem 2rem",background:"#0b1340",color:"#fff"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:"3rem",marginBottom:"3rem"}}>
            <div>
              <div style={{fontFamily:SANS,fontWeight:700,fontSize:"1.05rem",color:"#fff",marginBottom:"0.75rem",letterSpacing:"-0.03em"}}>mentorable</div>
              <p style={{fontFamily:SANS,fontWeight:300,fontSize:"0.8rem",color:"rgba(255,255,255,0.4)",lineHeight:1.85,maxWidth:240}}>
                AI-powered career guidance for high school students.
              </p>
            </div>
            {[
              {heading:"Features",links:["Voice Onboarding","Scorecard","Roadmap","AI Guidance"]},
              {heading:"Resources",links:["About","Blog","Help Center","Legal"]},
              {heading:"Company",links:["Careers","Contact","Privacy Policy","Terms"]},
            ].map(col=>(
              <div key={col.heading}>
                <div style={{fontFamily:SANS,fontSize:"0.68rem",fontWeight:700,color:"rgba(255,255,255,0.28)",
                  textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:"1rem"}}>{col.heading}</div>
                <div style={{display:"flex",flexDirection:"column",gap:11}}>
                  {col.links.map(l=>(
                    <button key={l} style={{fontFamily:SANS,fontSize:"0.82rem",color:"rgba(255,255,255,0.48)",
                      background:"transparent",border:"none",cursor:"pointer",textAlign:"left",padding:0,transition:"color 0.2s"}}
                      onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                      onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.48)"}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            paddingTop:"2rem",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontFamily:SANS,fontSize:"0.75rem",color:"rgba(255,255,255,0.25)"}}>©2025 Mentorable Inc. All rights reserved.</div>
            <div style={{display:"flex",gap:"1.5rem"}}>
              {["X","LinkedIn","Instagram"].map(s=>(
                <button key={s} style={{fontFamily:SANS,fontSize:"0.75rem",color:"rgba(255,255,255,0.3)",
                  background:"transparent",border:"none",cursor:"pointer",transition:"color 0.2s"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                  onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
