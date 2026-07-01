import { renderCard } from './card.js';
import { escapeHtml } from './formatters.js';

export const renderBoard = ({ stages, items }) => {
  const board = document.getElementById('trackingBoard');
  const counts = new Map(stages.map((stage) => [stage.id, 0]));
  items.forEach((item) => counts.set(item.stage, (counts.get(item.stage) || 0) + 1));

  board.innerHTML = stages.map((stage) => {
    const stageItems = items.filter((item) => item.stage === stage.id);
    return `
      <section class="tracking-column shrink-0" data-drop-stage="${escapeHtml(stage.id)}">
        <header class="tracking-column-header">
          <h2 class="truncate text-[15px] font-semibold">${escapeHtml(stage.label)}</h2>
          <span class="column-count">
            <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            ${counts.get(stage.id) || 0}
          </span>
        </header>
        <div class="tracking-column-body">
          ${stageItems.length ? stageItems.map(renderCard).join('') : `
            <div class="empty-column">Sin pacientes</div>
          `}
        </div>
      </section>
    `;
  }).join('');
};
