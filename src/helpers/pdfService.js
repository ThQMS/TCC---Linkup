const htmlPdf = require('html-pdf-node');

const PDF_OPTIONS = {
    format:          'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
};

async function generatePdf(html, overrides = {}) {
    return htmlPdf.generatePdf({ content: html }, { ...PDF_OPTIONS, ...overrides });
}

module.exports = { generatePdf };
