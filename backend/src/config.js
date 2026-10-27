import path from 'node:path';

export const LIMITS = Object.freeze({
  maxQuantity: 99,
  maxCartLines: 50,
  maxPriceMinor: 10_000_000,
});
export const SESSION_HOURS = 8;

export function readConfig(env = process.env) {
  const required = ['SESSION_SECRET', 'MONGO_APP_USERNAME', 'MONGO_APP_PASSWORD', 'MONGO_DB_NAME'];
  for (const name of required) if (!env[name]) throw new Error(`Missing configuration: ${name}`);
  if (env.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET must be at least 32 characters');
  const database = env.MONGO_DB_NAME;
  if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Invalid MONGO_DB_NAME');
  const sessionCookieName = env.SESSION_COOKIE_NAME || 'simple_shop.sid';
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(sessionCookieName))
    throw new Error('Invalid SESSION_COOKIE_NAME');
  const demoMode = env.PAYMENT_DEMO_MODE !== 'false';
  if (
    !demoMode &&
    ['BANK_NAME', 'BANK_ACCOUNT_NAME', 'BANK_ACCOUNT_NUMBER'].some((key) => !env[key])
  ) {
    throw new Error('Bank display details are required when PAYMENT_DEMO_MODE=false');
  }
  const positive = (name, fallback) => {
    const value = Number(env[name] || fallback);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`Invalid configuration: ${name}`);
    return value;
  };
  const pluginPort = positive('PLUGIN_PORT', 50001);
  const pluginTimeout = positive('PLUGIN_TIMEOUT_MS', 1500);
  if (pluginPort > 65535 || pluginTimeout > 5000)
    throw new Error('Invalid plug-in port or timeout');
  return {
    studyKit: {
      enabled: env.STUDY_KIT_ENABLED !== 'false',
      host: env.PLUGIN_HOST || 'study-kit-plugin',
      port: pluginPort,
      timeoutMs: pluginTimeout,
    },
    port: positive('PORT', 3000),
    origin: env.APP_ORIGIN || 'http://localhost:8080',
    mongoUri: `mongodb://${encodeURIComponent(env.MONGO_APP_USERNAME)}:${encodeURIComponent(env.MONGO_APP_PASSWORD)}@${env.MONGO_HOST || 'mongodb'}:${env.MONGO_PORT || '27017'}/${database}?authSource=${database}`,
    database,
    sessionSecret: env.SESSION_SECRET,
    sessionCookieName,
    cookieSecure: env.COOKIE_SECURE === 'true',
    uploadDir: path.resolve(env.UPLOAD_DIR || 'storage/slips'),
    maxSlipBytes: positive('MAX_SLIP_BYTES', 5242880),
    currency: env.STORE_CURRENCY || 'THB',
    demoMode,
    bank: {
      name: env.BANK_NAME || 'Demo bank',
      accountName: env.BANK_ACCOUNT_NAME || 'Simple Shop (demonstration)',
      accountNumber: env.BANK_ACCOUNT_NUMBER || '000-0-00000-0',
    },
    seedDemo: env.SEED_DEMO_DATA === 'true',
    demoPassword: env.DEMO_CUSTOMER_PASSWORD,
    authRateLimit: positive('AUTH_RATE_LIMIT', 20),
    orderRateLimit: positive('ORDER_RATE_LIMIT', 10),
    apiRateLimit: positive('API_RATE_LIMIT', 120),
  };
}
