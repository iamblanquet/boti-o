document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    const serviceFilters = document.getElementById('serviceFilters');
    const searchInput = document.getElementById('calendarSearch');
    const warningBanner = document.getElementById('calendarWarning');
    let allEvents = [];
    let selectedServices = new Set();
    let loadedRange = '';
    let currentAbortController = null;
    let refreshRetryTimeout = null;
    let refreshRetryAttempts = 0;
    const calendarCachePrefix = 'thessa.calendar.events.';

    const palette = ['#0891b2', '#676a3e', '#7c3aed', '#d97706', '#e11d48', '#0284c7', '#ea580c', '#4f46e5'];
    const colors = new Map();
    const getColor = (service) => {
        if (!colors.has(service)) colors.set(service, palette[colors.size % palette.length]);
        return colors.get(service);
    };
    const normalize = (value) => String(value || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const visibleEvents = () => {
        const query = normalize(searchInput.value);
        return allEvents.filter((event) => {
            const props = event.extendedProps;
            const matchesService = selectedServices.size === 0 || selectedServices.has(props.serviceName);
            const matchesSearch = !query || normalize([
                props.clientName, props.phoneNumber, props.serviceName
            ].join(' ')).includes(query);
            return matchesService && matchesSearch;
        });
    };

    const getEndTime = (event) => {
        if (event.end) return new Date(event.end);
        const start = new Date(event.start);
        return new Date(start.getTime() + 60 * 60000); // 1 hour default
    };

    const updateMetrics = () => {
        const now = new Date();
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const validEvents = allEvents.filter((event) => {
            const start = new Date(event.start);
            return !Number.isNaN(start.getTime());
        });
        const inProgress = validEvents.filter((event) => {
            const start = new Date(event.start);
            const end = getEndTime(event);
            return start <= now && now < end;
        });
        const upcoming = validEvents.filter((event) => {
            const start = new Date(event.start);
            return start > now;
        });
        const sameDay = (date) => date.toDateString() === now.toDateString();
        
        const inProgressEl = document.getElementById('inProgressAppointments');
        if (inProgressEl) inProgressEl.textContent = inProgress.length;
        
        document.getElementById('totalAppointments').textContent = upcoming.length;
        document.getElementById('todayAppointments').textContent = validEvents.filter((event) => sameDay(new Date(event.start))).length;
        document.getElementById('weekAppointments').textContent = upcoming.filter((event) => new Date(event.start) < weekEnd).length;
    };

    let inProgressIndex = 0;
    
    const renderInProgressAppointments = () => {
        const now = new Date();
        const inProgress = allEvents
            .filter((event) => {
                const start = new Date(event.start);
                const end = getEndTime(event);
                return start <= now && now < end;
            })
            .sort((left, right) => new Date(left.start) - new Date(right.start));
            
        const card = document.getElementById('inProgressCard');
        if (!card) return;
        if (inProgress.length === 0) {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');
        
        if (inProgressIndex >= inProgress.length) inProgressIndex = 0;
        if (inProgressIndex < 0) inProgressIndex = inProgress.length - 1;
        
        const current = inProgress[inProgressIndex];
        const props = current.extendedProps;
        const start = new Date(current.start);
        const end = getEndTime(current);
        
        document.getElementById('inProgressDate').textContent = start.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
        document.getElementById('inProgressTime').textContent = `${start.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
        document.getElementById('inProgressClient').textContent = props.clientName || 'Sin nombre';
        const phoneEl = document.getElementById('inProgressPhone');
        phoneEl.textContent = props.phoneNumber || 'Sin telefono';
        phoneEl.href = props.phoneNumber ? `https://wa.me/${props.phoneNumber.replace(/\D/g, '')}` : '#';
        document.getElementById('inProgressService').textContent = props.serviceName || 'Sin servicio';
        document.getElementById('inProgressPeople').textContent = props.people || 1;
        document.getElementById('inProgressStatus').textContent = normalize(props.status) === 'confirmada' ? '✓ Confirmada' : props.status || 'Pendiente';
        document.getElementById('inProgressMessage').href = props.phoneNumber ? `/dashboard/?phone=${encodeURIComponent(props.phoneNumber)}` : '/dashboard/';
        
        const googleLink = document.getElementById('inProgressGoogle');
        googleLink.href = props.htmlLink || '#';
        googleLink.classList.toggle('hidden', !props.htmlLink);
        
        const nav = document.getElementById('inProgressNav');
        if (inProgress.length > 1) {
            nav.classList.remove('hidden');
            document.getElementById('inProgressCounter').textContent = `${inProgressIndex + 1}/${inProgress.length}`;
        } else {
            nav.classList.add('hidden');
        }
    };

    const renderNextAppointment = () => {
        const now = new Date();
        const nextAppointment = allEvents
            .filter((event) => {
                const start = new Date(event.start);
                return !Number.isNaN(start.getTime()) && start > now;
            })
            .sort((left, right) => new Date(left.start) - new Date(right.start))[0];
        const empty = document.getElementById('nextAppointmentEmpty');
        const details = document.getElementById('nextAppointmentDetails');

        if (!nextAppointment) {
            empty.classList.remove('hidden');
            details.classList.add('hidden');
            document.getElementById('nextAppointmentCountdown').textContent = 'Sin citas proximas';
            return;
        }

        empty.classList.add('hidden');
        details.classList.remove('hidden');

        const props = nextAppointment.extendedProps;
        const start = new Date(nextAppointment.start);
        const end = getEndTime(nextAppointment);
        const minutesUntil = Math.max(0, Math.round((start - now) / 60000));
        const daysUntil = Math.floor(minutesUntil / 1440);
        const hoursUntil = Math.floor((minutesUntil % 1440) / 60);
        const countdown = start <= now
            ? 'En curso'
            : daysUntil > 0
                ? `En ${daysUntil} dia${daysUntil === 1 ? '' : 's'}`
                : hoursUntil > 0
                    ? `En ${hoursUntil} hora${hoursUntil === 1 ? '' : 's'}`
                    : `En ${minutesUntil} minutos`;

        document.getElementById('nextAppointmentCountdown').textContent = countdown;
        document.getElementById('nextAppointmentDate').textContent = start.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        document.getElementById('nextAppointmentTime').textContent = `${start.toLocaleTimeString('es-MX', {
            hour: 'numeric',
            minute: '2-digit'
        })} - ${end.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
        document.getElementById('nextAppointmentClient').textContent = props.clientName || 'Sin nombre';
        document.getElementById('nextAppointmentPhone').textContent = props.phoneNumber || 'Sin telefono';
        document.getElementById('nextAppointmentPhone').href = props.phoneNumber
            ? `https://wa.me/${props.phoneNumber.replace(/\D/g, '')}`
            : '#';
        document.getElementById('nextAppointmentService').textContent = props.serviceName || 'Sin servicio';
        document.getElementById('nextAppointmentPeople').textContent = props.people || 1;
        document.getElementById('nextAppointmentStatus').textContent = normalize(props.status) === 'confirmada'
            ? '✓ Confirmada'
            : props.status || 'Pendiente';
        document.getElementById('nextAppointmentMessage').href = props.phoneNumber
            ? `/dashboard/?phone=${encodeURIComponent(props.phoneNumber)}`
            : '/dashboard/';
        const googleLink = document.getElementById('nextAppointmentGoogle');
        googleLink.href = props.htmlLink || '#';
        googleLink.classList.toggle('hidden', !props.htmlLink);
    };

    const buildFilters = () => {
        const services = Array.from(new Set(allEvents.map((event) => event.extendedProps.serviceName))).sort();
        selectedServices = new Set(services);
        const markup = services.length ? services.map((service) => `
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white">
                <input class="service-filter h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600" type="checkbox" value="${service.replace(/"/g, '&quot;')}" checked>
                <span class="min-w-0 flex-1 truncate">${service}</span>
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${getColor(service)}"></span>
            </label>
        `).join('') : '<div class="text-sm text-slate-400 p-2">No hay citas en este periodo.</div>';

        serviceFilters.innerHTML = markup;
        updateServiceFilterControls(services.length);

        serviceFilters.querySelectorAll('.service-filter').forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedServices.add(checkbox.value);
                else selectedServices.delete(checkbox.value);
                updateServiceFilterControls(services.length);
                calendar.refetchEvents();
            });
        });
    };

    const updateServiceFilterControls = (totalServices) => {
        document.getElementById('activeServicesCount').textContent = selectedServices.size;
        document.getElementById('toggleAllServices').textContent = selectedServices.size === totalServices
            ? 'Desmarcar todos'
            : 'Marcar todos';
    };

    const mapEvent = (appointment) => {
        const serviceName = appointment.serviceName || 'Otros';
        return {
            id: appointment.id || appointment.eventId,
            title: `${appointment.clientName || 'Cliente'} · ${serviceName}`,
            start: appointment.startAt,
            end: appointment.endAt,
            backgroundColor: getColor(serviceName),
            borderColor: getColor(serviceName),
            textColor: '#ffffff',
            extendedProps: {
                clientName: appointment.clientName || 'Sin nombre',
                phoneNumber: appointment.phoneNumber || '',
                serviceName,
                people: appointment.people || 1,
                status: appointment.status || 'confirmada',
                htmlLink: appointment.htmlLink || null,
                source: appointment.source || 'local'
            }
        };
    };

    const renderLoadedEvents = (events) => {
        allEvents = (events || []).map(mapEvent);
        buildFilters();
        updateMetrics();
        renderNextAppointment();
        renderInProgressAppointments();
        calendar.refetchEvents();
    };

    const getCacheKey = (start, end) => `${calendarCachePrefix}${start.toISOString()}_${end.toISOString()}`;

    const readCachedEvents = (start, end) => {
        try {
            const raw = window.sessionStorage.getItem(getCacheKey(start, end));
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached || !Array.isArray(cached.events)) return null;
            if (Date.now() - Number(cached.savedAt || 0) > 5 * 60 * 1000) return null;
            return cached.events;
        } catch (error) {
            return null;
        }
    };

    const writeCachedEvents = (start, end, events) => {
        try {
            window.sessionStorage.setItem(getCacheKey(start, end), JSON.stringify({
                savedAt: Date.now(),
                events: events || []
            }));
        } catch (error) {
            // sessionStorage can be unavailable in private modes; the calendar still works without it.
        }
    };

    const scheduleRefreshRetry = (start, end, payload) => {
        if (!payload?.cache?.refreshing) {
            refreshRetryAttempts = 0;
            return;
        }
        if (refreshRetryAttempts >= 5) return;

        window.clearTimeout(refreshRetryTimeout);
        refreshRetryAttempts += 1;
        refreshRetryTimeout = window.setTimeout(() => {
            loadEvents(start, end, { showLoading: false }).catch((error) => {
                warningBanner.textContent = error.message;
                warningBanner.classList.remove('hidden');
            });
        }, 1200);
    };

    const loadEvents = async (start, end, options = {}) => {
        const showLoading = options.showLoading !== false;
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();
        const { signal } = currentAbortController;

        if (showLoading) {
            calendarEl.classList.add('loading');
        }

        const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
        try {
            const response = await fetch(`/api/calendar/confirmed-appointments?${query}`, { signal });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el calendario');
            const events = payload.events || [];
            writeCachedEvents(start, end, events);
            renderLoadedEvents(events);
            warningBanner.textContent = payload.warning || '';
            warningBanner.classList.toggle('hidden', !payload.warning);
            scheduleRefreshRetry(start, end, payload);
            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                return false; // Ignorar errores de aborto planeados
            }
            throw error;
        } finally {
            if (currentAbortController?.signal === signal) {
                currentAbortController = null;
                if (showLoading) {
                    calendarEl.classList.remove('loading');
                }
            }
        }
    };

    const openAppointment = (event) => {
        const props = event.extendedProps;
        const date = event.start.toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        const time = event.start.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
        const endTime = event.end?.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) || '';
        document.getElementById('modalAppointmentTitle').textContent = props.serviceName;
        document.getElementById('modalAppointmentDatetime').textContent = `${date} · ${time}${endTime ? ` - ${endTime}` : ''}`;
        document.getElementById('modalClient').textContent = props.clientName;
        document.getElementById('modalService').textContent = props.serviceName;
        document.getElementById('modalPeople').textContent = props.people;
        document.getElementById('modalStatus').textContent = props.status;
        document.getElementById('modalSource').textContent = props.source === 'google-calendar' ? 'Google Calendar' : 'Registro local';
        document.getElementById('modalHeaderColor').style.backgroundColor = getColor(props.serviceName);
        const phone = document.getElementById('modalPhone');
        phone.textContent = props.phoneNumber || 'Sin telefono';
        phone.href = props.phoneNumber ? `https://wa.me/${props.phoneNumber.replace(/\D/g, '')}` : '#';
        const messageLink = document.getElementById('modalMessageLink');
        messageLink.href = props.phoneNumber
            ? `/dashboard/?phone=${encodeURIComponent(props.phoneNumber)}`
            : '/dashboard/';
        messageLink.classList.toggle('hidden', !props.phoneNumber);
        messageLink.classList.toggle('inline-flex', Boolean(props.phoneNumber));
        const googleLink = document.getElementById('modalGoogleLink');
        googleLink.href = props.htmlLink || '#';
        googleLink.classList.toggle('hidden', !props.htmlLink);
        googleLink.classList.toggle('flex', Boolean(props.htmlLink));
        const modal = document.getElementById('appointmentModal');
        const content = document.getElementById('appointmentModalContent');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            modal.classList.add('opacity-100');
            content.classList.replace('scale-95', 'scale-100');
        });
    };

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth'
        },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Dia' },
        locale: 'es',
        slotMinTime: '07:00:00',
        slotMaxTime: '21:00:00',
        allDaySlot: false,
        height: '100%',
        expandRows: true,
        nowIndicator: true,
        events: (_, done) => done(visibleEvents()),
        eventContent: (info) => {
            const props = info.event.extendedProps;
            const confirmed = normalize(props.status) === 'confirmada';
            const wrapper = document.createElement('div');
            wrapper.className = 'appointment-event';

            const time = document.createElement('span');
            time.className = 'appointment-event__time';
            time.textContent = info.timeText;

            const status = document.createElement('span');
            status.className = 'appointment-event__status';
            status.textContent = confirmed ? '✓ Confirmada' : 'Pendiente';

            const details = document.createElement('div');
            details.className = 'appointment-event__details';

            const client = document.createElement('span');
            client.className = 'appointment-event__client';
            client.textContent = props.clientName || 'Cliente';

            const separator = document.createTextNode(' · ');

            const service = document.createElement('span');
            service.className = 'appointment-event__service';
            service.textContent = props.serviceName || 'Servicio';

            details.append(client, separator, service);
            wrapper.append(time, status, details);
            return { domNodes: [wrapper] };
        },
        eventClick: (info) => openAppointment(info.event),
        datesSet: async (info) => {
            const range = `${info.startStr}|${info.endStr}`;
            if (range === loadedRange) return;
            const cachedEvents = readCachedEvents(info.start, info.end);
            if (cachedEvents) {
                renderLoadedEvents(cachedEvents);
            }
            try {
                const loaded = await loadEvents(info.start, info.end);
                if (loaded) loadedRange = range;
            } catch (error) {
                loadedRange = '';
                warningBanner.textContent = error.message;
                warningBanner.classList.remove('hidden');
            }
        }
    });

    const closeModal = () => {
        const modal = document.getElementById('appointmentModal');
        const content = document.getElementById('appointmentModalContent');
        content.classList.replace('scale-100', 'scale-95');
        modal.classList.remove('opacity-100');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    document.getElementById('closeAppointmentModal').addEventListener('click', closeModal);
    document.getElementById('appointmentModal').addEventListener('click', (event) => {
        if (event.target.id === 'appointmentModal') closeModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
    });
    searchInput.addEventListener('input', () => calendar.refetchEvents());

    const filterButton = document.getElementById('toggleFiltersBtn');
    const filterPanel = document.getElementById('serviceFilterPanel');
    const filtersChevron = document.getElementById('filtersChevron');
    filterButton.addEventListener('click', () => {
        const opening = filterPanel.classList.contains('hidden');
        filterPanel.classList.toggle('hidden');
        filtersChevron.classList.toggle('rotate-180', opening);
    });
    document.getElementById('toggleAllServices').addEventListener('click', () => {
        const checkboxes = Array.from(serviceFilters.querySelectorAll('.service-filter'));
        const shouldSelectAll = selectedServices.size !== checkboxes.length;
        selectedServices = new Set();
        checkboxes.forEach((checkbox) => {
            checkbox.checked = shouldSelectAll;
            if (shouldSelectAll) selectedServices.add(checkbox.value);
        });
        updateServiceFilterControls(checkboxes.length);
        calendar.refetchEvents();
    });

    const drawer = document.getElementById('sideDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const closeDrawer = () => {
        drawer.classList.remove('drawer-open');
        overlay.classList.remove('overlay-visible');
    };
    document.getElementById('mainMenuBtn').addEventListener('click', () => {
        drawer.classList.add('drawer-open');
        overlay.classList.add('overlay-visible');
    });
    document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    let mobileLayout = window.innerWidth < 768;
    window.addEventListener('resize', () => {
        const nextMobileLayout = window.innerWidth < 768;
        if (nextMobileLayout !== mobileLayout) {
            mobileLayout = nextMobileLayout;
            calendar.changeView(mobileLayout ? 'timeGridDay' : 'timeGridWeek');
        }
        calendar.updateSize();
    });

    const inProgressPrevBtn = document.getElementById('inProgressPrevBtn');
    if (inProgressPrevBtn) {
        inProgressPrevBtn.addEventListener('click', () => {
            inProgressIndex--;
            renderInProgressAppointments();
        });
    }

    const inProgressNextBtn = document.getElementById('inProgressNextBtn');
    if (inProgressNextBtn) {
        inProgressNextBtn.addEventListener('click', () => {
            inProgressIndex++;
            renderInProgressAppointments();
        });
    }

    calendar.render();
    window.setInterval(() => {
        loadEvents(calendar.view.activeStart, calendar.view.activeEnd).catch((error) => {
            warningBanner.textContent = error.message;
            warningBanner.classList.remove('hidden');
        });
    }, 60000);
});
