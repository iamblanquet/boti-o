const messagesController = require('./messages');

module.exports = {
    apiVerification: messagesController.apiVerification,
    messageInfo: messagesController.messageInfo
};
