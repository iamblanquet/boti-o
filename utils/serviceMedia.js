const { normalizeText } = require('./configCitas');

const SERVICE_MEDIA = [
    { file: 'hydratation.jpeg', keywords: ['lumi piel', 'hidratacion', 'hidratante', 'chocolate facial'] },
    { file: 'chocolaterapiaforher.jpeg', keywords: ['chocolaterapia', 'chocolaterapia for her'] },
    { file: 'membresiatop.jpeg', keywords: ['royal skin', 'membresia top', 'membresia', 'hifu', 'pdrn'] },
    { file: 'dermafacial.jpeg', keywords: ['seda effect', 'dermaplaning', 'dermafacial'] },
    { file: 'facialandbodyrelax.jpeg', keywords: ['soft harmony'] }
];

const findMediaForText = (...texts) => {
    const content = normalizeText(texts.join(' '));
    const files = new Set();

    SERVICE_MEDIA.forEach((item) => {
        const hasMatch = item.keywords.some((keyword) => content.includes(normalizeText(keyword)));
        if(hasMatch) files.add(item.file);
    });

    return Array.from(files);
}

module.exports = { findMediaForText }
