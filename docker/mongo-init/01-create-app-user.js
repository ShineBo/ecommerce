// Executed by the Mongo image only when its data volume is empty.
const databaseName = process.env.MONGO_DB_NAME;
const applicationDatabase = db.getSiblingDB(databaseName);
applicationDatabase.createUser({ user: process.env.MONGO_APP_USERNAME, pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: 'readWrite', db: databaseName }] });
applicationDatabase.createCollection('products');
