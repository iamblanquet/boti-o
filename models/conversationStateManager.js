const StateStore = require('./stateStore');

const STATE_TTL_SECONDS = Number(process.env.CONVERSATION_STATE_TTL_SECONDS || 48 * 60 * 60);
const stateKey = (phone) => `${phone}:conversation_state`;

const mapState = (state) => ({
    id: state.id || state.phone,
    phone: state.phone,
    intent: state.intent,
    step: state.step,
    data: state.data || {},
    updatedAt: state.updatedAt
});

const getActiveState = async (phone) => {
    const raw = await StateStore.get(stateKey(phone));
    if(!raw) return null;

    try {
        return mapState(JSON.parse(raw));
    } catch (error) {
        await StateStore.del(stateKey(phone));
        return null;
    }
}

const saveState = async ({ phone, intent, step, data = {} }) => {
    const state = {
        id: phone,
        phone,
        intent,
        step,
        data,
        updatedAt: new Date().toISOString()
    };

    await StateStore.set(stateKey(phone), JSON.stringify(state), STATE_TTL_SECONDS);
    return mapState(state);
}

const updateState = async (phone, patch = {}) => {
    const current = await getActiveState(phone);
    if(!current) return null;

    return saveState({
        phone,
        intent: patch.intent || current.intent,
        step: patch.step || current.step,
        data: {
            ...(current.data || {}),
            ...(patch.data || {})
        }
    });
}

const clearState = async (phone) => {
    await StateStore.del(stateKey(phone));
    return true;
}

module.exports = {
    getActiveState,
    saveState,
    updateState,
    clearState
};
