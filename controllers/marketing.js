const MarketingModel = require('../models/marketing');
const Messages = require('../models/messages');
const ServicesRepository = require('../models/servicesRepository');
const ChatStore = require('../models/chatStore');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getServices = async (req, res) => {
    try {
        const services = await ServicesRepository.listActiveServices();
        res.json(services || []);
    } catch (error) {
        console.log('Error en getServices', error);
        res.status(500).json({ error: 'Error obteniendo servicios' });
    }
};

const getAudience = async (req, res) => {
    try {
        const { segment, daysAgo, serviceIds } = req.body;
        const audience = await MarketingModel.getAudience(segment || 'all', daysAgo || 2, serviceIds || []);
        
        const conversations = await ChatStore.getConversationsAsync();
        const samplePhones = audience.slice(0, 5);
        const sample = samplePhones.map(phone => {
            const cleanPhone = phone.replace('@c.us', '');
            const conv = conversations.find(c => c.phoneNumber === phone || c.phoneNumber === cleanPhone || c.phoneNumber === phone + '@c.us');
            const name = conv && conv.name ? conv.name : 'Desconocido';
            return `${name} (${cleanPhone})`;
        });

        res.json({ audienceCount: audience.length, sample });
    } catch (error) {
        console.log('Error en getAudience', error);
        res.status(500).json({ error: 'Error calculando audiencia' });
    }
};

const processMediaFile = (file) => {
    if (!file) return null;
    const { name, dataUrl } = file;
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    
    const uploadsDir = path.join(__dirname, '..', 'mediaFiles', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const parsedPath = path.parse(String(name || 'archivo'));
    const safeBaseName = parsedPath.name.replace(/[^a-zA-Z0-9]+/g, '-') || 'archivo';
    let safeExtension = parsedPath.ext;
    
    if (!safeExtension || safeExtension === '.') {
        if (mimeType === 'image/jpeg') safeExtension = '.jpg';
        else if (mimeType === 'image/png') safeExtension = '.png';
        else if (mimeType === 'image/webp') safeExtension = '.webp';
        else if (mimeType === 'video/mp4') safeExtension = '.mp4';
        else if (mimeType === 'application/pdf') safeExtension = '.pdf';
        else safeExtension = '.bin';
    }

    const uniqueFilename = `${safeBaseName}-${Date.now()}${safeExtension}`;
    const filePath = path.join(uploadsDir, uniqueFilename);
    fs.writeFileSync(filePath, buffer);

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`;
    return `${baseUrl.replace(/\/$/, '')}/mediaFiles/uploads/${uniqueFilename}`;
};

const sendCampaign = async (req, res) => {
    try {
        const { segment, daysAgo, serviceIds, messageText, file, scheduledAt } = req.body;
        
        if (!messageText && !file) {
            return res.status(400).json({ error: 'Debes enviar un mensaje o un archivo' });
        }

        // Determinar la audiencia
        const audience = await MarketingModel.getAudience(segment || 'all', daysAgo || 2, serviceIds || []);
        
        if (audience.length === 0) {
            return res.status(400).json({ error: 'La audiencia está vacía' });
        }

        const mediaUrl = processMediaFile(file);
        
        const executeCampaign = async () => {
            console.log(`Iniciando campaña de marketing a ${audience.length} usuarios...`);
            for (let i = 0; i < audience.length; i++) {
                const phone = audience[i];
                try {
                    if (mediaUrl) {
                        const extension = path.extname(mediaUrl).toLowerCase();
                        let type = 'document';
                        if (['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) type = 'image';
                        if (['.mp4', '.avi', '.mov'].includes(extension)) type = 'video';
                        if (['.mp3', '.ogg', '.wav'].includes(extension)) type = 'audio';

                        await Messages.sendMessage({
                            phoneNumber: phone,
                            type: type,
                            text: messageText,
                            [type]: { link: mediaUrl },
                            source: 'dashboard-marketing'
                        });
                    } else if (messageText) {
                        await Messages.sendTextMessage(messageText, phone, { source: 'dashboard-marketing' });
                    }
                    console.log(`Mensaje enviado a ${phone} (${i+1}/${audience.length})`);
                } catch (err) {
                    console.error(`Error enviando a ${phone}: ${err.message}`);
                }
                
                // Delay to prevent getting banned or hitting rate limits (2 to 4 seconds)
                const randomDelay = Math.floor(Math.random() * 2000) + 2000;
                await delay(randomDelay);
            }
            console.log('Campaña finalizada.');
        };

        if (scheduledAt) {
            const timeDiff = new Date(scheduledAt).getTime() - Date.now();
            if (timeDiff > 0) {
                console.log(`Campaña programada para ejecutarse en ${Math.round(timeDiff/1000/60)} minutos.`);
                setTimeout(executeCampaign, timeDiff);
                return res.json({ success: true, message: 'Campaña programada correctamente', audienceCount: audience.length });
            }
        }
        
        // Ejecutar en segundo plano (asíncrono)
        executeCampaign();
        
        res.json({ success: true, message: 'Campaña en proceso de envío', audienceCount: audience.length });

    } catch (error) {
        console.log('Error en sendCampaign', error);
        res.status(500).json({ error: 'Error enviando campaña' });
    }
};

module.exports = {
    getServices,
    getAudience,
    sendCampaign
};
