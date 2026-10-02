const Message = require("../models/Message");
const Group = require("../models/Group");
const User = require("../models/User");
const Issue = require("../models/Issue");
const aiService = require("./aiService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

/**
 * O'qituvchi o'z xabarini shu so'zlar bilan atasa — bu aniq vazifa,
 * AI dan so'ralmaydi. Lotin va kirill yozuvi, turli qo'shimchalar bilan.
 */
const HOMEWORK_KEYWORDS =
  /(vazifa|topshiriq|mashq|вазифа|топшири[қк]|маш[қк]|homework|dars\s*ishi)/i;

/** Muammoni yozadi; takrorlansa jim o'tadi (unique index). */
async function saveIssue(doc) {
  try {
    await Issue.create(doc);
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

/**
 * KECHQURUN TEKSHIRUV (23:00).
 * Har bir nazoratdagi guruh uchun: shu kun o'qituvchi vazifa yubordimi?
 * Yubormagan bo'lsa — muammo yoziladi.
 */
async function checkHomework(localDate = dates.localDate()) {
  const groups = await Group.find({ isMonitored: true, isActive: true }).lean();
  const result = { date: localDate, checked: 0, missing: 0, ok: 0 };

  for (const group of groups) {
    result.checked++;

    // Shu kun shu guruhda o'qituvchilar yozgan matnli xabarlar
    const query = {
      localDate,
      chatId: group.chatId,
      senderRole: "teacher",
      text: { $ne: "" },
    };
    // Guruhga aniq o'qituvchi biriktirilgan bo'lsa — faqat ularni hisoblaymiz
    if (group.teacherIds?.length) {
      query.userId = { $in: group.teacherIds };
    }

    const messages = await Message.find(query).lean();

    let hasHomework = false;

    if (messages.length > 0) {
      // Aniq belgi: o'qituvchi "vazifa"/"uyga vazifa"/"topshiriq" deb yozsa,
      // bu AI ning qaroriga qoldirilmaydi.
      //
      // Sabab: nano model chegaraviy matnlarda beqaror — bir xil xabarni
      // ba'zan vazifa deb topadi, ba'zan yo'q. O'qituvchi o'z xabarini
      // "vazifa" deb atagan bo'lsa, uni inkor qilishning hojati yo'q.
      const explicit = messages.find((m) => HOMEWORK_KEYWORDS.test(m.text));

      if (explicit) {
        hasHomework = true;
        await Message.updateOne(
          { _id: explicit._id },
          { $set: { analyzed: true, isHomework: true } }
        );
        logger.debug(`"${group.title}": vazifa kalit so'z bo'yicha topildi`);
      } else if (aiService.isEnabled()) {
        const homeworkIdx = await aiService.findHomework(messages);
        hasHomework = homeworkIdx.size > 0;

        // Topilgan vazifalarni belgilab qo'yamiz (hisobot va audit uchun)
        const ids = [...homeworkIdx].map((i) => messages[i]._id);
        if (ids.length) {
          await Message.updateMany(
            { _id: { $in: ids } },
            { $set: { analyzed: true, isHomework: true } }
          );
        }
      } else {
        // AI o'chirilgan bo'lsa — xabar bor degani yetarli deb hisoblaymiz
        logger.warn("AI o'chirilgan: vazifa tekshiruvi oddiy qoida bilan ishlaydi");
        hasHomework = true;
      }
    }

    if (hasHomework) {
      result.ok++;
      continue;
    }

    // Vazifa yo'q — muammo yozamiz
    result.missing++;

    // Kim javobgar: biriktirilgan o'qituvchi, bo'lmasa noma'lum
    let teacherName = "O'qituvchi biriktirilmagan";
    let teacherId = null;
    if (group.teacherIds?.length) {
      const teacher = await User.findOne({ telegramId: group.teacherIds[0] });
      if (teacher) {
        teacherName = teacher.displayName();
        teacherId = teacher.telegramId;
      }
    }

    await saveIssue({
      type: "no_homework",
      localDate,
      chatId: group.chatId,
      groupTitle: group.title,
      userId: teacherId,
      userName: teacherName,
      severity: 4,
      summary: "Bugun uyga vazifa yuborilmagan",
      messageId: null,
    });
  }

  logger.info(
    `Vazifa tekshiruvi (${localDate}): ${result.checked} guruh, ${result.ok} yuborgan, ${result.missing} yubormagan`
  );
  return result;
}

/**
 * Ota-ona xabarlarini tahlil qilib muammolarni aniqlaydi.
 * Kechqurun vazifa tekshiruvi bilan birga ishlaydi.
 */
async function analyzeComplaints(localDate = dates.localDate()) {
  const result = { date: localDate, scanned: 0, found: 0 };

  if (!aiService.isEnabled()) {
    logger.warn("AI o'chirilgan: ota-ona muammolari tahlil qilinmaydi");
    return result;
  }

  const monitored = await Group.find({ isMonitored: true, isActive: true })
    .select("chatId title")
    .lean();
  const titleByChat = new Map(monitored.map((g) => [g.chatId, g.title]));

  const messages = await Message.find({
    localDate,
    chatId: { $in: [...titleByChat.keys()] },
    senderRole: "parent",
    analyzed: false,
    text: { $ne: "" },
  }).lean();

  result.scanned = messages.length;
  if (messages.length === 0) return result;

  const complaints = await aiService.findComplaints(messages);

  // Yozuvchilarning ismlarini bir marta olib kelamiz
  const userIds = [...new Set([...complaints.keys()].map((i) => messages[i].userId))];
  const users = await User.find({ telegramId: { $in: userIds } });
  const nameById = new Map(users.map((u) => [u.telegramId, u.displayName()]));

  for (const [i, info] of complaints) {
    const msg = messages[i];
    const created = await saveIssue({
      type: "parent_complaint",
      localDate,
      chatId: msg.chatId,
      groupTitle: titleByChat.get(msg.chatId) || "",
      userId: msg.userId,
      userName: nameById.get(msg.userId) || String(msg.userId),
      severity: info.severity,
      summary: info.summary,
      excerpt: msg.text.slice(0, 300),
      messageId: msg.messageId,
    });
    if (created) result.found++;
  }

  // Hammasini tahlil qilingan deb belgilaymiz (qayta AI ga yubormaslik uchun)
  await Message.updateMany(
    { _id: { $in: messages.map((m) => m._id) } },
    {
      $set: { analyzed: true },
    }
  );
  // Muammo deb topilganlarni alohida belgilaymiz
  const complaintIds = [...complaints.keys()].map((i) => messages[i]._id);
  if (complaintIds.length) {
    await Message.updateMany(
      { _id: { $in: complaintIds } },
      { $set: { isComplaint: true } }
    );
  }

  logger.info(
    `Muammo tahlili (${localDate}): ${result.scanned} xabar tekshirildi, ${result.found} muammo topildi`
  );
  return result;
}

/** Kechqurun ishlaydigan to'liq tekshiruv. */
async function runNightlyCheck(localDate = dates.localDate()) {
  // Muammolarni avval tahlil qilamiz — vazifa tekshiruvi Message yozuvlarini
  // isHomework deb belgilaydi, bu ota-ona tahliliga xalaqit bermasligi uchun
  // ikkisi alohida senderRole bo'yicha ishlaydi.
  const complaints = await analyzeComplaints(localDate);
  const homework = await checkHomework(localDate);
  return { complaints, homework };
}

module.exports = { checkHomework, analyzeComplaints, runNightlyCheck };
