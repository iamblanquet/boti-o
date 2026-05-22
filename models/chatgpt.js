const { OpenAI } = require('openai');
const Messages = require('./messages');
const Redis = require('../config/redis');

const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;
const openai = new OpenAI({
    apiKey: CHATGPT_API_KEY
})

const chatgpt = async (message, phoneNumber, messageId) => {
    let messagesGpt = [];
    const redis = await Redis();
    const gptContextKey = `${phoneNumber}:chatgpt:context`;
    try {
        const context = await redis.get(gptContextKey);
        if(context) messagesGpt = JSON.parse(context);
        messagesGpt.push({
            role: 'user',
            content: message
        })
        const result = await openai.chat.completions.create({
            messages: messagesGpt,
            model: 'gpt-3.5-turbo'
        })
        console.log('result', JSON.stringify(result));
        const responseText = result.choices[0].message.content;
        messagesGpt.push(result.choices[0].message)
        await redis.set(gptContextKey, JSON.stringify(messagesGpt))
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