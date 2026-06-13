import { useState } from "react";

const LIB = [
  { id:1,  title:"Hollow Abyss",     type:"game",  genre:"RPG",          rating:9.2, year:2024, c1:"#6c2bd9", c2:"#1a0a3d", icon:"⚔" },
  { id:2,  title:"Neon Drift",        type:"game",  genre:"Racing",        rating:8.7, year:2023, c1:"#f97316", c2:"#431407", icon:"▲" },
  { id:3,  title:"The Last Signal",   type:"movie", genre:"Sci-Fi",        rating:8.5, year:2024, c1:"#0ea5e9", c2:"#0c2340", icon:"◉" },
  { id:4,  title:"Iron Siege",        type:"game",  genre:"Strategy",      rating:7.9, year:2023, c1:"#94a3b8", c2:"#1e293b", icon:"■" },
  { id:5,  title:"Verdant World",     type:"game",  genre:"Adventure",     rating:9.1, year:2025, c1:"#22c55e", c2:"#052e16", icon:"◈" },
  { id:6,  title:"Crimson Tide",      type:"movie", genre:"Action",        rating:7.2, year:2022, c1:"#ef4444", c2:"#450a0a", icon:"◆" },
  { id:7,  title:"Phantom Protocol",  type:"game",  genre:"Stealth",       rating:8.8, year:2024, c1:"#a78bfa", c2:"#2e1065", icon:"◎" },
  { id:8,  title:"Solar Winds",       type:"movie", genre:"Documentary",   rating:8.0, year:2023, c1:"#fbbf24", c2:"#451a03", icon:"☀" },
  { id:9,  title:"Rift Walker",       type:"game",  genre:"Platformer",    rating:8.3, year:2024, c1:"#ec4899", c2:"#500724", icon:"◐" },
  { id:10, title:"Echoes",            type:"movie", genre:"Drama",         rating:7.6, year:2023, c1:"#06b6d4", c2:"#082f49", icon:"◑" },
  { id:11, title:"Storm Protocol",    type:"game",  genre:"FPS",           rating:8.9, year:2025, c1:"#f59e0b", c2:"#431407", icon:"◉" },
  { id:12, title:"Distant Stars",     type:"movie", genre:"Sci-Fi",        rating:9.0, year:2024, c1:"#8b5cf6", c2:"#1e003d", icon:"★" },
  { id:13, title:"Abyss Crawler",     type:"game",  genre:"Horror",        rating:8.1, year:2023, c1:"#475569", c2:"#020617", icon:"▼" },
  { id:14, title:"Frostpeak",         type:"game",  genre:"Survival",      rating:7.8, year:2024, c1:"#7dd3fc", c2:"#0c1a3d", icon:"❄" },
  { id:15, title:"Rogue Circuit",     type:"game",  genre:"Roguelike",     rating:9.3, year:2025, c1:"#4ade80", c2:"#052e16", icon:"◌" },
  { id:16, title:"Veil of Shadows",   type:"movie", genre:"Thriller",      rating:7.4, year:2022, c1:"#6b7280", c2:"#030712", icon:"▪" },
];

const CSS = `
  .p-card{transition:transform .33s cubic-bezier(.34,1.56,.64,1),box-shadow .28s}
  .orbit-item{transition:left .44s cubic-bezier(.16,1,.3,1),top .44s cubic-bezier(.16,1,.3,1),width .44s,height .44s,opacity .4s,box-shadow .35s,margin .44s}
  .neon-card{transition:border-color .2s,box-shadow .2s,transform .2s,color .2s}
  .neon-art{transition:border-color .2s}
  .sd-card{transition:transform .27s cubic-bezier(.34,1.56,.64,1),box-shadow .24s}
  .fs-frame{transition:filter .18s}
  .vbtn{background:transparent;border:1px solid transparent;border-radius:8px;padding:8px 13px;cursor:pointer;transition:all .18s;flex-shrink:0;text-align:left}
  .vbtn:hover{border-color:#1e2232}
  .vbtn.on{background:#141722;border-color:rgba(124,92,252,.35)}
  .pill{border:none;border-radius:20px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;transition:background .18s,color .18s}
`;

function Cover({ item, h="100%", style={} }) {
  return (
    <div style={{
      height:h, flexShrink:0, position:"relative", overflow:"hidden",
      background:`radial-gradient(ellipse at 22% 18%,${item.c1}cc 0%,${item.c2} 68%)`,
      ...style,
    }}>
      <svg width="100%" height="100%" style={{position:"absolute",inset:0,opacity:.07,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id={`p2g${item.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0L0 0 0 22" fill="none" stroke="white" strokeWidth=".5"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill={`url(#p2g${item.id})`}/>
      </svg>
      <div style={{position:"absolute",top:9,left:9,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,.45)",backdropFilter:"blur(4px)",fontSize:9,fontWeight:700,letterSpacing:".12em",color:item.c1,textTransform:"uppercase",border:`1px solid ${item.c1}50`}}>{item.genre}</div>
      <div style={{position:"absolute",top:8,right:10,fontSize:20,opacity:.28,color:"#fff"}}>{item.icon}</div>
    </div>
  );
}

// ── 1. PINBOARD ──────────────────────────────────────────────────────────
// Scattered polaroid cards with pushpins. Cards tilt randomly, straighten on hover.
function Pinboard({ items }) {
  const [hov, setHov] = useState(null);
  const seed = (id, n) => { let x = Math.sin(id * 127.1 + n * 311.7) * 43758.5; return x - Math.floor(x); };
  const pins = ["#7c5cfc","#ff6b35","#22c55e","#ef4444","#0ea5e9","#fbbf24"];

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"46px 16px",padding:"40px 8px 20px"}}>
      {items.map(item => {
        const rot = (seed(item.id,1) - .5) * 10;
        const ty  = (seed(item.id,2) - .5) * 22;
        const pin = pins[Math.floor(seed(item.id,3) * pins.length)];
        const on  = hov === item.id;
        return (
          <div key={item.id} className="p-card"
            onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
            style={{
              position:"relative", cursor:"pointer",
              transform:`rotate(${on ? 0 : rot}deg) translateY(${ty + (on ? -14 : 0)}px)`,
              boxShadow:on ? "0 28px 52px rgba(0,0,0,.85)" : "none",
              zIndex:on ? 10 : 1,
            }}>
            {/* Pin */}
            <div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",zIndex:3,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:pin,boxShadow:`0 2px 8px rgba(0,0,0,.55),0 0 0 2px ${pin}44`}}/>
              <div style={{width:1.5,height:9,background:"rgba(0,0,0,.32)"}}/>
            </div>
            <div style={{borderRadius:3,overflow:"hidden",boxShadow:"0 6px 28px rgba(0,0,0,.6)"}}>
              <Cover item={item} h={172}/>
              {/* Polaroid label */}
              <div style={{background:"#edeae5",padding:"10px 10px 9px"}}>
                <div style={{fontWeight:800,fontSize:11,color:"#111",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                <div style={{fontSize:9,color:"#bbb"}}>{item.genre} · {item.year} · ★{item.rating}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 2. ORBIT RING ────────────────────────────────────────────────────────
// Items sit on a circular track. Click any to select — it expands in place,
// others dim. Info panel floats in the center.
function OrbitRing({ items }) {
  const [sel, setSel] = useState(0);
  const pool = items.slice(0, Math.min(8, items.length));
  const N = pool.length;
  const R = 172, CY = 274;
  const cur = pool[Math.min(sel, pool.length - 1)];
  if (!cur) return null;

  return (
    <div style={{position:"relative",height:580,overflow:"hidden"}}>
      {/* Track rings */}
      <div style={{position:"absolute",top:CY-R-7,left:`calc(50% - ${R+7}px)`,width:(R+7)*2,height:(R+7)*2,borderRadius:"50%",border:"1px solid rgba(255,255,255,.055)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:CY-55,left:"calc(50% - 55px)",width:110,height:110,borderRadius:"50%",border:"1px dashed rgba(255,255,255,.04)",pointerEvents:"none"}}/>

      {/* Center info */}
      <div style={{position:"absolute",top:CY-90,left:"calc(50% - 108px)",width:216,textAlign:"center",zIndex:20}}>
        <div style={{fontSize:9,fontWeight:800,letterSpacing:".2em",color:cur.c1,marginBottom:7,textTransform:"uppercase"}}>{cur.type}</div>
        <div style={{fontSize:18,fontWeight:900,color:"#fff",lineHeight:1.2,marginBottom:8,transition:"all .35s"}}>{cur.title}</div>
        <div style={{display:"flex",justifyContent:"center",gap:11,fontSize:11,color:"#9ca3af",marginBottom:14}}>
          <span style={{color:"#fbbf24",fontWeight:700}}>★ {cur.rating}</span>
          <span>{cur.genre} · {cur.year}</span>
        </div>
        <div style={{display:"inline-block",background:cur.c1,color:"#fff",padding:"7px 20px",borderRadius:7,fontWeight:800,fontSize:11,letterSpacing:".05em",cursor:"pointer",boxShadow:`0 6px 20px ${cur.c1}50`,transition:"background .35s,box-shadow .35s"}}>
          ▶  {cur.type==="game"?"PLAY":"WATCH"}
        </div>
      </div>

      {/* Ring items */}
      {pool.map((item, i) => {
        const angle = (2*Math.PI*i/N) - Math.PI/2;
        const isSel = i === sel;
        const W = isSel ? 110 : 82, H = isSel ? 154 : 116;
        return (
          <div key={item.id} className="orbit-item"
            onClick={()=>setSel(i)}
            style={{
              position:"absolute",
              left:`calc(50% + ${(R * Math.cos(angle) - W/2).toFixed(1)}px)`,
              top: (CY + R * Math.sin(angle) - H/2).toFixed(1),
              width:W, height:H,
              borderRadius:9, overflow:"hidden", cursor:"pointer",
              boxShadow:isSel?`0 16px 40px ${item.c1}50,0 0 0 2px ${item.c1}80`:"0 4px 16px rgba(0,0,0,.5)",
              opacity:isSel ? 1 : .46,
              zIndex:isSel ? 15 : 5,
            }}>
            <Cover item={item} h="100%"/>
          </div>
        );
      })}
    </div>
  );
}

// ── 3. FILM STRIP ────────────────────────────────────────────────────────
// Covers inside a physical film negative strip — sprocket holes, grain,
// frame numbers. Dim when not hovered.
function FilmStrip({ items }) {
  const [hov, setHov] = useState(null);
  const FW = 150, FH = 208;

  return (
    <div style={{padding:"20px 0"}}>
      <div style={{overflowX:"auto",scrollbarWidth:"none",borderRadius:6,background:"#0b0b0b"}}>
        <div style={{display:"inline-flex",flexDirection:"column",minWidth:"100%"}}>

          {/* Top sprockets */}
          <div style={{display:"flex",height:24,background:"#070707",alignItems:"center",flexShrink:0}}>
            {items.map((_,i) => (
              <div key={i} style={{width:FW+2,flexShrink:0,display:"flex",justifyContent:"space-around",padding:"0 26px"}}>
                <div style={{width:13,height:11,borderRadius:2,background:"#000",border:"1px solid #1e1e1e"}}/>
                <div style={{width:13,height:11,borderRadius:2,background:"#000",border:"1px solid #1e1e1e"}}/>
              </div>
            ))}
          </div>

          {/* Frames */}
          <div style={{display:"flex",gap:2,padding:"2px"}}>
            {items.map((item, idx) => {
              const on = hov === item.id;
              return (
                <div key={item.id} className="fs-frame"
                  onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                  style={{
                    width:FW, height:FH, flexShrink:0, position:"relative", cursor:"pointer",
                    border:"1px solid #181818",
                    filter:on ? "none" : "brightness(.65) saturate(.72)",
                  }}>
                  <Cover item={item} h="100%"/>
                  {/* Film grain */}
                  <div style={{position:"absolute",inset:0,pointerEvents:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.07'/%3E%3C/svg%3E\")",opacity:.55,mixBlendMode:"overlay"}}/>
                  {/* Frame code */}
                  <div style={{position:"absolute",bottom:5,right:6,fontSize:8,color:"#3a3a3a",fontFamily:"monospace",letterSpacing:".1em"}}>{String(idx+1).padStart(3,"0")}A</div>
                  {on && (
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.92),transparent)",padding:"30px 10px 9px"}}>
                      <div style={{fontWeight:700,fontSize:11,color:"#e0e0e0",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                      <div style={{color:"#fbbf24",fontSize:10}}>★ {item.rating}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom sprockets */}
          <div style={{display:"flex",height:24,background:"#070707",alignItems:"center",flexShrink:0}}>
            {items.map((_,i) => (
              <div key={i} style={{width:FW+2,flexShrink:0,display:"flex",justifyContent:"space-around",padding:"0 26px"}}>
                <div style={{width:13,height:11,borderRadius:2,background:"#000",border:"1px solid #1e1e1e"}}/>
                <div style={{width:13,height:11,borderRadius:2,background:"#000",border:"1px solid #1e1e1e"}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:10,color:"#333",marginTop:8}}>Scroll to browse all frames</div>
    </div>
  );
}

// ── 4. NEON WIREFRAME ────────────────────────────────────────────────────
// Dark cards with glowing colored borders, corner bracket marks, and CRT
// scanlines. No cover art fill — just gradient + geometry. Hover = glow.
function Bracket({ h, v, color }) {
  return (
    <div style={{
      position:"absolute", [h]:8, [v]:8, width:11, height:11,
      borderTop:   h==="top"    ? `1.5px solid ${color}` : undefined,
      borderBottom:h==="bottom" ? `1.5px solid ${color}` : undefined,
      borderLeft:  v==="left"   ? `1.5px solid ${color}` : undefined,
      borderRight: v==="right"  ? `1.5px solid ${color}` : undefined,
    }}/>
  );
}

function NeonGrid({ items }) {
  const [hov, setHov] = useState(null);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:15,padding:"18px 0"}}>
      {items.map(item => {
        const on = hov === item.id;
        return (
          <div key={item.id} className="neon-card"
            onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
            style={{
              borderRadius:3, cursor:"pointer",
              border:`1px solid ${on ? item.c1 : "#181e2e"}`,
              boxShadow:on ? `0 0 18px ${item.c1}52,0 0 36px ${item.c1}24,inset 0 0 16px ${item.c1}08` : "none",
              background:"#04050e", overflow:"hidden",
              transform:on ? "translateY(-4px)" : "none",
            }}>
            {/* Art area: wireframe, no solid cover */}
            <div className="neon-art" style={{
              height:174, position:"relative",
              background:`linear-gradient(135deg,${item.c1}0c,${item.c2}55)`,
              borderBottom:`1px solid ${on ? item.c1+"44" : "#181e2e"}`,
            }}>
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([h,v]) => (
                <Bracket key={h+v} h={h} v={v} color={item.c1}/>
              ))}
              {/* Center icon — glows up on hover */}
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:36,color:item.c1,opacity:on?.34:.1,transition:"opacity .2s"}}>{item.icon}</div>
              {/* CRT scanlines */}
              <div style={{position:"absolute",inset:0,pointerEvents:"none",backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 2px,${item.c1}07 2px,${item.c1}07 4px)`}}/>
              {/* Genre text */}
              <div style={{position:"absolute",top:8,left:8,fontSize:8,fontWeight:700,letterSpacing:".16em",color:item.c1,textTransform:"uppercase"}}>{item.genre}</div>
            </div>
            {/* Info */}
            <div style={{padding:"9px 10px"}}>
              <div style={{fontWeight:700,fontSize:12,color:on?"#e0e8ff":"#5a6888",marginBottom:4,transition:"color .2s"}}>{item.title}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:item.c1,fontWeight:700}}>★ {item.rating}</span>
                <span style={{fontSize:8,color:"#262d42",fontFamily:"monospace"}}>{item.year}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 5. SPREAD DECK ───────────────────────────────────────────────────────
// All cards spread across the width like a hand of records in a crate.
// Each card shows only its leftmost ~28px unless hovered, which lifts it
// to full height above the pile.
function SpreadDeck({ items }) {
  const [hov, setHov] = useState(null);
  const N = items.length;
  const CW = 152, CH = 224, SP = 29;
  const totalW = Math.max((N-1)*SP + CW, 600);
  const hovItem = items.find(i => i.id === hov);

  return (
    <div style={{padding:"22px 0 56px"}}>
      {/* Info bar */}
      <div style={{height:54,marginBottom:14,display:"flex",alignItems:"center"}}>
        {hovItem ? (
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:3,height:38,borderRadius:2,background:hovItem.c1,flexShrink:0}}/>
            <div>
              <div style={{fontWeight:900,fontSize:15,color:"#fff"}}>{hovItem.title}</div>
              <div style={{fontSize:10,color:"#9ca3af"}}>{hovItem.genre} · {hovItem.year} · <span style={{color:"#fbbf24"}}>★{hovItem.rating}</span></div>
            </div>
          </div>
        ) : (
          <div style={{fontSize:10,color:"#2e3648"}}>Hover any card edge to inspect</div>
        )}
      </div>

      {/* Crate */}
      <div style={{overflowX:"auto",scrollbarWidth:"none"}}>
        <div style={{position:"relative",width:totalW,height:CH+32}}>
          {items.map((item, i) => {
            const on = hov === item.id;
            return (
              <div key={item.id} className="sd-card"
                onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                style={{
                  position:"absolute", left:i*SP, bottom:0,
                  width:CW, height:CH,
                  borderRadius:7, overflow:"hidden", cursor:"pointer",
                  zIndex:on ? 50 : i,
                  transform:on ? "translateY(-30px) scale(1.05)" : "none",
                  boxShadow:on ? `0 24px 44px rgba(0,0,0,.85),0 0 0 2px ${item.c1}` : "0 4px 16px rgba(0,0,0,.55)",
                }}>
                <Cover item={item} h="100%"/>
                {/* Dim overlay when not hovered */}
                {!on && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.32)",pointerEvents:"none"}}/>}
                {on && (
                  <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.9),transparent)",padding:"36px 10px 10px"}}>
                    <div style={{fontWeight:800,fontSize:12,color:"#fff",marginBottom:2}}>{item.title}</div>
                    <div style={{fontSize:10,color:item.c1}}>★ {item.rating}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:10,color:"#2a3040",marginTop:11}}>Hover any card edge — scroll for larger libraries</div>
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────
const VIEWS = [
  { id:"pinboard",  label:"Pinboard",    sub:"Scattered" },
  { id:"orbit",     label:"Orbit Ring",  sub:"Circular"  },
  { id:"filmstrip", label:"Film Strip",  sub:"Cinematic" },
  { id:"neon",      label:"Neon Grid",   sub:"Wireframe" },
  { id:"deck",      label:"Spread Deck", sub:"Crate dig" },
];

export default function EmberLayouts2() {
  const [view, setView] = useState("pinboard");
  const [filter, setFilter] = useState("all");
  const filtered = LIB.filter(i => filter === "all" || i.type === filter);

  return (
    <>
      <style>{CSS}</style>
      <div style={{background:"#090b10",minHeight:"100vh",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:"#dde0f0",padding:"0 18px"}}>

        {/* Header */}
        <div style={{padding:"15px 0 11px",borderBottom:"1px solid #171b28",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:29,height:29,borderRadius:8,background:"linear-gradient(135deg,#ff6b35,#7c5cfc)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff"}}>◈</div>
            <div>
              <div style={{fontWeight:900,fontSize:15,letterSpacing:"-.04em",color:"#fff"}}>Ember</div>
              <div style={{fontSize:8,color:"#3d4460",marginTop:-1,letterSpacing:".14em"}}>NOVEL LAYOUTS</div>
            </div>
          </div>
          <div style={{display:"flex",gap:5}}>
            {["all","game","movie"].map(f => (
              <button key={f} className="pill" onClick={()=>setFilter(f)}
                style={{background:filter===f?"#7c5cfc":"#10131e",color:filter===f?"#fff":"#6b7280"}}>
                {f==="all"?"All":f==="game"?"Games":"Movies"}
              </button>
            ))}
          </div>
        </div>

        {/* View tabs */}
        <div style={{display:"flex",gap:2,padding:"8px 0 0",overflowX:"auto",scrollbarWidth:"none"}}>
          {VIEWS.map(v => (
            <button key={v.id} className={`vbtn${view===v.id?" on":""}`} onClick={()=>setView(v.id)}>
              <div style={{fontSize:12,fontWeight:700,color:view===v.id?"#dde0f0":"#5a6070"}}>{v.label}</div>
              <div style={{fontSize:9,color:view===v.id?"#7c5cfc":"#3d4460",marginTop:1}}>{v.sub}</div>
            </button>
          ))}
        </div>

        {view==="pinboard"  && <Pinboard   items={filtered}/>}
        {view==="orbit"     && <OrbitRing  items={filtered}/>}
        {view==="filmstrip" && <FilmStrip  items={filtered}/>}
        {view==="neon"      && <NeonGrid   items={filtered}/>}
        {view==="deck"      && <SpreadDeck items={filtered}/>}
      </div>
    </>
  );
}
