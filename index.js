const { run, startWebhook } = require("node-telegram-bot-api/node");
const config = require("./src/config");
const { createBot } = require("./src/bot");
const { connectDatabase, disconnectDatabase } = require("./src/config/database");
const scheduler = require("./src/services/scheduler");
const aiService = require("./src/services/aiService");
const logger = require("./src/utils/logger");

const COMMANDS = [
  { command: "start", description: "Boshlash" },
  { command: "help", description: "Yordam" },
  { command: "id", description: "Mening ID im" },
  { command: "report", description: "Kunlik hisobot (admin)" },
  { command: "groups", description: "Guruhlar (admin)" },
  { command: "issues", description: "Muammolar (admin)" },
];

async function main() {
  await connectDatabase();

  const bot = createBot();
  const me = await bot.api.getMe();
  await bot.api.setMyCommands({ commands: COMMANDS });

  logger.info(`Bot ishga tushdi: @${me.username} (${config.mode} rejimi)`);
  logger.info(`Owner ID: ${config.ownerId}`);

  // Privacy Mode yoqiq bo'lsa, bot guruhda faqat buyruqlarni ko'radi —
  // ya'ni na vazifa, na ota-ona shikoyatlari yig'ilmaydi. Buyruqlar ishlagani
  // uchun bu nosozlik sezilmay qoladi, shuning uchun baland ovozda ogohlantiramiz.
  if (me.can_read_all_group_messages === false) {
    logger.error("=".repeat(62));
    logger.error("DIQQAT: Privacy Mode YOQILGAN!");
    logger.error("Bot guruhda faqat /buyruqlarni ko'radi, oddiy xabarlarni EMAS.");
    logger.error("Ya'ni vazifa ham, ota-ona shikoyatlari ham yig'ilmaydi.");
    logger.error("");
    logger.error("Tuzatish: @BotFather -> /mybots -> @" + me.username);
    logger.error("  -> Bot Settings -> Group Privacy -> Turn off");
    logger.error("Keyin botni guruhdan CHIQARIB, QAYTA qo'shing.");
    logger.error("=".repeat(62));
  }

  if (!aiService.isEnabled()) {
    logger.warn(
      "OPENAI_API_KEY sozlanmagan — vazifa tekshiruvi oddiy qoida bilan " +
        "ishlaydi, ota-ona shikoyatlari aniqlanmaydi"
    );
  } else {
    logger.info(`AI model: ${config.openaiModel}`);
  }

  scheduler.start(bot.api);

  if (config.mode === "webhook") {
    if (!config.webhookUrl) {
      throw new Error("BOT_MODE=webhook uchun .env da WEBHOOK_URL kerak");
    }

    await bot.api.setWebhook({
      url: config.webhookUrl,
      secret_token: config.webhookSecret || undefined,
    });
    logger.info(`Webhook o'rnatildi: ${config.webhookUrl}`);

    await startWebhook(bot, {
      port: config.port,
      path: new URL(config.webhookUrl).pathname || "/",
      secretToken: config.webhookSecret || undefined,
    });
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await run(bot, { timeout: 30 });
  }

  logger.info("Bot to'xtadi");
  scheduler.stop();
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error("Ishga tushirishda xato:", err.message);
  scheduler.stop();
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
