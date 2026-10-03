const { Schema, model } = require("mongoose");

const messageSchema = new Schema(
  {
    messageId: { type: Number, required: true },
    chatId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true, index: true },

    // Xabar yuborilgan paytdagi rol (keyin rol o'zgarsa, tarix buzilmasin)
    senderRole: { type: String, default: "parent" },

    text: { type: String, default: "" },
    contentType: { type: String, default: "text" },

    // Javob (reply) bog'lanishi — o'qituvchi ota-onaga javob berganini
    // aniq bilish uchun. Telegram `reply_to_message` dan olinadi.
    replyToMessageId: { type: Number, default: null },
    replyToUserId: { type: Number, default: null },

    // Shu xabarga javob kelganmi (ota-ona savoliga o'qituvchi javobi).
    // Kechqurungi tahlilda to'ldiriladi.
    answeredByUserId: { type: Number, default: null },
    answeredAt: { type: Date, default: null },
    // Savoldan javobgacha o'tgan vaqt (daqiqa)
    answerDelayMin: { type: Number, default: null },

    // Mahalliy sana "YYYY-MM-DD" — kunlik tekshiruv shu bo'yicha ishlaydi
    localDate: { type: String, required: true, index: true },
    sentAt: { type: Date, default: Date.now },

    // AI tahlili natijasi (kechqurun to'ldiriladi)
    analyzed: { type: Boolean, default: false, index: true },
    isHomework: { type: Boolean, default: false },
    isComplaint: { type: Boolean, default: false },

    // Ota-ona xabari savolmi (javob kutadimi) — AI aniqlaydi.
    // `questionChecked` alohida bayroq: `analyzed` shikoyat tahliliga tegishli,
    // ikkisi turli vaqtda ishlaydi va bir-birini bloklamasligi kerak.
    isQuestion: { type: Boolean, default: false },
    questionChecked: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, messageId: 1 }, { unique: true });
// Kunlik tekshiruv uchun: shu kun + shu guruh + o'qituvchi xabarlari
messageSchema.index({ localDate: 1, chatId: 1, senderRole: 1 });
// O'qituvchi reytingi uchun: sana oralig'i + rol
messageSchema.index({ localDate: 1, senderRole: 1, userId: 1 });

module.exports = model("Message", messageSchema);
