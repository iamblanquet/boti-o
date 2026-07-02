import {
  DEFAULT_RESPONSIBLE,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  messageUrl,
  responsibleClass
} from './formatters.js';

const getInitials = (name) => String(name || 'C')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('') || 'C';

const statusBadgeClass = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'confirmada') return 'bg-emerald-100 text-emerald-800';
  if (value === 'cancelada') return 'bg-rose-100 text-rose-800';
  if (value === 'pendiente') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

export const renderClientsTable = ({ clients, selectedPhone, pagination, employees }) => {
  const body = document.getElementById('clientsTableBody');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const paginationControls = document.getElementById('paginationControls');

  const total = pagination?.total || 0;
  const page = pagination?.page || 1;
  const totalPages = pagination?.totalPages || 1;
  const start = total ? ((page - 1) * pagination.pageSize) + 1 : 0;
  const end = Math.min(page * pagination.pageSize, total);

  resultCount.textContent = total
    ? `${start}-${end} de ${total} cliente${total === 1 ? '' : 's'}`
    : '0 clientes en vista';
  emptyState.classList.toggle('hidden', total > 0);
  paginationControls.classList.toggle('hidden', total === 0);

  body.innerHTML = clients.map((client) => {
    const active = client.phoneNumber === selectedPhone;
    const responsible = client.responsible || DEFAULT_RESPONSIBLE;

    return `
      <tr class="transition hover:bg-emerald-50/50 ${active ? 'bg-emerald-50/80' : ''}" data-client-row="${escapeHtml(client.phoneNumber)}">
        <td class="px-4 py-4">
          <button type="button" class="flex min-w-0 items-center gap-3 text-left" data-select-client="${escapeHtml(client.phoneNumber)}">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-extrabold text-emerald-700">${escapeHtml(getInitials(client.name))}</span>
            <span class="min-w-0">
              <span class="block truncate font-bold text-slate-900">${escapeHtml(client.name || 'Cliente nuevo')}</span>
              <span class="block truncate text-xs text-slate-500">${escapeHtml(formatPhone(client.phoneNumber))}</span>
              <span class="block truncate text-xs text-slate-400">${client.email ? escapeHtml(client.email) : 'Sin correo'}</span>
            </span>
          </button>
        </td>
        <td class="px-4 py-4">
          <select
            class="responsible-input w-44 rounded-lg border px-2.5 py-2 text-xs font-bold outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${responsibleClass(responsible)}"
            data-phone="${escapeHtml(client.phoneNumber)}"
          >
            <option value="${DEFAULT_RESPONSIBLE}" disabled ${responsible === DEFAULT_RESPONSIBLE ? 'selected' : ''}>${DEFAULT_RESPONSIBLE}</option>
            ${(employees || []).map(e => `
              <option value="${escapeHtml(e.name)}" ${responsible === e.name ? 'selected' : ''}>${escapeHtml(e.name)}</option>
            `).join('')}
          </select>
        </td>
        <td class="px-4 py-4">
          <button type="button" data-open-appointments="${escapeHtml(client.phoneNumber)}" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Ver citas
          </button>
        </td>
        <td class="px-4 py-4 text-sm font-semibold text-slate-700">${escapeHtml(formatDate(client.lastVisit?.startAt))}</td>
        <td class="px-4 py-4 text-right text-sm font-extrabold text-slate-900">${escapeHtml(formatMoney(client.totalSpent))}</td>
        <td class="px-4 py-4 text-center">
          <span class="inline-flex min-w-8 items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">${client.confirmedAppointmentsCount || 0}</span>
        </td>
        <td class="px-4 py-4 text-right">
          <a href="${messageUrl(client.phoneNumber)}" class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            Mensaje
          </a>
        </td>
      </tr>
    `;
  }).join('');

  paginationControls.innerHTML = total ? `
    <p class="font-semibold text-slate-500">Pagina ${page} de ${totalPages}</p>
    <div class="flex items-center gap-2">
      <button type="button" data-page-action="prev" ${page <= 1 ? 'disabled' : ''} class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        Anterior
      </button>
      <button type="button" data-page-action="next" ${page >= totalPages ? 'disabled' : ''} class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
        Siguiente
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </button>
    </div>
  ` : '';
};

const detailField = (label, value) => `
  <div class="rounded-xl bg-slate-50 px-3 py-2.5">
    <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${escapeHtml(label)}</p>
    <p class="mt-1 min-w-0 break-words text-sm font-bold text-slate-800">${escapeHtml(value || 'Sin registro')}</p>
  </div>
`;

export const renderClientDetail = (client) => {
  const detail = document.getElementById('clientDetail');
  if (!client) {
    detail.innerHTML = `
      <div class="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A9.969 9.969 0 0112 15c2.21 0 4.248.72 5.879 1.936M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </div>
        <p class="mt-3 text-sm font-bold text-slate-700">Selecciona un cliente</p>
        <p class="mt-1 text-xs text-slate-400">Aqui veras su monto gastado y datos de CRM.</p>
      </div>
    `;
    return;
  }

  const responsible = client.responsible || DEFAULT_RESPONSIBLE;

  detail.innerHTML = `
    <div class="flex flex-col">
      <div class="border-b border-slate-100 px-5 py-4">
        <!-- START: MOBILE RESPONSIVE CLOSE BUTTON -->
        <div class="flex justify-between items-center mb-4 lg:hidden">
          <span class="font-bold text-slate-800 text-sm">Ficha del Cliente</span>
          <button id="closeClientDetailBtn" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors" type="button" aria-label="Cerrar Ficha">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <!-- END: MOBILE RESPONSIVE CLOSE BUTTON -->
        <div class="flex items-start gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-extrabold text-emerald-700">${escapeHtml(getInitials(client.name))}</div>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-lg font-extrabold text-slate-900">${escapeHtml(client.name || 'Cliente nuevo')}</h2>
            <p class="truncate text-sm text-slate-500">${escapeHtml(formatPhone(client.phoneNumber))}</p>
            <span class="mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${responsibleClass(responsible)}">${escapeHtml(responsible)}</span>
          </div>
        </div>
        <a href="${messageUrl(client.phoneNumber)}" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          Enviar mensaje rapido
        </a>
      </div>

      <div class="grid grid-cols-2 gap-2 border-b border-slate-100 p-4">
        ${detailField('Monto gastado', formatMoney(client.totalSpent))}
        ${detailField('Confirmadas', client.confirmedAppointmentsCount || 0)}
        ${detailField('Ultima visita', formatDate(client.lastVisit?.startAt))}
        ${detailField('Total citas', client.appointmentsCount || 0)}
      </div>

      <div class="border-b border-slate-100 p-4">
        <h3 class="text-xs font-extrabold uppercase tracking-wide text-slate-400">Datos del cliente</h3>
        <div class="mt-3 grid gap-2">
          ${detailField('Correo', client.email)}
          ${detailField('Cumpleaños', client.birthday)}
          ${detailField('Origen / campana', client.campaignId)}
          ${detailField('Notas CRM', client.notes)}
        </div>
      </div>

      <div class="p-4">
        <button type="button" data-open-appointments="${escapeHtml(client.phoneNumber)}" class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-extrabold text-emerald-700 transition hover:bg-emerald-100">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          Ver todas las citas del cliente
        </button>
      </div>
    </div>
  `;
};

export const renderAppointmentsModal = (client) => {
  const title = document.getElementById('appointmentsModalTitle');
  const sub = document.getElementById('appointmentsModalSub');
  const body = document.getElementById('appointmentsModalBody');
  const appointments = client?.appointments || [];

  title.textContent = client ? `Citas de ${client.name || 'Cliente'}` : 'Citas del cliente';
  sub.textContent = client
    ? `${formatPhone(client.phoneNumber)} - ${appointments.length} cita${appointments.length === 1 ? '' : 's'} registradas`
    : '';

  body.innerHTML = appointments.length ? `
    <div class="grid gap-3">
      ${appointments.map((appointment) => `
        <article class="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <p class="truncate text-sm font-extrabold text-slate-900">${escapeHtml(appointment.serviceName || 'Servicio')}</p>
              <p class="mt-1 text-xs font-bold text-slate-500">${escapeHtml(formatDateTime(appointment.startAt))}</p>
              <p class="mt-1 text-xs text-slate-400">${escapeHtml((appointment.people || 1) + ' persona' + (Number(appointment.people || 1) === 1 ? '' : 's'))}</p>
            </div>
            <span class="inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusBadgeClass(appointment.status)}">${escapeHtml(appointment.status || 'Sin estado')}</span>
          </div>
        </article>
      `).join('')}
    </div>
  ` : '<p class="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">Este cliente aun no tiene citas registradas.</p>';
};
