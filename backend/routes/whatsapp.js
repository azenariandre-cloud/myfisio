// ─────────────────────────────────────────────
//  myFisio — WhatsApp via Evolution API (grátis)
//  Docs: https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
//
//  Como configurar:
//  1. Suba Evolution API: github.com/EvolutionAPI/evolution-api
//  2. Crie instância, conecte +55 11 94353-1627 via QR Code
//  3. Adicione no Render:
//     EVOLUTION_API_URL  = https://sua-evolution.railway.app
//     EVOLUTION_API_KEY  = sua_api_key
//     EVOLUTION_INSTANCE = myfisio
// ─────────────────────────────────────────────

const EVOLUTION_URL      = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'myfisio';

async function sendWhatsApp(phone, message) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.log('[WhatsApp] Evolution API não configurada — defina EVOLUTION_API_URL e EVOLUTION_API_KEY.');
    return { ok: false, reason: 'not_configured' };
  }
  if (!phone) {
    console.log('[WhatsApp] Número de telefone vazio — mensagem não enviada.');
    return { ok: false, reason: 'no_phone' };
  }

  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0'))   p = '55' + p.slice(1);
  if (!p.startsWith('55')) p = '55' + p;

  const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      // Formato V2 (atual) da Evolution API — payload FLAT, sem "textMessage" aninhado
      body: JSON.stringify({
        number: p,
        text: message,
        delay: 1200,
      }),
    });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    if (!res.ok) {
      console.error(`[WhatsApp] ❌ Erro HTTP ${res.status} ao enviar para ${p}:`, JSON.stringify(data));
      return { ok: false, status: res.status, reason: data };
    }

    console.log(`[WhatsApp] ✅ Enviado com sucesso para ${p}`);
    return { ok: true, data };
  } catch (err) {
    console.error(`[WhatsApp] ❌ Falha de conexão ao enviar para ${p}:`, err.message);
    return { ok: false, reason: err.message };
  }
}

async function notifyProNewAppointment({ proPhone, proName, patientName, scheduledAt, serviceType, address, notes }) {
  if (!proPhone) { console.log('[WhatsApp] notifyProNewAppointment: telefone do fisio vazio.'); return; }
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg =
    `📬 *myFisio — Novo pedido de sessão!*\n\n` +
    `Olá, ${proName || 'Fisioterapeuta'}! Você recebeu um novo agendamento.\n\n` +
    `👤 *Paciente:* ${patientName || '—'}\n📅 *Data:* ${ds}\n🕐 *Horário:* ${ts}\n` +
    `🏠 *Tipo:* ${serviceType === 'domiciliar' ? 'Domiciliar' : 'Clínica'}\n` +
    (address ? `📍 *Endereço:* ${address}\n` : '') +
    (notes   ? `💬 *Obs:* ${notes}\n`         : '') +
    `\nAcesse https://myfisio.pro para confirmar ou recusar.`;
  return sendWhatsApp(proPhone, msg);
}

async function notifyPatientConfirmed({ patientPhone, patientName, proName, scheduledAt, serviceType, address }) {
  if (!patientPhone) { console.log('[WhatsApp] notifyPatientConfirmed: telefone do paciente vazio.'); return; }
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg =
    `✅ *myFisio — Sessão Confirmada!*\n\n` +
    `Olá, ${patientName || 'paciente'}! Sua sessão foi *confirmada*.\n\n` +
    `👩‍⚕️ *Fisioterapeuta:* ${proName || '—'}\n📅 *Data:* ${ds}\n🕐 *Horário:* ${ts}\n` +
    `🏠 *Tipo:* ${serviceType === 'domiciliar' ? 'Domiciliar' : 'Clínica'}\n` +
    (address ? `📍 *Endereço:* ${address}\n` : '') +
    `\nQualquer dúvida, acesse https://myfisio.pro. Até lá! 😊`;
  return sendWhatsApp(patientPhone, msg);
}

async function notifyCancelled({ phone, name, scheduledAt, cancelledBy }) {
  if (!phone) { console.log('[WhatsApp] notifyCancelled: telefone vazio.'); return; }
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg =
    `❌ *myFisio — Sessão Cancelada*\n\nOlá, ${name || ''}! ` +
    `A sessão do dia *${ds}* às *${ts}* foi cancelada.\n` +
    (cancelledBy ? `Cancelado por: ${cancelledBy}\n` : '') +
    `\nAcesse https://myfisio.pro para reagendar.`;
  return sendWhatsApp(phone, msg);
}

async function notifyPasswordReminder({ phone, name, email, password }) {
  if (!phone) { console.log('[WhatsApp] notifyPasswordReminder: telefone vazio.'); return; }
  const msg =
    `🔑 *myFisio — Recuperação de senha*\n\n` +
    `Olá, ${name || 'usuário'}!\n\n` +
    `Geramos uma nova senha temporária para o seu acesso:\n\n` +
    `📧 *E-mail:* ${email}\n` +
    `🔒 *Senha temporária:* ${password}\n\n` +
    `Por segurança, recomendamos alterar essa senha assim que entrar.\n` +
    `Dúvidas? Fale conosco: (11) 94353-1627\n\n` +
    `Acesse agora: https://myfisio.pro`;
  return sendWhatsApp(phone, msg);
}

module.exports = { sendWhatsApp, notifyProNewAppointment, notifyPatientConfirmed, notifyCancelled, notifyPasswordReminder };
