import { useState, useEffect } from "react";

const LIB = [
  { id:1,  title:"Hollow Abyss",    type:"game",  genre:"RPG",         rating:9.2, year:2024, c1:"#6c2bd9", c2:"#1a0a3d", icon:"⚔" },
  { id:2,  title:"Neon Drift",      type:"game",  genre:"Racing",      rating:8.7, year:2023, c1:"#f97316", c2:"#431407", icon:"▲" },
  { id:3,  title:"The Last Signal", type:"movie", genre:"Sci-Fi",      rating:8.5, year:2024, c1:"#0ea5e9", c2:"#0c2340", icon:"◉" },
  { id:4,  title:"Iron Siege",      type:"game",  genre:"Strategy",    rating:7.9, year:2023, c1:"#94a3b8", c2:"#1e293b", icon:"■" },
  { id:5,  title:"Verdant World",   type:"game",  genre:"Adventure",   rating:9.1, year:2025, c1:"#22c55e", c2:"#052e16", icon:"◈" },
  { id:6,  title:"Crimson Tide",    type:"movie", genre:"Action",      rating:7.2, year:2022, c1:"#ef4444", c2:"#450a0a", icon:"◆" },
  { id:7,  title:"Phantom Protocol",type:"game",  genre:"Stealth",     rating:8.8, year:2024, c1:"#a78bfa", c2:"#2e1065", icon:"◎" },
  { id:8,  title:"Solar Winds",     type:"movie", genre:"Documentary", rating:8.0, year:2023, c1:"#fbbf24", c2:"#451a03", icon:"☀" },
  { id:9,  title:"Rift Walker",     type:"game",  genre:"Platformer",  rating:8.3, year:2024, c1:"#ec4899", c2:"#500724", icon:"◐" },
  { id:10, title:"Echoes",          type:"movie", genre:"Drama",       rating:7.6, year:2023, c1:"#06b6d4", c2:"#082f49", icon:"◑" },
  { id:11, title:"Storm Protocol",  type:"game",  genre:"FPS",         rating:8.9, year:2025, c1:"#f59e0b", c2:"#431407", icon:"◉" },
  { id:12, title:"Distant Stars",   type:"movie", genre:"Sci-Fi",      rating:9.0, year:2024, c1:"#8b5cf6", c2:"#1e003d", icon:"★" },
  { id:13, title:"Abyss Crawler",   type:"game",  genre:"Horror",      rating:8.1, year:2023, c1:"#475569", c2:"#020617", icon:"▼" },
  { id:14, title:"Frostpeak",       type:"game",  genre:"Survival",    rating:7.8, year:2024, c1:"#7dd3fc", c2:"#0c1a3d", icon:"❄" },
  { id:15, title:"Rogue Circuit",   type:"game",  genre:"Roguelike",   rating:9.3, year:2025, c1:"#4ade80", c2:"#052e16", icon:"◌" },
  { id:16, title:"Veil of Shadows", type:"movie", genre:"Thriller",    rating:7.4, year:2022, c1:"#6b7280", c2:"#030712", icon:"▪" },
];

const CSS = `
  .row-scroll{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none}
  .row-scroll::-webkit-scrollbar{display:none}
  .g-card{transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease}
  .b-card{transition:transform .2s ease,box-shadow .25s ease}
  .r-card{transition:transform .2s ease,box-shadow .2s ease}
  .cf-card{transition:transform .48s cubic-bezier(.16,1,.3,1),opacity .48s ease,box-shadow .4s ease}
  .sp-item{transition:width .38s cubic-bezier(.34,1.56,.64,1),height .38s cubic-bezier(.34,1.56,.64,1),box-shadow .28s ease}
  .vbtn{background:transparent;border:1px solid transparent;border-radius:8px;padding:8px 13px;cursor:pointer;transition:all .18s;flex-shrink:0;text-align:left}
  .vbtn:hover{border-color:#1e2232}
  .vbtn.on{background:#14172200;border-color:rgba(124,92,252,.35);background:#141722}
  .pill{border:none;border-radius:20px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;transition:all .18s}
`;

function Cover({ item, h="100%", style={} }) {
  return (
    <div style={{
      height:h, flexShrink:0, position:"relative", overflow:"hidden",
      background:`radial-gradient(ellipse at 22% 18%, ${item.c1}cc 0%, ${item.c2} 68%)`,
      ...style,
    }}>
      <svg width="100%" height="100%" style={{position:"absolute",inset:0,opacity:.07,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id={`g${item.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0L0 0 0 22" fill="none" stroke="white" strokeWidth=".5"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill={`url(#g${item.id})`}/>
      </svg>
      <div style={{position:"absolute",top:9,left:9,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,.42)",backdropFilter:"blur(4px)",fontSize:9,fontWeight:700,letterSpacing:".12em",color:item.c1,textTransform:"uppercase",border:`1px solid ${item.c1}55`}}>{item.genre}</div>
      <div style={{position:"absolute",top:8,right:10,fontSize:22,opacity:.3,color:"#fff"}}>{item.icon}</div>
    </div>
  );
}

// ── 1. GLARE GRID ────────────────────────────────────────────────────
function GlareGrid({ items }) {
  const [hov, setHov] = useState(null);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(146px,1fr))",gap:13,padding:"18px 0"}}>
      {items.map(item => (
        <div key={item.id} className="g-card"
          onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
          style={{
            borderRadius:12,overflow:"hidden",cursor:"pointer",position:"relative",
            transform:hov===item.id?"translateY(-8px) scale(1.02)":"none",
            boxShadow:hov===item.id?`0 22px 42px ${item.c1}40,0 0 0 1px ${item.c1}55`:"0 4px 14px rgba(0,0,0,.45)",
          }}>
          <Cover item={item} h={196}/>
          {hov===item.id && <div style={{position:"absolute",inset:0,pointerEvents:"none",background:"linear-gradient(135deg,rgba(255,255,255,.1),transparent 55%)"}}/>}
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.93),transparent)",padding:hov===item.id?"44px 11px 11px":"28px 11px 9px",transition:"padding .2s"}}>
            <div style={{fontWeight:800,fontSize:12,color:"#fff",lineHeight:1.3,marginBottom:4}}>{item.title}</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:"#fbbf24",fontSize:10,fontWeight:700}}>★ {item.rating}</span>
              <span style={{color:"#6b7280",fontSize:10}}>{item.year}</span>
            </div>
            {hov===item.id && (
              <div style={{marginTop:9,background:item.c1,borderRadius:5,padding:"6px 0",textAlign:"center",fontSize:11,fontWeight:800,letterSpacing:".06em",color:"#fff",boxShadow:`0 4px 12px ${item.c1}55`}}>
                {item.type==="game"?"▶  PLAY":"▶  WATCH"}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 2. BENTO EDITORIAL ───────────────────────────────────────────────
const BP=[["1/3","1/3"],["3/4","1/2"],["4/5","1/2"],["3/4","2/3"],["4/5","2/3"],["1/2","3/4"],["2/3","3/4"],["3/5","3/4"],["1/2","4/5"],["2/3","4/5"],["3/4","4/5"],["4/5","4/5"]];

function BentoEdit({ items }) {
  const [hov, setHov] = useState(null);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gridAutoRows:"164px",gap:10,padding:"18px 0"}}>
      {items.slice(0,12).map((item,i) => {
        const [col,row]=BP[i]||["auto","auto"];
        const big=i===0;
        return (
          <div key={item.id} className="b-card"
            onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
            style={{gridColumn:col,gridRow:row,borderRadius:big?18:12,overflow:"hidden",cursor:"pointer",position:"relative",
              transform:hov===item.id?"scale(1.015)":"none",
              boxShadow:hov===item.id?`0 16px 40px ${item.c1}40`:"0 2px 8px rgba(0,0,0,.35)"}}>
            <Cover item={item} h="100%"/>
            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.9),transparent)",padding:big?"58px 17px 17px":"26px 11px 9px"}}>
              {big && <div style={{fontSize:9,fontWeight:800,letterSpacing:".2em",color:item.c1,marginBottom:5,textTransform:"uppercase"}}>Featured</div>}
              <div style={{fontWeight:900,color:"#fff",lineHeight:1.2,marginBottom:big?7:3,fontSize:big?19:12}}>{item.title}</div>
              {big
                ? <div style={{display:"flex",gap:11,alignItems:"center"}}>
                    <span style={{color:"#fbbf24",fontWeight:700}}>★ {item.rating}</span>
                    <span style={{color:"rgba(255,255,255,.4)",fontSize:11}}>{item.year}</span>
                    <span style={{padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,background:`${item.c1}22`,color:item.c1,border:`1px solid ${item.c1}44`}}>{item.type}</span>
                  </div>
                : <div style={{color:"#9ca3af",fontSize:10}}>★ {item.rating}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 3. CINEROWS ──────────────────────────────────────────────────────
function Cinerows({ items }) {
  const hero=items[0];
  const [hov, setHov]=useState(null);
  const rows=[
    {label:"Games",    data:items.filter(i=>i.type==="game").slice(0,6)},
    {label:"Movies",   data:items.filter(i=>i.type==="movie").slice(0,6)},
    {label:"Top Rated ★",data:[...items].sort((a,b)=>b.rating-a.rating).slice(0,6)},
  ];
  if(!hero) return null;
  return (
    <div>
      <div style={{borderRadius:18,overflow:"hidden",height:244,position:"relative",margin:"18px 0 26px",background:`radial-gradient(ellipse at 18% 50%,${hero.c1}bb,${hero.c2})`}}>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent 28%,rgba(10,11,15,.95))"}}/>
        <div style={{position:"absolute",left:32,top:"50%",transform:"translateY(-50%)",fontSize:66,opacity:.13,color:"#fff"}}>{hero.icon}</div>
        <div style={{position:"absolute",right:0,top:0,bottom:0,width:"56%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 34px"}}>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:".2em",color:hero.c1,textTransform:"uppercase",marginBottom:7}}>Featured {hero.type}</div>
          <div style={{fontSize:25,fontWeight:900,color:"#fff",lineHeight:1.1,marginBottom:11}}>{hero.title}</div>
          <div style={{display:"flex",gap:12,marginBottom:17,fontSize:12,color:"#9ca3af"}}>
            <span style={{color:"#fbbf24",fontWeight:700}}>★ {hero.rating}</span>
            <span>{hero.genre}</span><span>{hero.year}</span>
          </div>
          <div style={{display:"inline-block",background:hero.c1,padding:"9px 22px",borderRadius:9,fontWeight:800,fontSize:12,letterSpacing:".05em",color:"#fff",cursor:"pointer",boxShadow:`0 8px 22px ${hero.c1}50`,alignSelf:"flex-start"}}>
            ▶  {hero.type==="game"?"PLAY NOW":"WATCH NOW"}
          </div>
        </div>
      </div>
      {rows.map(row=>(
        <div key={row.label} style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:10}}>
            <h3 style={{margin:0,fontSize:13,fontWeight:800,color:"#dde0f0"}}>{row.label}</h3>
            <span style={{fontSize:10,color:"#4b5563",cursor:"pointer"}}>See all →</span>
          </div>
          <div className="row-scroll">
            {row.data.map(item=>(
              <div key={item.id} className="r-card"
                onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                style={{flexShrink:0,width:122,borderRadius:9,overflow:"hidden",cursor:"pointer",
                  transform:hov===item.id?"translateY(-6px)":"none",
                  boxShadow:hov===item.id?`0 12px 26px ${item.c1}50`:"none"}}>
                <Cover item={item} h={168}/>
                <div style={{padding:"7px 9px",background:"#10121e"}}>
                  <div style={{fontWeight:700,fontSize:11,color:"#dde0f0",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                  <div style={{fontSize:9,color:"#6b7280"}}>{item.genre}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 4. COVERFLOW 3D ──────────────────────────────────────────────────
function Coverflow({ items }) {
  const pool=items.slice(0,Math.min(9,items.length));
  const [active,setActive]=useState(Math.min(4,pool.length-1));
  const sa=Math.min(active,pool.length-1);
  const cur=pool[sa];

  useEffect(()=>{
    const h=e=>{
      if(e.key==="ArrowLeft")  setActive(a=>Math.max(0,a-1));
      if(e.key==="ArrowRight") setActive(a=>Math.min(pool.length-1,a+1));
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[pool.length]);

  if(!cur) return null;

  return (
    <div style={{padding:"34px 0 0"}}>
      <div style={{textAlign:"center",marginBottom:28,height:62}}>
        <div style={{fontSize:19,fontWeight:900,color:"#fff",marginBottom:5}}>{cur.title}</div>
        <div style={{display:"flex",justifyContent:"center",gap:14,color:"#9ca3af",fontSize:12}}>
          <span>{cur.genre}</span>
          <span style={{color:"#fbbf24",fontWeight:700}}>★ {cur.rating}</span>
          <span>{cur.year}</span>
        </div>
      </div>

      <div style={{position:"relative",height:280,perspective:"980px",perspectiveOrigin:"50% 50%",overflow:"hidden"}}>
        {pool.map((item,i)=>{
          const off=i-sa, abs=Math.abs(off);
          if(abs>3) return null;
          const dir=Math.sign(off);
          const tx=off===0?"-50%":`calc(-50% + ${dir*(118+abs*46)}px)`;
          return (
            <div key={item.id} className="cf-card"
              onClick={()=>setActive(i)}
              style={{
                position:"absolute",left:"50%",top:"50%",
                width:172,height:246,marginTop:-123,
                borderRadius:13,overflow:"hidden",cursor:"pointer",
                transform:`translateX(${tx}) rotateY(${dir*47}deg) translateZ(${abs===0?0:-88-abs*58}px) scale(${abs===0?1:Math.max(.5,.87-abs*.13)})`,
                opacity:abs===0?1:Math.max(.22,.82-abs*.22),
                zIndex:10-abs,
                boxShadow:abs===0?`0 26px 56px ${cur.c1}48,0 0 0 2px ${cur.c1}70`:"0 8px 22px rgba(0,0,0,.6)",
              }}>
              <Cover item={item} h="100%"/>
              {off!==0 && <div style={{position:"absolute",inset:0,pointerEvents:"none",background:`linear-gradient(${off<0?"270deg":"90deg"},rgba(10,11,15,.52),transparent 65%)`}}/>}
            </div>
          );
        })}
      </div>

      <div style={{height:36,display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:4}}>
        <div style={{width:172,height:30,background:`radial-gradient(ellipse at 50% 0%,${cur.c1}28,transparent 70%)`,filter:"blur(5px)"}}/>
      </div>

      <div style={{display:"flex",justifyContent:"center",gap:7,marginTop:6}}>
        {pool.map((_,i)=>(
          <div key={i} onClick={()=>setActive(i)} style={{width:i===sa?22:7,height:7,borderRadius:4,cursor:"pointer",background:i===sa?cur.c1:"#1d2235",transition:"all .3s"}}/>
        ))}
      </div>
      <div style={{textAlign:"center",marginTop:7,fontSize:10,color:"#364156"}}>Click a cover · ← → arrow keys</div>

      <div style={{display:"flex",justifyContent:"center",marginTop:18}}>
        <div style={{background:cur.c1,color:"#fff",padding:"10px 34px",borderRadius:9,fontWeight:800,fontSize:12,letterSpacing:".06em",cursor:"pointer",boxShadow:`0 8px 26px ${cur.c1}52`,transition:"all .3s"}}>
          ▶  {cur.type==="game"?"PLAY NOW":"WATCH NOW"}
        </div>
      </div>
    </div>
  );
}

// ── 5. SPINE RACK ────────────────────────────────────────────────────
function SpineRack({ items }) {
  const [hov,setHov]=useState(null);
  const shelves=[items.slice(0,8),items.slice(8,16)].filter(s=>s.length>0);
  return (
    <div style={{padding:"22px 0 28px"}}>
      {shelves.map((shelf,si)=>(
        <div key={si} style={{marginBottom:34}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".2em",color:"#4b5563",textTransform:"uppercase",marginBottom:9,paddingLeft:3}}>Shelf {si+1}</div>
          <div style={{padding:"12px 12px 0",background:"#0c0e15",borderRadius:"10px 10px 0 0",display:"flex",gap:3,alignItems:"flex-end",minHeight:226,overflowX:"auto",scrollbarWidth:"none"}}>
            {shelf.map(item=>{
              const on=hov===item.id;
              return (
                <div key={item.id} className="sp-item"
                  onMouseEnter={()=>setHov(item.id)} onMouseLeave={()=>setHov(null)}
                  style={{
                    flexShrink:0,
                    width:on?148:36,height:on?212:198,
                    borderRadius:on?"7px 7px 0 0":"3px 3px 0 0",
                    overflow:"hidden",cursor:"pointer",position:"relative",
                    background:`linear-gradient(180deg,${item.c1},${item.c2})`,
                    boxShadow:on?`0 -8px 28px ${item.c1}50,4px 0 18px rgba(0,0,0,.4)`:"2px 0 6px rgba(0,0,0,.4)",
                    zIndex:on?5:1,
                  }}>
                  {!on && (
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{writingMode:"vertical-rl",textOrientation:"mixed",transform:"rotate(180deg)",fontSize:10,fontWeight:800,color:"rgba(255,255,255,.82)",letterSpacing:".04em",maxHeight:166,overflow:"hidden",whiteSpace:"nowrap"}}>
                        {item.title}
                      </span>
                    </div>
                  )}
                  {on && (
                    <>
                      <Cover item={item} h="100%" style={{position:"absolute",inset:0}}/>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.92),transparent)",padding:"42px 10px 10px"}}>
                        <div style={{fontSize:11,fontWeight:800,color:"#fff",marginBottom:3,lineHeight:1.3}}>{item.title}</div>
                        <div style={{fontSize:9,color:"rgba(255,255,255,.52)",marginBottom:7}}>{item.genre} · {item.year}</div>
                        <div style={{background:"rgba(255,255,255,.14)",backdropFilter:"blur(4px)",borderRadius:4,padding:"4px 0",textAlign:"center",fontSize:10,fontWeight:800,color:"#fff"}}>
                          {item.type==="game"?"▶ PLAY":"▶ WATCH"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{height:13,background:"linear-gradient(180deg,#2a1e10,#19120a)",borderRadius:"0 0 6px 6px",boxShadow:"0 6px 18px rgba(0,0,0,.72)"}}/>
        </div>
      ))}
      <div style={{textAlign:"center",fontSize:10,color:"#313848",marginTop:2}}>Hover a spine to preview</div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────
const VIEWS=[
  {id:"grid",      label:"Glare Grid",  sub:"Classic"},
  {id:"bento",     label:"Bento",       sub:"Editorial"},
  {id:"rows",      label:"Cinerows",    sub:"Category lanes"},
  {id:"coverflow", label:"Coverflow",   sub:"3D arc"},
  {id:"spine",     label:"Spine Rack",  sub:"Physical shelf"},
];

export default function EmberLibrary() {
  const [view,setView]=useState("grid");
  const [filter,setFilter]=useState("all");
  const filtered=LIB.filter(i=>filter==="all"||i.type===filter);

  return (
    <>
      <style>{CSS}</style>
      <div style={{background:"#090b10",minHeight:"100vh",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:"#dde0f0",padding:"0 18px"}}>

        {/* Header */}
        <div style={{padding:"15px 0 11px",borderBottom:"1px solid #171b28",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:29,height:29,borderRadius:8,background:"linear-gradient(135deg,#ff6b35,#7c5cfc)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff"}}>
              ◈
            </div>
            <div>
              <div style={{fontWeight:900,fontSize:15,letterSpacing:"-.04em",color:"#fff"}}>Ember</div>
              <div style={{fontSize:8,color:"#3d4460",marginTop:-1,letterSpacing:".14em"}}>LIBRARY</div>
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

        {/* View switcher */}
        <div style={{display:"flex",gap:2,padding:"8px 0 0",overflowX:"auto",scrollbarWidth:"none"}}>
          {VIEWS.map(v=>(
            <button key={v.id} className={`vbtn${view===v.id?" on":""}`} onClick={()=>setView(v.id)}>
              <div style={{fontSize:12,fontWeight:700,color:view===v.id?"#dde0f0":"#5a6070"}}>{v.label}</div>
              <div style={{fontSize:9,color:view===v.id?"#7c5cfc":"#3d4460",marginTop:1}}>{v.sub}</div>
            </button>
          ))}
        </div>

        {view==="grid"      && <GlareGrid items={filtered}/>}
        {view==="bento"     && <BentoEdit items={filtered}/>}
        {view==="rows"      && <Cinerows  items={filtered}/>}
        {view==="coverflow" && <Coverflow items={filtered}/>}
        {view==="spine"     && <SpineRack items={filtered}/>}
      </div>
    </>
  );
}
