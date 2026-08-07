import { fetchClientInsights, updateClientResponsible, updateClientData } from './api.js';
import { DEFAULT_RESPONSIBLE, escapeHtml, normalize } from './formatters.js';
import { renderAppointmentsModal, renderClientDetail, renderClientsTable } from './render.js';

const state = {
  clients: [],
  selectedPhone: null,
  query: '',
  filter: 'all',
  page: 1,
  pageSize: 10,
  loading: false,
  employees: []
};

const getSelectedClient = () => state.clients.find((client) => client.phoneNumber === state.selectedPhone) || null;

const getFilteredClients = () => {
  const query = normalize(state.query);
  return state.clients.filter((client) => {
    const responsible = client.responsible || DEFAULT_RESPONSIBLE;
    const matchesFilter = state.filter === 'all'
      || (state.filter === 'assigned' && responsible !== DEFAULT_RESPONSIBLE)
      || (state.filter === 'unassigned' && responsible === DEFAULT_RESPONSIBLE)
      || (state.filter === 'visited' && client.lastVisit);

    const haystack = normalize([
      client.name,
      client.phoneNumber,
      client.email,
      client.notes,
      client.campaignId,
      responsible,
      client.lastAppointment?.serviceName
    ].join(' '));

    return matchesFilter && (!query || haystack.includes(query));
  });
};

const render = () => {
  const filtered = getFilteredClients();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const pagedClients = filtered.slice(start, start + state.pageSize);

  if (!state.selectedPhone || !filtered.some((client) => client.phoneNumber === state.selectedPhone)) {
    state.selectedPhone = pagedClients[0]?.phoneNumber || filtered[0]?.phoneNumber || null;
  }

  renderClientsTable({
    clients: pagedClients,
    selectedPhone: state.selectedPhone,
    pagination: {
      page: state.page,
      pageSize: state.pageSize,
      total: filtered.length,
      totalPages
    },
    employees: state.employees
  });
  renderClientDetail(getSelectedClient());
};

const setLoading = (loading) => {
  state.loading = loading;
  const button = document.getElementById('refreshClients');
  if (button) button.disabled = loading;
};

const loadClients = async () => {
  setLoading(true);
  try {
    const payload = await fetchClientInsights();
    state.clients = payload.items || [];
    state.page = 1;
    render();
  } catch (error) {
    console.error('Error al cargar clientes:', error);
    document.getElementById('clientsTableBody').innerHTML = `
      <tr><td colspan="7" class="px-4 py-8 text-center text-sm font-semibold text-red-600">${error.message}</td></tr>
    `;
  } finally {
    setLoading(false);
  }
};

const updateLocalResponsible = (phoneNumber, responsible) => {
  state.clients = state.clients.map((client) => (
    client.phoneNumber === phoneNumber
      ? { ...client, responsible: responsible || DEFAULT_RESPONSIBLE }
      : client
  ));
};

const openAppointmentsModal = (phoneNumber) => {
  const client = state.clients.find((item) => item.phoneNumber === phoneNumber);
  if (!client) return;

  renderAppointmentsModal(client);
  document.getElementById('appointmentsModal').classList.remove('hidden');
};

const closeAppointmentsModal = () => {
  document.getElementById('appointmentsModal').classList.add('hidden');
};

const openEditClientModal = (phoneNumber) => {
  const client = state.clients.find((item) => item.phoneNumber === phoneNumber);
  if (!client) return;

  document.getElementById('editClientPhone').value = client.phoneNumber;
  document.getElementById('editClientName').value = client.name || '';
  document.getElementById('editClientEmail').value = client.email || '';
  document.getElementById('editBirthdayDay').value = client.birthdayDay || '';
  document.getElementById('editBirthdayMonth').value = client.birthdayMonth || '';
  document.getElementById('editClientCampaign').value = client.campaignId || '';
  document.getElementById('editClientNotes').value = client.notes || '';

  document.getElementById('editClientModal').classList.remove('hidden');
};

const closeEditClientModal = () => {
  document.getElementById('editClientModal').classList.add('hidden');
};

const handleEditClientSubmit = async (event) => {
  event.preventDefault();
  const phoneNumber = document.getElementById('editClientPhone').value;
  if (!phoneNumber) return;

  const saveBtn = document.getElementById('saveEditClientBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  const name = document.getElementById('editClientName').value.trim() || null;
  const email = document.getElementById('editClientEmail').value.trim() || null;
  const dayRaw = document.getElementById('editBirthdayDay').value.trim();
  const monthRaw = document.getElementById('editBirthdayMonth').value;
  const campaignId = document.getElementById('editClientCampaign').value.trim() || null;
  const notes = document.getElementById('editClientNotes').value.trim() || null;

  const birthdayDay = dayRaw ? Number(dayRaw) : null;
  const birthdayMonth = monthRaw ? Number(monthRaw) : null;

  if ((birthdayDay && !birthdayMonth) || (!birthdayDay && birthdayMonth)) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar cambios';
    return window.showCustomAlert('Para guardar la fecha de cumpleaños debes seleccionar tanto el día como el mes.');
  }

  try {
    const updatedClient = await updateClientData(phoneNumber, {
      name,
      email,
      birthdayDay,
      birthdayMonth,
      campaignId,
      notes
    });

    state.clients = state.clients.map((c) => (
      c.phoneNumber === phoneNumber
        ? {
            ...c,
            ...updatedClient,
            birthday: updatedClient.birthday || (birthdayDay && birthdayMonth ? `${String(birthdayDay).padStart(2, '0')}/${String(birthdayMonth).padStart(2, '0')}` : null)
          }
        : c
    ));

    closeEditClientModal();
    render();
    if (window.showCustomAlert) {
      window.showCustomAlert('Datos del cliente actualizados correctamente.');
    }
  } catch (error) {
    console.error('Error al guardar cliente:', error);
    window.showCustomAlert(error.message || 'No se pudieron actualizar los datos del cliente');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar cambios';
  }
};

const handleResponsibleChange = async (input) => {
  const phoneNumber = input.dataset.phone;
  const responsible = input.value.trim() || DEFAULT_RESPONSIBLE;
  const previous = state.clients.find((client) => client.phoneNumber === phoneNumber)?.responsible || DEFAULT_RESPONSIBLE;

  input.value = responsible;
  input.disabled = true;
  updateLocalResponsible(phoneNumber, responsible);
  render();

  try {
    await updateClientResponsible(phoneNumber, responsible);
  } catch (error) {
    console.error('Error al actualizar responsable:', error);
    updateLocalResponsible(phoneNumber, previous);
    render();
    window.showCustomAlert('No se pudo actualizar el empleado asignado');
  }
};

const bindDrawer = () => {
  const menuBtn = document.getElementById('mainMenuBtn');
  const drawer = document.getElementById('sideDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('closeDrawerBtn');

  const open = () => {
    drawer.classList.add('drawer-open');
    overlay.classList.add('overlay-visible');
  };
  const close = () => {
    drawer.classList.remove('drawer-open');
    overlay.classList.remove('overlay-visible');
  };

  menuBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
};

const bindEvents = () => {
  document.getElementById('clientSearch').addEventListener('input', (event) => {
    state.query = event.target.value;
    state.page = 1;
    render();
  });

  document.getElementById('clientFilter').addEventListener('change', (event) => {
    state.filter = event.target.value;
    state.page = 1;
    render();
  });

  document.getElementById('refreshClients').addEventListener('click', loadClients);

  document.getElementById('clientsTableBody').addEventListener('click', (event) => {
    const appointmentsButton = event.target.closest('[data-open-appointments]');
    if (appointmentsButton) {
      openAppointmentsModal(appointmentsButton.dataset.openAppointments);
      return;
    }

    const selectButton = event.target.closest('[data-select-client]');
    if (!selectButton) return;
    state.selectedPhone = selectButton.dataset.selectClient;
    render();

    const detailEl = document.getElementById('clientDetail');
    if (detailEl) {
      detailEl.classList.add('mobile-open');
    }
  });

  document.getElementById('clientsTableBody').addEventListener('change', (event) => {
    if (!event.target.classList.contains('responsible-input')) return;
    handleResponsibleChange(event.target);
  });

  document.getElementById('paginationControls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page-action]');
    if (!button || button.disabled) return;
    if (button.dataset.pageAction === 'prev') state.page = Math.max(1, state.page - 1);
    if (button.dataset.pageAction === 'next') state.page += 1;
    render();
  });

  document.getElementById('clientDetail').addEventListener('click', (event) => {
    const closeBtn = event.target.closest('#closeClientDetailBtn');
    if (closeBtn) {
      const detailEl = document.getElementById('clientDetail');
      if (detailEl) {
        detailEl.classList.remove('mobile-open');
      }
      return;
    }

    const editBtn = event.target.closest('[data-open-edit-client]');
    if (editBtn) {
      openEditClientModal(editBtn.dataset.openEditClient);
      return;
    }

    const appointmentsButton = event.target.closest('[data-open-appointments]');
    if (!appointmentsButton) return;
    openAppointmentsModal(appointmentsButton.dataset.openAppointments);
  });

  document.getElementById('closeAppointmentsModal').addEventListener('click', closeAppointmentsModal);
  document.getElementById('appointmentsModal').addEventListener('click', (event) => {
    if (event.target.id === 'appointmentsModal') closeAppointmentsModal();
  });

  document.getElementById('closeEditClientModal').addEventListener('click', closeEditClientModal);
  document.getElementById('cancelEditClientBtn').addEventListener('click', closeEditClientModal);
  document.getElementById('editClientForm').addEventListener('submit', handleEditClientSubmit);
  document.getElementById('editClientModal').addEventListener('click', (event) => {
    if (event.target.id === 'editClientModal') closeEditClientModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAppointmentsModal();
      closeEditClientModal();
    }
  });
};

const loadEmployees = async () => {
  try {
    const res = await fetch('/api/employees');
    if (res.ok) {
      const employees = await res.json();
      state.employees = employees.filter(e => e.active && e.role === 'employee');
      render();
    }
  } catch (err) {
    console.error('Error fetching employees in clients page', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  bindDrawer();
  bindEvents();
  loadEmployees();
  loadClients();
});
