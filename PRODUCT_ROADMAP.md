# Forkful Product Roadmap & Ideas

## Pixel Art Collection Display
- **Bento box** — grid compartments, natural for food pixel art, very "collectible"
- **Shelf / trophy case** — wooden shelves, collector's display, different styles (rustic, glass, marble)
- **Fridge** — magnets on a fridge door
- **Restaurant menu board** — chalkboard with emojis pinned
- **Plate / serving platter** — emojis on a round plate
- **World map / pin board** — emojis placed near where eaten
- **Picnic blanket** — checkered, casual
- **Kitchen counter / cutting board**
- **Recipe book / journal** — scrapbook-style stickers
- User chooses their display type as profile customization
- Emojis can be arranged/reordered manually (drag-to-reorder grid)
- Seasonal themes (picnic in summer, cozy kitchen in winter)
- Unlock new displays by milestones (10 meals = wood, 50 = glass, 100 = golden)

## Growth Hooks & Retention

### Daily Hooks
- **"What should I eat?"** button — AI considers location, flavor profile, past ratings, time of day, budget, nearby options. 3 personalized recommendations with reasons. THE killer daily feature.
- **Morning**: "Craving something new? 3 spots near your office match your taste"
- **Lunchtime**: Quick-log reminder if they haven't posted
- **Afternoon**: Friend activity — "Alex just tried a new Thai place and rated it 5 stars"
- **Evening**: Discovery — "Trending tonight: 3 restaurants your flavor profile would love"
- **Weekly recap**: "4 meals, 2 new restaurants, collection now at 67 pieces"

### Flavor Profile System
- LLM-powered profile extraction (GPT-4o-mini analyzes all meals nightly)
- Cuisine scores, flavor affinities (spicy, umami, sweet, creamy), dining patterns
- Adventurousness score, price sensitivity, peak dining hours
- Loved dishes, avoided patterns
- Stored in Firestore: `users/{userId}/flavor_profile`
- Cost: ~$0.02/user/day for nightly generation

### AI Recommendations Architecture
- **Layer 1**: Nightly Cloud Function → GPT-4o-mini → structured flavor profile (JSON)
- **Layer 2**: Real-time "What should I eat?" endpoint → reads profile + nearby restaurants → GPT-4o-mini matches → 3 recommendations
- **Future Layer 3**: Collaborative filtering at scale (5K+ users) — "users who liked X also liked Y"
- Hybrid at scale: 40% flavor profile, 30% collaborative filtering, 20% trending, 10% exploration

### Social & Sharing (Growth)
- **Shareable cards** — Instagram-story-sized with meal photo + pixel art + rating + restaurant. One-tap share.
- **Food passport export** — PDF/image of full passport like a real stamp book
- **Collaborative lists** — "Date night restaurants", "Family favorites" shared between users
- **"Eat together" challenges** — two friends try same restaurant, compare ratings
- **Restaurant recommendations TO friends** — "Sarah recommended the tacos at El Sol"
- **Leaderboards** — most restaurants visited in city, most diverse cuisines

### Food Critic Angle
- **Critic badge** after X meals + followers (like verification)
- **Critic leaderboards** by city, cuisine, total meals
- **Critic-exclusive features** — custom pixel art styles, premium displays, analytics
- Critics = content creators. Followers discover restaurants through critics.
- "Sarah (Portland Food Critic, 500+ meals) just rated a new ramen spot near you"
- **Flywheel**: Critics post → followers discover → followers start posting → some become critics

### Retention Features
- **Streaks** — "Logged meals 5 days in a row" (celebrate, don't guilt)
- **"Revisit" nudges** — "It's been 3 months since Pok Pok. Last time you gave the duck 5 stars."
- **Dish matchmaker** — "Based on your love of creamy pastas + spicy food, try Cacio e Pepe with chili oil at Restaurant X"
- **Year in review** — annual Wrapped-style. "89 restaurants, 12 cuisines, most-visited Pok Pok (7x)"
- **Food journey timeline** — visual timeline of eating history
- **Price tracking** — trends, average meal cost, spend by cuisine

### Discovery Feed
- **"Discover" tab** — meals rated highly by nearby people, critics, friends
- **"Trending in [City]"** — most-logged restaurants this week
- **"People like you also loved..."** — collaborative filtering recommendations

## Monetization

### Free Tier (generous)
- Unlimited meal logging + photos + pixel art
- Basic flavor profile
- Follow up to 10 people
- Standard pixel art styles

### Premium ($2.99/month or $24.99/year)
- AI features: voice-to-review, AI meal recommendations, "what should I eat?"
- Advanced analytics: detailed flavor profile, spending trends, cuisine breakdown
- Collection features: premium display surfaces (golden shelf, bento box), custom pixel art styles
- Unlimited follows + priority in critic rankings
- Export: high-res passport PDF, shareable cards without watermark
- Weekly AI recap

## Technical: Native Swift Module
- Build a Swift UICollectionView native component for drag-to-reorder grid
- Wraps iOS native drag-and-drop APIs
- Exposes as `<NativeRestaurantGrid />` to React Native
- Perfect scroll + drag coexistence (iOS handles natively)
- iOS only — Android keeps the modal approach
- Consider for: restaurant reorder, emoji grid reorder

## Food Challenges (Paused)
- Currently disabled in UI but code preserved
- Future: universal food challenges (city-specific iconic dishes, curated lists)
- Pokemon Go style — discover and check off dishes
- Legal consideration: can reference public info (Eater lists, etc.) as inspiration but cannot reproduce their content or claim affiliation
