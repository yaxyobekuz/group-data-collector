const Group = require("../models/Group");
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

/**
 * Botning guruhlardagi a'zoligi o'zgarishini kuzatadi.
 *
 * Telegram buni `my_chat_member` yangiligi orqali xabar qiladi — guruhdan
 * chiqarilganda, qayta qo'shilganda, admin qilinganda. Busiz bot guruhdan
 * chiqarilganini sezmaydi va o'sha guruhni nazoratda deb hisoblab,
 * har kuni "vazifa yuborilmagan" muammosini yozaveradi.
 *
 * MUHIM: bu yangilik turi polling'da standart holda KELMAYDI — uni
 * `allowedUpdates` ro'yxatida alohida so'rash kerak (index.js ga qarang).
 */
function registerMembership(bot) {
  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.update.my_chat_member;
    const chat = update?.chat;
    if (!chat || chat.type === "private") return;

    const status = update.new_chat_member?.status;
    // "left" — chiqarilgan/chiqib ketgan, "kicked" — bloklangan
    const removed = status === "left" || status === "kicked";

    if (removed) {
      await Group.findOneAndUpdate(
        { chatId: chat.id },
        { $set: { isActive: false, isMonitored: false } }
      );
      logger.warn(
        `Bot guruhdan chiqarildi: "${chat.title || chat.id}" (${chat.id}) — nazoratdan olindi`
      );
      return;
    }

    // Qayta qo'shildi yoki admin qilindi
    const isAdmin = status === "administrator";
    await Group.findOneAndUpdate(
      { chatId: chat.id },
      {
        $set: {
          title: chat.title || "",
          type: chat.type,
          isActive: true,
          isMonitored: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    logger.info(
      `Bot guruhga qo'shildi: "${chat.title || chat.id}" (${chat.id}), status=${status}`
    );

    // Admin bo'lmasa, bot xabarlarni to'liq ko'ra olmaydi
    if (!isAdmin) {
      try {
        await ctx.api.sendMessage({
          chat_id: chat.id,
          text:
            "Salom! Men maktab nazorat botiman. 👁\n\n" +
            "Bu guruh nazoratga olindi.\n\n" +
            "<b>Muhim:</b> barcha xabarlarni ko'rishim uchun meni " +
            "<b>admin</b> qilib belgilang.",
          parse_mode: "HTML",
        });
      } catch (err) {
        logger.error("Guruhga salom yuborilmadi:", err.message);
      }
    }
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

module.exports = { registerCollector, registerMembership, registerHandlers };
