// ─────────────────────────────────────────────
//  myFisio — Serviço de notificações WhatsApp
//  Usa Z-API (z-api.io) para enviar do número
//  +55 11 94353-1627 automaticamente
// ─────────────────────────────────────────────

/**
 * Envia mensagem WhatsApp via Z-API
 * Docs: https://developer.z-api.io/messages/send-text
 *
 * Variáveis de ambiente necessárias (Render):
 *   ZAPI_INSTANCE_ID  — ID da instância no Z-API
 *   ZAPI_TOKEN        — Token de segurança da instância
 *   ZAPI_CLIENT_TOKEN — Client-Token do Z-API (header de segurança)
 */
async function sendWhatsApp(phone, message) {
  const instanceId   = process.env.ZAPI_INSTANCE_ID;
  const token        = process.env.ZAPI_TOKEN;
  const clientToken  = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token) {
    console.log('[WhatsApp] Z-API não configurado — mensagem não enviada.');
    return { ok: false, reason: 'not_configured' };
  }

  // Limpa o número — mantém só dígitos e garante código do país
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '55' + cleanPhone.slice(1);
  if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientToken ? { 'Client-Token': clientToken } : {}),
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: message,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WhatsApp] Erro Z-API:', data);
      return { ok: false, reason: data };
    }
    console.log(`[WhatsApp] ✅ Enviado para ${cleanPhone}`);
    return { ok: true, data };
  } catch (err) {
    console.error('[WhatsApp] Falha na requisição:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ── Notificação: novo agendamento → fisioterapeuta ──────────────────────────
async function notifyProNewAppointment({ proPhone, proName, patientName, scheduledAt, serviceType, address, notes }) {
  if (!proPhone) return;
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const msg =
    `📬 *myFisio — Novo pedido de sessão!*\n\n` +
    `Olá, ${proName || 'Fisioterapeuta'}! Você recebeu um novo agendamento.\n\n` +
    `👤 *Paciente:* ${patientName || '—'}\n` +
    `📅 *Data:* ${ds}\n` +
    `🕐 *Horário:* ${ts}\n` +
    `🏠 *Tipo:* ${serviceType === 'domiciliar' ? 'Domiciliar' : 'Clínica'}\n` +
    (address ? `📍 *Endereço:* ${address}\n` : '') +
    (notes   ? `💬 *Observações:* ${notes}\n` : '') +
    `\nAcesse o app myFisio para confirmar ou recusar.`;

  return sendWhatsApp(proPhone, msg);
}

// ── Notificação: sessão confirmada → paciente ───────────────────────────────
async function notifyPatientConfirmed({ patientPhone, patientName, proName, scheduledAt, serviceType, address }) {
  if (!patientPhone) return;
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const msg =
    `✅ *myFisio — Sessão Confirmada!*\n\n` +
    `Olá, ${patientName || 'paciente'}! Sua sessão foi *confirmada*.\n\n` +
    `👩‍⚕️ *Fisioterapeuta:* ${proName || '—'}\n` +
    `📅 *Data:* ${ds}\n` +
    `🕐 *Horário:* ${ts}\n` +
    `🏠 *Tipo:* ${serviceType === 'domiciliar' ? 'Domiciliar' : 'Clínica'}\n` +
    (address ? `📍 *Endereço:* ${address}\n` : '') +
    `\nQualquer dúvida, entre em contato pelo myFisio. Até lá! 😊`;

  return sendWhatsApp(patientPhone, msg);
}

// ── Notificação: sessão cancelada ───────────────────────────────────────────
async function notifyCancelled({ phone, name, scheduledAt, cancelledBy }) {
  if (!phone) return;
  const d  = new Date(scheduledAt);
  const ds = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const msg =
    `❌ *myFisio — Sessão Cancelada*\n\n` +
    `Olá, ${name || ''}! A sessão do dia *${ds}* às *${ts}* foi cancelada.\n` +
    `${cancelledBy ? `Cancelado por: ${cancelledBy}\n` : ''}` +
    `\nAcesse o app para reagendar quando quiser.`;

  return sendWhatsApp(phone, msg);
}

module.exports = {
  sendWhatsApp,
  notifyProNewAppointment,
  notifyPatientConfirmed,
  notifyCancelled,
};
