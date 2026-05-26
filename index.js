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
  1: { tipo:'Corrida leve',      icone:'🏃', horario:'17h', label:'Corrida',  cor:'#7C3AED' },
  2: { tipo:'Academia — sup. A', icone:'💪', horario:'11h', label:'Academia', cor:'#0EA5E9' },
  3: { tipo:'Beach tennis',      icone:'🎾', horario:'20h', label:'Beach',    cor:'#10B981' },
  4: { tipo:'Academia — sup. B', icone:'💪', horario:'11h', label:'Academia', cor:'#0EA5E9' },
  5: { tipo:'Corrida leve',      icone:'🏃', horario:'10h', label:'Corrida',  cor:'#7C3AED' },
  6: { tipo:'Academia — inf.',   icone:'🦵', horario:'9h',  label:'Academia', cor:'#0EA5E9' },
  0: { tipo:'Descanso',          icone:'😴', horario:'—',   label:'Descanso', cor:'#94A3B8' },
};

const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MESES_PT   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

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
    pool.query(`
      SELECT COUNT(DISTINCT data) as streak FROM treinos
      WHERE concluido=true AND data >= CURRENT_DATE - INTERVAL '30 days'
    `),
    pool.query(`
      SELECT DATE_TRUNC('week',data)::date as semana, SUM(distancia_km) as km
      FROM treinos WHERE tipo ILIKE '%corrida%' AND concluido=true AND distancia_km IS NOT NULL
      GROUP BY semana ORDER BY semana ASC
    `),
  ]);
  return {
    total:    parseInt(totalR.rows[0].count),
    semana:   semanaR.rows,
    streak:   parseInt(streakR.rows[0].streak)||0,
    corridas: corridaR.rows,
  };
}

async function getCalendarioMes() {
  const hoje  = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(),    1).toISOString().slice(0,10);
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);
  const { rows } = await pool.query(
    'SELECT data::text, tipo, concluido FROM treinos WHERE data>=$1 AND data<=$2',[inicio,fim]);
  return rows;
}

function proximoTreino() {
  for (let i=0; i<=7; i++) {
    const d = new Date(); d.setDate(d.getDate()+i);
    const r = ROTINA[d.getDay()];
    if (r && r.tipo !== 'Descanso')
      return { ...r, data: d.toISOString().slice(0,10), dia: DIAS_SHORT[d.getDay()], daqui: i };
  }
  return null;
}

// ── ROTAS ────────────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  try {
    const [stats, calendario, dica] = await Promise.all([getStats(), getCalendarioMes(), getDicaHoje()]);
    const proximo = proximoTreino();
    const hoje    = new Date();
    const hojeS   = hojeStr();
    const anoMes  = `${MESES_PT[hoje.getMonth()]} ${hoje.getFullYear()}`;
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
    for (const t of stats.semana) semMap[t.data.slice ? t.data.slice(0,10) : t.data] = t;

    const diasSemana = [];
    for (let i=0; i<7; i++) {
      const d   = new Date(semana.inicio); d.setDate(d.getDate()+i);
      const ds  = d.toISOString().slice(0,10);
      const dow = d.getDay();
      diasSemana.push({ data:ds, dow, diaNome:DIAS_SHORT[dow], dia:d.getDate(),
        rotina:ROTINA[dow], treino:semMap[ds]||null, hoje:ds===hojeS });
    }

    const feitasSemana    = diasSemana.filter(d=>d.treino?.concluido).length;
    const possiveisSemana = diasSemana.filter(d=>d.rotina?.tipo!=='Descanso').length;
    const pctSemana       = possiveisSemana>0 ? Math.round((feitasSemana/possiveisSemana)*100) : 0;

    const kmPorSemana = stats.corridas.map(r=>({ semana:r.semana, km:parseFloat(r.km||0).toFixed(1) }));
    const semanaPlano = Math.min(kmPorSemana.length+1, 8);
    const faseAtual   = semanaPlano<=2 ? 'Base' : semanaPlano<=5 ? 'Construção' : 'Consolidação';
    const maxKm       = Math.max(...kmPorSemana.map(k=>parseFloat(k.km)), 5);

    const horaAtual   = hoje.getHours();
    const saudacao    = horaAtual<12 ? 'Bom dia' : horaAtual<18 ? 'Boa tarde' : 'Boa noite';

    res.send(renderHTML({ stats, dica, proximo, diasSemana, feitasSemana, possiveisSemana, pctSemana,
      anoMes, diasNoMes, offsetSeg, treinosMap, hojeS, kmPorSemana, semanaPlano, faseAtual, maxKm, saudacao }));
  } catch(e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem">'+e.message+'</pre>');
  }
});

app.post('/treino', async (req, res) => {
  const { data, tipo, concluido, nota, duracao_min, distancia_km } = req.body;
  try {
    const ex = await pool.query('SELECT id FROM treinos WHERE data=$1 AND tipo=$2',[data,tipo]);
    if (ex.rows.length)
      await pool.query('UPDATE treinos SET concluido=$1,nota=$2,duracao_min=$3,distancia_km=$4 WHERE id=$5',
        [concluido==='true', nota||null, duracao_min||null, distancia_km||null, ex.rows[0].id]);
    else
      await pool.query('INSERT INTO treinos (data,tipo,concluido,nota,duracao_min,distancia_km) VALUES ($1,$2,$3,$4,$5,$6)',
        [data, tipo, concluido==='true', nota||null, duracao_min||null, distancia_km||null]);
    res.redirect('/');
  } catch(e) { res.status(500).send(e.message); }
});

app.post('/treino/toggle', async (req, res) => {
  const { data, tipo } = req.body;
  try {
    const ex = await pool.query('SELECT id,concluido FROM treinos WHERE data=$1 AND tipo=$2',[data,tipo]);
    if (ex.rows.length) {
      const novo = !ex.rows[0].concluido;
      await pool.query('UPDATE treinos SET concluido=$1 WHERE id=$2',[novo,ex.rows[0].id]);
      res.json({ ok:true, concluido:novo });
    } else {
      await pool.query('INSERT INTO treinos (data,tipo,concluido) VALUES ($1,$2,true)',[data,tipo]);
      res.json({ ok:true, concluido:true });
    }
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── HTML ─────────────────────────────────────────────────────────────────────

function renderHTML(d) {
  const { stats, dica, proximo, diasSemana, feitasSemana, possiveisSemana, pctSemana,
    anoMes, diasNoMes, offsetSeg, treinosMap, hojeS, kmPorSemana, semanaPlano, faseAtual, maxKm, saudacao } = d;

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();
  function pad(n){ return String(n).padStart(2,'0'); }

  // CARDS TOPO
  const topCards = [
    { val: pctSemana+'%',      label:'Progresso semanal', sub: feitasSemana+' de '+possiveisSemana+' treinos', bg:'linear-gradient(135deg,#7C3AED,#A78BFA)', icon:'📊' },
    { val: stats.streak,       label:'Dias ativos',        sub:'nos últimos 30 dias',                           bg:'linear-gradient(135deg,#0EA5E9,#38BDF8)', icon:'🔥' },
    { val: stats.total,        label:'Total de treinos',   sub:'desde o início',                                bg:'linear-gradient(135deg,#10B981,#34D399)', icon:'✅' },
    { val: semanaPlano+'/8',   label:'Plano de corrida',   sub:'Fase: '+faseAtual,                              bg:'linear-gradient(135deg,#F59E0B,#FCD34D)', icon:'🏃' },
  ].map(c=>`
    <div class="top-card" style="background:${c.bg}">
      <div class="top-card-icon">${c.icon}</div>
      <div class="top-card-val">${c.val}</div>
      <div class="top-card-label">${c.label}</div>
      <div class="top-card-sub">${c.sub}</div>
    </div>`).join('');

  // SEMANA
  const semanaCells = diasSemana.map(day=>{
    const isDescanso = day.rotina?.tipo==='Descanso';
    const feito      = day.treino?.concluido;
    let cls = 'dia-card';
    if (day.hoje) cls+=' dia-hoje';
    if (feito)    cls+=' dia-feito';
    if (isDescanso) cls+=' dia-descanso';
    const cor = day.rotina?.cor || '#94A3B8';
    return `
    <div class="${cls}" ${!isDescanso?`onclick="toggleTreino('${day.data}','${day.rotina?.tipo}')"`:''}>
      <div class="dia-topo">
        <span class="dia-nome">${day.diaNome}</span>
        ${day.hoje?'<span class="badge-hoje">hoje</span>':''}
      </div>
      <div class="dia-icone-wrap" style="background:${feito?cor+'22':isDescanso?'#f1f5f9':'#f8fafc'};border-color:${feito?cor:'transparent'}">
        <span style="font-size:22px">${day.rotina?.icone}</span>
      </div>
      <div class="dia-tipo" style="color:${isDescanso?'#94A3B8':cor}">${isDescanso?'descanso':day.rotina?.label}</div>
      ${!isDescanso?`<div class="dia-hora">${day.rotina?.horario}</div>`:''}
      ${feito
        ? `<div class="dia-status dia-status-ok" style="background:${cor}22;color:${cor}">✓ feito</div>`
        : (!isDescanso?`<div class="dia-status dia-status-open">marcar</div>`:'')}
    </div>`;
  }).join('');

  // CALENDÁRIO
  const calCells = [];
  for (let i=0; i<offsetSeg; i++) calCells.push(null);
  for (let d=1; d<=diasNoMes; d++) calCells.push(d);

  function calCell(day) {
    if (!day) return `<div></div>`;
    const ds = `${anoAtual}-${pad(mesAtual+1)}-${pad(day)}`;
    const treinos  = treinosMap[ds]||[];
    const feito    = treinos.some(t=>t.concluido);
    const pendente = treinos.length>0 && !feito;
    const isHoje   = ds===hojeS;
    let cls = 'cal-d';
    if (isHoje)   cls+=' cal-hoje';
    if (feito)    cls+=' cal-feito';
    else if (pendente) cls+=' cal-pendente';
    return `<div class="${cls}">${day}${feito?'<i>✓</i>':''}</div>`;
  }

  // BARRAS CORRIDA
  const barras = kmPorSemana.slice(-8).map(k=>{
    const pct = Math.round((parseFloat(k.km)/maxKm)*100);
    const dt  = new Date(k.semana);
    return `<div class="bar-item">
      <div class="bar-km">${k.km}</div>
      <div class="bar-outer"><div class="bar-inner" style="height:${Math.max(pct,3)}%"></div></div>
      <div class="bar-lbl">${dt.getDate()}/${dt.getMonth()+1}</div>
    </div>`;
  }).join('');

  const proximoLabel = proximo
    ? (proximo.daqui===0 ? 'Hoje' : proximo.daqui===1 ? 'Amanhã' : proximo.dia)
    : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Treinos · Renato</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#F0F2F8;
  --sidebar:#fff;
  --card:#fff;
  --border:#E8EAF2;
  --text:#1E2235;
  --muted:#8A93B2;
  --purple:#7C3AED;
  --purple-light:#EDE9FE;
  --blue:#0EA5E9;
  --blue-light:#E0F2FE;
  --green:#10B981;
  --green-light:#D1FAE5;
  --amber:#F59E0B;
  --amber-light:#FEF3C7;
  --r:16px;
  --r-sm:10px;
  --shadow:0 2px 12px rgba(30,34,53,0.07);
}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}

/* SIDEBAR */
.sidebar{
  width:240px;min-height:100vh;background:var(--sidebar);
  border-right:1px solid var(--border);padding:28px 0;
  display:flex;flex-direction:column;gap:0;flex-shrink:0;
  position:sticky;top:0;height:100vh;overflow-y:auto;
}
.sidebar-logo{padding:0 24px 28px;border-bottom:1px solid var(--border);margin-bottom:16px}
.sidebar-logo-name{font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;color:var(--text);letter-spacing:-0.02em}
.sidebar-logo-sub{font-size:11px;color:var(--muted);margin-top:2px;font-weight:500}
.sidebar-section{padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--muted);margin-top:8px}
.sidebar-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 24px;font-size:14px;font-weight:500;color:var(--muted);
  cursor:pointer;transition:all 0.15s;border-left:3px solid transparent;
}
.sidebar-item:hover{background:#F8F9FF;color:var(--text)}
.sidebar-item.active{background:var(--purple-light);color:var(--purple);border-left-color:var(--purple);font-weight:700}
.sidebar-item-icon{font-size:16px;width:20px;text-align:center}
.sidebar-bottom{margin-top:auto;padding:16px 24px;border-top:1px solid var(--border)}
.sidebar-user{display:flex;align-items:center;gap:10px}
.sidebar-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--purple),var(--blue));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;font-family:'Outfit',sans-serif}
.sidebar-user-name{font-size:13px;font-weight:700;color:var(--text)}
.sidebar-user-role{font-size:11px;color:var(--muted)}

/* CONTENT */
.content{flex:1;min-width:0;display:flex;flex-direction:column}

/* TOPBAR */
.topbar{
  background:var(--card);border-bottom:1px solid var(--border);
  padding:16px 32px;display:flex;justify-content:space-between;align-items:center;
  position:sticky;top:0;z-index:10;
}
.topbar-left h2{font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:var(--text);letter-spacing:-0.02em}
.topbar-left p{font-size:13px;color:var(--muted);margin-top:1px}
.topbar-date{font-size:13px;color:var(--muted);font-weight:500;background:var(--bg);padding:8px 14px;border-radius:99px;border:1px solid var(--border)}

/* MAIN */
.main{padding:28px 32px;flex:1}

/* TOP CARDS */
.top-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.top-card{border-radius:var(--r);padding:22px 20px;color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow)}
.top-card::after{content:'';position:absolute;right:-16px;top:-16px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.12)}
.top-card-icon{font-size:28px;margin-bottom:10px;position:relative;z-index:1}
.top-card-val{font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;letter-spacing:-0.02em;line-height:1;position:relative;z-index:1}
.top-card-label{font-size:12px;font-weight:600;opacity:0.85;margin-top:4px;position:relative;z-index:1}
.top-card-sub{font-size:11px;opacity:0.65;margin-top:2px;position:relative;z-index:1}

/* GRID */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.grid-3{display:grid;grid-template-columns:3fr 2fr;gap:20px;margin-bottom:20px}

/* CARD */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:24px;box-shadow:var(--shadow)}
.card-title{font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;color:var(--text);margin-bottom:18px;display:flex;align-items:center;justify-content:space-between}
.card-title-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:4px 10px;border-radius:99px;background:var(--purple-light);color:var(--purple)}

/* SEMANA */
.semana-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
.dia-card{
  border:1.5px solid var(--border);border-radius:12px;padding:12px 8px;
  text-align:center;cursor:pointer;transition:all 0.18s;
  display:flex;flex-direction:column;align-items:center;gap:5px;
  background:#FAFBFF;min-height:115px;
}
.dia-card:hover:not(.dia-descanso){transform:translateY(-3px);box-shadow:0 8px 20px rgba(124,58,237,0.12);border-color:#A78BFA}
.dia-hoje{border-color:var(--purple) !important;background:var(--purple-light)}
.dia-feito{background:#F0FDF9;border-color:var(--green) !important}
.dia-descanso{opacity:0.4;cursor:default}
.dia-topo{width:100%;display:flex;justify-content:space-between;align-items:center}
.dia-nome{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)}
.badge-hoje{font-size:7px;font-weight:800;background:var(--purple);color:#fff;border-radius:20px;padding:2px 6px}
.dia-icone-wrap{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1.5px solid transparent;transition:all 0.15s}
.dia-tipo{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em}
.dia-hora{font-size:9px;color:var(--muted);font-weight:500}
.dia-status{font-size:9px;font-weight:700;padding:3px 8px;border-radius:99px;margin-top:auto}
.dia-status-ok{}
.dia-status-open{background:#F1F5F9;color:var(--muted)}

/* PROG */
.prog-wrap{background:var(--bg);border-radius:99px;height:8px;margin:12px 0 6px;overflow:hidden}
.prog-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--purple),#A78BFA);transition:width 0.6s}
.prog-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);font-weight:600}
.prog-pct{color:var(--purple) !important}

/* CALENDÁRIO */
.cal-hdr{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px}
.cal-hdr span{text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);padding:3px 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-d{
  aspect-ratio:1;border-radius:7px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-size:11px;font-weight:600;color:var(--text);
  background:#F8F9FF;border:1px solid transparent;position:relative;
}
.cal-hoje{border-color:var(--purple);color:var(--purple);font-weight:800}
.cal-feito{background:var(--green-light);color:#065F46}
.cal-pendente{background:var(--amber-light);color:#92400E}
.cal-d i{position:absolute;bottom:1px;right:2px;font-size:7px;color:var(--green);font-style:normal;font-weight:800}
.cal-legenda{display:flex;gap:14px;margin-top:10px}
.cal-legenda span{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);font-weight:600}
.cal-legenda b{width:10px;height:10px;border-radius:3px;display:inline-block;flex-shrink:0}

/* CORRIDA */
.plano-pill{
  display:inline-flex;align-items:center;gap:12px;
  background:linear-gradient(135deg,#7C3AED,#A78BFA);
  border-radius:12px;padding:14px 18px;margin-bottom:16px;width:100%;
}
.plano-num{font-family:'Outfit',sans-serif;font-size:30px;font-weight:800;color:#fff;line-height:1}
.plano-ttl{font-size:13px;font-weight:700;color:rgba(255,255,255,0.9)}
.plano-sub{font-size:11px;color:rgba(255,255,255,0.6);margin-top:1px}
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:100px;padding-top:16px}
.bar-item{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.bar-km{font-size:8px;font-weight:700;color:var(--purple);margin-bottom:3px}
.bar-outer{flex:1;width:100%;background:var(--bg);border-radius:5px;overflow:hidden;display:flex;align-items:flex-end}
.bar-inner{width:100%;background:linear-gradient(180deg,#A78BFA,#7C3AED);border-radius:5px;min-height:4px;transition:height 0.5s}
.bar-lbl{font-size:8px;color:var(--muted);margin-top:4px;white-space:nowrap}
.corrida-empty{text-align:center;padding:20px 0;color:var(--muted);font-size:13px}

/* PRÓXIMO */
.proximo-wrap{display:flex;align-items:center;gap:16px;background:var(--bg);border-radius:12px;padding:16px}
.proximo-icone-big{font-size:40px}
.proximo-quando{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--purple);margin-bottom:4px}
.proximo-tipo{font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:var(--text)}
.proximo-hora{font-size:12px;color:var(--muted);margin-top:2px;font-weight:500}

/* DICA */
.dica-wrap{background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-radius:12px;padding:18px}
.dica-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#B45309;margin-bottom:8px}
.dica-texto{font-size:14px;line-height:1.65;color:#78350F;font-style:italic;font-weight:500}
.dica-cat{font-size:10px;color:#B45309;margin-top:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em}

/* REGISTRO */
.reg-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);margin-bottom:20px}
.reg-header{background:linear-gradient(135deg,#4C1D95,#7C3AED);padding:22px 28px}
.reg-header h3{font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:#fff}
.reg-header p{font-size:13px;color:rgba(255,255,255,0.6);margin-top:3px}
.reg-body{padding:28px}
.reg-sec{margin-bottom:22px}
.reg-sec-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--muted);margin-bottom:10px}
.tipo-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.tipo-btn{
  border:2px solid var(--border);border-radius:12px;padding:14px 8px;
  text-align:center;cursor:pointer;transition:all 0.15s;background:#FAFBFF;
  display:flex;flex-direction:column;align-items:center;gap:6px;
}
.tipo-btn:hover{border-color:#A78BFA;background:var(--purple-light);transform:translateY(-2px)}
.tipo-btn.selected{border-color:var(--purple);background:var(--purple-light)}
.tipo-icon{font-size:24px}
.tipo-nome{font-size:10px;font-weight:700;color:var(--text);line-height:1.2}
.fields-row{display:flex;gap:12px;flex-wrap:wrap}
.field-group{display:flex;flex-direction:column;gap:6px;flex:1;min-width:130px}
.field-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}
.field-input{
  border:2px solid var(--border);border-radius:10px;padding:11px 14px;
  font-size:14px;font-family:'DM Sans',sans-serif;background:#FAFBFF;color:var(--text);
  outline:none;transition:border-color 0.15s;width:100%;
}
.field-input:focus{border-color:var(--purple)}
.humor-row{display:flex;gap:8px}
.humor-btn{
  flex:1;border:2px solid var(--border);border-radius:10px;padding:12px 8px;
  text-align:center;cursor:pointer;font-size:22px;transition:all 0.15s;background:#FAFBFF;
}
.humor-btn:hover{transform:scale(1.1);border-color:#A78BFA}
.humor-btn.selected{border-color:var(--purple);background:var(--purple-light)}
textarea.field-input{resize:vertical;min-height:80px;font-size:13px;line-height:1.5}
.btn-salvar{
  width:100%;background:linear-gradient(135deg,#4C1D95,#7C3AED);color:#fff;
  border:none;border-radius:10px;padding:15px;
  font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;
  cursor:pointer;transition:opacity 0.15s;letter-spacing:0.02em;margin-top:6px;
}
.btn-salvar:hover{opacity:0.88}
.btn-salvar:active{transform:scale(0.99)}

/* NOTIF */
#notif{
  position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);
  background:#1E2235;color:#fff;padding:14px 28px;border-radius:99px;
  font-size:14px;font-weight:700;opacity:0;transition:all 0.3s ease;
  pointer-events:none;z-index:100;white-space:nowrap;font-family:'DM Sans',sans-serif;
  box-shadow:0 8px 30px rgba(0,0,0,0.2);
}
#notif.show{opacity:1;transform:translateX(-50%) translateY(0)}

@media(max-width:1100px){
  .sidebar{width:200px}
  .top-cards{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:860px){
  .sidebar{display:none}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .semana-grid{grid-template-columns:repeat(4,1fr)}
  .tipo-grid{grid-template-columns:repeat(3,1fr)}
  .main{padding:20px 16px}
}
</style>
</head>
<body>

<!-- SIDEBAR -->
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="sidebar-logo-name">Treinos</div>
    <div class="sidebar-logo-sub">Renato Campos</div>
  </div>
  <div class="sidebar-section">Menu</div>
  <div class="sidebar-item active"><span class="sidebar-item-icon">📊</span>Dashboard</div>
  <div class="sidebar-item" onclick="document.getElementById('sec-semana').scrollIntoView({behavior:'smooth'})"><span class="sidebar-item-icon">📅</span>Semana</div>
  <div class="sidebar-item" onclick="document.getElementById('sec-corrida').scrollIntoView({behavior:'smooth'})"><span class="sidebar-item-icon">🏃</span>Corrida</div>
  <div class="sidebar-item" onclick="document.getElementById('sec-registro').scrollIntoView({behavior:'smooth'})"><span class="sidebar-item-icon">✏️</span>Registrar</div>
  <div class="sidebar-section">Plano</div>
  <div class="sidebar-item"><span class="sidebar-item-icon">💪</span>Academia</div>
  <div class="sidebar-item"><span class="sidebar-item-icon">🎾</span>Beach Tennis</div>
  <div class="sidebar-bottom">
    <div class="sidebar-user">
      <div class="sidebar-avatar">RC</div>
      <div>
        <div class="sidebar-user-name">Renato</div>
        <div class="sidebar-user-role">Niterói, RJ</div>
      </div>
    </div>
  </div>
</div>

<!-- CONTENT -->
<div class="content">
  <div class="topbar">
    <div class="topbar-left">
      <h2>Dashboard</h2>
      <p>Acompanhe sua evolução diária</p>
    </div>
    <div class="topbar-date">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>

  <div class="main">

    <!-- TOP CARDS -->
    <div class="top-cards">${topCards}</div>

    <!-- SEMANA -->
    <div class="card" id="sec-semana" style="margin-bottom:20px">
      <div class="card-title">
        Semana atual
        <span class="card-title-badge">${feitasSemana}/${possiveisSemana} treinos</span>
      </div>
      <div class="semana-grid">${semanaCells}</div>
      <div style="margin-top:16px">
        <div class="prog-labels">
          <span>${feitasSemana} de ${possiveisSemana} treinos concluídos</span>
          <span class="prog-pct">${pctSemana}%</span>
        </div>
        <div class="prog-wrap"><div class="prog-fill" style="width:${pctSemana}%"></div></div>
      </div>
    </div>

    <!-- PRÓXIMO + DICA -->
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Próximo treino</div>
        ${proximo ? `
        <div class="proximo-wrap">
          <div class="proximo-icone-big">${proximo.icone}</div>
          <div>
            <div class="proximo-quando">${proximoLabel}</div>
            <div class="proximo-tipo">${proximo.tipo}</div>
            <div class="proximo-hora">${proximo.horario}</div>
          </div>
        </div>` : '<p style="color:var(--muted);font-size:13px">Sem treinos previstos.</p>'}
      </div>
      <div class="card">
        <div class="card-title">Dica do dia</div>
        <div class="dica-wrap">
          <div class="dica-label">💡 Para você</div>
          <div class="dica-texto">"${dica.texto}"</div>
          <div class="dica-cat">#${dica.categoria}</div>
        </div>
      </div>
    </div>

    <!-- CALENDÁRIO + CORRIDA -->
    <div class="grid-3" id="sec-corrida">
      <div class="card">
        <div class="card-title">Calendário — ${anoMes}</div>
        <div class="cal-hdr">
          ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=>`<span>${x}</span>`).join('')}
        </div>
        <div class="cal-grid">${calCells.map(x=>calCell(x)).join('')}</div>
        <div class="cal-legenda">
          <span><b style="background:var(--green-light);border:1px solid var(--green)"></b>Feito</span>
          <span><b style="background:var(--amber-light);border:1px solid #FCD34D"></b>Pendente</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Progresso corrida</div>
        <div class="plano-pill">
          <div class="plano-num">${semanaPlano}</div>
          <div>
            <div class="plano-ttl">Semana ${semanaPlano} de 8</div>
            <div class="plano-sub">Fase: ${faseAtual}</div>
          </div>
        </div>
        ${kmPorSemana.length>0
          ? `<div class="bar-chart">${barras}</div>`
          : `<div class="corrida-empty"><div style="font-size:32px;margin-bottom:8px">🏃</div>Registre sua primeira corrida com distância para ver o progresso aqui.</div>`
        }
      </div>
    </div>

    <!-- REGISTRO -->
    <div class="reg-card" id="sec-registro">
      <div class="reg-header">
        <h3>Registrar treino</h3>
        <p>Como foi hoje? Conta pra mim.</p>
      </div>
      <div class="reg-body">
        <form method="POST" action="/treino" id="formTreino">
          <input type="hidden" name="concluido" value="true">
          <input type="hidden" name="tipo" id="tipoHidden">

          <div class="reg-sec">
            <div class="reg-sec-label">Qual treino foi hoje?</div>
            <div class="tipo-grid">
              ${[
                {val:'Corrida leve',      icon:'🏃', nome:'Corrida'},
                {val:'Academia — sup. A', icon:'💪', nome:'Superior A'},
                {val:'Academia — sup. B', icon:'💪', nome:'Superior B'},
                {val:'Academia — inf.',   icon:'🦵', nome:'Inferior'},
                {val:'Beach tennis',      icon:'🎾', nome:'Beach'},
              ].map(t=>`
                <label class="tipo-btn" onclick="selectTipo(this,'${t.val}')">
                  <div class="tipo-icon">${t.icon}</div>
                  <div class="tipo-nome">${t.nome}</div>
                </label>`).join('')}
            </div>
          </div>

          <div class="reg-sec">
            <div class="reg-sec-label">Data</div>
            <input type="date" name="data" value="${hojeS}" class="field-input" style="max-width:200px">
          </div>

          <div class="reg-sec">
            <div class="reg-sec-label">Detalhes opcionais</div>
            <div class="fields-row">
              <div class="field-group">
                <div class="field-label">Duração</div>
                <input type="number" name="duracao_min" placeholder="minutos" class="field-input" min="1" max="300">
              </div>
              <div class="field-group">
                <div class="field-label">Distância</div>
                <input type="number" name="distancia_km" placeholder="km" class="field-input" min="0" max="50" step="0.1">
              </div>
            </div>
          </div>

          <div class="reg-sec">
            <div class="reg-sec-label">Como você se sentiu?</div>
            <div class="humor-row">
              ${[
                {val:'ótimo',   icon:'🔥'},
                {val:'bem',     icon:'😊'},
                {val:'ok',      icon:'😐'},
                {val:'cansado', icon:'😓'},
                {val:'difícil', icon:'😤'},
              ].map(h=>`<label class="humor-btn" onclick="selectHumor(this,'${h.val}')">${h.icon}</label>`).join('')}
            </div>
            <input type="hidden" id="humorHidden">
          </div>

          <div class="reg-sec" style="margin-bottom:18px">
            <div class="reg-sec-label">Observações</div>
            <textarea name="nota" class="field-input" id="notaField"
              placeholder="Como foi? Joelho ok? Ritmo bom? Qualquer coisa que queira lembrar depois..."></textarea>
          </div>

          <button type="submit" class="btn-salvar">Salvar treino ✓</button>
        </form>
      </div>
    </div>

  </div>
</div>

<div id="notif"></div>

<script>
function selectTipo(el, val) {
  document.querySelectorAll('.tipo-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('tipoHidden').value = val;
  const nota = document.getElementById('notaField');
  if (!nota.value) {
    if (val.includes('Corrida')) nota.placeholder = 'Ritmo ok? Joelho tranquilo? Quanto rodou?';
    else if (val.includes('Beach')) nota.placeholder = 'Jogo bom? Parceiros? Algum destaque?';
    else nota.placeholder = 'Carga boa? Algum exercício que sentiu mais? Joelho ok?';
  }
}
function selectHumor(el, val) {
  document.querySelectorAll('.humor-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('humorHidden').value = val;
  const nota = document.getElementById('notaField');
  const cur = nota.value.replace(/^\[.*?\]\s*/,'');
  nota.value = '['+val+'] '+cur;
}
function toggleTreino(data, tipo) {
  fetch('/treino/toggle',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({data,tipo})
  }).then(r=>r.json()).then(res=>{
    showNotif(res.concluido ? '✓ Treino marcado como feito!' : 'Treino desmarcado.');
    setTimeout(()=>location.reload(), 900);
  });
}
function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2800);
}
document.getElementById('formTreino').addEventListener('submit', function(e) {
  if (!document.getElementById('tipoHidden').value) {
    e.preventDefault();
    showNotif('⚠ Seleciona o tipo de treino primeiro!');
  }
});
</script>
</body>
</html>`;
}

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log('Dashboard rodando na porta ' + PORT));
}).catch(e => {
  console.error('Erro ao inicializar banco:', e);
  process.exit(1);
});
