const state = {
  conversations: [],
  selectedPhone: null,
  messages: [],
  filter: 'all',
  phaseFilter: 'all'
};

const MESSAGE_NAV_ITEMS = [
  { label: 'Recepción', filter: 'all' },
  { label: 'Bot', filter: 'bot' },
  { label: 'IA', filter: 'ia' },
  { label: 'Humano', filter: 'human' }
];

const PHASE_FILTER_ITEMS = [
  { label: 'Todos los estados', value: 'all' },
  { label: 'Nuevo chat', value: 'Nuevo chat' },
  { label: 'Cita probable', value: 'Cita probable' },
  { label: 'Seguimiento', value: 'Seguimiento' },
  { label: 'Confirmada', value: 'Confirmada' }
];

const APP_NAV = {
  logoSrc: '/mediaFiles/Logo_Thessa.png',
  brand: 'Thessa',
  sections: [],
  actions: [
    { label: 'Cerrar' }
  ]
};

const chatList = document.getElementById('chatList');
const messagesEl = document.getElementById('messages');
const appNavbar = document.getElementById('appNavbar');
const desk = document.getElementById('desk');
const messageTabs = document.getElementById('messageTabs');
const chatName = document.getElementById('chatName');
const chatPhone = document.getElementById('chatPhone');
const statusEl = document.getElementById('status');
const searchEl = document.getElementById('search');
const phaseFilter = document.getElementById('phaseFilter');
const composer = document.getElementById('composer');
const replyText = document.getElementById('replyText');
const sendButton = document.getElementById('sendButton');
const leadValue = document.getElementById('leadValue');
const interestValue = document.getElementById('interestValue');

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatDateTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const classify = (chatOrText) => {
  const isChat = typeof chatOrText === 'object' && chatOrText !== null;
  const text = isChat ? chatOrText.lastMessage : chatOrText;
  const value = normalize(text);
  const incomingCount = Number(isChat ? chatOrText.incomingCount || 0 : 0);
  const messageCount = Number(isChat ? chatOrText.messageCount || 0 : 0);
  const hasConversation = incomingCount > 1 || messageCount > 2;

  if (!value) return { tag: 'Nuevo chat', intent: 'Sin clasificar', priority: 'Pendiente', next: 'Esperar primer mensaje', interest: 'Pendiente' };
  if (/(confirmada|confirmado|confirmar asistencia|confirmo|asistire|ahi estare)/.test(value)) {
    return { tag: 'Confirmada', intent: 'Cita confirmada', priority: 'Alta', next: 'Mantener seguimiento', interest: 'Agenda' };
  }
  if (/(agendar|cita|reservar|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|pm|am|confirmar|cancelar|reprogramar)/.test(value)) {
    return { tag: 'Cita probable', intent: 'Agendar o gestionar cita', priority: 'Alta', next: 'Confirmar datos de cita', interest: 'Agenda' };
  }
  if (/(precio|cuesta|servicio|lumi|chocolaterapia|royal|seda|soft|facial|masaje)/.test(value)) {
    return { tag: 'Seguimiento', intent: 'Interes en servicio', priority: 'Media', next: 'Resolver duda y sugerir agenda', interest: 'Servicios' };
  }
  if (!hasConversation && /(hola|buenas|menu|ayuda)/.test(value)) {
    return { tag: 'Nuevo chat', intent: 'Saludo inicial', priority: 'Pendiente', next: 'Guiar con menu principal', interest: 'General' };
  }
  return { tag: 'Seguimiento', intent: 'Conversacion abierta', priority: 'Pendiente', next: 'Responder y clasificar', interest: 'Pendiente' };
};

const getCurrentChat = () => state.conversations.find((item) => item.phoneNumber === state.selectedPhone);

const renderAppNavbar = () => {
  appNavbar.innerHTML = `
    <div class="navbar-left">
      <button class="navbar-menu" type="button" aria-label="Menu">
        <span></span><span></span><span></span>
        <span></span><span></span><span></span>
        <span></span><span></span><span></span>
      </button>
      <a class="navbar-brand" href="/dashboard/" aria-label="${APP_NAV.brand}">
        <img src="${APP_NAV.logoSrc}" alt="${APP_NAV.brand}">
      </a>
      ${APP_NAV.sections.length ? `
        <nav class="navbar-sections" aria-label="Navegacion principal">
          ${APP_NAV.sections.map((section) => `
            <button class="navbar-section ${section.active ? 'active' : ''}" type="button">
              <span class="navbar-icon" aria-hidden="true">${section.icon}</span>
              <span>${section.label}</span>
              ${section.badge ? `<small>${section.badge}</small>` : ''}
            </button>
          `).join('')}
        </nav>
      ` : ''}
    </div>
    <div class="navbar-actions">
      ${APP_NAV.actions.map((action) => `
        <button class="navbar-action" type="button" aria-label="${action.label}">
          <span aria-hidden="true"></span>
        </button>
      `).join('')}
    </div>
  `;
};

const getCurrentPhaseLabel = () => PHASE_FILTER_ITEMS.find((item) => item.value === state.phaseFilter)?.label || 'Todos los estados';

const renderMessageNav = () => {
  messageTabs.innerHTML = MESSAGE_NAV_ITEMS.map((item) => `
    <button class="tab ${item.filter === state.filter ? 'active' : ''}" type="button" data-filter="${item.filter}">
      ${item.label}
    </button>
  `).join('');
};

const renderPhaseFilter = (isOpen = false) => {
  phaseFilter.classList.toggle('open', isOpen);
  phaseFilter.innerHTML = `
    <button class="status-filter-button ${isOpen ? 'open' : ''}" type="button" aria-haspopup="listbox" aria-expanded="${isOpen}">
      <span>${getCurrentPhaseLabel()}</span>
      <span class="status-chevron" aria-hidden="true"></span>
    </button>
    <div class="status-menu ${isOpen ? 'open' : ''}" role="listbox">
      ${PHASE_FILTER_ITEMS.map((item) => `
        <button class="status-option ${item.value === state.phaseFilter ? 'selected' : ''}" type="button" role="option" aria-selected="${item.value === state.phaseFilter}" data-phase="${item.value}">
          ${item.label}
        </button>
      `).join('')}
    </div>
  `;
};

const renderChats = () => {
  const query = searchEl.value.trim().toLowerCase();
  const chats = state.conversations.filter((chat) => {
    const meta = classify(chat);
    const matchesQuery = `${chat.name || ''} ${chat.phoneNumber}`.toLowerCase().includes(query);
    const matchesPhase = state.phaseFilter === 'all' || meta.tag === state.phaseFilter;
    return matchesQuery && matchesPhase;
  });
  statusEl.textContent = String(chats.length);

  chatList.innerHTML = chats.map((chat) => {
    const meta = classify(chat);
    return `
      <button class="chat-item ${chat.phoneNumber === state.selectedPhone ? 'active' : ''}" data-phone="${chat.phoneNumber}">
        <div class="chat-top">
          <span class="chat-title">${escapeHtml(chat.name || 'Paciente nuevo')}</span>
          <span class="chat-time">${formatTime(chat.lastAt) || 'Ahora'}</span>
        </div>
        <div class="chat-preview">${escapeHtml(chat.lastMessage || 'Conversacion lista para iniciar desde WhatsApp.')}</div>
        <span class="chat-tag">${escapeHtml(meta.tag)}</span>
      </button>
    `;
  }).join('');
};

const renderMessages = () => {
  if (!state.selectedPhone) {
    desk.classList.add('no-chat');
    messagesEl.className = 'messages empty';
    messagesEl.innerHTML = '<p class="empty-message">Seleccione un chat para comenzar a enviar mensajes</p>';
    return;
  }

  desk.classList.remove('no-chat');
  const visibleMessages = state.filter === 'all'
    ? state.messages.filter((message) => message.source !== 'note' && message.type !== 'note')
    : state.messages.filter((message) => message.direction === 'out' && message.source === state.filter);

  messagesEl.className = 'messages';
  if(!visibleMessages.length) {
    const label = state.filter === 'all' ? 'esta conversacion' : `mensajes de ${state.filter.toUpperCase()}`;
    messagesEl.innerHTML = `<p class="empty-filter">No hay ${label} todavia.</p>`;
    return;
  }

  messagesEl.innerHTML = visibleMessages.map((message) => `
    <div class="message-row ${message.direction === 'out' ? 'out' : 'in'}">
      ${message.direction === 'in' ? '<span class="avatar" aria-hidden="true">M</span>' : ''}
      <div class="bubble">
        <div class="bubble-text">${escapeHtml(message.text)}</div>
      </div>
      <span class="bubble-time">${getMessageLabel(message)} · ${formatDateTime(message.createdAt)}</span>
      ${message.direction === 'out' ? '<span class="avatar" aria-hidden="true">T</span>' : ''}
    </div>
  `).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const getMessageLabel = (message) => {
  if(message.direction === 'in') return 'Paciente';
  if(message.source === 'ia') return 'IA';
  if(message.source === 'human') return 'Humano';
  return 'Bot';
};

const renderContext = () => {
  const chat = getCurrentChat();
  const lastMessage = chat?.lastMessage || '';
  const meta = classify(chat || lastMessage);

  leadValue.textContent = chat ? 'Lead WhatsApp' : 'Sin lead';
  interestValue.textContent = meta.interest;
};

const selectChat = async (phoneNumber) => {
  state.selectedPhone = phoneNumber;
  const chat = getCurrentChat();
  desk.classList.remove('no-chat');
  chatName.textContent = chat?.name || 'Paciente nuevo';
  chatPhone.textContent = `${phoneNumber} | WhatsApp`;
  replyText.disabled = false;
  sendButton.disabled = !replyText.value.trim();
  const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/messages`);
  state.messages = await response.json();
  renderChats();
  renderMessages();
  renderContext();
};

const upsertConversation = (conversation) => {
  const index = state.conversations.findIndex((item) => item.phoneNumber === conversation.phoneNumber);
  if (index >= 0) state.conversations[index] = conversation;
  else state.conversations.unshift(conversation);
  state.conversations.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
};

chatList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-phone]');
  if (button) selectChat(button.dataset.phone);
});

searchEl.addEventListener('input', renderChats);

phaseFilter.addEventListener('click', (event) => {
  event.stopPropagation();
  const option = event.target.closest('[data-phase]');
  if (option) {
    state.phaseFilter = option.dataset.phase;
    renderPhaseFilter(false);
    renderChats();
    return;
  }

  if (event.target.closest('.status-filter-button')) {
    renderPhaseFilter(!phaseFilter.classList.contains('open'));
  }
});

document.addEventListener('click', (event) => {
  if (!phaseFilter.contains(event.target) && phaseFilter.classList.contains('open')) {
    renderPhaseFilter(false);
  }
});

messageTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-filter]');
  if (!tab) return;
  state.filter = tab.dataset.filter;
  renderMessageNav();
  renderMessages();
});

replyText.addEventListener('input', () => {
  replyText.style.height = '48px';
  replyText.style.height = `${Math.min(replyText.scrollHeight, 96)}px`;
  sendButton.disabled = !state.selectedPhone || !replyText.value.trim();
});

replyText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = replyText.value.trim();
  if (!state.selectedPhone || !text) return;

  sendButton.disabled = true;
  sendButton.textContent = 'Enviando';

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(state.selectedPhone)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || data.detail || 'No se pudo enviar');
    }
    replyText.value = '';
    replyText.style.height = '48px';
  } catch (error) {
    alert(error.message);
  } finally {
    sendButton.textContent = 'Enviar';
    sendButton.disabled = !replyText.value.trim();
  }
});

const loadInitial = async () => {
  const response = await fetch('/api/chats');
  state.conversations = await response.json();
  renderChats();
  renderContext();
};

const connectEvents = () => {
  const source = new EventSource('/api/chats/events');

  source.onopen = () => {
    statusEl.title = 'En vivo';
  };

  source.onerror = () => {
    statusEl.title = 'Reconectando';
  };

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'init') {
      state.conversations = data.payload.conversations || [];
      renderChats();
      renderContext();
      return;
    }

    if (data.event === 'message') {
      upsertConversation(data.payload.conversation);
      if (data.payload.message.phoneNumber === state.selectedPhone) {
        state.messages.push(data.payload.message);
        renderMessages();
        renderContext();
      }
      renderChats();
    }
  };
};

renderAppNavbar();
renderMessageNav();
renderPhaseFilter(false);
loadInitial();
connectEvents();
