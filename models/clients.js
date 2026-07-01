const almacenamiento = require('./clientes/almacenamiento');
const campaignAlmacenamiento = require('./campaigns/almacenamiento');
const { parseCampaignAttribution } = require('../utils/campaignAttribution');

const verifyStoreClient = async (telefono, nombre, mensaje, options = {}) => {
    const attribution = parseCampaignAttribution(mensaje);
    let campaign = null;
    let isNewLead = false;

    if (attribution.leadCode) {
        campaign = await campaignAlmacenamiento.getCampaignByLeadCode(attribution.leadCode);
    } else if (attribution.campaignId) {
        campaign = await campaignAlmacenamiento.getCampaign(attribution.campaignId);
    }

    const campaignId = campaign?.id || null;
    const cleanMessage = campaignId ? attribution.cleanMessage : String(mensaje || '');

    if (campaignId) {
        try {
            isNewLead = await campaignAlmacenamiento.registerCampaignLead(campaignId, telefono);
        } catch (error) {
            console.log('Error al registrar lead de campana:', error.message);
        }
    }

    const client = await almacenamiento.getClient(telefono);
    if (!client) {
        await almacenamiento.saveClient({
            phoneNumber: telefono,
            name: nombre,
            campaignId
        });
    } else if (campaignId && !client.campaignId) {
        client.campaignId = campaignId;
        await almacenamiento.saveClient(client);
    }



    if (options.returnAttribution) {
        return {
            cleanMessage,
            originalMessage: String(mensaje || ''),
            attribution: campaignId ? {
                campaignId,
                leadCode: attribution.leadCode,
                isNewLead
            } : null
        };
    }

    return cleanMessage;
};

module.exports = { verifyStoreClient };
