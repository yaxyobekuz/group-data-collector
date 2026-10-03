const Group = require("../models/Group");
const logger = require("../utils/logger");

/** Bot guruhda yo'qligini bildiradigan statuslar. */
const GONE = ["left", "kicked"];

/**
 * Bitta guruhda bot hali a'zomi — Telegram dan so'raydi.
 *
 * @returns {Promise<{alive:boolean, status:string|null, reason:string}>}
 */
async function checkGroup(api, chatId, botId) {
  try {
    const member = await api.getChatMember({ chat_id: chatId, user_id: botId });
    const status = member?.status || null;

    if (GONE.includes(status)) {
      return { alive: false, status, reason: "bot chiqarilgan" };
    }
    return { alive: true, status, reason: "" };
  } catch (err) {
    const text = err?.message || "";

    // "chat not found" — guruh o'chirilgan, supergruppaga o'tgan, yoki
    // bot ancha oldin chiqarilib, Telegram chatni unutgan
    if (/chat not found/i.test(text)) {
      return { alive: false, status: null, reason: "guruh topilmadi" };
    }
    // "bot was kicked" / "bot is not a member"
    if (/kicked|not a member|forbidden/i.test(text)) {
      return { alive: false, status: null, reason: "bot chiqarilgan" };
    }

    // Vaqtinchalik tarmoq xatosi bo'lishi mumkin — guruhni o'chirmaymiz
    return { alive: true, status: null, reason: "tekshirib bo'lmadi: " + text };
  }
}

/**
 * Barcha nazoratdagi guruhlarni tekshirib, bot chiqarilganlarini
 * nazoratdan oladi.
 *
 * Bu bot ishga tushganda chaqiriladi, chunki `my_chat_member` yangiligi
 * faqat bot ISHLAB TURGANDA keladi. Bot o'chiq paytda chiqarilgan bo'lsa,
 * o'sha yangilik yo'qoladi va guruh "nazoratda" bo'lib qolaveradi.
 *
 * @param {object} api bot.api
 * @param {number} botId
 * @param {boolean} quiet true bo'lsa — faqat tekshiradi, o'zgartirmaydi
 */
async function syncAll(api, botId, { quiet = false } = {}) {
  const groups = await Group.find({ isActive: true }).lean();
  const result = { checked: 0, removed: [], alive: 0, unknown: [] };

  for (const group of groups) {
    result.checked++;
    const check = await checkGroup(api, group.chatId, botId);

    if (check.alive) {
      if (check.reason) {
        // Tekshirib bo'lmadi — holatini o'zgartirmaymiz
        result.unknown.push({ group, reason: check.reason });
        logger.warn(`"${group.title}" tekshirilmadi: ${check.reason}`);
      } else {
        result.alive++;
      }
      continue;
    }

    result.removed.push({ group, reason: check.reason });

    if (!quiet) {
      await Group.updateOne(
        { chatId: group.chatId },
        { $set: { isActive: false, isMonitored: false } }
      );
      logger.warn(
        `"${group.title}" (${group.chatId}) nazoratdan olindi — ${check.reason}`
      );
    }
  }

  if (result.removed.length && !quiet) {
    logger.info(
      `A'zolik tekshiruvi: ${result.checked} guruhdan ${result.removed.length} tasi nazoratdan olindi`
    );
  }

  return result;
}

module.exports = { syncAll, checkGroup, GONE };
