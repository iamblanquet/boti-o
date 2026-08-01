const crypto = require('crypto');

const SIGNATURE_PREFIX = 'sha256=';

const hasValidMetaSignature = (rawBody, signature, appSecret) => {
    if(!Buffer.isBuffer(rawBody) || !signature || !appSecret) return false;
    if(!signature.startsWith(SIGNATURE_PREFIX)) return false;

    const expected = `${SIGNATURE_PREFIX}${crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex')}`;
    const receivedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    return receivedBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

const verifyMetaWebhookSignature = (req, res, next) => {
    const appSecret = process.env.META_APP_SECRET;
    if(!appSecret) {
        return res.status(503).json({ error: 'Webhook no configurado de forma segura.' });
    }

    if(!hasValidMetaSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) {
        return res.status(401).json({ error: 'Firma de webhook invalida.' });
    }

    return next();
};

module.exports = { hasValidMetaSignature, verifyMetaWebhookSignature };
