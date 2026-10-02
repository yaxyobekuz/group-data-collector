const logger = require("../utils/logger");

function register(bot) {
  // Har bir update uchun vaqtni o'lchaymiz
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    logger.debug(`update ${ctx.update.update_id} — ${Date.now() - start}ms`);
  });

  // Oxirgi xato tutuvchi: xato bo'lsa bot to'xtamaydi
  bot.catch((err, ctx) => {
    logger.error(`Handler xatosi (update ${ctx.update.update_id}):`, err);
  });
}

module.exports = { register };
