const axios = require('axios');

// === Render API beállítások (Újraindítás) ===
const serviceId = 'srv-d3qvpugdl3ps73c98uv0';  // A te service ID-d
const apiKey = 'rnd_pR1kXxJRrTxRCGXoTiPZ00aCjcG3'; // A te API kulcsod
const restartUrl = `https://api.render.com/v1/services/${serviceId}/restart`;

// === "Keep-Alive" Ping beállítások ===
const ANTILINK_URL = 'https://status-monitor-fsj4.onrender.com'; // A te weboldalad URL-je

// === ÚJ: Újrapróbálkozás beállítása ===
const RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 perc (ennyi időnként próbálja újra hiba esetén)


// --- 1. ÚJRAINDÍTÓ FUNKCIÓ (Frissítve retry logikával) ---

/**
 * Ez a függvény megpróbálja újraindítani a szolgáltatást.
 * Ha sikerül (200-as státuszkód), akkor befejezi.
 * Ha nem sikerül, 1 perc múlva (RETRY_INTERVAL_MS) újrapróbálja.
 */
async function attemptRestart() {
  console.log('[RESTART] Újraindítási parancs küldésének megkísérlése...');
  
  try {
    const response = await axios.post(restartUrl, {}, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      // SIKERES ESET
      console.log('[RESTART] Az újraindítási parancs sikeresen elküldve. A szkript most újraindul.');
      // Nincs teendő, a Render újraindítja ezt a szkriptet is.
      // A következő kísérlet a fő 12 órás időzítővel fog elindulni.
    } else {
      // SIKERTELEN ESET (nem 200-as válasz)
      console.warn(`[RESTART] Hiba (nem 200-as státusz): ${response.status}. Újrapróbálkozás ${RETRY_INTERVAL_MS / 1000} másodperc múlva.`);
      setTimeout(attemptRestart, RETRY_INTERVAL_MS); // Újrapróbálkozás
    }

  } catch (error) {
    // SIKERTELEN ESET (hálózati hiba, API hiba stb.)
    console.error(`[RESTART] Hiba történt az újraindító API hívás során. Újrapróbálkozás ${RETRY_INTERVAL_MS / 1000} másodperc múlva.`);
    
    if (error.response) {
      console.error(`[RESTART] Hiba adatai: ${JSON.stringify(error.response.data)}`);
      console.error(`[RESTART] Státusz: ${error.response.status}`);
    } else if (error.request) {
      console.error('[RESTART] Nem érkezett válasz a Render API-tól.');
    } else {
      console.error(`[RESTART] Ismeretlen hiba: ${error.message}`);
    }

    // Ütemezzük az újrapróbálkozást
    setTimeout(attemptRestart, RETRY_INTERVAL_MS);
  }
}

// --- 2. "PING" FUNKCIÓ (3 percenként) ---
const pingSelf = () => {
  if (!ANTILINK_URL || !ANTILINK_URL.startsWith('srv-d3qvpugdl3ps73c98uv0')) {
    console.log('[PING] Az ANTILINK_URL nincs (jól) beállítva. A "ping" funkció ki van kapcsolva.');
    return;
  }

  axios.get(ANTILINK_URL)
    .then(response => {
      console.log(`[PING] Ping sikeres (Státusz: ${response.status}). A bot ébren van.`);
    })
    .catch(error => {
      console.error(`[PING] Hiba a "ping" során: ${error.message}`);
    });
};

// --- IDŐZÍTŐK BEÁLLÍTÁSA ---

// 1. 12 óránkénti újraindítás indítása
// Ez az időzítő indítja el az ELSŐ kísérletet 12 óránként.
// Ha az sikertelen, az `attemptRestart` függvény átveszi az irányítást és 1 percenként újrapróbálja.
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
setInterval(attemptRestart, TWELVE_HOURS_MS);
console.log(`[RESTART] A 12 órás újraindítási ciklus beütemezve. (Intervallum: ${TWELVE_HOURS_MS} ms)`);

// 2. 3 percenkénti "keep-alive" ping
const THREE_MINUTES_MS = 3 * 60 * 1000;
pingSelf(); // Azonnali első ping
setInterval(pingSelf, THREE_MINUTES_MS);
console.log(`[PING] A 3 perces "ping" beütemezve. (Intervallum: ${THREE_MINUTES_MS} ms)`);
