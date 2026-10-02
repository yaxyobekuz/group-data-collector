const Message = require("../models/Message");
const Group = require("../models/Group");
const roleService = require("./roleService");
const dates = require("../utils/dates");

const CONTENT_TYPES = [
  "text", "photo", "video", "voice", "audio", "document",
  "sticker", "animation", "video_note", "location", "contact", "poll",
];

function detectContentType(message) {
  return CONTENT_TYPES.find((type) => message[type] !== undefined) || "other";
}

async function saveGroup(chat) {
  if (!chat || chat.type === "private") return null;

  return Group.findOneAndUpdate(
    { chatId: chat.id },
    {
      $set: { title: chat.title || "", type: chat.type, isActive: true },
      $inc: { messageCount: 1 },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

/**
 * Guruhdagi xabarni bazaga yozadi.
 * Yuboruvchining o'sha paytdagi roli ham saqlanadi — keyin rol o'zgarsa,
 * tarixiy tahlil buzilmasin.
 */
async function collect(message) {
  const chat = message.chat;
  if (!chat || chat.type === "private") return null;

  const user = await roleService.touchUser(message.from, { incMessage: true });
  if (!user) return null; // botlar hisobga olinmaydi

  const [group] = await Promise.all([saveGroup(chat)]);

  const role = roleService.roleOf(user, message.from.id);
  const text = message.text || message.caption || "";

  try {
    await Message.create({
      messageId: message.message_id,
      chatId: chat.id,
      userId: message.from.id,
      senderRole: role,
      text,
      contentType: detectContentType(message),
      localDate: dates.localDate(new Date(message.date * 1000)),
      sentAt: new Date(message.date * 1000),
    });
  } catch (err) {
    // Takrorlangan xabar (unique index) — e'tiborsiz
    if (err.code !== 11000) throw err;
  }

  return { user, group, role };
}

module.exports = { collect, detectContentType, saveGroup };
