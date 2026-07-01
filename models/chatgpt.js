const { OpenAI } = require('openai');
const Messages = require('./messages');
const StateStore = require('./stateStore');
const CustomerProfile = require('./customerProfile');
const { buildSpaExpertToneInstructions, cleanWhatsappText } = require('./aiResponseStyle');

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
        const context = await StateStore.get(gptContextKey);
        if(context) messagesGpt = JSON.parse(context);
        messagesGpt = messagesGpt.filter((item) => item.role !== 'system');
        messagesGpt.unshift({
            role: 'system',
            content: buildSpaExpertToneInstructions(customerName)
        });
        messagesGpt.push({
            role: 'user',
            content: message
        })
        const result = await getOpenAi().chat.completions.create({
            messages: messagesGpt,
            model: 'gpt-3.5-turbo'
        })
        console.log('result', JSON.stringify(result));
        const responseText = cleanWhatsappText(result.choices[0].message.content);
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
