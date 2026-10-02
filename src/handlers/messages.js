const collectorService = require("../services/collectorService");
const roleService = require("../services/roleService");
const logger = require("../utils/logger");

/**
 * Yig'uvchi middleware.
 *
 * MUHIM: koa-compose semantikasi — handler `next()` chaqirmasa, zanjir
 * to'xtaydi. Shuning uchun yig'ish buyruqlardan OLDIN ro'yxatdan o'tadi va
 * oxirida `next()` chaqiradi.
 */
function registerCollector(bot) {
  bot.use(async (ctx, next) => {
    const message = ctx.message;

    if (message?.chat) {
      try {
        if (message.chat.type === "private") {
          // Shaxsiy chatda xabar saqlanmaydi, lekin foydalanuvchi bazaga
          // yoziladi — owner uni /setadmin qila olishi uchun
          await roleService.touchUser(message.from);
        } else {
          await collectorService.collect(message);
        }
      } catch (err) {
        // Yig'ishdagi xato buyruqlar ishlashiga to'sqinlik qilmasin
        logger.error("Xabar saqlashda xato:", err.message);
      }
    }

    await next();
  });
}

/** Buyruq bo'lmagan xabarlar uchun handlerlar (buyruqlardan KEYIN). */
function registerHandlers(bot) {
  // Bot guruhga qo'shilganda
  bot.on("message", async (ctx, next) => {
    const newMembers = ctx.message?.new_chat_members;
    if (!newMembers?.length) {
      await next();
      return;
    }

    const me = await ctx.api.getMe();
    const botAdded = newMembers.some((member) => member.id === me.id);

    if (botAdded) {
      await ctx.reply(
        "Salom! Men maktab nazorat botiman. 👁\n\n" +
          "Bu guruh nazoratga olindi. Har kuni kechasi 23:00 da uyga vazifa " +
          "yuborilganini tekshiraman.\n\n" +
          "<b>Muhim:</b> barcha xabarlarni ko'rishim uchun meni " +
          "<b>admin</b> qilib belgilang.",
        { parse_mode: "HTML" }
      );
    }
  });

  // Shaxsiy chatda noma'lum xabar
  bot.on("message", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const text = ctx.message?.text;
    if (!text || text.startsWith("/")) return;

    await ctx.reply("Buyruqlar ro'yxati: /help");
  });
}

module.exports = { registerCollector, registerHandlers };
