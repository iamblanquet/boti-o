const { OpenAI } = require('openai');
const Messages = require('./messages');
const StateStore = require('./stateStore');
const CustomerProfile = require('./customerProfile');
const { buildSpaExpertToneInstructions, cleanWhatsappText } = require('./aiResponseStyle');
const ResponseGuard = require('../utils/responseGuard');
const ServicesRepository = require('./servicesRepository');

let openai = null;

const getOpenAi = () => {
    if(openai) return openai;

    const apiKey = process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY;
    if(!apiKey) throw new Error('Falta CHATGPT_API_KEY u OPENAI_API_KEY.');

    openai = new OpenAI({ apiKey });
    return openai;
}

const chatgpt = async (message, phoneNumber, messageId) => {
    let messagesGpt = [];
    const gptContextKey = `${phoneNumber}:chatgpt:context`;
    try {
        const customerName = await CustomerProfile.getFirstName(phoneNumber);
        const knowledgeBase = await ServicesRepository.buildKnowledgeBase();
        const context = await StateStore.get(gptContextKey);
        if(context) messagesGpt = JSON.parse(context);
        messagesGpt = messagesGpt.filter((item) => item.role !== 'system');
        const systemPrompt = [
            buildSpaExpertToneInstructions(customerName),
            'Usa exclusivamente la informacion de la base de conocimiento para responder sobre servicios, precios e inclusiones.',
            '',
            'Base de conocimiento:',
            knowledgeBase
        ].join('\n');
        messagesGpt.unshift({
            role: 'system',
            content: systemPrompt
        });
        messagesGpt.push({
            role: 'user',
            content: message
        });
        const result = await getOpenAi().chat.completions.create({
            messages: messagesGpt,
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
        });
        console.log('result', JSON.stringify(result));
        const responseText = cleanWhatsappText(result.choices[0].message.content);
        if(!await ResponseGuard.shouldSend({ phoneNumber })) {
            return { stale: true };
        }
        messagesGpt.push({
            role: 'assistant',
            content: responseText
        })
        await StateStore.set(gptContextKey, JSON.stringify(messagesGpt), 86400)
        const options = {
            text: responseText,
            phoneNumber,
            messageId,
            type: 'text'
        }
        await Messages.sendMessage(options);
        return null
    } catch (error) {
        throw new Error(error)
    }
}

module.exports = { chatgpt }
