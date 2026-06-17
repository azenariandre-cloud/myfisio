// ─────────────────────────────────────────────
//  myFisio — WhatsApp via Evolution API (grátis)
//  Docs: https://doc.evolution-api.com
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
    console.log('[WhatsApp] Evolution API não configurada.');
    return { ok: false, reason: 'not_configured' };
  }
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0'))   p = '55' + p.slice(1);
  if (!p.startsWith('55')) p = '55' + p;

  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: p,
        options: { delay: 1000, presence: 'composing' },
        textMessage: { text: message },
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('[WhatsApp] Erro:', data); return { ok: false, reason: data }; }
    console.log(`[WhatsApp] ✅ Enviado para ${p}`);
    return { ok: true, data };
  } catch (err) {
    console.error('[WhatsApp] Falha:', err.message);
    return { ok: false, reason: err.message };
  }
}

async function notifyProNewAppointment({ proPhone, proName, patientName, scheduledAt, serviceType, address, notes }) {
  if (!proPhone) return;
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
    `\nAcesse o app myFisio para confirmar ou recusar.`;
  return sendWhatsApp(proPhone, msg);
}

async function notifyPatientConfirmed({ patientPhone, patientName, proName, scheduledAt, serviceType, address }) {
  if (!patientPhone) return;
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg =
    `✅ *myFisio — Sessão Confirmada!*\n\n` +
    `Olá, ${patientName || 'paciente'}! Sua sessão foi *confirmada*.\n\n` +
    `👩‍⚕️ *Fisioterapeuta:* ${proName || '—'}\n📅 *Data:* ${ds}\n🕐 *Horário:* ${ts}\n` +
    `🏠 *Tipo:* ${serviceType === 'domiciliar' ? 'Domiciliar' : 'Clínica'}\n` +
    (address ? `📍 *Endereço:* ${address}\n` : '') +
    `\nQualquer dúvida, acesse o myFisio. Até lá! 😊`;
  return sendWhatsApp(patientPhone, msg);
}

async function notifyCancelled({ phone, name, scheduledAt, cancelledBy }) {
  if (!phone) return;
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const msg =
    `❌ *myFisio — Sessão Cancelada*\n\nOlá, ${name || ''}! ` +
    `A sessão do dia *${ds}* às *${ts}* foi cancelada.\n` +
    (cancelledBy ? `Cancelado por: ${cancelledBy}\n` : '') +
    `\nAcesse o app para reagendar.`;
  return sendWhatsApp(phone, msg);
}

async function notifyPasswordReminder({ phone, name, email, password }) {
  if (!phone) return;
  const msg =
    `🔑 *myFisio — Seus dados de acesso*\n\n` +
    `Olá, ${name || 'usuário'}!\n\n` +
    `📧 *E-mail:* ${email}\n🔒 *Senha:* ${password}\n\n` +
    `Por segurança, recomendamos alterar sua senha após o acesso.\n` +
    `Dúvidas? Fale conosco: (11) 94353-1627`;
  return sendWhatsApp(phone, msg);
}

module.exports = { sendWhatsApp, notifyProNewAppointment, notifyPatientConfirmed, notifyCancelled, notifyPasswordReminder };
