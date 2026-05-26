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

// ── BANCO DE DADOS ──────────────────────────────────────────────────────────

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
      ['Correr na praia de manhã antes do almoço é um privilégio. Aproveita.', 'corrida'],
      ['Ritmo de conversa = ritmo certo. Se não consegue falar, está rápido demais.', 'corrida'],
      ['O treino que você faz consistentemente supera o treino perfeito que você pula.', 'mental'],
      ['Semana com 5 atividades já é elite. Não precisas de mais, precisas de constância.', 'geral'],
      ['Academia de superior duas vezes por semana: deixa 48h entre os treinos.', 'academia'],
      ['Inferior no sábado longe do beach de quarta — joelho agradece.', 'joelho'],
      ['Cada semana completada do plano de corrida é uma semana que seu joelho ficou mais forte.', 'corrida'],
      ['Progressão de corrida: tempo primeiro, ritmo depois. Nunca os dois ao mesmo tempo.', 'corrida'],
      ['Dor muscular é adaptação. Dor articular é sinal. Aprende a diferença.', 'joelho'],
      ['Treino de core é proteção de joelho. Abdômen forte = menos sobrecarga na perna.', 'academia'],
      ['Sábado de academia cedo deixa o fim de semana livre. Melhor das duas.', 'geral'],
      ['Cada check no calendário é uma prova de que você é o tipo de pessoa que treina.', 'mental'],
    ];
    for (const [texto, categoria] of dicas) {
      await pool.query('INSERT INTO dicas (texto, categoria) VALUES ($1, $2)', [texto, categoria]);
    }
  }
  console.log('Banco inicializado.');
}

// ── HELPERS ─────────────────────────────────────────────────────────────────

const ROTINA = {
  1: { tipo: 'Corrida leve',      icone: '🏃', horario: '17h',  cor: '#2d6a4f' },
  2: { tipo: 'Academia — sup. A', icone: '💪', horario: '11h',  cor: '#3d405b' },
  3: { tipo: 'Beach tennis',      icone: '🎾', horario: '20h',  cor: '#8b5e3c' },
  4: { tipo: 'Academia — sup. B', icone: '💪', horario: '11h',  cor: '#3d405b' },
  5: { tipo: 'Corrida leve',      icone: '🏃', horario: '10h',  cor: '#2d6a4f' },
  6: { tipo: 'Academia — inf.',   icone: '🦵', horario: '9h',   cor: '#3d405b' },
  0: { tipo: 'Descanso',          icone: '😴', horario: '—',    cor: '#aaa'    },
};

const DIAS_PT = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
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
  return {
    inicio: seg.toISOString().slice(0, 10),
    fim: sab.toISOString().slice(0, 10),
  };
}

async function getDicaHoje() {
  const hoje = new Date();
  const { rows } = await pool.query('SELECT texto, categoria FROM dicas');
  if (!rows.length) return { texto: 'Continue firme.', categoria: 'geral' };
  const idx = hoje.getDate() % rows.length;
  return rows[idx];
}

async function getStats() {
  const semana = semanaAtual();

  const [totalR, semanaR, streakR, corridaR, mesR] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM treinos WHERE concluido = true'),
    pool.query('SELECT * FROM treinos WHERE data >= $1 AND data <= $2 ORDER BY data ASC', [semana.inicio, semana.fim]),
    pool.query(`
      SELECT COUNT(*) as dias FROM (
        SELECT DISTINCT data FROM treinos
        WHERE concluido = true
        AND data >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY data DESC
      ) t
    `),
    pool.query(`
      SELECT data, SUM(distancia_km) as km
      FROM treinos
      WHERE tipo ILIKE '%corrida%' AND concluido = true AND distancia_km IS NOT NULL
      GROUP BY data ORDER BY data ASC
    `),
    pool.query(`
      SELECT DATE_TRUNC('month', data) as mes, COUNT(*) as total, SUM(CASE WHEN concluido THEN 1 ELSE 0 END) as feitos
      FROM treinos
      GROUP BY mes ORDER BY mes DESC LIMIT 6
    `),
  ]);

  return {
    total: parseInt(totalR.rows[0].count),
    semana: semanaR.rows,
    streak: parseInt(streakR.rows[0].dias),
    corridas: corridaR.rows,
    meses: mesR.rows,
  };
}

async function getCalendarioMes() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const inicio = new Date(ano, mes, 1).toISOString().slice(0, 10);
  const fim = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
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
    const rotina = ROTINA[dow];
    if (rotina && rotina.tipo !== 'Descanso') {
      return {
        ...rotina,
        data: d.toISOString().slice(0, 10),
        dia: DIAS_PT[dow],
        hoje: i === 0,
        amanha: i === 1,
        daqui: i,
      };
    }
  }
  return null;
}

// ── ROTAS ────────────────────────────────────────────────────────────────────

// GET / — dashboard principal
app.get('/', async (req, res) => {
  try {
    const [stats, calendario, dica, proximo] = await Promise.all([
      getStats(),
      getCalendarioMes(),
      getDicaHoje(),
      Promise.resolve(proximoTreino()),
    ]);

    const hoje = new Date();
    const anoMes = `${MESES_PT[hoje.getMonth()]} ${hoje.getFullYear()}`;
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const primeiroDow = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getDay();

    // Mapa de treinos do mês por data
    const treinosMap = {};
    for (const t of calendario) {
      const d = t.data.slice(0, 10);
      if (!treinosMap[d]) treinosMap[d] = [];
      treinosMap[d].push(t);
    }

    // Semana atual — montar grade seg→dom
    const semana = semanaAtual();
    const treinos7 = stats.semana;
    const treinosSemMap = {};
    for (const t of treinos7) {
      const d = t.data.slice ? t.data.slice(0, 10) : t.data;
      treinosSemMap[d] = t;
    }

    const diasSemana = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(semana.inicio);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      const rotina = ROTINA[dow];
      diasSemana.push({
        data: ds,
        dow,
        diaNome: DIAS_PT[dow].slice(0, 3),
        dia: d.getDate(),
        rotina,
        treino: treinosSemMap[ds] || null,
        hoje: ds === hojeStr(),
      });
    }

    const feitasSemana = diasSemana.filter(d => d.treino?.concluido).length;
    const possiveisSemana = diasSemana.filter(d => d.rotina?.tipo !== 'Descanso').length;

    // Corrida: semanas do plano
    const kmPorSemana = [];
    const corridaAgg = {};
    for (const r of stats.corridas) {
      const d = new Date(r.data);
      d.setDate(d.getDate() - ((d.getDay() === 0 ? 7 : d.getDay()) - 1));
      const key = d.toISOString().slice(0, 10);
      corridaAgg[key] = (corridaAgg[key] || 0) + parseFloat(r.km || 0);
    }
    for (const [k, v] of Object.entries(corridaAgg).sort()) {
      kmPorSemana.push({ semana: k, km: v.toFixed(1) });
    }

    // Semana plano de corrida (qual semana do plano está?)
    // Plano começa na semana 1. Estima pela primeira corrida registrada.
    const semanaPlano = kmPorSemana.length + 1;

    res.send(renderHTML({
      stats, dica, proximo, diasSemana,
      feitasSemana, possiveisSemana,
      anoMes, diasNoMes, primeiroDow,
      treinosMap, hoje: hojeStr(),
      kmPorSemana, semanaPlano,
    }));
  } catch (e) {
    console.error(e);
    res.status(500).send('<pre>' + e.message + '</pre>');
  }
});

// POST /treino — registrar treino
app.post('/treino', async (req, res) => {
  const { data, tipo, concluido, nota, duracao_min, distancia_km } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id FROM treinos WHERE data = $1 AND tipo = $2', [data, tipo]
    );
    if (existing.rows.length) {
      await pool.query(
        'UPDATE treinos SET concluido=$1, nota=$2, duracao_min=$3, distancia_km=$4 WHERE id=$5',
        [concluido === 'true' || concluido === true, nota || null,
         duracao_min || null, distancia_km || null, existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO treinos (data, tipo, concluido, nota, duracao_min, distancia_km) VALUES ($1,$2,$3,$4,$5,$6)',
        [data, tipo, concluido === 'true' || concluido === true,
         nota || null, duracao_min || null, distancia_km || null]
      );
    }
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

// POST /treino/toggle — marcar/desmarcar rápido
app.post('/treino/toggle', async (req, res) => {
  const { data, tipo } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id, concluido FROM treinos WHERE data = $1 AND tipo = $2', [data, tipo]
    );
    if (existing.rows.length) {
      const novo = !existing.rows[0].concluido;
      await pool.query('UPDATE treinos SET concluido=$1 WHERE id=$2', [novo, existing.rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO treinos (data, tipo, concluido) VALUES ($1,$2,true)', [data, tipo]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/stats — JSON para uso externo
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── HTML ─────────────────────────────────────────────────────────────────────

function renderHTML(data) {
  const {
    stats, dica, proximo, diasSemana,
    feitasSemana, possiveisSemana,
    anoMes, diasNoMes, primeiroDow,
    treinosMap, hoje,
    kmPorSemana, semanaPlano,
  } = data;

  const pctSemana = possiveisSemana > 0 ? Math.round((feitasSemana / possiveisSemana) * 100) : 0;

  // Calendário do mês
  const calCells = [];
  const offset = primeiroDow === 0 ? 6 : primeiroDow - 1; // seg=0
  for (let i = 0; i < offset; i++) calCells.push(null);
  for (let d = 1; d <= diasNoMes; d++) calCells.push(d);

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  function calCell(d) {
    if (!d) return `<div class="cal-empty"></div>`;
    const ds = `${anoAtual}-${String(mesAtual + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const treinos = treinosMap[ds] || [];
    const feito = treinos.some(t => t.concluido);
    const temTreino = treinos.length > 0;
    const isHoje = ds === hoje;
    let cls = 'cal-day';
    if (isHoje) cls += ' cal-hoje';
    if (feito) cls += ' cal-feito';
    else if (temTreino) cls += ' cal-pendente';
    return `<div class="${cls}" title="${treinos.map(t=>t.tipo).join(', ') || ''}">${d}${feito ? '<span class="cal-check">✓</span>' : ''}</div>`;
  }

  // Linha do progresso de corrida
  const maxKm = Math.max(...kmPorSemana.map(k => parseFloat(k.km)), 5);
  const corridaChartBars = kmPorSemana.slice(-8).map((k, i) => {
    const pct = Math.round((parseFloat(k.km) / maxKm) * 100);
    const d = new Date(k.semana);
    const label = `${d.getDate()}/${d.getMonth()+1}`;
    return `<div class="bar-col">
      <div class="bar-val">${k.km}km</div>
      <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%"></div></div>
      <div class="bar-label">${label}</div>
    </div>`;
  }).join('');

  // Próximo treino label
  let proximoLabel = '';
  if (proximo) {
    if (proximo.hoje) proximoLabel = 'hoje';
    else if (proximo.amanha) proximoLabel = 'amanhã';
    else proximoLabel = `em ${proximo.daqui} dias`;
  }

  // Dias da semana
  const semanaCells = diasSemana.map(d => {
    const isDescanso = d.rotina?.tipo === 'Descanso';
    const feito = d.treino?.concluido;
    const temTreino = !!d.treino;
    let cls = 'dia-card';
    if (d.hoje) cls += ' dia-hoje';
    if (feito) cls += ' dia-feito';
    if (isDescanso) cls += ' dia-descanso';

    const toggleBtn = !isDescanso ? `
      <form method="POST" action="/treino/toggle" style="margin-top:8px">
        <input type="hidden" name="data" value="${d.data}">
        <input type="hidden" name="tipo" value="${d.rotina?.tipo}">
        <button type="submit" class="btn-toggle ${feito ? 'btn-desfazer' : 'btn-marcar'}">
          ${feito ? '✓ Feito' : 'Marcar'}
        </button>
      </form>` : '';

    const nota = d.treino?.nota ? `<div class="dia-nota">"${d.treino.nota}"</div>` : '';

    return `
    <div class="${cls}">
      <div class="dia-topo">
        <span class="dia-nome">${d.diaNome}</span>
        <span class="dia-num">${d.dia}</span>
      </div>
      ${isDescanso
        ? `<div class="dia-tipo muted">Descanso</div>`
        : `<div class="dia-icone">${d.rotina?.icone}</div>
           <div class="dia-tipo">${d.rotina?.tipo}</div>
           <div class="dia-hora">${d.rotina?.horario}</div>`
      }
      ${nota}
      ${toggleBtn}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Treinos — Renato</title>
<style>
  :root {
    --bg: #f5f4f0;
    --card: #ffffff;
    --border: #e8e6e0;
    --text: #1a1a1a;
    --muted: #888;
    --green: #2d6a4f;
    --green-light: #d8f3dc;
    --blue: #3d405b;
    --blue-light: #e8e9f3;
    --amber: #8b5e3c;
    --amber-light: #fdf0e0;
    --accent: #2d6a4f;
    --radius: 14px;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 0 0 48px;
  }
  /* HEADER */
  .header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 20px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header h1 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .header h1 span { color: var(--green); }
  .header-data {
    font-size: 13px;
    color: var(--muted);
  }
  /* MAIN */
  .main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 28px 24px 0;
  }
  /* CARDS TOPO */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 20px;
  }
  .stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 22px;
  }
  .stat-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--text);
  }
  .stat-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 5px;
  }
  .stat-card.destaque {
    background: var(--green);
    border-color: var(--green);
  }
  .stat-card.destaque .stat-label { color: rgba(255,255,255,0.6); }
  .stat-card.destaque .stat-value { color: #fff; }
  .stat-card.destaque .stat-sub { color: rgba(255,255,255,0.55); }
  /* GRADE */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }
  /* SECTION */
  .section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px 24px;
  }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::before {
    content: '';
    display: block;
    width: 14px;
    height: 2px;
    background: var(--accent);
    border-radius: 2px;
  }
  /* SEMANA */
  .semana-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }
  .dia-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 8px;
    text-align: center;
    min-height: 110px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    background: #fafaf8;
    transition: box-shadow 0.15s;
  }
  .dia-card.dia-hoje {
    border-color: var(--green);
    background: #f0faf4;
  }
  .dia-card.dia-feito { background: #f0faf4; }
  .dia-card.dia-descanso { background: #f9f9f7; opacity: 0.6; }
  .dia-topo { width: 100%; display: flex; justify-content: space-between; align-items: center; }
  .dia-nome { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .dia-num { font-size: 11px; font-weight: 700; color: var(--text); }
  .dia-icone { font-size: 18px; margin: 4px 0; }
  .dia-tipo { font-size: 9px; font-weight: 600; color: var(--text); text-align: center; line-height: 1.3; }
  .dia-hora { font-size: 8px; color: var(--muted); }
  .muted { color: var(--muted) !important; }
  .dia-nota { font-size: 8px; color: var(--muted); font-style: italic; margin-top: 3px; }
  /* BOTÕES TOGGLE */
  .btn-toggle {
    margin-top: auto;
    font-size: 9px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
    letter-spacing: 0.04em;
  }
  .btn-marcar { background: var(--green-light); color: var(--green); }
  .btn-desfazer { background: var(--green); color: #fff; }
  .btn-toggle:hover { opacity: 0.8; }
  /* BARRA DE PROGRESSO SEMANA */
  .prog-bar-wrap {
    background: var(--bg);
    border-radius: 99px;
    height: 8px;
    margin: 10px 0 6px;
    overflow: hidden;
  }
  .prog-bar-fill {
    height: 100%;
    border-radius: 99px;
    background: var(--green);
    transition: width 0.4s ease;
  }
  .prog-label {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }
  /* CALENDÁRIO */
  .cal-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 4px;
  }
  .cal-header span {
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    padding: 4px 0;
  }
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
  }
  .cal-empty { border-radius: 6px; }
  .cal-day {
    aspect-ratio: 1;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    background: #f7f7f5;
    border: 1px solid transparent;
    position: relative;
    cursor: default;
  }
  .cal-hoje { border-color: var(--green) !important; font-weight: 800; }
  .cal-feito { background: var(--green-light); color: var(--green); }
  .cal-pendente { background: var(--amber-light); }
  .cal-check {
    position: absolute;
    bottom: 2px;
    right: 3px;
    font-size: 7px;
    color: var(--green);
    font-weight: 800;
  }
  /* CORRIDA BARRAS */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 120px;
    padding-top: 24px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
  }
  .bar-val {
    font-size: 9px;
    font-weight: 700;
    color: var(--green);
    margin-bottom: 4px;
    white-space: nowrap;
  }
  .bar-wrap {
    flex: 1;
    width: 100%;
    background: var(--bg);
    border-radius: 4px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .bar-fill {
    width: 100%;
    background: var(--green);
    border-radius: 4px;
    min-height: 4px;
    transition: height 0.4s ease;
  }
  .bar-label {
    font-size: 8px;
    color: var(--muted);
    margin-top: 4px;
    white-space: nowrap;
  }
  .bar-empty {
    flex: 1;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    align-self: center;
    padding: 20px;
  }
  /* PRÓXIMO TREINO */
  .proximo-card {
    background: var(--blue-light);
    border: 1px solid #d0d2e8;
    border-radius: 10px;
    padding: 16px 18px;
  }
  .proximo-quando {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--blue);
    margin-bottom: 6px;
  }
  .proximo-tipo {
    font-size: 20px;
    font-weight: 800;
    color: var(--blue);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .proximo-hora {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
  }
  /* DICA */
  .dica-box {
    background: var(--amber-light);
    border: 1px solid #e8d5b8;
    border-radius: 10px;
    padding: 16px 18px;
  }
  .dica-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--amber);
    margin-bottom: 8px;
  }
  .dica-texto {
    font-size: 14px;
    line-height: 1.6;
    color: #5a3d22;
    font-style: italic;
  }
  .dica-cat {
    font-size: 10px;
    color: #a07040;
    margin-top: 8px;
    font-weight: 600;
  }
  /* FORM REGISTRO */
  .form-registro {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .form-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .form-registro input,
  .form-registro select,
  .form-registro textarea {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    font-family: inherit;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }
  .form-registro input:focus,
  .form-registro select:focus,
  .form-registro textarea:focus {
    border-color: var(--green);
  }
  .form-registro textarea { width: 100%; resize: vertical; min-height: 60px; }
  .btn-registrar {
    background: var(--green);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-registrar:hover { opacity: 0.85; }
  /* PLANO CORRIDA */
  .plano-semana {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--green-light);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 12px;
  }
  .plano-num {
    font-size: 32px;
    font-weight: 800;
    color: var(--green);
    line-height: 1;
  }
  .plano-info { flex: 1; }
  .plano-titulo { font-size: 14px; font-weight: 700; color: var(--green); }
  .plano-desc { font-size: 12px; color: #3a7d5a; margin-top: 2px; }
  /* RESPONSIVE */
  @media (max-width: 900px) {
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .semana-grid { grid-template-columns: repeat(4, 1fr); }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Renato <span>/ Treinos</span></h1>
  <div class="header-data">${new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}</div>
</div>

<div class="main">

  <!-- STATS TOPO -->
  <div class="stats-row">
    <div class="stat-card destaque">
      <div class="stat-label">Sequência ativa</div>
      <div class="stat-value">${stats.streak}</div>
      <div class="stat-sub">dias ativos nos últimos 30</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total de treinos</div>
      <div class="stat-value">${stats.total}</div>
      <div class="stat-sub">desde o início</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Esta semana</div>
      <div class="stat-value">${feitasSemana}<span style="font-size:18px;color:#aaa">/${possiveisSemana}</span></div>
      <div class="stat-sub">${pctSemana}% da meta semanal</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Plano de corrida</div>
      <div class="stat-value">${Math.min(semanaPlano, 8)}<span style="font-size:18px;color:#aaa">/8</span></div>
      <div class="stat-sub">semana ${Math.min(semanaPlano, 8)} de 8</div>
    </div>
  </div>

  <!-- SEMANA ATUAL -->
  <div class="section" style="margin-bottom:20px">
    <div class="section-title">Semana atual</div>
    <div class="semana-grid">${semanaCells}</div>
    <div style="margin-top:14px">
      <div class="prog-label">
        <span>${feitasSemana} de ${possiveisSemana} treinos concluídos</span>
        <span>${pctSemana}%</span>
      </div>
      <div class="prog-bar-wrap">
        <div class="prog-bar-fill" style="width:${pctSemana}%"></div>
      </div>
    </div>
  </div>

  <!-- PRÓXIMO + DICA -->
  <div class="grid-2">
    <div class="section">
      <div class="section-title">Próximo treino</div>
      ${proximo ? `
      <div class="proximo-card">
        <div class="proximo-quando">${proximo.hoje ? 'Hoje' : proximo.amanha ? 'Amanhã' : proximo.dia} · ${proximoLabel}</div>
        <div class="proximo-tipo">${proximo.icone} ${proximo.tipo}</div>
        <div class="proximo-hora">${proximo.horario}</div>
      </div>
      ` : '<p style="color:var(--muted);font-size:13px">Sem treinos pendentes.</p>'}
    </div>
    <div class="section">
      <div class="section-title">Dica do dia</div>
      <div class="dica-box">
        <div class="dica-label">💡 Para você</div>
        <div class="dica-texto">"${dica.texto}"</div>
        <div class="dica-cat">#${dica.categoria}</div>
      </div>
    </div>
  </div>

  <!-- CALENDÁRIO + CORRIDA -->
  <div class="grid-3">
    <div class="section">
      <div class="section-title">Calendário — ${anoMes}</div>
      <div class="cal-header">
        ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => `<span>${d}</span>`).join('')}
      </div>
      <div class="cal-grid">
        ${calCells.map(d => calCell(d)).join('')}
      </div>
      <div style="display:flex;gap:12px;margin-top:12px;font-size:11px;color:var(--muted)">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--green-light);display:inline-block"></span> Feito</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--amber-light);display:inline-block"></span> Pendente</span>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Progresso corrida</div>
      ${semanaPlano <= 8 ? `
      <div class="plano-semana">
        <div class="plano-num">${Math.min(semanaPlano, 8)}</div>
        <div class="plano-info">
          <div class="plano-titulo">Semana ${Math.min(semanaPlano, 8)} de 8</div>
          <div class="plano-desc">${semanaPlano <= 2 ? 'Fase 1 — Base' : semanaPlano <= 5 ? 'Fase 2 — Construção' : 'Fase 3 — Consolidação'}</div>
        </div>
      </div>` : ''}
      ${kmPorSemana.length > 0 ? `
      <div class="bar-chart">
        ${corridaChartBars}
      </div>` : `<div class="bar-empty" style="padding:30px 0;text-align:center">
        <div style="font-size:28px;margin-bottom:8px">🏃</div>
        <div style="font-size:13px;color:var(--muted)">Registre sua primeira corrida<br>para ver o progresso aqui.</div>
      </div>`}
    </div>
  </div>

  <!-- REGISTRAR TREINO -->
  <div class="section">
    <div class="section-title">Registrar treino</div>
    <form method="POST" action="/treino">
      <div class="form-row">
        <input type="date" name="data" value="${hoje}" required>
        <select name="tipo" required>
          <option value="">Tipo de treino</option>
          <option value="Corrida leve">🏃 Corrida leve</option>
          <option value="Academia — sup. A">💪 Academia — superior A</option>
          <option value="Academia — sup. B">💪 Academia — superior B</option>
          <option value="Academia — inf.">🦵 Academia — inferior</option>
          <option value="Beach tennis">🎾 Beach tennis</option>
        </select>
        <input type="number" name="duracao_min" placeholder="Duração (min)" min="1" max="240" style="width:150px">
        <input type="number" name="distancia_km" placeholder="Distância (km)" min="0" max="50" step="0.1" style="width:150px">
        <select name="concluido">
          <option value="true">✓ Concluído</option>
          <option value="false">✗ Não feito</option>
        </select>
      </div>
      <textarea name="nota" placeholder="Como foi o treino? Alguma observação sobre o joelho, ritmo, disposição..."></textarea>
      <div style="margin-top:8px">
        <button type="submit" class="btn-registrar">Salvar treino</button>
      </div>
    </form>
  </div>

</div>

</body>
</html>`;
}

// ── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Dashboard rodando na porta ${PORT}`));
}).catch(e => {
  console.error('Erro ao inicializar banco:', e);
  process.exit(1);
});
