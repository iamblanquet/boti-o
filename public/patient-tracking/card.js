import { escapeHtml, formatDateTime } from './formatters.js';

const initials = (name) => String(name || 'P')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('') || 'P';

const stageHint = (item) => {
  if (item.appointment) return item.appointment.serviceName || 'Cita confirmada';
  if (item.stageSource === 'manual') return 'Manual';
  return item.outgoingCount > 0 ? 'Respondido' : 'Borrador';
};

export const renderCard = (item) => `
  <article class="patient-card px-3 py-2.5"
    draggable="true"
    data-phone="${escapeHtml(item.phoneNumber)}"
    data-stage="${escapeHtml(item.stage)}">
    <div class="flex items-start gap-2.5">
      <div class="relative shrink-0">
        <div class="patient-avatar">${escapeHtml(initials(item.name))}</div>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="patient-name truncate text-[13px] font-extrabold leading-5">${escapeHtml(item.name)}</h3>
          ${item.manualStage ? `
            <button type="button" data-restore-auto="${escapeHtml(item.phoneNumber)}" class="patient-auto-button text-[10px] font-extrabold transition">Restaurar Auto</button>
          ` : ''}
        </div>
        <p class="patient-status truncate text-[11px] font-extrabold leading-4">${escapeHtml(stageHint(item))} <span class="patient-muted font-medium">${escapeHtml(item.lastMessage || '')}</span></p>
        <div class="patient-muted mt-2 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
          <svg class="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 1 1 14 0H3Z"/></svg>
          <span class="truncate">${escapeHtml(item.responsible || 'Asignar un empleado')}</span>
        </div>
        ${item.appointment ? `
          <p class="patient-muted mt-1 truncate text-[11px] font-semibold">${escapeHtml(formatDateTime(item.appointment.startAt))}</p>
        ` : ''}
        <a href="/dashboard/?phone=${encodeURIComponent(item.rawPhoneNumber || item.phoneNumber)}" class="card-link mt-1 inline-flex text-[11px] font-bold">Abrir chat</a>
      </div>
    </div>
  </article>
`;
