const redis = require('redis');

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
let cachedClient = null;

const store = new Map();
const expires = new Map();
const sets = new Map();

const memoryClient = {
    async get(key){
        const expiresAt = expires.get(key);
        if(expiresAt && expiresAt <= Date.now()){
            store.delete(key);
            expires.delete(key);
            return null;
        }
        return store.get(key) || null;
    },
    async set(key, value){
        store.set(key, String(value));
        return 'OK';
    },
    async del(key){
        store.delete(key);
        expires.delete(key);
        sets.delete(key);
        return 1;
    },
    async sAdd(key, value){
        if(!sets.has(key)) sets.set(key, new Set());
        sets.get(key).add(String(value));
        return 1;
    },
    async sRem(key, value){
        if(!sets.has(key)) return 0;
        return sets.get(key).delete(String(value)) ? 1 : 0;
    },
    async sMembers(key){
        return Array.from(sets.get(key) || []);
    },
    async expire(key, seconds){
        expires.set(key, Date.now() + (Number(seconds) * 1000));
        return 1;
    }
}

const redisClient = async () => {
    if(cachedClient) return cachedClient;

    if(!REDIS_HOST || !REDIS_PORT){
        console.log('Redis no configurado. Usando memoria temporal.');
        cachedClient = memoryClient;
        return memoryClient;
    }

    const client = redis.createClient({
        password: REDIS_PASSWORD,
        socket: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            connectTimeout: 3000,
            reconnectStrategy: false
        }
    });
    client.on('error', err => console.log('Redis error', err));
    try {
        await client.connect();
        cachedClient = client;
        return client
    } catch (error) {
        console.log('No se pudo conectar a Redis. Usando memoria temporal.', error.message);
        cachedClient = memoryClient;
        return memoryClient;
    }
}

module.exports = redisClient;
