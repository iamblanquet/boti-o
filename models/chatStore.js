const conversations = new Map();
const clients = new Set();

const MAX_MESSAGES_PER_CHAT = 100;

const serialize = (data) => `data: ${JSON.stringify(data)}\n\n`;

const getConversation = (phoneNumber, name = '') => {
    if(!conversations.has(phoneNumber)) {
        conversations.set(phoneNumber, {
            phoneNumber,
            name,
            messages: [],
            lastMessage: '',
            lastAt: null,
            unread: 0
        });
    }

    const conversation = conversations.get(phoneNumber);
    if(name && !conversation.name) conversation.name = name;
    return conversation;
}

const broadcast = (event, payload) => {
    const data = serialize({ event, payload });
    clients.forEach((client) => {
        try {
            client.write(data);
        } catch (error) {
            clients.delete(client);
        }
    });
}

const addMessage = ({ phoneNumber, name = '', direction, type = 'text', text = '', messageId = null }) => {
    if(!phoneNumber || (!text && type === 'text')) return null;

    const conversation = getConversation(phoneNumber, name);
    const message = {
        id: messageId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        phoneNumber,
        direction,
        type,
        text,
        createdAt: new Date().toISOString()
    };

    conversation.messages.push(message);
    if(conversation.messages.length > MAX_MESSAGES_PER_CHAT) conversation.messages.shift();
    conversation.lastMessage = text;
    conversation.lastAt = message.createdAt;
    if(direction === 'in') conversation.unread += 1;

    broadcast('message', {
        conversation: summarizeConversation(conversation),
        message
    });

    return message;
}

const summarizeConversation = (conversation) => ({
    phoneNumber: conversation.phoneNumber,
    name: conversation.name,
    lastMessage: conversation.lastMessage,
    lastAt: conversation.lastAt,
    unread: conversation.unread
});

const getConversations = () => {
    return Array.from(conversations.values())
        .map(summarizeConversation)
        .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

const getMessages = (phoneNumber) => {
    const conversation = conversations.get(phoneNumber);
    if(!conversation) return [];
    conversation.unread = 0;
    return conversation.messages;
}

const stream = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write(serialize({ event: 'init', payload: { conversations: getConversations() } }));
    clients.add(res);
    req.on('close', () => clients.delete(res));
}

module.exports = {
    addMessage,
    getConversations,
    getMessages,
    stream
}
