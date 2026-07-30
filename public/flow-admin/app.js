/* public/flow-admin/app.js */

document.addEventListener('DOMContentLoaded', () => {
  let allFlows = [];
  let currentKeywords = [];
  let activeEditorTab = 'general';

  // DOM Elements
  const flowGrid = document.getElementById('flowGrid');
  const flowFilterList = document.getElementById('flowFilterList');
  const searchFlowInput = document.getElementById('searchFlowInput');
  const activeStepsCount = document.getElementById('activeStepsCount');
  
  const addStepBtn = document.getElementById('addStepBtn');
  const editorDrawer = document.getElementById('editorDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const cancelDrawerBtn = document.getElementById('cancelDrawerBtn');
  const saveStepBtn = document.getElementById('saveStepBtn');
  const deleteStepBtn = document.getElementById('deleteStepBtn');
  const drawerTitle = document.getElementById('drawerTitle');
  const panelTitle = document.querySelector('.flow-panel-header h1');
  const panelSubtitle = document.querySelector('.flow-panel-header p');

  // Form Elements
  const stepForm = document.getElementById('stepForm');
  const editIndexInput = document.getElementById('editIndex');
  const previousStepInput = document.getElementById('previousStepInput');
  const stepInput = document.getElementById('stepInput');
  const chipInput = document.getElementById('chipInput');
  const chipsContainer = document.getElementById('chipsContainer');
  const functionSelect = document.getElementById('functionSelect');
  const typeSelect = document.getElementById('typeSelect');
  const responseTextarea = document.getElementById('responseTextarea');
  
  const responseTypeLabel = document.getElementById('responseTypeLabel');
  const responseTextLabel = document.getElementById('responseTextLabel');
  const buttonPayloadContainer = document.getElementById('buttonPayloadContainer');
  const buttonBodyText = document.getElementById('buttonBodyText');
  const buttonsList = document.getElementById('buttonsList');

  // Tabs Elements
  const tabGeneralFlow = document.getElementById('tabGeneralFlow');
  const tabApptFlow = document.getElementById('tabApptFlow');
  const tabContentGeneral = document.getElementById('tabContentGeneral');
  const tabContentAppt = document.getElementById('tabContentAppt');

  const apptMessagesForm = document.getElementById('apptMessagesForm');
  const btnSaveApptMessages = document.getElementById('btnSaveApptMessages');
  let activeSystemStepIndex = 0;
  let systemStepNav = null;

  // Fetch all conversational flows from API
  const fetchFlows = async () => {
    try {
      const res = await fetch('/api/flow');
      if (res.ok) {
        allFlows = await res.json();
        renderFlows();
      } else {
        let msg = 'Error cargando los flujos del bot';
        try {
          const err = await res.json();
          msg = err.error || msg;
        } catch (_) {
          msg += ` (Status ${res.status})`;
        }
        window.showToast(msg, 'error');
      }
    } catch (error) {
      console.error('Error fetching flows:', error);
      window.showToast('Error de conexión al cargar flujos. Asegúrate de que el servidor está corriendo.', 'error');
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const FLOW_KIND_LABELS = {
    text: 'Texto simple',
    button: 'Botones',
    ai: 'IA Gemini',
    catalog: 'Catalogo',
    appointment: 'Agendar cita',
    appointment_management: 'Iniciar gestion de citas'
  };

  const getFlowKind = (item) => {
    if (item.function === 'gemini') return 'ai';
    if (item.function === 'catalog') return 'catalog';
    if (item.function === 'appointment') return 'appointment';
    if (item.function === 'appointment_management') return 'appointment_management';
    if (item.type === 'button') return 'button';
    return 'text';
  };

  const getSearchFilteredFlows = () => {
    const query = searchFlowInput.value.toLowerCase().trim();
    return allFlows.filter((item) => {
      const previousStep = (item.previousStep ?? item.previusStep ?? '').toString();
      const step = (item.step ?? '').toString();
      const keywordsStr = (item.keywords || []).join(' ').toLowerCase();
      const responseStr = (item.response || []).join(' ').toLowerCase();
      const buttonText = item.buttonPayload?.body?.text || '';
      const functionStr = (item.function || '').toLowerCase();
      const searchTarget = `${previousStep} ${step} ${keywordsStr} ${responseStr} ${buttonText} ${functionStr}`;
      return searchTarget.includes(query);
    });
  };

  const renderFlowFilters = (items) => {
    if (!flowFilterList) return;
    flowFilterList.innerHTML = `
      <button class="flow-filter ${activeEditorTab === 'general' ? 'active' : ''}" type="button" data-flow-section="general">
        <span>
          <strong>Flujos generales</strong>
          <small>${items.length} pasos visibles</small>
        </span>
      </button>
      <button class="flow-filter ${activeEditorTab === 'system' ? 'active' : ''}" type="button" data-flow-section="system">
        <span>
          <strong>Mensajes del sistema</strong>
          <small>Textos del flujo de citas</small>
        </span>
      </button>
    `;
  };

  const getFlowBadge = (item) => {
    const kind = getFlowKind(item);
    const label = FLOW_KIND_LABELS[kind] || 'Texto simple';
    return { kind, label };
  };

  const getResponsePreview = (item) => {
    if (item.function) return `Lanza la integracion ${item.function}.`;
    if (item.type === 'button') return item.buttonPayload?.body?.text || 'Mensaje con botones interactivos.';
    return (item.response && item.response.length > 0) ? item.response.join('\n') : 'Sin respuesta configurada.';
  };

  const getSystemMessageSections = () => Array.from(apptMessagesForm.children)
    .filter((section) => section.querySelector('h3'));

  const applySystemStepVisibility = () => {
    const sections = getSystemMessageSections();
    sections.forEach((section, index) => {
      section.classList.toggle('system-step-hidden', index !== activeSystemStepIndex);
      section.classList.toggle('system-step-active', index === activeSystemStepIndex);
    });

    if (!systemStepNav) return;
    systemStepNav.querySelectorAll('[data-system-step]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.systemStep) === activeSystemStepIndex);
    });
  };

  const renderSystemStepMenu = () => {
    if (!apptMessagesForm || systemStepNav) return;

    const sections = getSystemMessageSections();
    systemStepNav = document.createElement('div');
    systemStepNav.className = 'system-step-nav';
    systemStepNav.setAttribute('aria-label', 'Pasos de mensajes del sistema');

    systemStepNav.innerHTML = sections.map((section, index) => {
      const rawTitle = section.querySelector('h3')?.textContent || `Paso ${index + 1}`;
      const title = rawTitle.replace(/^\s*\d+\.\s*/, '').trim();
      return `
        <button type="button" class="system-step-tab ${index === activeSystemStepIndex ? 'active' : ''}" data-system-step="${index}">
          <span class="system-step-number">${index + 1}</span>
          <span class="system-step-label">${escapeHtml(title)}</span>
        </button>
      `;
    }).join('');

    apptMessagesForm.parentElement.insertBefore(systemStepNav, apptMessagesForm);
    systemStepNav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-system-step]');
      if (!button) return;
      activeSystemStepIndex = Number(button.dataset.systemStep);
      applySystemStepVisibility();
    });

    applySystemStepVisibility();
  };

  // Render list of rules/steps in a card layout
  const renderFlows = () => {
    const searchFiltered = getSearchFilteredFlows();
    const filtered = searchFiltered;

    renderFlowFilters(searchFiltered);
    activeStepsCount.textContent = filtered.length;

    if (filtered.length === 0) {
      flowGrid.innerHTML = `
        <div class="flow-empty-state">
          No se encontraron flujos para la búsqueda actual.
        </div>
      `;
      return;
    }

    flowGrid.innerHTML = filtered.map((item) => {
      const originalIndex = allFlows.indexOf(item);
      const previousStep = item.previousStep ?? item.previusStep ?? '0';
      const step = item.step ?? '0';
      const keywords = item.keywords || [];
      const hasFunction = !!item.function;
      const isButton = item.type === 'button';
      
      let badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Texto</span>';
      if (hasFunction) {
        badge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Función: ${item.function}</span>`;
      } else if (isButton) {
        badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Botones</span>';
      }

      const responseText = hasFunction 
        ? `Lanza la integración <b>${item.function}</b>.` 
        : (item.response && item.response.length > 0 ? item.response.join('\n') : (isButton ? item.buttonPayload?.body?.text : '(Vacía)'));

      const badgeInfo = getFlowBadge(item);
      const responsePreview = getResponsePreview(item);

      return `
        <article class="flow-card">
          <div class="flow-card-actions">
            <button class="flow-edit-btn" type="button" onclick="window.editFlowStep(${originalIndex})">Editar</button>
            <button class="flow-delete-btn" type="button" onclick="window.deleteFlowStep(${originalIndex})">Borrar</button>
          </div>
          <div class="flow-badge flow-badge-${badgeInfo.kind}">${escapeHtml(badgeInfo.label)}</div>
          <h3>Paso ${escapeHtml(previousStep)} -> ${escapeHtml(step)}</h3>
          <p class="flow-response-preview">${escapeHtml(responsePreview)}</p>
          <div class="flow-keyword-row">
            ${keywords.slice(0, 8).map(k => `<span>${escapeHtml(k)}</span>`).join('')}
            ${keywords.length > 8 ? `<span>+${keywords.length - 8}</span>` : ''}
          </div>
        </article>
      `;
    }).join('');
  };

  // Tabs Switching Logic
  tabGeneralFlow.addEventListener('click', () => {
    activeEditorTab = 'general';
    if (panelTitle) panelTitle.textContent = 'Flujo conversacional';
    if (panelSubtitle) panelSubtitle.textContent = 'Gestiona disparadores, respuestas e integraciones del bot.';
    tabGeneralFlow.classList.add('active', 'border-emerald-600', 'text-emerald-600');
    tabGeneralFlow.classList.remove('border-transparent', 'text-slate-500');
    
    tabApptFlow.classList.remove('active', 'border-emerald-600', 'text-emerald-600');
    tabApptFlow.classList.add('border-transparent', 'text-slate-500');
    
    tabContentGeneral.classList.remove('hidden');
    tabContentAppt.classList.add('hidden');
    addStepBtn.classList.remove('hidden');
    renderFlowFilters(getSearchFilteredFlows());
  });

  tabApptFlow.addEventListener('click', () => {
    activeEditorTab = 'system';
    if (panelTitle) panelTitle.textContent = 'Mensajes del sistema';
    if (panelSubtitle) panelSubtitle.textContent = 'Configura los textos que el bot usa durante el flujo de citas.';
    tabApptFlow.classList.add('active', 'border-emerald-600', 'text-emerald-600');
    tabApptFlow.classList.remove('border-transparent', 'text-slate-500');
    
    tabGeneralFlow.classList.remove('active', 'border-emerald-600', 'text-emerald-600');
    tabGeneralFlow.classList.add('border-transparent', 'text-slate-500');
    
    tabContentGeneral.classList.add('hidden');
    tabContentAppt.classList.remove('hidden');
    addStepBtn.classList.add('hidden');
    renderFlowFilters(getSearchFilteredFlows());
    renderSystemStepMenu();
    
    fetchApptMessages();
  });

  // Fetch System Messages Config
  const fetchApptMessages = async () => {
    try {
      const res = await fetch('/api/flow/system-messages');
      if (res.ok) {
        const msgs = await res.json();
        for (const [key, val] of Object.entries(msgs)) {
          const field = apptMessagesForm.querySelector(`[name="${key}"]`);
          if (field) {
            field.value = val;
          }
        }
      } else {
        window.showToast('Error cargando mensajes del sistema', 'error');
      }
    } catch (e) {
      console.error(e);
      window.showToast('Error de conexión al cargar mensajes del sistema', 'error');
    }
  };

  // Save System Messages Config
  btnSaveApptMessages.addEventListener('click', async () => {
    const payload = {};
    const textareas = apptMessagesForm.querySelectorAll('textarea');
    textareas.forEach((el) => {
      payload[el.name] = el.value.trim();
    });

    try {
      const res = await fetch('/api/flow/system-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        window.showToast('Mensajes del sistema actualizados correctamente.');
      } else {
        let msg = 'Error al guardar los mensajes del sistema';
        try {
          const err = await res.json();
          msg = err.error || msg;
        } catch (_) {}
        window.showToast(msg, 'error');
      }
    } catch (e) {
      console.error(e);
      window.showToast('Error de conexión al guardar mensajes del sistema', 'error');
    }
  });

  // Close and open side drawer
  const openDrawer = (title = 'Añadir Paso') => {
    drawerTitle.textContent = title;
    editorDrawer.classList.add('open');
    drawerOverlay.classList.add('visible');
    editorDrawer.setAttribute('aria-hidden', 'false');
  };

  const closeDrawer = () => {
    editorDrawer.classList.remove('open');
    drawerOverlay.classList.remove('visible');
    editorDrawer.setAttribute('aria-hidden', 'true');
    stepForm.reset();
    editIndexInput.value = '';
    currentKeywords = [];
    renderChips();
    toggleActionFields();
  };

  // Keywords logic (chips input)
  const renderChips = () => {
    const inputHtml = chipInput.outerHTML;
    
    chipsContainer.innerHTML = currentKeywords.map((kw, idx) => `
      <span class="chip">
        ${kw}
        <button type="button" class="chip-close" onclick="window.removeKeywordChip(${idx})">&times;</button>
      </span>
    `).join('') + inputHtml;

    const newInput = chipsContainer.querySelector('#chipInput');
    newInput.addEventListener('keydown', handleChipKeydown);
  };

  const handleChipKeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_ \-]+/g, '');
      if (val && !currentKeywords.includes(val)) {
        currentKeywords.push(val);
        e.target.value = '';
        renderChips();
        chipsContainer.querySelector('#chipInput').focus();
      }
    }
  };

  window.removeKeywordChip = (idx) => {
    currentKeywords.splice(idx, 1);
    renderChips();
  };

  // Show/Hide fields depending on selected function or type
  const toggleActionFields = () => {
    const isSpecialFunc = !!functionSelect.value;
    const isButton = typeSelect.value === 'button';

    const labelSpan = responseTextLabel ? responseTextLabel.querySelector('span') : null;

    if (isSpecialFunc) {
      responseTypeLabel.classList.add('hidden');
      responseTextLabel.classList.remove('hidden');
      buttonPayloadContainer.classList.add('hidden');
      if (labelSpan) {
        labelSpan.textContent = 'Mensaje de Introducción / Bienvenida de la Función';
      }
    } else {
      responseTypeLabel.classList.remove('hidden');
      if (labelSpan) {
        labelSpan.textContent = 'Líneas de Respuesta de Texto (Una por línea)';
      }
      if (isButton) {
        responseTextLabel.classList.add('hidden');
        buttonPayloadContainer.classList.remove('hidden');
        renderButtonInputs();
      } else {
        responseTextLabel.classList.remove('hidden');
        buttonPayloadContainer.classList.add('hidden');
      }
    }
  };

  // Helper to render WhatsApp Button layout fields
  const renderButtonInputs = (existingButtons = []) => {
    const limit = 3;
    let buttonsHtml = '';
    for (let i = 0; i < limit; i++) {
      const btn = existingButtons[i] || { reply: { id: '', title: '' } };
      buttonsHtml += `
        <div class="grid grid-cols-2 gap-2">
          <input type="text" placeholder="ID del Botón ${i + 1}" class="button-id-input w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500 font-mono text-slate-800" value="${btn.reply.id || ''}">
          <input type="text" placeholder="Título del Botón ${i + 1}" class="button-title-input w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500 text-slate-800" value="${btn.reply.title || ''}">
        </div>
      `;
    }
    buttonsList.innerHTML = buttonsHtml;
  };

  // Global edit click handler
  window.editFlowStep = (idx) => {
    const item = allFlows[idx];
    if (!item) return;

    openDrawer('Editar Paso');
    editIndexInput.value = idx.toString();
    previousStepInput.value = item.previousStep ?? item.previusStep ?? '0';
    stepInput.value = item.step ?? '0';
    
    currentKeywords = [...(item.keywords || [])];
    renderChips();

    functionSelect.value = item.function || '';
    typeSelect.value = item.type || 'text';
    responseTextarea.value = item.response ? item.response.join('\n') : '';

    toggleActionFields();

    if (item.type === 'button' && item.buttonPayload) {
      buttonBodyText.value = item.buttonPayload.body?.text || '';
      const btns = item.buttonPayload.action?.buttons || [];
      renderButtonInputs(btns);
    } else {
      buttonBodyText.value = '';
      renderButtonInputs();
    }

    deleteStepBtn.classList.remove('hidden');
  };

  window.deleteFlowStep = async (idx) => {
    const item = allFlows[idx];
    if (!item) return;

    const confirmed = await window.showCustomConfirm('Eliminar este paso del flujo? Esta accion no se puede deshacer.');
    if (!confirmed) return;

    const updatedFlows = [...allFlows];
    updatedFlows.splice(idx, 1);

    try {
      const res = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFlows)
      });

      if (res.ok) {
        window.showToast('Paso eliminado con exito.');
        fetchFlows();
      } else {
        const err = await res.json().catch(() => ({}));
        window.showToast(err.error || 'Error al eliminar el paso', 'error');
      }
    } catch (e) {
      console.error('Error deleting step:', e);
      window.showToast(`Error de conexion con la API: ${e.message}`, 'error');
    }
  };

  // Save Step
  const saveStep = async () => {
    const previousStep = previousStepInput.value.trim();
    const step = stepInput.value.trim();
    const func = functionSelect.value;
    const type = typeSelect.value;
    const respVal = responseTextarea.value.trim();
    const editIndex = editIndexInput.value;

    if (!previousStep || !step) {
      window.showToast('Debes ingresar el Paso Previo y Siguiente.', true);
      return;
    }
    if (currentKeywords.length === 0) {
      window.showToast('Debes añadir al menos una Palabra Clave.', true);
      return;
    }

    // Build Step object
    const newStep = {
      previusStep: previousStep,
      step: step,
      keywords: currentKeywords
    };

    if (func) {
      newStep.function = func;
      newStep.response = respVal ? respVal.split('\n') : [];
    } else {
      if (type === 'button') {
        const bodyText = buttonBodyText.value.trim();
        if (!bodyText) {
          window.showToast('El cuerpo del botón no puede estar vacío.', true);
          return;
        }

        const ids = Array.from(document.querySelectorAll('.button-id-input')).map(input => input.value.trim()).filter(Boolean);
        const titles = Array.from(document.querySelectorAll('.button-title-input')).map(input => input.value.trim()).filter(Boolean);
        
        // Validation: Unique IDs and Titles
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
          window.showToast('Cada botón debe tener un ID único.', true);
          return;
        }

        const uniqueTitles = new Set(titles.map(t => t.toLowerCase()));
        if (uniqueTitles.size !== titles.length) {
          window.showToast('No puedes tener títulos de botones duplicados.', true);
          return;
        }

        const buttons = [];
        for (let i = 0; i < ids.length; i++) {
          buttons.push({
            type: 'reply',
            reply: {
              id: ids[i],
              title: titles[i]
            }
          });
        }

        if (buttons.length === 0) {
          window.showToast('Debes configurar al menos un botón válido (ID y Título).', true);
          return;
        }

        newStep.response = [];
        newStep.type = 'button';
        newStep.buttonPayload = {
          type: 'button',
          body: { text: bodyText },
          action: { buttons }
        };
      } else {
        newStep.type = 'text';
        newStep.response = respVal ? respVal.split('\n') : [];
      }
    }

    const updatedFlows = [...allFlows];
    if (editIndex !== '') {
      updatedFlows[parseInt(editIndex)] = newStep;
    } else {
      updatedFlows.push(newStep);
    }

    // Call API to save JSON
    try {
      const res = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFlows)
      });

      if (res.ok) {
        window.showToast('Flujo conversacional guardado.');
        closeDrawer();
        fetchFlows();
      } else {
        let errMsg = 'Error al guardar el flujo';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch (_) {
          errMsg += ` (Servidor retornó código ${res.status})`;
        }
        window.showToast(errMsg, 'error');
      }
    } catch (e) {
      console.error('Error saving step:', e);
      window.showToast(`Error de conexión con la API: ${e.message}`, 'error');
    }
  };

  // Delete Step
  const deleteStep = async () => {
    const editIndex = editIndexInput.value;
    if (editIndex === '') return;

    const confirmed = await window.showCustomConfirm('¿Estás seguro de que deseas eliminar este paso del flujo? Esta acción no se puede deshacer.');
    if (!confirmed) return;

    const updatedFlows = [...allFlows];
    updatedFlows.splice(parseInt(editIndex), 1);

    try {
      const res = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFlows)
      });

      if (res.ok) {
        window.showToast('Paso eliminado con éxito.');
        closeDrawer();
        fetchFlows();
      } else {
        let errMsg = 'Error al eliminar el paso';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch (_) {
          errMsg += ` (Servidor retornó código ${res.status})`;
        }
        window.showToast(errMsg, 'error');
      }
    } catch (e) {
      console.error('Error deleting step:', e);
      window.showToast(`Error de conexión con la API: ${e.message}`, 'error');
    }
  };

  // Event Listeners
  addStepBtn.addEventListener('click', () => {
    openDrawer('Añadir Paso');
    deleteStepBtn.classList.add('hidden');
    renderButtonInputs();
  });
  
  closeDrawerBtn.addEventListener('click', closeDrawer);
  cancelDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
  
  saveStepBtn.addEventListener('click', saveStep);
  deleteStepBtn.addEventListener('click', deleteStep);

  functionSelect.addEventListener('change', toggleActionFields);
  typeSelect.addEventListener('change', toggleActionFields);

  chipInput.addEventListener('keydown', handleChipKeydown);

  searchFlowInput.addEventListener('input', renderFlows);
  if (flowFilterList) {
    flowFilterList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-flow-section]');
      if (!button) return;
      if (button.dataset.flowSection === 'system') tabApptFlow.click();
      else tabGeneralFlow.click();
    });
  }

  // Initialize
  fetchFlows();
});
