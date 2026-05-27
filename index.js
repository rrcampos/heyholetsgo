require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS treinos (
      id SERIAL PRIMARY KEY,
      data DATE NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      concluido BOOLEAN DEFAULT false,
      nota TEXT,
      duracao_min INT,
      distancia_km NUMERIC(5,2),
      usuario VARCHAR(20) DEFAULT 'renato',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dicas (
      id SERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      categoria VARCHAR(50)
    );
  `);
  await pool.query(`ALTER TABLE treinos ADD COLUMN IF NOT EXISTS usuario VARCHAR(20) DEFAULT 'renato'`);
  const { rows } = await pool.query('SELECT COUNT(*) FROM dicas');
  if (parseInt(rows[0].count) === 0) {
    const dicas = [
      ['Hidratação é treino também. Beba água antes, durante e depois de correr.','corrida'],
      ['Na dúvida, vai mais devagar. Consistência bate intensidade toda semana.','geral'],
      ['O joelho avisa antes de doer sério. Presta atenção nos sinais do corpo.','joelho'],
      ['Aquecimento de 5 min antes da corrida reduz muito o risco de lesão.','corrida'],
      ['Semana ruim não quebra sequência boa. Amanhã é um novo treino.','mental'],
      ['Proteína nas 2h após academia potencializa a recuperação muscular.','nutrição'],
      ['Beach tennis é treino completo — cardio, reflexo e equilíbrio ao mesmo tempo.','beach'],
      ['Descanso não é preguiça. É parte do plano.','recuperação'],
      ['Correr na praia de manhã é um privilégio. Aproveita cada vez.','corrida'],
      ['Ritmo de conversa = ritmo certo. Se não consegue falar, está rápido demais.','corrida'],
      ['O treino que você faz consistentemente supera o treino perfeito que você pula.','mental'],
      ['Semana com 5 atividades já é elite. Constância é tudo.','geral'],
      ['Academia de superior duas vezes por semana: deixa 48h entre os treinos.','academia'],
      ['Inferior no sábado longe do beach de quarta — joelho agradece.','joelho'],
      ['Cada semana do plano de corrida é uma semana que seu joelho ficou mais forte.','corrida'],
      ['Progressão de corrida: tempo primeiro, ritmo depois. Nunca os dois juntos.','corrida'],
      ['Dor muscular é adaptação. Dor articular é sinal. Aprende a diferença.','joelho'],
      ['Core forte = joelho protegido. Abdômen forte tira sobrecarga da perna.','academia'],
      ['Sábado de academia cedo deixa o fim de semana livre. Melhor dos dois mundos.','geral'],
      ['Cada check no calendário prova que você é o tipo de pessoa que treina.','mental'],
    ];
    for (const [texto, categoria] of dicas)
      await pool.query('INSERT INTO dicas (texto, categoria) VALUES ($1,$2)', [texto, categoria]);
  }
  console.log('Banco inicializado.');
}

const ROTINAS = {
  renato: {
    1: { tipo:'Corrida leve',      icone:'RUN',  horario:'17h', label:'CORRIDA',  local:''                },
    2: { tipo:'Academia — sup. A', icone:'GYM',  horario:'11h', label:'ACADEMIA', local:''                },
    3: { tipo:'Beach tennis',      icone:'BCH',  horario:'20h', label:'BEACH',    local:'São Francisco'   },
    4: { tipo:'Academia — sup. B', icone:'GYM',  horario:'11h', label:'ACADEMIA', local:''                },
    5: { tipo:'Corrida leve',      icone:'RUN',  horario:'10h', label:'CORRIDA',  local:'Itacoatiara'     },
    6: { tipo:'Academia — inf.',   icone:'GYM',  horario:'9h',  label:'ACADEMIA', local:''                },
    0: { tipo:'Descanso',          icone:'REST', horario:'—',   label:'DESCANSO', local:''                },
  },
  silvia: {
    1: { tipo:'Academia — sup. A', icone:'GYM',  horario:'8h',  label:'ACADEMIA', local:''                },
    2: [
      { tipo:'Beach tennis',       icone:'BCH',  horario:'9h',  label:'BEACH',    local:'Clube'           },
      { tipo:'Beach tennis',       icone:'BCH',  horario:'18h', label:'BEACH',    local:'Arena'           },
    ],
    3: { tipo:'Academia — sup. B', icone:'GYM',  horario:'9h',  label:'ACADEMIA', local:''                },
    4: { tipo:'Beach tennis',      icone:'BCH',  horario:'9h',  label:'BEACH',    local:'Arena'           },
    5: { tipo:'Academia — inf.',   icone:'GYM',  horario:'10h', label:'ACADEMIA', local:''                },
    6: { tipo:'Descanso',          icone:'REST', horario:'—',   label:'DESCANSO', local:''                },
    0: { tipo:'Descanso',          icone:'REST', horario:'—',   label:'DESCANSO', local:''                },
  },
};

function getRotina(usuario, dow) {
  return ROTINAS[usuario]?.[dow] || ROTINAS.renato[0];
}

function getRotinaList(usuario, dow) {
  const r = getRotina(usuario, dow);
  return Array.isArray(r) ? r : [r];
}

const DIAS_SHORT = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
const MESES_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_SHORT = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function hojeStr() { return new Date().toISOString().slice(0,10); }

function semanaAtual() {
  const hoje = new Date();
  const dow  = hoje.getDay();
  const seg  = new Date(hoje); seg.setDate(hoje.getDate() - ((dow===0?7:dow)-1));
  const sab  = new Date(seg);  sab.setDate(seg.getDate()+6);
  return { inicio: seg.toISOString().slice(0,10), fim: sab.toISOString().slice(0,10) };
}

function calcSemanaPlano(primeiroTreino) {
  if (!primeiroTreino) return 1;
  const inicio = new Date(primeiroTreino + 'T12:00:00');
  const hoje = new Date();
  const diffMs = hoje - inicio;
  const diffSemanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.min(Math.max(diffSemanas + 1, 1), 8);
}

async function getDicaHoje() {
  const { rows } = await pool.query('SELECT texto, categoria FROM dicas ORDER BY id');
  if (!rows.length) return { texto:'Continue firme.', categoria:'geral' };
  return rows[new Date().getDate() % rows.length];
}

async function getStats(usuario='renato') {
  const semana = semanaAtual();
  const u = usuario;
  const [totalR, semanaR, streakR, corridaR, primeiroR] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM treinos WHERE concluido=true AND usuario=$1',[u]),
    pool.query('SELECT * FROM treinos WHERE data>=$1 AND data<=$2 AND usuario=$3 ORDER BY data ASC',[semana.inicio,semana.fim,u]),
    pool.query(`SELECT COUNT(DISTINCT data) as streak FROM treinos WHERE concluido=true AND usuario=$1 AND data >= CURRENT_DATE - INTERVAL '30 days'`,[u]),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, SUM(distancia_km) as km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL AND usuario=$1 GROUP BY semana ORDER BY semana ASC`,[u]),
    pool.query(`SELECT MIN(data)::text as primeiro FROM treinos WHERE concluido=true AND usuario=$1`,[u]),
  ]);
  return {
    total:    parseInt(totalR.rows[0].count),
    semana:   semanaR.rows,
    streak:   parseInt(streakR.rows[0].streak)||0,
    corridas: corridaR.rows,
    primeiro: primeiroR.rows[0]?.primeiro || null,
  };
}

async function getMetas(usuario='renato') {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
  const semana = semanaAtual();

  const [maiorR, minR, semTreinosR, corridaHistR, streakMesR, minMesR, heatR, planoR, _primeiroR] = await Promise.all([
    pool.query(`SELECT COALESCE(MAX(distancia_km),0) as max_km, COALESCE(AVG(distancia_km),0) as avg_km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL AND usuario=$1`,[usuario]),
    pool.query(`SELECT COALESCE(SUM(duracao_min),0) as min FROM treinos WHERE concluido=true AND data>=$1 AND usuario=$2`,[inicioMes,usuario]),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=CURRENT_DATE-INTERVAL '84 days' AND usuario=$1 GROUP BY semana ORDER BY semana`,[usuario]),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, MAX(distancia_km) as max_km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL AND usuario=$1 GROUP BY semana ORDER BY semana`,[usuario]),
    pool.query(`SELECT DATE_TRUNC('month',data)::date as mes, COUNT(DISTINCT data) as dias FROM treinos WHERE concluido=true AND usuario=$1 GROUP BY mes ORDER BY mes DESC LIMIT 6`,[usuario]),
    pool.query(`SELECT DATE_TRUNC('month',data)::date as mes, COALESCE(SUM(duracao_min),0) as min FROM treinos WHERE concluido=true AND data>=CURRENT_DATE-INTERVAL '180 days' AND usuario=$1 GROUP BY mes ORDER BY mes`,[usuario]),
    pool.query(`SELECT data::text, COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=CURRENT_DATE-INTERVAL '180 days' AND usuario=$1 GROUP BY data ORDER BY data`,[usuario]),
    pool.query(`SELECT COUNT(DISTINCT DATE_TRUNC('week',data)) as semanas, MIN(data)::text as primeiro FROM treinos WHERE concluido=true AND usuario=$1`,[usuario]),
    pool.query(`SELECT COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=$1 AND data<=$2 AND usuario=$3`,[semana.inicio,semana.fim,usuario]),
  ]);

  const semTreinosAtual = await pool.query(`SELECT COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=$1 AND data<=$2 AND usuario=$3`,[semana.inicio,semana.fim,usuario]);

  return {
    maiorKm: parseFloat(maiorR.rows[0].max_km||0),
    avgKm:   parseFloat(maiorR.rows[0].avg_km||0),
    minMes:  parseInt(minR.rows[0].min||0),
    semTreinos: semTreinosR.rows,
    corridaHist: corridaHistR.rows,
    streakMes: streakMesR.rows,
    minMesList: minMesR.rows,
    heatRows: heatR.rows,
    semanasCorrida: parseInt(planoR.rows[0].semanas||0),
    treinosSemAtual: parseInt(semTreinosAtual.rows[0].feitos||0),
  };
}

async function getCalendario(usuario='renato') {
  const hoje  = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);
  const { rows } = await pool.query('SELECT data::text, tipo, concluido FROM treinos WHERE data>=$1 AND data<=$2 AND usuario=$3',[inicio,fim,usuario]);
  return rows;
}

function proximoTreino(usuario='renato') {
  for (let i=0; i<=7; i++) {
    const d = new Date(); d.setDate(d.getDate()+i);
    const dow = d.getDay();
    const r = getRotina(usuario, dow);
    const rList = Array.isArray(r) ? r : [r];
    const first = rList[0];
    if (first && first.tipo!=='Descanso')
      return { ...first, data:d.toISOString().slice(0,10), dia:DIAS_SHORT[dow], daqui:i };
  }
  return null;
}

// CSS COMPARTILHADO
const SHARED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0F1117;
  --card:#1A1D27;
  --card2:#21253200;
  --border:rgba(255,255,255,0.09);
  --border2:rgba(255,255,255,0.16);
  --text:#F0F0F5;
  --muted:#6A6A80;
  --muted2:#9A9AB0;
  --accent:#D4FE45;
  --accent-dim:rgba(212,254,69,0.13);
  --accent-mid:rgba(212,254,69,0.4);
  --r:14px;
}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}

.sidebar{
  width:220px;min-height:100vh;background:#0C0E14;
  border-right:1px solid var(--border);
  padding:0;display:flex;flex-direction:column;flex-shrink:0;
  position:sticky;top:0;height:100vh;overflow-y:auto;
}
.sidebar-logo{padding:28px 24px 24px;border-bottom:1px solid var(--border)}
.logo-mark{display:inline-flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.logo-text{font-family:'Outfit',sans-serif;font-size:16px;font-weight:800;color:var(--text);letter-spacing:0.04em;text-transform:uppercase}
.logo-sub{font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600}
.sidebar-nav{padding:20px 0;flex:1}
.nav-group{margin-bottom:8px}
.nav-label{padding:8px 24px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:var(--muted)}
.nav-item{
  display:flex;align-items:center;gap:12px;
  padding:11px 24px;font-size:13px;font-weight:600;color:var(--muted2);
  cursor:pointer;transition:all 0.15s;text-decoration:none;
  border-left:2px solid transparent;letter-spacing:0.02em;
}
.nav-item:hover{background:rgba(255,255,255,0.03);color:var(--text)}
.nav-item.active{color:var(--accent);border-left-color:var(--accent);background:var(--accent-dim)}
.nav-icon{font-size:11px;font-weight:800;letter-spacing:0.06em;width:28px;height:20px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:4px;flex-shrink:0;font-family:'Outfit',sans-serif}
.nav-item.active .nav-icon{background:var(--accent-dim);color:var(--accent)}
.sidebar-foot{padding:20px 24px;border-top:1px solid var(--border)}
.user-row{display:flex;align-items:center;gap:10px}
.user-av{width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#111;font-family:'Outfit',sans-serif}
.user-name{font-size:12px;font-weight:700;color:var(--text)}
.user-loc{font-size:10px;color:var(--muted);margin-top:1px}

.content{flex:1;min-width:0;display:flex;flex-direction:column;overflow-x:hidden}
.topbar{
  background:rgba(12,14,20,0.88);backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border);
  padding:16px 32px;display:flex;justify-content:space-between;align-items:center;
  position:sticky;top:0;z-index:10;
}
.topbar-title{font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;color:var(--muted2);letter-spacing:0.12em;text-transform:uppercase}
.topbar-date{font-size:12px;color:var(--muted);font-weight:600;letter-spacing:0.06em;text-transform:uppercase}

.main{padding:32px;flex:1}

#notif{
  position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);
  background:var(--accent);color:#111;padding:12px 28px;border-radius:4px;
  font-size:13px;font-weight:800;opacity:0;transition:all 0.3s;
  pointer-events:none;z-index:100;white-space:nowrap;
  font-family:'Outfit',sans-serif;letter-spacing:0.06em;text-transform:uppercase;
}
#notif.show{opacity:1;transform:translateX(-50%) translateY(0)}

@media(max-width:860px){
  .sidebar{display:none}
  .main{padding:16px 16px 130px}
  .bottom-nav{display:flex !important}
  .topbar{padding:12px 16px}
  .hero{padding:24px 16px 28px}
  .hero-name{font-size:36px}
  .big-stats{flex-direction:column;gap:0}
  .big-stat{border-right:none !important;border-bottom:1px solid var(--border)}
  .big-stat:last-child{border-bottom:none}
  .big-stat-val{font-size:32px}
  .two-col,.three-col{grid-template-columns:1fr !important}
  .reg-body{grid-template-columns:1fr !important;gap:20px}
  .tipo-grid{grid-template-columns:repeat(3,1fr) !important}
  .fields-2{grid-template-columns:1fr 1fr}
  .insight-row{grid-template-columns:1fr !important}
  .two-col-metas{grid-template-columns:1fr !important}
  .gauge-row{grid-template-columns:1fr 1fr !important}
  .gauge-item{border-right:none !important;border-bottom:1px solid var(--border) !important}
  .gauge-item:nth-child(odd){border-right:1px solid var(--border) !important}
  .gauge-item:last-child,.gauge-item:nth-last-child(2):nth-child(odd){border-bottom:none !important}
  .metas-row{flex-direction:column;gap:0}
  .meta-big{border-right:none !important;border-bottom:1px solid var(--border)}
  .meta-big:last-child{border-bottom:none}
  .metas-hero{padding:24px 16px 28px}
  .metas-hero-title{font-size:36px}
  .heat-inner{gap:2px}
  .heat-cell-sm{width:9px !important;height:9px !important}
  table{font-size:11px}
  th,td{padding:10px 10px !important}
  .reg-head{padding:20px 16px}
  .reg-body{padding:20px 16px !important}
  .semana-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:0 16px}
  .semana-grid-inner{display:flex;gap:10px;width:max-content}
  .dia-card-mobile{width:90px;flex-shrink:0}
}
@media(max-width:480px){
  .hero-name{font-size:30px}
  .big-stat-val{font-size:28px}
  .tipo-grid{grid-template-columns:repeat(3,1fr) !important}
}

.bottom-nav{
  display:none;
  position:fixed;bottom:0;left:0;right:0;
  background:#0C0E14;
  border-top:2px solid rgba(255,255,255,0.12);
  padding:10px 10px max(20px,env(safe-area-inset-bottom));
  z-index:100;
  grid-template-columns:repeat(4,1fr);
  gap:6px;
}
.bottom-nav-item{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  padding:14px 6px 12px;text-decoration:none;color:var(--muted2);
  transition:all 0.12s;cursor:pointer;border-radius:14px;
  border:1.5px solid transparent;min-height:76px;
  -webkit-tap-highlight-color:transparent;
}
.bottom-nav-item.active{
  color:var(--accent);
  background:rgba(212,254,69,0.1);
  border-color:rgba(212,254,69,0.3);
}
.bottom-nav-item:active{
  transform:scale(0.92);
}
.bottom-nav-icon{
  font-size:16px;font-weight:800;font-family:'Outfit',sans-serif;
  letter-spacing:0.04em;width:52px;height:40px;
  display:flex;align-items:center;justify-content:center;
  border-radius:12px;background:rgba(255,255,255,0.07);
  transition:all 0.12s;
}
.bottom-nav-item.active .bottom-nav-icon{
  background:rgba(212,254,69,0.2);
  color:var(--accent);
}
.bottom-nav-label{
  font-size:11px;font-weight:800;letter-spacing:0.06em;
  text-transform:uppercase;font-family:'Outfit',sans-serif;
  line-height:1;
}
`;

// ── ROTA / ────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const usuario = req.query.u === 'silvia' ? 'silvia' : 'renato';
    const nomeExib = usuario === 'silvia' ? 'SILVIA' : 'RENATO';
    const outroUser = usuario === 'silvia' ? 'renato' : 'silvia';
    const outroNome = usuario === 'silvia' ? 'RENATO' : 'SILVIA';
    const [stats, calendario, dica] = await Promise.all([getStats(usuario), getCalendario(usuario), getDicaHoje()]);
    const proximo = proximoTreino(usuario);
    const hoje    = new Date();
    const hojeS   = hojeStr();
    const anoMes  = `${MESES_PT[hoje.getMonth()].toUpperCase()} ${hoje.getFullYear()}`;
    const diasNoMes   = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();
    const primeiroDow = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getDay();
    const offsetSeg   = primeiroDow === 0 ? 6 : primeiroDow-1;

    const treinosMap = {};
    for (const t of calendario) {
      const d = t.data.slice(0,10);
      if (!treinosMap[d]) treinosMap[d] = [];
      treinosMap[d].push(t);
    }

    const semana = semanaAtual();
    const semMap = {};
    for (const t of stats.semana) semMap[t.data.slice?t.data.slice(0,10):t.data] = t;

    const diasSemana = [];
    for (let i=0; i<7; i++) {
      const d=new Date(semana.inicio); d.setDate(d.getDate()+i);
      const ds=d.toISOString().slice(0,10); const dow=d.getDay();
      const rotinaList = getRotinaList(usuario, dow);
      diasSemana.push({data:ds,dow,diaNome:DIAS_SHORT[dow],dia:d.getDate(),rotina:rotinaList[0],rotinaList,treino:semMap[ds]||null,hoje:ds===hojeS});
    }

    const feitasSemana    = diasSemana.filter(d=>d.treino?.concluido).length;
    const possiveisSemana = diasSemana.filter(d=>d.rotina?.tipo!=='Descanso').length;
    const pctSemana       = possiveisSemana>0?Math.round((feitasSemana/possiveisSemana)*100):0;
    const kmPorSemana     = stats.corridas.map(r=>({semana:r.semana,km:parseFloat(r.km||0).toFixed(1)}));
    const semanaPlano     = calcSemanaPlano(stats.primeiro);

    const horaAtual = hoje.getHours();
    const saudacao  = horaAtual<12?'BOM DIA':horaAtual<18?'BOA TARDE':'BOA NOITE';

    function pad(n){return String(n).padStart(2,'0')}
    function calCell(day) {
      if(!day) return `<div></div>`;
      const ds=`${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(day)}`;
      const tr=treinosMap[ds]||[];
      const feito=tr.some(t=>t.concluido);
      const pend=tr.length>0&&!feito;
      const isHoje=ds===hojeS;
      let bg='transparent'; let tc='var(--muted)'; let bord='transparent';
      if(feito){bg='var(--accent)';tc='#111';bord='var(--accent)'}
      else if(pend){bg='rgba(212,254,69,0.08)';tc='var(--accent)';bord='rgba(212,254,69,0.3)'}
      else if(isHoje){bord='var(--muted2)';tc='var(--text)'}
      return `<div style="aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:${bg};color:${tc};border:1px solid ${bord};font-family:'Outfit',sans-serif;letter-spacing:0.02em">${day}${feito?'':''}${feito?'<span style="font-size:7px;display:block;line-height:1;opacity:0.7">✓</span>':''}</div>`;
    }

    const calCells=[];
    for(let i=0;i<offsetSeg;i++) calCells.push(null);
    for(let d=1;d<=diasNoMes;d++) calCells.push(d);

    const semanaCells = diasSemana.map(day=>{
      const isRest=day.rotina?.tipo==='Descanso';
      const feito=day.treino?.concluido;
      return `
      <div style="border:1px solid ${day.hoje?'var(--border2)':'var(--border)'};border-radius:10px;padding:14px 10px;text-align:center;cursor:${isRest?'default':'pointer'};background:${feito?'var(--accent-dim)':day.hoje?'rgba(255,255,255,0.03)':'transparent'};transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:6px;min-height:120px"
        ${!isRest?`onclick="toggleTreino('${day.data}','${day.rotina?.tipo}')"`:''}
        onmouseenter="if(!${isRest})this.style.borderColor='var(--border2)'"
        onmouseleave="this.style.borderColor='${day.hoje?'var(--border2)':'var(--border)'}'">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.12em;color:var(--muted);font-family:'Outfit',sans-serif">${day.diaNome}</div>
        ${day.hoje?`<div style="font-size:7px;font-weight:800;background:var(--accent);color:#111;border-radius:3px;padding:1px 5px;letter-spacing:0.08em;font-family:'Outfit',sans-serif">HOJE</div>`:''}
        <div style="font-size:22px;margin:2px 0">${isRest?'—':feito?'✓':day.rotina?.icone==='RUN'?'🏃':day.rotina?.icone==='GYM'?'💪':day.rotina?.icone==='BCH'?'🎾':'—'}</div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.1em;color:${isRest?'var(--muted)':feito?'var(--accent)':'var(--text)'};font-family:'Outfit',sans-serif">${day.rotina?.label}</div>
        ${!isRest?`<div style="font-size:8px;color:var(--muted);font-weight:600">${day.rotina?.horario}</div>`:''}
        ${feito
          ?`<div style="font-size:8px;font-weight:800;color:var(--accent);letter-spacing:0.08em;margin-top:auto;font-family:'Outfit',sans-serif">FEITO ✓</div>`
          :(!isRest?`<div style="font-size:8px;font-weight:700;color:var(--muted);letter-spacing:0.06em;margin-top:auto;font-family:'Outfit',sans-serif">MARCAR</div>`:'')}
      </div>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Treinos · Renato</title>
<style>${SHARED_CSS}
.hero{padding:48px 32px 40px;border-bottom:1px solid var(--border)}
.hero-greeting{font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--muted);margin-bottom:6px;font-family:'Outfit',sans-serif}
.hero-name{font-family:'Outfit',sans-serif;font-size:52px;font-weight:900;color:var(--text);letter-spacing:-0.03em;line-height:1;margin-bottom:6px}
.hero-name span{color:var(--accent)}
.hero-sub{font-size:13px;color:var(--muted2);font-weight:500;margin-bottom:36px}
.big-stats{display:flex;gap:0;border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.big-stat{flex:1;padding:24px 28px;border-right:1px solid var(--border)}
.big-stat:last-child{border-right:none}
.big-stat-val{font-family:'Outfit',sans-serif;font-size:44px;font-weight:900;letter-spacing:-0.03em;line-height:1;color:var(--text)}
.big-stat-val.accent{color:var(--accent)}
.big-stat-label{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-top:6px}
.big-stat-sub{font-size:11px;color:var(--muted);margin-top:2px}
.section-label{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.semana-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:10px}
.prog-track{background:#21253280;border-radius:99px;height:3px;margin-top:16px;overflow:hidden}
.prog-fill{height:100%;border-radius:99px;background:var(--accent);transition:width 0.8s}
.prog-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);font-weight:700;margin-top:8px;letter-spacing:0.06em;font-family:'Outfit',sans-serif}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.three-col{display:grid;grid-template-columns:3fr 2fr;gap:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:28px}
.cal-hdr{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:6px}
.cal-hdr span{text-align:center;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);padding:3px 0;font-family:'Outfit',sans-serif}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.proximo-big{font-family:'Outfit',sans-serif;font-size:36px;font-weight:900;color:var(--text);letter-spacing:-0.02em;margin:8px 0 4px}
.proximo-when{font-size:9px;font-weight:800;letter-spacing:0.18em;color:var(--accent);text-transform:uppercase;font-family:'Outfit',sans-serif}
.proximo-hora{font-size:11px;color:var(--muted);font-weight:600;letter-spacing:0.08em}
.dica-text{font-size:18px;line-height:1.6;color:var(--text);font-style:italic;font-weight:400;margin:12px 0}
.dica-cat{display:inline-block;background:var(--accent-dim);color:var(--accent);font-size:9px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;padding:4px 10px;border-radius:4px;font-family:'Outfit',sans-serif}
.reg-section{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.reg-head{padding:28px 32px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.reg-head-title{font-family:'Outfit',sans-serif;font-size:22px;font-weight:900;color:var(--text);letter-spacing:-0.01em}
.reg-head-sub{font-size:11px;color:var(--muted);margin-top:3px}
.reg-body{padding:32px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
.field-label{font-size:9px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;font-family:'Outfit',sans-serif}
.tipo-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.tipo-btn{
  border:1px solid var(--border);border-radius:8px;padding:16px 8px;
  text-align:center;cursor:pointer;transition:all 0.15s;background:transparent;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  -webkit-tap-highlight-color:transparent;min-height:70px;justify-content:center;
}
.tipo-btn:hover{border-color:var(--border2);background:rgba(255,255,255,0.03)}
.tipo-btn.selected{border-color:var(--accent);background:var(--accent-dim)}
.tipo-btn-icon{font-size:20px}
.tipo-btn-nome{font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted2);font-family:'Outfit',sans-serif}
.tipo-btn.selected .tipo-btn-nome{color:var(--accent)}
.humor-row{display:flex;gap:8px}
.humor-btn{flex:1;border:1px solid var(--border);border-radius:8px;padding:14px 6px;text-align:center;cursor:pointer;font-size:24px;transition:all 0.15s;background:transparent;-webkit-tap-highlight-color:transparent;min-height:56px}
.humor-btn:hover{border-color:var(--border2);transform:scale(1.08)}
.humor-btn.selected{border-color:var(--accent);background:var(--accent-dim)}
.field-input{
  width:100%;border:1px solid var(--border);border-radius:8px;padding:14px 16px;
  font-size:16px;font-family:'DM Sans',sans-serif;background:#21253280;color:var(--text);
  outline:none;transition:border-color 0.15s;-webkit-appearance:none;
}
.field-input:focus{border-color:var(--accent)}
.field-input::placeholder{color:var(--muted)}
textarea.field-input{resize:vertical;min-height:90px;line-height:1.5}
.fields-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn-save{
  width:100%;background:var(--accent);color:#111;border:none;border-radius:8px;
  padding:18px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:900;
  cursor:pointer;transition:opacity 0.15s;letter-spacing:0.1em;text-transform:uppercase;
  margin-top:6px;-webkit-tap-highlight-color:transparent;
}
.btn-save:hover{opacity:0.85}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark"><div class="logo-dot"></div><div class="logo-text">TREINOS</div></div>
    <div class="logo-sub">Renato Campos</div>
  </div>
  <div class="sidebar-nav">
    <div class="nav-group">
      <div class="nav-label">Menu</div>
      <a href="/?u=${usuario}" class="nav-item active"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas?u=${usuario}" class="nav-item"><span class="nav-icon">MT</span>Metas</a>
      <a href="/historico?u=${usuario}" class="nav-item"><span class="nav-icon">HT</span>Histórico</a>
      <a href="/duelo" class="nav-item"><span class="nav-icon">⚔</span>Duelo</a>
    </div>
    <div class="nav-group">
      <div class="nav-label">Atividades</div>
      <a href="#semana" class="nav-item"><span class="nav-icon">SM</span>Semana</a>
      <a href="#corrida" class="nav-item"><span class="nav-icon">RN</span>Corrida</a>
      <a href="#registro" class="nav-item"><span class="nav-icon">+</span>Registrar</a>
    </div>
  </div>
  <div class="sidebar-foot">
    <div class="user-row">
      <div class="user-av">RC</div>
      <div><div class="user-name">Renato</div><div class="user-loc">Niterói, RJ</div></div>
    </div>
  </div>
</div>

<div class="content">
  <div class="topbar">
    <div class="topbar-title">Dashboard</div>
    <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
  </div>

  <div class="hero">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0">
      <div>
        <div class="hero-greeting">${saudacao}, ${nomeExib}</div>
        <div class="hero-name">SEUS<br><span>TREINOS.</span></div>
        <div class="hero-sub">Cada treino é uma escolha. Você escolheu bem.</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-top:4px">
        <div style="display:flex;border:1px solid var(--border2);border-radius:8px;overflow:hidden">
          <a href="/?u=renato" style="padding:8px 16px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;transition:all 0.15s;${usuario==='renato'?'background:var(--accent);color:#111':'color:var(--muted2)'}">RC</a>
          <a href="/?u=silvia" style="padding:8px 16px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;transition:all 0.15s;border-left:1px solid var(--border2);${usuario==='silvia'?'background:var(--accent);color:#111':'color:var(--muted2)'}">SI</a>
        </div>
        <a href="/?u=${outroUser}" style="font-size:10px;color:var(--muted);text-decoration:none;font-weight:700;letter-spacing:0.08em;font-family:'Outfit',sans-serif">VER ${outroNome} →</a>
      </div>
    </div>
    <div class="big-stats">
      <div class="big-stat">
        <div class="big-stat-val accent">${stats.streak}</div>
        <div class="big-stat-label">Dias ativos</div>
        <div class="big-stat-sub">nos últimos 30 dias</div>
      </div>
      <div class="big-stat">
        <div class="big-stat-val">${stats.total}</div>
        <div class="big-stat-label">Total de treinos</div>
        <div class="big-stat-sub">desde o início</div>
      </div>
      <div class="big-stat">
        <div class="big-stat-val">${pctSemana}<span style="font-size:24px;color:var(--muted2)">%</span></div>
        <div class="big-stat-label">Semana atual</div>
        <div class="big-stat-sub">${feitasSemana} de ${possiveisSemana} treinos</div>
      </div>
      <div class="big-stat">
        <div class="big-stat-val">${semanaPlano}<span style="font-size:24px;color:var(--muted2)">/8</span></div>
        <div class="big-stat-label">Plano corrida</div>
        <div class="big-stat-sub">${semanaPlano<=2?'Fase: Base':semanaPlano<=5?'Fase: Construção':'Fase: Consolidação'}</div>
      </div>
    </div>
  </div>

  <div class="main">

    <div style="margin-bottom:40px" id="semana">
      <div class="section-label">Semana atual</div>
      <div class="semana-scroll">
        <div class="semana-grid">${semanaCells}</div>
      </div>
      <div class="prog-labels">
        <span>${feitasSemana} DE ${possiveisSemana} TREINOS</span>
        <span style="color:var(--accent)">${pctSemana}%</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${pctSemana}%"></div></div>
    </div>

    <div class="two-col" style="margin-bottom:40px">
      <div class="card">
        <div class="section-label">Próximo treino</div>
        ${proximo?`
          <div class="proximo-when">${proximo.daqui===0?'HOJE':proximo.daqui===1?'AMANHÃ':proximo.dia}</div>
          <div class="proximo-big">${proximo.tipo}</div>
          <div class="proximo-hora">${proximo.horario}</div>
        `:'<div style="color:var(--muted);font-size:13px">Sem treinos previstos.</div>'}
      </div>
      <div class="card">
        <div class="section-label">Dica do dia</div>
        <div class="dica-text">"${dica.texto}"</div>
        <div class="dica-cat">#${dica.categoria}</div>
      </div>
    </div>

    <div class="three-col" style="margin-bottom:40px" id="corrida">
      <div class="card">
        <div class="section-label">${anoMes}</div>
        <div class="cal-hdr">${['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(x=>`<span>${x}</span>`).join('')}</div>
        <div class="cal-grid">${calCells.map(x=>calCell(x)).join('')}</div>
        <div style="display:flex;gap:16px;margin-top:12px">
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);font-weight:700;font-family:'Outfit',sans-serif;letter-spacing:0.08em">
            <div style="width:10px;height:10px;border-radius:3px;background:var(--accent)"></div>FEITO
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);font-weight:700;font-family:'Outfit',sans-serif;letter-spacing:0.08em">
            <div style="width:10px;height:10px;border-radius:3px;background:rgba(212,254,69,0.08);border:1px solid rgba(212,254,69,0.3)"></div>PENDENTE
          </div>
        </div>
      </div>
      <div class="card">
        <div class="section-label">Plano de corrida</div>
        <div style="background:var(--accent-dim);border:1px solid var(--accent-mid);border-radius:8px;padding:16px 18px;margin-bottom:16px">
          <div style="font-family:'Outfit',sans-serif;font-size:11px;font-weight:800;color:var(--accent);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px">SEMANA ${semanaPlano} DE 8</div>
          <div style="font-family:'Outfit',sans-serif;font-size:28px;font-weight:900;color:var(--accent);letter-spacing:-0.02em">${semanaPlano<=2?'BASE':semanaPlano<=5?'CONSTRUÇÃO':'CONSOLIDAÇÃO'}</div>
        </div>
        ${kmPorSemana.length>0?`
          <div style="display:flex;flex-direction:column;gap:8px">
            ${kmPorSemana.slice(-5).map(k=>{
              const pct=Math.min(Math.round((parseFloat(k.km)/10)*100),100);
              const dt=new Date(k.semana);
              return `<div>
                <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px;font-family:'Outfit',sans-serif;letter-spacing:0.06em">
                  <span>${dt.getDate()}/${dt.getMonth()+1}</span><span style="color:var(--accent)">${k.km}km</span>
                </div>
                <div style="background:#21253280;border-radius:2px;height:3px;overflow:hidden">
                  <div style="height:100%;background:var(--accent);width:${pct}%;border-radius:2px"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        `:`<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:12px;font-family:'Outfit',sans-serif;letter-spacing:0.08em">REGISTRE SUA PRIMEIRA CORRIDA</div>`}
      </div>
    </div>

    <div class="reg-section" id="registro">
      <div class="reg-head">
        <div>
          <div class="reg-head-title">REGISTRAR TREINO</div>
          <div class="reg-head-sub">Como foi hoje?</div>
        </div>
      </div>
      <div class="reg-body">
        <div>
          <form method="POST" action="/treino" id="formTreino">
            <input type="hidden" name="concluido" value="true">
            <input type="hidden" name="tipo" id="tipoHidden">
            <input type="hidden" name="usuario" value="${usuario}">
            <input type="hidden" name="redirect_u" value="${usuario}">
            <div style="margin-bottom:20px">
              <div class="field-label">Qual treino?</div>
              <div class="tipo-grid">
                ${[
                  {val:'Corrida leve',icon:'🏃',nome:'CORRIDA'},
                  {val:'Academia — sup. A',icon:'💪',nome:'SUP. A'},
                  {val:'Academia — sup. B',icon:'💪',nome:'SUP. B'},
                  {val:'Academia — inf.',icon:'🦵',nome:'INFERIOR'},
                  {val:'Beach tennis',icon:'🎾',nome:'BEACH'},
                ].map(t=>`<label class="tipo-btn" onclick="selectTipo(this,'${t.val}')">
                  <div class="tipo-btn-icon">${t.icon}</div>
                  <div class="tipo-btn-nome">${t.nome}</div>
                </label>`).join('')}
              </div>
            </div>
            <div style="margin-bottom:20px">
              <div class="field-label">Data</div>
              <input type="date" name="data" value="${hojeS}" class="field-input" style="max-width:180px">
            </div>
            <div style="margin-bottom:20px">
              <div class="field-label">Detalhes</div>
              <div class="fields-2">
                <input type="number" name="duracao_min" placeholder="Duração (min)" class="field-input" min="1" max="300">
                <input type="number" name="distancia_km" placeholder="Distância (km)" class="field-input" min="0" max="50" step="0.1">
              </div>
            </div>
            <button type="submit" class="btn-save">SALVAR TREINO</button>
          </form>
        </div>
        <div>
          <div style="margin-bottom:20px">
            <div class="field-label">Como você se sentiu?</div>
            <div class="humor-row">
              ${[{v:'ótimo',i:'🔥'},{v:'bem',i:'😊'},{v:'ok',i:'😐'},{v:'cansado',i:'😓'},{v:'difícil',i:'😤'}]
                .map(h=>`<label class="humor-btn" onclick="selectHumor(this,'${h.v}')">${h.i}</label>`).join('')}
            </div>
            <input type="hidden" id="humorHidden">
          </div>
          <div>
            <div class="field-label">Observações</div>
            <textarea name="nota" class="field-input" id="notaField" form="formTreino"
              placeholder="Como foi? Joelho ok? Ritmo bom? Qualquer coisa que queira lembrar..."></textarea>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<div id="notif"></div>

<div class="bottom-nav">
  <a href="/?u=${usuario}" class="bottom-nav-item active">
    <div class="bottom-nav-icon">DB</div>
    <div class="bottom-nav-label">Home</div>
  </a>
  <a href="/metas?u=${usuario}" class="bottom-nav-item">
    <div class="bottom-nav-icon">MT</div>
    <div class="bottom-nav-label">Metas</div>
  </a>
  <a href="/duelo" class="bottom-nav-item">
    <div class="bottom-nav-icon">⚔</div>
    <div class="bottom-nav-label">Duelo</div>
  </a>
  <a href="#registro" class="bottom-nav-item">
    <div class="bottom-nav-icon">+</div>
    <div class="bottom-nav-label">Registrar</div>
  </a>
</div>

<script>
function selectTipo(el,val){
  document.querySelectorAll('.tipo-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('tipoHidden').value=val;
}
function selectHumor(el,val){
  document.querySelectorAll('.humor-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  const nota=document.getElementById('notaField');
  const cur=nota.value.replace(/^\[.*?\]\s*/,'');
  nota.value='['+val+'] '+cur;
}
const USUARIO_ATIVO = '${usuario}';
function toggleTreino(data,tipo){
  fetch('/treino/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,tipo,usuario:USUARIO_ATIVO})})
  .then(r=>r.json()).then(res=>{
    showNotif(res.concluido?'TREINO CONCLUÍDO ✓':'TREINO DESMARCADO');
    setTimeout(()=>location.reload(),800);
  });
}
function showNotif(msg){
  const el=document.getElementById('notif');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2500);
}
document.getElementById('formTreino').addEventListener('submit',function(e){
  if(!document.getElementById('tipoHidden').value){
    e.preventDefault(); showNotif('SELECIONA O TREINO PRIMEIRO');
  }
});
</script>
</body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem;color:#fff;background:#111">'+e.message+'</pre>');
  }
});

// ── ROTA /metas ───────────────────────────────────────────────────────────────
app.get('/metas', async (req, res) => {
  try {
    const usuario = req.query.u === 'silvia' ? 'silvia' : 'renato';
    const nomeExib = usuario === 'silvia' ? 'SILVIA' : 'RENATO';
    const outroUser = usuario === 'silvia' ? 'renato' : 'silvia';
    const outroNome = usuario === 'silvia' ? 'RENATO' : 'SILVIA';
    const m = await getMetas(usuario);
    const hoje = new Date();

    const pctTreinos  = Math.min(Math.round((m.treinosSemAtual/5)*100),100);
    const pctKm       = Math.min(Math.round((m.maiorKm/10)*100),100);
    const pctStreak   = Math.min(Math.round((m.streak_atual||0)/20*100),100);
    const pctMin      = Math.min(Math.round((m.minMes/600)*100),100);

    // Streak atual
    const { rows: sRows } = await pool.query(`SELECT COUNT(DISTINCT data) as s FROM treinos WHERE concluido=true AND usuario=$1 AND data>=CURRENT_DATE-INTERVAL '30 days'`,[usuario]);
    const streakAtual = parseInt(sRows[0].s||0);
    const pctStreakReal = Math.min(Math.round((streakAtual/20)*100),100);

    const MESES_SHORT2 = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

    const labSemTreinos = m.semTreinos.slice(-10).map(r=>{const d=new Date(r.semana);return `${d.getDate()}/${d.getMonth()+1}`;});
    const datSemTreinos = m.semTreinos.slice(-10).map(r=>parseInt(r.feitos));
    const labCorrida    = m.corridaHist.slice(-10).map(r=>{const d=new Date(r.semana);return `${d.getDate()}/${d.getMonth()+1}`;});
    const datCorrida    = m.corridaHist.slice(-10).map(r=>parseFloat(r.max_km||0).toFixed(1));
    const labMin        = m.minMesList.map(r=>{const d=new Date(r.mes);return MESES_SHORT2[d.getMonth()];});
    const datMin        = m.minMesList.map(r=>parseInt(r.min));
    const labStreak     = m.streakMes.slice(-6).map(r=>{const d=new Date(r.mes);return MESES_SHORT2[d.getMonth()];});
    const datStreak     = m.streakMes.slice(-6).map(r=>parseInt(r.dias));

    // Heatmap
    const heatMap={};
    for(const r of m.heatRows) heatMap[r.data.slice(0,10)]=parseInt(r.feitos);
    const heatCells=[];
    for(let i=180;i>=0;i--){
      const d=new Date(hoje);d.setDate(d.getDate()-i);
      heatCells.push({ds:d.toISOString().slice(0,10),n:heatMap[d.toISOString().slice(0,10)]||0});
    }
    const heatWeeks=[];let wk=[];
    const fo=heatCells[0]?new Date(heatCells[0].ds).getDay():0;
    for(let i=0;i<(fo===0?0:fo);i++) wk.push(null);
    for(const c of heatCells){wk.push(c);if(wk.length===7){heatWeeks.push(wk);wk=[];}}
    if(wk.length){while(wk.length<7)wk.push(null);heatWeeks.push(wk);}

    function heatClr(n){
      if(!n)return'rgba(255,255,255,0.04)';
      if(n>=3)return'#D4FE45';
      if(n>=2)return'rgba(212,254,69,0.6)';
      return'rgba(212,254,69,0.25)';
    }

    const heatHTML=heatWeeks.map(w=>`<div style="display:flex;flex-direction:column;gap:3px">${w.map(c=>c?`<div style="width:12px;height:12px;border-radius:2px;background:${heatClr(c.n)}" title="${c.ds}"></div>`:`<div style="width:12px;height:12px"></div>`).join('')}</div>`).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metas · Renato</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>${SHARED_CSS}
.metas-hero{padding:48px 32px 40px;border-bottom:1px solid var(--border)}
.metas-hero-label{font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--muted);margin-bottom:6px;font-family:'Outfit',sans-serif}
.metas-hero-title{font-family:'Outfit',sans-serif;font-size:52px;font-weight:900;color:var(--text);letter-spacing:-0.03em;line-height:1;margin-bottom:24px}
.metas-hero-title span{color:var(--accent)}
.metas-row{display:flex;gap:0;border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.meta-big{flex:1;padding:28px;border-right:1px solid var(--border);position:relative;overflow:hidden}
.meta-big:last-child{border-right:none}
.meta-big-pct{font-family:'Outfit',sans-serif;font-size:56px;font-weight:900;letter-spacing:-0.03em;line-height:1;color:var(--text)}
.meta-big-pct.hit{color:var(--accent)}
.meta-big-pct sup{font-size:24px;color:var(--muted2)}
.meta-big-label{font-size:9px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-top:8px;font-family:'Outfit',sans-serif}
.meta-big-atual{font-size:12px;color:var(--muted2);margin-top:4px;font-weight:600}
.meta-bar-mini{position:absolute;bottom:0;left:0;right:0;height:3px;background:#21253280}
.meta-bar-mini-fill{height:100%;background:var(--accent);transition:width 0.8s}
.section-label{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:20px;display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:28px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.chart-wrap{position:relative;height:180px;margin-top:8px}
.heat-wrap{overflow-x:auto;padding-bottom:8px}
.heat-inner{display:flex;gap:3px;min-width:fit-content}
.heat-leg{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.1em;font-family:'Outfit',sans-serif}
.heat-leg-cells{display:flex;gap:3px}
.insight-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}
.insight{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:24px}
.insight-val{font-family:'Outfit',sans-serif;font-size:36px;font-weight:900;letter-spacing:-0.02em;color:var(--text);line-height:1}
.insight-val.accent{color:var(--accent)}
.insight-label{font-size:9px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-top:8px;font-family:'Outfit',sans-serif}
.insight-badge{display:inline-block;margin-top:8px;font-size:9px;font-weight:800;letter-spacing:0.1em;padding:3px 8px;border-radius:3px;font-family:'Outfit',sans-serif;text-transform:uppercase}
.badge-ok{background:var(--accent-dim);color:var(--accent)}
.badge-go{background:rgba(255,255,255,0.06);color:var(--muted2)}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark"><div class="logo-dot"></div><div class="logo-text">TREINOS</div></div>
    <div class="logo-sub">Renato Campos</div>
  </div>
  <div class="sidebar-nav">
    <div class="nav-group">
      <div class="nav-label">Menu</div>
      <a href="/?u=${usuario}" class="nav-item"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas?u=${usuario}" class="nav-item active"><span class="nav-icon">MT</span>Metas</a>
      <a href="/historico?u=${usuario}" class="nav-item"><span class="nav-icon">HT</span>Histórico</a>
      <a href="/duelo" class="nav-item"><span class="nav-icon">⚔</span>Duelo</a>
    </div>
    <div class="nav-group">
      <div class="nav-label">Atividades</div>
      <a href="/" class="nav-item"><span class="nav-icon">SM</span>Semana</a>
      <a href="/" class="nav-item"><span class="nav-icon">RN</span>Corrida</a>
      <a href="/#registro" class="nav-item"><span class="nav-icon">+</span>Registrar</a>
    </div>
  </div>
  <div class="sidebar-foot">
    <div class="user-row">
      <div class="user-av">RC</div>
      <div><div class="user-name">Renato</div><div class="user-loc">Niterói, RJ</div></div>
    </div>
  </div>
</div>

<div class="content">
  <div class="topbar">
    <div class="topbar-title">METAS · ${nomeExib}</div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="display:flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden">
        <a href="/metas?u=renato" style="padding:6px 12px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;${usuario==='renato'?'background:var(--accent);color:#111':'color:var(--muted2)'}">RC</a>
        <a href="/metas?u=silvia" style="padding:6px 12px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;border-left:1px solid var(--border2);${usuario==='silvia'?'background:var(--accent);color:#111':'color:var(--muted2)'}">SI</a>
      </div>
      <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
    </div>
  </div>

  <div class="metas-hero">
    <div class="metas-hero-label">ACOMPANHAMENTO</div>
    <div class="metas-hero-title">SUAS<br><span>METAS.</span></div>
    <div class="metas-row">
      ${[
        {pct:pctTreinos,  label:'TREINOS / SEMANA', atual:`${m.treinosSemAtual} de 5`, hit:pctTreinos>=100},
        {pct:pctKm,       label:'MAIOR CORRIDA',    atual:`${m.maiorKm.toFixed(1)}km → meta 10km`, hit:pctKm>=100},
        {pct:pctStreakReal,label:'STREAK 30 DIAS',  atual:`${streakAtual} de 20 dias`, hit:pctStreakReal>=100},
        {pct:pctMin,      label:'MINUTOS / MÊS',    atual:`${m.minMes} de 600 min`, hit:pctMin>=100},
      ].map(meta=>`
      <div class="meta-big">
        <div class="meta-big-pct ${meta.hit?'hit':''}">${meta.pct}<sup>%</sup></div>
        <div class="meta-big-label">${meta.label}</div>
        <div class="meta-big-atual">${meta.atual}</div>
        <div class="meta-bar-mini"><div class="meta-bar-mini-fill" style="width:${meta.pct}%"></div></div>
      </div>`).join('')}
    </div>
  </div>

  <div class="main">

    <div class="insight-row">
      <div class="insight">
        <div class="insight-val ${m.semanasCorrida>=8?'accent':''}">${m.semanasCorrida}<span style="font-size:18px;color:var(--muted2)">/8</span></div>
        <div class="insight-label">Semanas do plano</div>
        <div class="insight-badge ${m.semanasCorrida>=8?'badge-ok':'badge-go'}">${m.semanasCorrida>=8?'CONCLUÍDO':'FALTAM '+(8-m.semanasCorrida)}</div>
      </div>
      <div class="insight">
        <div class="insight-val">${m.maiorKm>0?m.maiorKm.toFixed(1):'—'}<span style="font-size:18px;color:var(--muted2)">km</span></div>
        <div class="insight-label">Recorde de corrida</div>
        <div class="insight-badge badge-go">${m.avgKm>0?'MÉDIA '+m.avgKm.toFixed(1)+'KM':'SEM REGISTROS'}</div>
      </div>
      <div class="insight">
        <div class="insight-val ${m.minMes>=600?'accent':''}">${Math.floor(m.minMes/60)}<span style="font-size:18px;color:var(--muted2)">h${m.minMes%60}min</span></div>
        <div class="insight-label">Horas este mês</div>
        <div class="insight-badge ${m.minMes>=600?'badge-ok':'badge-go'}">${m.minMes>=600?'META ATINGIDA':'FALTAM '+(600-m.minMes)+'MIN'}</div>
      </div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:32px;margin-bottom:20px">
      <div class="section-label">Velocímetro de metas</div>
      <div class="gauge-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        ${[
          {id:'g0', pct:pctTreinos,  val:m.treinosSemAtual+'', unit:'treinos', label:'SEMANA'},
          {id:'g1', pct:pctKm,       val:m.maiorKm.toFixed(1), unit:'km',      label:'CORRIDA'},
          {id:'g2', pct:pctStreakReal,val:streakAtual+'',       unit:'dias',    label:'STREAK'},
          {id:'g3', pct:pctMin,      val:m.minMes+'',          unit:'min',     label:'MINUTOS'},
        ].map((g,i)=>`
        <div class="gauge-item" style="padding:32px 20px;text-align:center;${i<3?'border-right:1px solid var(--border)':''}">
          <canvas id="${g.id}" width="180" height="100" style="width:180px;height:100px;max-width:100%"></canvas>
          <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:900;color:${g.pct>=100?'var(--accent)':'var(--text)'};letter-spacing:-0.02em;line-height:1;margin-top:12px">${g.val}<span style="font-size:14px;color:var(--muted2);font-weight:600"> ${g.unit}</span></div>
          <div style="font-size:9px;font-weight:800;letter-spacing:0.16em;color:var(--muted);margin-top:6px;font-family:'Outfit',sans-serif">${g.label}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="section-label">Treinos por semana <span style="color:var(--accent);margin-left:8px;font-size:9px">META: 5</span></div>
        <div class="chart-wrap"><canvas id="cTreinos"></canvas></div>
      </div>
      <div class="card">
        <div class="section-label">Evolução corrida <span style="color:var(--accent);margin-left:8px;font-size:9px">META: 10KM</span></div>
        <div class="chart-wrap"><canvas id="cCorrida"></canvas></div>
      </div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="section-label">Minutos por mês <span style="color:var(--accent);margin-left:8px;font-size:9px">META: 600MIN</span></div>
        <div class="chart-wrap"><canvas id="cMin"></canvas></div>
      </div>
      <div class="card">
        <div class="section-label">Dias ativos por mês <span style="color:var(--accent);margin-left:8px;font-size:9px">META: 20 DIAS</span></div>
        <div class="chart-wrap"><canvas id="cStreak"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="section-label">Atividade — últimos 6 meses</div>
      <div class="heat-wrap">
        <div class="heat-inner">${heatHTML}</div>
      </div>
      <div class="heat-leg">
        MENOS
        <div class="heat-leg-cells">
          ${['rgba(255,255,255,0.04)','rgba(212,254,69,0.25)','rgba(212,254,69,0.6)','#D4FE45'].map(c=>`<div style="width:12px;height:12px;border-radius:2px;background:${c}"></div>`).join('')}
        </div>
        MAIS
      </div>
    </div>

  </div>
</div>

<div class="bottom-nav">
  <a href="/?u=${usuario}" class="bottom-nav-item">
    <div class="bottom-nav-icon">DB</div>
    <div class="bottom-nav-label">Home</div>
  </a>
  <a href="/metas?u=${usuario}" class="bottom-nav-item active">
    <div class="bottom-nav-icon">MT</div>
    <div class="bottom-nav-label">Metas</div>
  </a>
  <a href="/duelo" class="bottom-nav-item">
    <div class="bottom-nav-icon">⚔</div>
    <div class="bottom-nav-label">Duelo</div>
  </a>
  <a href="/?u=${usuario}#registro" class="bottom-nav-item">
    <div class="bottom-nav-icon">+</div>
    <div class="bottom-nav-label">Registrar</div>
  </a>
</div>

<script>
Chart.defaults.font.family="'DM Sans',system-ui,sans-serif";
Chart.defaults.color='#5A5A6A';

// GAUGES
function drawGauge(id, pct) {
  const canvas = document.getElementById(id);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const cx = W/2, cy = H - 8;
  const r = Math.min(W, H*2) * 0.44;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const fillAngle = startAngle + (Math.PI * Math.min(pct,100) / 100);

  // Traços do velocímetro
  const totalTicks = 40;
  for(let i=0; i<=totalTicks; i++) {
    const angle = Math.PI + (Math.PI * i / totalTicks);
    const tickPct = i / totalTicks * 100;
    const isLit = tickPct <= pct;
    const isMajor = i % 5 === 0;
    const innerR = r + (isMajor ? 10 : 14);
    const outerR = r + (isMajor ? 22 : 20);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + innerR*cos, cy + innerR*sin);
    ctx.lineTo(cx + outerR*cos, cy + outerR*sin);
    ctx.strokeStyle = isLit ? '#D4FE45' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isMajor ? 2.5 : 1.5;
    ctx.stroke();
  }

  // Arco de fundo
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Arco preenchido
  if(pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, fillAngle);
    ctx.strokeStyle = pct >= 100 ? '#D4FE45' : 'rgba(212,254,69,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Percentual no centro
  ctx.font = "700 13px 'Outfit', sans-serif";
  ctx.fillStyle = pct >= 100 ? '#D4FE45' : 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(pct) + '%', cx, cy - r * 0.15);
}

drawGauge('g0', ${pctTreinos});
drawGauge('g1', ${pctKm});
drawGauge('g2', ${pctStreakReal});
drawGauge('g3', ${pctMin});


const cfg = {
  responsive:true, maintainAspectRatio:false,
  plugins:{legend:{display:false}},
  scales:{
    x:{grid:{display:false},ticks:{font:{size:10}}},
    y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{font:{size:10}}}
  }
};

new Chart(document.getElementById('cTreinos'),{type:'bar',data:{
  labels:${JSON.stringify(labSemTreinos.length?labSemTreinos:['—'])},
  datasets:[
    {data:${JSON.stringify(datSemTreinos.length?datSemTreinos:[0])},backgroundColor:'rgba(212,254,69,0.15)',borderColor:'#D4FE45',borderWidth:1.5,borderRadius:4},
    {data:${JSON.stringify((labSemTreinos.length?labSemTreinos:['—']).map(()=>5))},type:'line',borderColor:'rgba(212,254,69,0.4)',borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
  ]
},options:{...cfg,scales:{x:{...cfg.scales.x},y:{...cfg.scales.y,beginAtZero:true,max:7,ticks:{stepSize:1,font:{size:10}}}}}});

new Chart(document.getElementById('cCorrida'),{type:'line',data:{
  labels:${JSON.stringify(labCorrida.length?labCorrida:['—'])},
  datasets:[
    {data:${JSON.stringify(datCorrida.length?datCorrida:[0])},borderColor:'#D4FE45',backgroundColor:'rgba(212,254,69,0.06)',borderWidth:2,pointBackgroundColor:'#D4FE45',pointRadius:3,fill:true,tension:0.4},
    {data:${JSON.stringify((labCorrida.length?labCorrida:['—']).map(()=>10))},borderColor:'rgba(212,254,69,0.3)',borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
  ]
},options:{...cfg,scales:{x:{...cfg.scales.x},y:{...cfg.scales.y,beginAtZero:true,max:12,ticks:{callback:v=>v+'km',font:{size:10}}}}}});

new Chart(document.getElementById('cMin'),{type:'bar',data:{
  labels:${JSON.stringify(labMin.length?labMin:['—'])},
  datasets:[
    {data:${JSON.stringify(datMin.length?datMin:[0])},backgroundColor:'rgba(212,254,69,0.15)',borderColor:'#D4FE45',borderWidth:1.5,borderRadius:4},
    {data:${JSON.stringify((labMin.length?labMin:['—']).map(()=>600))},type:'line',borderColor:'rgba(212,254,69,0.4)',borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
  ]
},options:{...cfg,scales:{x:{...cfg.scales.x},y:{...cfg.scales.y,beginAtZero:true,ticks:{callback:v=>v+'min',font:{size:10}}}}}});

new Chart(document.getElementById('cStreak'),{type:'line',data:{
  labels:${JSON.stringify(labStreak.length?labStreak:['—'])},
  datasets:[
    {data:${JSON.stringify(datStreak.length?datStreak:[0])},borderColor:'#D4FE45',backgroundColor:'rgba(212,254,69,0.06)',borderWidth:2,pointBackgroundColor:'#D4FE45',pointRadius:3,fill:true,tension:0.4},
    {data:${JSON.stringify((labStreak.length?labStreak:['—']).map(()=>20))},borderColor:'rgba(212,254,69,0.3)',borderWidth:1.5,borderDash:[4,4],pointRadius:0,fill:false}
  ]
},options:{...cfg,scales:{x:{...cfg.scales.x},y:{...cfg.scales.y,beginAtZero:true,max:31,ticks:{stepSize:5,font:{size:10}}}}}});
</script>
</body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem;color:#fff;background:#111">'+e.message+'</pre>');
  }
});

// ── TOGGLES E POSTS ──────────────────────────────────────────────────────────
app.post('/treino', async (req, res) => {
  const { data, tipo, concluido, nota, duracao_min, distancia_km, usuario='renato', redirect_u='renato' } = req.body;
  try {
    const ex = await pool.query('SELECT id FROM treinos WHERE data=$1 AND tipo=$2 AND usuario=$3',[data,tipo,usuario]);
    if(ex.rows.length)
      await pool.query('UPDATE treinos SET concluido=$1,nota=$2,duracao_min=$3,distancia_km=$4 WHERE id=$5',
        [concluido==='true',nota||null,duracao_min||null,distancia_km||null,ex.rows[0].id]);
    else
      await pool.query('INSERT INTO treinos (data,tipo,concluido,nota,duracao_min,distancia_km,usuario) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [data,tipo,concluido==='true',nota||null,duracao_min||null,distancia_km||null,usuario]);
    res.redirect('/?u='+redirect_u);
  } catch(e){res.status(500).send(e.message);}
});

app.post('/treino/toggle', async (req, res) => {
  const { data, tipo, usuario='renato' } = req.body;
  try {
    const ex = await pool.query('SELECT id,concluido FROM treinos WHERE data=$1 AND tipo=$2 AND usuario=$3',[data,tipo,usuario]);
    if(ex.rows.length){
      const novo=!ex.rows[0].concluido;
      await pool.query('UPDATE treinos SET concluido=$1 WHERE id=$2',[novo,ex.rows[0].id]);
      res.json({ok:true,concluido:novo});
    } else {
      await pool.query('INSERT INTO treinos (data,tipo,concluido,usuario) VALUES ($1,$2,true,$3)',[data,tipo,usuario]);
      res.json({ok:true,concluido:true});
    }
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── ROTA /historico ───────────────────────────────────────────────────────────
app.get('/historico', async (req, res) => {
  try {
    const usuario = req.query.u === 'silvia' ? 'silvia' : 'renato';
    const nomeExib = usuario === 'silvia' ? 'SILVIA' : 'RENATO';
    const outroUser = usuario === 'silvia' ? 'renato' : 'silvia';
    const outroNome = usuario === 'silvia' ? 'RENATO' : 'SILVIA';
    const { rows } = await pool.query(`
      SELECT id, data::text, tipo, concluido, nota, duracao_min, distancia_km
      FROM treinos WHERE usuario=$1 ORDER BY data DESC, id DESC LIMIT 100
    `,[usuario]);

    const editId = req.query.edit ? parseInt(req.query.edit) : null;

    const linhas = rows.map(t => {
      const ds = t.data.slice(0,10);
      const dataFmt = new Date(ds+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
      const isFuture = ds > hojeStr();
      const isEdit = editId === t.id;

      if (isEdit) {
        return `
        <tr style="background:rgba(212,254,69,0.06);border-bottom:1px solid rgba(212,254,69,0.2)">
          <form method="POST" action="/treino/edit" style="display:contents">
            <input type="hidden" name="id" value="${t.id}">
            <td style="padding:14px 16px;font-size:11px;color:var(--muted)">
              <input type="date" name="data" value="${ds}" class="field-input" style="width:150px;font-size:12px;padding:6px 10px">
            </td>
            <td style="padding:14px 16px">
              <select name="tipo" class="field-input" style="font-size:12px;padding:6px 10px">
                ${['Corrida leve','Academia — sup. A','Academia — sup. B','Academia — inf.','Beach tennis']
                  .map(op=>`<option value="${op}" ${t.tipo===op?'selected':''}>${op}</option>`).join('')}
              </select>
            </td>
            <td style="padding:14px 16px">
              <select name="concluido" class="field-input" style="font-size:12px;padding:6px 10px">
                <option value="true" ${t.concluido?'selected':''}>Feito</option>
                <option value="false" ${!t.concluido?'selected':''}>Não feito</option>
              </select>
            </td>
            <td style="padding:14px 16px">
              <input type="number" name="duracao_min" value="${t.duracao_min||''}" placeholder="min" class="field-input" style="width:80px;font-size:12px;padding:6px 10px">
            </td>
            <td style="padding:14px 16px">
              <input type="number" name="distancia_km" value="${t.distancia_km||''}" placeholder="km" step="0.1" class="field-input" style="width:80px;font-size:12px;padding:6px 10px">
            </td>
            <td style="padding:14px 16px">
              <input type="text" name="nota" value="${t.nota||''}" placeholder="nota..." class="field-input" style="font-size:12px;padding:6px 10px">
            </td>
            <td style="padding:14px 16px;white-space:nowrap">
              <button type="submit" style="background:var(--accent);color:#111;border:none;border-radius:5px;padding:7px 14px;font-size:10px;font-weight:800;cursor:pointer;letter-spacing:0.08em;font-family:'Outfit',sans-serif">SALVAR</button>
              <a href="/historico" style="margin-left:8px;font-size:10px;color:var(--muted);font-weight:700;text-decoration:none;letter-spacing:0.06em">CANCELAR</a>
            </td>
          </form>
        </tr>`;
      }

      return `
      <tr style="border-bottom:1px solid var(--border);${isFuture?'opacity:0.5':''}">
        <td style="padding:14px 16px;font-size:11px;font-weight:700;color:${isFuture?'#EF4444':'var(--muted)'};font-family:'Outfit',sans-serif;letter-spacing:0.06em;white-space:nowrap">
          ${dataFmt}${isFuture?' <span style="font-size:8px;background:rgba(239,68,68,0.15);color:#EF4444;padding:2px 5px;border-radius:3px;font-family:Outfit,sans-serif">FUTURO</span>':''}
        </td>
        <td style="padding:14px 16px;font-size:12px;font-weight:600;color:var(--text)">${t.tipo}</td>
        <td style="padding:14px 16px">
          <span style="font-size:9px;font-weight:800;letter-spacing:0.08em;padding:3px 8px;border-radius:3px;font-family:'Outfit',sans-serif;${t.concluido?'background:var(--accent-dim);color:var(--accent)':'background:rgba(255,255,255,0.05);color:var(--muted)'}">${t.concluido?'FEITO':'PENDENTE'}</span>
        </td>
        <td style="padding:14px 16px;font-size:11px;color:var(--muted)">${t.duracao_min?t.duracao_min+'min':'—'}</td>
        <td style="padding:14px 16px;font-size:11px;color:var(--muted)">${t.distancia_km?parseFloat(t.distancia_km).toFixed(1)+'km':'—'}</td>
        <td style="padding:14px 16px;font-size:11px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.nota||'—'}</td>
        <td style="padding:14px 16px;white-space:nowrap">
          <a href="/historico?edit=${t.id}" style="font-size:10px;font-weight:800;color:var(--muted2);text-decoration:none;letter-spacing:0.08em;font-family:'Outfit',sans-serif;margin-right:12px">EDITAR</a>
          <form method="POST" action="/treino/delete" style="display:inline" onsubmit="return confirm('Deletar este treino?')">
            <input type="hidden" name="id" value="${t.id}">
            <button type="submit" style="background:none;border:none;font-size:10px;font-weight:800;color:#EF4444;cursor:pointer;letter-spacing:0.08em;font-family:'Outfit',sans-serif;padding:0">DELETAR</button>
          </form>
        </td>
      </tr>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Histórico · Renato</title>
<style>${SHARED_CSS}
.field-input{border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:13px;font-family:'DM Sans',sans-serif;background:#21253280;color:var(--text);outline:none;transition:border-color 0.15s}
.field-input:focus{border-color:var(--accent)}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px 16px;font-size:9px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);font-family:'Outfit',sans-serif}
tr:hover td{background:rgba(255,255,255,0.015)}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark"><div class="logo-dot"></div><div class="logo-text">TREINOS</div></div>
    <div class="logo-sub">Renato Campos</div>
  </div>
  <div class="sidebar-nav">
    <div class="nav-group">
      <div class="nav-label">Menu</div>
      <a href="/?u=${usuario}" class="nav-item"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas?u=${usuario}" class="nav-item"><span class="nav-icon">MT</span>Metas</a>
      <a href="/historico?u=${usuario}" class="nav-item active"><span class="nav-icon">HT</span>Histórico</a>
      <a href="/duelo" class="nav-item"><span class="nav-icon">⚔</span>Duelo</a>
    </div>
    <div class="nav-group">
      <div class="nav-label">Atividades</div>
      <a href="/#semana" class="nav-item"><span class="nav-icon">SM</span>Semana</a>
      <a href="/#corrida" class="nav-item"><span class="nav-icon">RN</span>Corrida</a>
      <a href="/#registro" class="nav-item"><span class="nav-icon">+</span>Registrar</a>
    </div>
  </div>
  <div class="sidebar-foot">
    <div class="user-row">
      <div class="user-av">RC</div>
      <div><div class="user-name">Renato</div><div class="user-loc">Niterói, RJ</div></div>
    </div>
  </div>
</div>

<div class="content">
  <div class="topbar">
    <div class="topbar-title">HISTÓRICO · ${nomeExib}</div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="display:flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden">
        <a href="/historico?u=renato" style="padding:6px 12px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;${usuario==='renato'?'background:var(--accent);color:#111':'color:var(--muted2)'}">RC</a>
        <a href="/historico?u=silvia" style="padding:6px 12px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-decoration:none;font-family:'Outfit',sans-serif;border-left:1px solid var(--border2);${usuario==='silvia'?'background:var(--accent);color:#111':'color:var(--muted2)'}">SI</a>
      </div>
      <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
    </div>
  </div>
  <div class="main">
    <div style="margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="font-family:'Outfit',sans-serif;font-size:42px;font-weight:900;color:var(--text);letter-spacing:-0.02em;line-height:1">HISTÓRICO<span style="color:var(--accent)">.</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">Últimos 100 treinos registrados. Clique em Editar para corrigir ou Deletar para remover.</div>
      </div>
      ${rows.some(t=>t.data.slice(0,10)>hojeStr())?`
      <form method="POST" action="/treino/delete-futuros" onsubmit="return confirm('Deletar todos os treinos com data futura?')">
        <button type="submit" style="background:rgba(239,68,68,0.12);color:#EF4444;border:1px solid rgba(239,68,68,0.25);border-radius:6px;padding:10px 18px;font-size:10px;font-weight:800;cursor:pointer;letter-spacing:0.1em;font-family:'Outfit',sans-serif">
          DELETAR TODOS OS FUTUROS
        </button>
      </form>`:''}
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
      <table>
        <thead><tr>
          <th>Data</th><th>Treino</th><th>Status</th><th>Duração</th><th>Distância</th><th>Nota</th><th>Ações</th>
        </tr></thead>
        <tbody>${linhas||'<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--muted);font-size:13px">Nenhum treino registrado ainda.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</div>
<div class="bottom-nav">
  <a href="/?u=${usuario}" class="bottom-nav-item">
    <div class="bottom-nav-icon">DB</div>
    <div class="bottom-nav-label">Home</div>
  </a>
  <a href="/metas?u=${usuario}" class="bottom-nav-item">
    <div class="bottom-nav-icon">MT</div>
    <div class="bottom-nav-label">Metas</div>
  </a>
  <a href="/duelo" class="bottom-nav-item">
    <div class="bottom-nav-icon">⚔</div>
    <div class="bottom-nav-label">Duelo</div>
  </a>
  <a href="/?u=${usuario}#registro" class="bottom-nav-item">
    <div class="bottom-nav-icon">+</div>
    <div class="bottom-nav-label">Registrar</div>
  </a>
</div>
</body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem;color:#fff;background:#111">'+e.message+'</pre>');
  }
});

app.post('/treino/delete', async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM treinos WHERE id=$1', [parseInt(id)]);
    res.redirect('/historico');
  } catch(e) { res.status(500).send(e.message); }
});

app.post('/treino/delete-futuros', async (req, res) => {
  try {
    await pool.query('DELETE FROM treinos WHERE data > CURRENT_DATE');
    res.redirect('/historico');
  } catch(e) { res.status(500).send(e.message); }
});

app.post('/treino/edit', async (req, res) => {
  const { id, data, tipo, concluido, nota, duracao_min, distancia_km } = req.body;
  try {
    await pool.query(
      'UPDATE treinos SET data=$1,tipo=$2,concluido=$3,nota=$4,duracao_min=$5,distancia_km=$6 WHERE id=$7',
      [data, tipo, concluido==='true', nota||null, duracao_min||null, distancia_km||null, parseInt(id)]
    );
    res.redirect('/historico');
  } catch(e) { res.status(500).send(e.message); }
});

// ── ROTA /duelo ───────────────────────────────────────────────────────────────
app.get('/duelo', async (req, res) => {
  try {
    const hoje = new Date();
    const semana = semanaAtual();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
    const inicioAno = new Date(hoje.getFullYear(), 0, 1).toISOString().slice(0,10);

    // Treinos esperados por semana em cada rotina
    const ESPERADO_SEMANA = { renato: 6, silvia: 6 };
    // Dias corridos desde segunda desta semana até hoje (para calcular esperado parcial da semana)
    const diasDecorridos = Math.min(Math.floor((new Date() - new Date(semana.inicio)) / 86400000) + 1, 7);
    // Semanas completas desde início do mês
    const diasMes = Math.floor((new Date() - new Date(inicioMes)) / 86400000) + 1;
    const semanasMes = diasMes / 7;

    const queries = [
      // Feitos esta semana por usuario
      pool.query(`SELECT usuario, COUNT(*) as total FROM treinos WHERE concluido=true AND data>=$1 AND data<=$2 GROUP BY usuario`,[semana.inicio,semana.fim]),
      // Feitos este mês por usuario
      pool.query(`SELECT usuario, COUNT(*) as total FROM treinos WHERE concluido=true AND data>=$1 GROUP BY usuario`,[inicioMes]),
      // Streak 30 dias
      pool.query(`SELECT usuario, COUNT(DISTINCT data) as total FROM treinos WHERE concluido=true AND data>=CURRENT_DATE-INTERVAL '30 days' GROUP BY usuario`),
      // Minutos este mês
      pool.query(`SELECT usuario, COALESCE(SUM(duracao_min),0) as total FROM treinos WHERE concluido=true AND data>=$1 GROUP BY usuario`,[inicioMes]),
      // Beach tennis este mês
      pool.query(`SELECT usuario, COUNT(*) as total FROM treinos WHERE concluido=true AND tipo ILIKE '%beach%' AND data>=$1 GROUP BY usuario`,[inicioMes]),
      // Academia este mês
      pool.query(`SELECT usuario, COUNT(*) as total FROM treinos WHERE concluido=true AND tipo ILIKE '%academia%' AND data>=$1 GROUP BY usuario`,[inicioMes]),
      // % por semana nas últimas 10 semanas (para histórico)
      pool.query(`SELECT usuario, DATE_TRUNC('week',data)::date as semana, COUNT(*) as cnt FROM treinos WHERE concluido=true AND data>=CURRENT_DATE-INTERVAL '70 days' GROUP BY usuario,semana ORDER BY semana`),
      // Melhor % de cumprimento numa semana
      pool.query(`SELECT usuario, MAX(cnt) as total FROM (SELECT usuario, DATE_TRUNC('week',data) as sem, COUNT(*) as cnt FROM treinos WHERE concluido=true GROUP BY usuario,sem) t GROUP BY usuario`),
    ];

    const results = await Promise.all(queries);

    function getPair(rows) {
      const r = { renato: 0, silvia: 0 };
      for (const row of rows) r[row.usuario] = parseInt(row.total||0);
      return r;
    }

    // % de cumprimento = feitos / esperados * 100
    // Esperado parcial da semana = (dias decorridos / 7) * treinos esperados/semana
    function pctCumprimento(feitos, usuario, periodo) {
      let esperado;
      if (periodo === 'semana') esperado = (diasDecorridos / 7) * ESPERADO_SEMANA[usuario];
      else if (periodo === 'mes') esperado = semanasMes * ESPERADO_SEMANA[usuario];
      else if (periodo === '30d') esperado = (30 / 7) * ESPERADO_SEMANA[usuario];
      else esperado = ESPERADO_SEMANA[usuario]; // semana cheia
      return esperado > 0 ? Math.round((feitos / esperado) * 100) : 0;
    }

    const feitosSemana = getPair(results[0].rows);
    const feitosMes    = getPair(results[1].rows);
    const streak       = getPair(results[2].rows);
    const minMes       = getPair(results[3].rows);
    const beachMes     = getPair(results[4].rows);
    const academiaMes  = getPair(results[5].rows);
    const melhorSem    = getPair(results[7].rows);

    // Calcular % para cada categoria
    const pctSemR = pctCumprimento(feitosSemana.renato, 'renato', 'semana');
    const pctSemS = pctCumprimento(feitosSemana.silvia, 'silvia', 'semana');
    const pctMesR = pctCumprimento(feitosMes.renato,    'renato', 'mes');
    const pctMesS = pctCumprimento(feitosMes.silvia,    'silvia', 'mes');
    const pct30R  = pctCumprimento(streak.renato,        'renato', '30d');
    const pct30S  = pctCumprimento(streak.silvia,        'silvia', '30d');
    // Melhor semana: % da semana com mais treinos em relação ao esperado
    const pctMelhorR = Math.round((melhorSem.renato / ESPERADO_SEMANA.renato) * 100);
    const pctMelhorS = Math.round((melhorSem.silvia / ESPERADO_SEMANA.silvia) * 100);

    // Histórico semanal — converter para % de cumprimento
    const histRows = results[6].rows;
    const semanas = [...new Set(histRows.map(r => r.semana.toString().slice(0,10)))].sort();
    const histR = semanas.map(s => {
      const r = histRows.find(x => x.usuario==='renato' && x.semana.toString().slice(0,10)===s);
      return r ? Math.min(Math.round((parseInt(r.cnt) / ESPERADO_SEMANA.renato) * 100), 100) : 0;
    });
    const histS = semanas.map(s => {
      const r = histRows.find(x => x.usuario==='silvia' && x.semana.toString().slice(0,10)===s);
      return r ? Math.min(Math.round((parseInt(r.cnt) / ESPERADO_SEMANA.silvia) * 100), 100) : 0;
    });
    const labSemanas = semanas.map(s => { const d = new Date(s+'T12:00:00'); return d.getDate()+'/'+(d.getMonth()+1); });

    function winner(a, b) {
      if (a > b) return 'renato';
      if (b > a) return 'silvia';
      return 'empate';
    }

    // Placar: quem venceu mais categorias de %
    const catsPct = [
      { r: pctSemR,    s: pctSemS    },
      { r: pctMesR,    s: pctMesS    },
      { r: pct30R,     s: pct30S     },
      { r: pctMelhorR, s: pctMelhorS },
      { r: minMes.renato > 0 ? 1 : 0, s: minMes.silvia > 0 ? 1 : 0 }, // quem registrou minutos
    ];
    let ptR = 0, ptS = 0;
    for (const c of catsPct) {
      if (c.r > c.s) ptR++;
      else if (c.s > c.r) ptS++;
    }

    // Cards — mostrar % de cumprimento como valor principal, absoluto como subtexto
    const cards = [
      {
        label:'CUMPRIMENTO — SEMANA',
        r: pctSemR, s: pctSemS,
        subR: feitosSemana.renato+' treinos', subS: feitosSemana.silvia+' treinos',
        unit:'%', win: winner(pctSemR, pctSemS),
        tooltip:'% dos treinos esperados na semana feitos até hoje'
      },
      {
        label:'CUMPRIMENTO — MÊS',
        r: pctMesR, s: pctMesS,
        subR: feitosMes.renato+' treinos', subS: feitosMes.silvia+' treinos',
        unit:'%', win: winner(pctMesR, pctMesS),
        tooltip:'% dos treinos esperados no mês feitos até hoje'
      },
      {
        label:'CONSISTÊNCIA 30 DIAS',
        r: pct30R, s: pct30S,
        subR: streak.renato+' dias ativos', subS: streak.silvia+' dias ativos',
        unit:'%', win: winner(pct30R, pct30S),
        tooltip:'% de dias com treino nos últimos 30 dias vs. rotina esperada'
      },
      {
        label:'MELHOR SEMANA',
        r: pctMelhorR, s: pctMelhorS,
        subR: melhorSem.renato+' treinos', subS: melhorSem.silvia+' treinos',
        unit:'%', win: winner(pctMelhorR, pctMelhorS),
        tooltip:'% da melhor semana já registrada em relação à rotina'
      },
      {
        label:'MINUTOS NO MÊS',
        r: minMes.renato, s: minMes.silvia,
        subR: '', subS: '',
        unit:'min', win: winner(minMes.renato, minMes.silvia),
        tooltip:'Total de minutos de treino registrados este mês'
      },
      {
        label:'BEACH TENNIS — MÊS',
        r: beachMes.renato, s: beachMes.silvia,
        subR: '', subS: '',
        unit:'jogos', win: winner(beachMes.renato, beachMes.silvia),
        tooltip:'Jogos de beach tennis concluídos este mês'
      },
      {
        label:'ACADEMIA — MÊS',
        r: academiaMes.renato, s: academiaMes.silvia,
        subR: '', subS: '',
        unit:'treinos', win: winner(academiaMes.renato, academiaMes.silvia),
        tooltip:'Treinos de academia concluídos este mês'
      },
    ];

    const cardsHTML = cards.map(c => {
      const isEmp = c.win === 'empate';
      const rWin  = c.win === 'renato';
      const sWin  = c.win === 'silvia';
      const maxVal = Math.max(c.r, c.s, 1);
      const barR = Math.round((c.r / maxVal) * 100);
      const barS = Math.round((c.s / maxVal) * 100);
      const isPercent = c.unit === '%';
      return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px 22px">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.14em;color:var(--muted);margin-bottom:12px;font-family:'Outfit',sans-serif;display:flex;justify-content:space-between;align-items:center">
          <span>${c.label}</span>
          ${c.tooltip?`<span style="font-size:8px;color:var(--muted);font-weight:600;letter-spacing:0.04em;opacity:0.6;max-width:120px;text-align:right;line-height:1.2">${c.tooltip}</span>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px">
          <div>
            <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:900;letter-spacing:-0.02em;color:${rWin?'var(--accent)':'var(--text)'};line-height:1">
              ${c.r}${isPercent?'<span style="font-size:16px">%</span>':''}
            </div>
            ${c.subR?`<div style="font-size:9px;color:var(--muted);margin-top:3px;font-weight:600">${c.subR}</div>`:''}
            <div style="font-size:9px;font-weight:800;color:${rWin?'var(--accent)':'var(--muted)'};letter-spacing:0.1em;margin-top:4px;font-family:'Outfit',sans-serif">RC ${rWin?'▲':''}</div>
          </div>
          <div style="font-size:18px;color:${isEmp?'var(--accent)':'var(--muted)'};font-weight:900;font-family:'Outfit',sans-serif;margin-bottom:4px">${isEmp?'=':'VS'}</div>
          <div style="text-align:right">
            <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:900;letter-spacing:-0.02em;color:${sWin?'var(--accent)':'var(--text)'};line-height:1">
              ${c.s}${isPercent?'<span style="font-size:16px">%</span>':''}
            </div>
            ${c.subS?`<div style="font-size:9px;color:var(--muted);margin-top:3px;font-weight:600">${c.subS}</div>`:''}
            <div style="font-size:9px;font-weight:800;color:${sWin?'var(--accent)':'var(--muted)'};letter-spacing:0.1em;margin-top:4px;font-family:'Outfit',sans-serif">${sWin?'▲':''} SI</div>
          </div>
        </div>
        <div style="display:flex;gap:2px;height:3px">
          <div style="flex:${barR};background:${rWin?'var(--accent)':'rgba(255,255,255,0.12)'};border-radius:2px 0 0 2px"></div>
          <div style="flex:${barS};background:${sWin?'var(--accent)':'rgba(255,255,255,0.06)'};border-radius:0 2px 2px 0"></div>
        </div>
        ${!isPercent?`<div style="font-size:9px;color:var(--muted);margin-top:5px;font-weight:600;letter-spacing:0.06em">${c.unit}</div>`:''}
      </div>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Duelo · RC vs SI</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>${SHARED_CSS}
.duelo-hero{padding:48px 32px 40px;border-bottom:1px solid var(--border)}
.placar-row{display:flex;align-items:center;justify-content:space-between;gap:20px;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:28px 32px}
.placar-nome{font-family:'Outfit',sans-serif;font-size:13px;font-weight:800;letter-spacing:0.16em;color:var(--muted)}
.placar-pts{font-family:'Outfit',sans-serif;font-size:72px;font-weight:900;letter-spacing:-0.04em;line-height:1}
.placar-pts.lider{color:var(--accent)}
.placar-vs{font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:var(--muted);letter-spacing:0.12em;text-align:center}
.placar-sub{font-size:10px;color:var(--muted);margin-top:6px;font-weight:600;letter-spacing:0.08em;font-family:'Outfit',sans-serif}
.cards-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
.section-label{font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif}
.section-label::after{content:'';flex:1;height:1px;background:var(--border)}
.chart-wrap{position:relative;height:200px}
@media(max-width:860px){
  .sidebar{display:none}
  .main{padding:16px 16px 130px}
  .bottom-nav{display:flex !important}
  .cards-grid{grid-template-columns:1fr 1fr !important}
  .placar-pts{font-size:52px}
  .duelo-hero{padding:24px 16px 28px}
}
@media(max-width:480px){
  .cards-grid{grid-template-columns:1fr !important}
}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark"><div class="logo-dot"></div><div class="logo-text">TREINOS</div></div>
    <div class="logo-sub">Renato & Silvia</div>
  </div>
  <div class="sidebar-nav">
    <div class="nav-group">
      <div class="nav-label">Menu</div>
      <a href="/" class="nav-item"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas" class="nav-item"><span class="nav-icon">MT</span>Metas</a>
      <a href="/historico" class="nav-item"><span class="nav-icon">HT</span>Histórico</a>
      <a href="/duelo" class="nav-item active"><span class="nav-icon">⚔</span>Duelo</a>
    </div>
  </div>
  <div class="sidebar-foot">
    <div class="user-row">
      <div class="user-av">RC</div>
      <div><div class="user-name">vs</div><div class="user-loc">Silvia</div></div>
    </div>
  </div>
</div>

<div class="content">
  <div class="topbar">
    <div class="topbar-title">⚔ DUELO</div>
    <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
  </div>

  <div class="duelo-hero">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--muted);margin-bottom:12px;font-family:'Outfit',sans-serif">PLACAR GERAL</div>
    <div class="placar-row">
      <div style="text-align:left">
        <div class="placar-nome">RENATO</div>
        <div class="placar-pts ${ptR > ptS ? 'lider' : ''}">${ptR}</div>
        <div class="placar-sub">${ptR > ptS ? '👑 LÍDER' : ptR === ptS ? 'EMPATADO' : 'ATRÁS'}</div>
      </div>
      <div class="placar-vs">
        <div style="font-size:32px;margin-bottom:4px">⚔</div>
        <div>${ptR === ptS ? 'EMPATE' : 'VS'}</div>
        <div style="font-size:9px;margin-top:8px;color:var(--muted)">7 CATEGORIAS</div>
      </div>
      <div style="text-align:right">
        <div class="placar-nome">SILVIA</div>
        <div class="placar-pts ${ptS > ptR ? 'lider' : ''}">${ptS}</div>
        <div class="placar-sub">${ptS > ptR ? '👑 LÍDER' : ptS === ptR ? 'EMPATADA' : 'ATRÁS'}</div>
      </div>
    </div>
  </div>

  <div class="main">

    <div style="margin-bottom:28px">
      <div class="section-label">Categorias</div>
      <div class="cards-grid">${cardsHTML}</div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:28px;margin-bottom:20px">
      <div class="section-label">% de cumprimento da rotina — últimas 10 semanas</div>
      <div class="chart-wrap"><canvas id="chartDuelo"></canvas></div>
    </div>

  </div>
</div>

<div class="bottom-nav" style="display:none">
  <a href="/" class="bottom-nav-item">
    <div class="bottom-nav-icon">DB</div>
    <div class="bottom-nav-label">Home</div>
  </a>
  <a href="/metas" class="bottom-nav-item">
    <div class="bottom-nav-icon">MT</div>
    <div class="bottom-nav-label">Metas</div>
  </a>
  <a href="/duelo" class="bottom-nav-item active">
    <div class="bottom-nav-icon">⚔</div>
    <div class="bottom-nav-label">Duelo</div>
  </a>
  <a href="/#registro" class="bottom-nav-item">
    <div class="bottom-nav-icon">+</div>
    <div class="bottom-nav-label">Registrar</div>
  </a>
</div>

<script>
Chart.defaults.font.family="'DM Sans',system-ui,sans-serif";
Chart.defaults.color='#6A6A80';

new Chart(document.getElementById('chartDuelo'),{
  type:'bar',
  data:{
    labels:${JSON.stringify(labSemanas.length?labSemanas:['—'])},
    datasets:[
      {
        label:'Renato',
        data:${JSON.stringify(histR.length?histR:[0])},
        backgroundColor:'rgba(212,254,69,0.25)',
        borderColor:'#D4FE45',
        borderWidth:1.5,
        borderRadius:4,
      },
      {
        label:'Silvia',
        data:${JSON.stringify(histS.length?histS:[0])},
        backgroundColor:'rgba(255,255,255,0.08)',
        borderColor:'rgba(255,255,255,0.3)',
        borderWidth:1.5,
        borderRadius:4,
      }
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{
        display:true,
        labels:{color:'#9A9AB0',font:{size:11},boxWidth:12,padding:20}
      }
    },
    scales:{
      x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true,max:100,ticks:{callback:v=>v+'%',font:{size:10}}}
    }
  }
});
</script>
</body></html>`);
  } catch(e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem;color:#fff;background:#111">'+e.message+'</pre>');
  }
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log('Dashboard rodando na porta ' + PORT));
}).catch(e => {
  console.error('Erro ao inicializar banco:', e);
  process.exit(1);
});
