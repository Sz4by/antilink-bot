const axios = require('axios');

const serviceId = 'srv-cqbnnqiju9rs7394flag';  // Cseréld ki a szolgáltatás azonosítójára
const apiKey = 'rnd_0tsGxwLpPDm3Tb8oNMiOPpasyEPL';        // Cseréld ki az API kulcsodra

const url = `https://api.render.com/v1/services/${serviceId}/restart`;

// API kérés az újraindításhoz
const restartService = () => {
  axios.post(url, {}, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  })
  .then(response => {
    if (response.status === 200) {
      console.log('Szolgáltatás sikeresen újraindítva.');
    } else {
      console.log('Hiba történt: ', response.status);
    }
  })
  .catch(error => {
    console.error('Hiba történt az API hívás során: ', error);
  });
};

// Az első indítás
restartService();

// 24 óránkénti újraindítás (24 óra = 86400000 ms)
setInterval(restartService, 86400000);  // 24 órás intervallum
