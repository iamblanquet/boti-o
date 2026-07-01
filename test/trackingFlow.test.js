const test = require('node:test');
const assert = require('node:assert/strict');

const campaignStorage = require('../models/campaigns/almacenamiento');
const clientStorage = require('../models/clientes/almacenamiento');
const clientModel = require('../models/clients');
const trackingController = require('../controllers/trackingController');
const FunnelRepository = require('../models/campaigns/funnelRepository');
const CampaignFunnel = require('../models/campaigns/funnelService');
const {
    buildAttributedMessage,
    parseCampaignAttribution
} = require('../utils/campaignAttribution');

const createResponse = () => ({
    statusCode: 200,
    body: null,
    redirectUrl: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
    send(payload) {
        this.body = payload;
        return this;
    },
    redirect(url) {
        this.redirectUrl = url;
        return this;
    }
});

test('campaign list exposes a direct WhatsApp lead URL', async () => {
    const originalList = campaignStorage.listCampaigns;
    const originalBotPhone = process.env.WHATSAPP_BOT_PHONE;
    campaignStorage.listCampaigns = async () => [{
        id: 'promo-test',
        name: 'Promo',
        source: 'facebook',
        leadCode: 'PL01',
        prefilledText: 'Hola'
    }];
    process.env.WHATSAPP_BOT_PHONE = '5219991234567';

    try {
        const req = {
            protocol: 'https',
            get: () => 'example.test'
        };
        const res = createResponse();

        await trackingController.listCampaigns(req, res);

        assert.equal(res.statusCode, 200);
        assert.match(res.body[0].whatsappUrl, /^https:\/\/wa\.me\//);
        assert.match(decodeURIComponent(res.body[0].whatsappUrl), /#PL01$/);
    } finally {
        campaignStorage.listCampaigns = originalList;
        process.env.WHATSAPP_BOT_PHONE = originalBotPhone;
    }
});

test('short link counts the click and redirects with campaign attribution', async () => {
    const originalGet = campaignStorage.getCampaign;
    const originalIncrement = campaignStorage.incrementCampaignClicks;
    const originalBotPhone = process.env.WHATSAPP_BOT_PHONE;
    let incrementedCampaign = null;

    campaignStorage.getCampaign = async () => ({
        id: 'promo-test',
        leadCode: 'PL01',
        prefilledText: 'Hola desde anuncio'
    });
    campaignStorage.incrementCampaignClicks = async (id) => {
        incrementedCampaign = id;
    };
    process.env.WHATSAPP_BOT_PHONE = '+52 1 999 123 4567';

    try {
        const res = createResponse();
        await trackingController.redirectCampaign({
            params: { campaignId: 'promo-test' }
        }, res);

        assert.equal(incrementedCampaign, 'promo-test');
        assert.match(res.redirectUrl, /^https:\/\/wa\.me\/5219991234567\?text=/);
        assert.match(decodeURIComponent(res.redirectUrl), /#PL01$/);
    } finally {
        campaignStorage.getCampaign = originalGet;
        campaignStorage.incrementCampaignClicks = originalIncrement;
        process.env.WHATSAPP_BOT_PHONE = originalBotPhone;
    }
});

test('short attribution code is appended and removed from the useful message', () => {
    const outgoing = buildAttributedMessage({
        id: 'promo-laser',
        leadCode: 'PL01',
        prefilledText: 'Hola, me gustaria informacion sobre la depilacion laser'
    });
    const parsed = parseCampaignAttribution(outgoing);

    assert.equal(outgoing, 'Hola, me gustaria informacion sobre la depilacion laser #PL01');
    assert.equal(parsed.leadCode, 'PL01');
    assert.equal(parsed.cleanMessage, 'Hola, me gustaria informacion sobre la depilacion laser');
});

test('legacy reference remains supported', () => {
    const parsed = parseCampaignAttribution('Hola (ref:promo-laser)');

    assert.equal(parsed.campaignId, 'promo-laser');
    assert.equal(parsed.cleanMessage, 'Hola');
});

test('valid lead code registers the campaign and returns a clean chat message', async () => {
    const originalGetByCode = campaignStorage.getCampaignByLeadCode;
    const originalRegisterLead = campaignStorage.registerCampaignLead;
    const originalGetClient = clientStorage.getClient;
    const originalSaveClient = clientStorage.saveClient;
    let registeredLead = null;
    let savedClient = null;

    campaignStorage.getCampaignByLeadCode = async (code) => (
        code === 'PL01' ? { id: 'promo-laser', leadCode: code } : null
    );
    campaignStorage.registerCampaignLead = async (campaignId, phoneNumber) => {
        registeredLead = { campaignId, phoneNumber };
        return true;
    };
    clientStorage.getClient = async () => null;
    clientStorage.saveClient = async (client) => {
        savedClient = client;
        return client;
    };

    try {
        const cleanMessage = await clientModel.verifyStoreClient(
            '5219991234567',
            'Cliente',
            'Hola, quiero informacion #PL01'
        );

        assert.equal(cleanMessage, 'Hola, quiero informacion');
        assert.deepEqual(registeredLead, {
            campaignId: 'promo-laser',
            phoneNumber: '5219991234567'
        });
        assert.equal(savedClient.campaignId, 'promo-laser');
    } finally {
        campaignStorage.getCampaignByLeadCode = originalGetByCode;
        campaignStorage.registerCampaignLead = originalRegisterLead;
        clientStorage.getClient = originalGetClient;
        clientStorage.saveClient = originalSaveClient;
    }
});

test('lead attribution details preserve the original coded message for auditing', async () => {
    const originalGetByCode = campaignStorage.getCampaignByLeadCode;
    const originalRegisterLead = campaignStorage.registerCampaignLead;
    const originalGetClient = clientStorage.getClient;

    campaignStorage.getCampaignByLeadCode = async () => ({
        id: 'promo-laser',
        leadCode: 'PL01'
    });
    campaignStorage.registerCampaignLead = async () => true;
    clientStorage.getClient = async () => ({ phoneNumber: '5219991234567', campaignId: 'promo-laser' });

    try {
        const result = await clientModel.verifyStoreClient(
            '5219991234567',
            'Cliente',
            'Hola, quiero informacion #PL01',
            { returnAttribution: true }
        );

        assert.equal(result.originalMessage, 'Hola, quiero informacion #PL01');
        assert.equal(result.cleanMessage, 'Hola, quiero informacion');
        assert.deepEqual(result.attribution, {
            campaignId: 'promo-laser',
            leadCode: 'PL01',
            isNewLead: true
        });
    } finally {
        campaignStorage.getCampaignByLeadCode = originalGetByCode;
        campaignStorage.registerCampaignLead = originalRegisterLead;
        clientStorage.getClient = originalGetClient;
    }
});

test('campaign list derives local lead totals from unique registered phones', async () => {
    const campaigns = await campaignStorage.listCampaigns();
    const campaign = campaigns.find(({ id }) => id === 'test-ad-123');

    if (campaign) {
        assert.equal(campaign.leadsCount, 1);
    }
});

test('campaign funnel exposes percentages using leads as the common base', async () => {
    const originalGetLeadDetailsByCampaign = FunnelRepository.getLeadDetailsByCampaign;
    FunnelRepository.getLeadDetailsByCampaign = async () => new Map([[
        'promo-laser',
        [
            ...Array.from({ length: 3 }, (_, index) => ({
                phoneNumber: `521999000000${index}`,
                contacted: true,
                appointmentCreated: true,
                captured: true
            })),
            ...Array.from({ length: 2 }, (_, index) => ({
                phoneNumber: `521999000001${index}`,
                contacted: true,
                appointmentCreated: true,
                captured: false
            })),
            ...Array.from({ length: 3 }, (_, index) => ({
                phoneNumber: `521999000002${index}`,
                contacted: true,
                appointmentCreated: false,
                captured: false
            })),
            ...Array.from({ length: 2 }, (_, index) => ({
                phoneNumber: `521999000003${index}`,
                contacted: false,
                appointmentCreated: false,
                captured: false
            }))
        ]
    ]]);

    try {
        const [campaign] = await CampaignFunnel.attachMetrics([{
            id: 'promo-laser',
            leadsCount: 10
        }]);

        assert.deepEqual({
            leadsCount: campaign.funnel.leadsCount,
            leadsRate: campaign.funnel.leadsRate,
            contactedCount: campaign.funnel.contactedCount,
            appointmentsCount: campaign.funnel.appointmentsCount,
            capturedCount: campaign.funnel.capturedCount,
            contactedRate: campaign.funnel.contactedRate,
            appointmentsRate: campaign.funnel.appointmentsRate,
            capturedRate: campaign.funnel.capturedRate
        }, {
            leadsCount: 10,
            leadsRate: 100,
            contactedCount: 8,
            appointmentsCount: 5,
            capturedCount: 3,
            contactedRate: 80,
            appointmentsRate: 50,
            capturedRate: 30
        });
        assert.equal(campaign.funnel.leads.length, 10);
        assert.deepEqual(campaign.metrics, {
            total_leads: 10,
            contacted: 8,
            appointments: 5,
            captured: 3
        });
    } finally {
        FunnelRepository.getLeadDetailsByCampaign = originalGetLeadDetailsByCampaign;
    }
});

test('confirmed appointment records generated and captured funnel stages', async () => {
    const originalFindLead = FunnelRepository.findLeadForPhone;
    const originalRegisterEvent = FunnelRepository.registerEvent;
    const stages = [];

    FunnelRepository.findLeadForPhone = async () => ({
        campaignId: 'promo-laser',
        phoneNumber: '5219991234567'
    });
    FunnelRepository.registerEvent = async (event) => {
        stages.push(event.stage);
        return true;
    };

    try {
        await CampaignFunnel.recordAppointment({
            id: '11111111-1111-4111-8111-111111111111',
            phoneNumber: '5219991234567',
            status: 'confirmada',
            createdAt: '2026-06-15T10:00:00.000Z',
            confirmedAt: '2026-06-15T11:00:00.000Z'
        });

        assert.deepEqual(stages, ['appointment_created', 'captured']);
    } finally {
        FunnelRepository.findLeadForPhone = originalFindLead;
        FunnelRepository.registerEvent = originalRegisterEvent;
    }
});
