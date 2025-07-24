# Dish Criteria Firestore Schema

## Collection: `dishCriteria`

This collection stores AI-generated "What to Look For" criteria for different dishes, enabling caching and reuse.

### Document Structure

```javascript
{
  // Document ID: Generated hash based on dish_specific + cuisine_type
  "dish_key": "abc123def456", // Unique identifier for caching
  
  // Dish identification
  "dish_specific": "Croissant",
  "dish_general": "Pastry", 
  "cuisine_type": "French",
  
  // The main criteria data
  "criteria": [
    {
      "title": "Crisp, Shatter-like Exterior",
      "description": "The outer crust should crack audibly when pressed, revealing the laminated layers beneath. A proper croissant sounds hollow when tapped."
    },
    {
      "title": "Visible Laminated Layers",
      "description": "Look for distinct, paper-thin layers visible when torn. These layers should separate cleanly, showing the butter integration."
    },
    {
      "title": "Honeycomb Crumb Structure", 
      "description": "The interior should have irregular, airy pockets creating a light, honeycomb-like texture. Dense or uniform crumb indicates poor technique."
    },
    {
      "title": "Buttery Aroma without Greasiness",
      "description": "Rich, buttery smell should be present without any greasy residue on fingers. The butter should be integrated, not pooled."
    },
    {
      "title": "Classic Crescent Shape & Proportion",
      "description": "Traditional curved shape with appropriate thickness-to-length ratio. Well-formed points and even golden-brown color throughout."
    }
  ],
  
  // Metadata
  "created_at": "2024-01-20T15:30:00Z",
  "updated_at": "2024-01-20T15:30:00Z",
  "version": "1.0",
  "source": "ai_generated", // or "fallback"
  "usage_count": 1, // How many times this has been referenced
  "last_used": "2024-01-20T15:30:00Z"
}
```

## Collection: `mealEntries` (Updated)

Add dish criteria reference to existing meal entries:

```javascript
{
  // ... existing meal fields ...
  
  // Enhanced metadata (already exists)
  "metadata_enriched": {
    "dish_specific": "Croissant",
    "dish_general": "Pastry",
    "cuisine_type": "French",
    // ... other enhanced metadata
  },
  
  // NEW: Reference to dish criteria
  "dish_criteria_key": "abc123def456", // Links to dishCriteria collection
  "dish_criteria_generated_at": "2024-01-20T15:30:00Z"
}
```

## Collection: `mealRatings` (Future Feature)

For dynamic rating fields based on criteria:

```javascript
{
  "meal_id": "meal123",
  "user_id": "user456", 
  "dish_criteria_key": "abc123def456",
  
  // Dynamic ratings based on criteria
  "criteria_ratings": {
    "crisp_shatter_like_exterior": {
      "score": 4, // 1-5 scale
      "notes": "Nice crunch but could be crispier"
    },
    "visible_laminated_layers": {
      "score": 5,
      "notes": "Perfect lamination visible"
    },
    // ... other criteria
  },
  
  "overall_rating": 4.2,
  "created_at": "2024-01-20T15:35:00Z"
}
```

## Indexes Needed

1. **dishCriteria collection:**
   - `dish_key` (for fast lookups)
   - `dish_specific` (for search)
   - `cuisine_type` (for filtering)
   - `created_at` (for sorting)

2. **mealEntries collection:**
   - `dish_criteria_key` (for joining with criteria)
   - Existing indexes remain unchanged

## Caching Strategy

1. **Generate dish_key** from `dish_specific + cuisine_type`
2. **Check dishCriteria** collection first using dish_key
3. **If exists**: Return cached criteria, increment usage_count
4. **If not exists**: Generate via AI, save to dishCriteria collection
5. **Update meal entry** with dish_criteria_key reference

## Security Rules

Add to firestore.rules:

```javascript
// Allow authenticated users to read dish criteria
match /dishCriteria/{document=**} {
  allow read: if request.auth != null;
  allow write: if false; // Only backend can write
}

// Allow authenticated users to read/write their meal ratings
match /mealRatings/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == resource.data.user_id;
  allow create: if request.auth != null;
}
```

## Benefits of This Schema

1. **Efficient Caching**: No duplicate AI calls for same dishes
2. **Scalable**: Criteria reused across multiple users and meals
3. **Trackable**: Usage statistics help identify popular dishes
4. **Future-Ready**: Schema supports dynamic rating fields
5. **Maintainable**: Criteria can be updated/improved over time