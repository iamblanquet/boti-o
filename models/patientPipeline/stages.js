const STAGES = {
    LEAD: 'lead',
    CONTACTED: 'contacted',
    APPOINTMENT_SCHEDULED: 'appointment_scheduled',
    TREATMENT_IN_PROGRESS: 'treatment_in_progress',
    FOLLOW_UP: 'follow_up'
};

const STAGE_DEFINITIONS = [
    { id: STAGES.LEAD, label: 'Lead' },
    { id: STAGES.CONTACTED, label: 'Contactado' },
    { id: STAGES.APPOINTMENT_SCHEDULED, label: 'Cita agendada' },
    { id: STAGES.TREATMENT_IN_PROGRESS, label: 'Tratamiento en proceso' },
    { id: STAGES.FOLLOW_UP, label: 'Seguimiento' }
];

const STAGE_IDS = new Set(STAGE_DEFINITIONS.map((stage) => stage.id));

const isValidStage = (stage) => STAGE_IDS.has(stage);

const getStageLabel = (stage) => (
    STAGE_DEFINITIONS.find((item) => item.id === stage)?.label || 'Lead'
);

module.exports = {
    STAGES,
    STAGE_DEFINITIONS,
    isValidStage,
    getStageLabel
};
