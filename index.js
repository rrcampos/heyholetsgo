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
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dicas (
      id SERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      categoria VARCHAR(50)
    );
  `);
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

const ROTINA = {
  1: { tipo:'Corrida leve',      icone:'RUN',  horario:'17h', label:'CORRIDA'  },
  2: { tipo:'Academia — sup. A', icone:'GYM',  horario:'11h', label:'ACADEMIA' },
  3: { tipo:'Beach tennis',      icone:'BCH',  horario:'20h', label:'BEACH'    },
  4: { tipo:'Academia — sup. B', icone:'GYM',  horario:'11h', label:'ACADEMIA' },
  5: { tipo:'Corrida leve',      icone:'RUN',  horario:'10h', label:'CORRIDA'  },
  6: { tipo:'Academia — inf.',   icone:'GYM',  horario:'9h',  label:'ACADEMIA' },
  0: { tipo:'Descanso',          icone:'REST', horario:'—',   label:'DESCANSO' },
};

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

async function getDicaHoje() {
  const { rows } = await pool.query('SELECT texto, categoria FROM dicas ORDER BY id');
  if (!rows.length) return { texto:'Continue firme.', categoria:'geral' };
  return rows[new Date().getDate() % rows.length];
}

async function getStats() {
  const semana = semanaAtual();
  const [totalR, semanaR, streakR, corridaR] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM treinos WHERE concluido=true'),
    pool.query('SELECT * FROM treinos WHERE data>=$1 AND data<=$2 ORDER BY data ASC',[semana.inicio,semana.fim]),
    pool.query(`SELECT COUNT(DISTINCT data) as streak FROM treinos WHERE concluido=true AND data >= CURRENT_DATE - INTERVAL '30 days'`),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, SUM(distancia_km) as km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL GROUP BY semana ORDER BY semana ASC`),
  ]);
  return {
    total:    parseInt(totalR.rows[0].count),
    semana:   semanaR.rows,
    streak:   parseInt(streakR.rows[0].streak)||0,
    corridas: corridaR.rows,
  };
}

async function getMetas() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
  const semana = semanaAtual();

  const [maiorR, minR, semTreinosR, corridaHistR, streakMesR, minMesR, heatR, planoR] = await Promise.all([
    pool.query(`SELECT COALESCE(MAX(distancia_km),0) as max_km, COALESCE(AVG(distancia_km),0) as avg_km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL`),
    pool.query(`SELECT COALESCE(SUM(duracao_min),0) as min FROM treinos WHERE concluido=true AND data>=$1`,[inicioMes]),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=CURRENT_DATE-INTERVAL '84 days' GROUP BY semana ORDER BY semana`),
    pool.query(`SELECT DATE_TRUNC('week',data)::date as semana, MAX(distancia_km) as max_km FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL GROUP BY semana ORDER BY semana`),
    pool.query(`SELECT DATE_TRUNC('month',data)::date as mes, COUNT(DISTINCT data) as dias FROM treinos WHERE concluido=true GROUP BY mes ORDER BY mes DESC LIMIT 6`),
    pool.query(`SELECT DATE_TRUNC('month',data)::date as mes, COALESCE(SUM(duracao_min),0) as min FROM treinos WHERE concluido=true AND data>=CURRENT_DATE-INTERVAL '180 days' GROUP BY mes ORDER BY mes`),
    pool.query(`SELECT data::text, COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=CURRENT_DATE-INTERVAL '180 days' GROUP BY data ORDER BY data`),
    pool.query(`SELECT COUNT(DISTINCT DATE_TRUNC('week',data)) as semanas FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true`),
    pool.query(`SELECT COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=$1 AND data<=$2`,[semana.inicio,semana.fim]),
  ]);

  const semTreinosAtual = await pool.query(`SELECT COUNT(*) FILTER(WHERE concluido=true) as feitos FROM treinos WHERE data>=$1 AND data<=$2`,[semana.inicio,semana.fim]);

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

async function getCalendario() {
  const hoje  = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);
  const { rows } = await pool.query('SELECT data::text, tipo, concluido FROM treinos WHERE data>=$1 AND data<=$2',[inicio,fim]);
  return rows;
}

function proximoTreino() {
  for (let i=0; i<=7; i++) {
    const d = new Date(); d.setDate(d.getDate()+i);
    const r = ROTINA[d.getDay()];
    if (r && r.tipo!=='Descanso')
      return { ...r, data:d.toISOString().slice(0,10), dia:DIAS_SHORT[d.getDay()], daqui:i };
  }
  return null;
}

// CSS COMPARTILHADO
const SHARED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#111113;
  --card:#1A1A1D;
  --card2:#222226;
  --border:rgba(255,255,255,0.07);
  --border2:rgba(255,255,255,0.12);
  --text:#FFFFFF;
  --muted:#5A5A6A;
  --muted2:#888899;
  --accent:#D4FE45;
  --accent-dim:rgba(212,254,69,0.12);
  --accent-mid:rgba(212,254,69,0.4);
  --r:14px;
}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}

.sidebar{
  width:220px;min-height:100vh;background:#0D0D0F;
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
  background:rgba(13,13,15,0.8);backdrop-filter:blur(12px);
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

@media(max-width:860px){.sidebar{display:none}.main{padding:20px 16px}}
`;

// ── ROTA / ────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const [stats, calendario, dica] = await Promise.all([getStats(), getCalendario(), getDicaHoje()]);
    const proximo = proximoTreino();
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
      diasSemana.push({data:ds,dow,diaNome:DIAS_SHORT[dow],dia:d.getDate(),rotina:ROTINA[dow],treino:semMap[ds]||null,hoje:ds===hojeS});
    }

    const feitasSemana    = diasSemana.filter(d=>d.treino?.concluido).length;
    const possiveisSemana = diasSemana.filter(d=>d.rotina?.tipo!=='Descanso').length;
    const pctSemana       = possiveisSemana>0?Math.round((feitasSemana/possiveisSemana)*100):0;
    const kmPorSemana     = stats.corridas.map(r=>({semana:r.semana,km:parseFloat(r.km||0).toFixed(1)}));
    const semanaPlano     = Math.min(kmPorSemana.length+1,8);

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
.prog-track{background:var(--card2);border-radius:99px;height:3px;margin-top:16px;overflow:hidden}
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
  border:1px solid var(--border);border-radius:8px;padding:14px 8px;
  text-align:center;cursor:pointer;transition:all 0.15s;background:transparent;
  display:flex;flex-direction:column;align-items:center;gap:5px;
}
.tipo-btn:hover{border-color:var(--border2);background:rgba(255,255,255,0.03)}
.tipo-btn.selected{border-color:var(--accent);background:var(--accent-dim)}
.tipo-btn-icon{font-size:20px}
.tipo-btn-nome{font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted2);font-family:'Outfit',sans-serif}
.tipo-btn.selected .tipo-btn-nome{color:var(--accent)}
.humor-row{display:flex;gap:8px}
.humor-btn{flex:1;border:1px solid var(--border);border-radius:8px;padding:12px 6px;text-align:center;cursor:pointer;font-size:20px;transition:all 0.15s;background:transparent}
.humor-btn:hover{border-color:var(--border2);transform:scale(1.08)}
.humor-btn.selected{border-color:var(--accent);background:var(--accent-dim)}
.field-input{
  width:100%;border:1px solid var(--border);border-radius:8px;padding:12px 14px;
  font-size:13px;font-family:'DM Sans',sans-serif;background:var(--card2);color:var(--text);
  outline:none;transition:border-color 0.15s;
}
.field-input:focus{border-color:var(--accent)}
.field-input::placeholder{color:var(--muted)}
textarea.field-input{resize:vertical;min-height:90px;line-height:1.5}
.fields-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn-save{
  width:100%;background:var(--accent);color:#111;border:none;border-radius:8px;
  padding:16px;font-family:'Outfit',sans-serif;font-size:13px;font-weight:900;
  cursor:pointer;transition:opacity 0.15s;letter-spacing:0.1em;text-transform:uppercase;
  margin-top:6px;
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
      <a href="/" class="nav-item active"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas" class="nav-item"><span class="nav-icon">MT</span>Metas</a>
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
    <div class="hero-greeting">${saudacao}, RENATO</div>
    <div class="hero-name">SEUS<br><span>TREINOS.</span></div>
    <div class="hero-sub">Cada treino é uma escolha. Você escolheu bem.</div>
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
      <div class="semana-grid">${semanaCells}</div>
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
                <div style="background:var(--card2);border-radius:2px;height:3px;overflow:hidden">
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
function toggleTreino(data,tipo){
  fetch('/treino/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,tipo})})
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
    const m = await getMetas();
    const hoje = new Date();

    const pctTreinos  = Math.min(Math.round((m.treinosSemAtual/5)*100),100);
    const pctKm       = Math.min(Math.round((m.maiorKm/10)*100),100);
    const pctStreak   = Math.min(Math.round((m.streak_atual||0)/20*100),100);
    const pctMin      = Math.min(Math.round((m.minMes/600)*100),100);

    // Streak atual
    const { rows: sRows } = await pool.query(`SELECT COUNT(DISTINCT data) as s FROM treinos WHERE concluido=true AND data>=CURRENT_DATE-INTERVAL '30 days'`);
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
.meta-bar-mini{position:absolute;bottom:0;left:0;right:0;height:3px;background:var(--card2)}
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
      <a href="/" class="nav-item"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas" class="nav-item active"><span class="nav-icon">MT</span>Metas</a>
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
    <div class="topbar-title">Metas</div>
    <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
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

<script>
Chart.defaults.font.family="'DM Sans',system-ui,sans-serif";
Chart.defaults.color='#5A5A6A';

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
  const { data, tipo, concluido, nota, duracao_min, distancia_km } = req.body;
  try {
    const ex = await pool.query('SELECT id FROM treinos WHERE data=$1 AND tipo=$2',[data,tipo]);
    if(ex.rows.length)
      await pool.query('UPDATE treinos SET concluido=$1,nota=$2,duracao_min=$3,distancia_km=$4 WHERE id=$5',
        [concluido==='true',nota||null,duracao_min||null,distancia_km||null,ex.rows[0].id]);
    else
      await pool.query('INSERT INTO treinos (data,tipo,concluido,nota,duracao_min,distancia_km) VALUES ($1,$2,$3,$4,$5,$6)',
        [data,tipo,concluido==='true',nota||null,duracao_min||null,distancia_km||null]);
    res.redirect('/');
  } catch(e){res.status(500).send(e.message);}
});

app.post('/treino/toggle', async (req, res) => {
  const { data, tipo } = req.body;
  try {
    const ex = await pool.query('SELECT id,concluido FROM treinos WHERE data=$1 AND tipo=$2',[data,tipo]);
    if(ex.rows.length){
      const novo=!ex.rows[0].concluido;
      await pool.query('UPDATE treinos SET concluido=$1 WHERE id=$2',[novo,ex.rows[0].id]);
      res.json({ok:true,concluido:novo});
    } else {
      await pool.query('INSERT INTO treinos (data,tipo,concluido) VALUES ($1,$2,true)',[data,tipo]);
      res.json({ok:true,concluido:true});
    }
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── ROTA /historico ───────────────────────────────────────────────────────────
app.get('/historico', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, data::text, tipo, concluido, nota, duracao_min, distancia_km
      FROM treinos ORDER BY data DESC, id DESC LIMIT 100
    `);

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
.field-input{border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:13px;font-family:'DM Sans',sans-serif;background:var(--card2);color:var(--text);outline:none;transition:border-color 0.15s}
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
      <a href="/" class="nav-item"><span class="nav-icon">DB</span>Dashboard</a>
      <a href="/metas" class="nav-item"><span class="nav-icon">MT</span>Metas</a>
      <a href="/historico" class="nav-item active"><span class="nav-icon">HT</span>Histórico</a>
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
    <div class="topbar-title">Histórico</div>
    <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}</div>
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

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log('Dashboard rodando na porta ' + PORT));
}).catch(e => {
  console.error('Erro ao inicializar banco:', e);
  process.exit(1);
});
