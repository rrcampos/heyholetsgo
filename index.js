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
      ['Hidratação é treino também. Beba água antes, durante e depois de correr.', 'corrida'],
      ['Na dúvida, vai mais devagar. Consistência bate intensidade toda semana.', 'geral'],
      ['O joelho avisa antes de doer sério. Presta atenção nos sinais do corpo.', 'joelho'],
      ['Aquecimento de 5 min antes da corrida reduz muito o risco de lesão.', 'corrida'],
      ['Semana ruim não quebra sequência boa. Amanhã é um novo treino.', 'mental'],
      ['Proteína nas 2h após academia potencializa a recuperação muscular.', 'nutrição'],
      ['Beach tennis é treino completo — cardio, reflexo e equilíbrio ao mesmo tempo.', 'beach'],
      ['Descanso não é preguiça. É parte do plano.', 'recuperação'],
      ['Correr na praia de manhã é um privilégio. Aproveita cada vez.', 'corrida'],
      ['Ritmo de conversa = ritmo certo. Se não consegue falar, está rápido demais.', 'corrida'],
      ['O treino que você faz consistentemente supera o treino perfeito que você pula.', 'mental'],
      ['Semana com 5 atividades já é elite. Constância é tudo.', 'geral'],
      ['Academia de superior duas vezes por semana: deixa 48h entre os treinos.', 'academia'],
      ['Inferior no sábado longe do beach de quarta — joelho agradece.', 'joelho'],
      ['Cada semana do plano de corrida é uma semana que seu joelho ficou mais forte.', 'corrida'],
      ['Progressão de corrida: tempo primeiro, ritmo depois. Nunca os dois juntos.', 'corrida'],
      ['Dor muscular é adaptação. Dor articular é sinal. Aprende a diferença.', 'joelho'],
      ['Core forte = joelho protegido. Abdômen forte tira sobrecarga da perna.', 'academia'],
      ['Sábado de academia cedo deixa o fim de semana livre. Melhor dos dois mundos.', 'geral'],
      ['Cada check no calendário prova que você é o tipo de pessoa que treina.', 'mental'],
    ];
    for (const [texto, categoria] of dicas) {
      await pool.query('INSERT INTO dicas (texto, categoria) VALUES ($1, $2)', [texto, categoria]);
    }
  }
  console.log('Banco inicializado.');
}

const ROTINA = {
  1: { tipo: 'Corrida leve',      icone: '🏃', horario: '17h',  label: 'Corrida' },
  2: { tipo: 'Academia — sup. A', icone: '💪', horario: '11h',  label: 'Academia' },
  3: { tipo: 'Beach tennis',      icone: '🎾', horario: '20h',  label: 'Beach' },
  4: { tipo: 'Academia — sup. B', icone: '💪', horario: '11h',  label: 'Academia' },
  5: { tipo: 'Corrida leve',      icone: '🏃', horario: '10h',  label: 'Corrida' },
  6: { tipo: 'Academia — inf.',   icone: '🦵', horario: '9h',   label: 'Academia' },
  0: { tipo: 'Descanso',          icone: '😴', horario: '—',    label: 'Descanso' },
};

const DIAS_PT = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function semanaAtual() {
  const hoje = new Date();
  const dow = hoje.getDay();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - ((dow === 0 ? 7 : dow) - 1));
  const sab = new Date(seg);
  sab.setDate(seg.getDate() + 6);
  return { inicio: seg.toISOString().slice(0, 10), fim: sab.toISOString().slice(0, 10) };
}

async function getDicaHoje() {
  const hoje = new Date();
  const { rows } = await pool.query('SELECT texto, categoria FROM dicas ORDER BY id');
  if (!rows.length) return { texto: 'Continue firme.', categoria: 'geral' };
  return rows[hoje.getDate() % rows.length];
}

async function getStats() {
  const semana = semanaAtual();
  const [totalR, semanaR, streakR, corridaR] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM treinos WHERE concluido = true'),
    pool.query('SELECT * FROM treinos WHERE data >= $1 AND data <= $2 ORDER BY data ASC', [semana.inicio, semana.fim]),
    pool.query(`
      WITH RECURSIVE seq AS (
        SELECT CURRENT_DATE as d, 0 as n
        UNION ALL
        SELECT (d - INTERVAL '1 day')::date, n+1 FROM seq WHERE n < 60
      )
      SELECT COUNT(*) as streak FROM seq
      WHERE EXISTS (
        SELECT 1 FROM treinos WHERE data = seq.d AND concluido = true
      ) AND n <= (
        SELECT COALESCE(MIN(n), 0) FROM seq s2
        WHERE NOT EXISTS (
          SELECT 1 FROM treinos WHERE data = s2.d AND concluido = true
        ) AND s2.n > 0
      )
    `),
    pool.query(`
      SELECT DATE_TRUNC('week', data)::date as semana, SUM(distancia_km) as km
      FROM treinos
      WHERE tipo ILIKE '%corrida%' AND concluido = true AND distancia_km IS NOT NULL
      GROUP BY semana ORDER BY semana ASC
    `),
  ]);
  return {
    total: parseInt(totalR.rows[0].count),
    semana: semanaR.rows,
    streak: parseInt(streakR.rows[0].streak) || 0,
    corridas: corridaR.rows,
  };
}

async function getCalendarioMes() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    'SELECT data::text, tipo, concluido FROM treinos WHERE data >= $1 AND data <= $2',
    [inicio, fim]
  );
  return rows;
}

function proximoTreino() {
  const hoje = new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dow = d.getDay();
    const r = ROTINA[dow];
    if (r && r.tipo !== 'Descanso') {
      return { ...r, data: d.toISOString().slice(0, 10), dia: DIAS_PT[dow], daqui: i };
    }
  }
  return null;
}

app.get('/', async (req, res) => {
  try {
    const [stats, calendario, dica] = await Promise.all([
      getStats(), getCalendarioMes(), getDicaHoje()
    ]);
    const proximo = proximoTreino();
    const hoje = new Date();
    const anoMes = `${MESES_PT[hoje.getMonth()]} ${hoje.getFullYear()}`;
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const primeiroDow = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getDay();
    const primeiroDowSeg = primeiroDow === 0 ? 6 : primeiroDow - 1;

    const treinosMap = {};
    for (const t of calendario) {
      const d = t.data.slice(0, 10);
      if (!treinosMap[d]) treinosMap[d] = [];
      treinosMap[d].push(t);
    }

    const semana = semanaAtual();
    const treinosSemMap = {};
    for (const t of stats.semana) {
      const d = (t.data.slice ? t.data.slice(0, 10) : t.data);
      treinosSemMap[d] = t;
    }

    const diasSemana = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(semana.inicio);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      diasSemana.push({
        data: ds, dow,
        diaNome: DIAS_SHORT[dow],
        dia: d.getDate(),
        rotina: ROTINA[dow],
        treino: treinosSemMap[ds] || null,
        hoje: ds === hojeStr(),
      });
    }

    const feitasSemana = diasSemana.filter(d => d.treino?.concluido).length;
    const possiveisSemana = diasSemana.filter(d => d.rotina?.tipo !== 'Descanso').length;
    const pctSemana = possiveisSemana > 0 ? Math.round((feitasSemana / possiveisSemana) * 100) : 0;

    const kmPorSemana = stats.corridas.map(r => ({
      semana: r.semana, km: parseFloat(r.km || 0).toFixed(1)
    }));
    const semanaPlano = Math.min(kmPorSemana.length + 1, 8);
    const faseAtual = semanaPlano <= 2 ? 'Base' : semanaPlano <= 5 ? 'Construção' : 'Consolidação';

    const maxKm = Math.max(...kmPorSemana.map(k => parseFloat(k.km)), 5);

    // motivational header text
    const horaAtual = new Date().getHours();
    const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
    const motivacional = [
      'Cada treino conta. Cada dia importa.',
      'Você escolheu se mover. Isso já é tudo.',
      'Constância vence talento toda semana.',
      'Um passo de cada vez. Mas não para.',
      'O corpo lembra de tudo que você faz por ele.',
    ][hoje.getDay() % 5];

    res.send(renderHTML({
      stats, dica, proximo, diasSemana,
      feitasSemana, possiveisSemana, pctSemana,
      anoMes, diasNoMes, primeiroDowSeg,
      treinosMap, hoje: hojeStr(),
      kmPorSemana, semanaPlano, faseAtual, maxKm,
      saudacao, motivacional,
    }));
  } catch (e) {
    console.error(e);
    res.status(500).send('<pre style="padding:2rem;font-size:14px">' + e.message + '</pre>');
  }
});

app.post('/treino', async (req, res) => {
  const { data, tipo, concluido, nota, duracao_min, distancia_km } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM treinos WHERE data = $1 AND tipo = $2', [data, tipo]);
    if (existing.rows.length) {
      await pool.query(
        'UPDATE treinos SET concluido=$1, nota=$2, duracao_min=$3, distancia_km=$4 WHERE id=$5',
        [concluido === 'true', nota || null, duracao_min || null, distancia_km || null, existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO treinos (data, tipo, concluido, nota, duracao_min, distancia_km) VALUES ($1,$2,$3,$4,$5,$6)',
        [data, tipo, concluido === 'true', nota || null, duracao_min || null, distancia_km || null]
      );
    }
    res.redirect('/');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post('/treino/toggle', async (req, res) => {
  const { data, tipo } = req.body;
  try {
    const existing = await pool.query('SELECT id, concluido FROM treinos WHERE data = $1 AND tipo = $2', [data, tipo]);
    if (existing.rows.length) {
      const novo = !existing.rows[0].concluido;
      await pool.query('UPDATE treinos SET concluido=$1 WHERE id=$2', [novo, existing.rows[0].id]);
      res.json({ ok: true, concluido: novo });
    } else {
      await pool.query('INSERT INTO treinos (data, tipo, concluido) VALUES ($1,$2,true)', [data, tipo]);
      res.json({ ok: true, concluido: true });
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

function renderHTML(d) {
  const {
    stats, dica, proximo, diasSemana,
    feitasSemana, possiveisSemana, pctSemana,
    anoMes, diasNoMes, primeiroDowSeg,
    treinosMap, hoje,
    kmPorSemana, semanaPlano, faseAtual, maxKm,
    saudacao, motivacional,
  } = d;

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  function pad(n) { return String(n).padStart(2, '0'); }

  function calCell(day) {
    if (!day) return `<div></div>`;
    const ds = `${anoAtual}-${pad(mesAtual+1)}-${pad(day)}`;
    const treinos = treinosMap[ds] || [];
    const feito = treinos.some(t => t.concluido);
    const pendente = treinos.length > 0 && !feito;
    const isHoje = ds === hoje;
    let cls = 'cal-d';
    if (isHoje) cls += ' cal-hoje';
    if (feito) cls += ' cal-feito';
    else if (pendente) cls += ' cal-pendente';
    return `<div class="${cls}">${day}${feito ? '<i>✓</i>' : ''}</div>`;
  }

  const calCells = [];
  for (let i = 0; i < primeiroDowSeg; i++) calCells.push(null);
  for (let d2 = 1; d2 <= diasNoMes; d2++) calCells.push(d2);

  const semanaCells = diasSemana.map(d2 => {
    const isDescanso = d2.rotina?.tipo === 'Descanso';
    const feito = d2.treino?.concluido;
    let cls = 'dia';
    if (d2.hoje) cls += ' dia-hoje';
    if (feito) cls += ' dia-feito';
    if (isDescanso) cls += ' dia-descanso';

    return `<div class="${cls}" ${!isDescanso ? `onclick="toggleTreino('${d2.data}','${d2.rotina?.tipo}')"` : ''}>
      <div class="dia-top">
        <span class="dia-nome">${d2.diaNome}</span>
        ${d2.hoje ? '<span class="badge-hoje">hoje</span>' : ''}
      </div>
      <div class="dia-icone">${d2.rotina?.icone}</div>
      <div class="dia-label">${isDescanso ? 'descanso' : d2.rotina?.label}</div>
      ${!isDescanso ? `<div class="dia-hora">${d2.rotina?.horario}</div>` : ''}
      ${feito ? '<div class="dia-check">✓</div>' : (!isDescanso ? '<div class="dia-open">○</div>' : '')}
      ${d2.treino?.nota ? `<div class="dia-nota">${d2.treino.nota}</div>` : ''}
    </div>`;
  }).join('');

  const barras = kmPorSemana.slice(-8).map(k => {
    const pct = Math.round((parseFloat(k.km) / maxKm) * 100);
    const dt = new Date(k.semana);
    return `<div class="bar-item">
      <div class="bar-km">${k.km}</div>
      <div class="bar-outer"><div class="bar-inner" style="height:${Math.max(pct,3)}%"></div></div>
      <div class="bar-week">${dt.getDate()}/${dt.getMonth()+1}</div>
    </div>`;
  }).join('');

  const proximoLabel = proximo
    ? (proximo.daqui === 0 ? 'Hoje' : proximo.daqui === 1 ? 'Amanhã' : `${proximo.dia}`)
    : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Treinos · Renato</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#f6f5f1;
  --card:#fff;
  --border:#e9e7e1;
  --text:#1c1c1c;
  --muted:#9a9690;
  --green:#2a7a57;
  --green-mid:#3d9e72;
  --green-light:#e8f5ee;
  --green-xlight:#f2faf5;
  --amber:#b86b1a;
  --amber-light:#fef3e2;
  --blue:#3a4a7a;
  --blue-light:#edf0fa;
  --red:#c0392b;
  --r:16px;
  --r-sm:10px;
}
body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}

/* HERO */
.hero{
  background:linear-gradient(135deg,#1e3a2f 0%,#2a7a57 60%,#3d9e72 100%);
  padding:40px 32px 56px;
  position:relative;
  overflow:hidden;
}
.hero::after{
  content:'';position:absolute;bottom:-2px;left:0;right:0;height:32px;
  background:var(--bg);border-radius:32px 32px 0 0;
}
.hero-saudacao{font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px}
.hero-nome{font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.02em;line-height:1.1;margin-bottom:4px}
.hero-frase{font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:32px}
.hero-stats{display:flex;gap:20px}
.hero-stat{background:rgba(255,255,255,0.12);border-radius:14px;padding:16px 20px;min-width:110px;border:1px solid rgba(255,255,255,0.15)}
.hero-stat-val{font-size:36px;font-weight:800;color:#fff;letter-spacing:-0.03em;line-height:1}
.hero-stat-label{font-size:11px;color:rgba(255,255,255,0.55);font-weight:600;margin-top:4px;letter-spacing:0.04em;text-transform:uppercase}
.hero-streak{background:rgba(255,255,255,0.18);border-color:rgba(255,255,255,0.3)}
.hero-streak .hero-stat-val{color:#a8f0c6}

/* MAIN */
.main{max-width:1080px;margin:0 auto;padding:24px 20px 60px}

/* CARDS GRID */
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
.grid-3{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:20px}

/* CARD */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px}
.card-title{font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;display:flex;align-items:center;gap:7px}
.card-title::before{content:'';width:12px;height:2px;background:var(--green);border-radius:2px;display:block}

/* PRÓXIMO */
.proximo-quando{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin-bottom:8px}
.proximo-icone{font-size:44px;line-height:1;margin-bottom:8px}
.proximo-tipo{font-size:20px;font-weight:800;color:var(--text);letter-spacing:-0.01em}
.proximo-hora{font-size:13px;color:var(--muted);margin-top:4px}

/* SEMANA */
.semana-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.dia{
  border:1.5px solid var(--border);border-radius:var(--r-sm);
  padding:10px 6px;text-align:center;cursor:pointer;
  transition:all 0.18s ease;display:flex;flex-direction:column;align-items:center;gap:3px;
  min-height:100px;position:relative;user-select:none;
  background:#fafaf7;
}
.dia:hover{border-color:var(--green-mid);transform:translateY(-2px);box-shadow:0 4px 16px rgba(42,122,87,0.12)}
.dia-hoje{border-color:var(--green);background:var(--green-xlight)}
.dia-feito{background:var(--green-light);border-color:var(--green)}
.dia-descanso{opacity:0.45;cursor:default}
.dia-descanso:hover{transform:none;box-shadow:none;border-color:var(--border)}
.dia-top{width:100%;display:flex;justify-content:space-between;align-items:center}
.dia-nome{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)}
.badge-hoje{font-size:7px;font-weight:800;background:var(--green);color:#fff;border-radius:20px;padding:1px 5px;letter-spacing:0.04em}
.dia-icone{font-size:22px;margin:4px 0 2px}
.dia-label{font-size:9px;font-weight:700;color:var(--text)}
.dia-hora{font-size:8px;color:var(--muted)}
.dia-check{font-size:16px;color:var(--green);font-weight:800;margin-top:2px}
.dia-open{font-size:14px;color:#ccc;margin-top:2px}
.dia-nota{font-size:7px;color:var(--muted);font-style:italic;margin-top:3px;line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* PROG SEMANA */
.prog-wrap{background:var(--bg);border-radius:99px;height:10px;margin:12px 0 6px;overflow:hidden}
.prog-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--green-mid));transition:width 0.6s ease}
.prog-label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);font-weight:600}
.prog-pct{color:var(--green)}

/* CALENDÁRIO */
.cal-header{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}
.cal-header span{text-align:center;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);padding:3px 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-d{
  aspect-ratio:1;border-radius:7px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;font-size:11px;font-weight:600;
  color:var(--text);background:#f7f6f2;border:1px solid transparent;position:relative;
}
.cal-hoje{border-color:var(--green);font-weight:800;color:var(--green)}
.cal-feito{background:var(--green-light);color:var(--green);font-weight:700}
.cal-pendente{background:var(--amber-light);color:var(--amber)}
.cal-d i{position:absolute;bottom:1px;right:2px;font-size:7px;color:var(--green);font-style:normal;font-weight:800}
.cal-legenda{display:flex;gap:12px;margin-top:10px;font-size:10px;color:var(--muted)}
.cal-legenda span{display:flex;align-items:center;gap:5px}
.cal-legenda b{width:10px;height:10px;border-radius:3px;display:inline-block}

/* DICA */
.dica-card{background:var(--amber-light);border:1px solid #f0d9b0;border-radius:var(--r);padding:22px}
.dica-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--amber);margin-bottom:10px}
.dica-texto{font-size:15px;line-height:1.65;color:#5a3a10;font-style:italic;font-weight:500}
.dica-cat{font-size:10px;color:#c48a3a;margin-top:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em}

/* CORRIDA */
.plano-badge{
  display:inline-flex;align-items:center;gap:10px;
  background:var(--green-light);border-radius:10px;padding:12px 16px;margin-bottom:14px;width:100%;
}
.plano-num{font-size:28px;font-weight:800;color:var(--green);line-height:1}
.plano-info-titulo{font-size:13px;font-weight:700;color:var(--green)}
.plano-info-sub{font-size:11px;color:#3d8a62;margin-top:1px}
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:110px;padding-top:20px}
.bar-item{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.bar-km{font-size:8px;font-weight:700;color:var(--green);margin-bottom:3px}
.bar-outer{flex:1;width:100%;background:var(--bg);border-radius:5px;overflow:hidden;display:flex;align-items:flex-end}
.bar-inner{width:100%;background:linear-gradient(180deg,var(--green-mid),var(--green));border-radius:5px;min-height:4px;transition:height 0.5s ease}
.bar-week{font-size:8px;color:var(--muted);margin-top:4px;white-space:nowrap}
.corrida-empty{text-align:center;padding:24px 0;color:var(--muted);font-size:13px}
.corrida-empty div:first-child{font-size:32px;margin-bottom:8px}

/* REGISTRO */
.reg-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.reg-header{background:linear-gradient(135deg,#1e3a2f,#2a7a57);padding:20px 24px}
.reg-header h3{font-size:16px;font-weight:800;color:#fff;margin-bottom:2px}
.reg-header p{font-size:12px;color:rgba(255,255,255,0.6)}
.reg-body{padding:24px}
.reg-section{margin-bottom:20px}
.reg-section-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:10px}
.tipo-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:0}
.tipo-btn{
  border:1.5px solid var(--border);border-radius:10px;padding:10px 6px;
  text-align:center;cursor:pointer;transition:all 0.15s;background:#fafaf7;
  display:flex;flex-direction:column;align-items:center;gap:4px;
}
.tipo-btn:hover{border-color:var(--green);background:var(--green-xlight)}
.tipo-btn.selected{border-color:var(--green);background:var(--green-light)}
.tipo-btn input{display:none}
.tipo-icon{font-size:20px}
.tipo-nome{font-size:9px;font-weight:700;color:var(--text);text-align:center;line-height:1.2}
.fields-row{display:flex;gap:10px;flex-wrap:wrap}
.field-group{display:flex;flex-direction:column;gap:5px;flex:1;min-width:120px}
.field-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em}
.field-input{
  border:1.5px solid var(--border);border-radius:9px;padding:10px 13px;
  font-size:14px;font-family:inherit;background:var(--bg);color:var(--text);
  outline:none;transition:border-color 0.15s;width:100%;
}
.field-input:focus{border-color:var(--green)}
.humor-row{display:flex;gap:8px}
.humor-btn{
  flex:1;border:1.5px solid var(--border);border-radius:9px;padding:10px;
  text-align:center;cursor:pointer;font-size:20px;transition:all 0.15s;background:#fafaf7;
}
.humor-btn:hover{transform:scale(1.08)}
.humor-btn.selected{border-color:var(--green);background:var(--green-light)}
.humor-btn input{display:none}
textarea.field-input{resize:vertical;min-height:70px;font-size:13px}
.btn-salvar{
  width:100%;background:linear-gradient(135deg,#1e3a2f,#2a7a57);color:#fff;
  border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:800;
  cursor:pointer;transition:opacity 0.15s;letter-spacing:0.02em;margin-top:4px;
}
.btn-salvar:hover{opacity:0.88}
.btn-salvar:active{transform:scale(0.99)}

/* NOTIF */
#notif{
  position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);
  background:#1e3a2f;color:#fff;padding:14px 28px;border-radius:99px;
  font-size:14px;font-weight:700;opacity:0;transition:all 0.3s ease;
  pointer-events:none;z-index:100;white-space:nowrap;
}
#notif.show{opacity:1;transform:translateX(-50%) translateY(0)}

@media(max-width:860px){
  .grid-4{grid-template-columns:repeat(2,1fr)}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .semana-grid{grid-template-columns:repeat(4,1fr)}
  .hero-stats{flex-wrap:wrap}
  .tipo-grid{grid-template-columns:repeat(3,1fr)}
}
</style>
</head>
<body>

<!-- HERO -->
<div class="hero">
  <div class="hero-saudacao">${saudacao}, Renato</div>
  <div class="hero-nome">Seus treinos 💪</div>
  <div class="hero-frase">${motivacional}</div>
  <div class="hero-stats">
    <div class="hero-stat hero-streak">
      <div class="hero-stat-val">${stats.streak}</div>
      <div class="hero-stat-label">Dias seguidos</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val">${stats.total}</div>
      <div class="hero-stat-label">Total feitos</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val">${feitasSemana}/${possiveisSemana}</div>
      <div class="hero-stat-label">Esta semana</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-val">${semanaPlano}/8</div>
      <div class="hero-stat-label">Plano corrida</div>
    </div>
  </div>
</div>

<div class="main">

  <!-- SEMANA + PRÓXIMO + DICA -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-title">Semana atual</div>
    <div class="semana-grid">${semanaCells}</div>
    <div style="margin-top:16px">
      <div class="prog-label">
        <span>${feitasSemana} de ${possiveisSemana} treinos</span>
        <span class="prog-pct">${pctSemana}%</span>
      </div>
      <div class="prog-wrap"><div class="prog-fill" style="width:${pctSemana}%"></div></div>
    </div>
  </div>

  <div class="grid-2">
    <!-- PRÓXIMO -->
    <div class="card">
      <div class="card-title">Próximo treino</div>
      ${proximo ? `
        <div class="proximo-quando">${proximoLabel}</div>
        <div class="proximo-icone">${proximo.icone}</div>
        <div class="proximo-tipo">${proximo.tipo}</div>
        <div class="proximo-hora">${proximo.horario}</div>
      ` : '<p style="color:var(--muted);font-size:13px">Sem treinos previstos.</p>'}
    </div>

    <!-- DICA -->
    <div class="dica-card">
      <div class="dica-label">💡 Dica do dia</div>
      <div class="dica-texto">"${dica.texto}"</div>
      <div class="dica-cat">#${dica.categoria}</div>
    </div>
  </div>

  <!-- CALENDÁRIO + CORRIDA -->
  <div class="grid-3">
    <div class="card">
      <div class="card-title">Calendário — ${anoMes}</div>
      <div class="cal-header">
        ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d2=>`<span>${d2}</span>`).join('')}
      </div>
      <div class="cal-grid">
        ${calCells.map(d2=>calCell(d2)).join('')}
      </div>
      <div class="cal-legenda">
        <span><b style="background:var(--green-light);border:1px solid var(--green)"></b>Feito</span>
        <span><b style="background:var(--amber-light);border:1px solid #e0b870"></b>Pendente</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Progresso — corrida</div>
      <div class="plano-badge">
        <div class="plano-num">${semanaPlano}</div>
        <div>
          <div class="plano-info-titulo">Semana ${semanaPlano} de 8</div>
          <div class="plano-info-sub">Fase: ${faseAtual}</div>
        </div>
      </div>
      ${kmPorSemana.length > 0
        ? `<div class="bar-chart">${barras}</div>`
        : `<div class="corrida-empty"><div>🏃</div>Registre sua primeira corrida com distância para ver o progresso aqui.</div>`
      }
    </div>
  </div>

  <!-- REGISTRO -->
  <div class="reg-card">
    <div class="reg-header">
      <h3>Registrar treino</h3>
      <p>Como foi hoje? Conta pra mim.</p>
    </div>
    <div class="reg-body">
      <form method="POST" action="/treino" id="formTreino">
        <input type="hidden" name="concluido" value="true">
        <input type="hidden" name="tipo" id="tipoHidden">

        <div class="reg-section">
          <div class="reg-section-label">Qual treino?</div>
          <div class="tipo-grid">
            ${[
              {val:'Corrida leve', icon:'🏃', nome:'Corrida'},
              {val:'Academia — sup. A', icon:'💪', nome:'Sup. A'},
              {val:'Academia — sup. B', icon:'💪', nome:'Sup. B'},
              {val:'Academia — inf.', icon:'🦵', nome:'Inferior'},
              {val:'Beach tennis', icon:'🎾', nome:'Beach'},
            ].map(t => `
              <label class="tipo-btn" onclick="selectTipo(this,'${t.val}')">
                <div class="tipo-icon">${t.icon}</div>
                <div class="tipo-nome">${t.nome}</div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="reg-section">
          <div class="reg-section-label">Data</div>
          <input type="date" name="data" value="${hoje}" class="field-input" style="max-width:200px">
        </div>

        <div class="reg-section">
          <div class="reg-section-label">Detalhes (opcional)</div>
          <div class="fields-row">
            <div class="field-group">
              <div class="field-label">Duração</div>
              <input type="number" name="duracao_min" placeholder="min" class="field-input" min="1" max="300">
            </div>
            <div class="field-group">
              <div class="field-label">Distância</div>
              <input type="number" name="distancia_km" placeholder="km" class="field-input" min="0" max="50" step="0.1">
            </div>
          </div>
        </div>

        <div class="reg-section">
          <div class="reg-section-label">Como você se sentiu?</div>
          <div class="humor-row" id="humorRow">
            ${[
              {val:'ótimo', icon:'🔥', label:'Ótimo'},
              {val:'bem', icon:'😊', label:'Bem'},
              {val:'ok', icon:'😐', label:'Ok'},
              {val:'cansado', icon:'😓', label:'Cansado'},
              {val:'difícil', icon:'😤', label:'Difícil'},
            ].map(h => `
              <label class="humor-btn" onclick="selectHumor(this,'${h.val}')">
                <div>${h.icon}</div>
              </label>
            `).join('')}
          </div>
          <input type="hidden" name="_humor" id="humorHidden">
        </div>

        <div class="reg-section" style="margin-bottom:16px">
          <div class="reg-section-label">Nota livre</div>
          <textarea name="nota" class="field-input" id="notaField" placeholder="Como foi o treino? Joelho ok? Ritmo bom? Qualquer observação..."></textarea>
        </div>

        <button type="submit" class="btn-salvar">Salvar treino ✓</button>
      </form>
    </div>
  </div>

</div>

<div id="notif"></div>

<script>
function selectTipo(el, val) {
  document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('tipoHidden').value = val;
  // pré-preenche nota se corrida
  const nota = document.getElementById('notaField');
  if (val.includes('Corrida') && !nota.value) nota.placeholder = 'Ritmo ok? Joelho tranquilo? Distância percorrida?';
  else if (val.includes('Beach') && !nota.value) nota.placeholder = 'Jogo bom? Nível dos parceiros? Algum destaque?';
  else if (val.includes('Academia') && !nota.value) nota.placeholder = 'Carga boa? Algum exercício que sentiu mais? Joelho ok?';
}

function selectHumor(el, val) {
  document.querySelectorAll('.humor-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('humorHidden').value = val;
  // append ao nota
  const nota = document.getElementById('notaField');
  const cur = nota.value.replace(/^\\[.*?\\]\\s*/,'');
  nota.value = '[' + val + '] ' + cur;
}

function toggleTreino(data, tipo) {
  fetch('/treino/toggle', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({data, tipo})
  })
  .then(r => r.json())
  .then(res => {
    showNotif(res.concluido ? '✓ Treino marcado como feito!' : 'Treino desmarcado.');
    setTimeout(() => location.reload(), 900);
  });
}

function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
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
