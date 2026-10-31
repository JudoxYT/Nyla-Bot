// =====================================================================
//  makeover.js — Server makeover (retro sci-fi thema), zonder AI
//  Gebruikt door bot.js via: /makeover voorbeeld | toepassen | terugdraaien ...
//  De bot herkent trefwoorden in namen en kiest een passende thema-naam.
// =====================================================================
const fs = require('fs');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

// --- OPSLAG ---
const makeoverFile = './makeover.json';
let makeoverData = {
    plan: null,        // Het laatst gemaakte voorbeeld (wacht op /makeover toepassen)
    backup: {},        // id -> { kind, name } : de ORIGINELE namen, voor terugdraaien
    excludedIds: []    // Kanalen/rollen die de bot nooit mag aanpassen
};

try {
    if (fs.existsSync(makeoverFile)) {
        makeoverData = { ...makeoverData, ...JSON.parse(fs.readFileSync(makeoverFile, 'utf8')) };
        console.log('🎨 Makeover-data ingeladen vanuit makeover.json');
    }
} catch (e) {
    console.error('❌ Fout bij lezen makeover.json, start leeg:', e);
}

function saveMakeover() {
    const tmp = makeoverFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(makeoverData, null, 2));
    fs.renameSync(tmp, makeoverFile);
}

let makeoverRunning = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// --- FONTS (Unicode-letters, geen echte fonts) ---
const SMALL_CAPS = Array.from('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ');
const fontStyles = {
    fraktur: { upper: 0x1D56C, lower: 0x1D586 }, // 𝕭𝖔𝖑𝖉 𝕲𝖔𝖙𝖍𝖎𝖈
    script:  { upper: 0x1D4D0, lower: 0x1D4EA }  // 𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽
};

function toFont(text, font) {
    if (!font || font === 'geen') return text;
    let out = '';
    for (const ch of text) {
        const code = ch.codePointAt(0);
        const isUpper = code >= 65 && code <= 90;
        const isLower = code >= 97 && code <= 122;
        if (!isUpper && !isLower) { out += ch; continue; }
        const idx = isUpper ? code - 65 : code - 97;
        if (font === 'smallcaps') {
            out += SMALL_CAPS[idx];
        } else if (fontStyles[font]) {
            out += String.fromCodePoint((isUpper ? fontStyles[font].upper : fontStyles[font].lower) + idx);
        } else {
            out += ch;
        }
    }
    return out;
}

// =====================================================================
//  THEMA-SET: originele namen in een 80s sci-fi/mysterie sfeer
//  (neon, arcades, walkietalkies, geheime labs, VHS, mist, kerstlampjes)
//  Pas dit gerust aan of vul het aan met eigen namen!
// =====================================================================

// Kanalen & categorieën: herkende trefwoorden -> thema-namen per type
const themeTable = [
    { keys: ['afk', 'idle', 'slaap'], emoji: '💤',
      voice: ['Slaapzak in de Schuur', 'Sluimerhoek', 'Schemerslaap'],
      text: ['Slaapzaal'] },
    { keys: ['staff', 'mod', 'admin', 'beheer', 'team'], emoji: '🔒',
      text: ['Afgesloten Lab', 'Achterkamer', 'Geheime Basis', 'Nachtwachtpost'],
      voice: ['Vergaderbunker', 'Fluisterkelder'],
      category: ['Geheim Gebied', 'De Controlekamer'] },
    { keys: ['welkom', 'welcome', 'intro', 'hallo', 'hello', 'verify', 'verifi'], emoji: '🚪',
      text: ['Het Neonhek', 'Voordeur op een Kier', 'Welkomstlicht', 'Bij het Hek'],
      voice: ['Wachtkamer'],
      category: ['De Poort', 'Aankomsthal'] },
    { keys: ['regel', 'rules', 'protocol', 'voorschrift'], emoji: '📋',
      text: ['Het Protocol', 'Labvoorschriften', 'Het Logboek van de Regels', 'Huisregels van de Basis'] },
    { keys: ['aankondig', 'announce', 'nieuws', 'news', 'update', 'bekendmaking'], emoji: '📡',
      text: ['Radiomast', 'Noodfrequentie', 'De Zendmast', 'Berichten uit de Mist'] },
    { keys: ['info', 'faq', 'uitleg', 'gids', 'guide'], emoji: '🗂️',
      text: ['Het Dossier', 'Archiefkast', 'De Kaartenkamer'],
      category: ['Het Dossier', 'Archiefvleugel'] },
    { keys: ['event', 'evenement', 'giveaway', 'feest', 'toernooi', 'tournament'], emoji: '🎪',
      text: ['Kermis in de Mist', 'Lichtjesfeest', 'Zomerkampvuur', 'Het Grote Spektakel'],
      voice: ['De Kermistent'],
      category: ['De Kermis', 'Festivalterrein'] },
    { keys: ['stream', 'live', 'twitch', 'youtube', 'kijk'], emoji: '📺',
      text: ['Tv-Ruis', 'Antennebeeld', 'De Bioscoopzaal'],
      voice: ['De Projectorkamer', 'Het Filmdoek'] },
    { keys: ['muziek', 'music', 'radio', 'playlist', 'spotify', 'dj', 'lofi'], emoji: '🎧',
      text: ['Walkman-Zone', 'Cassettedek', 'Synthgolf', 'De Jukebox'],
      voice: ['Draaitafelkamer', 'De Jukebox', 'Synthgolf'],
      category: ['Frequentieband', 'De Jukebox'] },
    { keys: ['game', 'gaming', 'spel', 'play', 'minecraft', 'fortnite', 'valorant', 'roblox'], emoji: '🕹️',
      text: ['De Speelhal', 'Arcadekast', 'Joystick-Kelder', 'Muntje Erin'],
      voice: ['Co-op Kelder', 'Arcade-Hoek', 'De Speelhal'],
      category: ['De Speelhal', 'Joystick-Sector'] },
    { keys: ['meme', 'humor', 'fun', 'grap', 'offtopic', 'off topic', 'random', 'shitpost'], emoji: '📼',
      text: ['VHS-Hoekje', 'De Videotheek', 'Kauwgomautomaat', 'Rommelzolder'],
      category: ['De Videotheek'] },
    { keys: ['media', 'foto', 'pic', 'art', 'kunst', 'screenshot', 'clip', 'video', 'creatie', 'creative'], emoji: '📸',
      text: ['Donkere Kamer', 'Polaroidmuur', 'Dia-Projector', 'Fotoalbum van de Buurt'],
      category: ['Donkere Kamer', 'De Galerij'] },
    { keys: ['bot', 'command', 'cmd', 'commando'], emoji: '🖥️',
      text: ['Terminalruimte', 'Pixelconsole', 'Het Controlepaneel', 'Servohoek'] },
    { keys: ['support', 'help', 'hulp', 'vragen', 'vraag', 'ticket', 'klacht'], emoji: '📻',
      text: ['Walkietalkie-Helpdesk', 'Noodlijn', 'Meldkamer', 'Het Loket'],
      category: ['Hulpdienst', 'De Meldkamer'] },
    { keys: ['nyla', 'kat', 'cat', 'poes'], emoji: '🐱',
      text: ['Schuilplaats van Nyla', 'Het Kattenmandje', 'Nyla\'s Dakraam'] },
    { keys: ['algemeen', 'general', 'chat', 'praat', 'lounge', 'main', 'hoofd', 'community', 'gezellig'], emoji: '🔦',
      text: ['De Garage', 'Zolderkamer', 'Het Hoofdkwartier', 'Kelderbar', 'De Schuur'],
      voice: ['Kampvuurkring', 'De Garage', 'Zolderpraat'],
      category: ['De Buurt', 'Het Hoofdkwartier'] },
    { keys: ['voice', 'spraak', 'praten', 'call', 'bellen', 'gesprek', 'talk'], emoji: '🎙️',
      voice: ['Draadloze Lijn', 'Walkietalkie-Kanaal', 'Schemerfrequentie', 'Fluisterlijn'],
      text: ['Frequentie-Notities'],
      category: ['Frequenties', 'De Radiokamer'] }
];

// Rollen: herkende trefwoorden -> thema-namen
const roleTable = [
    { keys: ['owner', 'eigenaar', 'founder', 'oprichter', 'ceo'], emoji: '👁️',
      names: ['Labdirecteur', 'Poortwachter van de Basis', 'Hoofd van het Lab'] },
    { keys: ['admin', 'beheerder', 'administrator'], emoji: '🛡️',
      names: ['Systeembeheerder', 'Netwerkbaas', 'Meester van de Schakelkast'] },
    { keys: ['mod', 'staff', 'moderator', 'team'], emoji: '🔦',
      names: ['Nachtwacht', 'Patrouille-Agent', 'Buurtwacht', 'Lab-Inspecteur'] },
    { keys: ['helper', 'support', 'hulp'], emoji: '📻',
      names: ['Walkietalkie-Wacht', 'Hulpdienst', 'Noodlijn-Bemanner'] },
    { keys: ['vip', 'booster', 'boost', 'nitro', 'supporter', 'donator', 'donor', 'premium', 'patron'], emoji: '💡',
      names: ['Neonlicht', 'Gouden Cassette', 'Kerstlicht-Ambassadeur', 'Lichtdrager'] },
    { keys: ['favoriet', 'kampioen', 'champion', 'winnaar', 'top'], emoji: '🏆',
      names: ['Speelhal-Kampioen', 'Hoogste Score', 'Heer van de Joystick'] },
    { keys: ['bot'], emoji: '🤖',
      names: ['Servo-Eenheid', 'Robotarm', 'Automaat'] },
    { keys: ['new', 'nieuw', 'newbie', 'gast', 'guest'], emoji: '🌫️',
      names: ['Nieuwkomer in de Mist', 'Gast in de Garage', 'Verdwaalde Fietser'] },
    { keys: ['member', 'lid', 'leden', 'verified', 'verif', 'speler', 'player'], emoji: '🚲',
      names: ['Buurtbewoner', 'Kampmaat', 'Bewoner van de Buitenwijk', 'Vaste Gast'] }
];

// Fallbacks voor alles wat geen trefwoord heeft
const fallback = {
    text: {
        emojis: ['🔦', '🌫️', '💡', '🚲', '🔭', '🧭'],
        names: ['Mistzone', 'Lichtstraat', 'Achterbuurt', 'Dimensiegang', 'Neonsteeg', 'Fietspad naar Nergens',
                'Veldhut', 'Dakterras', 'Rommelzolder', 'Kerstlampjesgang', 'Bosrand', 'Het Tussenstuk']
    },
    voice: {
        emojis: ['🎙️', '📻', '🔊', '📡'],
        names: ['Kampvuurkring', 'Draadloze Lijn', 'Schemerfrequentie', 'Ruisband', 'Kabelkamer', 'Zendbereik', 'Fluisterlijn']
    },
    category: {
        emojis: ['🌫️', '🧪', '🏘️', '🎞️', '🌙'],
        names: ['De Buitenwijk', 'Laboratoriumvleugel', 'Het Centrum', 'Speelkamer', 'Nachtploeg',
                'Kelderverdieping', 'De Randgebieden', 'Zomerkamp']
    },
    role: {
        emojis: ['🔦', '🧪', '🌙', '📼', '🚲'],
        names: ['Schaduwloper', 'Lichtdrager', 'Nachtbraker', 'Zolderwacht', 'Neonreiziger', 'Kelderkenner', 'Mistwandelaar']
    }
};

// --- HULPFUNCTIES VOOR NAMEN ---
function normalize(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanOriginal(s) {
    return String(s).replace(/[^\p{L}\p{N} _-]/gu, ' ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickTheme(item, usedThemes) {
    const norm = normalize(item.original);
    const isRole = item.kind === 'role';
    const table = isRole ? roleTable : themeTable;
    const listOf = e => isRole ? e.names : e[item.kind];

    const entry = table.find(e => listOf(e) && e.keys.some(k => norm.includes(k)));
    let name = null;
    let emoji = entry ? entry.emoji : null;

    if (entry) {
        const free = listOf(entry).filter(n => !usedThemes.has(`${item.kind}:${n}`));
        if (free.length) name = rand(free);
    }
    if (!name) {
        const fb = fallback[item.kind];
        const free = fb.names.filter(n => !usedThemes.has(`${item.kind}:${n}`));
        name = rand(free.length ? free : fb.names);
    }
    if (!emoji) emoji = rand(fallback[item.kind].emojis);

    usedThemes.add(`${item.kind}:${name}`);
    return { name, emoji };
}

function composeName(kind, emoji, themed, original, sfeer, font) {
    const orig = cleanOriginal(original);
    let core;
    if (sfeer === 'subtiel') core = orig || themed;
    else if (sfeer === 'vol') core = themed;
    else core = orig && normalize(orig) !== normalize(themed) ? `${themed}・${orig}` : themed;

    const styled = toFont(core, font);
    let out;
    if (kind === 'category') out = `─ ${emoji} ${styled} ─`;
    else if (kind === 'role') out = `${emoji} ${styled}`;
    else out = `${emoji}│${styled}`;

    if (kind === 'text') out = out.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-');
    return Array.from(out.replace(/`/g, '')).slice(0, 100).join('');
}

// --- ITEMS VERZAMELEN ---
async function collectItems(guild) {
    const items = [];
    let skipped = 0;
    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();

    const kindOf = {
        [ChannelType.GuildText]: 'text',
        [ChannelType.GuildAnnouncement]: 'text',
        [ChannelType.GuildForum]: 'text',
        [ChannelType.GuildVoice]: 'voice',
        [ChannelType.GuildStageVoice]: 'voice',
        [ChannelType.GuildCategory]: 'category'
    };
    const backup = makeoverData.backup;

    for (const [id, ch] of channels) {
        if (!ch) continue;
        const kind = kindOf[ch.type];
        if (!kind) continue;
        if (makeoverData.excludedIds.includes(id)) continue;
        if (!ch.manageable) { skipped++; continue; }
        items.push({
            id, kind,
            current: ch.name,
            original: backup[id]?.name || ch.name // altijd vanaf de ORIGINELE naam werken
        });
    }

    for (const [id, role] of roles) {
        if (id === guild.id || role.managed) continue;
        if (makeoverData.excludedIds.includes(id)) continue;
        if (!role.editable) { skipped++; continue; }
        items.push({
            id, kind: 'role',
            current: role.name,
            original: backup[id]?.name || role.name
        });
    }

    // Categorieën eerst, dan de rest
    const order = { category: 0, text: 1, voice: 2, role: 3 };
    items.sort((a, b) => order[a.kind] - order[b.kind]);
    return { items: items.slice(0, 200), skipped, capped: items.length > 200 };
}

async function buildPlan(guild, sfeer, font) {
    const { items, skipped, capped } = await collectItems(guild);
    if (!items.length) throw new Error('GEEN_ITEMS');

    const usedThemes = new Set();
    const usedFinal = new Set();

    const planItems = items.map(it => {
        const t = pickTheme(it, usedThemes);
        let newName = composeName(it.kind, t.emoji, t.name, it.original, sfeer, font);

        // Dubbele namen voorkomen
        const sep = it.kind === 'text' ? '-' : ' ';
        let candidate = newName;
        let n = 2;
        while (usedFinal.has(`${it.kind}:${candidate.toLowerCase()}`)) {
            candidate = `${newName}${sep}${n++}`;
        }
        usedFinal.add(`${it.kind}:${candidate.toLowerCase()}`);

        return { id: it.id, kind: it.kind, currentName: it.current, oldName: it.original, newName: candidate };
    });

    return { guildId: guild.id, createdAt: Date.now(), sfeer, font, skipped, capped, items: planItems };
}

// --- BEVESTIGING MET KNOPPEN ---
async function askConfirm(interaction, text, confirmLabel) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mk_yes').setLabel(confirmLabel).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('mk_no').setLabel('Annuleren').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: text, components: [row], ephemeral: true });
    const msg = await interaction.fetchReply();
    try {
        const click = await msg.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            time: 60000
        });
        if (click.customId === 'mk_yes') {
            await click.update({ content: '⏳ Bezig met uitvoeren... Je krijgt een bericht in dit kanaal als het klaar is.', components: [] });
            return true;
        }
        await click.update({ content: '❎ Geannuleerd. Er is niets veranderd.', components: [] });
        return false;
    } catch {
        await interaction.editReply({ content: '⌛ Geen reactie ontvangen. Geannuleerd, er is niets veranderd.', components: [] }).catch(() => {});
        return false;
    }
}

// --- UITVOEREN ---
async function fetchTarget(guild, item) {
    return item.kind === 'role'
        ? guild.roles.fetch(item.id).catch(() => null)
        : guild.channels.fetch(item.id).catch(() => null);
}

async function runApply(guild, channel) {
    makeoverRunning = true;
    const plan = makeoverData.plan;
    let ok = 0, skipped = 0;
    const failed = [];

    try {
        for (const it of plan.items) {
            try {
                const obj = await fetchTarget(guild, it);
                if (!obj || obj.name === it.newName) { skipped++; continue; }

                // Originele naam veiligstellen VOORDAT we hernoemen
                if (!makeoverData.backup[it.id]) {
                    makeoverData.backup[it.id] = { kind: it.kind, name: obj.name };
                    saveMakeover();
                }
                await obj.setName(it.newName, 'Nyla Makeover');
                ok++;
            } catch (err) {
                failed.push(`${it.currentName}: ${String(err.message).slice(0, 80)}`);
            }
            await sleep(300);
        }
    } finally {
        makeoverData.plan = null;
        saveMakeover();
        makeoverRunning = false;
    }

    const embed = new EmbedBuilder()
        .setTitle('🎨 Makeover voltooid!')
        .setColor(failed.length ? '#e67e22' : '#2ecc71')
        .setDescription(`✅ Aangepast: **${ok}**\n⏭️ Overgeslagen: **${skipped}**\n❌ Mislukt: **${failed.length}**` +
            (failed.length ? `\n\n${failed.slice(0, 8).map(f => `• ${f}`).join('\n')}` : '') +
            `\n\nNiet blij? Gebruik \`/makeover terugdraaien\`.`)
        .setTimestamp();
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

async function runRevert(guild, channel) {
    makeoverRunning = true;
    let ok = 0, skipped = 0;
    const failed = [];

    try {
        for (const [id, b] of Object.entries(makeoverData.backup)) {
            try {
                const obj = await fetchTarget(guild, { id, kind: b.kind });
                if (!obj) { delete makeoverData.backup[id]; saveMakeover(); skipped++; continue; }
                if (obj.name !== b.name) {
                    await obj.setName(b.name, 'Nyla Makeover terugdraaien');
                    ok++;
                } else {
                    skipped++;
                }
                delete makeoverData.backup[id];
                saveMakeover();
            } catch (err) {
                failed.push(`${b.name}: ${String(err.message).slice(0, 80)}`);
            }
            await sleep(300);
        }
    } finally {
        makeoverRunning = false;
    }

    const embed = new EmbedBuilder()
        .setTitle('↩️ Makeover teruggedraaid')
        .setColor(failed.length ? '#e67e22' : '#3498db')
        .setDescription(`✅ Hersteld: **${ok}**\n⏭️ Overgeslagen: **${skipped}**\n❌ Mislukt: **${failed.length}**` +
            (failed.length ? `\n\n${failed.slice(0, 8).map(f => `• ${f}`).join('\n')}\n*(Mislukte items blijven in de back-up staan; probeer het later opnieuw.)*` : ''))
        .setTimestamp();
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

// --- VOORBEELD WEERGEVEN ---
function chunkLines(lines, max = 3800) {
    const chunks = [];
    let cur = '';
    for (const l of lines) {
        if ((cur + l + '\n').length > max) { chunks.push(cur); cur = ''; }
        cur += l + '\n';
    }
    if (cur) chunks.push(cur);
    return chunks;
}

async function showPreview(interaction, plan) {
    const changed = plan.items.filter(i => i.newName !== i.currentName);
    const groups = [
        ['category', '📁 **Categorieën**'],
        ['text', '💬 **Tekstkanalen**'],
        ['voice', '🔊 **Spraakkanalen**'],
        ['role', '🎭 **Rollen**']
    ];

    const lines = [];
    for (const [kind, title] of groups) {
        const list = changed.filter(i => i.kind === kind);
        if (!list.length) continue;
        lines.push(title);
        for (const i of list) lines.push(`\`${i.currentName}\` → \`${i.newName}\``);
        lines.push('');
    }

    const chunks = chunkLines(lines).slice(0, 8);
    const unchanged = plan.items.length - changed.length;
    const footer =
        `${changed.length} wijzigingen` +
        (unchanged ? ` • ${unchanged} ongewijzigd` : '') +
        (plan.skipped ? ` • ${plan.skipped} overgeslagen (geen rechten/rolpositie)` : '') +
        (plan.capped ? ' • maximaal 200 items per makeover' : '') +
        ' • Niet tevreden? Draai /makeover voorbeeld opnieuw voor andere namen.';

    const embeds = chunks.map((c, i) => {
        const e = new EmbedBuilder().setColor('#c0392b').setDescription(c);
        if (i === 0) e.setTitle('🔦 Makeover voorbeeld — er is nog NIETS veranderd');
        if (i === chunks.length - 1) e.setFooter({ text: footer });
        return e;
    });

    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) {
        await interaction.followUp({ embeds: [embeds[i]], ephemeral: true });
    }
    await interaction.followUp({
        content: '✅ Tevreden? Gebruik **`/makeover toepassen`**. Alle originele namen worden eerst veiliggesteld, dus je kunt altijd **`/makeover terugdraaien`**.',
        ephemeral: true
    });
}

// --- COMMAND DEFINITIE ---
const makeoverCommand = new SlashCommandBuilder()
    .setName('makeover')
    .setDescription('[Admin] Geef je server een retro sci-fi thema (kanalen & rollen).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName('voorbeeld')
           .setDescription('Bekijk de nieuwe namen (er wordt nog niets aangepast).')
           .addStringOption(o => o.setName('sfeer').setDescription('Hoe sterk moet het thema zijn?')
               .addChoices(
                   { name: 'Subtiel (eigen naam + emoji)', value: 'subtiel' },
                   { name: 'Gebalanceerd (themanaam + eigen naam, standaard)', value: 'gebalanceerd' },
                   { name: 'Volledig thema (alleen themanaam)', value: 'vol' }))
           .addStringOption(o => o.setName('font').setDescription('Welke lettersoort? (Unicode-letters)')
               .addChoices(
                   { name: 'ᴋʟᴇɪɴᴇ ʜᴏᴏꜰᴅʟᴇᴛᴛᴇʀꜱ (standaard)', value: 'smallcaps' },
                   { name: '𝕲𝖔𝖙𝖍𝖎𝖘𝖈𝖍', value: 'fraktur' },
                   { name: '𝓢𝓬𝓻𝓲𝓹𝓽', value: 'script' },
                   { name: 'Gewone letters', value: 'geen' })))
    .addSubcommand(sub =>
        sub.setName('toepassen').setDescription('Pas het laatste voorbeeld toe op de server (met bevestiging en back-up).'))
    .addSubcommand(sub =>
        sub.setName('terugdraaien').setDescription('Zet alle originele namen terug uit de back-up.'))
    .addSubcommand(sub =>
        sub.setName('uitsluiten').setDescription('Sluit een kanaal of rol uit van de makeover.')
           .addChannelOption(o => o.setName('kanaal').setDescription('Kanaal of categorie'))
           .addRoleOption(o => o.setName('rol').setDescription('Rol')))
    .addSubcommand(sub =>
        sub.setName('insluiten').setDescription('Haal een kanaal of rol weer uit de uitsluitlijst.')
           .addChannelOption(o => o.setName('kanaal').setDescription('Kanaal of categorie'))
           .addRoleOption(o => o.setName('rol').setDescription('Rol')))
    .addSubcommand(sub =>
        sub.setName('status').setDescription('Bekijk de status van de makeover-functie.'));

// --- COMMAND AFHANDELING ---
async function handleMakeover(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (!guild) {
        return interaction.reply({ content: '❌ Dit command werkt alleen in een server.', ephemeral: true });
    }

    // STATUS
    if (sub === 'status') {
        const plan = makeoverData.plan;
        const minutes = plan ? Math.round((Date.now() - plan.createdAt) / 60000) : 0;
        const embed = new EmbedBuilder()
            .setTitle('🎨 Makeover status')
            .setColor('#9b59b6')
            .addFields(
                { name: '📝 Openstaand voorbeeld', value: plan ? `${plan.items.length} items (${minutes} min geleden)` : 'Geen', inline: true },
                { name: '💾 Back-up', value: `${Object.keys(makeoverData.backup).length} originele namen`, inline: true },
                { name: '🚫 Uitgesloten', value: `${makeoverData.excludedIds.length} items`, inline: true },
                { name: '⚙️ Bezig?', value: makeoverRunning ? 'Ja' : 'Nee', inline: true }
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // UITSLUITEN / INSLUITEN
    if (sub === 'uitsluiten' || sub === 'insluiten') {
        const ch = interaction.options.getChannel('kanaal');
        const role = interaction.options.getRole('rol');
        if (!ch && !role) {
            return interaction.reply({ content: '❌ Kies een kanaal of een rol.', ephemeral: true });
        }
        const ids = [ch?.id, role?.id].filter(Boolean);

        if (sub === 'uitsluiten') {
            for (const id of ids) if (!makeoverData.excludedIds.includes(id)) makeoverData.excludedIds.push(id);
            if (makeoverData.plan) makeoverData.plan.items = makeoverData.plan.items.filter(i => !ids.includes(i.id));
        } else {
            makeoverData.excludedIds = makeoverData.excludedIds.filter(id => !ids.includes(id));
        }
        saveMakeover();
        const namen = [ch ? `<#${ch.id}>` : null, role ? `<@&${role.id}>` : null].filter(Boolean).join(' en ');
        return interaction.reply({
            content: sub === 'uitsluiten'
                ? `🚫 ${namen} wordt niet meer aangepast door de makeover.`
                : `✅ ${namen} doet weer mee met de makeover.`,
            ephemeral: true
        });
    }

    if (makeoverRunning) {
        return interaction.reply({ content: '⏳ Er is al een makeover bezig. Wacht tot die klaar is.', ephemeral: true });
    }

    // VOORBEELD
    if (sub === 'voorbeeld') {
        const sfeer = interaction.options.getString('sfeer') || 'gebalanceerd';
        const font = interaction.options.getString('font') || 'smallcaps';

        await interaction.deferReply({ ephemeral: true });
        try {
            const plan = await buildPlan(guild, sfeer, font);
            makeoverData.plan = plan;
            saveMakeover();
            return showPreview(interaction, plan);
        } catch (err) {
            if (err.message === 'GEEN_ITEMS') {
                return interaction.editReply('❌ Ik vond niets wat ik mag aanpassen. Check of de rol van de bot **boven** je andere rollen staat en "Kanalen beheren" + "Rollen beheren" heeft.');
            }
            console.error('❌ Makeover-fout:', err);
            return interaction.editReply(`❌ Er ging iets mis: ${String(err.message).slice(0, 300)}`);
        }
    }

    // TOEPASSEN
    if (sub === 'toepassen') {
        const plan = makeoverData.plan;
        if (!plan || plan.guildId !== guild.id) {
            return interaction.reply({ content: '❌ Er is geen voorbeeld. Gebruik eerst `/makeover voorbeeld`.', ephemeral: true });
        }
        if (Date.now() - plan.createdAt > 24 * 60 * 60 * 1000) {
            return interaction.reply({ content: '⌛ Dit voorbeeld is ouder dan 24 uur en kan verouderd zijn. Maak een nieuw voorbeeld met `/makeover voorbeeld`.', ephemeral: true });
        }
        const aantal = plan.items.filter(i => i.newName !== i.currentName).length;
        const yes = await askConfirm(
            interaction,
            `⚠️ Je staat op het punt **${aantal}** kanalen/rollen te hernoemen. Originele namen worden eerst opgeslagen, dus je kunt dit terugdraaien.\n\nDoorgaan?`,
            `Ja, pas ${aantal} namen aan`
        );
        if (!yes) return;
        runApply(guild, interaction.channel).catch(err => console.error('❌ Fout tijdens makeover:', err));
        return;
    }

    // TERUGDRAAIEN
    if (sub === 'terugdraaien') {
        const aantal = Object.keys(makeoverData.backup).length;
        if (aantal === 0) {
            return interaction.reply({ content: '❌ Er is geen back-up om terug te zetten.', ephemeral: true });
        }
        const yes = await askConfirm(
            interaction,
            `↩️ Alle **${aantal}** originele namen worden teruggezet. Doorgaan?`,
            'Ja, zet alles terug'
        );
        if (!yes) return;
        runRevert(guild, interaction.channel).catch(err => console.error('❌ Fout tijdens terugdraaien:', err));
        return;
    }
}

module.exports = { makeoverCommand, handleMakeover };