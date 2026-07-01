import { fetchBoard, restoreAutomaticStage, updateManualStage } from './api.js';
import { renderBoard } from './board.js';
import { getFilteredItems, renderResponsibleOptions } from './filters.js';

const state = {
  stages: [],
  items: [],
  query: '',
  responsible: 'all',
  source: 'all',
  loading: false,
  draggedPhone: null
};

const showError = (message) => {
  if (window.showCustomAlert) window.showCustomAlert(message);
  else alert(message);
};

const getVisibleItems = () => getFilteredItems({
  items: state.items,
  query: state.query,
  responsible: state.responsible,
  source: state.source
});

const render = () => {
  const visible = getVisibleItems();
  document.getElementById('totalPatients').textContent = String(visible.length);
  renderBoard({ stages: state.stages, items: visible });
};

const setLoading = (loading) => {
  state.loading = loading;
  document.getElementById('refreshBoard').disabled = loading;
};

const loadBoard = async () => {
  setLoading(true);
  try {
    const payload = await fetchBoard();
    state.stages = payload.stages || [];
    state.items = payload.items || [];
    renderResponsibleOptions(state.items);
    render();
  } catch (error) {
    console.error('Error al cargar seguimiento:', error);
    showError(error.message);
  } finally {
    setLoading(false);
  }
};

const moveLocalCard = (phoneNumber, stage) => {
  state.items = state.items.map((item) => (
    item.phoneNumber === phoneNumber
      ? {
          ...item,
          stage,
          stageLabel: state.stages.find((candidate) => candidate.id === stage)?.label || item.stageLabel,
          manualStage: stage,
          stageSource: 'manual'
        }
      : item
  ));
};

const handleDrop = async (stage) => {
  const phoneNumber = state.draggedPhone;
  state.draggedPhone = null;
  document.querySelectorAll('.tracking-column').forEach((column) => column.classList.remove('drop-active'));
  if (!phoneNumber || !stage) return;

  const item = state.items.find((candidate) => candidate.phoneNumber === phoneNumber);
  if (!item || item.stage === stage) return;

  const previousItems = state.items;
  moveLocalCard(phoneNumber, stage);
  render();

  try {
    await updateManualStage(phoneNumber, stage);
  } catch (error) {
    console.error('Error al mover tarjeta:', error);
    state.items = previousItems;
    render();
    showError(error.message);
  }
};

const handleRestoreAuto = async (phoneNumber) => {
  const previousItems = state.items;
  state.items = state.items.map((item) => (
    item.phoneNumber === phoneNumber
      ? {
          ...item,
          stage: item.automaticStage,
          stageLabel: item.automaticStageLabel,
          manualStage: null,
          stageSource: 'automatic'
        }
      : item
  ));
  render();

  try {
    await restoreAutomaticStage(phoneNumber);
    await loadBoard();
  } catch (error) {
    console.error('Error al restaurar automatico:', error);
    state.items = previousItems;
    render();
    showError(error.message);
  }
};

const openChatModal = (phoneNumber) => {
  const modal = document.getElementById('chatModal');
  const iframe = document.getElementById('chatIframe');
  if (!modal || !iframe) return;
  iframe.src = `/dashboard/?phone=${encodeURIComponent(phoneNumber)}&embed=true`;
  modal.classList.remove('hidden');
};

const closeChatModal = () => {
  const modal = document.getElementById('chatModal');
  const iframe = document.getElementById('chatIframe');
  if (!modal || !iframe) return;
  modal.classList.add('hidden');
  iframe.src = 'about:blank';
};

const bindEvents = () => {
  document.getElementById('searchPatients').addEventListener('input', (event) => {
    state.query = event.target.value;
    render();
  });

  document.getElementById('responsibleFilter').addEventListener('change', (event) => {
    state.responsible = event.target.value;
    render();
  });

  document.getElementById('sourceFilter').addEventListener('change', (event) => {
    state.source = event.target.value;
    render();
  });

  document.getElementById('refreshBoard').addEventListener('click', loadBoard);

  const board = document.getElementById('trackingBoard');
  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.patient-card');
    if (!card) return;
    state.draggedPhone = card.dataset.phone;
    event.dataTransfer.effectAllowed = 'move';
  });

  board.addEventListener('dragover', (event) => {
    const column = event.target.closest('[data-drop-stage]');
    if (!column || !state.draggedPhone) return;
    event.preventDefault();
    column.classList.add('drop-active');
  });

  board.addEventListener('dragleave', (event) => {
    const column = event.target.closest('[data-drop-stage]');
    if (column && !column.contains(event.relatedTarget)) column.classList.remove('drop-active');
  });

  board.addEventListener('drop', (event) => {
    const column = event.target.closest('[data-drop-stage]');
    if (!column) return;
    event.preventDefault();
    handleDrop(column.dataset.dropStage);
  });

  board.addEventListener('click', (event) => {
    const restoreButton = event.target.closest('[data-restore-auto]');
    if (restoreButton) {
      handleRestoreAuto(restoreButton.dataset.restoreAuto);
      return;
    }

    const card = event.target.closest('.patient-card');
    if (card) {
      event.preventDefault();
      const phoneNumber = card.dataset.phone;
      openChatModal(phoneNumber);
    }
  });

  const closeBtn = document.getElementById('closeChatModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeChatModal);
  }

  const modal = document.getElementById('chatModal');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeChatModal();
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadBoard();
});
