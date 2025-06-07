const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall, onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');
const sharp = require('sharp');

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
      city = cityPart.split(' ')[0];
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
        
        // Update user document
        await db.collection('users').doc(userId).update({
          uniqueCityCount: uniqueCities.size,
          uniqueCities: Array.from(uniqueCities),
          uniqueCuisineCount: uniqueCuisines.size,
          uniqueCuisines: Array.from(uniqueCuisines),
          sushiMealCount: sushiMealCount,
          takeoutMealCount: takeoutMealCount,
          lastCountRefresh: new Date(),
        });
        
        console.log(`Updated counts for user ${userId}:`, {
          cities: uniqueCities.size,
          cuisines: uniqueCuisines.size,
          sushi: sushiMealCount,
          takeout: takeoutMealCount,
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
    
    meals.forEach((meal) => {
      const city = extractCityFromMeal(meal);
      if (city) uniqueCities.add(city);
      
      const cuisine = extractCuisineFromMeal(meal);
      if (cuisine) uniqueCuisines.add(cuisine);
      
      if (isSushiMeal(meal)) sushiMealCount++;
      if (isTakeoutMeal(meal)) takeoutMealCount++;
    });
    
    // Update user document
    await db.collection('users').doc(userId).update({
      uniqueCityCount: uniqueCities.size,
      uniqueCities: Array.from(uniqueCities),
      uniqueCuisineCount: uniqueCuisines.size,
      uniqueCuisines: Array.from(uniqueCuisines),
      sushiMealCount: sushiMealCount,
      takeoutMealCount: takeoutMealCount,
      lastCountRefresh: new Date(),
    });
    
    return {
      success: true,
      counts: {
        cities: uniqueCities.size,
        cuisines: uniqueCuisines.size,
        sushi: sushiMealCount,
        takeout: takeoutMealCount,
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