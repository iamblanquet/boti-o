document.addEventListener('DOMContentLoaded', () => {
    const campaignForm = document.getElementById('campaignForm');
    const campaignIdInput = document.getElementById('campaignIdInput');
    const campaignLeadCodeInput = document.getElementById('campaignLeadCodeInput');
    const campaignNameInput = document.getElementById('campaignNameInput');
    const campaignSourceInput = document.getElementById('campaignSourceInput');
    const campaignMediumInput = document.getElementById('campaignMediumInput');
    const campaignTextInput = document.getElementById('campaignTextInput');
    
    const campaignsTableBody = document.getElementById('campaignsTableBody');
    const refreshBtn = document.getElementById('refreshBtn');
    
    const kpiLeads = document.getElementById('kpiLeads');
    const kpiContactedRate = document.getElementById('kpiContactedRate');
    const kpiContactedCount = document.getElementById('kpiContactedCount');
    const kpiAppointmentsRate = document.getElementById('kpiAppointmentsRate');
    const kpiAppointmentsCount = document.getElementById('kpiAppointmentsCount');
    const kpiCapturedRate = document.getElementById('kpiCapturedRate');
    const kpiCapturedCount = document.getElementById('kpiCapturedCount');
    
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');

    const searchCampaignInput = document.getElementById('searchCampaignInput');
    const filterSourceSelect = document.getElementById('filterSourceSelect');

    // Form Drawer
    const formDrawer = document.getElementById('formDrawer');
    const openFormBtn = document.getElementById('openFormBtn');
    const closeFormBtn = document.getElementById('closeFormBtn');
    const drawerOverlay = document.getElementById('drawerOverlay');

    // Stats Drawer (Now Campaign Stats Drawer)
    const campaignStatsDrawer = document.getElementById('campaignStatsDrawer');
    const closeCampaignStatsBtn = document.getElementById('closeCampaignStatsBtn');
    
    let campaignFunnelChartInstance = null;

    // Pagination DOM elements
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const currentPageNum = document.getElementById('currentPageNum');
    const totalPagesNum = document.getElementById('totalPagesNum');
    const paginationStart = document.getElementById('paginationStart');
    const paginationEnd = document.getElementById('paginationEnd');
    const paginationTotal = document.getElementById('paginationTotal');

    let botPhone = '';
    let allCampaigns = [];
    let currentPage = 1;
    const itemsPerPage = 5;
    
    // Chart instances
    let sourceChartInstance = null;
    let mediumChartInstance = null;

    // Helper for Toast
    const showToast = (message, success = true) => {
        toastMsg.textContent = message;
        toast.className = `fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 z-50 ${success ? 'bg-slate-800 text-white' : 'bg-red-600 text-white'}`;
        toast.classList.remove('translate-y-20', 'opacity-0');
        
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 3000);
    };

    // Load configurations (Bot Phone)
    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/tracking/config');
            if (res.ok) {
                const config = await res.json();
                botPhone = config.botPhone || '';
            }
        } catch (error) {
            console.error('Error cargando config de tracking:', error);
        }
    };

    // Filter and render campaigns in memory
    const applyFilters = () => {
        const query = (searchCampaignInput?.value || '').toLowerCase().trim();
        const sourceFilter = filterSourceSelect?.value || 'all';

        const filtered = allCampaigns.filter(c => {
            // Search filter
            const nameMatch = c.name ? c.name.toLowerCase().includes(query) : false;
            const idMatch = c.id ? c.id.toLowerCase().includes(query) : false;
            const matchesSearch = !query || nameMatch || idMatch;

            // Source filter
            let matchesSource = true;
            if (sourceFilter !== 'all') {
                const src = (c.source || '').toLowerCase().trim();
                if (sourceFilter === 'qr') {
                    matchesSource = src.includes('qr') || src.includes('volante');
                } else if (sourceFilter === 'otro') {
                    const mainSources = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'youtube', 'google', 'qr', 'volante'];
                    matchesSource = src === 'otro' || !mainSources.some(m => src.includes(m));
                } else {
                    matchesSource = src === sourceFilter;
                }
            }

            return matchesSearch && matchesSource;
        });

        // Pagination calculations
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
        
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const pageItems = filtered.slice(startIndex, endIndex);

        renderCampaigns(pageItems);

        // Update pagination UI
        if (paginationStart) paginationStart.textContent = totalItems === 0 ? 0 : startIndex + 1;
        if (paginationEnd) paginationEnd.textContent = endIndex;
        if (paginationTotal) paginationTotal.textContent = totalItems;
        if (currentPageNum) currentPageNum.textContent = currentPage;
        if (totalPagesNum) totalPagesNum.textContent = totalPages;

        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;

        // Update Charts based on filtered data
        updateCharts(filtered);
    };

    // Data structure for charts
    const groupLeads = (campaigns, field) => {
        return campaigns.reduce((acc, c) => {
            let key = (c[field] || 'Otro').trim();
            // Capitalize nicely
            key = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
            
            const leads = (c.funnel && c.funnel.leadsCount !== undefined) ? c.funnel.leadsCount : (c.leadsCount || 0);
            if (leads > 0) {
                acc[key] = (acc[key] || 0) + leads;
            }
            return acc;
        }, {});
    };

    // Render/Update charts
    const updateCharts = (campaigns) => {
        const ctxSource = document.getElementById('sourceChart');
        const ctxMedium = document.getElementById('mediumChart');
        if (!ctxSource || !ctxMedium) return;

        const sourceData = groupLeads(campaigns, 'source');
        const mediumData = groupLeads(campaigns, 'medium');

        const sourceLabels = Object.keys(sourceData);
        const sourceValues = Object.values(sourceData);

        const mediumLabels = Object.keys(mediumData);
        const mediumValues = Object.values(mediumData);

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10, family: 'Inter' }, padding: 15 } },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'Inter', size: 13, weight: 'bold' },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            layout: { padding: { top: 10 } }
        };

        const colors = ['#7b7f4c', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b', '#676a3e'];

        if (sourceChartInstance) sourceChartInstance.destroy();
        if (sourceLabels.length > 0) {
            sourceChartInstance = new Chart(ctxSource, {
                type: 'doughnut',
                data: {
                    labels: sourceLabels,
                    datasets: [{ 
                        data: sourceValues, 
                        backgroundColor: colors, 
                        borderWidth: 0
                    }]
                },
                options: chartOptions
            });
        }

        if (mediumChartInstance) mediumChartInstance.destroy();
        if (mediumLabels.length > 0) {
            mediumChartInstance = new Chart(ctxMedium, {
                type: 'doughnut',
                data: {
                    labels: mediumLabels,
                    datasets: [{ 
                        data: mediumValues, 
                        backgroundColor: colors, 
                        borderWidth: 0
                    }]
                },
                options: chartOptions
            });
        } else {
            // Show empty state
            const ctx = ctxMedium.getContext('2d');
            ctx.clearRect(0, 0, ctxMedium.width, ctxMedium.height);
            ctx.font = '12px Inter';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('Sin leads generados', ctxMedium.width / 2, ctxMedium.height / 2);
        }
    };

    // Load campaigns from API
    const loadCampaigns = async () => {
        try {
            if (!botPhone) {
                await fetchConfig();
            }
            const res = await fetch('/api/campaigns');
            if (!res.ok) throw new Error('Error al cargar campañas');
            
            allCampaigns = await res.json();
            updateKPIs(allCampaigns);
            applyFilters();
        } catch (error) {
            console.error(error);
            campaignsTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-6 text-center text-red-500 font-medium">Error al cargar campañas. Revisa la consola.</td>
                </tr>
            `;
        }
    };

    // Update KPI panels
    const updateKPIs = (campaigns) => {
        const totals = campaigns.reduce((result, campaign) => {
            const funnel = campaign.funnel || {};
            result.leads += funnel.leadsCount || campaign.leadsCount || 0;
            result.contacted += funnel.contactedCount || 0;
            result.appointments += funnel.appointmentsCount || 0;
            result.captured += funnel.capturedCount || 0;
            return result;
        }, { leads: 0, contacted: 0, appointments: 0, captured: 0 });

        const rate = (value) => totals.leads > 0
            ? `${((value / totals.leads) * 100).toFixed(1).replace('.0', '')}%`
            : '0%';

        kpiLeads.textContent = totals.leads;
        kpiContactedRate.textContent = rate(totals.contacted);
        kpiContactedCount.textContent = `${totals.contacted} de ${totals.leads} leads`;
        kpiAppointmentsRate.textContent = rate(totals.appointments);
        kpiAppointmentsCount.textContent = `${totals.appointments} de ${totals.leads} leads`;
        kpiCapturedRate.textContent = rate(totals.captured);
        kpiCapturedCount.textContent = `${totals.captured} de ${totals.leads} leads`;
    };

    // Render list in table
    const renderCampaigns = (campaigns) => {
        if (campaigns.length === 0) {
            campaignsTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-12 text-center text-slate-400">No hay enlaces creados todavía. Crea uno usando el formulario.</td>
                </tr>
            `;
            return;
        }

        campaignsTableBody.innerHTML = campaigns.map(c => {
            const leadCode = c.leadCode || c.id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
            const whatsappUrl = c.whatsappUrl || `https://wa.me/${botPhone}?text=${encodeURIComponent(`${c.prefilledText || 'Hola'} #${leadCode}`)}`;
            const funnel = c.funnel || {
                leadsCount: c.leadsCount || 0,
                leadsRate: c.leadsCount ? 100 : 0,
                contactedCount: 0,
                contactedRate: 0,
                appointmentsCount: 0,
                appointmentsRate: 0,
                capturedCount: 0,
                capturedRate: 0
            };

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-4 px-4">
                        <div class="font-bold text-slate-800">${escapeHTML(c.name)}</div>
                        <div class="text-xs text-slate-400 font-mono mt-0.5">ID: ${escapeHTML(c.id)}</div>
                        <div class="text-xs text-emerald-600 font-mono font-bold mt-0.5">Lead: #${escapeHTML(leadCode)}</div>
                    </td>
                    <td class="py-4 px-4 text-xs text-slate-500 font-medium">
                        <div class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded inline-block font-bold">${escapeHTML(c.source)}</div>
                        ${c.medium ? `<div class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded inline-block mt-1 sm:mt-0 ml-0 sm:ml-1">${escapeHTML(c.medium)}</div>` : ''}
                    </td>
                    <td class="py-4 px-4 align-top">
                        <button onclick="window.openCampaignStats('${c.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5" title="Ver gráficas y estadísticas">
                            <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            Ver Estadísticas
                        </button>
                    </td>
                    <td class="py-4 px-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button data-copy-url="${escapeHTML(whatsappUrl)}" class="copy-campaign-link p-2 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-100 rounded-lg transition cursor-pointer flex items-center gap-1.5 font-semibold text-xs" title="Copiar enlace directo de WhatsApp">
                                <svg class="w-4 h-4 fill-emerald-600" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="currentColor"/></svg>
                                Copiar wa.me
                            </button>
                            <button onclick="deleteCampaign('${c.id}')" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer" title="Eliminar campaña">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        campaignsTableBody.querySelectorAll('.copy-campaign-link').forEach((button) => {
            button.addEventListener('click', () => window.copyToClipboard(button.dataset.copyUrl));
        });
    };

    const renderFunnelStage = (label, rate, count, colorClass) => `
        <div class="min-w-0">
            <div class="text-[9px] uppercase font-bold text-slate-400 truncate">${label}</div>
            <div class="text-sm font-bold ${colorClass}">${Number(rate || 0).toFixed(1).replace('.0', '')}%</div>
            <div class="text-[10px] text-slate-400">${count || 0}</div>
        </div>
    `;

    // Helper for HTML escaping
    const escapeHTML = (str) => {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    };

    // Expose clipboard helper globally
    window.copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Enlace copiado al portapapeles con éxito.'))
            .catch(() => showToast('No se pudo copiar el enlace.', false));
    };

    // Expose delete campaign globally
    window.deleteCampaign = async (id) => {
        const confirmed = await window.showCustomConfirm('¿Estás seguro de que deseas eliminar este enlace de seguimiento? Esta acción no se puede deshacer.');
        if (!confirmed) return;
        
        try {
            const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al eliminar');
            
            showToast('Campaña eliminada correctamente.');
            loadCampaigns();
        } catch (error) {
            console.error(error);
            showToast('Error al eliminar la campaña.', false);
        }
    };

    // Submit Create Form
    campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            id: campaignIdInput.value.trim(),
            leadCode: campaignLeadCodeInput.value.trim(),
            name: campaignNameInput.value.trim(),
            source: campaignSourceInput.value.trim(),
            medium: campaignMediumInput.value.trim() || undefined,
            prefilledText: campaignTextInput.value.trim()
        };

        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Error al guardar la campaña');
            }

            showToast('Enlace generado correctamente.');
            campaignForm.reset();
            loadCampaigns();
            closeForm(); // Close drawer on success
        } catch (error) {
            console.error(error);
            showToast(error.message || 'Error al guardar el enlace.', false);
        }
    });

    // Search and filter events
    if (searchCampaignInput) {
        searchCampaignInput.addEventListener('input', () => {
            currentPage = 1;
            applyFilters();
        });
    }
    if (filterSourceSelect) {
        filterSourceSelect.addEventListener('change', () => {
            currentPage = 1;
            applyFilters();
        });
    }

    // Pagination events
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                applyFilters();
            }
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            currentPage++;
            applyFilters();
        });
    }

    // Refresh button click
    refreshBtn.addEventListener('click', () => {
        loadCampaigns();
        showToast('Datos actualizados.');
    });

    // Form Drawer Logic
    const openForm = () => {
        if (formDrawer) {
            formDrawer.classList.add('drawer-open');
        }
        if (drawerOverlay) drawerOverlay.classList.add('overlay-visible');
    };

    const closeForm = () => {
        if (formDrawer) {
            formDrawer.classList.remove('drawer-open');
        }
        closeOverlayIfPossible();
    };

    // Campaign Stats Drawer Logic
    window.openCampaignStats = (campaignId) => {
        const campaign = allCampaigns.find(c => c.id === campaignId);
        if (!campaign) return;

        // Populate drawer
        document.getElementById('campaignStatsTitle').textContent = campaign.name || campaign.id;
        
        const funnel = campaign.funnel || {};
        const leadsList = Array.isArray(funnel.leads) ? funnel.leads : [];
        const leads = funnel.leadsCount ?? campaign.metrics?.total_leads ?? campaign.leadsCount ?? 0;
        const contacted = funnel.contactedCount ?? campaign.metrics?.contacted ?? 0;
        const appointments = funnel.appointmentsCount ?? campaign.metrics?.appointments ?? 0;
        const captured = funnel.capturedCount ?? campaign.metrics?.captured ?? 0;

        const contactedRate = leads > 0 ? Math.round((contacted / leads) * 100) : 0;
        const appointmentsRate = leads > 0 ? Math.round((appointments / leads) * 100) : 0;
        const capturedRate = leads > 0 ? Math.round((captured / leads) * 100) : 0;

        document.getElementById('campKpiLeads').textContent = leads;
        document.getElementById('campKpiContactedRate').textContent = contactedRate + '%';
        document.getElementById('campKpiContactedCount').textContent = `${contacted} de ${leads} leads`;
        
        document.getElementById('campKpiAppointmentsRate').textContent = appointmentsRate + '%';
        document.getElementById('campKpiAppointmentsCount').textContent = `${appointments} de ${leads} leads`;
        
        document.getElementById('campKpiCapturedRate').textContent = capturedRate + '%';
        document.getElementById('campKpiCapturedCount').textContent = `${captured} de ${leads} leads`;
        renderCampaignLeadStats(leadsList);

        // Render chart
        const ctx = document.getElementById('campaignFunnelChart').getContext('2d');
        if (campaignFunnelChartInstance) campaignFunnelChartInstance.destroy();

        const chartData = leads > 0 ? {
            labels: ['No Contactados', 'Contactados', 'Citas', 'Captados'],
            data: [
                Math.max(leads - contacted, 0),
                Math.max(contacted - appointments, 0),
                Math.max(appointments - captured, 0),
                captured
            ],
            colors: ['#cbd5e1', '#3b82f6', '#8b5cf6', '#7b7f4c']
        } : {
            labels: ['Sin Leads'],
            data: [1],
            colors: ['#f1f5f9']
        };

        campaignFunnelChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.data,
                    backgroundColor: chartData.colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10, family: 'Inter' }, padding: 15 } },
                    tooltip: {
                        enabled: leads > 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter', size: 12 },
                        bodyFont: { family: 'Inter', size: 13, weight: 'bold' },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false
                    }
                }
            }
        });

        // Open Drawer
        if (campaignStatsDrawer) {
            campaignStatsDrawer.classList.add('drawer-open');
        }
        if (drawerOverlay) drawerOverlay.classList.add('overlay-visible');
    };

    const renderCampaignLeadStats = (leads) => {
        const container = document.getElementById('campaignLeadStatsList');
        if (!container) return;

        if (!leads.length) {
            container.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Sin leads registrados.</div>';
            return;
        }

        container.innerHTML = leads.map((lead) => `
            <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="font-bold text-sm text-slate-800 truncate">${escapeHTML(lead.name || 'Lead sin nombre')}</div>
                        <a href="https://wa.me/${escapeHTML(lead.phoneNumber)}" target="_blank" class="text-xs font-mono text-emerald-700 hover:underline">${escapeHTML(lead.phoneNumber)}</a>
                        <div class="text-[10px] text-slate-400 mt-1">Ingreso: ${formatDateTime(lead.leadCreatedAt)}</div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-[10px] uppercase font-bold text-slate-400">Estado</div>
                        <div class="text-xs font-bold ${lead.captured ? 'text-emerald-700' : lead.appointmentCreated ? 'text-indigo-700' : lead.contacted ? 'text-sky-700' : 'text-slate-500'}">
                            ${getLeadStageLabel(lead)}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 mt-3">
                    ${renderLeadStageBadge('Contactado', lead.contacted, lead.contactedAt, 'sky')}
                    ${renderLeadStageBadge('Cita', lead.appointmentCreated, lead.appointmentCreatedAt, 'indigo')}
                    ${renderLeadStageBadge('Captado', lead.captured, lead.capturedAt, 'emerald')}
                </div>
            </div>
        `).join('');
    };

    const getLeadStageLabel = (lead) => {
        if (lead.captured) return 'Captado';
        if (lead.appointmentCreated) return 'Con cita';
        if (lead.contacted) return 'Contactado';
        return 'Nuevo';
    };

    const renderLeadStageBadge = (label, active, date, tone) => {
        const activeClasses = {
            sky: 'bg-sky-50 border-sky-100 text-sky-700',
            indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
            emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700'
        };
        const inactiveClass = 'bg-white border-slate-200 text-slate-400';

        return `
            <div class="rounded-lg border px-2.5 py-2 ${active ? activeClasses[tone] : inactiveClass}">
                <div class="text-[10px] font-bold uppercase">${label}</div>
                <div class="text-[10px] mt-0.5">${active ? formatDateTime(date) : 'Pendiente'}</div>
            </div>
        `;
    };

    const formatDateTime = (value) => {
        if (!value) return 'Sin fecha';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Sin fecha';

        return date.toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const closeCampaignStats = () => {
        if (campaignStatsDrawer) {
            campaignStatsDrawer.classList.remove('drawer-open');
        }
        closeOverlayIfPossible();
    };

    const closeOverlayIfPossible = () => {
        const sideDrawer = document.getElementById('sideDrawer');
        if (!sideDrawer || !sideDrawer.classList.contains('drawer-open')) {
             if (drawerOverlay) drawerOverlay.classList.remove('overlay-visible');
        }
    };

    if (openFormBtn) openFormBtn.addEventListener('click', openForm);
    if (closeFormBtn) closeFormBtn.addEventListener('click', closeForm);
    
    if (closeCampaignStatsBtn) closeCampaignStatsBtn.addEventListener('click', closeCampaignStats);

    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', () => {
            closeForm();
            closeCampaignStats();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeForm();
            closeCampaignStats();
        }
    });

    // Initialize
    loadCampaigns();
});
