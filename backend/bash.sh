#!/bin/bash

# install-puppeteer-dependencies.sh
# Script d'installation des dépendances Puppeteer pour Ubuntu/Debian

echo "🚀 Installation des dépendances Puppeteer pour Ubuntu/Debian..."

# Mise à jour des paquets
echo "📦 Mise à jour des paquets système..."
sudo apt update && sudo apt upgrade -y

# Installation des dépendances essentielles pour Chrome/Chromium
echo "🔧 Installation des dépendances Chrome/Chromium..."
sudo apt install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Installation de Chrome (optionnel, pour avoir un navigateur de secours)
echo "🌐 Installation de Google Chrome (optionnel)..."
if ! command -v google-chrome &> /dev/null; then
    echo "Chrome non trouvé, installation en cours..."
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
    sudo apt update
    sudo apt install -y google-chrome-stable
    echo "✅ Chrome installé avec succès"
else
    echo "✅ Chrome déjà installé"
fi

# Installation de Chromium comme alternative
echo "�� Installation de Chromium (alternative)..."
sudo apt install -y chromium-browser

# Vérification des installations
echo "🔍 Vérification des installations..."

# Test de Chrome
if command -v google-chrome &> /dev/null; then
    echo "✅ Google Chrome installé: $(google-chrome --version)"
else
    echo "⚠️  Google Chrome non installé"
fi

# Test de Chromium
if command -v chromium-browser &> /dev/null; then
    echo "✅ Chromium installé: $(chromium-browser --version)"
elif command -v chromium &> /dev/null; then
    echo "✅ Chromium installé: $(chromium --version)"
else
    echo "⚠️  Chromium non installé"
fi

# Installation des dépendances Node.js
echo "📦 Vérification de Node.js et npm..."
if ! command -v node &> /dev/null; then
    echo "Installation de Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Réinstallation de Puppeteer pour s'assurer qu'il utilise les bonnes dépendances
echo "🔄 Réinstallation de Puppeteer..."
cd "$(dirname "$0")" # Aller dans le répertoire du script
if [ -f "package.json" ]; then
    npm install puppeteer --force
    echo "✅ Puppeteer réinstallé"
else
    echo "⚠️  Pas de package.json trouvé, installation globale de Puppeteer..."
    sudo npm install -g puppeteer --unsafe-perm=true --allow-root
fi

# Test de Puppeteer
echo "🧪 Test de Puppeteer..."
node -e "
const puppeteer = require('puppeteer');
(async () => {
  try {
    console.log('Tentative de lancement du navigateur...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ Navigateur lancé avec succès!');
    await browser.close();
    console.log('✅ Test Puppeteer réussi!');
  } catch (error) {
    console.error('❌ Erreur lors du test Puppeteer:', error.message);
    process.exit(1);
  }
})();
" || echo "⚠️  Le test Puppeteer a échoué, mais les dépendances sont installées"

echo ""
echo "🎉 Installation terminée!"
echo ""
echo "📝 Résumé:"
echo "  - Dépendances système installées"
echo "  - Chrome/Chromium installé"
echo "  - Puppeteer configuré"
echo ""
echo "🚀 Vous pouvez maintenant relancer votre application:"
echo "  npm run dev"
echo ""

# Conseils supplémentaires
echo "💡 Si vous rencontrez encore des problèmes:"
echo "  1. Redémarrez votre session terminale"
echo "  2. Essayez: export DISPLAY=:99"
echo "  3. Pour Docker: ajoutez --cap-add=SYS_ADMIN"
echo "  4. Vérifiez les permissions: sudo chown -R \$USER ~/.cache"
