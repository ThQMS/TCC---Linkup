const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const logger = require('../helpers/logger');

module.exports = function(passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
            try {
                const user = await User.findOne({ where: { email: email } });
                
                if (!user) {
                    return done(null, false, { message: 'E-mail ou senha incorretos.' });
                }

                const isMatch = await bcrypt.compare(password, user.password);

                if (!isMatch) {
                    logger.warn('passport', 'Falha de login: senha incorreta', { email });
                    return done(null, false, { message: 'Email ou senha incorretos.' });
                }

                return done(null, user);

            } catch (err) {
                logger.error('passport', 'Erro na autenticação local', { err: err.message });
                return done(err);
            }
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};