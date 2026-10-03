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

  // Tartib muhim: logger -> a'zolik -> yig'uvchi -> buyruqlar -> qolganlar
  middleware.register(bot);
  // A'zolik o'zgarishi (guruhdan chiqarish/qo'shish) — alohida yangilik turi,
  // xabarlar zanjiriga aralashmaydi
  messages.registerMembership(bot);
  messages.registerCollector(bot);
  commands.register(bot);
  messages.registerHandlers(bot);

  return bot;
}

module.exports = { createBot };
