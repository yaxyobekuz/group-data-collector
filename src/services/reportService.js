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
  // Faqat hozir nazoratdagi guruhlar. Bot guruhdan chiqarilgan bo'lsa,
  // uning eski muammolari bazada qoladi, lekin hisobotda ko'rinmasligi
  // kerak — aks holda chiqarilgan guruh har kuni ro'yxatda turaveradi.
  const monitored = await Group.find({ isMonitored: true, isActive: true })
    .select("chatId")
    .lean();
  const chatIds = monitored.map((g) => g.chatId);

  const issues = await Issue.find({ localDate, chatId: { $in: chatIds } })
    .sort({ severity: -1 })
    .lean();
  const header = `📋 <b>Kunlik hisobot</b>\n${dates.formatDate(localDate)}\n`;

  if (issues.length === 0) {
    const groupCount = monitored.length;
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

/** Ball bo'yicha belgi. */
function scoreIcon(score) {
  if (score >= 85) return "🟢";
  if (score >= 70) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
}

/** Daqiqani o'qilishi oson shaklga keltiradi. */
function formatDelay(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${minutes} daqiqa`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours} soat`;
}

/**
 * O'qituvchilar reytingi matnini tuzadi.
 * @param {object} ranking teacherService.buildRanking natijasi
 */
function buildTeacherReport(ranking) {
  const { from, to, schoolDays, teachers } = ranking;

  const header =
    "📊 <b>O'qituvchilar hisoboti</b>\n" +
    `${dates.formatDate(from)} — ${dates.formatDate(to)}\n` +
    `${schoolDays} o'quv kuni\n`;

  const ranked = teachers.filter((row) => !row.unassigned);
  const unassigned = teachers.filter((row) => row.unassigned);

  if (!ranked.length) {
    const parts = [header, "\n⚠️ Baholash uchun ma'lumot yo'q."];
    if (unassigned.length) {
      parts.push(
        "",
        `${unassigned.length} ta o'qituvchi hech qaysi guruhga biriktirilmagan.`,
        "Guruhda <code>/assign</code> yoki <code>/setteacher</code> qiling."
      );
    } else {
      parts.push("", "O'qituvchi belgilanmagan. Guruhda /setteacher qiling.");
    }
    return { text: parts.join("\n"), count: 0 };
  }

  const parts = [header];

  for (const row of ranked) {
    const name = escapeHtml(
      [row.teacher.firstName, row.teacher.lastName].filter(Boolean).join(" ") ||
        row.teacher.username ||
        String(row.teacher.telegramId)
    );
    const groupNames = row.groups.map((g) => g.title || g.chatId).join(", ");

    parts.push(
      `\n${scoreIcon(row.score)} <b>${name}</b> — <b>${row.score}/100</b>`,
      `   <i>${escapeHtml(groupNames)}</i>`,
      `   📚 Vazifa: ${row.homeworkDays}/${schoolDays} kun`
    );

    // Savol bo'lmasa, javob qatorini ko'rsatmaymiz — ma'nosi yo'q
    if (row.questions > 0) {
      const pct = Math.round(row.answerRate * 100);
      parts.push(
        `   💬 Javob: ${row.answered}/${row.questions} savol (${pct}%)` +
          (row.avgDelay !== null ? `, o'rtacha ${formatDelay(row.avgDelay)}` : "")
      );
    } else {
      parts.push("   💬 Javob: savol bo'lmagan");
    }

    if (row.complaints > 0) {
      parts.push(
        `   ⚠️ Shikoyat: ${row.complaints}` +
          (row.severeComplaints > 0 ? ` (${row.severeComplaints} jiddiy)` : "")
      );
    }

    parts.push(`   ✍️ Faollik: ${row.messages} xabar`);
  }

  if (unassigned.length) {
    parts.push("", `<b>Biriktirilmagan (${unassigned.length})</b>`);
    for (const row of unassigned) {
      const name = escapeHtml(
        [row.teacher.firstName, row.teacher.lastName].filter(Boolean).join(" ") ||
          row.teacher.username ||
          String(row.teacher.telegramId)
      );
      parts.push(`   • ${name} — guruhga biriktirilmagan`);
    }
  }

  let text = parts.join("\n");
  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN) + "\n\n<i>…hisobot qisqartirildi</i>";
  }

  return { text, count: ranked.length };
}

/** O'qituvchilar hisobotini owner va adminlarga yuboradi. */
async function sendTeacherReport(api, ranking) {
  const { text, count } = buildTeacherReport(ranking);
  const recipients = await roleService.reportRecipients();

  let sent = 0;
  for (const chatId of recipients) {
    try {
      await api.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" });
      sent++;
    } catch (err) {
      logger.error(`O'qituvchi hisoboti yuborilmadi (${chatId}):`, err.message);
    }
  }

  logger.info(
    `O'qituvchi hisoboti yuborildi: ${sent}/${recipients.length} odamga, ${count} o'qituvchi`
  );

  return { sent, total: recipients.length, count };
}

module.exports = {
  buildReport,
  sendReport,
  buildTeacherReport,
  sendTeacherReport,
};
