const state = {
  conversations: [],
  selectedPhone: null,
  messages: []
};

const chatList = document.getElementById('chatList');
const messagesEl = document.getElementById('messages');
const chatName = document.getElementById('chatName');
const chatPhone = document.getElementById('chatPhone');
const chatMode = document.getElementById('chatMode');
const statusEl = document.getElementById('status');
const searchEl = document.getElementById('search');
const composer = document.getElementById('composer');
const replyText = document.getElementById('replyText');
const sendButton = document.getElementById('sendButton');

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-MX', {
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

const renderChats = () => {
  const query = searchEl.value.trim().toLowerCase();
  const chats = state.conversations.filter((chat) => {
    return `${chat.name || ''} ${chat.phoneNumber}`.toLowerCase().includes(query);
  });

  chatList.innerHTML = chats.map((chat) => `
    <button class="chat-item ${chat.phoneNumber === state.selectedPhone ? 'active' : ''}" data-phone="${chat.phoneNumber}">
      <div class="chat-top">
        <span class="chat-title">${escapeHtml(chat.name || chat.phoneNumber)}</span>
        <span class="chat-time">${formatTime(chat.lastAt)}</span>
      </div>
      <div class="chat-preview">${escapeHtml(chat.lastMessage || 'Sin mensajes')}</div>
    </button>
  `).join('');
};

const renderMessages = () => {
  if (!state.selectedPhone) {
    messagesEl.className = 'messages empty';
    messagesEl.innerHTML = '<p>Cuando llegue un WhatsApp, lo veras en tiempo real.</p>';
    return;
  }

  messagesEl.className = 'messages';
  messagesEl.innerHTML = state.messages.map((message) => `
    <div class="bubble ${message.direction === 'out' ? 'out' : 'in'}">
      ${escapeHtml(message.text)}
      <span class="bubble-time">${message.direction === 'out' ? 'Bot' : 'Cliente'} · ${formatTime(message.createdAt)}</span>
    </div>
  `).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const selectChat = async (phoneNumber) => {
  state.selectedPhone = phoneNumber;
  const chat = state.conversations.find((item) => item.phoneNumber === phoneNumber);
  chatName.textContent = chat?.name || phoneNumber;
  chatPhone.textContent = phoneNumber;
  chatMode.textContent = 'Atencion activa';
  replyText.disabled = false;
  sendButton.disabled = !replyText.value.trim();
  const response = await fetch(`/api/chats/${encodeURIComponent(phoneNumber)}/messages`);
  state.messages = await response.json();
  renderChats();
  renderMessages();
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

replyText.addEventListener('input', () => {
  replyText.style.height = 'auto';
  replyText.style.height = `${Math.min(replyText.scrollHeight, 130)}px`;
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
      throw new Error(data.error || 'No se pudo enviar');
    }

    replyText.value = '';
    replyText.style.height = 'auto';
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
};

const connectEvents = () => {
  const source = new EventSource('/api/chats/events');

  source.onopen = () => {
    statusEl.textContent = 'En vivo';
    statusEl.classList.add('live');
  };

  source.onerror = () => {
    statusEl.textContent = 'Reconectando';
    statusEl.classList.remove('live');
  };

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'init') {
      state.conversations = data.payload.conversations || [];
      renderChats();
      return;
    }

    if (data.event === 'message') {
      upsertConversation(data.payload.conversation);
      if (data.payload.message.phoneNumber === state.selectedPhone) {
        state.messages.push(data.payload.message);
        renderMessages();
      }
      renderChats();
    }
  };
};

loadInitial();
connectEvents();
