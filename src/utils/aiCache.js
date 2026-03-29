const NodeCache = require('node-cache');

const aiCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

function getCacheKey(feature, ...args) {
    return `${feature}:${args.join(':')}`;
}

function getFromCache(feature, ...args) {
    return aiCache.get(getCacheKey(feature, ...args));
}

function setInCache(feature, value, ...args) {
    aiCache.set(getCacheKey(feature, ...args), value);
}

function invalidateCache(feature, ...args) {
    aiCache.del(getCacheKey(feature, ...args));
}

function getCacheStats() {
    return aiCache.getStats();
}

module.exports = { getFromCache, setInCache, invalidateCache, getCacheStats };