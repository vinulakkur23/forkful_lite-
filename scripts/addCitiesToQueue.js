const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = require(path.join(__dirname, '..', 'firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addCitiesToQueue() {
  const cities = ['corvallis', 'long', 'montreuil', 'paris'];
  
  console.log('Starting to add cities to queue...\n');
  
  for (const city of cities) {
    try {
      // Create normalized name (lowercase with hyphens for spaces)
      const normalizedName = city.toLowerCase().replace(/\s+/g, '-');
      
      // Prepare document data
      const cityData = {
        originalName: city,
        normalizedName: normalizedName,
        status: 'pending',
        requestedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Add document to cityImages collection
      const docRef = await db.collection('cityImages').add(cityData);
      
      console.log(`✓ Added city "${city}" with ID: ${docRef.id}`);
      console.log(`  - Normalized name: ${normalizedName}`);
      console.log(`  - Status: pending\n`);
      
    } catch (error) {
      console.error(`✗ Error adding city "${city}":`, error.message);
    }
  }
  
  console.log('Finished adding cities to queue.');
  process.exit(0);
}

// Run the script
addCitiesToQueue().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});