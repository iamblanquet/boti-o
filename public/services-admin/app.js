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

const canvas = document.getElementById('catalogCanvas');
const ctx = canvas.getContext('2d');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmCanvas = document.getElementById('confirmCanvas');
const confirmCtx = confirmCanvas.getContext('2d');
const searchInput = document.getElementById('searchInput');
const toast = document.getElementById('toast');

const editorDrawer = document.getElementById('editorDrawer');
const serviceForm = document.getElementById('serviceForm');
const serviceFormTitle = document.getElementById('serviceFormTitle');
const serviceFormSubtitle = document.getElementById('serviceFormSubtitle');
const nameInput = document.getElementById('nameInput');
const categoryInput = document.getElementById('categoryInput');
const durationInput = document.getElementById('durationInput');
const basePriceInput = document.getElementById('basePriceInput');
const priceRows = document.getElementById('priceRows');
const addPriceButton = document.getElementById('addPriceButton');
const peoplePricingEnabled = document.getElementById('peoplePricingEnabled');
const packagesEnabled = document.getElementById('packagesEnabled');
const packageRows = document.getElementById('packageRows');
const addPackageButton = document.getElementById('addPackageButton');
const serviceImageInput = document.getElementById('serviceImageInput');
const serviceImageValue = document.getElementById('serviceImageValue');
const serviceImagePreview = document.getElementById('serviceImagePreview');
const removeServiceImageButton = document.getElementById('removeServiceImageButton');
const descriptionInput = document.getElementById('descriptionInput');
const benefitsInput = document.getElementById('benefitsInput');
const preCareMessageInput = document.getElementById('preCareMessageInput');
const postCareMessageInput = document.getElementById('postCareMessageInput');
const deleteServiceButton = document.getElementById('deleteServiceButton');
const saveServiceButton = document.getElementById('saveServiceButton');

const categoryDrawer = document.getElementById('categoryDrawer');
const categoryForm = document.getElementById('categoryForm');
const categoryFormTitle = document.getElementById('categoryFormTitle');
const categoryFormSubtitle = document.getElementById('categoryFormSubtitle');
const categoryNameInput = document.getElementById('categoryNameInput');
const deleteCategoryButton = document.getElementById('deleteCategoryButton');
const saveCategoryButton = document.getElementById('saveCategoryButton');

const state = {
  services: [],
  categories: [],
  selectedCategoryId: 'all',
  editingServiceId: null,
  editingCategoryId: null,
  serviceScroll: 0,
  categoryScroll: 0,
  hitboxes: [],
  filePath: '',
  serviceImageRemoved: false,
  view: 'categories'
};

const confirmState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Aceptar',
  cancelLabel: 'Cancelar',
  danger: false,
  hitboxes: [],
  resolve: null
};

const colors = {
  bg: '#f8fafc', // slate-50
  panel: '#ffffff',
  panelAlt: '#f1f5f9', // slate-100
  line: '#e2e8f0', // slate-200
  text: '#1e293b', // slate-800
  muted: '#64748b', // slate-500
  green: '#676a3e', // emerald-600
  greenDark: '#555735', // emerald-700
  rose: '#e11d48', // rose-600
  roseSoft: '#ffe4e6', // rose-100
  sand: '#f1f5f9',
  gold: '#676a3e' // Use emerald for prices instead of gold for consistency
};

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return 'Sin precio';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(Number(value));
};

const formatServicePrices = (service) => {
  const prices = Array.isArray(service.preciosPersonas) ? service.preciosPersonas : [];
  if (!prices.length) return formatMoney(service.precio);
  const hasSpecialPeoplePrices = prices.some((item) => item.exclusivo) || new Set(prices.map((item) => Number(item.precio))).size > 1;
  if (!hasSpecialPeoplePrices) return formatMoney(service.precio ?? prices[0]?.precio);
  return prices.map((item) => {
    const label = item.personas === 1 ? '1 persona' : `${item.personas} personas`;
    return `${label} ${formatMoney(item.precio)}`;
  }).join(' · ');
};

const getServicePriceChips = (service) => {
  const prices = Array.isArray(service.preciosPersonas) && service.preciosPersonas.length
    ? service.preciosPersonas
    : [{ personas: 1, precio: service.precio, exclusivo: false }];
  const hasSpecialPeoplePrices = prices.some((item) => item.exclusivo) || new Set(prices.map((item) => Number(item.precio))).size > 1;
  if (!hasSpecialPeoplePrices) return [{ text: formatMoney(service.precio ?? prices[0]?.precio), exclusive: false }];

  return prices
    .filter((item) => item.precio !== null && item.precio !== undefined && item.precio !== '')
    .map((item) => {
      const people = item.personas === 1 ? '1 persona' : `${item.personas} personas`;
      return {
        text: `${people} ${formatMoney(item.precio)}`,
        exclusive: item.exclusivo === true
      };
    });
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const showToast = (message, type = 'ok') => {
  toast.innerHTML = `
    <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      ${type === 'error' 
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>' 
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'}
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  if(type === 'error') {
    toast.className = 'toast absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-xl shadow-xl font-medium text-sm flex items-center gap-3 z-50 pointer-events-none show';
  } else {
    toast.className = 'toast absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-xl font-medium text-sm flex items-center gap-3 z-50 pointer-events-none show';
  }
  
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
};

const getMediaUrl = (file) => /^https?:\/\//i.test(String(file || '')) ? file : '';

const setServiceImage = (file) => {
  serviceImageValue.value = file || '';
  if (file) {
    serviceImagePreview.src = getMediaUrl(file);
    serviceImagePreview.hidden = false;
    removeServiceImageButton.hidden = false;
  } else {
    serviceImagePreview.removeAttribute('src');
    serviceImagePreview.hidden = true;
    removeServiceImageButton.hidden = true;
  }
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
  reader.readAsDataURL(file);
});

const uploadSelectedServiceImage = async () => {
  const file = serviceImageInput.files?.[0];
  if (!file) return serviceImageValue.value;

  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch('/api/services/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      dataUrl
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo subir la imagen');
  return data.url;
};

const roundedRect = (x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawText = (text, x, y, options = {}) => {
  ctx.fillStyle = options.color || colors.text;
  ctx.font = `${options.weight || 400} ${options.size || 14}px 'Inter', sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(text || ''), x, y);
};

const truncateText = (text, maxWidth) => {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
};

const wrapText = (text, maxWidth, maxLines = 2) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = truncateText(clipped[maxLines - 1], maxWidth);
    return clipped;
  }
  return lines;
};

const drawConfirmText = (text, x, y, options = {}) => {
  confirmCtx.fillStyle = options.color || colors.text;
  confirmCtx.font = `${options.weight || 400} ${options.size || 14}px 'Inter', sans-serif`;
  confirmCtx.textBaseline = 'top';
  confirmCtx.fillText(String(text || ''), x, y);
};

const confirmRoundedRect = (x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  confirmCtx.beginPath();
  confirmCtx.moveTo(x + radius, y);
  confirmCtx.arcTo(x + w, y, x + w, y + h, radius);
  confirmCtx.arcTo(x + w, y + h, x, y + h, radius);
  confirmCtx.arcTo(x, y + h, x, y, radius);
  confirmCtx.arcTo(x, y, x + w, y, radius);
  confirmCtx.closePath();
};

const wrapConfirmText = (text, maxWidth, maxLines = 4) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (confirmCtx.measureText(next).width <= maxWidth) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
};

const resizeConfirmCanvas = () => {
  const rect = confirmCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  confirmCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  confirmCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  confirmCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawConfirmDialog();
};

const drawConfirmButton = (box, label, primary = false, danger = false) => {
  confirmCtx.fillStyle = primary ? (danger ? colors.rose : colors.green) : '#eef4e8';
  confirmRoundedRect(box.x, box.y, box.w, box.h, 9);
  confirmCtx.fill();
  confirmCtx.strokeStyle = primary ? 'transparent' : colors.line;
  confirmCtx.stroke();
  confirmCtx.textAlign = 'center';
  drawConfirmText(label, box.x + box.w / 2, box.y + 12, {
    size: 14,
    weight: 600,
    color: primary ? '#fff' : colors.greenDark
  });
  confirmCtx.textAlign = 'left';
};

const drawConfirmDialog = () => {
  if (!confirmState.open) return;

  const width = confirmCanvas.clientWidth;
  const height = confirmCanvas.clientHeight;
  confirmState.hitboxes = [];
  confirmCtx.clearRect(0, 0, width, height);
  confirmCtx.fillStyle = 'rgba(47, 51, 43, 0.48)';
  confirmCtx.fillRect(0, 0, width, height);

  const dialogW = Math.min(520, width - 32);
  const dialogH = 236;
  const x = (width - dialogW) / 2;
  const y = Math.max(26, (height - dialogH) / 2);

  confirmCtx.fillStyle = colors.panel;
  confirmRoundedRect(x, y, dialogW, dialogH, 14);
  confirmCtx.fill();
  confirmCtx.strokeStyle = colors.line;
  confirmCtx.stroke();

  drawConfirmText(confirmState.title, x + 24, y + 24, { size: 20, weight: 700, color: colors.text });
  confirmCtx.font = '400 15px \'Inter\', sans-serif';
  wrapConfirmText(confirmState.message, dialogW - 48, 4).forEach((line, index) => {
    drawConfirmText(line, x + 24, y + 62 + index * 22, { size: 15, color: colors.muted });
  });

  const buttonY = y + dialogH - 62;
  const cancelBox = { type: 'cancel', x: x + dialogW - 236, y: buttonY, w: 104, h: 42 };
  const confirmBox = { type: 'confirm', x: x + dialogW - 122, y: buttonY, w: 98, h: 42 };
  drawConfirmButton(cancelBox, confirmState.cancelLabel, false);
  drawConfirmButton(confirmBox, confirmState.confirmLabel, true, confirmState.danger);
  confirmState.hitboxes.push(cancelBox, confirmBox);
};

const closeConfirmDialog = (value) => {
  confirmOverlay.classList.remove('open');
  confirmOverlay.setAttribute('aria-hidden', 'true');
  confirmState.open = false;
  const resolve = confirmState.resolve;
  confirmState.resolve = null;
  if (resolve) resolve(value);
};

const confirmCanvasDialog = ({ title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false }) => new Promise((resolve) => {
  confirmState.open = true;
  confirmState.title = title;
  confirmState.message = message;
  confirmState.confirmLabel = confirmLabel;
  confirmState.cancelLabel = cancelLabel;
  confirmState.danger = danger;
  confirmState.resolve = resolve;
  confirmOverlay.classList.add('open');
  confirmOverlay.setAttribute('aria-hidden', 'false');
  resizeConfirmCanvas();
});

const addHitbox = (box) => {
  state.hitboxes.push(box);
};

const getCategoryName = (id) => state.categories.find((category) => category.id === id)?.nombre || '';

const getFilteredServices = () => {
  const query = normalize(searchInput.value);
  const selectedName = getCategoryName(state.selectedCategoryId);
  return state.services.filter((service) => {
    const byCategory = state.selectedCategoryId === 'all' || normalize(service.categoria) === normalize(selectedName);
    const haystack = normalize([
      service.nombre,
      service.categoria,
      service.descripcion,
      ...(service.beneficios || [])
    ].join(' '));
    return byCategory && (!query || haystack.includes(query));
  });
};

const drawPill = (text, x, y, w, h, fill, color = colors.text) => {
  ctx.fillStyle = fill;
  roundedRect(x, y, w, h, 8);
  ctx.fill();
  drawText(truncateText(text, w - 20), x + 10, y + 7, { size: 12, weight: 600, color });
};

const drawInlineChips = (chips, x, y, maxWidth) => {
  let cursor = x;
  chips.forEach((chip) => {
    ctx.font = '600 12px \'Inter\', sans-serif';
    const width = Math.min(Math.max(74, ctx.measureText(chip.text).width + 22), maxWidth - (cursor - x));
    if (width < 54) return;
    drawPill(truncateText(chip.text, width - 20), cursor, y, width, 28, chip.fill, chip.color);
    cursor += width + 8;
  });
};

const drawButton = (label, x, y, w, h, fill, color = '#fff') => {
  ctx.fillStyle = fill;
  roundedRect(x, y, w, h, 8);
  ctx.fill();
  ctx.textAlign = 'center';
  drawText(label, x + w / 2, y + 9, { size: 12, weight: 600, color });
  ctx.textAlign = 'left';
};

const drawCategoryRow = (category, x, y, w, active) => {
  ctx.fillStyle = active ? '#f6f7ef' : colors.panel; // emerald-50
  roundedRect(x, y, w, 76, 10);
  ctx.fill();
  ctx.strokeStyle = active ? colors.green : colors.line;
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();

  ctx.font = '700 15px \'Inter\', sans-serif';
  const nameWidth = category.id === 'all' ? w - 28 : w - 142;
  drawText(truncateText(category.nombre, nameWidth), x + 14, y + 13, { size: 15, weight: 700, color: colors.text });
  drawText(`${category.count || 0} servicios`, x + 14, y + 39, { size: 13, color: colors.muted });

  if (category.id !== 'all') {
    drawButton('Editar', x + w - 116, y + 18, 54, 30, '#f1f5f9', colors.muted);
    drawButton('Borrar', x + w - 58, y + 18, 50, 30, colors.roseSoft, colors.rose);
    addHitbox({ type: 'category-edit', id: category.id, x: x + w - 116, y: y + 18, w: 54, h: 30 });
    addHitbox({ type: 'category-delete', id: category.id, x: x + w - 58, y: y + 18, w: 50, h: 30 });
  }

  addHitbox({ type: 'category-select', id: category.id, x, y, w: category.id === 'all' ? w : w - 122, h: 76 });
};

const drawServiceCard = (service, x, y, w) => {
  ctx.fillStyle = colors.panel;
  roundedRect(x, y, w, 168, 12);
  ctx.fill();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  const categoryWidth = Math.min(220, Math.max(94, ctx.measureText(service.categoria).width + 24)); // Expanded max width
  drawPill(service.categoria, x + 16, y + 16, categoryWidth, 28, '#f6f7ef', colors.greenDark); // emerald-50
  const chipStart = x + 16 + categoryWidth + 8;
  const hasExclusivePrice = getServicePriceChips(service).some((item) => item.exclusive);
  const chips = hasExclusivePrice ? [{ text: 'Exclusivo', fill: colors.roseSoft, color: colors.rose }] : [];
  drawInlineChips(chips, chipStart, y + 16, Math.max(0, w - categoryWidth - 160));
  drawButton('Editar', x + w - 124, y + 16, 58, 30, colors.green, '#fff');
  drawButton('Borrar', x + w - 60, y + 16, 54, 30, colors.rose, '#fff');

  ctx.font = '700 18px \'Inter\', sans-serif';
  drawText(truncateText(service.nombre, w - 32), x + 16, y + 58, { size: 18, weight: 700 });

  ctx.font = '400 14px \'Inter\', sans-serif';
  wrapText(service.descripcion || 'Sin descripcion.', w - 32, 2).forEach((line, index) => {
    drawText(line, x + 16, y + 86 + index * 20, { size: 14, color: colors.muted });
  });

  drawText(`${service.duracionMinutos || 0} min`, x + 16, y + 140, { size: 13, weight: 600, color: colors.greenDark });
  ctx.font = '600 13px \'Inter\', sans-serif';
  drawText(truncateText(formatServicePrices(service), w - 104), x + 92, y + 140, { size: 13, weight: 600, color: colors.gold });

  addHitbox({ type: 'service-open', id: service.id, x, y, w, h: 168 });
  addHitbox({ type: 'service-edit', id: service.id, x: x + w - 124, y: y + 16, w: 58, h: 30 });
  addHitbox({ type: 'service-delete', id: service.id, x: x + w - 60, y: y + 16, w: 54, h: 30 });
};

const resizeCanvas = () => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
};

const draw = () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  state.hitboxes = [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  const pad = 16;
  const isMobile = width < 768;

  if (isMobile) {
    const panelW = width - pad * 2;
    if (state.view === 'categories') {
      ctx.fillStyle = colors.panel;
      roundedRect(pad, pad, panelW, height - pad * 2, 14);
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.stroke();

      drawText('Categorias', pad + 18, pad + 18, { size: 20, weight: 700 });
      drawText(`${state.categories.length} grupos`, pad + 18, pad + 47, { size: 13, color: colors.muted });

      const allCategory = {
        id: 'all',
        nombre: 'Todos los servicios',
        count: state.services.length
      };
      const categoryRows = [allCategory, ...state.categories];
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad + 10, pad + 76, panelW - 20, height - pad * 2 - 88);
      ctx.clip();
      categoryRows.forEach((category, index) => {
        const y = pad + 84 + index * 86 - state.categoryScroll;
        if (y > -90 && y < height + 20) {
          drawCategoryRow(category, pad + 12, y, panelW - 24, category.id === state.selectedCategoryId);
        }
      });
      ctx.restore();
    } else {
      ctx.fillStyle = colors.panel;
      roundedRect(pad, pad, panelW, height - pad * 2, 14);
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.stroke();

      // Botón Atrás en móvil
      ctx.fillStyle = '#f1f5f9';
      roundedRect(pad + 18, pad + 14, 110, 32, 8);
      ctx.fill();
      
      drawText('← Categorias', pad + 28, pad + 24, { size: 13, weight: 600, color: colors.text });
      state.hitboxes.push({
        type: 'mobile-back-to-categories',
        x: pad + 18,
        y: pad + 14,
        w: 110,
        h: 32
      });

      const selectedTitle = state.selectedCategoryId === 'all' ? 'Catalogo completo' : getCategoryName(state.selectedCategoryId);
      const services = getFilteredServices();
      drawText(selectedTitle, pad + 18, pad + 70, { size: 22, weight: 700 });
      drawText(`${services.length} servicios`, pad + 18, pad + 95, { size: 13, color: colors.muted });

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad + 10, pad + 115, panelW - 20, height - pad * 2 - 128);
      ctx.clip();

      if (!services.length) {
        drawText('No hay servicios con esos filtros.', pad + 18, pad + 145, { size: 16, color: colors.muted });
      } else {
        const gap = 14;
        const cardW = panelW - 24;
        const cardH = 168;
        services.forEach((service, index) => {
          const y = pad + 125 + index * (cardH + gap) - state.serviceScroll;
          if (y > -cardH && y < height + 20) {
            drawServiceCard(service, pad + 12, y, cardW);
          }
        });
      }
      ctx.restore();
    }
  } else {
    // DESKTOP LAYOUT (unchanged)
    const leftW = 320;
    const rightX = pad + leftW + 16;
    const rightW = width - rightX - pad;

    ctx.fillStyle = colors.panel;
    roundedRect(pad, pad, leftW, height - pad * 2, 14);
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.stroke();

    drawText('Categorias', pad + 18, pad + 18, { size: 20, weight: 700 });
    drawText(`${state.categories.length} grupos`, pad + 18, pad + 47, { size: 13, color: colors.muted });

    const allCategory = {
      id: 'all',
      nombre: 'Todos los servicios',
      count: state.services.length
    };
    const categoryRows = [allCategory, ...state.categories];
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad + 10, pad + 76, leftW - 20, height - pad * 2 - 88);
    ctx.clip();
    categoryRows.forEach((category, index) => {
      const y = pad + 84 + index * 86 - state.categoryScroll;
      if (y > -90 && y < height + 20) {
        drawCategoryRow(category, pad + 12, y, leftW - 24, category.id === state.selectedCategoryId);
      }
    });
    ctx.restore();

    ctx.fillStyle = colors.panel;
    roundedRect(rightX, pad, rightW, height - pad * 2, 14);
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.stroke();

    const selectedTitle = state.selectedCategoryId === 'all' ? 'Catalogo completo' : getCategoryName(state.selectedCategoryId);
    const services = getFilteredServices();
    drawText(selectedTitle, rightX + 22, pad + 18, { size: 24, weight: 700 });
    drawText(`${services.length} servicios visibles`, rightX + 22, pad + 52, { size: 13, color: colors.muted });

    ctx.save();
    ctx.beginPath();
    ctx.rect(rightX + 16, pad + 82, rightW - 32, height - pad * 2 - 98);
    ctx.clip();

    if (!services.length) {
      drawText('No hay servicios con esos filtros.', rightX + 28, pad + 112, { size: 16, color: colors.muted });
    } else {
      const gap = 14;
      const columns = rightW > 920 ? 2 : 1;
      const cardW = (rightW - 32 - gap * (columns - 1)) / columns;
      const cardH = 168;
      services.forEach((service, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = rightX + 16 + col * (cardW + gap);
        const y = pad + 92 + row * (cardH + gap) - state.serviceScroll;
        if (y > -cardH && y < height + 20) drawServiceCard(service, x, y, cardW);
      });
    }
    ctx.restore();
  }
};

const syncCategoryOptions = () => {
  categoryInput.innerHTML = state.categories
    .map((category) => `<option value="${category.nombre}">${category.nombre}</option>`)
    .join('');
};

const getNextPeopleCount = () => {
  const counts = Array.from(priceRows.querySelectorAll('[data-price-people]'))
    .map((input) => Number(input.value))
    .filter(Number.isFinite);
  return counts.length ? Math.max(...counts) + 1 : 1;
};

const addPriceRow = (price = {}) => {
  const row = document.createElement('div');
  row.className = 'price-row flex items-end gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl relative group';
  row.dataset.priceRow = 'true';
  row.innerHTML = `
    <label class="flex flex-col gap-1 text-xs font-semibold text-slate-700 flex-1">
      Personas
      <input data-price-people type="number" min="1" step="1" value="${price.personas || getNextPeopleCount()}" class="px-2 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition font-normal text-sm w-full">
    </label>
    <label class="flex flex-col gap-1 text-xs font-semibold text-slate-700 flex-1">
      Precio MXN
      <input data-price-amount type="number" min="0" step="1" value="${price.precio ?? ''}" class="px-2 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition font-normal text-sm w-full">
    </label>
    <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 pb-2 cursor-pointer flex-1 justify-center border-l border-slate-200 ml-2 pl-4">
      <input data-price-exclusive type="checkbox" ${price.exclusivo ? 'checked' : ''} class="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 transition cursor-pointer">
      Exclusivo
    </label>
    <button class="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm price-remove" type="button" aria-label="Quitar precio">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  `;
  row.querySelector('.price-remove').addEventListener('click', () => {
    row.remove();
    if (!priceRows.children.length) addPriceRow({ personas: 1 });
  });
  priceRows.appendChild(row);
};

const renderPriceRows = (service = null) => {
  priceRows.innerHTML = '';
  const prices = Array.isArray(service?.preciosPersonas) && service.preciosPersonas.length
    ? service.preciosPersonas
    : [];
  const hasSpecialPeoplePrices = prices.some((item) => item.exclusivo) || new Set(prices.map((item) => Number(item.precio))).size > 1;
  basePriceInput.value = service?.precio ?? prices[0]?.precio ?? '';
  peoplePricingEnabled.checked = hasSpecialPeoplePrices;
  if (hasSpecialPeoplePrices) prices.forEach(addPriceRow);
  syncPeoplePricingEditor();
};

const syncPeoplePricingEditor = () => {
  const enabled = peoplePricingEnabled.checked;
  priceRows.hidden = !enabled;
  addPriceButton.hidden = !enabled;
  if (enabled && !priceRows.children.length) {
    addPriceRow({ personas: 1, precio: basePriceInput.value === '' ? '' : Number(basePriceInput.value) });
  }
};

const collectPriceRows = () => Array.from(priceRows.querySelectorAll('.price-row'))
  .map((row) => {
    const amountValue = row.querySelector('[data-price-amount]').value;
    return {
      personas: Number(row.querySelector('[data-price-people]').value),
      precio: amountValue === '' ? null : Number(amountValue),
      exclusivo: row.querySelector('[data-price-exclusive]').checked
    };
  })
  .filter((item) => Number.isFinite(item.personas) && item.personas > 0 && Number.isFinite(item.precio) && item.precio >= 0)
  .sort((a, b) => a.personas - b.personas);

const openServiceDrawer = (service = null) => {
  syncCategoryOptions();
  state.editingServiceId = service?.id || null;
  state.serviceImageRemoved = false;
  serviceFormTitle.textContent = service ? 'Editar servicio' : 'Nuevo servicio';
  serviceFormSubtitle.textContent = service ? service.id : 'Agrega un servicio al catalogo activo.';
  nameInput.value = service?.nombre || '';
  categoryInput.value = service?.categoria || getCategoryName(state.selectedCategoryId) || state.categories[0]?.nombre || '';
  durationInput.value = service?.duracionMinutos || '';
  renderPriceRows(service);
  packageRows.innerHTML = '';
  packagesEnabled.checked = (service?.paquetes || []).length > 0;
  (service?.paquetes || []).forEach(addPackageRow);
  syncPackagesEditor();
  serviceImageInput.value = '';
  setServiceImage(service?.imagen || '');
  descriptionInput.value = service?.descripcion || '';
  benefitsInput.value = (service?.beneficios || []).join('\n');
  preCareMessageInput.value = service?.cuidadosPrevios || '';
  postCareMessageInput.value = service?.cuidadosPosteriores || '';
  deleteServiceButton.hidden = !service;
  editorDrawer.classList.add('open');
  editorDrawer.setAttribute('aria-hidden', 'false');
  nameInput.focus();
};

const closeServiceDrawer = () => {
  editorDrawer.classList.remove('open');
  editorDrawer.setAttribute('aria-hidden', 'true');
};

const openCategoryDrawer = (category = null) => {
  state.editingCategoryId = category?.id || null;
  categoryFormTitle.textContent = category ? 'Editar categoria' : 'Nueva categoria';
  categoryFormSubtitle.textContent = category ? `${category.count || 0} servicios dentro` : 'Crea un nuevo grupo para ordenar servicios.';
  categoryNameInput.value = category?.nombre || '';
  deleteCategoryButton.hidden = !category;
  categoryDrawer.classList.add('open');
  categoryDrawer.setAttribute('aria-hidden', 'false');
  categoryNameInput.focus();
};

const closeCategoryDrawer = () => {
  categoryDrawer.classList.remove('open');
  categoryDrawer.setAttribute('aria-hidden', 'true');
};

const loadCatalog = async ({ keepSelection = true } = {}) => {
  const response = await fetch('/api/services');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catalogo');
  state.services = data.services || [];
  state.categories = data.categories || [];
  state.filePath = data.filePath || '';
  if (!keepSelection || (state.selectedCategoryId !== 'all' && !state.categories.some((category) => category.id === state.selectedCategoryId))) {
    state.selectedCategoryId = 'all';
  }
  syncCategoryOptions();
  draw();
};

const saveService = async () => {
  saveServiceButton.disabled = true;
  const url = state.editingServiceId ? `/api/services/${encodeURIComponent(state.editingServiceId)}` : '/api/services';

  try {
    const imageFile = await uploadSelectedServiceImage();
    const prices = peoplePricingEnabled.checked ? collectPriceRows() : [];
    const paquetes = packagesEnabled.checked ? collectPackageRows() : [];
    const currentService = state.editingServiceId
      ? state.services.find((service) => service.id === state.editingServiceId)
      : null;
    const payload = {
      nombre: nameInput.value.trim(),
      categoria: categoryInput.value,
      duracionMinutos: durationInput.value ? Number(durationInput.value) : null,
      precio: basePriceInput.value === '' ? (prices[0]?.precio ?? null) : Number(basePriceInput.value),
      preciosPersonas: prices,
      paquetes,
      imagen: state.serviceImageRemoved
        ? ''
        : (imageFile || serviceImageValue.value || currentService?.imagen || ''),
      descripcion: descriptionInput.value.trim(),
      beneficios: benefitsInput.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      cuidadosPrevios: preCareMessageInput.value.trim(),
      cuidadosPosteriores: postCareMessageInput.value.trim()
    };
    const response = await fetch(url, {
      method: state.editingServiceId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el servicio');
    state.services = data.services || [];
    state.categories = data.categories || [];
    closeServiceDrawer();
    draw();
    showToast('Servicio guardado');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    saveServiceButton.disabled = false;
  }
};

const deleteService = async (id) => {
  const service = state.services.find((item) => item.id === id);
  if (!service) return;
  const confirmed = await confirmCanvasDialog({
    title: 'Eliminar servicio',
    message: `Eliminar "${service.nombre}" del catalogo? Esta accion no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!confirmed) return;
  const response = await fetch(`/api/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.error || 'No se pudo eliminar el servicio', 'error');
    return;
  }
  state.services = data.services || [];
  state.categories = data.categories || [];
  closeServiceDrawer();
  draw();
  showToast('Servicio eliminado');
};

const saveCategory = async () => {
  saveCategoryButton.disabled = true;
  const payload = { nombre: categoryNameInput.value.trim() };
  const url = state.editingCategoryId
    ? `/api/service-categories/${encodeURIComponent(state.editingCategoryId)}`
    : '/api/service-categories';

  try {
    const response = await fetch(url, {
      method: state.editingCategoryId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la categoria');
    state.services = data.services || [];
    state.categories = data.categories || [];
    state.selectedCategoryId = state.categories.find((category) => normalize(category.nombre) === normalize(payload.nombre))?.id || 'all';
    closeCategoryDrawer();
    draw();
    showToast('Categoria guardada');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    saveCategoryButton.disabled = false;
  }
};

const deleteCategory = async (id) => {
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;
  const detail = category.count ? ` Tambien se eliminaran ${category.count} servicios de esta categoria.` : '';
  const confirmed = await confirmCanvasDialog({
    title: 'Eliminar categoria',
    message: `Eliminar la categoria "${category.nombre}"?${detail}`,
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!confirmed) return;
  const response = await fetch(`/api/service-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.error || 'No se pudo eliminar la categoria', 'error');
    return;
  }
  state.services = data.services || [];
  state.categories = data.categories || [];
  state.selectedCategoryId = 'all';
  closeCategoryDrawer();
  draw();
  showToast('Categoria eliminada');
};

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const box = [...state.hitboxes].reverse().find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
  if (!box) return;

  if (box.type === 'category-select') {
    state.selectedCategoryId = box.id;
    state.serviceScroll = 0;
    if (canvas.clientWidth < 768) {
      state.view = 'services';
    }
    draw();
  }
  if (box.type === 'mobile-back-to-categories') {
    state.view = 'categories';
    draw();
  }
  if (box.type === 'category-edit') openCategoryDrawer(state.categories.find((category) => category.id === box.id));
  if (box.type === 'category-delete') deleteCategory(box.id);
  if (box.type === 'service-open' || box.type === 'service-edit') openServiceDrawer(state.services.find((service) => service.id === box.id));
  if (box.type === 'service-delete') deleteService(box.id);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const isMobile = canvas.clientWidth < 768;
  const leftW = 320;
  
  if (isMobile ? state.view === 'categories' : x < 16 + leftW) {
    const total = ([{ id: 'all' }, ...state.categories].length * 86) + 16;
    state.categoryScroll = Math.max(0, Math.min(total - canvas.clientHeight + 140, state.categoryScroll + event.deltaY));
  } else {
    const services = getFilteredServices();
    const columns = isMobile ? 1 : (canvas.clientWidth - (16 + leftW + 16) - 16 > 920 ? 2 : 1);
    const rows = Math.ceil(services.length / columns);
    const total = rows * 182;
    state.serviceScroll = Math.max(0, Math.min(total - canvas.clientHeight + 150, state.serviceScroll + event.deltaY));
  }
  draw();
}, { passive: false });

// START: MOBILE TOUCH DRAG-SCROLL SUPPORT
let isDragging = false;
let startY = 0;
let startX = 0;
let startCategoryScroll = 0;
let startServiceScroll = 0;

canvas.addEventListener('pointerdown', (event) => {
  isDragging = true;
  startY = event.clientY;
  startX = event.clientX;
  startCategoryScroll = state.categoryScroll;
  startServiceScroll = state.serviceScroll;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!isDragging) return;
  const deltaY = startY - event.clientY;
  const isMobile = canvas.clientWidth < 768;
  const leftW = 320;

  if (isMobile ? state.view === 'categories' : startX < 16 + leftW) {
    const total = ([{ id: 'all' }, ...state.categories].length * 86) + 16;
    state.categoryScroll = Math.max(0, Math.min(total - canvas.clientHeight + 140, startCategoryScroll + deltaY));
  } else {
    const services = getFilteredServices();
    const columns = isMobile ? 1 : (canvas.clientWidth - (16 + leftW + 16) - 16 > 920 ? 2 : 1);
    const rows = Math.ceil(services.length / columns);
    const total = rows * 182;
    state.serviceScroll = Math.max(0, Math.min(total - canvas.clientHeight + 150, startServiceScroll + deltaY));
  }
  draw();
});

canvas.addEventListener('pointerup', (event) => {
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointercancel', (event) => {
  isDragging = false;
});
// END: MOBILE TOUCH DRAG-SCROLL SUPPORT

confirmCanvas.addEventListener('click', (event) => {
  if (!confirmState.open) return;
  const rect = confirmCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const box = confirmState.hitboxes.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
  if (!box) return;
  closeConfirmDialog(box.type === 'confirm');
});

document.addEventListener('keydown', (event) => {
  if (!confirmState.open) return;
  if (event.key === 'Escape') closeConfirmDialog(false);
  if (event.key === 'Enter') closeConfirmDialog(true);
});

searchInput.addEventListener('input', () => {
  state.serviceScroll = 0;
  if (canvas.clientWidth < 768 && searchInput.value.trim().length > 0) {
    state.view = 'services';
  }
  draw();
});

document.getElementById('newServiceButton').addEventListener('click', () => openServiceDrawer(null));
document.getElementById('newCategoryButton').addEventListener('click', () => openCategoryDrawer(null));
addPriceButton.addEventListener('click', () => addPriceRow({ personas: getNextPeopleCount() }));
peoplePricingEnabled.addEventListener('change', syncPeoplePricingEditor);
const addPackageRow = (item = {}) => {
  const row = document.createElement('div');
  row.className = 'package-row grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl';
  row.innerHTML = `<input data-package-name placeholder="Nombre" value="${escapeHtml(item.nombre || '')}" class="px-2 py-1.5 border rounded-md text-sm"><input data-package-sessions type="number" min="2" placeholder="Sesiones" value="${item.sesiones || ''}" class="px-2 py-1.5 border rounded-md text-sm"><input data-package-price type="number" min="0" placeholder="Precio MXN" value="${item.precio ?? ''}" class="px-2 py-1.5 border rounded-md text-sm"><button type="button" class="package-remove text-red-600 text-sm">Quitar</button><input data-package-description placeholder="Condiciones opcionales" value="${escapeHtml(item.descripcion || '')}" class="col-span-2 px-2 py-1.5 border rounded-md text-sm">`;
  row.querySelector('.package-remove').addEventListener('click', () => row.remove());
  packageRows.appendChild(row);
};
const collectPackageRows = () => Array.from(packageRows.querySelectorAll('.package-row')).map((row) => ({ nombre: row.querySelector('[data-package-name]').value.trim(), sesiones: Number(row.querySelector('[data-package-sessions]').value), precio: Number(row.querySelector('[data-package-price]').value), descripcion: row.querySelector('[data-package-description]').value.trim() })).filter((item) => item.nombre && item.sesiones > 1 && Number.isFinite(item.precio));
const syncPackagesEditor = () => { packageRows.hidden = !packagesEnabled.checked; addPackageButton.hidden = !packagesEnabled.checked; if(packagesEnabled.checked && !packageRows.children.length) addPackageRow(); };
addPackageButton.addEventListener('click', () => addPackageRow());
packagesEnabled.addEventListener('change', syncPackagesEditor);

serviceImageInput.addEventListener('change', () => {
  const file = serviceImageInput.files?.[0];
  if (!file) {
    setServiceImage(serviceImageValue.value);
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  state.serviceImageRemoved = false;
  serviceImagePreview.src = previewUrl;
  serviceImagePreview.hidden = false;
  removeServiceImageButton.hidden = false;
});

removeServiceImageButton.addEventListener('click', () => {
  serviceImageInput.value = '';
  state.serviceImageRemoved = true;
  setServiceImage('');
});

serviceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveService();
});

categoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveCategory();
});

deleteServiceButton.addEventListener('click', () => {
  if (state.editingServiceId) deleteService(state.editingServiceId);
});

deleteCategoryButton.addEventListener('click', () => {
  if (state.editingCategoryId) deleteCategory(state.editingCategoryId);
});

document.querySelectorAll('[data-close-drawer]').forEach((button) => button.addEventListener('click', closeServiceDrawer));
document.querySelectorAll('[data-close-category]').forEach((button) => button.addEventListener('click', closeCategoryDrawer));

window.addEventListener('resize', resizeCanvas);
window.addEventListener('resize', () => {
  if (confirmState.open) resizeConfirmCanvas();
});

loadCatalog({ keepSelection: false })
  .then(resizeCanvas)
  .catch((error) => showToast(error.message, 'error'));
