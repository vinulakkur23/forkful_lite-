const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = require(path.join(__dirname, '..', 'firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Helper function to normalize city names
const normalizeCityName = (city) => {
  if (!city) return null;
  return city.trim().toLowerCase().replace(/\s+/g, '-');
};

async function queueExistingCitiesWithoutImages() {
  console.log('Checking for cities without images...\n');
  
  try {
    // Get all users to collect all unique cities
    const usersSnapshot = await db.collection('users').get();
    const allCities = new Set();
    
    // Collect all unique cities from all users
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.uniqueCities && Array.isArray(userData.uniqueCities)) {
        userData.uniqueCities.forEach(city => {
          if (city) {
            allCities.add(city);
          }
        });
      }
    });
    
    console.log(`Found ${allCities.size} unique cities across all users\n`);
    
    let citiesWithoutImages = 0;
    let citiesWithImages = 0;
    let citiesQueued = 0;
    
    // Check each city
    for (const city of allCities) {
      const normalizedCity = normalizeCityName(city);
      if (!normalizedCity) continue;
      
      // Check if this city has an image
      const cityDoc = await db.collection('cityImages').doc(normalizedCity).get();
      
      if (!cityDoc.exists) {
        // No document exists - add to queue
        await db.collection('cityImages').doc(normalizedCity).set({
          originalName: city,
          normalizedName: normalizedCity,
          status: 'pending',
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'bulk_queue_existing'
        });
        
        console.log(`✓ Queued city "${city}" (no existing record)`);
        citiesWithoutImages++;
        citiesQueued++;
      } else {
        const cityData = cityDoc.data();
        
        if (cityData.status === 'completed' && cityData.imageUrl) {
          // Has a completed image
          console.log(`○ City "${city}" already has an image`);
          citiesWithImages++;
        } else if (cityData.status === 'pending' || cityData.status === 'generating') {
          // Already in queue
          console.log(`○ City "${city}" is already queued (status: ${cityData.status})`);
          citiesWithoutImages++;
        } else {
          // Failed or incomplete - re-queue it
          await db.collection('cityImages').doc(normalizedCity).update({
            status: 'pending',
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            previousStatus: cityData.status,
            retryCount: (cityData.retryCount || 0) + 1
          });
          
          console.log(`✓ Re-queued city "${city}" (was ${cityData.status})`);
          citiesWithoutImages++;
          citiesQueued++;
        }
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total unique cities: ${allCities.size}`);
    console.log(`Cities with images: ${citiesWithImages}`);
    console.log(`Cities without images: ${citiesWithoutImages}`);
    console.log(`Cities queued for generation: ${citiesQueued}`);
    
    if (citiesQueued > 0) {
      console.log('\nYou can now run the generateCityImages function to process the queue.');
      console.log('URL: https://generatecityimages-hjfst3tpuq-uc.a.run.app');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

// Run the script
queueExistingCitiesWithoutImages().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});