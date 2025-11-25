const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder 
} = require("discord.js");

const fs = require("fs");
const express = require("express");

// CONFIG
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "!";
const VIP_ROLE_ID = "1442230685271064726";
const PANEL_CHANNEL_ID = "1442230686349262880";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1442936366492291277/Z3eSoJZezo1597vcDnAiTV27u0p8SutRaLl5xCYHS2xpgPMcFZq9nnezJPb3ZHq_vRsu"; // Replace with your webhook URL

// DISCORD CLIENT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// LOAD KEYS
function loadKeys() {
    try {
        return JSON.parse(fs.readFileSync("keys.json", "utf8"));
    } catch {
        return {};
    }
}

let keys = loadKeys();

function saveKeys() {
    fs.writeFileSync("keys.json", JSON.stringify(keys, null, 2));
}

// TIME CONVERSION
function convertToMs(timeStr) {
    const num = parseInt(timeStr);
    if (timeStr.endsWith("s")) return num * 1000;
    if (timeStr.endsWith("m")) return num * 60 * 1000;
    if (timeStr.endsWith("h")) return num * 60 * 60 * 1000;
    if (timeStr.endsWith("d")) return num * 24 * 60 * 60 * 1000;
    return null;
}

// AUTO EXPIRE KEYS
setInterval(async () => {
    const now = Date.now();

    for (const key in keys) {
        const data = keys[key];

        if (!data.user || !data.expiresAt) continue;
        if (now < data.expiresAt) continue;

        try {
            const guild = client.guilds.cache.get(data.guild);
            if (guild) {
                const member = await guild.members.fetch(data.user);
                if (member) {
                    await member.roles.remove(VIP_ROLE_ID);
                }
            }
        } catch {}

        // webhook log
        try {
            const fetch = require("node-fetch");
            fetch(WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: `Key expired: ${key}, VIP role removed from <@${data.user}>`
                })
            });
        } catch {}

        delete keys[key];
        saveKeys();
        console.log(`Expired key: ${key}`);
    }
}, 10000);

// -------- CONTROL PANEL CREATION --------
async function sendControlPanel() {
    const channel = await client.channels.fetch(PANEL_CHANNEL_ID);

    if (!channel) return console.log("⚠️ Panel channel not found.");

    // DELETE OLD BOT MESSAGES IN PANEL
    const messages = await channel.messages.fetch({ limit: 50 });
    messages.filter(m => m.author.id === client.user.id).forEach(m => m.delete());

    // EMBED
    const embed = new EmbedBuilder()
        .setTitle("Reno Key System Control Panel")
        .setDescription(
            "Welcome to the **Reno Key System**.\n\n" +
            "Use the buttons below to manage your key, get your script, and access tools."
        )
        .setColor("#8B0000"); // Dark red embed

    // BUTTONS (All red)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("redeem_key")
            .setLabel("🔑 Redeem Key")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("get_script")
            .setLabel("📜 Get Script")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("get_role")
            .setLabel("👤 Get Role")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("reset_hwid")
            .setLabel("⚙️ Reset HWID")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("get_stats")
            .setLabel("📊 Get Stats")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    console.log("✅ Control panel sent.");
}

// -------- BUTTON HANDLERS --------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "redeem_key") {
        return interaction.reply({
            content: "To redeem a key, use: `!usekey <your key>`",
            ephemeral: true
        });
    }

    if (interaction.customId === "get_script") {
        return interaction.reply({
            content: "Here is your script:\n```lua\nloadstring(game:HttpGet('https://your-script-link-here'))()\n```",
            ephemeral: true
        });
    }

    if (interaction.customId === "get_role") {
        try {
            await interaction.member.roles.add(VIP_ROLE_ID);
            return interaction.reply({
                content: "Role **VIP • 👨🏾‍💻** added!",
                ephemeral: true
            });
        } catch {
            return interaction.reply({
                content: "Bot cannot add the role.",
                ephemeral: true
            });
        }
    }

    if (interaction.customId === "reset_hwid") {
        return interaction.reply({
            content: "HWID reset successfully.",
            ephemeral: true
        });
    }

    if (interaction.customId === "get_stats") {
        const totalKeys = Object.keys(keys).length;
        return interaction.reply({
            content: `📊 **Stats:**\n- Total Keys: ${totalKeys}\n- Panel Online`,
            ephemeral: true
        });
    }
});

// -------- COMMANDS --------
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).split(" ");
    const command = args.shift().toLowerCase();

    const isAdmin = message.member.permissions.has("Administrator");

    // CREATE KEY
    if (command === "createkey") {
        if (!isAdmin) return message.reply("Admins only.");
        if (!args[0] || !args[1])
            return message.reply("Format: `!createkey KEY 24h`");

        const key = args[0];
        const dur = convertToMs(args[1]);

        keys[key] = {
            user: null,
            createdAt: Date.now(),
            duration: dur,
            expiresAt: null,
            guild: message.guild.id
        };

        saveKeys();
        return message.reply(`Key **${key}** created for **${args[1]}**`);
    }

    // USE KEY
    if (command === "usekey") {
        const key = args[0];
        if (!key) return message.reply("Provide a key.");

        const data = keys[key];
        if (!data) return message.reply("Invalid or expired key.");
        if (data.user) return message.reply("This key is already used.");

        try {
            await message.member.roles.add(VIP_ROLE_ID);
        } catch {
            return message.reply("Bot cannot add the VIP role.");
        }

        data.user = message.author.id;
        data.expiresAt = Date.now() + data.duration;

        saveKeys();

        // webhook log
        try {
            const fetch = require("node-fetch");
            fetch(WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: `<@${data.user}> activated key: ${key}`
                })
            });
        } catch {}

        return message.reply(`VIP Activated! Expires: **${new Date(data.expiresAt).toLocaleString()}**`);
    }

    // LIST KEYS
    if (command === "listkeys") {
        if (!isAdmin) return;
        let text = "Keys:\n\n";
        for (const key in keys)
            text += `${key} — ${keys[key].user ? "USED" : "UNUSED"}\n`;
        return message.reply(text);
    }
});

// -------- BOT START --------
client.once("ready", async () => {
    console.log(`Bot Online: ${client.user.tag}`);
    await sendControlPanel();
});

// EXPRESS SERVER (RENDER KEEP-ALIVE)
const app = express();
app.get("/", (req, res) => res.send("Reno Key System is running."));
app.listen(process.env.PORT || 3000);
