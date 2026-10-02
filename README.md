# Maktab Nazorat Boti

Xususiy maktab Telegram guruhlarini avtomatik nazorat qiladi:

- **Har kuni kechasi 23:00** (yakshanbadan tashqari) — o'qituvchi uyga vazifa yuborganini tekshiradi
- **Har kuni ertalab 08:00** — yig'ilgan barcha muammolarni adminlar va owner ga yuboradi
- Ota-onalar guruhda yozgan muammolarni AI yordamida aniqlaydi

## Qanday ishlaydi

```
Kun bo'yi          Guruh xabarlari bazaga yoziladi (rol bilan birga)
      ↓
23:00              1. Ota-ona xabarlari AI bilan tahlil → shikoyatlar
                   2. Har guruh tekshiriladi → vazifa yo'qmi? → muammo
      ↓
08:00 (ertasi)     Barcha muammolar bitta hisobotda owner + adminlarga
```

Vazifa yuborilmagani ham **muammo** sifatida hisobotga tushadi.

## Rollar

| Rol | Kim belgilaydi | Nima qiladi |
|---|---|---|
| 👑 **Owner** | `.env` → `OWNER_ID` | Barcha rollarni belgilaydi, hisobot oladi |
| 🛡 **Admin** | Owner `/setadmin` | Ertalabki hisobotni oladi, `/report` ko'radi |
| 👨‍🏫 **O'qituvchi** | Owner `/setteacher` | Vazifa yuborishi nazorat qilinadi |
| 👪 **Ota-ona** | — (avtomatik) | Xabarlari muammo uchun tahlil qilinadi |

Rol berilmagan har qanday foydalanuvchi — **ota-ona** sifatida qabul qilinadi.

## O'rnatish

```bash
npm install
cp .env.example .env     # keyin .env ni to'ldiring
npm start
```

### `.env` ni to'ldirish

| O'zgaruvchi | Izoh |
|---|---|
| `BOT_TOKEN` | **Majburiy.** @BotFather dan |
| `OWNER_ID` | **Majburiy.** O'z Telegram ID ingiz — @userinfobot dan oling |
| `MONGODB_URI` | MongoDB manzili |
| `OPENAI_API_KEY` | AI tahlil uchun |
| `OPENAI_MODEL` | `gpt-5.4-nano` — eng arzon (standart) |
| `TIMEZONE` | `Asia/Tashkent` — "shu kun" va jadval shunga bog'liq |
| `HOMEWORK_CHECK_CRON` | `0 23 * * 1-6` — kechqurun tekshiruv |
| `REPORT_CRON` | `0 8 * * 1-6` — ertalabki hisobot |

`1-6` = Dushanba–Shanba. **Yakshanba tekshirilmaydi.**

## Ishga tushirish tartibi

### 1. Botni guruhga qo'shish

Botni har bir sinf guruhiga qo'shib, **admin** qilib belgilang.

> ⚠️ **Muhim:** @BotFather da **Group Privacy** ni o'chiring, aks holda bot
> faqat buyruqlarni ko'radi:
> `/mybots` → bot → Bot Settings → Group Privacy → **Turn off**

Bot guruhga qo'shilganda avtomatik nazoratga olinadi.

### 2. O'qituvchilarni belgilash

> ⚠️ **Buni GURUHNING O'ZIDA qiling**, shaxsiy chatda emas.

Guruhda o'qituvchining xabariga **reply** qilib:

```
/setteacher
```

Yoki ID bilan: `/setteacher 123456789`

Guruhda bajarilsa, bot ikkita ishni birvarakayiga qiladi:

1. odamga o'qituvchi rolini beradi
2. **shu guruhga avtomatik biriktiradi** — alohida `/assign` shart emas

Shaxsiy chatda qilsangiz, faqat rol beriladi va bot sizga guruhda
`/assign` qilish kerakligini eslatadi.

### 3. O'qituvchini boshqa guruhga biriktirish

Bir o'qituvchi bir necha sinfga dars bersa, har bir guruhda:

```
/assign 123456789
```

Biriktirilsa — faqat shu o'qituvchining vazifasi hisoblanadi va hisobotda
ismi ko'rsatiladi. Biriktirilmasa — guruhdagi har qanday o'qituvchining
xabari hisobga olinadi.

### 4. Adminlarni belgilash

```
/setadmin 123456789
```

Adminlar ertalabki hisobotni avtomatik oladi.

### 5. Sinab ko'rish

```
/runcheck     # tekshiruvni hozir ishga tushirish
/report       # hisobotni ko'rish
```

## Buyruqlar

**Hamma uchun:** `/start`, `/help`, `/id`

**Admin va owner:**

| Buyruq | Vazifasi |
|---|---|
| `/report` | Bugungi hisobot |
| `/report 2026-10-01` | Tanlangan kun hisoboti |
| `/groups` | Guruhlar va biriktirilgan o'qituvchilar |
| `/issues` | Oxirgi 15 muammo |

**Faqat owner:**

| Buyruq | Vazifasi |
|---|---|
| `/setadmin` | Admin qilish (reply yoki ID) |
| `/setteacher` | O'qituvchi qilish |
| `/setparent` | Ota-ona qilish (rolni qaytarish) |
| `/staff` | Adminlar va o'qituvchilar ro'yxati |
| `/assign` | Guruhga o'qituvchi biriktirish |
| `/monitor on\|off` | Guruh nazoratini boshqarish (ta'til uchun) |
| `/runcheck` | Tekshiruvni darhol ishga tushirish |
| `/cleanup` | Ishlamaydigan guruh yozuvlarini tozalash |

## Struktura

```
index.js                      kirish nuqtasi: DB + jadval + polling/webhook
src/
  bot.js                      middleware tartibi
  config/
    index.js                  .env sozlamalari
    database.js               MongoDB ulanish
  models/
    User.js                   foydalanuvchi + rol
    Group.js                  guruh + biriktirilgan o'qituvchilar
    Message.js                xabarlar (rol va mahalliy sana bilan)
    Issue.js                  topilgan muammolar
  services/
    roleService.js            rollarni boshqarish
    collectorService.js       xabarlarni yig'ish
    aiService.js              AI tahlil (vazifa va shikoyat)
    monitorService.js         kechqurun tekshiruv
    reportService.js          hisobot tuzish va yuborish
    scheduler.js              cron jadvali
  handlers/
    middleware.js             log + xato tutuvchi
    commands.js               buyruqlar
    messages.js               yig'uvchi + guruh hodisalari
  utils/
    logger.js                 log
    dates.js                  mahalliy sana ("shu kun" mantiqi)
```

## Diqqat qilish kerak bo'lgan joylar

### 1. Middleware tartibi

`node-telegram-bot-api` v2 **koa-compose** ishlatadi: handler `next()`
chaqirmasa, zanjir **to'xtaydi**. [src/bot.js](src/bot.js) dagi tartib:

```
log  →  yig'uvchi  →  buyruqlar  →  qolgan xabarlar
```

Yig'uvchi buyruqlardan **oldin** turadi va `next()` chaqiradi — shunda buyruq
xabarlari ham bazaga tushadi. Agar oxirida bo'lsa, ular yozilmaydi.

### 2. AI javobini tekshirish

Arzon nano modellar ro'yxatdagi raqamlarni chalkashtiradi — javobni bir-ikki
pozitsiya siljitib yuborishi mumkin. Sinovda bu aniq kuzatildi: "o'qituvchi
baqirgan" shikoyati boshqa ota-onaga va boshqa guruhga yozilgan edi.

Shuning uchun [aiService.js](src/services/aiService.js) da:

- har xabarga barqaror ID beriladi (tartib raqami emas)
- model javobda xabarning birinchi 12 belgisini **qaytarishi shart** (`echo`)
- echo mos kelmasa yoki javob tushib qolsa — o'sha xabar **bittalab** qayta
  so'raladi (bitta xabarda model chalkashtira olmaydi)

Bo'lak hajmi 8 ta xabar — kattaroq bo'lsa siljish ko'payadi.

### 3. Mahalliy sana

"Shu kun" server vaqti bo'yicha emas, **maktab vaqt zonasi** bo'yicha
hisoblanadi ([dates.js](src/utils/dates.js)). Har xabar `localDate`
("YYYY-MM-DD") bilan saqlanadi — kechqurun tekshiruv shu bo'yicha ishlaydi.

### 4. Dushanba ertalabki hisobot

Yakshanba tekshirilmaydi, shuning uchun dushanba ertalabki hisobot
**shanba** uchun bo'ladi — `lastCheckedDate()` yakshanbani o'tkazib yuboradi.

### 5. Rol xabar bilan saqlanadi

`Message.senderRole` — xabar yuborilgan paytdagi rol. Keyin odamning roli
o'zgarsa, o'tgan kunlar hisoboti buzilmaydi.

**Lekin bugungi kun istisno.** O'qituvchi ertalab vazifa yuborib, siz uni
tushdan keyin `/setteacher` qilsangiz — eski xabar `parent` bo'lib qolardi va
kechqurungi tekshiruv vazifani ko'rmay "yubormagan" deb hisobot berardi.
Shuning uchun `setRole()` **o'sha kungi** xabarlarning rolini ham yangilaydi
([roleService.js](src/services/roleService.js)). O'tgan kunlarga tegilmaydi.

### 6. Guruh supergruppaga o'tkazilganda

Telegram guruhni supergruppaga o'tkazganda **chatId ni o'zgartiradi**. Bot
buni sezmasa, bitta guruh bazada ikki marta turadi va tekshiruvda ikki marta
sanaladi ("Guruhlar: 2" — aslida bitta), eski yozuv esa doim "vazifa
yuborilmagan" beradi.

Bot `migrate_to_chat_id` xabarini tutib, eski yozuvni yangisiga ko'chiradi:
sozlamalar, biriktirilgan o'qituvchilar va xabarlar saqlanadi.

Bot ishlamagan paytda migratsiya bo'lib qolgan bo'lsa, `/cleanup` eski o'lik
yozuvlarni topib o'chiradi (Telegram dan so'rab tekshiradi).

## Ma'lumotlar bazasi

| Kolleksiya | Unique indeks | Izoh |
|---|---|---|
| `users` | `telegramId` | rol shu yerda |
| `groups` | `chatId` | `teacherIds`, `isMonitored` |
| `messages` | `(chatId, messageId)` | bir xabar ikki marta yozilmaydi |
| `issues` | `(type, localDate, chatId, messageId)` | muammo takrorlanmaydi |

Shu sababli `/runcheck` ni bir necha marta ishga tushirsa ham muammolar
ko'paymaydi.

## Xarajat

`gpt-5.4-nano` tanlangan — eng arzon model. Sinovda `gpt-5-nano` bilan
solishtirilganda: bir xil aniqlik, lekin nano-5 har so'rovda ~900 ta
"reasoning token" sarflaydi (≈10x qimmat va 4.5x sekin).

Tahlil kuniga **bir marta** ishlaydi (har xabarda emas) — bu token
xarajatini keskin kamaytiradi.

## AI o'chirilgan holat

`OPENAI_API_KEY` bo'sh bo'lsa:

- vazifa tekshiruvi **oddiy qoida** bilan ishlaydi (o'qituvchi biror matn
  yozsa — yuborgan deb hisoblanadi)
- ota-ona shikoyatlari **aniqlanmaydi**

Bot ishlaydi, lekin ogohlantirish beradi.

## Webhook rejimi

```bash
BOT_MODE=webhook
WEBHOOK_URL=https://domen.uz/telegram
WEBHOOK_SECRET=tasodifiy_maxfiy_satr
PORT=8080
```

TLS ni oldidagi proxy (nginx, Caddy, cloudflared) hal qiladi.
`WEBHOOK_SECRET` — so'rovni autentifikatsiya qiluvchi yagona narsa,
production da majburiy.
