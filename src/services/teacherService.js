const Message = require("../models/Message");
const Group = require("../models/Group");
const User = require("../models/User");
const Issue = require("../models/Issue");
const aiService = require("./aiService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

/**
 * Ota-ona savoliga o'qituvchi javobini topish uchun oyna.
 * Shundan keyin kelgan javob "o'z vaqtida" deb hisoblanmaydi — ya'ni
 * ertasi kuni javob bergan bo'lsa ham, savol javobsiz sanaladi.
 */
const ANSWER_WINDOW_HOURS = 24;

/** Shu daqiqadan tez javob — "tezkor" deb baholanadi. */
const FAST_ANSWER_MIN = 120;

/**
 * Ball og'irliklari. Jami 100.
 * Har biri 0..1 oraliqda hisoblanadi, keyin og'irlikka ko'paytiriladi.
 */
const WEIGHTS = {
  homework: 40, // vazifa muntazamligi — asosiy vazifa
  answers: 35, // ota-ona savollariga javob
  complaints: 15, // shikoyatlar yo'qligi
  activity: 10, // umumiy faollik
};

/**
 * Ota-ona savollariga o'qituvchi javoblarini moslashtiradi.
 *
 * Ikki usul bilan topiladi:
 *   1. ANIQ — o'qituvchi savolga reply qilgan (replyToMessageId)
 *   2. TAXMINIY — savoldan keyin o'sha guruhda o'qituvchi yozgan birinchi
 *      xabar. Reply ishlatilmasa ham javob hisoblanadi, chunki kichik
 *      guruhlarda odamlar reply qilmay javob berishadi.
 *
 * Natija Message hujjatlariga yoziladi: answeredByUserId, answeredAt,
 * answerDelayMin.
 */
async function matchAnswers(localDate = dates.localDate()) {
  const result = { questions: 0, answered: 0, exact: 0, inferred: 0 };

  const groups = await Group.find({ isMonitored: true, isActive: true })
    .select("chatId")
    .lean();
  if (!groups.length) return result;

  const chatIds = groups.map((g) => g.chatId);

  // Shu kungi javob kutayotgan ota-ona savollari
  const questions = await Message.find({
    localDate,
    chatId: { $in: chatIds },
    senderRole: "parent",
    isQuestion: true,
  })
    .sort({ sentAt: 1 })
    .lean();

  result.questions = questions.length;
  if (!questions.length) return result;

  // Javob bo'lishi mumkin bo'lgan o'qituvchi xabarlari.
  // Oyna kun chegarasidan oshishi mumkin, shuning uchun localDate bo'yicha
  // emas, sentAt bo'yicha olamiz.
  const earliest = questions[0].sentAt;
  const horizon = new Date(earliest.getTime() + ANSWER_WINDOW_HOURS * 3600 * 1000);

  const teacherMsgs = await Message.find({
    chatId: { $in: chatIds },
    senderRole: "teacher",
    sentAt: { $gte: earliest, $lte: horizon },
  })
    .sort({ sentAt: 1 })
    .lean();

  // Guruh bo'yicha guruhlab qo'yamiz — har savol uchun qayta qidirmaslik uchun
  const byChat = new Map();
  for (const msg of teacherMsgs) {
    if (!byChat.has(msg.chatId)) byChat.set(msg.chatId, []);
    byChat.get(msg.chatId).push(msg);
  }

  const updates = [];

  for (const question of questions) {
    const candidates = byChat.get(question.chatId) || [];
    const deadline = new Date(
      question.sentAt.getTime() + ANSWER_WINDOW_HOURS * 3600 * 1000
    );

    // 1-usul: aniq reply
    let answer = candidates.find(
      (m) => m.replyToMessageId === question.messageId && m.sentAt <= deadline
    );
    let exact = Boolean(answer);

    // 2-usul: savoldan keyingi birinchi o'qituvchi xabari
    if (!answer) {
      answer = candidates.find(
        (m) => m.sentAt > question.sentAt && m.sentAt <= deadline
      );
    }

    if (!answer) continue;

    const delayMin = Math.round(
      (answer.sentAt.getTime() - question.sentAt.getTime()) / 60000
    );

    updates.push({
      updateOne: {
        filter: { _id: question._id },
        update: {
          $set: {
            answeredByUserId: answer.userId,
            answeredAt: answer.sentAt,
            answerDelayMin: Math.max(0, delayMin),
          },
        },
      },
    });

    result.answered++;
    if (exact) result.exact++;
    else result.inferred++;
  }

  if (updates.length) await Message.bulkWrite(updates);

  logger.info(
    `Javoblar moslashtirildi (${localDate}): ${result.questions} savol, ` +
      `${result.answered} javob (${result.exact} aniq, ${result.inferred} taxminiy)`
  );

  return result;
}

/**
 * Ota-ona xabarlari ichidan savollarni AI bilan belgilaydi.
 * Kechqurungi tekshiruvda, shikoyat tahlilidan keyin ishlaydi.
 */
async function markQuestions(localDate = dates.localDate()) {
  const result = { scanned: 0, questions: 0 };

  if (!aiService.isEnabled()) {
    logger.warn("AI o'chirilgan: savollar aniqlanmaydi");
    return result;
  }

  const groups = await Group.find({ isMonitored: true, isActive: true })
    .select("chatId")
    .lean();
  if (!groups.length) return result;

  const messages = await Message.find({
    localDate,
    chatId: { $in: groups.map((g) => g.chatId) },
    senderRole: "parent",
    text: { $ne: "" },
  }).lean();

  result.scanned = messages.length;
  if (!messages.length) return result;

  const questionIdx = await aiService.findQuestions(messages);
  result.questions = questionIdx.size;

  const ids = [...questionIdx].map((i) => messages[i]._id);
  if (ids.length) {
    await Message.updateMany({ _id: { $in: ids } }, { $set: { isQuestion: true } });
  }

  logger.info(
    `Savollar aniqlandi (${localDate}): ${result.scanned} xabardan ${result.questions} ta savol`
  );

  return result;
}

/** 0..1 oraliqqa cheklaydi. */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Sana oralig'i uchun o'qituvchilar reytingini hisoblaydi.
 *
 * @param {string} from "YYYY-MM-DD"
 * @param {string} to   "YYYY-MM-DD"
 * @returns {Promise<{from:string,to:string,schoolDays:number,teachers:Array}>}
 */
async function buildRanking(from, to) {
  const schoolDays = dates.schoolDaysBetween(from, to);
  const range = { $gte: from, $lte: to };

  const teachers = await User.find({ role: "teacher" }).lean();
  const groups = await Group.find({ isActive: true }).lean();

  // O'qituvchi -> u mas'ul bo'lgan guruhlar
  const groupsByTeacher = new Map();
  for (const group of groups) {
    for (const teacherId of group.teacherIds || []) {
      if (!groupsByTeacher.has(teacherId)) groupsByTeacher.set(teacherId, []);
      groupsByTeacher.get(teacherId).push(group);
    }
  }

  const rows = [];

  for (const teacher of teachers) {
    const myGroups = groupsByTeacher.get(teacher.telegramId) || [];

    // Biriktirilmagan o'qituvchi — baholab bo'lmaydi
    if (!myGroups.length) {
      rows.push({
        teacher,
        unassigned: true,
        groups: [],
      });
      continue;
    }

    const chatIds = myGroups.map((g) => g.chatId);

    const [
      homeworkDays,
      myMessages,
      parentMessages,
      questions,
      answeredByMe,
      complaints,
    ] = await Promise.all([
      // Vazifa yuborilgan alohida kunlar
      Message.distinct("localDate", {
        localDate: range,
        chatId: { $in: chatIds },
        userId: teacher.telegramId,
        isHomework: true,
      }),
      // Umumiy faollik
      Message.countDocuments({
        localDate: range,
        chatId: { $in: chatIds },
        userId: teacher.telegramId,
      }),
      // Guruhdagi ota-ona xabarlari (faollik nisbati uchun)
      Message.countDocuments({
        localDate: range,
        chatId: { $in: chatIds },
        senderRole: "parent",
      }),
      // Javob kutgan savollar
      Message.find({
        localDate: range,
        chatId: { $in: chatIds },
        senderRole: "parent",
        isQuestion: true,
      })
        .select("answeredByUserId answerDelayMin")
        .lean(),
      // Shu o'qituvchi javob bergan savollar
      Message.find({
        localDate: range,
        chatId: { $in: chatIds },
        senderRole: "parent",
        isQuestion: true,
        answeredByUserId: teacher.telegramId,
      })
        .select("answerDelayMin")
        .lean(),
      // Guruhlaridagi shikoyatlar
      Issue.find({
        localDate: range,
        chatId: { $in: chatIds },
        type: "parent_complaint",
      })
        .select("severity")
        .lean(),
    ]);

    // ─── Vazifa muntazamligi (0..1) ───
    const homeworkScore = schoolDays > 0 ? clamp01(homeworkDays.length / schoolDays) : 0;

    // ─── Javob berish (0..1) ───
    // Savol bo'lmasa — jazolamaymiz, neytral 1 beramiz
    let answerScore = 1;
    let answerRate = null;
    let avgDelay = null;

    if (questions.length > 0) {
      answerRate = answeredByMe.length / questions.length;

      if (answeredByMe.length > 0) {
        const total = answeredByMe.reduce((sum, q) => sum + (q.answerDelayMin || 0), 0);
        avgDelay = Math.round(total / answeredByMe.length);
      }

      // Javob ulushi asosiy, tezlik bonus/jarima sifatida
      const speedFactor =
        avgDelay === null ? 1 : clamp01(1.2 - avgDelay / (FAST_ANSWER_MIN * 4));
      answerScore = clamp01(answerRate * (0.75 + 0.25 * speedFactor));
    }

    // ─── Shikoyatlar (0..1) ───
    // Og'irlik bilan: 5-daraja shikoyat 3-darajadan ko'proq jarima
    const complaintWeight = complaints.reduce(
      (sum, c) => sum + (c.severity >= 4 ? 2 : 1),
      0
    );
    // Haftasiga 3 ta og'ir shikoyat — to'liq jarima
    const complaintLimit = Math.max(3, schoolDays);
    const complaintScore = clamp01(1 - complaintWeight / complaintLimit);

    // ─── Faollik (0..1) ───
    // Kuniga kamida 1 xabar kutiladi; ko'p yozsa ham maksimum 1
    const activityScore = schoolDays > 0 ? clamp01(myMessages / schoolDays) : 0;

    const score = Math.round(
      homeworkScore * WEIGHTS.homework +
        answerScore * WEIGHTS.answers +
        complaintScore * WEIGHTS.complaints +
        activityScore * WEIGHTS.activity
    );

    rows.push({
      teacher,
      unassigned: false,
      groups: myGroups,
      score,
      homeworkDays: homeworkDays.length,
      schoolDays,
      questions: questions.length,
      answered: answeredByMe.length,
      answerRate,
      avgDelay,
      complaints: complaints.length,
      severeComplaints: complaints.filter((c) => c.severity >= 4).length,
      messages: myMessages,
      parentMessages,
    });
  }

  // Baholanganlar ballga ko'ra, biriktirilmaganlar oxirida
  rows.sort((a, b) => {
    if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
    return (b.score || 0) - (a.score || 0);
  });

  return { from, to, schoolDays, teachers: rows };
}

module.exports = {
  markQuestions,
  matchAnswers,
  buildRanking,
  WEIGHTS,
  ANSWER_WINDOW_HOURS,
};
