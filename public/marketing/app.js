// Marketing App Logic

let currentAudienceCount = 0;
let selectedFile = null;
let selectedServiceIds = []; // Array to store multiple service IDs
let allServices = []; // Store services for search filtering

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


// DOM Elements - Wizard
const step1Container = document.getElementById('step1');
const step2Container = document.getElementById('step2');
const progressFill = document.getElementById('progressFill');
const stepIndicator1 = document.getElementById('stepIndicator1');
const stepIndicator2 = document.getElementById('stepIndicator2');
const stepLabel2 = document.getElementById('stepLabel2');
const nextStepBtn = document.getElementById('nextStepBtn');
const prevStepBtn = document.getElementById('prevStepBtn');

// DOM Elements - Audience
const calculateAudienceBtn = document.getElementById('calculateAudienceBtn');
const audienceResult = document.getElementById('audienceResult');
const audienceCountEl = document.getElementById('audienceCount');
const audienceSampleEl = document.getElementById('audienceSample');

// DOM Elements - Services Multi-Select
const servicesDropdownBtn = document.getElementById('servicesDropdownBtn');
const servicesDropdownText = document.getElementById('servicesDropdownText');
const servicesMenu = document.getElementById('servicesMenu');
const servicesSearch = document.getElementById('serviceSearch');     // HTML id is serviceSearch
const servicesList = document.getElementById('servicesList');
const selectAllCheckbox = document.getElementById('selectAllServices'); // checkbox in HTML

// DOM Elements - Media & Campaign
const mediaInput = document.getElementById('fileInput');              // HTML id is fileInput
const mediaPreviewContainer = document.getElementById('fileName');    // HTML id is fileName
const mediaPreviewName = mediaPreviewContainer ? mediaPreviewContainer.querySelector('span') : null;
const removeMediaBtn = document.getElementById('removeFileBtn');      // HTML id is removeFileBtn

const campaignMessage = document.getElementById('messageInput');      // HTML id is messageInput
const sendCampaignBtn = document.getElementById('sendCampaignBtn');
const scheduleInput = document.getElementById('scheduleInput');

const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// --- Wizard Logic ---
const goToStep2 = () => {
    step1Container.classList.add('hidden');
    step2Container.classList.remove('hidden');
    
    progressFill.classList.replace('w-[0%]', 'w-full');
    stepIndicator1.classList.replace('bg-emerald-500', 'bg-slate-200');
    stepIndicator1.classList.replace('text-white', 'text-slate-500');
    stepIndicator1.classList.remove('shadow-lg', 'shadow-emerald-500/30');
    
    stepIndicator2.classList.replace('bg-slate-200', 'bg-emerald-500');
    stepIndicator2.classList.replace('text-slate-500', 'text-white');
    stepIndicator2.classList.add('shadow-lg', 'shadow-emerald-500/30');
    
    stepLabel2.classList.replace('text-slate-400', 'text-slate-700');
};

const goToStep1 = () => {
    step2Container.classList.add('hidden');
    step1Container.classList.remove('hidden');
    
    progressFill.classList.replace('w-full', 'w-[0%]');
    stepIndicator2.classList.replace('bg-emerald-500', 'bg-slate-200');
    stepIndicator2.classList.replace('text-white', 'text-slate-500');
    stepIndicator2.classList.remove('shadow-lg', 'shadow-emerald-500/30');
    
    stepIndicator1.classList.replace('bg-slate-200', 'bg-emerald-500');
    stepIndicator1.classList.replace('text-slate-500', 'text-white');
    stepIndicator1.classList.add('shadow-lg', 'shadow-emerald-500/30');
    
    stepLabel2.classList.replace('text-slate-700', 'text-slate-400');
};

nextStepBtn.addEventListener('click', goToStep2);
prevStepBtn.addEventListener('click', goToStep1);


// --- Multi-Select Services Logic ---
const renderServices = (filter = '') => {
    servicesList.innerHTML = '';
    const filtered = allServices.filter(s => s.nombre.toLowerCase().includes(filter.toLowerCase()));
    
    if (filtered.length === 0) {
        servicesList.innerHTML = `<p class="text-xs text-slate-500 p-3 text-center">No se encontraron servicios.</p>`;
        return;
    }

    filtered.forEach(s => {
        const isChecked = selectedServiceIds.includes(s.id);
        const item = document.createElement('label');
        item.className = 'flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0';
        item.innerHTML = `
            <input type="checkbox" value="${s.id}" class="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500" ${isChecked ? 'checked' : ''}>
            <span class="text-sm text-slate-700 font-medium">${s.nombre}</span>
        `;
        
        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!selectedServiceIds.includes(s.id)) selectedServiceIds.push(s.id);
            } else {
                selectedServiceIds = selectedServiceIds.filter(id => id !== s.id);
            }
            updateServicesDropdownText();
        });
        
        servicesList.appendChild(item);
    });
};

const updateServicesDropdownText = () => {
    if (selectedServiceIds.length === 0) {
        servicesDropdownText.textContent = 'Todos los servicios';
    } else if (selectedServiceIds.length === 1) {
        const s = allServices.find(srv => srv.id === selectedServiceIds[0]);
        servicesDropdownText.textContent = s ? s.nombre : '1 servicio';
    } else {
        servicesDropdownText.textContent = `${selectedServiceIds.length} servicios seleccionados`;
    }
};

servicesDropdownBtn.addEventListener('click', () => {
    servicesMenu.classList.toggle('hidden');
    if(!servicesMenu.classList.contains('hidden') && servicesSearch) {
        servicesSearch.focus();
    }
});

document.addEventListener('click', (e) => {
    const container = document.getElementById('servicesDropdownContainer');
    if (container && !container.contains(e.target)) {
        servicesMenu.classList.add('hidden');
    }
});

if (servicesSearch) servicesSearch.addEventListener('input', (e) => renderServices(e.target.value));

// "Todos los servicios" checkbox toggles select-all
if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
        if (selectAllCheckbox.checked) {
            selectedServiceIds = allServices.map(s => s.id);
        } else {
            selectedServiceIds = [];
        }
        renderServices(servicesSearch ? servicesSearch.value : '');
        updateServicesDropdownText();
    });
}

const loadServices = async () => {
    try {
        const res = await fetch('/api/marketing/services');
        allServices = await res.json();
        renderServices();
    } catch(err) {
        console.error('Error loading services', err);
    }
};

// --- Emojis ---
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏',
  '😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠',
  '😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭','🤫',
  '🤥','😶','😐','😑','😬','🫠','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪',
  '😵','😵‍💫','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺',
  '🤡','💩','👻','💀','👽','👾','🤖','🎃','❤️','🧡','💛','💚','💙','💜','🖤','🤍',
  '🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','👋','🤚','🖐️'
];

const initEmojiPicker = () => {
    emojiContainer.innerHTML = EMOJIS.map(emoji => `
        <button type="button" class="flex items-center justify-center hover:bg-slate-200 rounded transition cursor-pointer select-none" style="width: 32px; height: 32px; font-size: 20px;" data-emoji="${emoji}">
            ${emoji}
        </button>
    `).join('');

    emojiContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-emoji]');
        if(!btn) return;
        const emoji = btn.dataset.emoji;
        const start = campaignMessage.selectionStart;
        const end = campaignMessage.selectionEnd;
        const val = campaignMessage.value;
        campaignMessage.value = val.substring(0, start) + emoji + val.substring(end);
        campaignMessage.selectionStart = campaignMessage.selectionEnd = start + emoji.length;
        campaignMessage.focus();
    });

    emojiBtn.addEventListener('click', () => {
        emojiPicker.classList.toggle('hidden');
        emojiPicker.classList.toggle('flex');
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPicker.classList.add('hidden');
            emojiPicker.classList.remove('flex');
        }
    });
};

// --- Toast ---
const showToast = (message, isError = false) => {
    toastMsg.textContent = message;
    if(isError) {
        toast.classList.replace('bg-slate-800', 'bg-red-600');
        toast.querySelector('svg').outerHTML = `<svg class="w-6 h-6 text-red-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else {
        toast.classList.replace('bg-red-600', 'bg-slate-800');
        toast.querySelector('svg').outerHTML = `<svg class="w-6 h-6 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }
    toast.classList.remove('translate-y-20', 'opacity-0');
    
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
};

const clearMedia = () => {
    selectedFile = null;
    if (mediaInput) mediaInput.value = '';
    if (mediaPreviewContainer) mediaPreviewContainer.classList.add('hidden');
};

if (mediaInput) mediaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) { clearMedia(); return; }
    if (file.size > 16 * 1024 * 1024) { showToast('El archivo supera los 16 MB.', true); clearMedia(); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedFile = { name: file.name, dataUrl: ev.target.result };
        if (mediaPreviewName) mediaPreviewName.textContent = file.name;
        if (mediaPreviewContainer) mediaPreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

if (removeMediaBtn) removeMediaBtn.addEventListener('click', clearMedia);

// --- API Calls ---

calculateAudienceBtn.addEventListener('click', async () => {
    const segmentEl = document.querySelector('input[name="audienceSegment"]:checked');
    const segment = segmentEl ? segmentEl.value : 'probable';
    const daysAgo = parseInt(document.getElementById('daysAgo').value) || 2;
    
    calculateAudienceBtn.disabled = true;
    calculateAudienceBtn.innerHTML = `<svg class="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Calculando...`;

    try {
        const response = await fetch('/api/marketing/audience', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segment, daysAgo, serviceIds: selectedServiceIds })
        });
        const data = await response.json();
        
        if (response.ok) {
            currentAudienceCount = data.audienceCount;
            audienceCountEl.textContent = currentAudienceCount;
            audienceSampleEl.textContent = data.sample.length > 0 ? data.sample.join(', ') + (data.audienceCount > 5 ? '...' : '') : 'Ninguno';
            
            audienceResult.classList.remove('hidden');
            
            if(currentAudienceCount === 0) {
                nextStepBtn.disabled = true;
                nextStepBtn.classList.add('btn-disabled');
                nextStepBtn.classList.remove('btn-primary');
                showToast('La audiencia es 0. Modifica los filtros para continuar.', true);
            } else {
                nextStepBtn.disabled = false;
                nextStepBtn.classList.remove('btn-disabled');
                nextStepBtn.classList.add('btn-primary');
            }
        } else {
            showToast(data.error || 'Error calculando audiencia', true);
        }
    } catch (err) {
        showToast('Error de conexión', true);
    } finally {
        calculateAudienceBtn.disabled = false;
        calculateAudienceBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            Calcular Audiencia
        `;
    }
});

sendCampaignBtn.addEventListener('click', async () => {
    if (currentAudienceCount === 0) {
        showToast('La audiencia está vacía', true);
        return;
    }
    const text = campaignMessage ? campaignMessage.value.trim() : '';
    if (!text && !selectedFile) {
        showToast('Debes agregar un mensaje o un archivo', true);
        return;
    }
    const segmentEl = document.querySelector('input[name="audienceSegment"]:checked');
    const segment = segmentEl ? segmentEl.value : 'probable';
    const daysAgo = parseInt(document.getElementById('daysAgo').value) || 2;
    const scheduledAt = scheduleInput && scheduleInput.value ? new Date(scheduleInput.value).toISOString() : null;

    sendCampaignBtn.disabled = true;
    sendCampaignBtn.innerHTML = '<span class="animate-pulse">Enviando...</span>';

    try {
        const response = await fetch('/api/marketing/campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                segment,
                daysAgo,
                serviceIds: selectedServiceIds,
                messageText: text,
                file: selectedFile,
                scheduledAt
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.message || 'Campaña iniciada');
            campaignMessage.value = '';
            clearMedia();
            scheduleInput.value = '';
            setTimeout(goToStep1, 2000); // Regresar al paso 1 después de enviar
        } else {
            showToast(data.error || 'Error al enviar campaña', true);
        }
    } catch (err) {
        showToast('Error de conexión al enviar', true);
    } finally {
        sendCampaignBtn.disabled = false;
        sendCampaignBtn.innerHTML = `
            <span>Lanzar Campaña Ahora</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
        `;
    }
});

// Init
loadServices();
