const FLOW_MODE_MANAGEMENT = 'appointment-management';

const STEPS = Object.freeze({
    SELECT_APPOINTMENT: 'select-appointment',
    SELECT_ACTION: 'select-action',
    SELECT_DATE: 'select-date',
    SELECT_TIME: 'select-time',
    CONFIRM_RESCHEDULE: 'confirm-reschedule',
    CONFIRM_CANCEL: 'confirm-cancel'
});

const isManagementFlow = (flow) => flow?.mode === FLOW_MODE_MANAGEMENT;

const createFlow = (step, data = {}) => ({
    mode: FLOW_MODE_MANAGEMENT,
    waitingFor: step,
    data
});

module.exports = { FLOW_MODE_MANAGEMENT, STEPS, isManagementFlow, createFlow };
