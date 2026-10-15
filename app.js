/* 23 de Maio Barbearia — site público + painel do barbeiro (Supabase) */
(function(){
"use strict";

/* ============ helpers ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=n=>"R$ "+(Number(n)||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const digits=s=>String(s||"").replace(/\D/g,"");
const fmtPhone=s=>{const d=digits(s).slice(0,11);if(d.length<=2)return d;if(d.length<=6)return`(${d.slice(0,2)}) ${d.slice(2)}`;if(d.length<=10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`};
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d)};
const addMonths=(s,n)=>{const d=parseD(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return ymd(d)};
const today=()=>ymd(new Date());
const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m};
const toHM=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const DOW=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DOWF=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const MON=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MONF=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const dLabel=s=>{const d=parseD(s);return`${DOWF[d.getDay()]}, ${d.getDate()} de ${MON[d.getMonth()]}`};
const dShort=s=>{const d=parseD(s);return`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`};
const uid=()=>(crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));
const durTxt=m=>m>=60?`${Math.floor(m/60)}h${m%60?pad(m%60):""}`:`${m} min`;
const money=v=>Number(String(v).replace(/\./g,"").replace(",","."))||0;
let toastT;function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2800)}

/* ============ defaults (usados até o banco responder) ============ */
const DEF={
  services:[
    {id:"corte",name:"Corte",price:45,dur:30},
    {id:"barba",name:"Barba",price:45,dur:30},
    {id:"cbs",name:"Corte + barba + sobrancelha",price:90,dur:60,combo:true},
    {id:"sobrancelha",name:"Sobrancelha",price:15,dur:15},
    {id:"alisamento",name:"Alisamento",price:30,dur:30},
    {id:"hidratacao",name:"Hidratação",price:20,dur:15},
    {id:"limpeza",name:"Limpeza de pele",price:30,dur:30},
    {id:"depilacao",name:"Depilação nariz e orelha",price:15,dur:15}
  ],
  hours:{wk:["09:30","19:00"],sat:["09:30","17:00"]},
  step:30,chairs:1,whatsapp:"41987402139",address:"Rua Padre Gaston, 571",plans:[],blocked:[]
};
const EXP_CATS=["Aluguel","Produtos","Energia","Água","Internet","Comissão / salários","Manutenção","Impostos","Marketing","Outros"];
const ERRS={NOME_INVALIDO:"Digite nome e sobrenome.",CELULAR_INVALIDO:"Digite o celular com DDD.",SERVICO_INVALIDO:"Escolha pelo menos um serviço.",
  DATA_INVALIDA:"Escolha uma data dentro dos próximos 60 dias.",DIA_FECHADO:"A barbearia não abre nesse dia.",HORARIO_INVALIDO:"Esse horário passa do expediente. Escolha outro.",
  HORARIO_PASSADO:"Esse horário já passou. Escolha outro.",HORARIO_OCUPADO:"Esse horário acabou de ser ocupado. Escolha outro.",
  LIMITE_AGENDAMENTOS:"Esse celular já tem 3 horários marcados. Cancele um ou fale com a gente no WhatsApp.",CONFIG_AUSENTE:"Agenda em configuração. Tente mais tarde."};
const errMsg=e=>{const m=(e&&(e.message||e.details))||"";const k=Object.keys(ERRS).find(k=>m.includes(k));return k?ERRS[k]:"Não foi possível concluir. Verifique a internet e tente de novo."};

/* ============ dados ============ */
const CFG=window.APP_CONFIG||{};
const secretKey=/^sb_secret_|service_role/.test(CFG.SUPABASE_ANON_KEY||"");
if(secretKey)console.error("config.js contém a chave SECRETA do Supabase. Use a chave publishable/anon e troque (rotate) a secreta.");
const configured=!secretKey&&/^https:\/\//.test(CFG.SUPABASE_URL||"")&&!!CFG.SUPABASE_ANON_KEY&&!/COLE_AQUI/.test(CFG.SUPABASE_ANON_KEY);
const sb=configured&&window.supabase?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;
if(!sb)$("#cfgBar").hidden=false;

const S={admin:false,settings:null,busy:[],data:{appointments:{},expenses:{},subscribers:{}},channel:null};
const cfg=()=>{const c=S.settings||{};return{...DEF,...c,hours:{...DEF.hours,...(c.hours||{})}}};
const appts=()=>Object.values(S.data.appointments);
const subs=()=>Object.values(S.data.subscribers);
const exps=()=>Object.values(S.data.expenses);

async function put(table,obj){
  const prev=S.data[table][obj.id];
  S.data[table]={...S.data[table],[obj.id]:obj};render();
  const {error}=await sb.from(table).upsert(obj);
  if(error){if(prev)S.data[table][obj.id]=prev;else delete S.data[table][obj.id];render();toast("Não foi possível salvar. Tente de novo.");throw error}
}
async function del(table,id){
  const prev=S.data[table][id];const c={...S.data[table]};delete c[id];S.data[table]=c;render();
  const {error}=await sb.from(table).delete().eq("id",id);
  if(error){S.data[table][id]=prev;render();toast("Não foi possível excluir.")}
}
async function saveCfg(patch){
  const data={...cfg(),...patch};const prev=S.settings;S.settings=data;render();
  const {error}=await sb.from("settings").upsert({id:1,data,updated_at:new Date().toISOString()});
  if(error){S.settings=prev;render();toast("Não foi possível salvar os ajustes.");throw error}
}
async function fetchAll(table){
  const out={};let from=0;
  for(;;){const {data,error}=await sb.from(table).select("*").range(from,from+999);if(error)throw error;
    data.forEach(r=>out[r.id]=r);if(data.length<1000)break;from+=1000}
  return out;
}
async function loadSettings(){
  if(!sb)return;
  const {data}=await sb.from("settings").select("data").eq("id",1).maybeSingle();
  if(data)S.settings=data.data;render();
}
async function loadBusy(){
  if(!sb||S.admin)return;
  const {data,error}=await sb.rpc("busy_slots",{d1:today(),d2:addDays(today(),30)});
  if(!error){S.busy=data||[];render()}
}
async function loadAdminData(){
  const [a,s,e]=await Promise.all(["appointments","subscribers","expenses"].map(fetchAll));
  S.data={appointments:a,subscribers:s,expenses:e};render();
  if(S.channel)sb.removeChannel(S.channel);
  S.channel=sb.channel("painel")
    .on("postgres_changes",{event:"*",schema:"public"},p=>{
      const t=p.table;
      if(t==="settings"){if(p.new&&p.new.data)S.settings=p.new.data}
      else if(S.data[t]){const c={...S.data[t]};if(p.eventType==="DELETE")delete c[p.old.id];else c[p.new.id]=p.new;S.data[t]=c}
      render();
    }).subscribe();
}
async function checkSession(){
  if(!sb)return false;
  const {data}=await sb.auth.getSession();
  if(!data.session)return false;
  const r=await sb.rpc("is_admin");
  S.admin=!r.error&&r.data===true;
  if(S.admin)await loadAdminData();
  return S.admin;
}

/* ============ disponibilidade ============ */
function hoursFor(date){
  const c=cfg();if((c.blocked||[]).includes(date))return null;
  const dow=parseD(date).getDay();if(dow===0)return null;
  return dow===6?c.hours.sat:c.hours.wk;
}
const ACTIVE=["agendado","concluido","bloqueio"];
function busyCount(date,start,end,ignore){
  const src=S.admin?appts().filter(a=>ACTIVE.includes(a.status)&&a.id!==ignore):S.busy;
  return src.filter(a=>a.date===date&&toMin(a.time)<end&&toMin(a.time)+(a.dur||30)>start).length;
}
function slotsFor(date,dur,ignore){
  const h=hoursFor(date);if(!h)return[];
  const c=cfg(),out=[],open=toMin(h[0]),close=toMin(h[1]);
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes(),isToday=date===today();
  for(let m=open;m+dur<=close;m+=Number(c.step)||30){
    out.push({t:toHM(m),ok:!(isToday&&m<=nowM)&&busyCount(date,m,m+dur,ignore)<(Number(c.chairs)||1)});
  }
  return out;
}
function activeSub(phone){const p=digits(phone);return subs().find(s=>digits(s.phone)===p&&s.active!==false&&s.due>=today())}

/* ============ SITE PÚBLICO ============ */
const B={sel:[],date:null,time:null};
function selServices(){const c=cfg();return B.sel.map(id=>c.services.find(s=>s.id===id)).filter(Boolean)}
function renderPublic(){
  const c=cfg();
  $("#hWk").textContent=`${c.hours.wk[0]} – ${c.hours.wk[1]}`;
  $("#hSat").textContent=`${c.hours.sat[0]} – ${c.hours.sat[1]}`;
  const h=hoursFor(today()),nm=new Date().getHours()*60+new Date().getMinutes();
  const open=h&&nm>=toMin(h[0])&&nm<toMin(h[1]);
  $("#openDot").classList.toggle("closed",!open);$("#openTxt").textContent=open?`Aberto agora · até ${h[1]}`:"Fechado agora · agende online";
  $("#footWa").textContent=c.whatsapp?`WhatsApp ${fmtPhone(c.whatsapp)}`:"WhatsApp";
  $("#footAddr").textContent=c.address||`Seg a sex ${c.hours.wk[0]}–${c.hours.wk[1]} · Sáb ${c.hours.sat[0]}–${c.hours.sat[1]}`;
  B.sel=B.sel.filter(id=>c.services.some(s=>s.id===id));
  $("#svcList").innerHTML=c.services.map(s=>`
    <button class="svc ${B.sel.includes(s.id)?"on":""}" data-svc="${esc(s.id)}" aria-pressed="${B.sel.includes(s.id)}">
      <span style="display:flex;flex-direction:column;gap:4px;min-width:0"><span class="svc-name">${esc(s.name)}</span>
      <span class="svc-meta"><span>${durTxt(s.dur)}</span>${s.combo?'<span class="tag-combo">Combo</span>':""}</span></span>
      <span class="svc-price num">${brl(s.price)}</span><span class="check"></span>
    </button>`).join("");
  const sel=selServices(),dur=sel.reduce((a,s)=>a+Number(s.dur),0),tot=sel.reduce((a,s)=>a+Number(s.price),0);
  $("#selChips").innerHTML=sel.length?sel.map(s=>`<span class="chip">${esc(s.name)} <button data-unsel="${esc(s.id)}" aria-label="Remover ${esc(s.name)}">×</button></span>`).join("")+` <a href="#servicos" class="btn sm ghost">+ Adicionar</a>`
    :`<p class="empty-note">Nenhum serviço escolhido. <a href="#servicos" style="color:var(--gold)">Escolha na tabela acima</a>.</p>`;
  const days=[];for(let i=0;i<21;i++)days.push(addDays(today(),i));
  if(B.date&&!hoursFor(B.date))B.date=null;
  $("#dayStrip").innerHTML=days.map(d=>{const dt=parseD(d),closed=!hoursFor(d)||(d===today()&&dur&&!slotsFor(d,dur).some(x=>x.ok));
    return`<button class="day ${B.date===d?"on":""}" data-day="${d}" ${closed||!sel.length?"disabled":""}><small>${d===today()?"Hoje":DOW[dt.getDay()]}</small><b class="num">${dt.getDate()}</b><small>${MON[dt.getMonth()]}</small></button>`}).join("");
  let slotHtml;
  if(!sel.length)slotHtml=`<p class="empty-note">Escolha os serviços primeiro.</p>`;
  else if(!B.date)slotHtml=`<p class="empty-note">Escolha o dia.</p>`;
  else{const sl=slotsFor(B.date,dur);if(B.time&&!sl.find(x=>x.t===B.time&&x.ok))B.time=null;
    slotHtml=sl.some(x=>x.ok)?`<div class="slots">${sl.map(x=>`<button class="slot ${B.time===x.t?"on":""}" data-slot="${x.t}" ${x.ok?"":"disabled"}>${x.t}</button>`).join("")}</div>`
    :`<p class="empty-note">Sem horários livres neste dia. Tente outro.</p>`}
  $("#slotArea").innerHTML=slotHtml;
  $("#st2").classList.toggle("locked",!sel.length);$("#st3").classList.toggle("locked",!B.date);$("#st4").classList.toggle("locked",!B.time);
  $("#sumItems").innerHTML=sel.length?sel.map(s=>`<div><span>${esc(s.name)}</span><span class="num">${brl(s.price)}</span></div>`).join(""):`<span class="empty-note">Escolha um serviço</span>`;
  $("#sumDay").textContent=B.date?dLabel(B.date):"—";$("#sumTime").textContent=B.time||"—";
  $("#sumDur").textContent=dur?durTxt(dur):"—";$("#sumTotal").textContent=brl(tot);
}
document.addEventListener("click",e=>{
  const s=e.target.closest("[data-svc]");
  if(s){const id=s.dataset.svc;B.sel=B.sel.includes(id)?B.sel.filter(x=>x!==id):[...B.sel,id];B.time=null;renderPublic();return}
  const u=e.target.closest("[data-unsel]");if(u){B.sel=B.sel.filter(x=>x!==u.dataset.unsel);B.time=null;renderPublic();return}
  const d=e.target.closest("[data-day]");if(d){B.date=d.dataset.day;B.time=null;renderPublic();return}
  const t=e.target.closest("[data-slot]");if(t){B.time=t.dataset.slot;renderPublic();setTimeout(()=>$("#bName").focus(),50);return}
  const w=e.target.closest("[data-wa]");if(w){e.preventDefault();openWa(cfg().whatsapp,w.dataset.wa);return}
});
function waUrl(num,text){let d=digits(num);if(!d)return null;if(d.length<=11)d="55"+d;return`https://wa.me/${d}?text=${encodeURIComponent(text||"")}`}
function openWa(num,text){const u=waUrl(num,text);if(!u){toast("WhatsApp não cadastrado.");return}window.open(u,"_blank","noopener")}
["#bPhone","#lookPhone"].forEach(id=>$(id).addEventListener("input",e=>{e.target.value=fmtPhone(e.target.value)}));

$("#bookForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("#bName").value.trim().replace(/\s+/g," "),phone=digits($("#bPhone").value);
  const nOk=name.split(" ").filter(w=>w.length>=2).length>=2;
  $("#eName").hidden=nOk;$("#eName").textContent="Digite nome e sobrenome.";$("#bName").classList.toggle("err",!nOk);
  const pOk=phone.length===11||phone.length===10;
  $("#ePhone").hidden=pOk;$("#ePhone").textContent="Digite o celular com DDD.";$("#bPhone").classList.toggle("err",!pOk);
  const sel=selServices();
  if(!sel.length){toast("Escolha pelo menos um serviço.");location.hash="servicos";return}
  if(!B.date||!B.time){toast("Escolha o dia e o horário.");return}
  if(!nOk||!pOk)return;
  if(!sb){toast("Site ainda não conectado ao banco de dados.");return}
  $("#bSubmit").disabled=true;$("#bSubmit").textContent="Confirmando…";
  const {data,error}=await sb.rpc("book_appointment",{p_name:name,p_phone:phone,p_service_ids:sel.map(s=>s.id),p_date:B.date,p_time:B.time});
  $("#bSubmit").disabled=false;$("#bSubmit").textContent="Confirmar agendamento";
  if(error){toast(errMsg(error));if(/OCUPADO|PASSADO/.test(error.message||"")){B.time=null;loadBusy()}return}
  showDone({...data,name,phone,date:B.date,time:B.time});
  if(S.admin){/* realtime atualiza */}else loadBusy();
});
function showDone(a){
  const c=cfg();
  const msg=`Olá! Agendei pelo site:\n${a.services.map(s=>s.name).join(" + ")}\n${dLabel(a.date)} às ${a.time}\nNome: ${a.name}`;
  $("#bookArea").hidden=true;const d=$("#doneArea");d.hidden=false;
  d.innerHTML=`<div class="step done">
    <span class="label">Agendamento confirmado</span><div class="big">Até ${esc(dLabel(a.date).split(",")[0].toLowerCase())}, ${esc(a.name.split(" ")[0])}!</div>
    <div class="ticket num"><span>Serviços</span><b>${esc(a.services.map(s=>s.name).join(" + "))}</b><span>Dia</span><b>${esc(dLabel(a.date))}</b>
    <span>Horário</span><b>${a.time} (${durTxt(a.dur)})</b><span>Valor</span><b>${a.assinante?"Incluso no plano":brl(a.total)}</b></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
      ${c.whatsapp?`<button class="btn wa" id="doneWa">Avisar no WhatsApp</button>`:""}
      <button class="btn" id="doneNew">Fazer outro agendamento</button></div>
    <span class="hint">Para cancelar, use “Meus horários” logo abaixo.</span></div>`;
  if(c.whatsapp)$("#doneWa").onclick=()=>openWa(c.whatsapp,msg);
  $("#doneNew").onclick=()=>{B.sel=[];B.date=null;B.time=null;$("#bName").value="";$("#bPhone").value="";d.hidden=true;$("#bookArea").hidden=false;renderPublic();location.hash="servicos"};
  d.scrollIntoView({behavior:"smooth",block:"start"});
}
let lookPhone="",mine=[];
$("#lookForm").addEventListener("submit",async e=>{e.preventDefault();lookPhone=digits($("#lookPhone").value);await fetchMine()});
async function fetchMine(){
  const el=$("#myList");
  if(lookPhone.length<10){el.innerHTML=`<p class="err-msg">Digite o celular com DDD.</p>`;return}
  if(!sb){el.innerHTML=`<p class="empty-note">Site ainda não conectado ao banco de dados.</p>`;return}
  el.innerHTML=`<p class="empty-note">Buscando…</p>`;
  const {data,error}=await sb.rpc("my_appointments",{p_phone:lookPhone});
  if(error){el.innerHTML=`<p class="err-msg">${esc(errMsg(error))}</p>`;return}
  mine=data||[];renderMine();
}
function renderMine(){
  const el=$("#myList");
  el.innerHTML=mine.length?mine.map(a=>`<div class="mycard"><div class="when num">${dShort(a.date).slice(0,5)} · ${a.time}</div>
    <div class="what">${esc(a.services.map(s=>s.name).join(" + "))}<br><small>${esc(dLabel(a.date))}</small></div>
    <div class="confirm-inline" data-cwrap="${a.id}"><button class="btn sm danger" data-askcancel="${a.id}">Cancelar</button></div></div>`).join("")
    :`<p class="empty-note">Nenhum horário futuro para esse número.</p>`;
}
document.addEventListener("click",async e=>{
  const ask=e.target.closest("[data-askcancel]");
  if(ask){const w=document.querySelector(`[data-cwrap="${ask.dataset.askcancel}"]`);w.innerHTML=`<span class="hint">Cancelar mesmo?</span><button class="btn sm danger" data-docancel="${ask.dataset.askcancel}">Sim, cancelar</button><button class="btn sm" data-nocancel>Não</button>`;return}
  if(e.target.closest("[data-nocancel]")){renderMine();return}
  const dc=e.target.closest("[data-docancel]");
  if(dc){dc.disabled=true;const {data,error}=await sb.rpc("cancel_appointment",{p_id:dc.dataset.docancel,p_phone:lookPhone});
    toast(error||!data?"Não foi possível cancelar.":"Horário cancelado.");await fetchMine();loadBusy()}
});

/* ============ PAINEL ============ */
let view="public",tab="agenda";
const A={date:today(),month:today().slice(0,7),q:"",subQ:""};
function go(v){
  view=v;$("#publicView").hidden=v!=="public";$("#adminView").hidden=v!=="admin";$("#loginView").hidden=v!=="login";
  $("#waFab").hidden=v!=="public";window.scrollTo(0,0);
  if(v==="admin"&&location.hash!=="#barbeiro")history.replaceState(null,"","#barbeiro");
  if(v==="public"&&location.hash==="#barbeiro")history.replaceState(null,"",location.pathname);
  render();
}
async function tryAdmin(){
  if(S.admin){go("admin");return}
  if(await checkSession()){go("admin");return}
  go("login");setTimeout(()=>$("#email").focus(),50);
}
$("#goAdmin").onclick=tryAdmin;
$("#loginBack").onclick=()=>go("public");
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const err=$("#pinErr");err.hidden=true;
  if(!sb){err.textContent="Preencha o config.js com os dados do Supabase.";err.hidden=false;return}
  $("#loginBtn").disabled=true;
  const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#pass").value});
  if(error){$("#loginBtn").disabled=false;err.textContent="E-mail ou senha incorretos.";err.hidden=false;return}
  const ok=await checkSession();$("#loginBtn").disabled=false;
  if(!ok){await sb.auth.signOut();err.textContent="Este usuário não tem acesso ao painel.";err.hidden=false;return}
  $("#pass").value="";go("admin");
});
$("#admSite").onclick=()=>go("public");$("#admBrand").onclick=()=>{tab="agenda";render()};
$("#admOut").onclick=async()=>{await sb.auth.signOut();S.admin=false;S.data={appointments:{},expenses:{},subscribers:{}};if(S.channel){sb.removeChannel(S.channel);S.channel=null}go("public");loadBusy()};
$("#tabBar").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(b){tab=b.dataset.tab;draft=null;render()}});

function render(){
  if(view==="public")renderPublic();
  if(view==="admin"){
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===tab));
    const ae=document.activeElement,keep=ae&&ae.id,pos=keep&&ae.selectionStart;
    ({agenda:rAgenda,clientes:rClientes,assinantes:rAssin,financeiro:rFin,ajustes:rAjustes})[tab]();
    if(keep&&$("#admBody").contains(document.getElementById(keep))){const el=document.getElementById(keep);el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}
  }
}
const STATUS={agendado:["ag","Agendado"],concluido:["ok","Concluído"],cancelado:["bad","Cancelado"],faltou:["warn","Faltou"],bloqueio:["mute","Bloqueado"]};
const stPill=s=>{const[c,l]=STATUS[s]||["mute",s];return`<span class="pill ${c}">${l}</span>`};

/* ---- Agenda ---- */
function rAgenda(){
  const d=A.date,list=appts().filter(a=>a.date===d).sort((a,b)=>a.time.localeCompare(b.time));
  const live=list.filter(a=>a.status!=="cancelado"&&a.status!=="bloqueio");
  const prev=live.filter(a=>a.status!=="faltou").reduce((s,a)=>s+Number(a.charged||0),0);
  const done=list.filter(a=>a.status==="concluido").reduce((s,a)=>s+Number(a.charged||0),0);
  const h=hoursFor(d),blockedDay=(cfg().blocked||[]).includes(d);
  const dd=parseD(d),mon=addDays(d,-((dd.getDay()+6)%7));
  const week=[...Array(7)].map((_,i)=>addDays(mon,i));
  $("#admBody").innerHTML=`
  <div class="toolbar">
    <button class="btn sm" data-ad="-1" aria-label="Dia anterior">‹</button>
    <input type="date" class="input" id="agDate" value="${d}" style="width:auto">
    <button class="btn sm" data-ad="1" aria-label="Próximo dia">›</button>
    <button class="btn sm ghost" data-adtoday>Hoje</button>
    <span class="grow"></span>
    <button class="btn sm" id="agBlockSlot">Bloquear horário</button>
    <button class="btn sm" id="agBlockDay">${blockedDay?"Liberar dia":"Fechar este dia"}</button>
    <button class="btn sm gold" id="agNew">+ Novo agendamento</button>
  </div>
  <div class="week">${week.map(w=>{const n=appts().filter(a=>a.date===w&&a.status==="agendado").length,wd=parseD(w);
    return`<button class="wk ${w===d?"on":""} ${hoursFor(w)?"":"closed"}" data-wk="${w}"><small>${DOW[wd.getDay()]}</small><b class="num">${wd.getDate()}</b><i>${n?n+" agend.":"&nbsp;"}</i></button>`}).join("")}</div>
  <div class="kpis">
    <div class="kpi"><span class="label">Agendamentos</span><b>${live.length}</b><span class="sub">${list.filter(a=>a.status==="agendado").length} a atender</span></div>
    <div class="kpi gold"><span class="label">Previsto no dia</span><b>${brl(prev)}</b><span class="sub">sem contar faltas</span></div>
    <div class="kpi pos"><span class="label">Já recebido</span><b>${brl(done)}</b><span class="sub">${list.filter(a=>a.status==="concluido").length} concluídos</span></div>
    <div class="kpi"><span class="label">Expediente</span><b style="font-size:1.5rem">${h?`${h[0]}–${h[1]}`:"Fechado"}</b><span class="sub">${esc(dLabel(d))}</span></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>${esc(dLabel(d))}</h3></div>
  <div class="agenda">${list.length?list.map(apRow).join(""):`<div class="empty"><b>Agenda livre</b><span>Nenhum horário marcado neste dia. Os agendamentos do site aparecem aqui na hora.</span><button class="btn sm gold" data-newhere>+ Agendar cliente</button></div>`}</div></div>`;
  $("#agDate").onchange=e=>{if(e.target.value){A.date=e.target.value;render()}};
  $("#agNew").onclick=()=>apModal();
  const nh=document.querySelector("[data-newhere]");if(nh)nh.onclick=()=>apModal();
  $("#agBlockDay").onclick=async()=>{const b=new Set(cfg().blocked||[]);b.has(d)?b.delete(d):b.add(d);await saveCfg({blocked:[...b].sort()});toast(b.has(d)?"Dia fechado para agendamentos.":"Dia liberado.")};
  $("#agBlockSlot").onclick=()=>blockModal();
}
function apRow(a){
  const end=toHM(toMin(a.time)+(a.dur||30));
  if(a.status==="bloqueio")return`<div class="ap st-bloqueio"><div class="ap-time">${a.time}<small>até ${end}</small></div><div class="ap-main"><div class="ap-name">Horário bloqueado ${stPill("bloqueio")}</div><div class="ap-sub">${esc(a.note||"")}</div></div><div class="ap-act"><button class="btn sm" data-apdel="${a.id}">Liberar</button></div></div>`;
  const acts=a.status==="agendado"?`<button class="btn sm gold" data-st="${a.id}:concluido">Concluir</button><button class="btn sm" data-st="${a.id}:faltou">Faltou</button><button class="btn sm" data-apedit="${a.id}">Editar</button><button class="btn sm" data-remind="${a.id}">Lembrar</button><button class="btn sm danger" data-st="${a.id}:cancelado">Cancelar</button>`
    :`<button class="btn sm" data-st="${a.id}:agendado">Reabrir</button><button class="btn sm" data-apedit="${a.id}">Editar</button>`;
  return`<div class="ap st-${a.status}"><div class="ap-time">${a.time}<small>até ${end}</small></div>
    <div class="ap-main"><div class="ap-name">${esc(a.name)} ${stPill(a.status)} ${a.assinante?'<span class="pill gold">Assinante</span>':""}</div>
    <div class="ap-sub num">${esc(a.services.map(s=>s.name).join(" + "))} · ${a.assinante&&!Number(a.charged)?"plano":brl(a.charged)}</div>
    <div class="ap-sub num">${fmtPhone(a.phone)}${a.origem==="painel"?" · lançado no painel":""}${a.canceled_by==="cliente"?" · cancelado pelo cliente":""}</div></div>
    <div class="ap-act">${acts}</div></div>`;
}
document.addEventListener("click",async e=>{
  if(view!=="admin")return;
  const ad=e.target.closest("[data-ad]");if(ad){A.date=addDays(A.date,Number(ad.dataset.ad));render();return}
  if(e.target.closest("[data-adtoday]")){A.date=today();render();return}
  const wk=e.target.closest("[data-wk]");if(wk){A.date=wk.dataset.wk;render();return}
  const st=e.target.closest("[data-st]");if(st){const[id,s]=st.dataset.st.split(":");const a=S.data.appointments[id];if(a){await put("appointments",{...a,status:s});toast(STATUS[s][1]+".")}return}
  const ed=e.target.closest("[data-apedit]");if(ed){apModal(S.data.appointments[ed.dataset.apedit]);return}
  const dl=e.target.closest("[data-apdel]");if(dl){await del("appointments",dl.dataset.apdel);toast("Horário liberado.");return}
  const rm=e.target.closest("[data-remind]");if(rm){const a=S.data.appointments[rm.dataset.remind];
    openWa(a.phone,`Olá, ${a.name.split(" ")[0]}! Lembrando do seu horário na 23 de Maio Barbearia: ${dLabel(a.date)} às ${a.time} (${a.services.map(s=>s.name).join(" + ")}). Até lá!`);return}
});

/* ---- modal ---- */
function modal(title,body,foot,onMount){
  const r=$("#modalRoot");
  r.innerHTML=`<div class="modal-bg" id="mbg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" id="mclose" aria-label="Fechar" style="height:36px">✕</button></div><div class="modal-b">${body}</div><div class="modal-f">${foot}</div></div></div>`;
  const close=()=>{r.innerHTML="";document.removeEventListener("keydown",k)};
  function k(ev){if(ev.key==="Escape")close()}
  $("#mclose").onclick=close;$("#mbg").onclick=e=>{if(e.target.id==="mbg")close()};document.addEventListener("keydown",k);
  onMount&&onMount(close);const f=r.querySelector("input,select");f&&f.focus();
}
function apModal(a,prefill){
  const c=cfg(),isNew=!a;
  a=a||{id:uid(),name:prefill?.name||"",phone:prefill?.phone||"",services:[],date:A.date,time:"",status:"agendado",origem:"painel"};
  const selNames=new Set(a.services.map(s=>s.name));
  modal(isNew?"Novo agendamento":"Editar agendamento",`
    <div class="form2"><label class="field"><span>Nome completo</span><input class="input" id="mName" value="${esc(a.name)}"></label>
    <label class="field"><span>Celular</span><input class="input num" id="mPhone" value="${esc(fmtPhone(a.phone))}" inputmode="tel"></label></div>
    <div class="field"><span>Serviços</span><div class="svc-picks">${c.services.map(s=>`<label><input type="checkbox" value="${esc(s.id)}" ${selNames.has(s.name)?"checked":""}>${esc(s.name)}</label>`).join("")}</div></div>
    <div class="form2"><label class="field"><span>Dia</span><input type="date" class="input" id="mDate" value="${a.date}"></label>
    <label class="field"><span>Horário</span><select class="input num" id="mTime"></select></label></div>
    <div class="form2"><label class="field"><span>Valor cobrado</span><input class="input num" id="mCharged" inputmode="decimal" value="${a.charged!=null?String(a.charged).replace(".",","):""}"><small class="hint" id="mHint"></small></label>
    <label class="field"><span>Status</span><select class="input" id="mStatus">${["agendado","concluido","faltou","cancelado"].map(s=>`<option value="${s}" ${a.status===s?"selected":""}>${STATUS[s][1]}</option>`).join("")}</select></label></div>
    <small class="err-msg" id="mErr" hidden></small>`,
    `<button class="btn ghost" id="mCancel">Fechar</button><button class="btn gold" id="mSave">Salvar</button>`,
    close=>{
      $("#mCancel").onclick=close;
      $("#mPhone").oninput=e=>{e.target.value=fmtPhone(e.target.value);upd()};
      let chargedTouched=!isNew;
      $("#mCharged").oninput=()=>{chargedTouched=true};
      const pick=()=>[...document.querySelectorAll(".svc-picks input:checked")].map(i=>c.services.find(s=>s.id===i.value)).filter(Boolean);
      function upd(){
        const sel=pick(),dur=sel.reduce((x,s)=>x+Number(s.dur),0)||30,tot=sel.reduce((x,s)=>x+Number(s.price),0);
        const date=$("#mDate").value,cur=$("#mTime").value||a.time;
        const sl=date?slotsFor(date,dur,a.id):[],h=date&&hoursFor(date);
        let opts=sl.map(x=>`<option value="${x.t}" ${x.t===cur?"selected":""}>${x.t}${x.ok?"":" (ocupado)"}</option>`).join("");
        if(cur&&!sl.find(x=>x.t===cur))opts=`<option value="${cur}" selected>${cur}</option>`+opts;
        $("#mTime").innerHTML=opts||`<option value="">${h?"Sem horários":"Dia fechado"}</option>`;
        const sub=activeSub($("#mPhone").value);
        if(!chargedTouched)$("#mCharged").value=(sub?0:tot).toFixed(2).replace(".",",");
        $("#mHint").textContent=sub?`Assinante (${sub.plan||"plano"}) · tabela ${brl(tot)}`:`Tabela: ${brl(tot)}`;
      }
      document.querySelectorAll(".svc-picks input").forEach(i=>i.onchange=()=>{if(isNew)chargedTouched=false;upd()});
      $("#mDate").onchange=upd;upd();
      $("#mSave").onclick=async()=>{
        const sel=pick(),name=$("#mName").value.trim(),phone=digits($("#mPhone").value),time=$("#mTime").value,date=$("#mDate").value;
        const err=!name?"Informe o nome.":phone.length<10?"Informe o celular com DDD.":!sel.length?"Escolha pelo menos um serviço.":!date||!time?"Escolha dia e horário.":"";
        if(err){$("#mErr").textContent=err;$("#mErr").hidden=false;return}
        const sub=activeSub(phone),tot=sel.reduce((x,s)=>x+Number(s.price),0);
        try{await put("appointments",{...a,name,phone,services:sel.map(s=>({name:s.name,price:Number(s.price),dur:Number(s.dur)})),total:tot,
          dur:sel.reduce((x,s)=>x+Number(s.dur),0),date,time,status:$("#mStatus").value,assinante:!!sub,charged:money($("#mCharged").value)})}catch(_){return}
        close();toast(isNew?"Agendamento criado.":"Agendamento atualizado.");A.date=date;render();
      };
    });
}
function blockModal(){
  modal("Bloquear horário",`<div class="form2"><label class="field"><span>Dia</span><input type="date" class="input" id="kDate" value="${A.date}"></label>
    <label class="field"><span>Início</span><select class="input num" id="kTime"></select></label></div>
    <div class="form2"><label class="field"><span>Duração</span><select class="input" id="kDur">${[30,60,90,120,180,240].map(m=>`<option value="${m}">${durTxt(m)}</option>`).join("")}</select></label>
    <label class="field"><span>Motivo (opcional)</span><input class="input" id="kNote" placeholder="Almoço, compromisso…"></label></div>`,
    `<button class="btn ghost" id="kC">Fechar</button><button class="btn gold" id="kS">Bloquear</button>`,
    close=>{
      const upd=()=>{const h=hoursFor($("#kDate").value);const o=[];if(h)for(let m=toMin(h[0]);m<toMin(h[1]);m+=Number(cfg().step)||30)o.push(toHM(m));
        $("#kTime").innerHTML=o.map(t=>`<option>${t}</option>`).join("")||`<option value="">Dia fechado</option>`};
      $("#kDate").onchange=upd;upd();$("#kC").onclick=close;
      $("#kS").onclick=async()=>{if(!$("#kTime").value)return;
        try{await put("appointments",{id:uid(),name:"Bloqueio",phone:"",services:[],total:0,charged:0,dur:Number($("#kDur").value),date:$("#kDate").value,time:$("#kTime").value,status:"bloqueio",note:$("#kNote").value.trim(),origem:"painel"})}catch(_){return}
        close();toast("Horário bloqueado.")};
    });
}

/* ---- Clientes ---- */
function clientsAgg(){
  const m={};
  appts().filter(a=>a.status!=="bloqueio"&&a.phone).forEach(a=>{
    const k=digits(a.phone);const c=m[k]||(m[k]={phone:k,name:a.name,visits:0,missed:0,spent:0,last:"",next:"",first:"9999",list:[],lastAt:""});
    if((a.created_at||"")>=c.lastAt){c.name=a.name;c.lastAt=a.created_at||""}
    c.list.push(a);
    if(a.status==="concluido"){c.visits++;c.spent+=Number(a.charged||0);if(a.date>c.last)c.last=a.date;if(a.date<c.first)c.first=a.date}
    if(a.status==="faltou")c.missed++;
    if(a.status==="agendado"&&a.date>=today()&&(!c.next||a.date<c.next))c.next=a.date;
  });
  return Object.values(m);
}
function rClientes(){
  const all=clientsAgg(),q=A.q.toLowerCase(),qd=digits(A.q);
  const list=all.filter(c=>!q||c.name.toLowerCase().includes(q)||(qd&&c.phone.includes(qd))).sort((a,b)=>(b.last||b.next).localeCompare(a.last||a.next));
  const month=today().slice(0,7);
  const monthClients=new Set(appts().filter(a=>a.status==="concluido"&&a.date.startsWith(month)).map(a=>digits(a.phone))).size;
  const newMonth=all.filter(c=>c.first.startsWith(month)).length;
  $("#admBody").innerHTML=`
  <div class="kpis">
    <div class="kpi"><span class="label">Clientes cadastrados</span><b>${all.length}</b><span class="sub">todos que já agendaram</span></div>
    <div class="kpi gold"><span class="label">Atendidos no mês</span><b>${monthClients}</b><span class="sub">${MONF[new Date().getMonth()]}</span></div>
    <div class="kpi"><span class="label">Novos no mês</span><b>${newMonth}</b><span class="sub">primeira visita</span></div>
    <div class="kpi"><span class="label">Faltas registradas</span><b>${all.reduce((s,c)=>s+c.missed,0)}</b><span class="sub">histórico total</span></div>
  </div>
  <div class="toolbar"><input class="input" id="cliQ" placeholder="Buscar por nome ou celular" value="${esc(A.q)}" style="max-width:360px"></div>
  <div class="panel">${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Celular</th><th class="r">Atendimentos</th><th class="r">Total gasto</th><th>Última visita</th><th>Próximo</th></tr></thead><tbody>
  ${list.map(c=>`<tr class="click" data-cli="${c.phone}"><td><b>${esc(c.name)}</b> ${activeSub(c.phone)?'<span class="pill gold">Assinante</span>':""}${c.missed?` <span class="pill warn">${c.missed} falta${c.missed>1?"s":""}</span>`:""}</td>
  <td class="num">${fmtPhone(c.phone)}</td><td class="r num">${c.visits}</td><td class="r num">${brl(c.spent)}</td><td class="num">${c.last?dShort(c.last):'<span class="muted">—</span>'}</td><td class="num">${c.next?dShort(c.next):'<span class="muted">—</span>'}</td></tr>`).join("")}
  </tbody></table></div>`:`<div class="empty"><b>${all.length?"Nada encontrado":"Nenhum cliente ainda"}</b><span>${all.length?"Tente outro nome ou número.":"Cada agendamento feito no site registra o cliente aqui, com nome, celular e histórico."}</span></div>`}</div>`;
  $("#cliQ").oninput=e=>{A.q=e.target.value;render()};
}
document.addEventListener("click",e=>{
  if(view!=="admin")return;const r=e.target.closest("[data-cli]");if(!r)return;
  const c=clientsAgg().find(x=>x.phone===r.dataset.cli);if(!c)return;
  const l=c.list.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  modal(c.name,`<div class="kpis"><div class="kpi"><span class="label">Atendimentos</span><b>${c.visits}</b></div><div class="kpi gold"><span class="label">Total gasto</span><b>${brl(c.spent)}</b></div></div>
    <div class="ap-sub num">${fmtPhone(c.phone)}</div>
    <div class="hist">${l.map(a=>`<div><span class="num">${dShort(a.date)} ${a.time}<br><small style="color:var(--muted)">${esc(a.services.map(s=>s.name).join(" + "))}</small></span><span style="text-align:right">${stPill(a.status)}<br><small class="num">${brl(a.charged)}</small></span></div>`).join("")}</div>`,
    `<button class="btn wa" id="cWa">WhatsApp</button><button class="btn gold" id="cNew">Agendar</button>`,
    close=>{$("#cWa").onclick=()=>openWa(c.phone,`Olá, ${c.name.split(" ")[0]}!`);$("#cNew").onclick=()=>{close();apModal(null,{name:c.name,phone:c.phone})}});
});

/* ---- Assinantes ---- */
function cycleCuts(s){
  const start=addMonths(s.due,-1),p=digits(s.phone);
  const l=appts().filter(a=>digits(a.phone)===p&&a.status==="concluido"&&a.date>start&&a.date<=s.due);
  return{cuts:l.filter(a=>a.services.some(x=>/corte|cabelo/i.test(x.name))).length,visits:l.length,start};
}
function subStatus(s){
  if(s.active===false)return["mute","Pausado"];
  const days=Math.round((parseD(s.due)-parseD(today()))/864e5);
  if(days<0)return["bad",`Vencido há ${-days} d`];
  if(days===0)return["warn","Vence hoje"];
  if(days<=5)return["warn",`Vence em ${days} d`];
  return["ok","Em dia"];
}
function rAssin(){
  const all=subs(),act=all.filter(s=>s.active!==false),q=A.subQ.toLowerCase(),qd=digits(A.subQ);
  const list=all.filter(s=>!q||s.name.toLowerCase().includes(q)||(qd&&digits(s.phone).includes(qd))).sort((a,b)=>a.due.localeCompare(b.due));
  const late=act.filter(s=>s.due<today()).length,soon=act.filter(s=>s.due>=today()&&s.due<=addDays(today(),5)).length;
  const mrr=act.reduce((x,s)=>x+Number(s.price||0),0);
  const byPlan={};act.forEach(s=>byPlan[s.plan||"Sem plano"]=(byPlan[s.plan||"Sem plano"]||0)+1);
  $("#admBody").innerHTML=`
  <div class="kpis">
    <div class="kpi gold"><span class="label">Assinantes ativos</span><b>${act.length}</b><span class="sub">${Object.entries(byPlan).map(([p,n])=>`${n} ${esc(p.replace(/^Plano /,""))}`).join(" · ")||`${all.length-act.length} pausados`}</span></div>
    <div class="kpi pos"><span class="label">Receita recorrente</span><b>${brl(mrr)}</b><span class="sub">por mês</span></div>
    <div class="kpi"><span class="label">Vencem em 5 dias</span><b style="color:var(--warn)">${soon}</b><span class="sub">cobrar em breve</span></div>
    <div class="kpi neg"><span class="label">Vencidos</span><b>${late}</b><span class="sub">pagamento pendente</span></div>
  </div>
  <div class="toolbar"><input class="input" id="subQ" placeholder="Buscar assinante" value="${esc(A.subQ)}" style="max-width:320px"><span class="grow"></span><button class="btn gold" id="subNew">+ Novo assinante</button></div>
  <div class="panel">${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Assinante</th><th>Plano</th><th class="r">Cortes no ciclo</th><th>Vencimento</th><th>Situação</th><th class="r">Ações</th></tr></thead><tbody>
  ${list.map(s=>{const cc=cycleCuts(s),[k,l]=subStatus(s);return`<tr><td><b>${esc(s.name)}</b><br><span class="muted num">${fmtPhone(s.phone)}</span></td>
    <td>${esc(s.plan||"—")}<br><span class="muted num">${brl(s.price)}/mês</span></td>
    <td class="r num"><b style="font-size:1.2rem">${cc.cuts}</b><br><span class="muted">${cc.visits} visita${cc.visits===1?"":"s"} desde ${dShort(addDays(cc.start,1)).slice(0,5)}</span></td>
    <td class="num">${dShort(s.due)}</td><td><span class="pill ${k}">${l}</span></td>
    <td class="r"><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap" data-swrap="${s.id}"><button class="btn sm gold" data-pay="${s.id}">Recebi</button><button class="btn sm" data-subedit="${s.id}">Editar</button>${s.due<=addDays(today(),5)?`<button class="btn sm" data-subwa="${s.id}">Cobrar</button>`:""}</div></td></tr>`}).join("")}
  </tbody></table></div>`:`<div class="empty"><b>${all.length?"Nada encontrado":"Nenhum assinante ainda"}</b><span>${all.length?"Tente outro nome.":"Cadastre os clientes do plano mensal para acompanhar vencimentos e quantos cortes cada um fez no mês."}</span>${all.length?"":`<button class="btn sm gold" data-subnew2>+ Cadastrar primeiro assinante</button>`}</div>`}</div>
  <p class="hint">“Cortes no ciclo” conta os atendimentos concluídos com corte entre o último vencimento e o próximo. “Recebi” lança o pagamento no financeiro e avança o vencimento em 1 mês.</p>`;
  $("#subQ").oninput=e=>{A.subQ=e.target.value;render()};
  $("#subNew").onclick=()=>subModal();const n2=document.querySelector("[data-subnew2]");if(n2)n2.onclick=()=>subModal();
}
document.addEventListener("click",async e=>{
  if(view!=="admin")return;
  const p=e.target.closest("[data-pay]");
  if(p){const s=S.data.subscribers[p.dataset.pay];const w=document.querySelector(`[data-swrap="${s.id}"]`);
    w.innerHTML=`<span class="hint">Receber ${brl(s.price)}?</span><button class="btn sm gold" data-payok="${s.id}">Confirmar</button><button class="btn sm" data-payno>Não</button>`;return}
  if(e.target.closest("[data-payno]")){render();return}
  const po=e.target.closest("[data-payok]");
  if(po){const s=S.data.subscribers[po.dataset.payok];const pays=[...(s.payments||[]),{date:today(),amount:Number(s.price||0),ref:s.due}].slice(-36);
    const base=s.due<today()?today():s.due;
    try{await put("subscribers",{...s,payments:pays,due:addMonths(base,1),active:true})}catch(_){return}
    toast(`Pagamento lançado. Próximo vencimento ${dShort(addMonths(base,1))}.`);return}
  const ed=e.target.closest("[data-subedit]");if(ed){subModal(S.data.subscribers[ed.dataset.subedit]);return}
  const sw=e.target.closest("[data-subwa]");if(sw){const s=S.data.subscribers[sw.dataset.subwa];
    openWa(s.phone,`Olá, ${s.name.split(" ")[0]}! Seu ${s.plan||"plano mensal"} da 23 de Maio Barbearia vence em ${dShort(s.due)} (${brl(s.price)}). Qualquer dúvida é só chamar!`)}
});
function subModal(s){
  const c=cfg(),isNew=!s;
  s=s||{id:uid(),name:"",phone:"",plan:c.plans[0]?.name||"",price:c.plans[0]?.price??"",start:today(),due:addMonths(today(),1),active:true,payments:[]};
  modal(isNew?"Novo assinante":"Editar assinante",`
    <div class="form2"><label class="field"><span>Nome completo</span><input class="input" id="sName" value="${esc(s.name)}"></label>
    <label class="field"><span>Celular</span><input class="input num" id="sPhone" value="${esc(fmtPhone(s.phone))}" inputmode="tel"></label></div>
    <div class="form2"><label class="field"><span>Plano</span><select class="input" id="sPlanSel">${c.plans.map(p=>`<option value="${esc(p.name)}" ${p.name===s.plan?"selected":""}>${esc(p.name)} · ${brl(p.price)}</option>`).join("")}<option value="__outro" ${s.plan&&!c.plans.some(p=>p.name===s.plan)?"selected":""}>Outro…</option></select>
      <input class="input" id="sPlan" value="${esc(s.plan||"")}" placeholder="Nome do plano" ${s.plan&&!c.plans.some(p=>p.name===s.plan)||!c.plans.length?"":"hidden"}></label>
    <label class="field"><span>Valor mensal</span><input class="input num" id="sPrice" inputmode="decimal" value="${s.price!==""?String(s.price).replace(".",","):""}"></label></div>
    <div class="form2"><label class="field"><span>Início</span><input type="date" class="input" id="sStart" value="${s.start||""}"></label>
    <label class="field"><span>Próximo vencimento</span><input type="date" class="input" id="sDue" value="${s.due}"></label></div>
    ${isNew?`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sPaid" checked style="accent-color:var(--gold)"> Primeiro mês já foi pago (lança no financeiro)</label>`:`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sAct" ${s.active!==false?"checked":""} style="accent-color:var(--gold)"> Assinatura ativa</label>`}
    ${!isNew&&(s.payments||[]).length?`<div class="field"><span>Pagamentos</span><div class="hist">${[...s.payments].reverse().map(p=>`<div><span class="num">${dShort(p.date)}</span><span class="num">${brl(p.amount)}</span></div>`).join("")}</div></div>`:""}
    <small class="err-msg" id="sErr" hidden></small>
    ${isNew?"":`<div data-sdelwrap><button class="btn sm danger" data-sdel>Excluir assinante</button></div>`}`,
    `<button class="btn ghost" id="sC">Fechar</button><button class="btn gold" id="sS">Salvar</button>`,
    close=>{
      $("#sC").onclick=close;$("#sPhone").oninput=e=>e.target.value=fmtPhone(e.target.value);
      $("#sPlanSel").onchange=e=>{const v=e.target.value;$("#sPlan").hidden=v!=="__outro";
        if(v==="__outro"){$("#sPlan").value="";$("#sPlan").focus()}else{const p=c.plans.find(x=>x.name===v);$("#sPlan").value=v;if(p)$("#sPrice").value=String(p.price).replace(".",",")}};
      $("#sStart").onchange=e=>{if(isNew&&e.target.value)$("#sDue").value=addMonths(e.target.value,1)};
      const dw=document.querySelector("[data-sdelwrap]");
      if(dw)dw.onclick=async ev=>{if(ev.target.closest("[data-sdel]")){dw.innerHTML=`<span class="hint">Excluir ${esc(s.name)} e o histórico de pagamentos?</span> <button class="btn sm danger" data-sdelok>Excluir</button>`;return}
        if(ev.target.closest("[data-sdelok]")){await del("subscribers",s.id);close();toast("Assinante excluído.")}};
      $("#sS").onclick=async()=>{
        const name=$("#sName").value.trim(),phone=digits($("#sPhone").value),price=money($("#sPrice").value);
        const plan=$("#sPlanSel").value==="__outro"||!c.plans.length?$("#sPlan").value.trim():$("#sPlanSel").value;
        const err=!name?"Informe o nome.":phone.length<10?"Informe o celular com DDD.":!$("#sDue").value?"Informe o vencimento.":"";
        if(err){$("#sErr").textContent=err;$("#sErr").hidden=false;return}
        let o={...s,name,phone,plan,price,start:$("#sStart").value||null,due:$("#sDue").value};
        if(isNew){if($("#sPaid").checked)o.payments=[{date:o.start||today(),amount:price,ref:o.start}]}else o.active=$("#sAct").checked;
        try{await put("subscribers",o)}catch(_){return}
        close();toast(isNew?"Assinante cadastrado.":"Assinante atualizado.");
      };
    });
}

/* ---- Financeiro ---- */
function rFin(){
  const m=A.month,[y,mo]=m.split("-").map(Number),nDays=new Date(y,mo,0).getDate();
  const done=appts().filter(a=>a.status==="concluido"&&a.date.startsWith(m));
  const svcRev=done.reduce((s,a)=>s+Number(a.charged||0),0);
  const payList=[];subs().forEach(s=>(s.payments||[]).forEach(p=>{if(p.date.startsWith(m))payList.push({...p,name:s.name,plan:s.plan})}));
  const planRev=payList.reduce((s,p)=>s+Number(p.amount||0),0);
  const ex=exps().filter(e=>e.date.startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date));
  const exTot=ex.reduce((s,e)=>s+Number(e.amount||0),0);
  const rev=svcRev+planRev,profit=rev-exTot;
  const paid=done.filter(a=>Number(a.charged)>0);
  const ticket=paid.length?paid.reduce((s,a)=>s+Number(a.charged),0)/paid.length:0;
  const missed=appts().filter(a=>a.status==="faltou"&&a.date.startsWith(m)).length;
  const daily=[...Array(nDays)].map((_,i)=>{const d=`${m}-${pad(i+1)}`;return done.filter(a=>a.date===d).reduce((s,a)=>s+Number(a.charged||0),0)+payList.filter(p=>p.date===d).reduce((s,p)=>s+Number(p.amount),0)});
  const bySvc={};done.forEach(a=>{const t=a.services.reduce((s,x)=>s+Number(x.price),0)||1;a.services.forEach(x=>{bySvc[x.name]=bySvc[x.name]||{n:0,v:0};bySvc[x.name].n++;bySvc[x.name].v+=Number(a.charged||0)*Number(x.price)/t})});
  const svcArr=Object.entries(bySvc).sort((a,b)=>b[1].n-a[1].n),svcMax=Math.max(1,...svcArr.map(x=>x[1].n));
  const byCat={};ex.forEach(e=>byCat[e.cat]=(byCat[e.cat]||0)+Number(e.amount));
  const catArr=Object.entries(byCat).sort((a,b)=>b[1]-a[1]),catMax=Math.max(1,...catArr.map(x=>x[1]));
  const prevM=(()=>{const d=new Date(y,mo-2,1);return`${d.getFullYear()}-${pad(d.getMonth()+1)}`})();
  const fixedPrev=exps().filter(e=>e.date.startsWith(prevM)&&e.fixed);
  $("#admBody").innerHTML=`
  <div class="toolbar"><button class="btn sm" data-fm="-1" aria-label="Mês anterior">‹</button><input type="month" class="input" id="finM" value="${m}" style="width:auto"><button class="btn sm" data-fm="1" aria-label="Próximo mês">›</button>
    <span class="grow"></span>${fixedPrev.length&&!ex.some(e=>e.fixed)?`<button class="btn sm" id="copyFixed">Repetir ${fixedPrev.length} despesa${fixedPrev.length>1?"s":""} fixa${fixedPrev.length>1?"s":""} do mês anterior</button>`:""}<button class="btn sm gold" id="exNew">+ Nova despesa</button></div>
  <div class="kpis">
    <div class="kpi gold"><span class="label">Faturamento</span><b>${brl(rev)}</b><span class="sub">${brl(svcRev)} serviços · ${brl(planRev)} planos</span></div>
    <div class="kpi neg"><span class="label">Despesas</span><b>${brl(exTot)}</b><span class="sub">${ex.length} lançamento${ex.length===1?"":"s"}</span></div>
    <div class="kpi ${profit>=0?"pos":"neg"}"><span class="label">Lucro</span><b>${brl(profit)}</b><span class="sub">${rev?Math.round(profit/rev*100)+"% do faturamento":"—"}</span></div>
    <div class="kpi"><span class="label">Clientes atendidos</span><b>${done.length}</b><span class="sub">ticket médio ${brl(ticket)} · ${missed} falta${missed===1?"":"s"}</span></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>Entradas por dia · ${MONF[mo-1]} ${y}</h3><span class="label">Serviços concluídos + planos recebidos</span></div><div class="panel-b">${chart(daily,m)}</div></div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>Despesas</h3></div>
      ${ex.length?`<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th><th></th></tr></thead><tbody>
      ${ex.map(e=>`<tr><td class="num">${dShort(e.date).slice(0,5)}</td><td>${esc(e.description)}${e.fixed?' <span class="pill mute">Fixa</span>':""}</td><td><span class="muted">${esc(e.cat)}</span></td><td class="r num">${brl(e.amount)}</td>
        <td class="r"><button class="btn sm" data-exedit="${e.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><b>Sem despesas no mês</b><span>Lance aluguel, produtos, energia e o que mais sair do caixa para ver o lucro real.</span></div>`}
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
      <div class="panel"><div class="panel-h"><h3>Serviços mais feitos</h3></div><div class="panel-b bars">${svcArr.length?svcArr.map(([n,v])=>`<div class="bar-row"><span>${esc(n)}</span><span class="num muted">${v.n}× · ${brl(v.v)}</span><div class="track"><div class="fill" style="width:${v.n/svcMax*100}%"></div></div></div>`).join(""):`<span class="empty-note">Aparece quando houver atendimentos concluídos.</span>`}</div></div>
      <div class="panel"><div class="panel-h"><h3>Para onde foi o dinheiro</h3></div><div class="panel-b bars">${catArr.length?catArr.map(([n,v])=>`<div class="bar-row"><span>${esc(n)}</span><span class="num muted">${brl(v)}</span><div class="track"><div class="fill" style="width:${v/catMax*100}%;background:var(--bad)"></div></div></div>`).join(""):`<span class="empty-note">Sem despesas lançadas.</span>`}</div></div>
      ${payList.length?`<div class="panel"><div class="panel-h"><h3>Planos recebidos</h3></div><div class="tbl-wrap"><table><tbody>${payList.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<tr><td class="num">${dShort(p.date).slice(0,5)}</td><td>${esc(p.name)}<br><span class="muted">${esc(p.plan||"")}</span></td><td class="r num">${brl(p.amount)}</td></tr>`).join("")}</tbody></table></div></div>`:""}
    </div>
  </div>`;
  $("#finM").onchange=e=>{if(e.target.value){A.month=e.target.value;render()}};
  $("#exNew").onclick=()=>exModal();
  const cf=$("#copyFixed");if(cf)cf.onclick=async()=>{cf.disabled=true;for(const e of fixedPrev){const day=Math.min(Number(e.date.slice(8)),nDays);
    const {created_at,...rest}=e;try{await put("expenses",{...rest,id:uid(),date:`${m}-${pad(day)}`})}catch(_){return}}toast("Despesas fixas copiadas.")};
}
function chart(vals,m){
  const W=760,H=220,pl=56,pr=10,pt=14,pb=28,iw=W-pl-pr,ih=H-pt-pb,n=vals.length,max=Math.max(...vals,0);
  const nice=v=>{if(v<=0)return 100;const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p};
  const top=nice(max),bw=iw/n,td=today();
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas por dia">`;
  [0,.25,.5,.75,1].map(f=>top*f).forEach(t=>{const y=pt+ih-ih*t/top;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${pl-8}" y="${y+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="Barlow,sans-serif">${t>=1000?(t/1000).toLocaleString("pt-BR")+"k":Math.round(t)}</text>`});
  vals.forEach((v,i)=>{const h=ih*v/top,x=pl+i*bw+bw*.18,w=bw*.64,d=`${m}-${pad(i+1)}`;
    if(v)s+=`<rect x="${x}" y="${pt+ih-h}" width="${w}" height="${h}" rx="2" fill="${d===td?"var(--gold2)":"var(--gold)"}"><title>${dShort(d)}: ${brl(v)}</title></rect>`;
    if(i===0||(i+1)%5===0||i===n-1)s+=`<text x="${pl+i*bw+bw/2}" y="${H-8}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Barlow,sans-serif">${i+1}</text>`});
  if(max===0)s+=`<text x="${pl+iw/2}" y="${pt+ih/2}" text-anchor="middle" font-size="14" fill="var(--dim)" font-family="Barlow,sans-serif">Sem entradas neste mês</text>`;
  return s+"</svg>";
}
document.addEventListener("click",e=>{
  if(view!=="admin")return;
  const fm=e.target.closest("[data-fm]");if(fm){const[y,mo]=A.month.split("-").map(Number);const d=new Date(y,mo-1+Number(fm.dataset.fm),1);A.month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;render();return}
  const ee=e.target.closest("[data-exedit]");if(ee)exModal(S.data.expenses[ee.dataset.exedit]);
});
function exModal(x){
  const isNew=!x,dflt=A.month===today().slice(0,7)?today():A.month+"-01";
  x=x||{id:uid(),description:"",cat:"Aluguel",amount:"",date:dflt,fixed:false};
  modal(isNew?"Nova despesa":"Editar despesa",`
    <label class="field"><span>Descrição</span><input class="input" id="xDesc" value="${esc(x.description)}" placeholder="Ex.: Aluguel do ponto"></label>
    <div class="form2"><label class="field"><span>Categoria</span><select class="input" id="xCat">${EXP_CATS.map(c=>`<option ${x.cat===c?"selected":""}>${c}</option>`).join("")}</select></label>
    <label class="field"><span>Valor</span><input class="input num" id="xAmt" inputmode="decimal" value="${x.amount!==""?String(x.amount).replace(".",","):""}" placeholder="0,00"></label></div>
    <div class="form2"><label class="field"><span>Data</span><input type="date" class="input" id="xDate" value="${x.date}"></label>
    <label style="display:flex;gap:8px;align-items:center;padding-top:22px"><input type="checkbox" id="xFix" ${x.fixed?"checked":""} style="accent-color:var(--gold)"> Despesa fixa (todo mês)</label></div>
    <small class="err-msg" id="xErr" hidden></small>${isNew?"":`<div data-xdelwrap><button class="btn sm danger" data-xdel>Excluir despesa</button></div>`}`,
    `<button class="btn ghost" id="xC">Fechar</button><button class="btn gold" id="xS">Salvar</button>`,
    close=>{
      $("#xC").onclick=close;
      $("#xCat").onchange=e=>{if(!$("#xDesc").value)$("#xDesc").value=e.target.value;if(e.target.value==="Aluguel")$("#xFix").checked=true};
      const dw=document.querySelector("[data-xdelwrap]");if(dw)dw.onclick=async ev=>{if(ev.target.closest("[data-xdel]")){dw.innerHTML=`<span class="hint">Excluir esta despesa?</span> <button class="btn sm danger" data-xdelok>Excluir</button>`;return}if(ev.target.closest("[data-xdelok]")){await del("expenses",x.id);close();toast("Despesa excluída.")}};
      $("#xS").onclick=async()=>{const amount=money($("#xAmt").value),description=$("#xDesc").value.trim()||$("#xCat").value;
        if(!amount||amount<0||!$("#xDate").value){$("#xErr").textContent="Informe valor e data.";$("#xErr").hidden=false;return}
        try{await put("expenses",{...x,description,cat:$("#xCat").value,amount,date:$("#xDate").value,fixed:$("#xFix").checked})}catch(_){return}
        close();toast("Despesa salva.")};
    });
}

/* ---- Ajustes ---- */
let draft=null;
function rAjustes(){
  const c=cfg();if(!draft)draft=JSON.parse(JSON.stringify({services:c.services,plans:c.plans}));
  $("#admBody").innerHTML=`
  <div class="settings">
    <div class="panel"><div class="panel-h"><h3>Contato</h3></div><div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
      <label class="field"><span>WhatsApp da barbearia</span><input class="input num" id="cfWa" inputmode="tel" value="${esc(fmtPhone(c.whatsapp))}" placeholder="(41) 99999-9999"></label>
      <label class="field"><span>Endereço (aparece no rodapé)</span><input class="input" id="cfAddr" value="${esc(c.address)}" placeholder="Rua, número, bairro"></label>
      <button class="btn gold" id="cfSave1" style="align-self:flex-start">Salvar contato</button></div></div>
    <div class="panel"><div class="panel-h"><h3>Funcionamento</h3></div><div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
      <div class="form2"><label class="field"><span>Seg–sex abre</span><input type="time" class="input" id="hw0" value="${c.hours.wk[0]}"></label><label class="field"><span>Seg–sex fecha</span><input type="time" class="input" id="hw1" value="${c.hours.wk[1]}"></label></div>
      <div class="form2"><label class="field"><span>Sábado abre</span><input type="time" class="input" id="hs0" value="${c.hours.sat[0]}"></label><label class="field"><span>Sábado fecha</span><input type="time" class="input" id="hs1" value="${c.hours.sat[1]}"></label></div>
      <div class="form2"><label class="field"><span>Intervalo da agenda</span><select class="input" id="cfStep">${[15,20,30,45,60].map(v=>`<option value="${v}" ${Number(c.step)===v?"selected":""}>${v} min</option>`).join("")}</select></label>
      <label class="field"><span>Barbeiros atendendo ao mesmo tempo</span><input type="number" min="1" max="10" class="input" id="cfChairs" value="${c.chairs}"></label></div>
      <div class="field"><span>Dias fechados</span><div class="chips">${(c.blocked||[]).filter(d=>d>=today()).map(d=>`<span class="chip num">${dShort(d)} <button data-unblock="${d}" aria-label="Reabrir ${dShort(d)}">×</button></span>`).join("")||`<span class="hint">Nenhum. Feche dias pela Agenda (feriados, folgas).</span>`}</div></div>
      <button class="btn gold" id="cfSave2" style="align-self:flex-start">Salvar funcionamento</button></div></div>
  </div>
  <div class="settings">
    <div class="panel"><div class="panel-h"><h3>Serviços e preços</h3><button class="btn sm" id="svAdd">+ Serviço</button></div><div class="panel-b edit-rows">
      <div class="edit-row label" style="font-size:.7rem"><span>Nome</span><span>Preço</span><span>Minutos</span><span></span></div>
      ${draft.services.map((s,i)=>`<div class="edit-row"><input class="input" data-sv="${i}:name" value="${esc(s.name)}" aria-label="Nome"><input class="input num" data-sv="${i}:price" inputmode="decimal" value="${String(s.price).replace(".",",")}" aria-label="Preço"><input class="input num" data-sv="${i}:dur" type="number" step="5" min="5" value="${s.dur}" aria-label="Minutos"><button class="icon-btn" data-svdel="${i}" aria-label="Remover">✕</button></div>`).join("")}
      <button class="btn gold" id="svSave" style="align-self:flex-start;margin-top:6px">Salvar serviços</button></div></div>
    <div class="panel"><div class="panel-h"><h3>Planos mensais</h3><button class="btn sm" id="plAdd">+ Plano</button></div><div class="panel-b edit-rows">
      ${draft.plans.length?`<div class="edit-row plan label" style="font-size:.7rem"><span>Nome do plano</span><span>Valor/mês</span><span></span></div>`:`<span class="hint">Cadastre os planos para preencher o valor ao adicionar assinantes.</span>`}
      ${draft.plans.map((p,i)=>`<div class="edit-row plan"><input class="input" data-pl="${i}:name" value="${esc(p.name)}" aria-label="Nome do plano"><input class="input num" data-pl="${i}:price" inputmode="decimal" value="${String(p.price).replace(".",",")}" aria-label="Valor"><button class="icon-btn" data-pldel="${i}" aria-label="Remover">✕</button></div>`).join("")}
      <button class="btn gold" id="plSave" style="align-self:flex-start;margin-top:6px">Salvar planos</button></div></div>
  </div>`;
  $("#cfWa").oninput=e=>e.target.value=fmtPhone(e.target.value);
  $("#cfSave1").onclick=async()=>{await saveCfg({whatsapp:digits($("#cfWa").value),address:$("#cfAddr").value.trim()});toast("Contato salvo.")};
  $("#cfSave2").onclick=async()=>{const w=[$("#hw0").value,$("#hw1").value],s=[$("#hs0").value,$("#hs1").value];
    if(w.some(v=>!v)||s.some(v=>!v)||w[0]>=w[1]||s[0]>=s[1]){toast("Confira os horários de abertura e fechamento.");return}
    await saveCfg({hours:{wk:w,sat:s},step:Number($("#cfStep").value),chairs:Math.max(1,Number($("#cfChairs").value)||1)});toast("Funcionamento salvo.")};
  $("#svAdd").onclick=()=>{draft.services.push({id:"s"+Date.now().toString(36),name:"",price:0,dur:30});render()};
  $("#plAdd").onclick=()=>{draft.plans.push({name:"",price:0});render()};
  $("#svSave").onclick=async()=>{const sv=draft.services.filter(s=>s.name.trim()).map(s=>({...s,name:s.name.trim(),price:Number(s.price)||0,dur:Math.max(5,Number(s.dur)||30)}));
    if(!sv.length){toast("Mantenha pelo menos um serviço.");return}await saveCfg({services:sv});draft=null;toast("Serviços salvos.")};
  $("#plSave").onclick=async()=>{await saveCfg({plans:draft.plans.filter(p=>p.name.trim()).map(p=>({name:p.name.trim(),price:Number(p.price)||0}))});draft=null;toast("Planos salvos.")};
}
document.addEventListener("input",e=>{
  const sv=e.target.dataset&&e.target.dataset.sv;if(sv&&draft){const[i,k]=sv.split(":");draft.services[i][k]=k==="price"?money(e.target.value):k==="dur"?Number(e.target.value):e.target.value;return}
  const pl=e.target.dataset&&e.target.dataset.pl;if(pl&&draft){const[i,k]=pl.split(":");draft.plans[i][k]=k==="price"?money(e.target.value):e.target.value}
});
document.addEventListener("click",async e=>{
  if(view!=="admin"||tab!=="ajustes")return;
  const d=e.target.closest("[data-svdel]");if(d){draft.services.splice(Number(d.dataset.svdel),1);render();return}
  const p=e.target.closest("[data-pldel]");if(p){draft.plans.splice(Number(p.dataset.pldel),1);render();return}
  const u=e.target.closest("[data-unblock]");if(u){await saveCfg({blocked:(cfg().blocked||[]).filter(x=>x!==u.dataset.unblock)});toast("Dia reaberto.")}
});

/* ============ início ============ */
renderPublic();
(async()=>{
  await loadSettings();
  if(location.hash==="#barbeiro")await tryAdmin();
  else{await checkSession();loadBusy()}
  if(sb)sb.channel("public-settings").on("postgres_changes",{event:"*",schema:"public",table:"settings"},p=>{if(p.new&&p.new.data){S.settings=p.new.data;render()}}).subscribe();
})();
setInterval(()=>{if(view==="public"){loadBusy();renderPublic()}},60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&view==="public")loadBusy()});
})();
