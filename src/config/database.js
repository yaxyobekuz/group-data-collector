const mongoose = require("mongoose");
const config = require("./index");
const logger = require("../utils/logger");

async function connectDatabase() {
  mongoose.connection.on("connected", () => logger.info("MongoDB ulandi"));
  mongoose.connection.on("error", (err) => logger.error("MongoDB xatosi:", err.message));
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB uzildi"));

  await mongoose.connect(config.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
