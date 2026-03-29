const path   = require('path');
const exphbs = require('express-handlebars');
const helpers = require('../helpers/handlebars-helpers');

module.exports = function setupHandlebars(app) {
    app.engine('handlebars', exphbs.create({
        defaultLayout: 'main',
        extname:       '.handlebars',
        helpers,
        allowProtoPropertiesByDefault: false,
        allowProtoMethodsByDefault:    false,
        partialsDir: path.join(__dirname, '../../views/partials')
    }).engine);
    app.set('view engine', 'handlebars');
    app.set('views', path.join(__dirname, '../../views'));
};
