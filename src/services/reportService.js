const Issue = require("../models/Issue");
const Group = require("../models/Group");
const roleService = require("./roleService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

// Telegram xabar chegarasi 4096; zaxira qoldiramiz
const MAX_LEN = 3800;

const SEVERITY_ICON = { 1: "⚪️", 2: "🟡", 3: "🟠", 4: "🔴", 5: "🆘" };

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Kun uchun hisobot matnini tuzadi.
 * @returns {Promise<{text:string, count:number}>}
 */
async function buildReport(localDate = dates.localDate()) {
  const issues = await Issue.find({ localDate }).sort({ severity: -1 }).lean();
  const header = `📋 <b>Kunlik hisobot</b>\n${dates.formatDate(localDate)}\n`;

  if (issues.length === 0) {
    const groupCount = await Group.countDocuments({ isMonitored: true, isActive: true });
    return {
      text:
        header +
        `\n✅ Muammo topilmadi.\n\n${groupCount} guruh tekshirildi — barcha o'qituvchilar vazifa yuborgan, ota-onalardan shikoyat yo'q.`,
      count: 0,
    };
  }

  const noHomework = issues.filter((i) => i.type === "no_homework");
  const complaints = issues.filter((i) => i.type === "parent_complaint");

  const parts = [
    header,
    `\n<b>Jami: ${issues.length} muammo</b>`,
    `• Vazifa yuborilmagan: ${noHomework.length}`,
    `• Ota-ona shikoyati: ${complaints.length}`,
  ];

  if (noHomework.length) {
    parts.push(`\n\n📚 <b>VAZIFA YUBORILMAGAN (${noHomework.length})</b>`);
    for (const issue of noHomework) {
      parts.push(
        `\n🔴 <b>${escapeHtml(issue.groupTitle || issue.chatId)}</b>\n` +
          `   O'qituvchi: ${escapeHtml(issue.userName)}`
      );
    }
  }

  if (complaints.length) {
    parts.push(`\n\n⚠️ <b>OTA-ONA SHIKOYATLARI (${complaints.length})</b>`);
    for (const issue of complaints) {
      const icon = SEVERITY_ICON[issue.severity] || "🟠";
      // Asl xabar matni ko'rsatilmaydi — muammo mohiyati va kim yozgani yetarli.
      // (Matn bazada `excerpt` da saqlanadi, kerak bo'lsa qarash mumkin.)
      parts.push(
        `\n${icon} <b>${escapeHtml(issue.groupTitle || issue.chatId)}</b> — ${escapeHtml(issue.userName)}\n` +
          `   ${escapeHtml(issue.summary)}`
      );
    }
  }

  let text = parts.join("\n");
  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN) + "\n\n<i>…hisobot qisqartirildi</i>";
  }

  return { text, count: issues.length };
}

/**
 * Hisobotni owner va adminlarga yuboradi.
 * @param {import("node-telegram-bot-api").Api} api
 */
async function sendReport(api, localDate = dates.localDate()) {
  const { text, count } = await buildReport(localDate);
  const recipients = await roleService.reportRecipients();

  let sent = 0;
  for (const chatId of recipients) {
    try {
      await api.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" });
      sent++;
    } catch (err) {
      // Bir odam botni bloklagan bo'lsa, qolganlarga yuborishni davom etamiz
      logger.error(`Hisobot yuborilmadi (${chatId}):`, err.message);
    }
  }

  await Issue.updateMany({ localDate }, { $set: { reported: true } });
  logger.info(`Hisobot yuborildi: ${sent}/${recipients.length} odamga, ${count} muammo`);

  return { sent, total: recipients.length, count };
}

module.exports = { buildReport, sendReport };
