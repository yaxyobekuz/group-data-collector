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

    // Mahalliy sana "YYYY-MM-DD" — kunlik tekshiruv shu bo'yicha ishlaydi
    localDate: { type: String, required: true, index: true },
    sentAt: { type: Date, default: Date.now },

    // AI tahlili natijasi (kechqurun to'ldiriladi)
    analyzed: { type: Boolean, default: false, index: true },
    isHomework: { type: Boolean, default: false },
    isComplaint: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, messageId: 1 }, { unique: true });
// Kunlik tekshiruv uchun: shu kun + shu guruh + o'qituvchi xabarlari
messageSchema.index({ localDate: 1, chatId: 1, senderRole: 1 });

module.exports = model("Message", messageSchema);
