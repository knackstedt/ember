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
  @keyframes tkl{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @keyframes tkr{from{transform:translateX(-50%)}to{transform:translateX(0)}}
  @keyframes blink{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.6)}}
  .tkl{animation:tkl linear infinite}
  .tkr{animation:tkr linear infinite}
  .starpt{animation:blink ease-in-out infinite}
  .hex{transition:transform .28s cubic-bezier(.34,1.56,.64,1),filter .2s}
  .tcard{transition:border-color .2s,transform .2s,box-shadow .2s}
  .gcart{transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .28s}
  .vbtn{background:transparent;border:1px solid transparent;border-radius:8px;padding:8px 13px;cursor:pointer;transition:all .18s;flex-shrink:0;text-align:left}
  .vbtn:hover{border-color:#1e2232}
  .vbtn.on{background:#141722;border-color:rgba(124,92,252,.35)}
  .pill{border:none;border-radius:20px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;transition:all .18s}
`;

function Cover({ item, h="100%", style={} }) {
  return (
    <div style={{
      height:h, flexShrink:0, position:"relative", overflow:"hidden",
      background:`radial-gradient(ellipse at 22% 18%,${item.c1}cc 0%,${item.c2} 68%)`,
      ...style,
    }}>
      <svg width="100%" height="100%" style={{position:"absolute",inset:0,opacity:.07,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id={`v3g${item.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0L0 0 0 22" fill="none" stroke="white" strokeWidth=".5"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill={`url(#v3g${item.id})`}/>
      </svg>
      <div style={{position:"absolute",top:9,left:9,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,.45)",backdropFilter:"blur(4px)",fontSize:9,fontWeight:700,letterSpacing:".12em",color:item.c1,textTransform:"uppercase",border:`1px solid ${item.c1}50`}}>{item.genre}</div>
      <div style={{position:"absolute",top:8,right:10,fontSize:20,opacity:.28,color:"#fff"}}>{item.icon}</div>
    </div>
  );
}

// ── 1. HEX GRID ──────────────────────────────────────────────────────────
// Covers clipped into hexagonal tiles in a honeycomb grid.
// Hover reveals a frosted info overlay; inactive tiles dim.
function HexGrid({ items }) {
  const [hov, setHov] = useState(null);
  const W = 126, RSTEP = 128;
  const COL_X = [0, 90, 180, 270];
  const cols = [[], [], [], []];
  items.forEach((item, i) => cols[i % 4].push(item));
  const perCol = Math.max(...cols.map(c => c.length));
  const H = (perCol - 1) * RSTEP + RSTEP / 2 + W + 16;

  return (
    <div style={{display:"flex",justifyContent:"center",padding:"20px 0"}}>
      <div style={{position:"relative",width:COL_X[3]+W,height:H}}>
        {cols.map((col, ci) =>
          col.map((item, ri) => {
            const x = COL_X[ci];
            const y = ri * RSTEP + (ci % 2 === 1 ? RSTEP / 2 : 0);
            const on = hov === item.id;
            return (
              <div key={item.id} className="hex"
                onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                style={{
                  position:"absolute", left:x, top:y, width:W, height:W,
                  clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
                  cursor:"pointer",
                  transform:on?"scale(1.13)":"scale(1)",
                  filter:on?"brightness(1.1)":"brightness(.68)",
                  zIndex:on?10:1,
                }}>
                <Cover item={item} h="100%"/>
                {on && (
                  <div style={{
                    position:"absolute",inset:0,
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    background:`${item.c2}e8`,backdropFilter:"blur(6px)",
                    textAlign:"center",padding:12,
                  }}>
                    <div style={{fontWeight:900,fontSize:10,color:"#fff",lineHeight:1.3,marginBottom:3}}>{item.title}</div>
                    <div style={{fontSize:10,color:"#fbbf24",fontWeight:700,marginBottom:8}}>★ {item.rating}</div>
                    <div style={{background:item.c1,borderRadius:4,padding:"4px 10px",fontSize:9,fontWeight:800,color:"#fff"}}>
                      ▶ {item.type==="game"?"PLAY":"WATCH"}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 2. STAR MAP ──────────────────────────────────────────────────────────
// Each title is a glowing star at a pseudo-random position. Shared genres
// are connected by dashed constellation lines. Hovering a star pops up a card.
function StarMap({ items }) {
  const [hov, setHov] = useState(null);
  const sd = (id, n) => { let x=Math.sin(id*127.1+n*311.7)*43758.5; return x-Math.floor(x); };
  // Grid-jitter keeps stars from clustering
  const pos = (item) => {
    const i = item.id - 1;
    return {
      x: (i%4)*23 + sd(item.id,1)*16 + 4,
      y: Math.floor(i/4)*22 + sd(item.id,2)*14 + 5,
    };
  };

  // Group into 4 "constellations" by genre family
  const band = (g) => {
    if (["Action","Racing","FPS","Stealth"].includes(g)) return 0;
    if (["RPG","Drama","Thriller","Horror"].includes(g)) return 1;
    if (["Adventure","Platformer","Survival","Roguelike"].includes(g)) return 2;
    return 3;
  };
  const groups = [[],[],[],[]];
  items.forEach(item => groups[band(item.genre)].push(item));
  const bandColors = ["#ef4444","#a78bfa","#22c55e","#0ea5e9"];
  const bandLabels = ["Action","Narrative","Explore","Horizon"];

  const dust = Array.from({length:65}, (_,i) => ({
    x:sd(i+200,1)*100, y:sd(i+200,2)*100, o:sd(i+200,3)*.45+.08,
  }));

  return (
    <div style={{position:"relative",height:486,margin:"16px 0",borderRadius:12}}>
      {/* Dark background, clipped separately so popups can escape */}
      <div style={{position:"absolute",inset:0,background:"#010408",borderRadius:12,overflow:"hidden"}}>
        {dust.map((s,i)=>(
          <div key={i} style={{
            position:"absolute",left:`${s.x}%`,top:`${s.y}%`,
            width:1.5,height:1.5,borderRadius:"50%",background:"#fff",opacity:s.o,
          }}/>
        ))}
      </div>

      {/* Constellation lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
        {groups.flatMap((group, gi) =>
          group.slice(1).map((item,idx)=>{
            const a=pos(group[idx]), b=pos(item);
            return (
              <line key={item.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={bandColors[gi]} strokeWidth={.18} strokeOpacity={.35} strokeDasharray=".6 .5"/>
            );
          })
        )}
      </svg>

      {/* Legend */}
      <div style={{position:"absolute",bottom:12,right:12,display:"flex",flexDirection:"column",gap:4,zIndex:5,pointerEvents:"none"}}>
        {bandLabels.map((label,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:16,height:1,background:bandColors[i],opacity:.6}}/>
            <span style={{fontSize:8,color:bandColors[i],fontWeight:700,letterSpacing:".1em",opacity:.8}}>{label}</span>
          </div>
        ))}
      </div>

      {/* Stars */}
      {items.map(item => {
        const p = pos(item);
        const on = hov===item.id;
        const delay = (item.id*.42)%3;
        const above = p.y > 52;
        return (
          <div key={item.id}
            onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
            style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,zIndex:on?30:5,cursor:"pointer"}}>
            {/* Positioning wrapper */}
            <div style={{position:"absolute",left:0,top:0,transform:"translate(-50%,-50%)"}}>
              <div className="starpt" style={{
                width:on?18:7, height:on?18:7, borderRadius:"50%",
                background:item.c1,
                boxShadow:`0 0 ${on?22:8}px ${item.c1},0 0 ${on?44:16}px ${item.c1}55`,
                transition:"width .28s,height .28s,box-shadow .28s",
                animationDelay:`${delay}s`, animationDuration:`${2+delay*.4}s`,
              }}/>
            </div>
            {/* Popup card */}
            {on && (
              <div style={{
                position:"absolute",
                [above?"bottom":"top"]:"calc(100% + 10px)",
                left:"50%",transform:"translateX(-50%)",
                width:154,borderRadius:8,overflow:"hidden",
                boxShadow:`0 14px 38px rgba(0,0,0,.9),0 0 0 1px ${item.c1}60`,zIndex:40,
              }}>
                <Cover item={item} h={100}/>
                <div style={{background:"#080d1c",padding:"7px 10px"}}>
                  <div style={{fontWeight:800,fontSize:11,color:"#fff",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                  <div style={{fontSize:9,color:"#9ca3af"}}>{item.genre} · <span style={{color:"#fbbf24"}}>★{item.rating}</span></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 3. TICKER RUNWAY ─────────────────────────────────────────────────────
// Three strips scroll left/right/left at different speeds — games, movies,
// top rated. Hover any strip to pause it.
function TickerRunway({ items }) {
  const CW = 176, CH = 114, GAP = 10;

  function Row({ data, speed, dir, label }) {
    if (!data.length) return null;
    const doubled = [...data, ...data];
    return (
      <div style={{marginBottom:18}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:".2em",color:"#3a4457",textTransform:"uppercase",marginBottom:7}}>{label}</div>
        <div style={{overflow:"hidden",borderRadius:6}}>
          <div
            className={dir==="left"?"tkl":"tkr"}
            style={{display:"flex",gap:GAP,width:doubled.length*(CW+GAP),animationDuration:`${speed}s`}}
            onMouseEnter={e=>e.currentTarget.style.animationPlayState="paused"}
            onMouseLeave={e=>e.currentTarget.style.animationPlayState="running"}
          >
            {doubled.map((item,i)=>(
              <div key={`${item.id}-${i}`} style={{
                width:CW,height:CH,flexShrink:0,
                borderRadius:7,overflow:"hidden",position:"relative",cursor:"pointer",
              }}>
                <Cover item={item} h="100%"/>
                <div style={{
                  position:"absolute",bottom:0,left:0,right:0,
                  background:"linear-gradient(to top,rgba(0,0,0,.85),transparent)",
                  padding:"20px 9px 8px",
                }}>
                  <div style={{fontWeight:700,fontSize:11,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                  <div style={{fontSize:9,color:"#9ca3af"}}>{item.genre}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const games = items.filter(i=>i.type==="game");
  const movies = items.filter(i=>i.type==="movie");
  const top = [...items].sort((a,b)=>b.rating-a.rating);

  return (
    <div style={{padding:"20px 0"}}>
      <Row data={games}  speed={24} dir="left"  label="Games"/>
      <Row data={movies} speed={18} dir="right" label="Movies"/>
      <Row data={top}    speed={30} dir="left"  label="Top Rated"/>
      <div style={{textAlign:"center",fontSize:10,color:"#2a3347",marginTop:4}}>Hover a strip to pause</div>
    </div>
  );
}

// ── 4. TRADING CARD ──────────────────────────────────────────────────────
// Collectible card style: rarity header, cover art, stat block.
// Moving the mouse across a card rotates a holographic rainbow gradient.
function TradingCard({ items }) {
  const [hov, setHov] = useState(null);
  const [mouse, setMouse] = useState({x:50,y:50});

  const rarity = r => r>=9?"LEGENDARY":r>=8.5?"EPIC":r>=8?"RARE":"UNCOMMON";
  const rc     = r => r>=9?"#fbbf24":r>=8.5?"#a78bfa":r>=8?"#38bdf8":"#6b7280";
  const stars  = r => r>=9?"★★★★★":r>=8.5?"★★★★":r>=8?"★★★":"★★";

  const move = (e, id) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMouse({x:(e.clientX-r.left)/r.width*100, y:(e.clientY-r.top)/r.height*100});
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(144px,1fr))",gap:15,padding:"18px 0"}}>
      {items.map(item => {
        const on = hov===item.id;
        const angle = on ? mouse.x*1.3 + mouse.y*.9 : 0;
        const col = rc(item.rating);
        return (
          <div key={item.id} className="tcard"
            onMouseEnter={e=>{setHov(item.id);move(e,item.id)}}
            onMouseMove={e=>on&&move(e,item.id)}
            onMouseLeave={()=>setHov(null)}
            style={{
              borderRadius:10,overflow:"hidden",cursor:"pointer",position:"relative",
              border:`2px solid ${on?item.c1:"#181e2e"}`,
              boxShadow:on?`0 20px 40px rgba(0,0,0,.7),0 0 0 1px ${item.c1}55`:"0 4px 14px rgba(0,0,0,.4)",
              background:"#06091a",
              transform:on?"translateY(-6px)":"none",
            }}>
            {/* Holographic shimmer layer */}
            {on && (
              <div style={{
                position:"absolute",inset:0,zIndex:10,pointerEvents:"none",mixBlendMode:"screen",
                background:`linear-gradient(${angle}deg,
                  rgba(255,30,80,.07),rgba(255,160,0,.07),rgba(0,255,100,.07),
                  rgba(0,120,255,.07),rgba(180,0,255,.07),rgba(255,30,80,.07))`,
              }}/>
            )}
            {/* Rarity header */}
            <div style={{
              padding:"5px 9px",
              background:`linear-gradient(90deg,${item.c1}28,transparent)`,
              borderBottom:`1px solid ${item.c1}28`,
              display:"flex",justifyContent:"space-between",alignItems:"center",
            }}>
              <span style={{fontSize:8,fontWeight:800,color:col,letterSpacing:".1em"}}>{rarity(item.rating)}</span>
              <span style={{fontSize:9,color:col}}>{stars(item.rating)}</span>
            </div>
            {/* Art */}
            <Cover item={item} h={154}/>
            {/* Stats block */}
            <div style={{padding:"9px 10px 8px",background:"linear-gradient(to bottom,#0b1026,#06091a)"}}>
              <div style={{
                fontWeight:900,fontSize:13,color:on?"#fff":"#b0b8d0",marginBottom:2,
                textShadow:on?`0 0 14px ${item.c1}80`:"none",transition:"text-shadow .2s",
              }}>{item.title}</div>
              <div style={{fontSize:9,color:"#3d4a6a",marginBottom:9,letterSpacing:".04em"}}>
                {item.type.toUpperCase()} · {item.genre.toUpperCase()}
              </div>
              <div style={{borderTop:`1px solid ${item.c1}22`,paddingTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:9,color:"#5a6a88"}}>PWR</span>
                  <span style={{fontSize:9,fontWeight:700,color:col}}>{item.rating}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:9,color:"#5a6a88"}}>YR</span>
                  <span style={{fontSize:9,color:"#404a60"}}>{item.year}</span>
                </div>
              </div>
            </div>
            {/* Foil strip */}
            <div style={{
              height:4,
              background:on
                ? `linear-gradient(${angle}deg,${item.c1},rgba(255,255,255,.7),${item.c2})`
                : `linear-gradient(90deg,${item.c1},${item.c2})`,
              transition:"background .2s",
            }}/>
          </div>
        );
      })}
    </div>
  );
}

// ── 5. GAME CARTRIDGE ────────────────────────────────────────────────────
// Items rendered as SNES-era cartridges: grey plastic body, inset label,
// title strip, and a row of gold connector pins at the bottom.
function GameCart({ items }) {
  const [hov, setHov] = useState(null);

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(132px,1fr))",gap:18,padding:"18px 0"}}>
      {items.map(item => {
        const on = hov===item.id;
        return (
          <div key={item.id} className="gcart"
            onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
            style={{
              cursor:"pointer",borderRadius:6,overflow:"hidden",
              transform:on?"translateY(-10px) scale(1.03)":"none",
              boxShadow:on?`0 22px 44px rgba(0,0,0,.82),0 0 0 2px ${item.c1}65`:"0 6px 20px rgba(0,0,0,.5)",
            }}>
            {/* Cartridge shell */}
            <div style={{background:"linear-gradient(158deg,#3c4046,#22262b)",padding:"7px 7px 0"}}>
              {/* Maker strip */}
              <div style={{textAlign:"center",fontSize:6.5,fontWeight:800,color:"#484e58",letterSpacing:".2em",textTransform:"uppercase",marginBottom:5}}>
                EMBER ◈ MEDIA CORP
              </div>
              {/* Cover label inset */}
              <div style={{
                borderRadius:3,overflow:"hidden",
                border:`2px solid ${on?item.c1+"80":"#4a5060"}`,
                boxShadow:on?`0 0 18px ${item.c1}40`:"none",
                transition:"border-color .25s,box-shadow .25s",
              }}>
                <Cover item={item} h={144}/>
              </div>
              {/* Title strip */}
              <div style={{padding:"6px 4px 5px",background:`linear-gradient(to right,${item.c2}dd,#1a1d22cc)`}}>
                <div style={{fontWeight:800,fontSize:11,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2}}>
                  {item.title}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <span style={{fontSize:9,color:item.c1,fontWeight:700}}>★{item.rating}</span>
                  <span style={{fontSize:8,color:"#484e58"}}>{item.year}</span>
                </div>
              </div>
            </div>
            {/* Connector pins */}
            <div style={{background:"#0f1115",padding:"5px 6px 6px",display:"flex",gap:2,justifyContent:"center"}}>
              {Array.from({length:10}).map((_,i)=>(
                <div key={i} style={{
                  width:8,height:18,
                  background:`linear-gradient(to bottom,${on?"#b8962a":"#7a6520"},${on?"#d4a830":"#5a4a18"},${on?"#b8962a":"#7a6520"})`,
                  borderRadius:1,
                }}/>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────
const VIEWS = [
  {id:"hex",    label:"Hex Grid",     sub:"Honeycomb"},
  {id:"star",   label:"Star Map",     sub:"Constellation"},
  {id:"ticker", label:"Ticker",       sub:"Runway strips"},
  {id:"card",   label:"Trading Card", sub:"Holographic"},
  {id:"cart",   label:"Game Cart",    sub:"Cartridge"},
];

export default function EmberLayouts3() {
  const [view, setView] = useState("hex");
  const [filter, setFilter] = useState("all");
  const filtered = LIB.filter(i=>filter==="all"||i.type===filter);

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
              <div style={{fontSize:8,color:"#3d4460",marginTop:-1,letterSpacing:".14em"}}>NOVEL LAYOUTS VOL. 3</div>
            </div>
          </div>
          <div style={{display:"flex",gap:5}}>
            {["all","game","movie"].map(f=>(
              <button key={f} className="pill" onClick={()=>setFilter(f)}
                style={{background:filter===f?"#7c5cfc":"#10131e",color:filter===f?"#fff":"#6b7280"}}>
                {f==="all"?"All":f==="game"?"Games":"Movies"}
              </button>
            ))}
          </div>
        </div>
        {/* View tabs */}
        <div style={{display:"flex",gap:2,padding:"8px 0 0",overflowX:"auto",scrollbarWidth:"none"}}>
          {VIEWS.map(v=>(
            <button key={v.id} className={`vbtn${view===v.id?" on":""}`} onClick={()=>setView(v.id)}>
              <div style={{fontSize:12,fontWeight:700,color:view===v.id?"#dde0f0":"#5a6070"}}>{v.label}</div>
              <div style={{fontSize:9,color:view===v.id?"#7c5cfc":"#3d4460",marginTop:1}}>{v.sub}</div>
            </button>
          ))}
        </div>
        {view==="hex"    && <HexGrid      items={filtered}/>}
        {view==="star"   && <StarMap      items={filtered}/>}
        {view==="ticker" && <TickerRunway items={filtered}/>}
        {view==="card"   && <TradingCard  items={filtered}/>}
        {view==="cart"   && <GameCart     items={filtered}/>}
      </div>
    </>
  );
}
