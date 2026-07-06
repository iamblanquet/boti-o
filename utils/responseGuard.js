const { AsyncLocalStorage } = require('node:async_hooks');
const StateStore = require('../models/stateStore');

const storage = new AsyncLocalStorage();

const run = (context, callback) => storage.run(context, callback);

const getContext = () => storage.getStore() || null;

const shouldSend = async ({ phoneNumber } = {}) => {
    const context = getContext();
    if(!context?.token || !context?.stateKey) return true;
    if(phoneNumber && context.phoneNumber && phoneNumber !== context.phoneNumber) return true;

    const stateStore = context.stateStore || StateStore;
    const raw = await stateStore.get(context.stateKey);
    if(!raw) return false;

    try {
        const current = JSON.parse(raw);
        return current?.token === context.token;
    } catch (error) {
        return false;
    }
}

module.exports = {
    run,
    getContext,
    shouldSend
};
