const { Bot } = require("node-telegram-bot-api");
const config = require("./config");
const middleware = require("./handlers/middleware");
const commands = require("./handlers/commands");
const messages = require("./handlers/messages");

function createBot() {
  const bot = new Bot(config.botToken, {
    // 429 va tarmoq xatolari avtomatik qayta urinadi; throttle bilan limitga tushmaymiz
    rateLimit: { global: 30, perChat: 1 },
  });

  // Tartib muhim: logger -> yig'uvchi -> buyruqlar -> qolgan xabarlar
  middleware.register(bot);
  messages.registerCollector(bot);
  commands.register(bot);
  messages.registerHandlers(bot);

  return bot;
}

module.exports = { createBot };
