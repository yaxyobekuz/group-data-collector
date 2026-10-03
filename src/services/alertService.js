const Issue = require("../models/Issue");
const roleService = require("./roleService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

const SEVERITY_ICON = { 1: "⚪️", 2: "🟡", 3: "🟠", 4: "🔴", 5: "🆘" };

// Bir xabarda nechta muammo yuboriladi. Oshib ketsa — qolgani keyingi
// tekshiruvda ketadi, xabar juda uzun bo'lib qolmasligi uchun.
const MAX_PER_ALERT = 10;

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Vaqtni "14:35" ko'rinishida (maktab vaqt zonasida). */
function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-GB", {
    timeZone: require("../config").timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Hali yuborilmagan muammolardan xabar matnini tuzadi.
 * @param {Array} issues
 */
function buildAlert(issues) {
  const complaints = issues.filter((i) => i.type === "parent_complaint");
  const noHomework = issues.filter((i) => i.type === "no_homework");

  const title =
    issues.length === 1 ? "🔔 <b>Yangi muammo</b>" : `🔔 <b>Yangi muammolar (${issues.length})</b>`;

  const parts = [title, ""];

  for (const issue of complaints) {
    const icon = SEVERITY_ICON[issue.severity] || "🟠";
    parts.push(
      `${icon} <b>${escapeHtml(issue.groupTitle || issue.chatId)}</b> — ${escapeHtml(issue.userName)}`,
      `   ${escapeHtml(issue.summary)}`,
      `   <i>${formatTime(issue.createdAt)}</i>`,
      ""
    );
  }

  for (const issue of noHomework) {
    parts.push(
      `📚 <b>${escapeHtml(issue.groupTitle || issue.chatId)}</b>`,
      `   Vazifa yuborilmagan — ${escapeHtml(issue.userName)}`,
      ""
    );
  }

  return parts.join("\n").trim();
}

/**
 * Hali yuborilmagan muammolarni topib, owner va adminlarga darhol yuboradi.
 *
 * `reported` bayrog'i takrorlanishni to'xtatadi: bir marta yuborilgan muammo
 * ertalabki hisobotda yana ko'rinadi, lekin shoshilinch xabar sifatida
 * ikkinchi marta kelmaydi.
 *
 * @param {object} api bot.api
 * @param {string} localDate
 */
async function sendPendingAlerts(api, localDate = dates.localDate()) {
  const result = { found: 0, sent: 0, recipients: 0 };

  const pending = await Issue.find({ localDate, reported: false })
    .sort({ severity: -1, createdAt: 1 })
    .limit(MAX_PER_ALERT)
    .lean();

  result.found = pending.length;
  if (!pending.length) return result;

  const text = buildAlert(pending);
  const recipients = await roleService.reportRecipients();
  result.recipients = recipients.length;

  for (const chatId of recipients) {
    try {
      await api.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" });
      result.sent++;
    } catch (err) {
      logger.error(`Shoshilinch xabar yuborilmadi (${chatId}):`, err.message);
    }
  }

  // Yuborilgan deb belgilaymiz — hatto hech kimga yetib bormagan bo'lsa ham,
  // aks holda har 30 daqiqada bir xil xabar qayta-qayta urinib ketadi.
  await Issue.updateMany(
    { _id: { $in: pending.map((i) => i._id) } },
    { $set: { reported: true } }
  );

  logger.info(
    `Shoshilinch xabar: ${result.found} muammo, ${result.sent}/${result.recipients} odamga yuborildi`
  );

  return result;
}

module.exports = { sendPendingAlerts, buildAlert, MAX_PER_ALERT };
