const DEFAULT_PEOPLE_OPTIONS = [1, 2, 3];

const normalizePrices = (prices) => (Array.isArray(prices) ? prices : [])
    .map((item) => ({
        personas: Number(item?.personas),
        precio: Number(item?.precio),
        exclusivo: item?.exclusivo === true
    }))
    .filter((item) => Number.isInteger(item.personas) && item.personas > 0 && Number.isFinite(item.precio));

const getExclusivePeopleOptions = (prices) => Array.from(new Set(
    normalizePrices(prices)
        .filter((item) => item.exclusivo)
        .map((item) => item.personas)
)).sort((a, b) => a - b);

const getAllowedPeopleOptions = (prices) => {
    const normalized = normalizePrices(prices);
    if(!normalized.length) return DEFAULT_PEOPLE_OPTIONS;

    const hasRegularOption = normalized.some((item) => !item.exclusivo);
    const options = hasRegularOption
        ? normalized.map((item) => item.personas)
        : getExclusivePeopleOptions(normalized);
    return Array.from(new Set(options)).sort((a, b) => a - b);
};

const isPeopleAllowed = (prices, people) => getAllowedPeopleOptions(prices).includes(Number(people));

const getPriceForPeople = (prices, people) => normalizePrices(prices)
    .find((item) => item.personas === Number(people))?.precio ?? null;

module.exports = {
    DEFAULT_PEOPLE_OPTIONS,
    normalizePrices,
    getExclusivePeopleOptions,
    getAllowedPeopleOptions,
    isPeopleAllowed,
    getPriceForPeople
};
