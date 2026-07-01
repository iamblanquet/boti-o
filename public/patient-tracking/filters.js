import { escapeHtml, normalize } from './formatters.js';

export const getFilteredItems = ({ items, query, responsible, source }) => {
  const cleanQuery = normalize(query);
  return items.filter((item) => {
    const haystack = normalize([
      item.name,
      item.phoneNumber,
      item.lastMessage,
      item.responsible,
      item.campaignId,
      item.stageLabel
    ].join(' '));
    const matchesQuery = !cleanQuery || haystack.includes(cleanQuery);
    const matchesResponsible = responsible === 'all' || (item.responsible || 'Asignar un empleado') === responsible;
    const matchesSource = source === 'all' || item.stageSource === source;
    return matchesQuery && matchesResponsible && matchesSource;
  });
};

export const renderResponsibleOptions = (items) => {
  const select = document.getElementById('responsibleFilter');
  const current = select.value || 'all';
  const values = [...new Set(items.map((item) => item.responsible || 'Asignar un empleado'))].sort();
  select.innerHTML = `
    <option value="all">Todos los responsables</option>
    ${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}
  `;
  select.value = values.includes(current) ? current : 'all';
};
