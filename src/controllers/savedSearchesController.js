const SavedSearch = require('../models/SavedSearch');

exports.save = async (req, res) => {
    try {
        const { query, label } = req.body;
        if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query inválida.' });
        if (query.length > 200) return res.status(400).json({ error: 'Query muito longa.' });
        if (label && label.length > 100) return res.status(400).json({ error: 'Label muito longo.' });
        const existing = await SavedSearch.findOne({ where: { userId: req.user.id, query } });
        if (existing) return res.json({ ok: true, message: 'Busca já salva.' });
        await SavedSearch.create({ userId: req.user.id, query, label: label || query });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar busca.' });
    }
};

exports.list = async (req, res) => {
    try {
        const searches = await SavedSearch.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.render('saved-searches', { searches: searches.map(s => s.toJSON()) });
    } catch (err) {
        res.status(500).json({ error: 'Erro.' });
    }
};

exports.toggleAlert = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const search = await SavedSearch.findOne({ where: { id, userId: req.user.id } });
        if (!search) return res.status(404).json({ error: 'Não encontrado.' });
        search.alertEnabled = !search.alertEnabled;
        await search.save();
        res.json({ ok: true, alertEnabled: search.alertEnabled });
    } catch (err) {
        res.status(500).json({ error: 'Erro.' });
    }
};

exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await SavedSearch.destroy({ where: { id, userId: req.user.id } });
        req.flash('success_msg', 'Busca removida.');
        res.redirect('/searches');
    } catch (err) {
        req.flash('error_msg', 'Erro ao remover busca.');
        res.redirect('/searches');
    }
};
