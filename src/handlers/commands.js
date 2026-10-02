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
        "/issues — oxirgi muammolar"
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
        "/cleanup — ishlamaydigan guruh yozuvlarini tozalash"
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
    // Bot eski guruhdan boshqa xabar olmaydi, shuning uchun uni topish uchun
    // Telegram dan so'raymiz — javob bermasa, bu o'lik yozuv.
    const groups = await Group.find().lean();
    const dead = [];

    for (const group of groups) {
      try {
        await ctx.api.getChat({ chat_id: group.chatId });
      } catch (err) {
        dead.push({ group, reason: err.message });
      }
    }

    if (!dead.length) {
      await ctx.reply(
        `✅ Hammasi joyida.\n\n${groups.length} ta guruh tekshirildi, ortiqcha yozuv topilmadi.`
      );
      return;
    }

    const lines = ["🧹 <b>Ishlamaydigan guruh yozuvlari</b>", ""];
    for (const { group } of dead) {
      await Group.deleteOne({ chatId: group.chatId });
      await Message.deleteMany({ chatId: group.chatId });
      await Issue.deleteMany({ chatId: group.chatId });
      lines.push(`🗑 <b>${escapeHtml(group.title || group.chatId)}</b> (<code>${group.chatId}</code>)`);
    }

    lines.push("", `O'chirildi: ${dead.length} ta. Qoldi: ${groups.length - dead.length} ta.`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    logger.info(`Tozalash: ${dead.length} ta o'lik guruh yozuvi o'chirildi`);
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
