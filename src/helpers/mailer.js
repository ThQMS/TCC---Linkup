const nodemailer = require('nodemailer');
const logger     = require('./logger');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

transporter.verify((err) => {
    if (err) logger.warn('mailer', 'E-mail não configurado corretamente', { err: err.message });
    else     logger.info('mailer', 'Serviço de e-mail pronto');
});

module.exports = transporter;
