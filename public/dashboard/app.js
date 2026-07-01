const state = {
  conversations: [],
  selectedPhone: null,
  messages: [],
  filter: 'all',
  phaseFilter: 'all',
  assigneeFilter: 'all',
  currentUser: null,
  employees: [],
  selectedFile: null,
  appointments: [],
  clients: [],
  searchContactsQuery: '',
  selectedClient: null,
  campaigns: [],
  chatSummaries: {},
  summaryLoading: false,
  detailedContextLoading: false,
  conversationControls: {},
  replySuggestionLoading: false,
  appointmentServices: [],
  appointmentServicesLoaded: false,
  appointmentServicesLoading: false,
  appointmentServiceSearchQuery: '',
  selectedAppointmentServiceId: null
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

const DEFAULT_CLIENT_RESPONSIBLE = 'Asignar un empleado';

const APP_NAV = {
  logoSrc: '/mediaFiles/Logo_Thessa.png',
  brand: 'Thessa',
  sections: [],
  actions: []
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
const clientResponsibleInput = document.getElementById('clientResponsibleInput');
const emojiButton = document.getElementById('emojiButton');
const emojiPicker = document.getElementById('emojiPicker');
const attachmentButton = document.getElementById('attachmentButton');
const aiReplySuggestionBtn = document.getElementById('aiReplySuggestionBtn');
const attachmentInput = document.getElementById('attachmentInput');
const attachmentPreview = document.getElementById('attachmentPreview');
const attachmentIcon = document.getElementById('attachmentIcon');
const attachmentName = document.getElementById('attachmentName');
const attachmentSize = document.getElementById('attachmentSize');
const cancelAttachment = document.getElementById('cancelAttachment');
const voiceRecordButton = document.getElementById('voiceRecordButton');
const voiceRecordTimer = document.getElementById('voiceRecordTimer');
const voiceRecordTimerText = document.getElementById('voiceRecordTimerText');
const conversationControlBtn = document.getElementById('conversationControlBtn');
const conversationControlBtnText = document.getElementById('conversationControlBtnText');
const startAppointmentFlowBtn = document.getElementById('startAppointmentFlowBtn');
const appointmentFlowModal = document.getElementById('appointmentFlowModal');
const appointmentFlowModalContent = document.getElementById('appointmentFlowModalContent');
const appointmentFlowClientLabel = document.getElementById('appointmentFlowClientLabel');
const closeAppointmentFlowModal = document.getElementById('closeAppointmentFlowModal');
const cancelAppointmentFlowBtn = document.getElementById('cancelAppointmentFlowBtn');
const appointmentServiceSearch = document.getElementById('appointmentServiceSearch');
const appointmentServiceList = document.getElementById('appointmentServiceList');
const confirmAppointmentFlowBtn = document.getElementById('confirmAppointmentFlowBtn');
const aiSummaryStatus = document.getElementById('aiSummaryStatus');
const aiSummaryContainer = document.getElementById('aiSummaryContainer');
const refreshAiSummaryBtn = document.getElementById('refreshAiSummaryBtn');
const openDetailedContextBtn = document.getElementById('openDetailedContextBtn');
const detailedContextModal = document.getElementById('detailedContextModal');
const detailedContextModalContent = document.getElementById('detailedContextModalContent');
const closeDetailedContextModal = document.getElementById('closeDetailedContextModal');
const updateDetailedContextBtn = document.getElementById('updateDetailedContextBtn');
const detailedContextSubtitle = document.getElementById('detailedContextSubtitle');
const detailedContextBody = document.getElementById('detailedContextBody');
const AudioAttachments = window.DashboardAudioAttachments;
const sendButtonReadyContent = sendButton.innerHTML;
let audioRecorder = null;

// ─── Custom Alert Modal ──────────────────────────────────────────────────────
const showCustomAlert = (message) => {
  const modal = document.getElementById('customAlertModal');
  const content = document.getElementById('customAlertModalContent');
  const msgEl = document.getElementById('customAlertMessage');
  const closeBtn = document.getElementById('closeCustomAlertBtn');
  
  if (!modal) {
    alert(message); // Fallback
    return;
  }
  
  msgEl.textContent = message;
  modal.classList.remove('hidden');
  
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  });
  
  const closeModal = () => {
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
    closeBtn.removeEventListener('click', closeModal);
  };
  
  closeBtn.addEventListener('click', closeModal);
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Side Drawer Menu ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const menuBtn  = document.getElementById('mainMenuBtn');
  const drawer   = document.getElementById('sideDrawer');
  const overlay  = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('closeDrawerBtn');

  function openDrawer()  { drawer.classList.add('drawer-open');    overlay.classList.add('overlay-visible'); }
  function closeDrawer() { drawer.classList.remove('drawer-open'); overlay.classList.remove('overlay-visible'); }

  if (menuBtn)  menuBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay)  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
});
// ─────────────────────────────────────────────────────────────────────────────

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

const formatSummaryMeta = (summary) => {
  if (!summary) return 'Sin resumen disponible';
  const parts = [];
  if (summary.updatedAt || summary.lastSummarizedAt) {
    parts.push(`Actualizado ${formatDateTime(summary.updatedAt || summary.lastSummarizedAt)}`);
  }
  const pending = Number(summary.pendingMessageCount || 0);
  parts.push(`${Math.min(pending, 20)}/20 mensajes nuevos`);
  if (summary.status === 'error') parts.push('requiere reintento');
  return parts.join(' | ');
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatPayloadText = (text) => {
  if (!text) return '';
  const str = String(text).trim();

  // If text is a media URL/link, return descriptive label
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/mediaFiles/')) {
    let checkStr = str;
    if (str.includes('|')) {
      checkStr = str.split('|')[1];
    } else {
      checkStr = str.split('?')[0];
    }
    const ext = checkStr.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return '📷 Imagen';
    }
    if (['mp4', 'webm', 'ogg', 'mov', '3gp'].includes(ext)) {
      return '🎥 Video';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
      return '🎵 Audio';
    }
    return '📄 Documento';
  }

  // Static mappings
  const staticMappings = {
    'menu_ai': 'Preguntas a la IA',
    'menu_catalog': 'Ver Catálogo',
    'menu_appointments': 'Agendar Cita',
    'menu_main': 'Menú Principal',
    'appt_people_1': '1 persona',
    'appt_people_2': '2 personas',
    'appt_people_3': '3 personas'
  };

  if (staticMappings[str]) {
    return staticMappings[str];
  }

  // Confirm/Cancel action payloads
  if (str.startsWith('appt_confirm_')) {
    return 'Confirmar Cita';
  }
  if (str.startsWith('appt_cancel_')) {
    return 'Cancelar Cita';
  }

  // Date payloads (appt_date_YYYY-MM-DD)
  const dateMatch = str.match(/^appt_date_(.+)$/);
  if (dateMatch) {
    const rawDate = dateMatch[1];
    try {
      const parts = rawDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return new Intl.DateTimeFormat('es-MX', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        }).format(d);
      }
    } catch (e) {
      // ignore
    }
    return rawDate;
  }

  // Time payloads (appt_time_HH-MM)
  const timeMatch = str.match(/^appt_time_(.+)$/);
  if (timeMatch) {
    const rawTime = timeMatch[1];
    const formattedTime = rawTime.replace('-', ':');
    try {
      const parts = formattedTime.split(':');
      if (parts.length === 2) {
        let hour = Number(parts[0]);
        const min = parts[1];
        const ampm = hour >= 12 ? 'p.m.' : 'a.m.';
        hour = hour % 12;
        hour = hour ? hour : 12;
        return `${hour}:${min} ${ampm}`;
      }
    } catch (e) {
      // ignore
    }
    return formattedTime;
  }

  // Category and Service payloads
  const prefixRegex = /^(appt_)?(category|service)_(.+)$/;
  const match = str.match(prefixRegex);
  if (match) {
    const rawName = match[3];
    let displayName = rawName.replace(/[-_]+/g, ' ');
    displayName = displayName.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const accentOverrides = {
      'Masajes': 'Masajes',
      'Faciales': 'Faciales',
      'Depilaciones': 'Depilaciones',
      'Paquetes': 'Paquetes',
      'Tratamientos Especiales': 'Tratamientos Especiales',
      'Masaje Con Piedras Calientes': 'Masaje con Piedras Calientes',
      'Masaje Relajante': 'Masaje Relajante',
      'Masaje Descontracturante': 'Masaje Descontracturante',
      'Masaje Drenaje Linfatico': 'Masaje Drenaje Linfático',
      'Masaje Piernas Cansadas': 'Masaje Piernas Cansadas',
      'Maderoterapia Corporal': 'Maderoterapia Corporal',
      'Limpieza Facial': 'Limpieza Facial',
      'Microdermoabrasion': 'Microdermoabrasión',
      'Lumi Piel': 'Lumi Piel',
      'Royal Skin': 'Royal Skin',
      'Seda Effect': 'Seda Effect',
      'Soft Harmony': 'Soft Harmony'
    };

    return accentOverrides[displayName] || displayName;
  }

  return text;
};

const classify = (chatOrText) => {
  const isChat = typeof chatOrText === 'object' && chatOrText !== null;
  const text = isChat ? chatOrText.lastMessage : chatOrText;
  const value = normalize(text);
  const appointmentSummary = isChat ? chatOrText.appointmentSummary || {} : {};
  const incomingCount = Number(isChat ? chatOrText.incomingCount || 0 : 0);
  const outgoingCount = Number(isChat ? chatOrText.outgoingCount || 0 : 0);
  const messageCount = Number(isChat ? chatOrText.messageCount || 0 : 0);
  const knownMessageCount = Math.max(messageCount, incomingCount + outgoingCount);
  const createdAt = isChat && chatOrText.createdAt ? new Date(chatOrText.createdAt).getTime() : 0;
  const lastAt = isChat && chatOrText.lastAt ? new Date(chatOrText.lastAt).getTime() : 0;
  const hasConversationAge = createdAt && lastAt && Math.abs(lastAt - createdAt) > 5 * 60 * 1000;
  const hasAppointmentHistory = Boolean(appointmentSummary.hasHistory || appointmentSummary.totalCount > 0);
  const hasConversation = knownMessageCount > 1 || hasConversationAge || hasAppointmentHistory;

  if (appointmentSummary.activeStatus === 'confirmada') {
    return { tag: 'Confirmada', intent: 'Cita confirmada', priority: 'Alta', next: 'Mantener seguimiento', interest: 'Agenda' };
  }

  if (appointmentSummary.activeStatus === 'pendiente') {
    return { tag: 'Cita probable', intent: 'Cita pendiente de confirmar', priority: 'Alta', next: 'Confirmar asistencia', interest: 'Agenda' };
  }

  if (!value) {
    return hasConversation
      ? { tag: 'Seguimiento', intent: 'Conversacion abierta', priority: 'Pendiente', next: 'Responder y clasificar', interest: 'Pendiente' }
      : { tag: 'Nuevo chat', intent: 'Sin clasificar', priority: 'Pendiente', next: 'Esperar primer mensaje', interest: 'Pendiente' };
  }

  if (!hasAppointmentHistory && /(confirmada|confirmado|confirmar asistencia|confirmo|asistire|ahi estare)/.test(value)) {
    return { tag: 'Confirmada', intent: 'Cita confirmada', priority: 'Alta', next: 'Mantener seguimiento', interest: 'Agenda' };
  }

  const scheduleAction = /(agendar|agenda|reservar|apartar|disponible|horario|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\b\d{1,2}(:\d{2}|\s*(a\.?m\.?|p\.?m\.?|am|pm))\b|confirmar|cancelar|reprogramar)/.test(value);
  const appointmentReference = /(cita|reservacion)/.test(value);
  if (scheduleAction || (appointmentReference && !hasAppointmentHistory)) {
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
    <div class="flex items-center gap-4">
      <button id="mainMenuBtn" class="flex flex-col gap-1.5 p-2 rounded-lg hover:bg-white/10 transition cursor-pointer group" type="button" aria-label="Menu">
        <span class="w-5 h-[2px] bg-white rounded-full group-hover:bg-emerald-100 transition"></span>
        <span class="w-5 h-[2px] bg-white rounded-full group-hover:bg-emerald-100 transition"></span>
        <span class="w-5 h-[2px] bg-white rounded-full group-hover:bg-emerald-100 transition"></span>
      </button>
      <a class="flex items-center" href="/dashboard/" aria-label="${APP_NAV.brand}">
        <img class="h-11 w-auto object-contain" src="${APP_NAV.logoSrc}" alt="${APP_NAV.brand}">
      </a>
    </div>
    <div class="flex items-center gap-2">
      ${APP_NAV.actions.map((action) => `
        <button class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition cursor-pointer tooltip" type="button" aria-label="${action.label}">
           <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        </button>
      `).join('')}
    </div>
  `;
  
  // Re-attach drawer listener since innerHTML destroys old DOM nodes
  const newMenuBtn = document.getElementById('mainMenuBtn');
  const drawer   = document.getElementById('sideDrawer');
  const overlay  = document.getElementById('drawerOverlay');
  if (newMenuBtn && drawer) {
    newMenuBtn.addEventListener('click', () => {
      drawer.classList.add('drawer-open');
      overlay.classList.add('overlay-visible');
    });
  }
};

const openContactsOffcanvas = () => {
  const offcanvas = document.getElementById('contactsOffcanvas');
  const overlay = document.getElementById('contactsOverlay');
  if (!offcanvas) return;

  loadContacts();
  
  overlay.classList.remove('hidden');
  offcanvas.classList.remove('hidden');
  
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
    offcanvas.classList.remove('opacity-0', 'scale-95');
    offcanvas.classList.add('opacity-100', 'scale-100');
  });
  renderAppNavbar();
};

const closeContactsOffcanvas = () => {
  const offcanvas = document.getElementById('contactsOffcanvas');
  const overlay = document.getElementById('contactsOverlay');
  if (!offcanvas) return;
  
  offcanvas.classList.remove('opacity-100', 'scale-100');
  offcanvas.classList.add('opacity-0', 'scale-95');
  overlay.classList.remove('opacity-100');
  overlay.classList.add('opacity-0');
  
  setTimeout(() => {
    offcanvas.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 300);

  if (state.assigneeFilter === 'contacts') {
    state.assigneeFilter = 'all';
    renderAssigneeFilter();
    renderChats();
  }
  renderAppNavbar();
};


const getCurrentPhaseLabel = () => PHASE_FILTER_ITEMS.find((item) => item.value === state.phaseFilter)?.label || 'Todos los estados';

const renderMessageNav = () => {
  messageTabs.innerHTML = MESSAGE_NAV_ITEMS.map((item) => `
    <button class="px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${item.filter === state.filter ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}" type="button" data-filter="${item.filter}">
      ${item.label}
    </button>
  `).join('');
};

const renderPhaseFilter = (isOpen = false) => {
  phaseFilter.classList.toggle('open', isOpen);
  phaseFilter.innerHTML = `
    <button class="w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isOpen ? 'ring-2 ring-emerald-500 border-emerald-500' : ''}" type="button" aria-haspopup="listbox" aria-expanded="${isOpen}">
      <span class="font-semibold truncate whitespace-nowrap mr-1">${getCurrentPhaseLabel()}</span>
      <svg class="w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
    </button>
    <div class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-20 ${isOpen ? 'block' : 'hidden'}" role="listbox">
      ${PHASE_FILTER_ITEMS.map((item) => `
        <button class="w-full text-left px-3 py-2 text-sm transition cursor-pointer ${item.value === state.phaseFilter ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}" type="button" role="option" aria-selected="${item.value === state.phaseFilter}" data-phase="${item.value}">
          ${item.label}
        </button>
      `).join('')}
    </div>
  `;
};

const renderAssigneeFilter = () => {
  const assigneeFilterEl = document.getElementById('assigneeFilter');
  if (!assigneeFilterEl) return;
  assigneeFilterEl.innerHTML = `
    <button class="flex-1 text-center px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${state.assigneeFilter === 'all' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}" type="button" data-filter="all">
      Todos
    </button>
    <button class="flex-1 text-center px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${state.assigneeFilter === 'me' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}" type="button" data-filter="me">
      Mis chats
    </button>
    <button class="flex-1 text-center px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${state.assigneeFilter === 'contacts' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}" type="button" data-filter="contacts">
      Contactos
    </button>
  `;
};

const populateResponsibleDropdowns = () => {
  const eligibleEmployees = (state.employees || []).filter(e => e.active && e.role === 'employee');
  const optionsHtml = `
    <option value="${DEFAULT_CLIENT_RESPONSIBLE}" disabled>${DEFAULT_CLIENT_RESPONSIBLE}</option>
    ${eligibleEmployees.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`).join('')}
  `;
  
  if (clientResponsibleInput) {
    clientResponsibleInput.innerHTML = optionsHtml;
  }
  const editClientResponsible = document.getElementById('editClientResponsible');
  if (editClientResponsible) {
    editClientResponsible.innerHTML = optionsHtml;
  }
};

const renderChats = () => {
  const query = searchEl.value.trim().toLowerCase();
  const chats = state.conversations.filter((chat) => {
    const meta = classify(chat);
    const matchesQuery = `${chat.name || ''} ${chat.phoneNumber}`.toLowerCase().includes(query);
    const matchesPhase = state.phaseFilter === 'all' || meta.tag === state.phaseFilter;
    
    let matchesAssignee = true;
    if (state.assigneeFilter === 'me') {
      const currentUser = state.currentUser;
      const responsible = chat.responsible;
      matchesAssignee = responsible && currentUser && (
        responsible.toLowerCase() === currentUser.name.toLowerCase() ||
        responsible.toLowerCase() === currentUser.username.toLowerCase()
      );
    }
    return matchesQuery && matchesPhase && matchesAssignee;
  });
  statusEl.textContent = String(chats.length);

  chatList.innerHTML = chats.map((chat) => {
    const meta = classify(chat);
    const alert = chat.alert;
    return `
      <button class="w-full text-left p-4 border-b border-slate-100 hover:bg-emerald-50 transition cursor-pointer relative ${chat.phoneNumber === state.selectedPhone ? 'bg-emerald-50/80 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-emerald-500' : ''} ${alert ? 'bg-orange-50 hover:bg-orange-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-orange-500' : ''}" data-phone="${chat.phoneNumber}">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <span class="font-bold text-slate-800 text-sm truncate">${escapeHtml(chat.name || 'Paciente nuevo')}</span>
          <span class="text-xs font-semibold text-slate-400 shrink-0">${formatTime(chat.lastAt) || 'Ahora'}</span>
        </div>
        <div class="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">${escapeHtml(formatPayloadText(chat.lastMessage) || 'Conversación lista para iniciar desde WhatsApp.')}</div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-orange-600">${escapeHtml(meta.tag)}</span>
          ${alert ? `<span class="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full truncate max-w-[130px]">${escapeHtml(alert.title || 'Atención')}</span>` : ''}
        </div>
      </button>
    `;
  }).join('');
};

const renderMessageContent = (message) => {
  const text = message.text || '';
  const type = message.type || 'text';

  if (type === 'image') {
    return `<div class="flex flex-col gap-1.5"><img src="${escapeHtml(text)}" alt="Imagen" class="max-w-[280px] rounded-lg shadow-sm border border-slate-200/50 hover:opacity-95 transition cursor-pointer" onclick="window.open('${escapeHtml(text)}', '_blank')"></div>`;
  }

  if (type === 'video') {
    return `<div class="flex flex-col gap-1.5"><video src="${escapeHtml(text)}" controls class="max-w-[280px] rounded-lg shadow-sm border border-slate-200/50"></video></div>`;
  }

  if (type === 'audio') {
    return `<div class="flex flex-col gap-1.5"><audio src="${escapeHtml(text)}" controls class="max-w-[240px] focus:outline-none"></audio></div>`;
  }

  if (type === 'document') {
    let url = text;
    let filename = 'Documento';
    if (text.includes('|')) {
      const parts = text.split('|');
      url = parts[0];
      filename = parts[1];
    } else if (text.startsWith('http') || text.startsWith('/mediaFiles')) {
      url = text;
      filename = text.substring(text.lastIndexOf('/') + 1);
    }

    const isOut = message.direction === 'out';
    const bgClass = isOut ? 'bg-emerald-700/50 hover:bg-emerald-700 border-emerald-600' : 'bg-slate-50 hover:bg-slate-100 border-slate-200/50';
    const textClass = isOut ? 'text-white' : 'text-slate-800';
    const subTextClass = isOut ? 'text-emerald-200' : 'text-slate-400';
    const iconBgClass = isOut ? 'bg-emerald-500/20 text-white' : 'bg-emerald-100 text-emerald-600';

    return `<a href="${escapeHtml(url)}" target="_blank" class="flex items-center gap-2.5 p-3 rounded-xl border ${bgClass} transition ${textClass} font-medium no-underline decoration-transparent select-none max-w-[280px] w-full" aria-label="Descargar ${escapeHtml(filename)}"><div class="w-10 h-10 ${iconBgClass} rounded-lg flex items-center justify-center shrink-0 shadow-inner"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div><div class="flex-1 min-w-0"><div class="text-xs font-bold truncate ${textClass}">${escapeHtml(filename)}</div><div class="text-[9px] ${subTextClass} mt-0.5 uppercase tracking-wider font-bold">Documento</div></div></a>`;
  }

  return `<span>${escapeHtml(formatPayloadText(text))}</span>`;
};

const renderMessages = () => {
  const chat = getCurrentChat();
  const alert = chat?.alert;
  const controlBanner = renderControlBanner();

  if (!state.selectedPhone) {
    desk.classList.add('no-chat');
    messagesEl.className = "messages flex-1 overflow-y-auto p-6 flex flex-col gap-2.5 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50/50 justify-center items-center";
    messagesEl.innerHTML = `
      <div class="m-auto text-center flex flex-col items-center justify-center max-w-sm">
        <div class="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4 text-emerald-500 shadow-inner">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
        </div>
        <p class="text-slate-400 text-lg font-medium">Seleccione un chat para comenzar a enviar mensajes</p>
      </div>`;
    return;
  }

  desk.classList.remove('no-chat');
  document.documentElement.classList.remove('chat-loading-state');
  const visibleMessages = state.filter === 'all'
    ? state.messages.filter((message) => message.source !== 'note' && message.type !== 'note')
    : state.messages.filter((message) => (
      message.source !== 'note' &&
      message.type !== 'note' &&
      (message.direction === 'in' || (message.direction === 'out' && message.source === state.filter))
    ));

  messagesEl.className = "messages flex-1 overflow-y-auto p-6 flex flex-col gap-2.5 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50/50";
  if(!visibleMessages.length) {
    const label = state.filter === 'all' ? 'esta conversación' : `mensajes de ${state.filter.toUpperCase()}`;
    messagesEl.innerHTML = `
      ${controlBanner}
      ${renderAlertBanner(alert)}
      <div class="m-auto text-center">
        <p class="text-slate-400 font-medium">No hay ${label} todavía.</p>
      </div>
    `;
    return;
  }

  messagesEl.innerHTML = `
    ${controlBanner}
    ${renderAlertBanner(alert)}
    ${visibleMessages.map((message) => `
      <div class="w-full flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'}">
        <div class="px-3 py-1.5 rounded-2xl text-sm shadow-sm whitespace-pre-wrap break-words leading-relaxed max-w-[70%] ${
          message.direction === 'out'
            ? 'bg-emerald-600 text-white rounded-br-none'
            : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
        }">${renderMessageContent(message)}<span class="inline-block text-[9px] font-medium ml-2 whitespace-nowrap align-bottom select-none ${
          message.direction === 'out' ? 'text-emerald-200/70' : 'text-slate-400/80'
        }">${message.direction === 'out' ? `${getMessageLabel(message)} • ` : ''}${formatTime(message.createdAt)}</span></div>
      </div>
    `).join('')}
  `;
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const renderControlBanner = () => {
  if (!state.selectedPhone) return '';
  const control = getCurrentControl();
  if (!control || control.mode === 'bot') return '';

  const isAssisted = control.mode === 'assisted_flow';
  return `
    <div class="flex items-start gap-3 p-4 ${isAssisted ? 'bg-emerald-50 border-emerald-500' : 'bg-orange-50 border-orange-500'} border-l-4 rounded-r-xl shadow-sm w-full max-w-2xl mx-auto mb-4" role="status">
      <div class="flex-1">
        <strong class="block text-sm font-bold ${isAssisted ? 'text-emerald-800' : 'text-orange-800'}">${isAssisted ? 'Flujo asistido activo' : 'Control humano activo'}</strong>
        <p class="text-sm ${isAssisted ? 'text-emerald-700' : 'text-orange-700'} mt-1">${isAssisted ? 'El bot solo continuara el flujo de citas iniciado desde el dashboard.' : 'El bot esta pausado. Responde manualmente desde el dashboard.'}</p>
      </div>
    </div>
  `;
};

const renderAlertBanner = (alert) => {
  if(!alert) return '';
  return `
    <div class="flex items-start gap-3 p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-xl shadow-sm w-full max-w-2xl mx-auto mb-4" role="status">
      <svg class="w-6 h-6 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
      <div class="flex-1">
        <strong class="block text-sm font-bold text-orange-800">${escapeHtml(alert.title || 'Atención requerida')}</strong>
        <p class="text-sm text-orange-700 mt-1">${escapeHtml(alert.message || 'Este chat necesita revisión del equipo.')}</p>
      </div>
      <span class="text-xs font-semibold text-orange-400 shrink-0">${formatDateTime(alert.createdAt)}</span>
    </div>
  `;
};

const getMessageLabel = (message) => {
  if(message.direction === 'in') return 'Paciente';
  if(message.source === 'ia') return 'IA';
  if(message.source === 'human') return 'Humano';
  return 'Bot';
};

const showAppointmentModal = (appointmentIndex) => {
  const apt = state.appointments[appointmentIndex];
  if (!apt) return;

  document.getElementById('modalAppointmentTitle').textContent = apt.serviceName || 'Detalles de la Cita';
  
  const startAt = apt.startAt ? new Date(apt.startAt) : null;
  const dateStr = startAt ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(startAt) : 'Fecha no definida';
  
  // Capitalize first letter
  const capDateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  document.getElementById('modalAppointmentDate').textContent = capDateStr;

  let timeStr = 'Hora no definida';
  if (startAt) {
    const endAt = apt.endAt ? new Date(apt.endAt) : new Date(startAt.getTime() + (apt.durationMinutes || 60) * 60000);
    const startStr = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(startAt);
    const endStr = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(endAt);
    timeStr = `${startStr} - ${endStr}`;
  }
  document.getElementById('modalAppointmentTime').textContent = timeStr;
  document.getElementById('modalAppointmentService').textContent = apt.serviceName || 'No especificado';
  
  const statusEl = document.getElementById('modalAppointmentStatus');
  statusEl.textContent = (apt.status || 'Pendiente').toUpperCase();
  
  // Status colors
  statusEl.className = 'inline-block mt-1 px-2.5 py-1 text-xs font-semibold rounded-md';
  if (apt.status === 'confirmada') statusEl.classList.add('bg-emerald-100', 'text-emerald-700');
  else if (apt.status === 'cancelada') statusEl.classList.add('bg-red-100', 'text-red-700');
  else statusEl.classList.add('bg-amber-100', 'text-amber-700');

  const modal = document.getElementById('appointmentModal');
  const modalContent = document.getElementById('appointmentModalContent');
  modal.classList.remove('hidden');
  
  // Trigger animation
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    modalContent.classList.remove('scale-95');
    modalContent.classList.add('scale-100');
  });
};

const renderClientAppointments = () => {
  const container = document.getElementById('clientAppointmentsContainer');
  const nextSection = document.getElementById('nextAppointmentSection');
  const nextContainer = document.getElementById('nextAppointmentContainer');

  if (!container) return;

  if (!state.appointments || state.appointments.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-2">No hay citas registradas.</div>';
    if (nextSection) nextSection.classList.add('hidden');
    return;
  }

  const now = new Date();
  
  // Find next appointment
  let futureApts = state.appointments
    .map((apt, index) => ({ apt, index }))
    .filter(({ apt }) => {
      const startAt = apt.startAt ? new Date(apt.startAt) : null;
      return startAt && startAt >= now && apt.status !== 'cancelada';
    })
    .sort((a, b) => new Date(a.apt.startAt) - new Date(b.apt.startAt));

  let nextAptIndex = -1;
  if (futureApts.length > 0) {
    const { apt, index } = futureApts[0];
    nextAptIndex = index;
    const startAt = new Date(apt.startAt);
    const dayStr = new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(startAt);
    const capDay = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
    const timeStr = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(startAt);
    
    if (nextSection && nextContainer) {
      nextSection.classList.remove('hidden');
      nextContainer.innerHTML = `
        <div onclick="showAppointmentModal(${index})" class="flex flex-col p-3 bg-emerald-50 rounded-xl border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer group shadow-sm">
          <strong class="text-sm text-emerald-800">${capDay} ${timeStr}</strong>
          <span class="text-xs text-emerald-600 mt-1 line-clamp-1 font-medium">${escapeHtml(apt.serviceName || 'Cita')} • ${apt.status || 'pendiente'}</span>
        </div>
      `;
    }
  } else {
    if (nextSection) nextSection.classList.add('hidden');
  }
  
  let html = '';
  // Filter out the next appointment so it doesn't duplicate
  const previousAppointments = state.appointments.filter((_, index) => index !== nextAptIndex);
  const appointmentsToShow = previousAppointments.slice(0, 4);
  
  if (appointmentsToShow.length === 0) {
     html = '<div class="text-xs text-slate-400 text-center py-2">No hay citas anteriores.</div>';
  } else {
    appointmentsToShow.forEach((apt) => {
      // Find original index for the modal
      const originalIndex = state.appointments.findIndex(a => a === apt);
      const startAt = apt.startAt ? new Date(apt.startAt) : null;
      
      // Simplistic formatting for the card
      const dayStr = startAt ? new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(startAt) : '';
      const capDay = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
      const timeStr = startAt ? new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(startAt) : '';

      html += `
        <div onclick="showAppointmentModal(${originalIndex})" class="flex flex-col p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-emerald-200 transition cursor-pointer group">
          <strong class="text-sm text-slate-800 group-hover:text-emerald-700">${capDay} ${timeStr}</strong>
          <span class="text-xs text-slate-500 mt-1 line-clamp-1">${escapeHtml(apt.serviceName || 'Cita')} • ${apt.status || 'pendiente'}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
};

const getSelectedClientResponsible = () => (
  state.selectedClient && state.selectedClient.responsible
    ? state.selectedClient.responsible
    : DEFAULT_CLIENT_RESPONSIBLE
);

const updateResponsibleInput = () => {
  if (!clientResponsibleInput) return;
  clientResponsibleInput.value = getSelectedClientResponsible();
  clientResponsibleInput.disabled = !state.selectedPhone;
};

const saveSelectedClientResponsible = async () => {
  if (!clientResponsibleInput || !state.selectedPhone) return;

  const responsible = clientResponsibleInput.value.trim() || DEFAULT_CLIENT_RESPONSIBLE;
  clientResponsibleInput.value = responsible;

  const previousClient = state.selectedClient || {};
  state.selectedClient = {
    ...previousClient,
    phoneNumber: state.selectedPhone,
    responsible
  };

  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(state.selectedPhone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible })
    });

    if (!response.ok) throw new Error('No se pudo guardar el responsable');

    const payload = await response.json();
    if (payload.client) {
      state.selectedClient = payload.client;
      const clientIndex = state.clients.findIndex((client) => client.phoneNumber === payload.client.phoneNumber);
      if (clientIndex >= 0) state.clients[clientIndex] = { ...state.clients[clientIndex], ...payload.client };

      // Update locally in state.conversations to support immediate assignee filtering
      const chatIndex = state.conversations.findIndex((chat) => chat.phoneNumber === state.selectedPhone);
      if (chatIndex >= 0) {
        state.conversations[chatIndex].responsible = payload.client.responsible;
        renderChats();
      }
    }
  } catch (error) {
    console.error('Error al guardar responsable del cliente:', error);
    state.selectedClient = previousClient;
    updateResponsibleInput();
    showCustomAlert('Error al guardar el responsable del cliente');
  }
};

const renderAiSummary = () => {
  if (!aiSummaryContainer || !aiSummaryStatus || !refreshAiSummaryBtn) return;

  refreshAiSummaryBtn.disabled = !state.selectedPhone || state.summaryLoading;
  if (openDetailedContextBtn) openDetailedContextBtn.disabled = !state.selectedPhone || state.detailedContextLoading;
  if (updateDetailedContextBtn) updateDetailedContextBtn.disabled = !state.selectedPhone || state.detailedContextLoading;

  if (!state.selectedPhone) {
    aiSummaryStatus.textContent = 'Sin chat seleccionado';
    aiSummaryContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Sin resumen disponible</p>';
    return;
  }

  if (state.summaryLoading) {
    aiSummaryStatus.textContent = 'Generando resumen...';
    aiSummaryContainer.innerHTML = '<p class="text-xs text-slate-500">Actualizando contexto IA.</p>';
    return;
  }

  const summary = state.chatSummaries[state.selectedPhone];
  aiSummaryStatus.textContent = formatSummaryMeta(summary);

  if (!summary || !summary.summary) {
    aiSummaryContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Sin resumen disponible</p>';
    return;
  }

  aiSummaryContainer.innerHTML = `
    <div class="flex flex-col gap-3">
      <p class="text-sm leading-relaxed text-slate-700">${escapeHtml(summary.summary)}</p>
      <div class="flex flex-wrap gap-2">
        <span class="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">${escapeHtml(summary.intent || 'otro')}</span>
        <span class="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">${escapeHtml(summary.sentiment || 'neutral')}</span>
      </div>
      ${summary.nextStep ? `<div class="text-xs bg-amber-50 border border-amber-100 text-amber-800 rounded-lg p-2">${escapeHtml(summary.nextStep)}</div>` : ''}
    </div>
  `;
};

const getCurrentControl = () => state.conversationControls[state.selectedPhone] || { mode: 'bot' };

const renderConversationControl = () => {
  if (!conversationControlBtn || !conversationControlBtnText || !startAppointmentFlowBtn) return;

  if (!state.selectedPhone) {
    conversationControlBtn.classList.add('hidden');
    startAppointmentFlowBtn.classList.add('hidden');
    return;
  }

  const control = getCurrentControl();
  const mode = control.mode || 'bot';

  conversationControlBtn.classList.remove('hidden');
  startAppointmentFlowBtn.classList.remove('hidden');
  conversationControlBtn.disabled = false;
  startAppointmentFlowBtn.disabled = mode === 'bot';

  if (mode === 'human') {
    conversationControlBtnText.textContent = 'Devolver el control al bot';
    conversationControlBtn.classList.remove('control-take');
    conversationControlBtn.classList.add('control-release');
    startAppointmentFlowBtn.title = 'Enviar flujo de citas sin reactivar toda la IA';
  } else if (mode === 'assisted_flow') {
    conversationControlBtnText.textContent = 'Terminar flujo asistido';
    conversationControlBtn.classList.remove('control-take');
    conversationControlBtn.classList.add('control-release');
    startAppointmentFlowBtn.disabled = true;
    startAppointmentFlowBtn.title = 'Ya hay un flujo asistido activo';
  } else {
    conversationControlBtnText.textContent = 'Tomar control';
    conversationControlBtn.classList.remove('control-release');
    conversationControlBtn.classList.add('control-take');
    startAppointmentFlowBtn.title = 'Toma control humano antes de enviar acciones asistidas';
  }
};

const renderReplySuggestionButton = () => {
  if (!aiReplySuggestionBtn) return;

  aiReplySuggestionBtn.disabled = !state.selectedPhone || state.replySuggestionLoading;
  aiReplySuggestionBtn.innerHTML = state.replySuggestionLoading
    ? `
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
      </svg>
      <span>Generando</span>
    `
    : `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.091-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.091L9 5.25l.813 2.846a4.5 4.5 0 003.091 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.091zM18.25 8.25L18 9.25l-.25-1a2 2 0 00-1.5-1.5l-1-.25 1-.25a2 2 0 001.5-1.5l.25-1 .25 1a2 2 0 001.5 1.5l1 .25-1 .25a2 2 0 00-1.5 1.5z"></path></svg>
      <span>Sugerir</span>
    `;
};

const getSelectedAppointmentService = () => state.appointmentServices
  .find((service) => service.id === state.selectedAppointmentServiceId);

const formatServiceMeta = (service) => [
  service.categoria,
  service.duracionMinutos ? `${service.duracionMinutos} min` : '',
  service.precio ? `$${Number(service.precio).toLocaleString('es-MX')}` : ''
].filter(Boolean).join(' | ');

const renderAppointmentServiceList = () => {
  if (!appointmentServiceList) return;

  if (state.appointmentServicesLoading || !state.appointmentServicesLoaded) {
    appointmentServiceList.innerHTML = '<div class="p-4 text-sm text-slate-400 text-center">Cargando servicios...</div>';
    if (confirmAppointmentFlowBtn) confirmAppointmentFlowBtn.disabled = true;
    return;
  }

  const query = normalize(state.appointmentServiceSearchQuery);
  const services = state.appointmentServices.filter((service) => {
    const searchable = normalize([
      service.nombre,
      service.categoria,
      service.descripcion,
      ...(service.keywords || []),
      ...(service.problemas || [])
    ].join(' '));
    return !query || searchable.includes(query);
  });

  if (!services.length) {
    appointmentServiceList.innerHTML = '<div class="p-4 text-sm text-slate-400 text-center">No hay servicios que coincidan.</div>';
    if (confirmAppointmentFlowBtn) confirmAppointmentFlowBtn.disabled = true;
    return;
  }

  appointmentServiceList.innerHTML = services.map((service) => {
    const selected = service.id === state.selectedAppointmentServiceId;
    return `
      <button type="button" data-service-id="${escapeHtml(service.id)}" class="w-full text-left p-3 transition cursor-pointer ${selected ? 'bg-emerald-50' : 'hover:bg-slate-50'}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-bold ${selected ? 'text-emerald-800' : 'text-slate-800'}">${escapeHtml(service.nombre || 'Servicio')}</p>
            <p class="mt-1 text-xs text-slate-500">${escapeHtml(formatServiceMeta(service) || 'Servicio activo')}</p>
          </div>
          <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
          </span>
        </div>
      </button>
    `;
  }).join('');

  if (confirmAppointmentFlowBtn) {
    confirmAppointmentFlowBtn.disabled = !getSelectedAppointmentService();
  }
};

const loadAppointmentServices = async () => {
  if (state.appointmentServicesLoaded || state.appointmentServicesLoading) return;

  state.appointmentServicesLoading = true;
  renderAppointmentServiceList();

  try {
    const response = await fetch('/api/services');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los servicios');

    state.appointmentServices = (payload.services || [])
      .filter((service) => service.activo !== false)
      .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es'));
    state.appointmentServicesLoaded = true;
  } finally {
    state.appointmentServicesLoading = false;
    renderAppointmentServiceList();
  }
};

const showAppointmentFlowModal = async () => {
  if (!appointmentFlowModal || !appointmentFlowModalContent || !state.selectedPhone) return;

  const mode = getCurrentControl().mode || 'bot';
  if (mode === 'bot') {
    showCustomAlert('Toma control humano antes de enviar el flujo de citas.');
    return;
  }
  if (mode === 'assisted_flow') {
    showCustomAlert('Ya hay un flujo asistido activo para este chat.');
    return;
  }

  const chat = getCurrentChat();
  state.appointmentServiceSearchQuery = '';
  state.selectedAppointmentServiceId = null;
  if (appointmentServiceSearch) appointmentServiceSearch.value = '';
  if (appointmentFlowClientLabel) {
    appointmentFlowClientLabel.textContent = `Cliente: ${chat?.name || state.selectedPhone}`;
  }

  appointmentFlowModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    appointmentFlowModal.classList.remove('opacity-0');
    appointmentFlowModalContent.classList.remove('scale-95');
    appointmentFlowModalContent.classList.add('scale-100');
  });

  renderAppointmentServiceList();

  try {
    await loadAppointmentServices();
    if (appointmentServiceSearch) appointmentServiceSearch.focus();
  } catch (error) {
    console.error(error);
    showCustomAlert(error.message);
  }
};

const hideAppointmentFlowModal = () => {
  if (!appointmentFlowModal || !appointmentFlowModalContent) return;

  appointmentFlowModal.classList.add('opacity-0');
  appointmentFlowModalContent.classList.remove('scale-100');
  appointmentFlowModalContent.classList.add('scale-95');
  setTimeout(() => {
    appointmentFlowModal.classList.add('hidden');
  }, 300);
};

const startSelectedAppointmentFlow = async () => {
  if (!state.selectedPhone) return;
  const service = getSelectedAppointmentService();
  if (!service) {
    showCustomAlert('Selecciona el servicio que ofreciste al cliente.');
    return;
  }

  const phoneNumber = state.selectedPhone;
  if (confirmAppointmentFlowBtn) confirmAppointmentFlowBtn.disabled = true;
  if (startAppointmentFlowBtn) startAppointmentFlowBtn.disabled = true;

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/actions/start-appointment-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: service.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar el flujo de citas');

    state.conversationControls[phoneNumber] = payload.control || { mode: 'assisted_flow' };
    hideAppointmentFlowModal();
    renderContext();
    renderMessages();
  } catch (error) {
    console.error(error);
    showCustomAlert(error.message);
  } finally {
    renderConversationControl();
    renderAppointmentServiceList();
  }
};

const openDetailedContextModal = () => {
  if (!detailedContextModal || !detailedContextModalContent) return;
  detailedContextModal.style.zIndex = '10020';
  detailedContextModal.style.display = 'flex';
  detailedContextModalContent.style.maxHeight = 'calc(100vh - 32px)';
  detailedContextModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    detailedContextModal.classList.remove('opacity-0');
    detailedContextModalContent.classList.remove('scale-95');
    detailedContextModalContent.classList.add('scale-100');
  });
};

const hideDetailedContextModal = () => {
  if (!detailedContextModal || !detailedContextModalContent) return;
  detailedContextModal.classList.add('opacity-0');
  detailedContextModalContent.classList.remove('scale-100');
  detailedContextModalContent.classList.add('scale-95');
  setTimeout(() => {
    detailedContextModal.classList.add('hidden');
    detailedContextModal.style.display = '';
  }, 300);
};

const renderDetailedContext = (context) => {
  if (!detailedContextBody) return;

  if (!context) {
    detailedContextBody.innerHTML = '<p class="text-slate-400 italic">No se pudo generar contexto detallado.</p>';
    return;
  }

  const renderList = (items) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return '<p class="text-xs text-slate-400 italic">Sin datos relevantes.</p>';
    return `
      <ul class="flex flex-col gap-2">
        ${list.map((item) => `<li class="flex gap-2 text-sm"><span class="text-emerald-600">-</span><span>${escapeHtml(item)}</span></li>`).join('')}
      </ul>
    `;
  };

  detailedContextBody.innerHTML = `
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">${escapeHtml(context.priority || 'media')}</span>
      </div>
      <p class="leading-relaxed">${escapeHtml(context.overview || 'Sin resumen disponible.')}</p>
    </section>
    <section class="border-t border-slate-100 pt-4">
      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Necesidad actual</h4>
      <p class="leading-relaxed">${escapeHtml(context.currentNeed || 'No detectada.')}</p>
    </section>
    <section class="border-t border-slate-100 pt-4">
      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contexto util</h4>
      ${renderList(context.usefulContext)}
    </section>
    <section class="border-t border-slate-100 pt-4">
      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Accion recomendada</h4>
      <p class="leading-relaxed">${escapeHtml(context.suggestedAction || 'Revisar el chat antes de responder.')}</p>
    </section>
  `;
};

const renderContext = () => {
  const chat = getCurrentChat();
  const lastMessage = chat?.lastMessage || '';
  const meta = classify(chat || lastMessage);

  if (state.selectedClient && state.selectedClient.campaignId) {
    const camp = state.campaigns.find(c => c.id === state.selectedClient.campaignId);
    const sourceText = camp && camp.source ? ` (${camp.source})` : '';
    leadValue.textContent = camp ? `Campaña: ${camp.name}${sourceText}` : `Campaña: ${state.selectedClient.campaignId}`;
    leadValue.classList.add('text-emerald-700', 'bg-emerald-50', 'px-2', 'py-0.5', 'rounded-md', 'text-xs');
  } else if (chat) {
    leadValue.textContent = 'WhatsApp Directo';
    leadValue.classList.remove('text-emerald-700', 'bg-emerald-50', 'px-2', 'py-0.5', 'rounded-md');
  } else {
    leadValue.textContent = 'Sin lead';
    leadValue.classList.remove('text-emerald-700', 'bg-emerald-50', 'px-2', 'py-0.5', 'rounded-md');
  }

  interestValue.textContent = meta.interest;

  const notesEl = document.getElementById('crmNotesValue');
  if (notesEl) {
    if (state.selectedClient && state.selectedClient.notes) {
      notesEl.textContent = state.selectedClient.notes;
      notesEl.classList.remove('italic', 'text-slate-400');
      notesEl.classList.add('text-slate-700');
    } else {
      notesEl.textContent = 'Sin notas registradas';
      notesEl.classList.remove('text-slate-700');
      notesEl.classList.add('italic', 'text-slate-400');
    }
  }
  
  updateResponsibleInput();
  renderClientAppointments();
  renderAiSummary();
  renderConversationControl();
  renderReplySuggestionButton();
};

// Modal Close logic
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('appointmentModal');
  const modalContent = document.getElementById('appointmentModalContent');
  const closeBtn = document.getElementById('closeAppointmentModal');

  const closeModal = () => {
    if(!modal) return;
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  };

  if(closeBtn) closeBtn.addEventListener('click', closeModal);
  if(modal) modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
});

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳',
  '😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤',
  '😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭',
  '🤫','🤥','😶','😐','😑','😬','🫠','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤',
  '😪','😵','😵‍💫','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹',
  '👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😻','😼','😽','🙀',
  '😿','😾','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙',
  '👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲',
  '🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁',
  '🦷','🦴','👀','👁️','👅','👄','💋','🩸','❤️','🧡','💛','💚','💙','💜','🖤','🤍',
  '🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟'
];

const initEmojiPicker = () => {
  const container = document.getElementById('emojiContainer');
  if (container) {
    container.innerHTML = EMOJIS.map(emoji => `
      <button type="button" class="flex items-center justify-center hover:bg-slate-100 rounded-lg transition cursor-pointer select-none" style="width: 38px; height: 38px; font-size: 26px;" data-emoji="${emoji}">
        ${emoji}
      </button>
    `).join('');
  }
};

const FILE_ATTACHMENT_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path>
  </svg>
`;

const AUDIO_ATTACHMENT_ICON = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18.75a6 6 0 006-6v-1.5M6 11.25v1.5a6 6 0 006 6m0 0v2.25m-3 0h6M12 15a3 3 0 003-3V5.25a3 3 0 00-6 0V12a3 3 0 003 3z"></path>
  </svg>
`;

const formatRecordingTime = (elapsedMs = 0) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const isRecordingAudio = () => audioRecorder?.isRecording?.() || false;

const updateSendButtonState = () => {
  sendButton.disabled = !state.selectedPhone || isRecordingAudio() || (!replyText.value.trim() && !state.selectedFile);
};

const renderAttachmentIcon = (kind = 'file') => {
  if (!attachmentIcon) return;
  attachmentIcon.innerHTML = kind === 'audio' ? AUDIO_ATTACHMENT_ICON : FILE_ATTACHMENT_ICON;
};

const showAttachmentPreview = (attachment) => {
  state.selectedFile = attachment;
  attachmentPreview.dataset.kind = attachment.kind || 'file';
  renderAttachmentIcon(attachment.kind);
  attachmentName.textContent = attachment.name;
  attachmentSize.textContent = AudioAttachments?.formatFileSize
    ? AudioAttachments.formatFileSize(attachment.size)
    : `${(attachment.size / 1024).toFixed(1)} KB`;
  attachmentPreview.classList.remove('hidden');
  attachmentPreview.classList.add('flex');
  updateSendButtonState();
};

const renderVoiceRecordButton = ({ isRecording = false, elapsedMs = 0 } = {}) => {
  if (!voiceRecordButton) return;
  const recordingTime = formatRecordingTime(elapsedMs);
  voiceRecordButton.classList.toggle('is-recording', isRecording);
  voiceRecordButton.disabled = !isRecording && (!state.selectedPhone || !AudioAttachments);
  voiceRecordButton.title = isRecording
    ? `Detener grabacion (${recordingTime})`
    : 'Grabar audio';
  voiceRecordButton.setAttribute('aria-label', isRecording ? 'Detener grabacion' : 'Grabar audio');
  if (voiceRecordTimer && voiceRecordTimerText) {
    voiceRecordTimerText.textContent = recordingTime;
    voiceRecordTimer.classList.toggle('hidden', !isRecording);
  }
  updateSendButtonState();
};

const clearAttachment = () => {
  state.selectedFile = null;
  attachmentInput.value = '';
  attachmentPreview.dataset.kind = 'file';
  renderAttachmentIcon('file');
  attachmentPreview.classList.add('hidden');
  attachmentPreview.classList.remove('flex');
  updateSendButtonState();
};

if (AudioAttachments) {
  audioRecorder = AudioAttachments.createAudioRecorder({
    onAttachmentReady: showAttachmentPreview,
    onRecordingChange: renderVoiceRecordButton,
    onError: showCustomAlert
  });
}

const loadChatSummary = async (phoneNumber) => {
  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/summary`);
    if (!response.ok) throw new Error('No se pudo cargar el resumen IA');
    const payload = await response.json();
    state.chatSummaries[phoneNumber] = payload.summary;
  } catch (error) {
    console.error('Error fetching AI summary', error);
    state.chatSummaries[phoneNumber] = state.chatSummaries[phoneNumber] || null;
  }
};

const loadConversationControl = async (phoneNumber) => {
  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/control`);
    if (!response.ok) throw new Error('No se pudo cargar el control de conversacion');
    const payload = await response.json();
    state.conversationControls[phoneNumber] = payload.control || { mode: 'bot' };
  } catch (error) {
    console.error('Error fetching conversation control', error);
    state.conversationControls[phoneNumber] = state.conversationControls[phoneNumber] || { mode: 'bot' };
  }
};

const selectChat = async (phoneNumber) => {
  state.selectedPhone = phoneNumber;
  state.summaryLoading = false;
  state.replySuggestionLoading = false;
  const chat = getCurrentChat();
  desk.classList.remove('no-chat');
  chatName.textContent = chat?.name || 'Paciente nuevo';
  chatPhone.textContent = `${phoneNumber} | WhatsApp`;
  replyText.disabled = false;
  
  if (isRecordingAudio()) {
    audioRecorder.cancel();
  }
  clearAttachment();
  renderVoiceRecordButton();
  
  updateSendButtonState();
  const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/messages`);
  state.messages = await response.json();
  await Promise.all([
    loadChatSummary(phoneNumber),
    loadConversationControl(phoneNumber)
  ]);
  
  try {
    const aptResponse = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/appointments`);
    state.appointments = await aptResponse.json();
  } catch (err) {
    console.error('Error fetching appointments', err);
    state.appointments = [];
  }

  // Verificar si el contacto está registrado en CRM
  let isContactRegistered = false;
  state.selectedClient = null;
  try {
    const clientResponse = await fetch(`/api/clients/${encodeURIComponent(phoneNumber)}`);
    if (clientResponse.ok) {
      const clientData = await clientResponse.json();
      state.selectedClient = clientData;
      isContactRegistered = !!clientData;
    }
  } catch (e) {
    state.selectedClient = null;
    isContactRegistered = false;
  }

  const addContactBtn = document.getElementById('addContactBtn');
  const addContactBtnText = document.getElementById('addContactBtnText');
  if (addContactBtn) {
    addContactBtn.classList.remove('hidden');
    if (isContactRegistered) {
      addContactBtnText.textContent = 'Editar Contacto';
      addContactBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
      addContactBtn.classList.add('bg-slate-500', 'hover:bg-slate-600');
    } else {
      addContactBtnText.textContent = 'Añadir a Contactos';
      addContactBtn.classList.remove('bg-slate-500', 'hover:bg-slate-600');
      addContactBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    }
  }

  renderChats();
  renderMessages();
  renderContext();
};

const upsertConversation = (conversation) => {
  const index = state.conversations.findIndex((item) => item.phoneNumber === conversation.phoneNumber);
  if (index >= 0) {
    state.conversations[index] = {
      ...state.conversations[index],
      ...conversation,
      name: state.conversations[index].name || conversation.name
    };
  }
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

  if (event.target.closest('button[aria-haspopup="listbox"]')) {
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
  updateSendButtonState();
});

replyText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

const writeSuggestedReply = (suggestion) => {
  replyText.value = suggestion;
  replyText.disabled = false;
  replyText.focus();
  replyText.style.height = '48px';
  replyText.style.height = `${Math.min(replyText.scrollHeight, 96)}px`;
  updateSendButtonState();
};

const generateReplySuggestion = async () => {
  if (!state.selectedPhone || state.replySuggestionLoading) return;

  const currentDraft = replyText.value.trim();
  if (currentDraft && !window.confirm('Reemplazar el borrador actual con una sugerencia IA?')) {
    return;
  }

  const phoneNumber = state.selectedPhone;
  state.replySuggestionLoading = true;
  renderReplySuggestionButton();

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/reply-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: currentDraft })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo generar la sugerencia IA');
    if (phoneNumber !== state.selectedPhone) return;

    writeSuggestedReply(payload.suggestion || '');
    if (payload.warning) showCustomAlert(payload.warning);
  } catch (error) {
    console.error(error);
    showCustomAlert(error.message);
  } finally {
    state.replySuggestionLoading = false;
    renderReplySuggestionButton();
  }
};

if (aiReplySuggestionBtn) {
  aiReplySuggestionBtn.addEventListener('click', generateReplySuggestion);
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = replyText.value.trim();
  if (isRecordingAudio()) {
    showCustomAlert('Deten la grabacion antes de enviar el audio.');
    return;
  }
  if (!state.selectedPhone || (!text && !state.selectedFile)) return;

  sendButton.disabled = true;
  sendButton.innerHTML = '<span>Enviando</span>';

  try {
    const payload = { text };
    if (state.selectedFile) {
      payload.file = {
        name: state.selectedFile.name,
        dataUrl: state.selectedFile.dataUrl,
        mimeType: state.selectedFile.mimeType,
        kind: state.selectedFile.kind,
        recorded: Boolean(state.selectedFile.recorded)
      };
    }

    const response = await fetch(`/api/chats/${encodeURIComponent(state.selectedPhone)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || data.detail || 'No se pudo enviar');
    }
    replyText.value = '';
    replyText.style.height = '48px';
    clearAttachment();
  } catch (error) {
    console.error(error);
    showCustomAlert(error.message);
  } finally {
    sendButton.innerHTML = sendButtonReadyContent;
    updateSendButtonState();
  }
});

// Attachment Event Listeners
attachmentButton.addEventListener('click', () => {
  attachmentInput.click();
});

attachmentInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 16 * 1024 * 1024) {
    showCustomAlert('El archivo supera el limite de 16 MB.');
    attachmentInput.value = '';
    return;
  }

  try {
    const attachment = await AudioAttachments.createAttachmentFromFile(file);
    showAttachmentPreview(attachment);
  } catch (error) {
    showCustomAlert(error.message || 'No se pudo adjuntar el archivo.');
    attachmentInput.value = '';
  }
});

if (voiceRecordButton) {
  voiceRecordButton.addEventListener('click', () => {
    if (!audioRecorder || !state.selectedPhone) return;
    audioRecorder.toggle();
  });
}

cancelAttachment.addEventListener('click', () => {
  if (isRecordingAudio()) {
    audioRecorder.cancel();
  }
  clearAttachment();
});

if (refreshAiSummaryBtn) {
  refreshAiSummaryBtn.addEventListener('click', async () => {
    if (!state.selectedPhone || state.summaryLoading) return;

    const phoneNumber = state.selectedPhone;
    state.summaryLoading = true;
    renderAiSummary();

    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/summary/regenerate`, {
        method: 'POST'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo generar el resumen IA');
      state.chatSummaries[phoneNumber] = payload.summary;
    } catch (error) {
      console.error(error);
      showCustomAlert(error.message);
    } finally {
      state.summaryLoading = false;
      renderAiSummary();
    }
  });
}

const updateConversationControl = async (action) => {
  if (!state.selectedPhone) return;
  const phoneNumber = state.selectedPhone;
  if (conversationControlBtn) conversationControlBtn.disabled = true;
  if (startAppointmentFlowBtn) startAppointmentFlowBtn.disabled = true;

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/control/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'take'
        ? JSON.stringify({ takenBy: 'Dashboard', reason: 'Intervencion manual' })
        : JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar el control');
    state.conversationControls[phoneNumber] = payload.control || { mode: 'bot' };
    renderContext();
    renderMessages();
  } catch (error) {
    console.error(error);
    showCustomAlert(error.message);
  } finally {
    renderConversationControl();
  }
};

if (conversationControlBtn) {
  conversationControlBtn.addEventListener('click', () => {
    if (!state.selectedPhone) return;
    const mode = getCurrentControl().mode || 'bot';
    updateConversationControl(mode === 'bot' ? 'take' : 'release');
  });
}

if (startAppointmentFlowBtn) {
  startAppointmentFlowBtn.addEventListener('click', showAppointmentFlowModal);
}

if (appointmentServiceSearch) {
  appointmentServiceSearch.addEventListener('input', (event) => {
    state.appointmentServiceSearchQuery = event.target.value;
    renderAppointmentServiceList();
  });
}

if (appointmentServiceList) {
  appointmentServiceList.addEventListener('click', (event) => {
    const serviceButton = event.target.closest('[data-service-id]');
    if (!serviceButton) return;
    state.selectedAppointmentServiceId = serviceButton.dataset.serviceId;
    renderAppointmentServiceList();
  });
}

if (confirmAppointmentFlowBtn) {
  confirmAppointmentFlowBtn.addEventListener('click', startSelectedAppointmentFlow);
}

if (closeAppointmentFlowModal) closeAppointmentFlowModal.addEventListener('click', hideAppointmentFlowModal);
if (cancelAppointmentFlowBtn) cancelAppointmentFlowBtn.addEventListener('click', hideAppointmentFlowModal);
if (appointmentFlowModal) {
  appointmentFlowModal.addEventListener('click', (event) => {
    if (event.target === appointmentFlowModal) hideAppointmentFlowModal();
  });
}

const loadDetailedContext = async ({ refresh = false } = {}) => {
  if (!state.selectedPhone || state.detailedContextLoading) return;

  const phoneNumber = state.selectedPhone;
  state.detailedContextLoading = true;
  renderAiSummary();
  if (detailedContextSubtitle) {
    detailedContextSubtitle.textContent = refresh
      ? `${phoneNumber} | Actualizando contexto`
      : `${phoneNumber} | Cargando contexto`;
  }
  if (detailedContextBody) {
    detailedContextBody.innerHTML = refresh
      ? '<p class="text-slate-400 italic">Actualizando contexto detallado...</p>'
      : '<p class="text-slate-400 italic">Cargando ultimo contexto detallado...</p>';
  }
  openDetailedContextModal();

  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/summary/detailed-context`, {
      method: refresh ? 'POST' : 'GET'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo obtener el contexto detallado');
    if (detailedContextSubtitle) detailedContextSubtitle.textContent = `${phoneNumber} | Contexto disponible`;
    renderDetailedContext(payload.context);
  } catch (error) {
    console.error(error);
    if (detailedContextBody) detailedContextBody.innerHTML = `<p class="text-red-600">${escapeHtml(error.message)}</p>`;
  } finally {
    state.detailedContextLoading = false;
    renderAiSummary();
  }
};

if (openDetailedContextBtn) {
  openDetailedContextBtn.addEventListener('click', () => loadDetailedContext({ refresh: false }));
}

if (updateDetailedContextBtn) {
  updateDetailedContextBtn.addEventListener('click', () => loadDetailedContext({ refresh: true }));
}

if (closeDetailedContextModal) closeDetailedContextModal.addEventListener('click', hideDetailedContextModal);
if (detailedContextModal) {
  detailedContextModal.addEventListener('click', (event) => {
    if (event.target === detailedContextModal) hideDetailedContextModal();
  });
}

// Emoji Event Listeners
emojiButton.addEventListener('click', (event) => {
  event.stopPropagation();
  if (emojiPicker.classList.contains('hidden')) {
    emojiPicker.classList.remove('hidden');
    emojiPicker.classList.add('flex');
  } else {
    emojiPicker.classList.add('hidden');
    emojiPicker.classList.remove('flex');
  }
});

emojiPicker.addEventListener('click', (event) => {
  event.stopPropagation();
  const button = event.target.closest('[data-emoji]');
  if (button) {
    const emoji = button.dataset.emoji;
    const startPos = replyText.selectionStart;
    const endPos = replyText.selectionEnd;
    const text = replyText.value;

    replyText.value = text.substring(0, startPos) + emoji + text.substring(endPos);
    replyText.focus();

    const newCursorPos = startPos + emoji.length;
    replyText.setSelectionRange(newCursorPos, newCursorPos);

    replyText.dispatchEvent(new Event('input'));
    emojiPicker.classList.add('hidden');
    emojiPicker.classList.remove('flex');
  }
});

document.addEventListener('click', (event) => {
  if (!emojiPicker.contains(event.target) && !emojiButton.contains(event.target)) {
    emojiPicker.classList.add('hidden');
    emojiPicker.classList.remove('flex');
  }
});

initEmojiPicker();

const loadInitial = async () => {
  try {
    const [campRes, meRes, empRes] = await Promise.all([
      fetch('/api/campaigns').catch(() => null),
      fetch('/api/auth/me').catch(() => null),
      fetch('/api/employees').catch(() => null)
    ]);

    if (campRes && campRes.ok) state.campaigns = await campRes.json();
    if (meRes && meRes.ok) state.currentUser = await meRes.json();
    if (empRes && empRes.ok) {
      state.employees = await empRes.json();
      populateResponsibleDropdowns();
    }
  } catch (err) {
    console.error('Error fetching initial data', err);
  }

  const response = await fetch('/api/chats');
  state.conversations = await response.json();
  renderChats();
  renderContext();

  const phoneNumber = new URLSearchParams(window.location.search).get('phone');
  if (phoneNumber) {
    await selectChat(phoneNumber);
  }
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
      (data.payload.conversations || []).forEach(upsertConversation);
      renderChats();
      renderContext();
      return;
    }

    if (data.event === 'error') {
      statusEl.title = data.payload?.message || 'Error cargando datos en vivo';
      console.error('SSE dashboard error:', data.payload?.message || data.payload);
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

    if (data.event === 'alert') {
      upsertConversation(data.payload.conversation);
      renderChats();
      if (data.payload.conversation.phoneNumber === state.selectedPhone) {
        renderMessages();
        renderContext();
      }
    }

    if (data.event === 'summary') {
      state.chatSummaries[data.payload.phoneNumber] = data.payload.summary;
      if (data.payload.phoneNumber === state.selectedPhone) {
        state.summaryLoading = false;
        renderContext();
      }
    }

    if (data.event === 'control') {
      state.conversationControls[data.payload.phoneNumber] = data.payload.control || { mode: 'bot' };
      if (data.payload.phoneNumber === state.selectedPhone) {
        renderContext();
        renderMessages();
      }
    }
  };
};

// ─── CRM de Clientes ────────────────────────────────────────────────────────
const searchContactsEl = document.getElementById('searchContacts');
const contactsTableBody = document.getElementById('contactsTableBody');
const noContactsMsg = document.getElementById('noContactsMsg');

// Modals
const clientEditModal = document.getElementById('clientEditModal');
const clientEditModalContent = document.getElementById('clientEditModalContent');
const closeClientEditModalBtn = document.getElementById('closeClientEditModal');
const cancelClientEditBtn = document.getElementById('cancelClientEdit');
const clientEditForm = document.getElementById('clientEditForm');

const clientAppointmentsModal = document.getElementById('clientAppointmentsModal');
const clientAppointmentsModalContent = document.getElementById('clientAppointmentsModalContent');
const closeClientAppointmentsModalBtn = document.getElementById('closeClientAppointmentsModal');
const clientAppointmentsModalList = document.getElementById('clientAppointmentsModalList');
const clientAppointmentsModalSub = document.getElementById('clientAppointmentsModalSub');

const loadContacts = async () => {
  try {
    const response = await fetch('/api/clients');
    const clients = await response.json();
    
    // Fetch confirmed appointments count for each client in parallel
    state.clients = await Promise.all(clients.map(async (client) => {
      try {
        const aptResponse = await fetch(`/api/clients/${encodeURIComponent(client.phoneNumber)}/confirmed-appointments`);
        const appointments = await aptResponse.json();
        return {
          ...client,
          confirmedCount: appointments.length
        };
      } catch (e) {
        return {
          ...client,
          confirmedCount: 0
        };
      }
    }));
    
    renderContactsList();
  } catch (error) {
    console.error('Error al cargar contactos:', error);
  }
};

const renderContactsList = () => {
  const query = normalize(state.searchContactsQuery);
  const filtered = state.clients.filter((client) => {
    return normalize(client.name || '').includes(query) || 
           normalize(client.phoneNumber).includes(query) ||
           normalize(client.email || '').includes(query);
  });
  
  if (filtered.length === 0) {
    contactsTableBody.innerHTML = '';
    noContactsMsg.classList.remove('hidden');
    return;
  }
  
  noContactsMsg.classList.add('hidden');
  contactsTableBody.innerHTML = filtered.map((client) => {
    const name = escapeHtml(client.name || 'Cliente Nuevo');
    const phone = escapeHtml(client.phoneNumber);
    const email = client.email ? escapeHtml(client.email) : '<span class="text-slate-400 italic">Sin registrar</span>';
    const notes = client.notes ? escapeHtml(client.notes) : '<span class="text-slate-400 italic">Sin notas</span>';
    
    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4">
          <div class="font-bold text-slate-800">${name}</div>
          <div class="text-xs text-slate-500">${phone}</div>
        </td>
        <td class="px-6 py-4 text-slate-600">${email}</td>
        <td class="px-6 py-4 text-slate-600 max-w-[180px] truncate" title="${client.notes ? escapeHtml(client.notes) : ''}">${notes}</td>
        <td class="px-6 py-4 text-center">
          <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            client.confirmedCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          }">
            ${client.confirmedCount}
          </span>
        </td>
        <td class="px-6 py-4 text-right">
          <div class="flex justify-end gap-1.5">
            <button onclick="selectContactChat('${phone}', '${name}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs transition flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
              Mensaje
            </button>
            <button onclick="openClientAppointments('${phone}')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-lg text-xs transition flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              Citas
            </button>
            <button onclick="openClientEdit('${phone}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition flex items-center gap-1 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              Editar
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

if (searchContactsEl) {
  searchContactsEl.addEventListener('input', (e) => {
    state.searchContactsQuery = e.target.value;
    renderContactsList();
  });
}

// Lógica de Modales y Offcanvas CRM
const closeContactsOffcanvasBtn = document.getElementById('closeContactsOffcanvas');
const contactsOverlay = document.getElementById('contactsOverlay');

if (closeContactsOffcanvasBtn) {
  closeContactsOffcanvasBtn.addEventListener('click', closeContactsOffcanvas);
}
if (contactsOverlay) {
  contactsOverlay.addEventListener('click', closeContactsOffcanvas);
}

const addContactBtn = document.getElementById('addContactBtn');
if (addContactBtn) {
  addContactBtn.addEventListener('click', () => {
    if (state.selectedPhone) {
      openClientEdit(state.selectedPhone);
    }
  });
}

if (clientResponsibleInput) {
  clientResponsibleInput.addEventListener('change', saveSelectedClientResponsible);
}

const assigneeFilterEl = document.getElementById('assigneeFilter');
if (assigneeFilterEl) {
  assigneeFilterEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) {
      const filter = button.dataset.filter;
      state.assigneeFilter = filter;
      renderAssigneeFilter();
      if (filter === 'contacts') {
        openContactsOffcanvas();
      } else {
        closeContactsOffcanvas();
        renderChats();
      }
    }
  });
}

const getBirthdayInputParts = (client = {}) => {
  const day = Number(client.birthdayDay);
  const month = Number(client.birthdayMonth);
  if (day && month) {
    return { day: String(day), month: String(month) };
  }

  const legacyMatch = String(client.birthday || '').match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (legacyMatch) {
    return { day: legacyMatch[1], month: legacyMatch[2] };
  }

  return { day: '', month: '' };
};

const setBirthdayInputs = (client = {}) => {
  const birthday = getBirthdayInputParts(client);
  const dayInput = document.getElementById('editClientBirthdayDay');
  const monthInput = document.getElementById('editClientBirthdayMonth');
  if (dayInput) dayInput.value = birthday.day;
  if (monthInput) monthInput.value = birthday.month;
};

const formatBirthdayValue = (day, month) => (
  day && month ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` : null
);

const isValidBirthday = (day, month) => {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysByMonth[month - 1];
};

const readBirthdayInputs = () => {
  const dayRaw = document.getElementById('editClientBirthdayDay')?.value.trim() || '';
  const monthRaw = document.getElementById('editClientBirthdayMonth')?.value.trim() || '';

  if (!dayRaw && !monthRaw) {
    return { ok: true, birthdayDay: null, birthdayMonth: null };
  }

  if (!dayRaw || !monthRaw) {
    return { ok: false, message: 'Completa día y mes del cumpleaños, o deja ambos campos vacíos.' };
  }

  const birthdayDay = Number(dayRaw);
  const birthdayMonth = Number(monthRaw);
  if (!isValidBirthday(birthdayDay, birthdayMonth)) {
    return { ok: false, message: 'Ingresa un cumpleaños válido usando solo día y mes.' };
  }

  return { ok: true, birthdayDay, birthdayMonth };
};

const openClientEdit = (phone) => {
  const client = state.clients.find(c => c.phoneNumber === phone) || state.selectedClient;
  const campSelect = document.getElementById('editClientCampaign');
  
  if (campSelect) {
    campSelect.innerHTML = '<option value="">WhatsApp Directo (Orgánico)</option>' + 
      state.campaigns.map(c => {
        const sourceText = c.source ? ` (${c.source})` : '';
        return `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${escapeHtml(sourceText)}</option>`;
      }).join('');
  }
  
  if (client) {
    document.getElementById('editClientName').value = client.name || '';
    document.getElementById('editClientPhone').value = client.phoneNumber || '';
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientNotes').value = client.notes || '';
    document.getElementById('editClientResponsible').value = client.responsible || DEFAULT_CLIENT_RESPONSIBLE;
    setBirthdayInputs(client);
    if (campSelect) campSelect.value = client.campaignId || '';
  } else {
    // Si no está registrado en el listado cargado, prepoblar con datos del chat activo
    const chat = getCurrentChat();
    document.getElementById('editClientName').value = chat ? (chat.name || 'Paciente Nuevo') : 'Paciente Nuevo';
    document.getElementById('editClientPhone').value = phone;
    document.getElementById('editClientEmail').value = '';
    document.getElementById('editClientNotes').value = '';
    document.getElementById('editClientResponsible').value = DEFAULT_CLIENT_RESPONSIBLE;
    setBirthdayInputs();
    if (campSelect) campSelect.value = '';
  }
  
  clientEditModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    clientEditModal.classList.remove('opacity-0');
    clientEditModalContent.classList.remove('scale-95');
    clientEditModalContent.classList.add('scale-100');
  });
};

const closeClientEdit = () => {
  clientEditModal.classList.add('opacity-0');
  clientEditModalContent.classList.remove('scale-100');
  clientEditModalContent.classList.add('scale-95');
  setTimeout(() => {
    clientEditModal.classList.add('hidden');
  }, 300);
};

if (closeClientEditModalBtn) closeClientEditModalBtn.addEventListener('click', closeClientEdit);
if (cancelClientEditBtn) cancelClientEditBtn.addEventListener('click', closeClientEdit);

if (clientEditForm) {
  clientEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('editClientPhone').value;
    const name = document.getElementById('editClientName').value;
    const email = document.getElementById('editClientEmail').value;
    const notes = document.getElementById('editClientNotes').value;
    const responsible = document.getElementById('editClientResponsible').value.trim() || DEFAULT_CLIENT_RESPONSIBLE;
    const campSelect = document.getElementById('editClientCampaign');
    const campaignId = campSelect ? campSelect.value : '';
    const birthdayInput = readBirthdayInputs();

    if (!birthdayInput.ok) {
      showCustomAlert(birthdayInput.message);
      return;
    }
    
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          notes,
          campaignId: campaignId || null,
          responsible,
          birthdayDay: birthdayInput.birthdayDay,
          birthdayMonth: birthdayInput.birthdayMonth
        })
      });
      
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        const updatedClient = payload?.client || {
          phoneNumber: phone,
          name,
          email,
          notes,
          responsible,
          campaignId: campaignId || null,
          birthdayDay: birthdayInput.birthdayDay,
          birthdayMonth: birthdayInput.birthdayMonth,
          birthday: formatBirthdayValue(birthdayInput.birthdayDay, birthdayInput.birthdayMonth)
        };

        closeClientEdit();
        loadContacts();
        
        // Actualizar localmente el nombre y el responsable en state.conversations para que la lista y el chat reflejen el cambio
        const chatIdx = state.conversations.findIndex(c => c.phoneNumber === phone);
        if (chatIdx >= 0) {
          state.conversations[chatIdx].name = name;
          state.conversations[chatIdx].responsible = responsible;
          renderChats(); // Re-renderizar la lista de chats para actualizar el nombre en el sidebar
        }
        
        // Si editamos el cliente seleccionado actualmente, actualizar el header, las notas y el botón del panel de chat
        if (phone === state.selectedPhone) {
          chatName.textContent = name;
          state.selectedClient = updatedClient;
          renderContext();
          
          const addContactBtnText = document.getElementById('addContactBtnText');
          const addContactBtn = document.getElementById('addContactBtn');
          if (addContactBtn && addContactBtnText) {
            addContactBtnText.textContent = 'Editar Contacto';
            addContactBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            addContactBtn.classList.add('bg-slate-500', 'hover:bg-slate-600');
          }
        }
      } else {
        showCustomAlert('Error al guardar los cambios del cliente');
        return;
      }
    } catch (error) {
      console.error(error);
      showCustomAlert('Error de conexión');
    }
  });
}

const openClientAppointments = async (phone) => {
  const client = state.clients.find(c => c.phoneNumber === phone);
  clientAppointmentsModalSub.textContent = `Citas confirmadas para ${client ? client.name : phone}`;
  clientAppointmentsModalList.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Cargando citas...</div>';
  
  clientAppointmentsModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    clientAppointmentsModal.classList.remove('opacity-0');
    clientAppointmentsModalContent.classList.remove('scale-95');
    clientAppointmentsModalContent.classList.add('scale-100');
  });
  
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(phone)}/confirmed-appointments`);
    const appointments = await response.json();
    
    if (!appointments || appointments.length === 0) {
      clientAppointmentsModalList.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">No hay citas confirmadas registradas para este cliente.</div>';
      return;
    }
    
    clientAppointmentsModalList.innerHTML = appointments.map((apt) => {
      const startAt = new Date(apt.startAt);
      const dateStr = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(startAt);
      const capDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      
      return `
        <div class="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div>
            <div class="text-sm font-bold text-slate-800">${escapeHtml(apt.serviceName || 'Servicio')}</div>
            <div class="text-xs text-slate-500 mt-0.5">${capDate}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error al cargar citas confirmadas:', error);
    clientAppointmentsModalList.innerHTML = '<div class="text-xs text-red-500 text-center py-4">Error al cargar citas.</div>';
  }
};

const closeClientAppointments = () => {
  clientAppointmentsModal.classList.add('opacity-0');
  clientAppointmentsModalContent.classList.remove('scale-100');
  clientAppointmentsModalContent.classList.add('scale-95');
  setTimeout(() => {
    clientAppointmentsModal.classList.add('hidden');
  }, 300);
};

if (closeClientAppointmentsModalBtn) closeClientAppointmentsModalBtn.addEventListener('click', closeClientAppointments);

// Hacer estas funciones globales para poder invocarlas desde onclick en la tabla
const selectContactChat = (phone, name) => {
  const exists = state.conversations.find((c) => c.phoneNumber === phone);
  if (!exists) {
    state.conversations.unshift({
      phoneNumber: phone,
      name: name || 'Cliente Nuevo',
      lastMessage: '',
      lastAt: new Date().toISOString(),
      priority: 'Pendiente',
      interest: 'Pendiente'
    });
  }
  closeContactsOffcanvas();
  selectChat(phone);
};

window.selectContactChat = selectContactChat;
window.openClientEdit = openClientEdit;
window.openClientAppointments = openClientAppointments;

// ─── Inicialización ─────────────────────────────────────────────────────────
const isEmbedded = new URLSearchParams(window.location.search).get('embed') === 'true';
if (isEmbedded) {
  document.documentElement.classList.add('embedded-mode');
}
renderAppNavbar();
renderMessageNav();
renderPhaseFilter(false);
renderAssigneeFilter();
loadInitial().finally(connectEvents);
