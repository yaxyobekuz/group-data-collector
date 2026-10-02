const User = require("../models/User");
const Group = require("../models/Group");
const Issue = require("../models/Issue");
const Message = require("../models/Message");
const roleService = require("../services/roleService");
const reportService = require("../services/reportService");
const monitorService = require("../services/monitorService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

const ROLE_LABEL = {
  owner: "👑 Owner",
  admin: "🛡 Admin",
  teacher: "👨‍🏫 O'qituvchi",
  parent: "👪 Ota-ona",
};

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function displayName(user) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  if (name) return name;
  if (user.username) return "@" + user.username;
  return String(user.telegramId);
}

/** Buyruq argumentidan foydalanuvchi ID sini oladi (reply yoki raqam). */
function targetUserId(ctx) {
  const reply = ctx.message?.reply_to_message;
  if (reply?.from && !reply.from.is_bot) return reply.from.id;

  const arg = (typeof ctx.match === "string" ? ctx.match : "").trim().split(/\s+/)[0];
  const id = Number(arg);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function register(bot) {
  // ─── Hamma uchun ────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const role = await roleService.getRole(ctx.from?.id);
    await ctx.reply(
      `Salom, ${escapeHtml(ctx.from?.first_name || "")}!\n\n` +
        `Sizning rolingiz: <b>${ROLE_LABEL[role]}</b>\n\n` +
        "Men maktab guruhlarini nazorat qiluvchi botman.\nBuyruqlar: /help",
      { parse_mode: "HTML" }
    );
  });

  bot.command("help", async (ctx) => {
    const role = await roleService.getRole(ctx.from?.id);
    const lines = ["<b>Buyruqlar</b>", "", "/start — boshlash", "/help — yordam", "/id — mening ID im"];

    if (role === "admin" || role === "owner") {
      lines.push(
        "",
        "<b>Admin uchun</b>",
        "/report — bugungi hisobot",
        "/report 2026-10-01 — tanlangan kun hisoboti",
        "/groups — guruhlar ro'yxati",
        "/issues — oxirgi muammolar",
        "/status — tizim holati (nosozlik bormi?)"
      );
    }

    if (role === "owner") {
      lines.push(
        "",
        "<b>Owner uchun</b>",
        "/setadmin — admin qilish (reply yoki ID)",
        "/setteacher — o'qituvchi qilish",
        "/setparent — ota-ona qilish",
        "/staff — adminlar va o'qituvchilar",
        "/assign — guruhga o'qituvchi biriktirish",
        "/monitor on|off — guruh nazoratini boshqarish",
        "/runcheck — tekshiruvni hozir ishga tushirish",
        "/cleanup — guruhlar holatini tekshirish",
        "/forget CHATID — guruh yozuvini o'chirish"
      );
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("id", async (ctx) => {
    const role = await roleService.getRole(ctx.from?.id);
    const lines = [
      `Sizning ID: <code>${ctx.from?.id}</code>`,
      `Rol: ${ROLE_LABEL[role]}`,
    ];
    if (ctx.chat?.type !== "private") {
      lines.push(`Guruh ID: <code>${ctx.chat?.id}</code>`);
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ─── Admin va owner ─────────────────────────────────────
  bot.command("report", async (ctx) => {
    if (!(await roleService.isAdminOrOwner(ctx.from?.id))) {
      await ctx.reply("⛔️ Bu buyruq adminlar uchun.");
      return;
    }

    const arg = (typeof ctx.match === "string" ? ctx.match : "").trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : dates.localDate();

    const { text } = await reportService.buildReport(date);
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.command("groups", async (ctx) => {
    if (!(await roleService.isAdminOrOwner(ctx.from?.id))) {
      await ctx.reply("⛔️ Bu buyruq adminlar uchun.");
      return;
    }

    const groups = await Group.find().sort({ title: 1 }).lean();
    if (!groups.length) {
      await ctx.reply("Hali hech qanday guruh qo'shilmagan.\nBotni guruhga admin qilib qo'shing.");
      return;
    }

    const lines = ["<b>Guruhlar</b>", ""];
    for (const group of groups) {
      const teachers = group.teacherIds?.length
        ? await User.find({ telegramId: { $in: group.teacherIds } }).lean()
        : [];
      const names = teachers.length
        ? teachers.map(displayName).join(", ")
        : "— biriktirilmagan";

      lines.push(
        `${group.isMonitored ? "👁" : "💤"} <b>${escapeHtml(group.title || group.chatId)}</b>`,
        `   ID: <code>${group.chatId}</code>`,
        `   O'qituvchi: ${escapeHtml(names)}`,
        `   Xabarlar: ${group.messageCount}`,
        ""
      );
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("issues", async (ctx) => {
    if (!(await roleService.isAdminOrOwner(ctx.from?.id))) {
      await ctx.reply("⛔️ Bu buyruq adminlar uchun.");
      return;
    }

    const issues = await Issue.find().sort({ createdAt: -1 }).limit(15).lean();
    if (!issues.length) {
      await ctx.reply("✅ Hech qanday muammo yo'q.");
      return;
    }

    const lines = ["<b>Oxirgi muammolar</b>", ""];
    for (const issue of issues) {
      const tag =
        issue.type === "no_homework" ? "📚 Vazifa yo'q" : `⚠️ Shikoyat (${issue.severity})`;
      lines.push(
        `${tag} — ${dates.formatDate(issue.localDate)}`,
        `   <b>${escapeHtml(issue.groupTitle || issue.chatId)}</b> — ${escapeHtml(issue.userName)}`,
        `   ${escapeHtml(issue.summary)}`,
        ""
      );
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ─── Faqat owner ────────────────────────────────────────
  const setRoleCommand = (command, role, label) => {
    bot.command(command, async (ctx) => {
      if (!roleService.isOwner(ctx.from?.id)) {
        await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
        return;
      }

      const userId = targetUserId(ctx);
      if (!userId) {
        await ctx.reply(
          "Foydalanuvchini ko'rsating:\n" +
            `• uning xabariga <b>reply</b> qilib /${command}\n` +
            `• yoki <code>/${command} 123456789</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const result = await roleService.setRole(userId, role, ctx.from.id);
      if (!result.ok) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      const lines = [`✅ ${escapeHtml(displayName(result.user))} — endi <b>${label}</b>`];

      // Bugungi xabarlari ham yangilandi (kechqurungi tekshiruv to'g'ri ishlashi uchun)
      if (result.updatedMessages > 0) {
        lines.push(`   Bugungi ${result.updatedMessages} ta xabari qayta hisobga olindi.`);
      }

      // O'qituvchini GURUHDA belgilasak — o'sha guruhga darhol biriktiramiz,
      // alohida /assign qilish shart bo'lmasin
      if (role === "teacher" && ctx.chat?.type !== "private") {
        await Group.findOneAndUpdate(
          { chatId: ctx.chat.id },
          {
            $addToSet: { teacherIds: userId },
            $set: { title: ctx.chat.title || "", isActive: true },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
        lines.push(`   Bu guruhga biriktirildi: <b>${escapeHtml(ctx.chat.title || "")}</b>`);
      } else if (role === "teacher") {
        lines.push(
          "",
          "ℹ️ Bu shaxsiy chat, shuning uchun hech qaysi guruhga biriktirilmadi.",
          "Biriktirish uchun guruhda <code>/assign " + userId + "</code> yuboring " +
            "(yoki guruhning o'zida /setteacher qiling)."
        );
      }

      await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
      logger.info(`Rol o'zgardi: ${userId} -> ${role} (owner ${ctx.from.id})`);
    });
  };

  setRoleCommand("setadmin", "admin", "🛡 Admin");
  setRoleCommand("setteacher", "teacher", "👨‍🏫 O'qituvchi");
  setRoleCommand("setparent", "parent", "👪 Ota-ona");

  bot.command("staff", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }

    const [admins, teachers] = await Promise.all([
      roleService.listByRole("admin"),
      roleService.listByRole("teacher"),
    ]);

    const fmt = (user) =>
      `   • ${escapeHtml(displayName(user))} — <code>${user.telegramId}</code>`;

    const lines = [
      "<b>Xodimlar</b>",
      "",
      `🛡 <b>Adminlar (${admins.length})</b>`,
      ...(admins.length ? admins.map(fmt) : ["   — yo'q"]),
      "",
      `👨‍🏫 <b>O'qituvchilar (${teachers.length})</b>`,
      ...(teachers.length ? teachers.map(fmt) : ["   — yo'q"]),
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("assign", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }
    if (ctx.chat?.type === "private") {
      await ctx.reply("Bu buyruqni o'qituvchi biriktirilishi kerak bo'lgan guruhda yuboring.");
      return;
    }

    const userId = targetUserId(ctx);
    if (!userId) {
      await ctx.reply(
        "O'qituvchini ko'rsating:\n" +
          "• uning xabariga <b>reply</b> qilib /assign\n" +
          "• yoki <code>/assign 123456789</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const user = await User.findOne({ telegramId: userId });
    if (!user || user.role !== "teacher") {
      await ctx.reply("❌ Bu odam o'qituvchi emas. Avval /setteacher qiling.");
      return;
    }

    await Group.findOneAndUpdate(
      { chatId: ctx.chat.id },
      {
        $addToSet: { teacherIds: userId },
        $set: { title: ctx.chat.title || "", isActive: true },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await ctx.reply(
      `✅ ${escapeHtml(displayName(user))} bu guruhga o'qituvchi sifatida biriktirildi.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("monitor", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }
    if (ctx.chat?.type === "private") {
      await ctx.reply("Bu buyruqni guruhda yuboring.");
      return;
    }

    const arg = (typeof ctx.match === "string" ? ctx.match : "").trim().toLowerCase();
    if (arg !== "on" && arg !== "off") {
      const group = await Group.findOne({ chatId: ctx.chat.id }).lean();
      await ctx.reply(
        `Hozirgi holat: <b>${group?.isMonitored === false ? "o'chirilgan 💤" : "yoqilgan 👁"}</b>\n\n` +
          "O'zgartirish: <code>/monitor on</code> yoki <code>/monitor off</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    await Group.findOneAndUpdate(
      { chatId: ctx.chat.id },
      { $set: { isMonitored: arg === "on", title: ctx.chat.title || "" } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await ctx.reply(
      arg === "on" ? "👁 Bu guruh nazoratga olindi." : "💤 Bu guruh nazoratdan chiqarildi."
    );
  });

  bot.command("cleanup", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }

    // Guruh supergruppaga o'tkazilganda eski chatId bilan yozuv qolib ketadi.
    // Telegram dan so'rab, javob bermaydiganlarini topamiz.
    //
    // MUHIM: bu buyruq HECH NARSA O'CHIRMAYDI, faqat ko'rsatadi.
    // "chat not found" javobi ikki xil holatda keladi:
    //   1. guruh haqiqatan yo'q (supergruppaga o'tgan, eski yozuv qoldi)
    //   2. bot guruhdan vaqtincha chiqarilgan — guruh TIRIK
    // Ikkalasini farqlab bo'lmaydi, shuning uchun o'chirish qarorini
    // owner o'zi qabul qiladi: /forget <chatId>
    const groups = await Group.find().lean();
    if (!groups.length) {
      await ctx.reply("Bazada hech qanday guruh yo'q.");
      return;
    }

    const alive = [];
    const unreachable = [];

    for (const group of groups) {
      try {
        await ctx.api.getChat({ chat_id: group.chatId });
        alive.push(group);
      } catch {
        unreachable.push(group);
      }
    }

    const lines = ["🔎 <b>Guruhlar holati</b>", ""];

    if (alive.length) {
      lines.push(`✅ <b>Ishlayapti (${alive.length})</b>`);
      for (const g of alive) {
        lines.push(`   • ${escapeHtml(g.title || g.chatId)} — <code>${g.chatId}</code>`);
      }
      lines.push("");
    }

    if (unreachable.length) {
      const counts = [];
      for (const g of unreachable) {
        const msgs = await Message.countDocuments({ chatId: g.chatId });
        counts.push({ group: g, msgs });
      }

      lines.push(`⚠️ <b>Bog'lanib bo'lmadi (${unreachable.length})</b>`);
      for (const { group, msgs } of counts) {
        lines.push(
          `   • ${escapeHtml(group.title || group.chatId)} — <code>${group.chatId}</code>`,
          `     ${msgs} ta xabar`
        );
      }
      lines.push(
        "",
        "Bu ikki narsani bildirishi mumkin:",
        "• guruh supergruppaga o'tgan (eski yozuv — o'chirsa bo'ladi)",
        "• <b>bot guruhdan chiqarilgan</b> (guruh tirik — o'chirmang!)",
        "",
        "Ishonchingiz komil bo'lsa: <code>/forget CHATID</code>"
      );
    } else {
      lines.push("Barcha guruhlar bilan bog'lanish bor.");
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("status", async (ctx) => {
    if (!(await roleService.isAdminOrOwner(ctx.from?.id))) {
      await ctx.reply("⛔️ Bu buyruq adminlar uchun.");
      return;
    }

    const me = await ctx.api.getMe();
    const [groups, teachers, admins, todayMsgs] = await Promise.all([
      Group.find({ isMonitored: true, isActive: true }).lean(),
      roleService.listByRole("teacher"),
      roleService.listByRole("admin"),
      Message.countDocuments({ localDate: dates.localDate() }),
    ]);

    const lines = ["🩺 <b>Tizim holati</b>", ""];

    // 1. Privacy Mode — eng ko'p uchraydigan nosozlik
    if (me.can_read_all_group_messages === false) {
      lines.push(
        "❌ <b>Privacy Mode YOQILGAN</b>",
        "   Bot guruhda faqat buyruqlarni ko'radi!",
        "   Vazifa ham, shikoyat ham yig'ilmaydi.",
        "",
        "   Tuzatish: @BotFather → /mybots → Bot Settings",
        "   → Group Privacy → Turn off",
        "   Keyin botni guruhdan chiqarib, qayta qo'shing.",
        ""
      );
    } else {
      lines.push("✅ Privacy Mode o'chirilgan — barcha xabarlar ko'rinadi", "");
    }

    // 2. Guruhlar
    if (!groups.length) {
      lines.push(
        "❌ <b>Nazoratdagi guruh yo'q</b>",
        "   Botni guruhga qo'shib, admin qiling.",
        "   Guruh birinchi xabardan keyin avtomatik qo'shiladi.",
        ""
      );
    } else {
      lines.push(`✅ Nazoratdagi guruhlar: <b>${groups.length}</b>`);
      for (const g of groups) {
        const assigned = g.teacherIds?.length
          ? `${g.teacherIds.length} o'qituvchi`
          : "⚠️ o'qituvchi biriktirilmagan";
        lines.push(`   • ${escapeHtml(g.title || g.chatId)} — ${assigned}`);
      }
      lines.push("");
    }

    // 3. O'qituvchilar
    if (!teachers.length) {
      lines.push(
        "❌ <b>O'qituvchi belgilanmagan</b>",
        "   Guruhda ustoz xabariga reply qilib: /setteacher",
        ""
      );
    } else {
      lines.push(`✅ O'qituvchilar: <b>${teachers.length}</b>`, "");
    }

    // 4. Adminlar
    lines.push(
      admins.length
        ? `✅ Adminlar: <b>${admins.length}</b> (+ owner)`
        : "ℹ️ Admin yo'q — hisobot faqat owner ga boradi",
      ""
    );

    // 5. Bugungi faollik
    lines.push(
      todayMsgs > 0
        ? `✅ Bugun yig'ilgan xabarlar: <b>${todayMsgs}</b>`
        : "⚠️ Bugun hali hech qanday xabar yig'ilmagan"
    );

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("forget", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }

    const arg = (typeof ctx.match === "string" ? ctx.match : "").trim();
    const chatId = Number(arg);

    if (!Number.isInteger(chatId) || chatId === 0) {
      await ctx.reply(
        "Guruh ID sini ko'rsating:\n<code>/forget -1001234567890</code>\n\n" +
          "ID larni ko'rish: /cleanup yoki /groups",
        { parse_mode: "HTML" }
      );
      return;
    }

    const group = await Group.findOne({ chatId }).lean();
    if (!group) {
      await ctx.reply(`❌ <code>${chatId}</code> bazada topilmadi.`, { parse_mode: "HTML" });
      return;
    }

    const [msgs, issues] = await Promise.all([
      Message.deleteMany({ chatId }),
      Issue.deleteMany({ chatId }),
    ]);
    await Group.deleteOne({ chatId });

    await ctx.reply(
      `🗑 <b>${escapeHtml(group.title || chatId)}</b> o'chirildi.\n\n` +
        `Xabarlar: ${msgs.deletedCount}\nMuammolar: ${issues.deletedCount}`,
      { parse_mode: "HTML" }
    );
    logger.info(`Guruh o'chirildi: ${chatId} ("${group.title}")`);
  });

  bot.command("runcheck", async (ctx) => {
    if (!roleService.isOwner(ctx.from?.id)) {
      await ctx.reply("⛔️ Bu buyruq faqat owner uchun.");
      return;
    }

    await ctx.reply("⏳ Tekshiruv boshlandi, kuting…");

    try {
      const result = await monitorService.runNightlyCheck();
      await ctx.reply(
        `✅ Tekshiruv tugadi (${result.homework.date})\n\n` +
          `Guruhlar: ${result.homework.checked}\n` +
          `Vazifa yuborgan: ${result.homework.ok}\n` +
          `Yubormagan: ${result.homework.missing}\n` +
          `Tekshirilgan ota-ona xabarlari: ${result.complaints.scanned}\n` +
          `Topilgan shikoyatlar: ${result.complaints.found}\n\n` +
          "Hisobotni ko'rish: /report"
      );
    } catch (err) {
      logger.error("Qo'lda tekshiruv xatosi:", err);
      await ctx.reply(`❌ Xato: ${err.message}`);
    }
  });
}

module.exports = { register };
