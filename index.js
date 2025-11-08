const { Client, GatewayIntentBits } = require('discord.js');

console.log("Bot elindult. (CSÖKKENTETT TESZT MÓD)");

// --- CSÖKKENTETT INTENTS ---
// Csak a legalapvetőbb intentet kérjük, amihez NEM kell engedély a portálon
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds 
  ]
});

// --- SIKERES BEJELENTKEZÉS ESEMÉNYE ---
client.once('ready', () => {
    console.log("==========================================================");
    console.log(`✅✅✅ SIKER! Bejelentkezve mint: ${client.user.tag}`);
    console.log("Ez 100%-BAN BIZONYÍTJA, hogy a TOKEN és az .env beállítás JÓ.");
    console.log("A hiba oka, hogy a Discord Portálon nincsenek engedélyezve");
    console.log("a 'Privileged Intents' (Presence, Members, MessageContent).");
    console.log("==========================================================");
});

// --- BOT INDÍTÁSA ÉS TOKEN ELLENŐRZÉS ---
console.log("Megpróbálok bejelentkezni a Discordba a TOKEN segítségével...");

// === DEBUG RÉSZ (Ez marad) ===
console.log("--- DEBUG START ---");
console.log("Render .env-ből olvasott TOKEN változó:");
console.log(process.env.TOKEN);
console.log("--- DEBUG VÉGE ---");
// === DEBUG RÉSZ VÉGE ===

client.login(process.env.TOKEN)
  .then(() => {
    // Ez akkor fut le, ha a token formaiag HElYES
    console.log("✅ TOKEN ELFOGADVA (CSÖKKENTETT MÓD): Várakozás a 'Ready' eseményre...");
  })
  .catch((error) => {
    // Ez akkor fut le, ha a token HIBÁS
    console.error("❌ TOKEN HIBA (CSÖKKENTETT MÓD): A bot nem tudott bejelentkezni!");
    console.error(`Részletes hiba: ${error.message}`);
  });
