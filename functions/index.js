const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall, onRequest} = require('firebase-functions/v2/https');
const {onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');
const sharp = require('sharp');
const fetch = require('node-fetch');

// Initialize Firebase Admin
initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

// Helper functions (copied from your React Native service)
const extractCityFromMeal = (meal) => {
  let city = null;
  
  if (meal.city) {
    city = meal.city;
  } else if (meal.location && meal.location.city) {
    city = meal.location.city;
  } else if (meal.restaurant && meal.restaurant.includes(',')) {
    const parts = meal.restaurant.split(',');
    if (parts.length > 1) {
      const cityPart = parts[1].trim();
      city = cityPart;
    }
  }
  
  return city ? city.toLowerCase().trim() : null;
};

const extractCuisineFromMeal = (meal) => {
  if (meal.aiMetadata && meal.aiMetadata.cuisineType) {
    const cuisine = meal.aiMetadata.cuisineType.toLowerCase().trim();
    if (cuisine === 'unknown' || cuisine === 'n/a' || cuisine === '') {
      return null;
    }
    return cuisine;
  }
  return null;
};

const isSushiMeal = (meal) => {
  if (!meal.aiMetadata) return false;
  
  const sushiKeywords = ['sushi', 'sashimi', 'nigiri', 'maki', 'roll'];
  
  // Check food type
  if (meal.aiMetadata.foodType) {
    const foodTypes = Array.isArray(meal.aiMetadata.foodType) 
      ? meal.aiMetadata.foodType 
      : [meal.aiMetadata.foodType];
    
    for (const foodType of foodTypes) {
      if (sushiKeywords.some((keyword) => foodType.toLowerCase().includes(keyword))) {
        return true;
      }
    }
  }
  
  // Check meal name
  if (meal.meal) {
    const mealName = meal.meal.toLowerCase();
    if (sushiKeywords.some((keyword) => mealName.includes(keyword))) {
      return true;
    }
  }
  
  // Check cuisine type - only if it explicitly mentions sushi
  if (meal.aiMetadata.cuisineType) {
    const cuisine = meal.aiMetadata.cuisineType.toLowerCase();
    if (cuisine.includes('sushi')) {
      return true;
    }
  }
  
  return false;
};

const isTakeoutMeal = (meal) => {
  if (!meal.aiMetadata) return false;
  
  // Check setting field
  if (meal.aiMetadata.setting) {
    const setting = meal.aiMetadata.setting.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some((keyword) => setting.includes(keyword))) {
      return true;
    }
  }
  
  // Check meal name
  if (meal.meal) {
    const mealName = meal.meal.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some((keyword) => mealName.includes(keyword))) {
      return true;
    }
  }
  
  // Check restaurant field
  if (meal.restaurant) {
    const restaurant = meal.restaurant.toLowerCase();
    const takeoutKeywords = ['takeout', 'to-go', 'togo', 'delivery', 'pickup'];
    if (takeoutKeywords.some((keyword) => restaurant.includes(keyword))) {
      return true;
    }
  }
  
  return false;
};

// Scheduled function to run daily at 2 AM PST
exports.dailyCountRefresh = onSchedule('0 2 * * *', async (event) => {
  console.log('Starting daily count refresh...');
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    let processedUsers = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`Processing user: ${userId}`);
      
      try {
        // Get all meals for this user
        const mealsSnapshot = await db.collection('mealEntries')
          .where('userId', '==', userId)
          .get();
        
        const meals = [];
        mealsSnapshot.forEach((doc) => {
          meals.push(doc.data());
        });
        
        console.log(`Found ${meals.length} meals for user ${userId}`);
        
        // Recalculate cities
        const uniqueCities = new Set();
        meals.forEach((meal) => {
          const city = extractCityFromMeal(meal);
          if (city) {
            uniqueCities.add(city);
          }
        });
        
        // Recalculate cuisines
        const uniqueCuisines = new Set();
        meals.forEach((meal) => {
          const cuisine = extractCuisineFromMeal(meal);
          if (cuisine) {
            uniqueCuisines.add(cuisine);
          }
        });
        
        // Recalculate sushi meals
        const sushiMealCount = meals.filter((meal) => isSushiMeal(meal)).length;
        
        // Recalculate takeout meals
        const takeoutMealCount = meals.filter((meal) => isTakeoutMeal(meal)).length;
        
        // Recalculate high-rated photos (photoScore >= 5.5)
        const highRatedPhotoCount = meals.filter((meal) => {
          return meal.photoScore && meal.photoScore >= 5.5;
        }).length;
        
        // Update user document
        await db.collection('users').doc(userId).update({
          uniqueCityCount: uniqueCities.size,
          uniqueCities: Array.from(uniqueCities),
          uniqueCuisineCount: uniqueCuisines.size,
          uniqueCuisines: Array.from(uniqueCuisines),
          sushiMealCount: sushiMealCount,
          takeoutMealCount: takeoutMealCount,
          highRatedPhotoCount: highRatedPhotoCount,
          lastCountRefresh: new Date(),
        });
        
        console.log(`Updated counts for user ${userId}:`, {
          cities: uniqueCities.size,
          cuisines: uniqueCuisines.size,
          sushi: sushiMealCount,
          takeout: takeoutMealCount,
          highRatedPhotos: highRatedPhotoCount,
        });
        
        processedUsers++;
      } catch (userError) {
        console.error(`Error processing user ${userId}:`, userError);
        // Continue with next user
      }
    }
    
    console.log(`Daily count refresh completed successfully. Processed ${processedUsers} users.`);
    return null;
  } catch (error) {
    console.error('Error in daily count refresh:', error);
    throw error;
  }
});

// Manual trigger function for testing/immediate refresh
exports.manualCountRefresh = onCall(async (request) => {
  // Verify the user is authenticated
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }
  
  const userId = request.data.userId || request.auth.uid;
  
  try {
    console.log(`Manual count refresh for user: ${userId}`);
    
    // Get all meals for this user
    const mealsSnapshot = await db.collection('mealEntries')
      .where('userId', '==', userId)
      .get();
    
    const meals = [];
    mealsSnapshot.forEach((doc) => {
      meals.push(doc.data());
    });
    
    // Recalculate all counts
    const uniqueCities = new Set();
    const uniqueCuisines = new Set();
    let sushiMealCount = 0;
    let takeoutMealCount = 0;
    let highRatedPhotoCount = 0;
    
    meals.forEach((meal) => {
      const city = extractCityFromMeal(meal);
      if (city) uniqueCities.add(city);
      
      const cuisine = extractCuisineFromMeal(meal);
      if (cuisine) uniqueCuisines.add(cuisine);
      
      if (isSushiMeal(meal)) sushiMealCount++;
      if (isTakeoutMeal(meal)) takeoutMealCount++;
      if (meal.photoScore && meal.photoScore >= 5.5) highRatedPhotoCount++;
    });
    
    // Update user document
    await db.collection('users').doc(userId).update({
      uniqueCityCount: uniqueCities.size,
      uniqueCities: Array.from(uniqueCities),
      uniqueCuisineCount: uniqueCuisines.size,
      uniqueCuisines: Array.from(uniqueCuisines),
      sushiMealCount: sushiMealCount,
      takeoutMealCount: takeoutMealCount,
      highRatedPhotoCount: highRatedPhotoCount,
      lastCountRefresh: new Date(),
    });
    
    return {
      success: true,
      counts: {
        cities: uniqueCities.size,
        cuisines: uniqueCuisines.size,
        sushi: sushiMealCount,
        takeout: takeoutMealCount,
        highRatedPhotos: highRatedPhotoCount,
      },
    };
  } catch (error) {
    console.error('Error in manual count refresh:', error);
    throw new Error('Failed to refresh counts');
  }
});

// Manual HTTP function to compress all existing images in Firebase Storage
exports.compressExistingImages = onRequest(async (req, res) => {
  console.log('Image compression function called via HTTP');
  
  try {
    console.log('Starting compression of existing images...');
    
    // Get all files from the storage bucket
    const [files] = await bucket.getFiles({
      prefix: 'meals/', // Images are stored in meals/ folder with user subfolders
    });
    
    console.log(`Found ${files.length} files to process`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const compressionResults = [];
    
    for (const file of files) {
      try {
        const fileName = file.name;
        console.log(`Processing: ${fileName}`);
        
        // Skip if it's already compressed (has 'compressed_' prefix or is very small)
        if (fileName.includes('compressed_') || fileName.includes('thumb_')) {
          console.log(`Skipping already processed file: ${fileName}`);
          skippedCount++;
          continue;
        }
        
        // Check file size - skip if already small (less than 500KB)
        const [metadata] = await file.getMetadata();
        const fileSizeKB = parseInt(metadata.size) / 1024;
        
        if (fileSizeKB < 500) {
          console.log(`Skipping small file: ${fileName} (${fileSizeKB.toFixed(2)}KB)`);
          skippedCount++;
          continue;
        }
        
        // Download the file
        const [fileBuffer] = await file.download();
        
        // Compress the image using Sharp (preserve original orientation)
        const compressedBuffer = await sharp(fileBuffer)
          .rotate() // Auto-rotate based on EXIF data to correct orientation
          .resize(800, 800, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 85,
            progressive: true,
          })
          .toBuffer();
        
        const originalSizeKB = fileBuffer.length / 1024;
        const compressedSizeKB = compressedBuffer.length / 1024;
        const compressionRatio = ((originalSizeKB - compressedSizeKB) / originalSizeKB * 100);
        
        // Only replace if compression achieved significant savings (>10%)
        if (compressionRatio > 10) {
          // Upload the compressed version back to the same location
          await file.save(compressedBuffer, {
            metadata: {
              contentType: 'image/jpeg',
              metadata: {
                compressed: 'true',
                originalSize: originalSizeKB.toFixed(2) + 'KB',
                compressedSize: compressedSizeKB.toFixed(2) + 'KB',
                compressionRatio: compressionRatio.toFixed(1) + '%',
              },
            },
          });
          
          console.log(`✅ Compressed ${fileName}: ${originalSizeKB.toFixed(2)}KB → ${compressedSizeKB.toFixed(2)}KB (${compressionRatio.toFixed(1)}% reduction)`);
          
          compressionResults.push({
            fileName,
            originalSizeKB: originalSizeKB.toFixed(2),
            compressedSizeKB: compressedSizeKB.toFixed(2),
            compressionRatio: compressionRatio.toFixed(1),
          });
          
          processedCount++;
        } else {
          console.log(`Skipping ${fileName}: minimal compression benefit (${compressionRatio.toFixed(1)}%)`);
          skippedCount++;
        }
        
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        errorCount++;
      }
    }
    
    const totalSavingsKB = compressionResults.reduce((sum, result) => {
      return sum + (parseFloat(result.originalSizeKB) - parseFloat(result.compressedSizeKB));
    }, 0);
    
    const summary = {
      totalFiles: files.length,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount,
      totalSavingsKB: totalSavingsKB.toFixed(2),
      totalSavingsMB: (totalSavingsKB / 1024).toFixed(2),
      compressionResults: compressionResults.slice(0, 10), // First 10 results as sample
    };
    
    console.log('Image compression completed:', summary);
    
    const result = {
      success: true,
      summary,
      message: `Compressed ${processedCount} images, saved ${(totalSavingsKB / 1024).toFixed(2)}MB of storage`,
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Error in image compression:', error);
    res.status(500).json({error: `Failed to compress images: ${error.message}`});
  }
});

// City Image Management Functions

// Helper function to normalize city names for consistency
const normalizeCityName = (city) => {
  if (!city) return null;
  // Remove extra spaces and convert to lowercase for storage key
  return city.trim().toLowerCase().replace(/\s+/g, '-');
};

// Monitor user updates to detect new cities
exports.detectNewCities = onDocumentUpdated('users/{userId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  
  // Check if uniqueCities was updated
  const beforeCities = before.uniqueCities || [];
  const afterCities = after.uniqueCities || [];
  
  // Find new cities
  const newCities = afterCities.filter(city => !beforeCities.includes(city));
  
  if (newCities.length > 0) {
    console.log(`Found ${newCities.length} new cities for user ${event.params.userId}:`, newCities);
    
    // Check each new city and generate image if needed
    for (const city of newCities) {
      const normalizedCity = normalizeCityName(city);
      if (!normalizedCity) continue;
      
      try {
        // Check if city already has a completed image
        const cityDoc = await db.collection('cityImages').doc(normalizedCity).get();
        
        if (cityDoc.exists) {
          const cityData = cityDoc.data();
          if (cityData.status === 'completed' && cityData.imageUrl) {
            console.log(`City ${city} already has an image, skipping generation`);
            continue;
          }
          // If it exists but isn't completed, we'll regenerate it
          console.log(`City ${city} exists but needs image generation (status: ${cityData.status})`);
        }
        
        // Generate image immediately
        console.log(`Generating image for new city: ${city}`);
        
        // First, create or update the document to mark it as in progress
        await db.collection('cityImages').doc(normalizedCity).set({
          originalName: city,
          normalizedName: normalizedCity,
          status: 'generating',
          requestedAt: new Date(),
          requestedBy: event.params.userId
        });
        
        // Call our backend to generate the actual image
        const imageResponse = await fetch('https://dishitout-imageinhancer.onrender.com/city-image/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `city_name=${encodeURIComponent(city)}`
        });
        
        if (!imageResponse.ok) {
          throw new Error(`Image generation failed: ${imageResponse.status}`);
        }
        
        const imageData = await imageResponse.json();
        
        // Download and store the image permanently in Firebase Storage
        let permanentImageUrl = null;
        
        if (imageData.image_url) {
          try {
            console.log(`Downloading image for ${city} from DALL-E...`);
            
            // Download the image from DALL-E's temporary URL
            const imageDownloadResponse = await fetch(imageData.image_url);
            if (!imageDownloadResponse.ok) {
              throw new Error(`Failed to download image: ${imageDownloadResponse.status}`);
            }
            
            const imageBuffer = await imageDownloadResponse.arrayBuffer();
            
            // Resize image to 350x350 using Sharp for faster loading
            const resizedImageBuffer = await sharp(Buffer.from(imageBuffer))
              .resize(350, 350, {
                fit: 'cover',
                position: 'center'
              })
              .png()
              .toBuffer();
            
            // Create a file reference in Firebase Storage
            const fileName = `city-images/${normalizedCity}-${Date.now()}.png`;
            const file = bucket.file(fileName);
            
            // Upload the resized image to Firebase Storage
            await file.save(resizedImageBuffer, {
              metadata: {
                contentType: 'image/png',
                metadata: {
                  city: city,
                  normalizedCity: normalizedCity,
                  generator: 'dall-e-3',
                  generatedAt: new Date().toISOString()
                }
              }
            });
            
            // Make the file publicly accessible
            await file.makePublic();
            
            // Get the permanent public URL
            permanentImageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            console.log(`✅ Uploaded image to Firebase Storage: ${permanentImageUrl}`);
            
          } catch (uploadError) {
            console.error(`❌ Error uploading image to Firebase Storage: ${uploadError}`);
            // Fallback to temporary URL if upload fails
            permanentImageUrl = imageData.image_url;
          }
        }
        
        // Update city document with image data
        await db.collection('cityImages').doc(normalizedCity).set({
          originalName: city,
          normalizedName: normalizedCity,
          status: 'completed',
          imageUrl: permanentImageUrl || imageData.image_data,
          temporaryUrl: imageData.image_url, // Keep the original URL for reference
          prompt: imageData.prompt,
          revisedPrompt: imageData.revised_prompt,
          generator: imageData.generator || 'dall-e-3',
          imageFormat: 'png',
          width: 350,
          height: 350,
          generatedAt: new Date(),
          requestedBy: event.params.userId
        });
        
        console.log(`✅ Successfully generated image for ${city}`);
        
      } catch (error) {
        console.error(`❌ Error generating image for city ${city}:`, error);
        
        // Mark as failed in the database
        await db.collection('cityImages').doc(normalizedCity).set({
          originalName: city,
          normalizedName: normalizedCity,
          status: 'failed',
          error: error.message,
          failedAt: new Date(),
          requestedBy: event.params.userId
        });
      }
    }
  }
  
  return null;
});

// Manual function to generate city images
exports.generateCityImages = onRequest(async (req, res) => {
  console.log('City image generation function called');
  
  try {
    // Check if a specific city was requested
    const specificCity = req.query.city || req.body.city;
    // Check if we should regenerate all cities
    const regenerateAll = req.query.regenerateAll === 'true' || req.body.regenerateAll === true;
    
    let cityQuery;
    
    if (specificCity) {
      // Process only the specific city
      const normalizedCity = normalizeCityName(specificCity);
      cityQuery = await db.collection('cityImages')
        .where('normalizedName', '==', normalizedCity)
        .get();
    } else {
      // Get all cities
      cityQuery = await db.collection('cityImages')
        .get();
    }
    
    if (cityQuery.empty) {
      return res.json({
        success: true,
        message: 'No cities found in database'
      });
    }
    
    // Filter cities that need regeneration
    const citiesToProcess = [];
    
    for (const doc of cityQuery.docs) {
      const cityData = doc.data();
      
      if (regenerateAll || specificCity) {
        // Force regeneration when explicitly requested
        citiesToProcess.push({ doc, cityData });
        console.log(`${cityData.originalName} will be regenerated`);
      } else {
        // Only regenerate cities that need it
        if (!cityData.imageUrl || cityData.status === 'pending' || cityData.status === 'failed') {
          citiesToProcess.push({ doc, cityData });
          console.log(`${cityData.originalName} needs regeneration (status: ${cityData.status})`);
        }
      }
    }
    
    if (citiesToProcess.length === 0) {
      return res.json({
        success: true,
        message: 'No cities need regeneration - all have permanent URLs'
      });
    }
    
    console.log(`Found ${citiesToProcess.length} cities that need regeneration`);
    
    const results = [];
    
    for (const { doc, cityData } of citiesToProcess) {
      const cityId = doc.id;
      
      try {
        console.log(`Generating image for city: ${cityData.originalName}`);
        
        // Call our backend to generate the actual image
        const imageResponse = await fetch('https://dishitout-imageinhancer.onrender.com/city-image/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `city_name=${encodeURIComponent(cityData.originalName)}`
        });
        
        if (!imageResponse.ok) {
          throw new Error(`Image generation failed: ${imageResponse.status}`);
        }
        
        const imageData = await imageResponse.json();
        
        // Download and store the image permanently in Firebase Storage
        let permanentImageUrl = null;
        
        if (imageData.image_url) {
          try {
            console.log(`Downloading image for ${cityData.originalName} from DALL-E...`);
            
            // Download the image from DALL-E's temporary URL
            const imageDownloadResponse = await fetch(imageData.image_url);
            if (!imageDownloadResponse.ok) {
              throw new Error(`Failed to download image: ${imageDownloadResponse.status}`);
            }
            
            const imageBuffer = await imageDownloadResponse.arrayBuffer();
            
            // Resize image to 350x350 using Sharp
            const resizedImageBuffer = await sharp(Buffer.from(imageBuffer))
              .resize(350, 350, {
                fit: 'cover',
                position: 'center'
              })
              .png()
              .toBuffer();
            
            // Create a file reference in Firebase Storage
            const normalizedCity = normalizeCityName(cityData.originalName);
            const fileName = `city-images/${normalizedCity}-${Date.now()}.png`;
            const file = bucket.file(fileName);
            
            // Upload the resized image to Firebase Storage
            await file.save(resizedImageBuffer, {
              metadata: {
                contentType: 'image/png',
                metadata: {
                  city: cityData.originalName,
                  normalizedCity: normalizedCity,
                  generator: 'dall-e-3',
                  generatedAt: new Date().toISOString()
                }
              }
            });
            
            // Make the file publicly accessible
            await file.makePublic();
            
            // Get the permanent public URL
            permanentImageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            console.log(`✅ Uploaded image to Firebase Storage: ${permanentImageUrl}`);
            
          } catch (uploadError) {
            console.error(`❌ Error uploading image to Firebase Storage: ${uploadError}`);
            // Fallback to temporary URL if upload fails
            permanentImageUrl = imageData.image_url;
          }
        }
        
        // Update city document with image data
        await doc.ref.set({
          originalName: cityData.originalName,
          normalizedName: cityData.normalizedName,
          status: 'completed',
          imageUrl: permanentImageUrl || imageData.image_data,
          temporaryUrl: imageData.image_url, // Keep the original URL for reference
          prompt: imageData.prompt,
          revisedPrompt: imageData.revised_prompt,
          generator: imageData.generator || 'dall-e-3',
          imageFormat: imageData.image_format || 'png',
          width: 350,
          height: 350,
          generatedAt: new Date()
        });
        
        console.log(`✅ Generated image for ${cityData.originalName}`);
        
        results.push({
          city: cityData.originalName,
          status: 'success',
          imageUrl: permanentImageUrl || imageData.image_data,
          prompt: imageData.prompt
        });
        
        // Image has been generated and stored in the database
        
      } catch (error) {
        console.error(`❌ Error processing city ${cityData.originalName}:`, error);
        
        // Mark as failed
        await doc.ref.update({
          status: 'failed',
          error: error.message,
          failedAt: new Date()
        });
        
        results.push({
          city: cityData.originalName,
          status: 'failed',
          error: error.message
        });
      }
      
      // Add a small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const summary = {
      totalProcessed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length
    };
    
    console.log('City image generation completed:', summary);
    
    res.json({
      success: true,
      summary,
      results
    });
    
  } catch (error) {
    console.error('Error in city image generation:', error);
    res.status(500).json({error: `Failed to generate city images: ${error.message}`});
  }
});

// Function to get all unique cities across all users
exports.getAllUniqueCities = onRequest(async (req, res) => {
  console.log('Getting all unique cities');
  
  try {
    const usersSnapshot = await db.collection('users').get();
    const allCities = new Set();
    
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
    
    const citiesArray = Array.from(allCities).sort();
    
    console.log(`Found ${citiesArray.length} unique cities across all users`);
    
    // Check which cities already have images
    const cityStatuses = [];
    
    for (const city of citiesArray) {
      const normalizedCity = normalizeCityName(city);
      const cityDoc = await db.collection('cityImages').doc(normalizedCity).get();
      
      cityStatuses.push({
        city,
        normalized: normalizedCity,
        hasImage: cityDoc.exists,
        status: cityDoc.exists ? cityDoc.data().status : 'not_started'
      });
    }
    
    res.json({
      success: true,
      totalCities: citiesArray.length,
      cities: cityStatuses
    });
    
  } catch (error) {
    console.error('Error getting unique cities:', error);
    res.status(500).json({error: error.message});
  }
});

// Function to rate all photos using the photo rating API (including re-rating existing scores)
exports.rateUnratedPhotos = onRequest(async (req, res) => {
  console.log('Rate all photos function called via HTTP');
  
  try {
    console.log('Starting rating of all photos (including re-rating)...');
    
    // Get all meal entries that have photos but no photoScore
    const unratedQuery = await db.collection('mealEntries')
      .where('photoUrl', '!=', null)
      .get();
    
    console.log(`Found ${unratedQuery.docs.length} total meal entries with photos`);
    
    // Don't filter - process all meals with photos to re-rate them
    const unratedMeals = unratedQuery.docs;
    
    console.log(`Found ${unratedMeals.length} meals with photos to rate/re-rate`);
    
    if (unratedMeals.length === 0) {
      return res.json({
        success: true,
        message: 'No photos found to rate',
        processed: 0,
        errors: 0
      });
    }
    
    let processedCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process slowly to avoid rate limits - 5 per minute = 1 every 12 seconds
    const batchSize = 1; // Process one at a time
    const delayBetweenPhotos = 12000; // 12 seconds between each photo
    
    for (let i = 0; i < unratedMeals.length; i += batchSize) {
      const doc = unratedMeals[i];
      console.log(`Processing photo ${i + 1} of ${unratedMeals.length} (${Math.round((i / unratedMeals.length) * 100)}% complete)`);
      
      // Process single photo
      const processPhoto = async () => {
        try {
          const mealData = doc.data();
          const mealId = doc.id;
          
          console.log(`Rating photo for meal: ${mealId}`);
          
          // Call the photo rating API endpoint
          const ratingResponse = await fetch('https://dishitout-imageinhancer.onrender.com/rate-photo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `image_url=${encodeURIComponent(mealData.photoUrl)}`
          });
          
          if (!ratingResponse.ok) {
            throw new Error(`API request failed: ${ratingResponse.status}`);
          }
          
          const ratingData = await ratingResponse.json();
          const photoScore = ratingData.rating || 5.0; // Default fallback
          
          // Update the meal entry with the photo score
          await db.collection('mealEntries').doc(mealId).update({
            photoScore: photoScore,
            photoRatedAt: new Date()
          });
          
          console.log(`✅ Rated meal ${mealId}: ${photoScore}/10`);
          
          processedCount++;
          return {
            mealId,
            photoScore,
            success: true
          };
          
        } catch (error) {
          console.error(`❌ Error rating meal ${doc.id}:`, error);
          errorCount++;
          return {
            mealId: doc.id,
            error: error.message,
            success: false
          };
        }
      };
      
      // Process the single photo
      try {
        const result = await processPhoto();
        results.push(result);
      } catch (error) {
        console.error(`Failed to process photo ${i + 1}:`, error);
      }
      
      // Add delay before next photo (except for the last one)
      if (i < unratedMeals.length - 1) {
        console.log(`Waiting 12 seconds before next photo to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenPhotos));
      }
    }
    
    const summary = {
      totalFound: unratedMeals.length,
      processed: processedCount,
      errors: errorCount,
      successRate: processedCount > 0 ? ((processedCount / (processedCount + errorCount)) * 100).toFixed(1) + '%' : '0%'
    };
    
    console.log('Photo rating completed:', summary);
    
    const result = {
      success: true,
      summary,
      message: `Successfully rated ${processedCount} photos out of ${unratedMeals.length} total meals`,
      results: results.slice(0, 10) // First 10 results as sample
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Error in photo rating:', error);
    res.status(500).json({error: `Failed to rate photos: ${error.message}`});
  }
});

// Simple HTTP function to compress images (new function to avoid callable->HTTP restriction)
exports.compressImages = onRequest(async (req, res) => {
  console.log('Image compression HTTP function called');
  
  try {
    console.log('Starting compression of existing images...');
    
    // Get all files from the storage bucket
    const [files] = await bucket.getFiles({
      prefix: 'meals/', // Images are stored in meals/ folder with user subfolders
    });
    
    console.log(`Found ${files.length} files to process`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const compressionResults = [];
    
    for (const file of files) {
      try {
        const fileName = file.name;
        console.log(`Processing: ${fileName}`);
        
        // Skip if it's already compressed (has 'compressed_' prefix or is very small)
        if (fileName.includes('compressed_') || fileName.includes('thumb_')) {
          console.log(`Skipping already processed file: ${fileName}`);
          skippedCount++;
          continue;
        }
        
        // Check file size - skip if already small (less than 500KB)
        const [metadata] = await file.getMetadata();
        const fileSizeKB = parseInt(metadata.size) / 1024;
        
        if (fileSizeKB < 500) {
          console.log(`Skipping small file: ${fileName} (${fileSizeKB.toFixed(2)}KB)`);
          skippedCount++;
          continue;
        }
        
        // Download the file
        const [fileBuffer] = await file.download();
        
        // Compress the image using Sharp (same settings as your app)
        const compressedBuffer = await sharp(fileBuffer)
          .resize(800, 800, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 85,
            progressive: true,
          })
          .toBuffer();
        
        const originalSizeKB = fileBuffer.length / 1024;
        const compressedSizeKB = compressedBuffer.length / 1024;
        const compressionRatio = ((originalSizeKB - compressedSizeKB) / originalSizeKB * 100);
        
        // Only replace if compression achieved significant savings (>10%)
        if (compressionRatio > 10) {
          // Upload the compressed version back to the same location
          await file.save(compressedBuffer, {
            metadata: {
              contentType: 'image/jpeg',
              metadata: {
                compressed: 'true',
                originalSize: originalSizeKB.toFixed(2) + 'KB',
                compressedSize: compressedSizeKB.toFixed(2) + 'KB',
                compressionRatio: compressionRatio.toFixed(1) + '%',
              },
            },
          });
          
          console.log(`✅ Compressed ${fileName}: ${originalSizeKB.toFixed(2)}KB → ${compressedSizeKB.toFixed(2)}KB (${compressionRatio.toFixed(1)}% reduction)`);
          
          compressionResults.push({
            fileName,
            originalSizeKB: originalSizeKB.toFixed(2),
            compressedSizeKB: compressedSizeKB.toFixed(2),
            compressionRatio: compressionRatio.toFixed(1),
          });
          
          processedCount++;
        } else {
          console.log(`Skipping ${fileName}: minimal compression benefit (${compressionRatio.toFixed(1)}%)`);
          skippedCount++;
        }
        
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        errorCount++;
      }
    }
    
    const totalSavingsKB = compressionResults.reduce((sum, result) => {
      return sum + (parseFloat(result.originalSizeKB) - parseFloat(result.compressedSizeKB));
    }, 0);
    
    const summary = {
      totalFiles: files.length,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount,
      totalSavingsKB: totalSavingsKB.toFixed(2),
      totalSavingsMB: (totalSavingsKB / 1024).toFixed(2),
      compressionResults: compressionResults.slice(0, 10), // First 10 results as sample
    };
    
    console.log('Image compression completed:', summary);
    
    const result = {
      success: true,
      summary,
      message: `Compressed ${processedCount} images, saved ${(totalSavingsKB / 1024).toFixed(2)}MB of storage`,
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Error in image compression:', error);
    res.status(500).json({error: `Failed to compress images: ${error.message}`});
  }
});