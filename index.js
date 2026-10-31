require('dotenv').config();
const fs = require('fs');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const { makeoverCommand, handleMakeover } = require('./makeover'); // NIEUW: AI server makeover

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// --- BESTANDEN & DATABASES ---
const scoresFile = './scores.json';
const backupFile = './scores_backup.json';
const settingsFile = './settings.json';
const playersFile = './players.json';   // NIEUW: mandje-items, uitgaven, daily streaks
const seasonFile = './season.json';     // NIEUW: huidig seizoen + Hall of Fame

let userScores = {};
let playerData = {};
let seasonData = { currentSeason: '', hallOfFame: [], lastDailyAnnounce: '' };
let botSettings = {
    channelId: process.env.CHANNEL_ID ? process.env.CHANNEL_ID.trim() : '',
    minSpawnSec: 600,        // Standaard: 10 minuten
    maxSpawnSec: 3600,       // Standaard: 60 minuten
    despawnSec: 60,          // Standaard: 60 seconden
    missCooldownSec: 1800,   // Standaard: 30 minuten
    inactivitySec: 3600,     // Standaard: 60 minuten
    cmdCooldownSec: 30,      // Standaard: 30 seconden
    specialChance: 15,       // Standaard: 15% kans op een speciale spawn
    favoriteRoleId: null,    // Rol ID voor de #1 speler op het leaderboard
    favoriteHolderId: null,  // Wie de favoriet-rol nu heeft (intern)
    hofChannelId: null,      // Kanaal voor de Hall of Fame (leeg = gewoon spawn-kanaal)
    dailyHour: 9             // Uur (Amsterdam) waarop de dagelijkse opdracht wordt aangekondigd
};

// --- HULPFUNCTIES VOOR OPSLAAN (veilig: eerst tijdelijk bestand, dan hernoemen) ---
function writeJson(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
}

function loadJson(file, fallback, label) {
    if (fs.existsSync(file)) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            console.log(`💾 ${label} ingeladen vanuit ${file}`);
            return data;
        } catch (e) {
            console.error(`❌ Fout bij lezen ${file}, gebruik standaardwaarden:`, e);
        }
    }
    return fallback;
}

// 1. Laad Scores
userScores = loadJson(scoresFile, {}, 'Scores');
if (!fs.existsSync(scoresFile)) writeJson(scoresFile, userScores);
function saveScores() { writeJson(scoresFile, userScores); }

// 2. Laad Settings
botSettings = { ...botSettings, ...loadJson(settingsFile, {}, 'Instellingen') };
if (!fs.existsSync(settingsFile)) writeJson(settingsFile, botSettings);
function saveSettings() { writeJson(settingsFile, botSettings); }

// 3. Laad Spelerdata (mandje etc.)
playerData = loadJson(playersFile, {}, 'Spelerdata');
function savePlayers() { writeJson(playersFile, playerData); }

// 4. Laad Seizoensdata
seasonData = { ...seasonData, ...loadJson(seasonFile, {}, 'Seizoensdata') };
function saveSeason() { writeJson(seasonFile, seasonData); }

function formatTime(seconds) {
    if (seconds < 60) return `${seconds} sec`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
}

// --- DATUM HULPFUNCTIES (alles in Nederlandse tijd) ---
const TZ = 'Europe/Amsterdam';
const maanden = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function getDateStr(d = new Date()) {
    return d.toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
}
function getYesterdayStr() {
    return getDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
}
function getSeasonKey() {
    return getDateStr().slice(0, 7); // YYYY-MM
}
function getHour() {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
}
function seasonLabel(key) {
    const [y, m] = key.split('-');
    return `${maanden[Number(m) - 1]} ${y}`;
}

// Zorg dat er een huidig seizoen is (eerste keer starten)
if (!seasonData.currentSeason) {
    seasonData.currentSeason = getSeasonKey();
    saveSeason();
}

// --- AFBEELDINGEN & MIJLPALEN ---
const nylaFotoLijst = [
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086480156295288/Nyla_Illustrated_-_Emote.png?ex=6ae74331&is=6ae5f1b1&hm=c52f9aebb3abf29518807191ce86f2d6140c7b14ceefbf8c13ed413ce04c31ee&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086497944342760/Nyla_Illustrated_-_Heart_-_Emote.png?ex=6ae74335&is=6ae5f1b5&hm=4052b0022322ca8106992ea22c7212a0a15aae385a1c2a25c02557be57a48b56&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086517292802078/Nyla_Illustrated_-_Cool_-_Emote.png?ex=6ae7433a&is=6ae5f1ba&hm=106211f942ce781ce5418d88cefdc5c7785561c0027d0872537ff581fb792116&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086534116147384/Nyla_Illustrated_-_Crying_-_Emote.png?ex=6ae7433e&is=6ae5f1be&hm=60eaa64b998a06f363032cc30832ab87083cbdf993caf73fa9b79d7acc65c5e4&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086559420125285/Nyla_Illustrated_-_Laughing_-_Emote.png?ex=6ae74344&is=6ae5f1c4&hm=3732d5e7878bad29d0de4807ae958b520989d9034dc8cf492ee864611d8b83f7&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086576147271700/Nyla_Illustrated_-_Angry_-_Emote.png?ex=6ae74348&is=6ae5f1c8&hm=a3de9b5e6cf978bb3bc14fe02f02f2cdbf0eecfd356e8c5b7730d55d913a7234&',
    'https://cdn.discordapp.com/attachments/1110264757585465344/1566086596825186405/Nyla_Illustrated_-_TOS_-_Emote.gif?ex=6ae7434d&is=6ae5f1cd&hm=6535430178ff5e1b4a70ba147cffdcdc9a1d6b2a3512e69b3d6c00ad9808fdc6&'
];

const sadNylaFoto = nylaFotoLijst[3];     // Crying emote
const angryNylaFoto = nylaFotoLijst[5];   // Angry emote (voor Upside Down)
const goldenNylaFoto = nylaFotoLijst[6];  // Animated GIF emote (voor Golden)
const heartNylaFoto = nylaFotoLijst[1];   // Heart emote (voor Mijlpalen & Leaderboard)

const mijlpalen = {
    10: '🐾 Kattenfluisteraar! (10x)',
    25: '🐟 Officiële Snoepjesdealer! (25x)',
    50: '🧶 Nyla\'s Beste Vriend! (50x)',
    100: '👑 Opperste Kattenverzorger! (100x)',
    250: '🌟 Legendarische Nyla Beschermer! (250x)',
    500: '🌌 Goddelijke Kattenheld! (500x)'
};

// --- NIEUW: KATTENMANDJE WINKEL ---
// chance = kans per item om +1 bonuspunt te geven bij een succesvolle interactie
const shopItems = {
    krabpaal: { emoji: '🪵', naam: 'Krabpaal',         prijs: 15,  chance: 0.10 },
    visbakje: { emoji: '🐟', naam: 'Bakje vis',        prijs: 30,  chance: 0.10 },
    speeltje: { emoji: '🐁', naam: 'Speelmuisje',      prijs: 50,  chance: 0.15 },
    kussen:   { emoji: '🛏️', naam: 'Zacht kussentje',  prijs: 100, chance: 0.20 }
};

// --- NIEUW: DAGELIJKSE OPDRACHTEN ---
const dailyQuests = [
    { intro: 'Nyla heeft vandaag zin in een dutje. 💤',
      done:  'Je stopte Nyla lekker in met een dekentje. Ze begint meteen te spinnen... 💤' },
    { intro: 'Nyla\'s vacht zit vol klitten. Ze wil graag geborsteld worden! 🪮',
      done:  'Je borstelde Nyla\'s vacht helemaal glad. Ze glanst weer als nooit tevoren! ✨' },
    { intro: 'Nyla zit bij haar lege voerbakje en kijkt je met grote ogen aan. 🥺',
      done:  'Je vulde haar bakje met verse vis. Nom nom nom! 🐟' },
    { intro: 'Nyla wil vandaag koste wat het kost een muisje vangen! 🐁',
      done:  'Samen joegen jullie op het speelmuisje. Nyla won natuurlijk. 🏆' },
    { intro: 'Er schijnt een zonnig plekje op de vensterbank. Nyla wil erheen! ☀️',
      done:  'Je tilde Nyla naar het zonnetje. Ze ligt nu volledig plat van geluk. ☀️' },
    { intro: 'Nyla heeft kriebels en wil achter haar oortjes gekrabd worden. ✨',
      done:  'Je kriebelde achter haar oortjes. Haar achterpoot trilt van plezier! 🐾' },
    { intro: 'Nyla heeft een kartonnen doos gevonden en eist dat jij hem voor haar openhoudt. 📦',
      done:  'Nyla past er absoluut niet in, maar ze zit er toch in. Mission accomplished! 📦' }
];

function getTodaysQuest() {
    const today = getDateStr();
    let hash = 0;
    for (const ch of today) hash += ch.charCodeAt(0);
    return dailyQuests[hash % dailyQuests.length];
}

// --- NIEUW: STEMMINGEN ---
const hyperQuotes = [
    '"KATTENKRUID?! WAAR?! IK RUIK KATTENKRUID!!!"',
    '"Ik heb net kattenkruid-thee gedronken en ik kan kleuren HOREN!"',
    '"Wie heeft het kattenkruid verstopt?! Ik ga alle kasten door!"',
    '"Ik zag een kattenkruid-plantje en nu zie ik overal kattenkruid-plantjes!"',
    '"Zoom zoom zoom! Dit is mijn kattenkruid-ronde van 3 uur \'s nachts, maar dan overdag!"'
];

const moods = {
    sleepy: {
        emoji: '🥱', naam: 'Slaperig',
        uitleg: 'Ze reageert trager: **dubbele tijd** om haar te helpen, maar je krijgt **1 punt minder** (minimaal 1).',
        despawnMult: 2,
        pointsFn: p => Math.max(1, p - 1)
    },
    hungry: {
        emoji: '🐟', naam: 'Hongerig',
        uitleg: 'Ze rent snel weg (**halve tijd**), maar als je op tijd bent krijg je **dubbele punten**!',
        despawnMult: 0.5,
        pointsFn: p => p * 2
    },
    hyper: {
        emoji: '⚡', naam: 'Hyperactief',
        uitleg: 'Ze stuitert van de energie en roept iets geks over kattenkruid!',
        despawnMult: 1,
        pointsFn: p => p
    }
};

let lastMessageTime = Date.now();
let currentSpawnTimeout = null;
let isClosingSeason = false;
const cooldowns = new Map();

client.on('messageCreate', async (message) => {
    if (!message.author.bot) {
        lastMessageTime = Date.now();
    }
});

// --- SPELERDATA HELPERS ---
function getPlayer(userId) {
    if (!playerData[userId]) {
        playerData[userId] = { items: [], spent: 0, lastDaily: null, streak: 0, totalDaily: 0 };
    }
    const p = playerData[userId];
    if (!Array.isArray(p.items)) p.items = [];
    if (typeof p.spent !== 'number') p.spent = 0;
    if (typeof p.streak !== 'number') p.streak = 0;
    if (typeof p.totalDaily !== 'number') p.totalDaily = 0;
    return p;
}

function getBalance(userId) {
    return Math.max(0, (userScores[userId] || 0) - getPlayer(userId).spent);
}

function rollBonus(userId) {
    const p = getPlayer(userId);
    let bonus = 0;
    const hits = [];
    for (const key of p.items) {
        const item = shopItems[key];
        if (item && Math.random() < item.chance) {
            bonus += 1;
            hits.push(item.emoji);
        }
    }
    return { bonus, hits };
}

function getTitle(score) {
    let titel = 'Nog geen titel (help Nyla 10x voor je eerste titel!)';
    for (const [mp, t] of Object.entries(mijlpalen)) {
        if (score >= Number(mp)) titel = t;
    }
    return titel;
}

// --- PUNTEN TOEKENNEN ---
// Stap 1 (synchroon): score aanpassen en opslaan
function applyPoints(userId, points) {
    const oldScore = userScores[userId] || 0;
    const newScore = oldScore + points;
    userScores[userId] = newScore;
    saveScores();
    return { oldScore, newScore };
}

// Stap 2 (async): mijlpaal-check + favoriet-rol bijwerken
async function afterPoints(channel, guild, userId, oldScore, newScore) {
    for (const [mijlpaalGetal, mijlpaalTitel] of Object.entries(mijlpalen)) {
        const mp = Number(mijlpaalGetal);
        if (oldScore < mp && newScore >= mp) {
            const milestoneEmbed = new EmbedBuilder()
                .setTitle('🎊 NIEUWE MIJLPAAL BEREIKT! 🎊')
                .setDescription(`Hoera! <@${userId}> heeft Nyla al **${mp} keer** geholpen en verdient de titel:\n### **${mijlpaalTitel}**`)
                .setColor('#e91e63')
                .setThumbnail(heartNylaFoto)
                .setTimestamp();
            if (channel) channel.send({ embeds: [milestoneEmbed] }).catch(() => {});
            break;
        }
    }
    await updateFavoriteRole(guild);
}

// --- ROL UPDATE VOOR #1 SPELER ---
async function updateFavoriteRole(guild) {
    if (!botSettings.favoriteRoleId || !guild) return;

    try {
        const role = await guild.roles.fetch(botSettings.favoriteRoleId).catch(() => null);
        if (!role) return;

        // Bepaal wie er nu op #1 staat
        const sorted = Object.entries(userScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1]);

        const topUserId = sorted.length > 0 ? sorted[0][0] : null;

        // Haal de rol weg bij iedereen (in de cache) die niet (meer) op #1 staat
        for (const [memberId, member] of role.members) {
            if (memberId !== topUserId) {
                await member.roles.remove(role).catch(() => {});
            }
        }

        // Haal de rol ook weg bij de laatst bekende houder (werkt ook na een herstart)
        if (botSettings.favoriteHolderId && botSettings.favoriteHolderId !== topUserId) {
            const oldHolder = await guild.members.fetch(botSettings.favoriteHolderId).catch(() => null);
            if (oldHolder && oldHolder.roles.cache.has(role.id)) {
                await oldHolder.roles.remove(role).catch(() => {});
            }
        }

        // Geef de rol aan de nieuwe #1
        if (topUserId) {
            const topMember = await guild.members.fetch(topUserId).catch(() => null);
            if (topMember && !topMember.roles.cache.has(role.id)) {
                await topMember.roles.add(role).catch(err => {
                    console.error('❌ Kon favoriet-rol niet geven (check of de rol van de Bot hoger staat dan de Favoriet-rol!):', err.message);
                });
            }
        }

        if (botSettings.favoriteHolderId !== topUserId) {
            botSettings.favoriteHolderId = topUserId;
            saveSettings();
        }
    } catch (err) {
        console.error('❌ Fout bij updaten van favoriet-rol:', err.message);
    }
}

// --- NIEUW: SEIZOEN AFSLUITEN + HALL OF FAME ---
async function closeSeason(manual = false) {
    if (isClosingSeason) return;
    isClosingSeason = true;

    try {
        const closedKey = seasonData.currentSeason;
        const sorted = Object.entries(userScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, 3).map(([id, score]) => ({ id, score }));

        // Permanent opslaan in de Hall of Fame (alleen als iemand punten had)
        if (top.length > 0) {
            seasonData.hallOfFame.push({
                season: closedKey,
                top,
                manual,
                closedAt: Date.now()
            });
        }

        // Nieuw seizoen starten
        seasonData.currentSeason = getSeasonKey();
        saveSeason();

        // Back-up + reset van scores en uitgaven (items blijven behouden!)
        if (sorted.length > 0) writeJson(backupFile, userScores);
        userScores = {};
        saveScores();
        for (const id of Object.keys(playerData)) playerData[id].spent = 0;
        savePlayers();

        // Bericht in Hall of Fame kanaal (of het gewone kanaal)
        const channelId = botSettings.hofChannelId || botSettings.channelId;
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (channel) {
            const medailles = ['🥇', '🥈', '🥉'];
            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTimestamp();

            if (top.length > 0) {
                embed
                    .setTitle(`🏛️ Seizoen ${seasonLabel(closedKey)} is afgesloten!`)
                    .setDescription(
                        `Het leaderboard is gesloten en de winnaar staat nu **permanent** in de Hall of Fame!\n\n` +
                        top.map((t, i) => `${medailles[i]} <@${t.id}> — **${t.score}** punten`).join('\n') +
                        `\n\n👑 Gefeliciteerd <@${top[0].id}>!\nAlle scores zijn weer op **0** gezet. Een nieuw seizoen begint nu. Wie pakt de troon? *(Gekochte mandje-items blijven gewoon van jou!)*`
                    )
                    .setThumbnail(goldenNylaFoto);
            } else {
                embed
                    .setTitle(`🏛️ Seizoen ${seasonLabel(closedKey)} is afgesloten`)
                    .setDescription('Er waren dit seizoen geen punten gescoord, dus geen winnaar. Een nieuw seizoen begint nu!')
                    .setThumbnail(sadNylaFoto);
            }
            await channel.send({ embeds: [embed] }).catch(err => console.error('❌ Kon Hall of Fame bericht niet sturen:', err.message));
        }

        // Favoriet-rol resetten (niemand heeft nu punten)
        if (channel && channel.guild) await updateFavoriteRole(channel.guild);

        console.log(`🏛️ Seizoen ${closedKey} afgesloten. Nieuw seizoen: ${seasonData.currentSeason}`);
    } catch (err) {
        console.error('❌ Fout bij afsluiten seizoen:', err);
    } finally {
        isClosingSeason = false;
    }
}

// --- NIEUW: PERIODIEKE CHECKS (seizoenswissel + dagelijkse opdracht) ---
async function runTimers() {
    try {
        // 1. Is de maand voorbij? Dan seizoen afsluiten.
        if (seasonData.currentSeason !== getSeasonKey()) {
            await closeSeason(false);
        }

        // 2. Dagelijkse opdracht aankondigen
        const today = getDateStr();
        if (seasonData.lastDailyAnnounce !== today && getHour() >= botSettings.dailyHour) {
            seasonData.lastDailyAnnounce = today;
            saveSeason();

            const channel = await client.channels.fetch(botSettings.channelId).catch(() => null);
            if (channel) {
                const quest = getTodaysQuest();
                const embed = new EmbedBuilder()
                    .setTitle('📅 Nyla\'s Dagelijkse Opdracht!')
                    .setDescription(`${quest.intro}\n\nTyp **\`/nyla verzorg\`** om haar te helpen en verdien **+1 extra punt**!\n*(Elke 7e dag op rij krijg je een streak-bonus van +2 extra!)*`)
                    .setColor('#1abc9c')
                    .setThumbnail(heartNylaFoto)
                    .setTimestamp();
                await channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } catch (err) {
        console.error('❌ Fout in runTimers:', err);
    }
}

// --- SPAWN LOGICA ---
async function scheduleNextSpawn(forcedDelaySec = 0) {
    if (currentSpawnTimeout) clearTimeout(currentSpawnTimeout);

    const minSec = botSettings.minSpawnSec;
    const maxSec = botSettings.maxSpawnSec;
    const randomSec = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec);
    const totalDelayMs = (randomSec + forcedDelaySec) * 1000;

    console.log(`[Timer] Volgende Nyla spawn controle over ${formatTime(randomSec + forcedDelaySec)}.`);
    
    currentSpawnTimeout = setTimeout(async () => {
        const timeSinceLastMessageMs = Date.now() - lastMessageTime;
        const inactivityLimitMs = botSettings.inactivitySec * 1000;

        try {
            const channel = await client.channels.fetch(botSettings.channelId);
            if (!channel) return;

            if (timeSinceLastMessageMs < inactivityLimitMs) {
                spawnNyla(channel);
            } else {
                console.log(`[Timer] Kanaal is langer dan ${formatTime(botSettings.inactivitySec)} stil. Check opnieuw over 5 minuten.`);
                scheduleNextSpawn(300);
            }
        } catch (err) {
            console.error('❌ Fout bij ophalen kanaal tijdens spawn:', err);
        }
    }, totalDelayMs);
}

async function spawnNyla(channel, isTest = false, forcedType = null, forcedMood = null) {
    // Bepaal welk type Nyla er spawnt
    let spawnType = 'normal';
    if (forcedType) {
        spawnType = forcedType;
    } else {
        const roll = Math.random() * 100;
        if (roll < botSettings.specialChance) {
            spawnType = Math.random() < 0.5 ? 'golden' : 'upsidedown';
        }
    }

    // NIEUW: Bepaal de stemming
    const moodKeys = Object.keys(moods);
    const moodKey = forcedMood && moods[forcedMood] ? forcedMood : moodKeys[Math.floor(Math.random() * moodKeys.length)];
    const mood = moods[moodKey];

    // Basis punten en despawn-tijd per type
    let basePoints = 1;
    let baseDespawnSec = botSettings.despawnSec;
    if (spawnType === 'golden') basePoints = 3;
    if (spawnType === 'upsidedown') {
        basePoints = 2;
        baseDespawnSec = Math.min(15, botSettings.despawnSec);
    }

    // Pas de stemming toe
    const pointsWorth = mood.pointsFn(basePoints);
    const despawnSec = Math.max(5, Math.round(baseDespawnSec * mood.despawnMult));
    const despawnTimeMs = despawnSec * 1000;

    const moodText = `\n\n${mood.emoji} **Stemming: ${mood.naam}**\n${mood.uitleg}` +
        (moodKey === 'hyper' ? `\n*${hyperQuotes[Math.floor(Math.random() * hyperQuotes.length)]}*` : '');

    let embed;
    let interactButton;

    if (spawnType === 'golden') {
        embed = new EmbedBuilder()
            .setTitle('✨ EEN ZELDZAME GOUDEN NYLA VERSCHIJNT! ✨')
            .setDescription(`**JACKPOT!** Geef haar snel een gouden snoepje voordat ze na **${formatTime(despawnSec)}** verdwijnt!\n🎁 **Beloning:** +${pointsWorth} Nyla punten!${moodText}`)
            .setImage(goldenNylaFoto)
            .setColor('#f1c40f');

        interactButton = new ButtonBuilder()
            .setCustomId('interact_nyla')
            .setLabel('Geef Gouden Snoepje! 🌟')
            .setStyle(ButtonStyle.Primary);

    } else if (spawnType === 'upsidedown') {
        embed = new EmbedBuilder()
            .setTitle('🩸 EEN UPSIDE DOWN NYLA VERSCHIJNT! 🩸')
            .setDescription(`Ze is ontsnapt uit de schaduwdimensie! Kalmeer haar binnen **${despawnSec} seconden** voordat ze weer in het niets verdwijnt!\n🎁 **Beloning:** +${pointsWorth} Nyla punten!${moodText}`)
            .setImage(angryNylaFoto)
            .setColor('#8b0000');

        interactButton = new ButtonBuilder()
            .setCustomId('interact_nyla')
            .setLabel('Kalmeer haar snel! 🧇')
            .setStyle(ButtonStyle.Danger);

    } else {
        const willekeurigeFoto = nylaFotoLijst[Math.floor(Math.random() * nylaFotoLijst.length)];
        const acties = [
            'Geef een snoepje! 🐟', 
            'Aai over haar bolletje! 🐾', 
            'Speel met een muisje! 🐁',
            'Kriebel achter haar oortjes! ✨',
            'Geef een knuffel! 🧶'
        ];
        const willekeurigeActie = acties[Math.floor(Math.random() * acties.length)];

        embed = new EmbedBuilder()
            .setTitle('🐱 Nyla komt even kijken!')
            .setDescription(`Snel, geef haar wat aandacht voordat ze na **${formatTime(despawnSec)}** weer wegrent!\n🎁 **Beloning:** +${pointsWorth} Nyla ${pointsWorth === 1 ? 'punt' : 'punten'}!${moodText}`)
            .setImage(willekeurigeFoto) 
            .setColor('#2ecc71');

        interactButton = new ButtonBuilder()
            .setCustomId('interact_nyla')
            .setLabel(willekeurigeActie)
            .setStyle(ButtonStyle.Success);
    }

    const row = new ActionRowBuilder().addComponents(interactButton);
    const message = await channel.send({ embeds: [embed], components: [row] });

    const filter = interaction => interaction.customId === 'interact_nyla';
    const collector = message.createMessageComponentCollector({ filter, time: despawnTimeMs });

    let claimed = false; // voorkomt dat twee mensen tegelijk punten krijgen

    collector.on('collect', async interaction => {
        if (claimed) {
            return interaction.reply({ content: '⚡ Iemand anders was je net te snel!', ephemeral: true }).catch(() => {});
        }
        claimed = true;

        const userId = interaction.user.id;

        // Mandje-bonus berekenen
        const { bonus, hits } = rollBonus(userId);
        const totalPoints = pointsWorth + bonus;
        const { oldScore, newScore } = applyPoints(userId, totalPoints);

        let replyText = `🎉 **${interaction.user.username}** was het snelst en gaf Nyla aandacht! *(+${pointsWorth}, Totaal: **${newScore}** keer)*`;
        if (spawnType === 'golden') {
            replyText = `🌟 **JACKPOT!** **${interaction.user.username}** ving de **Gouden Nyla** en kreeg **+${pointsWorth} punten**! *(Totaal: **${newScore}** keer)*`;
        } else if (spawnType === 'upsidedown') {
            replyText = `🩸 **HELD!** **${interaction.user.username}** wist de **Upside Down Nyla** op tijd te kalmeren voor **+${pointsWorth} punten**! *(Totaal: **${newScore}** keer)*`;
        }
        replyText += `\n${mood.emoji} *Nyla was ${mood.naam.toLowerCase()}.*`;
        if (bonus > 0) {
            replyText += `\n🎁 **Mandje-bonus:** +${bonus} ${hits.join(' ')}`;
        }

        await interaction.update({ 
            content: replyText, 
            embeds: [], 
            components: [] 
        });

        // Mijlpaal + favoriet-rol
        await afterPoints(channel, channel.guild, userId, oldScore, newScore);
        
        collector.stop('interacted');
    });

    collector.on('end', (collected, reason) => {
        if (reason !== 'interacted') {
            message.delete().catch(() => {});
            if (!isTest) {
                console.log(`[Spawn] Niemand klikte op tijd. Cooldown van ${formatTime(botSettings.missCooldownSec)} gestart.`);
                scheduleNextSpawn(botSettings.missCooldownSec);
            }
        } else {
            if (!isTest) {
                scheduleNextSpawn(0);
            }
        }
    });
}

// --- SLASH COMMANDS DEFINITIES ---
const commands = [
    new SlashCommandBuilder()
        .setName('nylas')
        .setDescription('Bekijk hoe vaak je Nyla al aandacht hebt gegeven.'),
    
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Bekijk de Top 5 mensen die Nyla het vaakst aandacht gaven.'),

    // NIEUW: Daily quest
    new SlashCommandBuilder()
        .setName('nyla')
        .setDescription('Dagelijkse opdrachten met Nyla.')
        .addSubcommand(sub =>
            sub.setName('verzorg')
               .setDescription('Voltooi de dagelijkse opdracht van Nyla en verdien een bonuspunt!'))
        .addSubcommand(sub =>
            sub.setName('opdracht')
               .setDescription('Bekijk wat Nyla vandaag wil.')),

    // NIEUW: Kattenmandje
    new SlashCommandBuilder()
        .setName('mandje')
        .setDescription('Jouw persoonlijke kattenmandje en winkel.')
        .addSubcommand(sub =>
            sub.setName('bekijk')
               .setDescription('Bekijk jouw mandje, punten en bonussen.'))
        .addSubcommand(sub =>
            sub.setName('winkel')
               .setDescription('Bekijk welke accessoires je kunt kopen.'))
        .addSubcommand(sub =>
            sub.setName('koop')
               .setDescription('Koop een accessoire voor in je mandje.')
               .addStringOption(opt =>
                   opt.setName('item')
                      .setDescription('Wat wil je kopen?')
                      .setRequired(true)
                      .addChoices(...Object.entries(shopItems).map(([key, it]) => ({
                          name: `${it.emoji} ${it.naam} (${it.prijs} punten)`,
                          value: key
                      }))))),

    // NIEUW: AI Makeover (Admin)
    makeoverCommand,

    // NIEUW: Hall of Fame
    new SlashCommandBuilder()
        .setName('erelijst')
        .setDescription('Bekijk de Hall of Fame met alle winnaars van voorgaande seizoenen.'),

    new SlashCommandBuilder()
        .setName('test')
        .setDescription('[Admin] Forceer direct een Nyla spawn om te testen.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => 
            opt.setName('type')
               .setDescription('Welke Nyla wil je testen? (Standaard: willekeurig)')
               .setRequired(false)
               .addChoices(
                   { name: '🐱 Normale Nyla (+1)', value: 'normal' },
                   { name: '🌟 Gouden Nyla (+3)', value: 'golden' },
                   { name: '🩸 Upside Down Nyla (+2)', value: 'upsidedown' }
               ))
        .addStringOption(opt =>
            opt.setName('stemming')
               .setDescription('Welke stemming wil je testen? (Standaard: willekeurig)')
               .setRequired(false)
               .addChoices(
                   { name: '🥱 Slaperig', value: 'sleepy' },
                   { name: '🐟 Hongerig', value: 'hungry' },
                   { name: '⚡ Hyperactief', value: 'hyper' }
               )),

    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('[Admin] Bekijk of wijzig de instellingen van de Nyla bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => 
            sub.setName('bekijk')
               .setDescription('Bekijk alle huidige instellingen en timers.'))
        .addSubcommand(sub => 
            sub.setName('kanaal')
               .setDescription('Wijzig het kanaal waarin Nyla verschijnt.')
               .addChannelOption(opt => opt.setName('nieuw_kanaal').setDescription('Kies het tekstkanaal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('spawntijd')
               .setDescription('Wijzig de minimale en maximale spawntijd.')
               .addIntegerOption(opt => opt.setName('min').setDescription('Minimale tijd').setRequired(true).setMinValue(1))
               .addIntegerOption(opt => opt.setName('max').setDescription('Maximale tijd').setRequired(true).setMinValue(1))
               .addStringOption(opt => opt.setName('eenheid').setDescription('Seconden of Minuten?').setRequired(true).addChoices({ name: 'Minuten', value: 'min' }, { name: 'Seconden', value: 'sec' })))
        .addSubcommand(sub => 
            sub.setName('despawn')
               .setDescription('Wijzig hoe lang Nyla in de chat blijft staan voordat ze wegrent.')
               .addIntegerOption(opt => opt.setName('tijd').setDescription('Aantal seconden of minuten').setRequired(true).setMinValue(5))
               .addStringOption(opt => opt.setName('eenheid').setDescription('Seconden of Minuten?').setRequired(true).addChoices({ name: 'Seconden', value: 'sec' }, { name: 'Minuten', value: 'min' })))
        .addSubcommand(sub => 
            sub.setName('miscooldown')
               .setDescription('Wijzig hoe lang Nyla wegblijft als niemand op tijd klikt.')
               .addIntegerOption(opt => opt.setName('tijd').setDescription('Tijd').setRequired(true).setMinValue(0))
               .addStringOption(opt => opt.setName('eenheid').setDescription('Seconden of Minuten?').setRequired(true).addChoices({ name: 'Minuten', value: 'min' }, { name: 'Seconden', value: 'sec' })))
        .addSubcommand(sub => 
            sub.setName('inactiviteit')
               .setDescription('Wijzig hoe lang het maximaal stil mag zijn in de chat.')
               .addIntegerOption(opt => opt.setName('tijd').setDescription('Tijd').setRequired(true).setMinValue(1))
               .addStringOption(opt => opt.setName('eenheid').setDescription('Seconden of Minuten?').setRequired(true).addChoices({ name: 'Minuten', value: 'min' }, { name: 'Seconden', value: 'sec' })))
        .addSubcommand(sub => 
            sub.setName('commandcooldown')
               .setDescription('Wijzig de persoonlijke cooldown op /nylas, /leaderboard en /erelijst.')
               .addIntegerOption(opt => opt.setName('seconden').setDescription('Cooldown in seconden').setRequired(true).setMinValue(0)))
        .addSubcommand(sub => 
            sub.setName('specialkans')
               .setDescription('Wijzig het percentage kans op een Gouden of Upside Down Nyla (0 tot 100%).')
               .addIntegerOption(opt => opt.setName('percentage').setDescription('Kans in procenten (bijv. 15)').setRequired(true).setMinValue(0).setMaxValue(100)))
        .addSubcommand(sub => 
            sub.setName('favorietrol')
               .setDescription('Stel de Discord-rol in die de #1 speler op het leaderboard automatisch krijgt.')
               .addRoleOption(opt => opt.setName('rol').setDescription('Kies de rol voor de #1 speler').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('erelijstkanaal')
               .setDescription('Stel het kanaal in waar de Hall of Fame berichten komen.')
               .addChannelOption(opt => opt.setName('kanaal').setDescription('Kies het tekstkanaal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('dagelijkseuur')
               .setDescription('Stel in om hoe laat (Nederlandse tijd) de dagelijkse opdracht verschijnt.')
               .addIntegerOption(opt => opt.setName('uur').setDescription('Uur van de dag (0-23)').setRequired(true).setMinValue(0).setMaxValue(23))),

    new SlashCommandBuilder()
        .setName('scores')
        .setDescription('[Admin] Beheer, reset of herstel de Nyla scores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => 
            sub.setName('reset_speler')
               .setDescription('Zet de Nyla score van één specifieke speler op 0.')
               .addUserOption(opt => opt.setName('speler').setDescription('Kies de speler').setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('reset_alles')
               .setDescription('Reset ALLE scores naar 0 (maakt automatisch een back-up en stuurt bericht in chat).'))
        .addSubcommand(sub => 
            sub.setName('herstel_backup')
               .setDescription('Zet de laatst gemaakte back-up van de scores weer terug.'))
        .addSubcommand(sub =>
            sub.setName('sluit_seizoen')
               .setDescription('Sluit het huidige seizoen nu al af (winnaar naar Hall of Fame, scores naar 0).'))
].map(command => command.toJSON());

// --- COMMAND AFHANDELING ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;

    // 1. Persoonlijke Cooldown Check
    if (commandName === 'nylas' || commandName === 'leaderboard' || commandName === 'erelijst') {
        const key = `${user.id}-${commandName}`;
        const cooldownAmountMs = botSettings.cmdCooldownSec * 1000;

        if (cooldowns.has(key)) {
            const expirationTime = cooldowns.get(key) + cooldownAmountMs;
            if (Date.now() < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - Date.now()) / 1000);
                return interaction.reply({ 
                    content: `⏳ Rustig aan! Je kunt \`/${commandName}\` over **${timeLeft} seconden** weer gebruiken.`, 
                    ephemeral: true 
                });
            }
        }
        cooldowns.set(key, Date.now());
    }

    // --- COMMAND: /makeover (Admin) ---
    if (commandName === 'makeover') {
        return handleMakeover(interaction);
    }

    // --- COMMAND: /nylas ---
    if (commandName === 'nylas') {
        const score = userScores[user.id] || 0;
        const huidigeTitel = getTitle(score);

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`🐾 Nyla Profiel van ${user.username}`)
            .setDescription(`Je hebt Nyla dit seizoen al **${score}** keer aandacht gegeven!\n🏅 **Huidige rang:** ${huidigeTitel}\n💰 **Besteedbaar in je mandje:** ${getBalance(user.id)} punten *(zie \`/mandje\`)*`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // --- COMMAND: /nyla (Daily Quest) ---
    if (commandName === 'nyla') {
        const sub = interaction.options.getSubcommand();
        const today = getDateStr();
        const quest = getTodaysQuest();
        const p = getPlayer(user.id);

        if (sub === 'opdracht') {
            const klaar = p.lastDaily === today;
            return interaction.reply({
                content: `📅 **Opdracht van vandaag:**\n${quest.intro}\n\n${klaar ? '✅ Jij hebt deze opdracht vandaag al voltooid!' : 'Typ `/nyla verzorg` om hem te voltooien!'}\n🔥 Jouw streak: **${p.streak}** ${p.streak === 1 ? 'dag' : 'dagen'}`,
                ephemeral: true
            });
        }

        if (sub === 'verzorg') {
            if (p.lastDaily === today) {
                return interaction.reply({
                    content: '😸 Nyla heeft vandaag al genoeg aandacht van je gehad! Kom morgen terug voor een nieuwe opdracht.',
                    ephemeral: true
                });
            }

            // Streak berekenen
            const newStreak = p.lastDaily === getYesterdayStr() ? p.streak + 1 : 1;
            const streakBonus = newStreak % 7 === 0 ? 2 : 0;
            const totalPoints = 1 + streakBonus;

            p.lastDaily = today;
            p.streak = newStreak;
            p.totalDaily += 1;
            savePlayers();

            const { oldScore, newScore } = applyPoints(user.id, totalPoints);

            let tekst = `${quest.done}\n\n🎁 **${user.username}** krijgt **+1 bonuspunt**! *(Totaal: **${newScore}**)*\n🔥 Streak: **${newStreak}** ${newStreak === 1 ? 'dag' : 'dagen'}`;
            if (streakBonus > 0) {
                tekst += `\n🌟 **7-DAGEN STREAK!** Extra **+${streakBonus}** punten erbij!`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📅 Dagelijkse opdracht voltooid!')
                .setDescription(tekst)
                .setColor('#1abc9c')
                .setThumbnail(heartNylaFoto)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await afterPoints(interaction.channel, interaction.guild, user.id, oldScore, newScore);
            return;
        }
    }

    // --- COMMAND: /mandje ---
    if (commandName === 'mandje') {
        const sub = interaction.options.getSubcommand();
        const p = getPlayer(user.id);

        if (sub === 'bekijk') {
            const score = userScores[user.id] || 0;
            const balance = getBalance(user.id);

            const slots = Object.entries(shopItems)
                .map(([key, it]) => p.items.includes(key) ? it.emoji : '▫️')
                .join(' ');
            const heeftAlles = Object.keys(shopItems).every(k => p.items.includes(k));
            const nylaStatus = p.items.length === 0 ? '🐱 *Nyla zit in een kaal mandje...*'
                : heeftAlles ? '😻 *Nyla woont in het paradijs!*'
                : '😺 *Nyla voelt zich thuis!*';

            const bonusLijst = p.items.length > 0
                ? p.items.filter(k => shopItems[k]).map(k => `${shopItems[k].emoji} ${shopItems[k].naam} — ${Math.round(shopItems[k].chance * 100)}% kans op +1`).join('\n')
                : '*Nog geen accessoires. Bekijk `/mandje winkel`!*';

            const embed = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle(`🧺 Het kattenmandje van ${user.username}`)
                .setDescription(`╭───────────────╮\n   ${slots}\n   ${nylaStatus}\n╰───────────────╯`)
                .addFields(
                    { name: '🏆 Punten dit seizoen', value: `${score}`, inline: true },
                    { name: '💰 Besteedbaar', value: `${balance}`, inline: true },
                    { name: '🔥 Dagelijkse streak', value: `${p.streak}`, inline: true },
                    { name: '🏅 Rang', value: getTitle(score), inline: false },
                    { name: '🎁 Actieve bonussen', value: bonusLijst, inline: false }
                )
                .setFooter({ text: 'Items blijven van jou, ook na een seizoenswissel!' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'winkel') {
            const lijst = Object.entries(shopItems).map(([key, it]) => {
                const status = p.items.includes(key) ? '✅ *Gekocht*' : `💰 **${it.prijs}** punten`;
                return `${it.emoji} **${it.naam}** — ${status}\n└ ${Math.round(it.chance * 100)}% kans op +1 bonuspunt bij elke succesvolle interactie`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('🛒 Nyla\'s Mandjeswinkel')
                .setDescription(`${lijst}\n\nJe hebt **${getBalance(user.id)}** besteedbare punten.\nKoop met \`/mandje koop\`.\n*Uitgeven telt niet mee voor je leaderboard-score!*`);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'koop') {
            const key = interaction.options.getString('item');
            const item = shopItems[key];
            if (!item) {
                return interaction.reply({ content: '❌ Dat item bestaat niet.', ephemeral: true });
            }
            if (p.items.includes(key)) {
                return interaction.reply({ content: `✅ Je hebt de ${item.emoji} **${item.naam}** al in je mandje!`, ephemeral: true });
            }
            const balance = getBalance(user.id);
            if (balance < item.prijs) {
                return interaction.reply({
                    content: `❌ Je hebt **${item.prijs}** punten nodig voor de ${item.emoji} **${item.naam}**, maar je hebt er maar **${balance}** te besteden.`,
                    ephemeral: true
                });
            }

            p.spent += item.prijs;
            p.items.push(key);
            savePlayers();

            return interaction.reply({
                content: `🎉 Je kocht de ${item.emoji} **${item.naam}** voor **${item.prijs}** punten! Vanaf nu heb je ${Math.round(item.chance * 100)}% kans op +1 bonuspunt bij elke succesvolle interactie.\n💰 Over: **${getBalance(user.id)}** punten.`,
                ephemeral: true
            });
        }
    }

    // --- COMMAND: /erelijst ---
    if (commandName === 'erelijst') {
        const lijst = seasonData.hallOfFame.slice(-12).reverse();
        const medailles = ['🥇', '🥈', '🥉'];

        let beschrijving;
        if (lijst.length === 0) {
            beschrijving = '*Er zijn nog geen afgesloten seizoenen. Wie schrijft als eerste geschiedenis?* 🐾';
        } else {
            beschrijving = lijst.map(entry => {
                const regels = entry.top.map((t, i) => `${medailles[i]} <@${t.id}> — ${t.score}`).join('\n');
                return `**📜 ${seasonLabel(entry.season)}${entry.manual ? ' *(eerder afgesloten)*' : ''}**\n${regels}`;
            }).join('\n\n');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏛️ Nyla Hall of Fame 🏛️')
            .setDescription(beschrijving)
            .setColor('#f1c40f')
            .setThumbnail(goldenNylaFoto)
            .setFooter({ text: `Huidig seizoen: ${seasonLabel(seasonData.currentSeason)} • sluit automatisch aan het einde van de maand` });
        return interaction.reply({ embeds: [embed] });
    }

    // --- COMMAND: /leaderboard ---
    if (commandName === 'leaderboard') {
        const sortedScores = Object.entries(userScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1]);

        const randomNamen = [
            'Slapende Kater 💤', 
            'Mysterieuze Muis 🐁', 
            'VerdwaaldePluisbol 🧶', 
            'KattenkruidConnaisseur 🌿', 
            'SchaduwJager 🐾',
            'KartonnenDoosFan 📦',
            'Laserpuntje 🔴'
        ];
        const geschuddeNamen = randomNamen.sort(() => 0.5 - Math.random());

        const medailles = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        let beschrijving = '';

        for (let i = 0; i < 5; i++) {
            if (i < sortedScores.length) {
                const [id, score] = sortedScores[i];
                beschrijving += `${medailles[i]} <@${id}> — **${score}** keer\n`;
            } else {
                const nepNaam = geschuddeNamen[i];
                beschrijving += `${medailles[i]} *${nepNaam}* — **0** keer *(Nog vrij!)*\n`;
            }
        }

        const lbEmbed = new EmbedBuilder()
            .setTitle(`🏆 Nyla Top 5 — ${seasonLabel(seasonData.currentSeason)} 🏆`)
            .setDescription('Wie geeft Nyla de meeste snoepjes en aaitjes in de server?\n\n' + beschrijving)
            .setColor('#f1c40f')
            .setThumbnail(heartNylaFoto)
            .setFooter({ text: 'Het leaderboard sluit aan het einde van de maand. Winnaars komen in /erelijst!' })
            .setTimestamp();

        return interaction.reply({ embeds: [lbEmbed] });
    }

    // --- COMMAND: /test (Admin) ---
    if (commandName === 'test') {
        const chosenType = interaction.options.getString('type');
        const chosenMood = interaction.options.getString('stemming');
        await interaction.reply({ content: `⚡ Test-Nyla (${chosenType || 'willekeurig'}, stemming: ${chosenMood || 'willekeurig'}) wordt nu gespawnd!`, ephemeral: true });
        spawnNyla(interaction.channel, true, chosenType, chosenMood);
    }

    // --- COMMAND: /settings (Admin) ---
    if (commandName === 'settings') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'bekijk') {
            const rolTekst = botSettings.favoriteRoleId ? `<@&${botSettings.favoriteRoleId}>` : 'Niet ingesteld';
            const hofTekst = botSettings.hofChannelId ? `<#${botSettings.hofChannelId}>` : 'Zelfde als spawn-kanaal';
            const settingsEmbed = new EmbedBuilder()
                .setTitle('⚙️ Nyla Bot Instellingen')
                .setColor('#9b59b6')
                .setDescription('Gebruik `/settings <optie>` om deze waarden direct via Discord aan te passen.')
                .addFields(
                    { name: '📢 Actief Kanaal', value: `<#${botSettings.channelId}>`, inline: true },
                    { name: '⏱️ Spawn Tijd (Min - Max)', value: `${formatTime(botSettings.minSpawnSec)} tot ${formatTime(botSettings.maxSpawnSec)}`, inline: true },
                    { name: '💨 Despawn Tijd', value: `${formatTime(botSettings.despawnSec)}`, inline: true },
                    { name: '😴 Cooldown bij Missen', value: `${formatTime(botSettings.missCooldownSec)}`, inline: true },
                    { name: '🔇 Chat Inactiviteitslimiet', value: `${formatTime(botSettings.inactivitySec)}`, inline: true },
                    { name: '⏳ Command Cooldown', value: `${botSettings.cmdCooldownSec} sec`, inline: true },
                    { name: '✨ Speciale Spawn Kans', value: `${botSettings.specialChance}%`, inline: true },
                    { name: '👑 #1 Favoriet Rol', value: rolTekst, inline: true },
                    { name: '🏛️ Hall of Fame Kanaal', value: hofTekst, inline: true },
                    { name: '📅 Dagelijkse Opdracht', value: `${botSettings.dailyHour}:00 (NL tijd)`, inline: true },
                    { name: '🗓️ Huidig Seizoen', value: seasonLabel(seasonData.currentSeason), inline: true }
                );
            return interaction.reply({ embeds: [settingsEmbed], ephemeral: true });
        }

        if (sub === 'kanaal') {
            const nieuwKanaal = interaction.options.getChannel('nieuw_kanaal');
            botSettings.channelId = nieuwKanaal.id;
            saveSettings();
            scheduleNextSpawn(0);
            return interaction.reply({ content: `✅ Het actieve spawn-kanaal is gewijzigd naar <#${nieuwKanaal.id}>! De spawn-timer is direct gereset.`, ephemeral: true });
        }

        if (sub === 'spawntijd') {
            const min = interaction.options.getInteger('min');
            const max = interaction.options.getInteger('max');
            const eenheid = interaction.options.getString('eenheid');

            if (min > max) {
                return interaction.reply({ content: '❌ De minimale tijd mag niet hoger zijn dan de maximale tijd!', ephemeral: true });
            }

            const factor = eenheid === 'min' ? 60 : 1;
            botSettings.minSpawnSec = min * factor;
            botSettings.maxSpawnSec = max * factor;
            saveSettings();
            scheduleNextSpawn(0);

            return interaction.reply({ 
                content: `✅ Spawntijd aangepast naar **${formatTime(botSettings.minSpawnSec)} - ${formatTime(botSettings.maxSpawnSec)}**! De nieuwe timer loopt nu.`, 
                ephemeral: true 
            });
        }

        if (sub === 'despawn') {
            const tijd = interaction.options.getInteger('tijd');
            const eenheid = interaction.options.getString('eenheid');
            botSettings.despawnSec = tijd * (eenheid === 'min' ? 60 : 1);
            saveSettings();
            return interaction.reply({ content: `✅ Nyla blijft voortaan **${formatTime(botSettings.despawnSec)}** in de chat staan voordat ze wegrent.`, ephemeral: true });
        }

        if (sub === 'miscooldown') {
            const tijd = interaction.options.getInteger('tijd');
            const eenheid = interaction.options.getString('eenheid');
            botSettings.missCooldownSec = tijd * (eenheid === 'min' ? 60 : 1);
            saveSettings();
            return interaction.reply({ content: `✅ Als Nyla gemist wordt, wacht ze voortaan **${formatTime(botSettings.missCooldownSec)}** bovenop haar normale tijd.`, ephemeral: true });
        }

        if (sub === 'inactiviteit') {
            const tijd = interaction.options.getInteger('tijd');
            const eenheid = interaction.options.getString('eenheid');
            botSettings.inactivitySec = tijd * (eenheid === 'min' ? 60 : 1);
            saveSettings();
            return interaction.reply({ content: `✅ Inactiviteitslimiet aangepast naar **${formatTime(botSettings.inactivitySec)}**.`, ephemeral: true });
        }

        if (sub === 'commandcooldown') {
            const sec = interaction.options.getInteger('seconden');
            botSettings.cmdCooldownSec = sec;
            saveSettings();
            return interaction.reply({ content: `✅ Persoonlijke cooldown voor \`/nylas\`, \`/leaderboard\` en \`/erelijst\` staat nu op **${sec} seconden**.`, ephemeral: true });
        }

        if (sub === 'specialkans') {
            const perc = interaction.options.getInteger('percentage');
            botSettings.specialChance = perc;
            saveSettings();
            return interaction.reply({ content: `✅ De kans op een Gouden of Upside Down Nyla is nu ingesteld op **${perc}%**.`, ephemeral: true });
        }

        if (sub === 'favorietrol') {
            const rol = interaction.options.getRole('rol');
            botSettings.favoriteRoleId = rol.id;
            saveSettings();
            await updateFavoriteRole(interaction.guild);
            return interaction.reply({ 
                content: `✅ De rol <@&${rol.id}> is ingesteld als beloning voor de #1 speler op het leaderboard!\n*(Let op: zorg dat de eigen rol van de Nyla Bot in je Serverinstellingen -> Rollen BOVEN deze rol staat, anders mag de bot hem niet uitdelen!)*`, 
                ephemeral: true 
            });
        }

        if (sub === 'erelijstkanaal') {
            const kanaal = interaction.options.getChannel('kanaal');
            botSettings.hofChannelId = kanaal.id;
            saveSettings();
            return interaction.reply({ content: `✅ Hall of Fame berichten worden voortaan geplaatst in <#${kanaal.id}>!`, ephemeral: true });
        }

        if (sub === 'dagelijkseuur') {
            const uur = interaction.options.getInteger('uur');
            botSettings.dailyHour = uur;
            saveSettings();
            return interaction.reply({ content: `✅ De dagelijkse opdracht verschijnt voortaan vanaf **${uur}:00** (Nederlandse tijd).`, ephemeral: true });
        }
    }

    // --- COMMAND: /scores (Admin) ---
    if (commandName === 'scores') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'reset_speler') {
            const targetUser = interaction.options.getUser('speler');
            writeJson(backupFile, userScores);
            
            delete userScores[targetUser.id];
            saveScores();
            getPlayer(targetUser.id).spent = 0;
            savePlayers();
            await updateFavoriteRole(interaction.guild);
            return interaction.reply({ content: `✅ De Nyla-score van **${targetUser.username}** is gereset naar 0! *(Back-up is bijgewerkt)*`, ephemeral: true });
        }

        if (sub === 'reset_alles') {
            writeJson(backupFile, userScores);
            userScores = {};
            saveScores();
            for (const id of Object.keys(playerData)) playerData[id].spent = 0;
            savePlayers();
            await updateFavoriteRole(interaction.guild);

            try {
                const targetChannel = await client.channels.fetch(botSettings.channelId);
                if (targetChannel) {
                    const sadEmbed = new EmbedBuilder()
                        .setTitle('😿 Nyla voelt zich een beetje vergeten...')
                        .setDescription('Alle scores zijn zojuist gereset! Nyla is verdrietig en kan weer helemaal opnieuw alle aandacht, aaitjes en snoepjes van de wereld gebruiken. Helpen jullie haar weer blij te maken?')
                        .setImage(sadNylaFoto)
                        .setColor('#3498db')
                        .setTimestamp();
                    await targetChannel.send({ embeds: [sadEmbed] });
                }
            } catch (err) {
                console.error('Kon globale reset-message niet sturen:', err);
            }

            return interaction.reply({ 
                content: '✅ **Alle scores zijn wereldwijd gereset naar 0!**\n💾 Er is automatisch een back-up opgeslagen (`/scores herstel_backup`).', 
                ephemeral: true 
            });
        }

        if (sub === 'herstel_backup') {
            if (!fs.existsSync(backupFile)) {
                return interaction.reply({ content: '❌ Er is nog geen back-up bestand gevonden om te herstellen!', ephemeral: true });
            }
            try {
                userScores = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
                saveScores();
                await updateFavoriteRole(interaction.guild);
                return interaction.reply({ content: '🎉 **Back-up succesvol ingeladen!** Alle oude Nyla-scores staan weer terug op hun plek.', ephemeral: true });
            } catch (err) {
                return interaction.reply({ content: '❌ Fout bij het inladen van de back-up.', ephemeral: true });
            }
        }

        if (sub === 'sluit_seizoen') {
            await interaction.reply({ content: '🏛️ Het seizoen wordt nu afgesloten... Check de Hall of Fame!', ephemeral: true });
            await closeSeason(true);
            return;
        }
    }
});

// --- OPSTARTEN ---
client.once('ready', async () => {
    console.log(`✅ Ingelogd als ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN.trim());

    try {
        const targetChannel = await client.channels.fetch(botSettings.channelId);
        
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, targetChannel.guild.id),
            { body: commands }
        );

        console.log('✅ Alle Slash Commands en nieuwe features zijn geregistreerd!');
        scheduleNextSpawn(0);

        // NIEUW: elke minuut controleren op seizoenswissel & dagelijkse opdracht
        runTimers();
        setInterval(runTimers, 60 * 1000);

    } catch (error) {
        console.error('❌ FOUT BIJ OPSTARTEN:', error);
    }
});

client.login(process.env.DISCORD_TOKEN.trim());