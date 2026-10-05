// 1. Vérification PWA
function vérifierModePWA() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) {
    document.getElementById('pwaTutorial').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
  } else {
    document.getElementById('pwaTutorial').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
  }
}

// 2. Paywall
function ouvrirModal() {
  document.getElementById('interacModal').style.display = 'flex';
}

function fermerModal() {
  document.getElementById('interacModal').style.display = 'none';
}

function debloquerSite() {
  document.getElementById('interacModal').style.display = 'none';
  document.getElementById('paywallCard').style.display = 'none';
  document.getElementById('rabaisContent').classList.remove('blurred');
  localStorage.setItem('promoQC_debloque', 'true');
}

function vérifierAchatPrécédent() {
  if (localStorage.getItem('promoQC_debloque') === 'true') {
    if (document.getElementById('paywallCard')) {
      document.getElementById('paywallCard').style.display = 'none';
    }
    if (document.getElementById('rabaisContent')) {
      document.getElementById('rabaisContent').classList.remove('blurred');
    }
  }
}

// 3. Moteur de dessin du Canvas
function dessinerCarte() {
  const canvas = document.getElementById('carteCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const type = document.getElementById('selectType').value;
  const nom = document.getElementById('inputNom').value.toUpperCase() || 'FELIX BOUCHARD';
  const dateInfo = document.getElementById('inputDate').value || '2026-01-14';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (type === 'RAMQ') {
    dessinerRAMQ(ctx, nom, dateInfo);
  } else {
    dessinerPermis(ctx, nom, dateInfo);
  }
}

// Rendu de la Carte RAMQ
function dessinerRAMQ(ctx, nom, dateInfo) {
  // Fond dégradé RAMQ
  const grad = ctx.createLinearGradient(0, 0, 700, 430);
  grad.addColorStop(0, '#eaf4f8');
  grad.addColorStop(0.5, '#fefae0');
  grad.addColorStop(1, '#e3f2fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 700, 430);

  // En-tête Québec
  ctx.fillStyle = '#0f172a';
  ctx.font = 'italic 18px Arial';
  ctx.fillText('Régie de', 180, 45);
  ctx.fillText("l'assurance maladie", 180, 68);

  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#003366';
  ctx.fillText('Québec', 280, 95);

  // Drapeau du Québec
  ctx.fillStyle = '#003399';
  ctx.fillRect(490, 35, 50, 35);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(510, 35, 10, 35);
  ctx.fillRect(490, 48, 50, 9);

  // Emplacement photo
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(510, 90, 150, 190);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(510, 90, 150, 190);

  // Informations de la carte
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('NUMÉRO D\'ASSURANCE MALADIE', 40, 130);

  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('BOUF 9401 1419', 40, 165);

  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('PRÉNOM ET NOM À LA NAISSANCE', 40, 210);

  // NOM PERSONNALISÉ
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#000000';
  ctx.fillText(nom, 40, 245);

  ctx.font = 'bold 12px Arial';
  ctx.fillText('14  01  14      M', 40, 310);
  ctx.font = '10px Arial';
  ctx.fillText('NAISSANCE (AA MM JJ)   SEXE', 40, 325);

  ctx.font = 'bold 18px monospace';
  ctx.fillText(dateInfo, 370, 310);
  ctx.font = '10px Arial';
  ctx.fillText('< EXPIRATION', 500, 310);

  // Signature
  ctx.font = 'italic 22px cursive';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(nom, 430, 380);
}

// Rendu du Permis de conduire
function dessinerPermis(ctx, nom, dateInfo) {
  // Fond
  const grad = ctx.createLinearGradient(0, 0, 700, 430);
  grad.addColorStop(0, '#f1f5f9');
  grad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 700, 430);

  // Bandeau supérieur
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 0, 700, 65);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('PERMIS DE CONDUIRE - QUÉBEC', 30, 40);

  // Cadre photo
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(40, 90, 160, 200);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 90, 160, 200);

  // Champs du permis
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('1. NOM & PRÉNOM', 230, 110);
  
  // NOM PERSONNALISÉ
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(nom, 230, 135);

  ctx.font = 'bold 11px Arial';
  ctx.fillText('2. DATE D\'EXPIRATION', 230, 180);
  ctx.font = 'bold 18px monospace';
  ctx.fillText(dateInfo, 230, 205);

  ctx.font = 'bold 11px Arial';
  ctx.fillText('3. NO DU PERMIS', 230, 250);
  ctx.font = 'bold 18px monospace';
  ctx.fillText('B-1234-567890-01', 230, 275);

  ctx.font = 'bold 11px Arial';
  ctx.fillText('CLASS: 5', 40, 330);
}

// 4. Exportation d'image
function telechargerCarte() {
  const canvas = document.getElementById('carteCanvas');
  const link = document.createElement('a');
  link.download = 'document_identite.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
  vérifierModePWA();
  vérifierAchatPrécédent();
  dessinerCarte();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker actif !'))
    .catch(err => console.log('Erreur SW :', err));
}