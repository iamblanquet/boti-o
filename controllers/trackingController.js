const campaignStorage = require('../models/campaigns/almacenamiento');
const CampaignFunnel = require('../models/campaigns/funnelService');
const {
    normalizeLeadCode,
    generateLeadCode,
    getCampaignLeadCode,
    buildAttributedMessage
} = require('../utils/campaignAttribution');

const getBotPhone = () => String(process.env.WHATSAPP_BOT_PHONE || '').replace(/\D/g, '');

const withCampaignUrls = (_req, campaign) => {
    const botPhone = getBotPhone();
    const leadCode = getCampaignLeadCode(campaign);

    return {
        ...campaign,
        leadCode,
        whatsappUrl: botPhone
            ? `https://wa.me/${botPhone}?text=${encodeURIComponent(buildAttributedMessage({ ...campaign, leadCode }))}`
            : null
    };
};

const redirectCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const campaign = await campaignStorage.getCampaign(campaignId);
        const botPhone = getBotPhone();

        if (!campaign) {
            console.log(`Campana no encontrada para redireccion: ${campaignId}`);
            return res.redirect(botPhone ? `https://wa.me/${botPhone}` : '/home');
        }

        if (!botPhone) {
            return res.status(400).send('Error: El numero de telefono del bot no esta configurado.');
        }

        await campaignStorage.incrementCampaignClicks(campaignId);

        return res.redirect(`https://wa.me/${botPhone}?text=${encodeURIComponent(buildAttributedMessage(campaign))}`);
    } catch (error) {
        console.error('Error en redirectCampaign:', error);
        return res.redirect('/home');
    }
};

const listCampaigns = async (req, res) => {
    try {
        const campaigns = await campaignStorage.listCampaigns();
        const campaignsWithMetrics = await CampaignFunnel.attachMetrics(campaigns);
        return res.json(campaignsWithMetrics.map((campaign) => withCampaignUrls(req, campaign)));
    } catch (error) {
        console.error('Error en listCampaigns:', error);
        return res.status(500).json({ error: 'Error al listar las campanas.' });
    }
};

const createCampaign = async (req, res) => {
    try {
        const { id, leadCode, name, source, medium, prefilledText } = req.body || {};
        if (!id || !name || !source || !String(prefilledText || '').trim()) {
            return res.status(400).json({
                error: 'Faltan campos obligatorios: id, name, source y prefilledText.'
            });
        }

        const cleanId = String(id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!cleanId) {
            return res.status(400).json({ error: 'El ID de campana contiene caracteres no validos.' });
        }

        const existing = await campaignStorage.getCampaign(cleanId);
        if (existing) {
            return res.status(409).json({ error: 'Ya existe una campana con ese codigo corto.' });
        }

        const cleanLeadCode = normalizeLeadCode(leadCode) || generateLeadCode(cleanId);
        const existingLeadCode = await campaignStorage.getCampaignByLeadCode(cleanLeadCode);
        if (existingLeadCode) {
            return res.status(409).json({ error: `El codigo de lead #${cleanLeadCode} ya esta en uso.` });
        }

        const campaign = await campaignStorage.saveCampaign({
            id: cleanId,
            leadCode: cleanLeadCode,
            name: String(name).trim(),
            source: String(source).trim(),
            medium: String(medium || '').trim() || null,
            prefilledText: String(prefilledText).trim()
        });

        return res.status(201).json({
            success: true,
            campaign: withCampaignUrls(req, campaign)
        });
    } catch (error) {
        console.error('Error en createCampaign:', error);
        return res.status(500).json({ error: 'Error al crear la campana.' });
    }
};

const deleteCampaign = async (req, res) => {
    try {
        await campaignStorage.deleteCampaign(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error en deleteCampaign:', error);
        return res.status(500).json({ error: 'Error al eliminar la campana.' });
    }
};

module.exports = {
    redirectCampaign,
    listCampaigns,
    createCampaign,
    deleteCampaign
};
