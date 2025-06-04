# Custom Stamp Images for Achievements

## Overview

This directory contains the custom stamp images for achievements in the MealRatingApp. Each image is displayed when a user earns an achievement and also appears in the Stamps screen collection.

## Image Requirements

- **Format**: PNG format with transparency
- **Size**: 200x200 pixels (square) recommended
- **Background**: Transparent background works best
- **Design**: Should be circular in overall shape to fit within the circular containers

## Adding Custom Stamp Images

1. Create your custom stamp images using your preferred design tool
2. Name each file to match the corresponding achievement ID (important!)
3. Place the files in this directory

## Achievement IDs and Image Names

The following achievements are defined in the app, and their image files should be named accordingly:

| Achievement ID      | Image Filename          | Description                       |
|--------------------|-----------------------|-----------------------------------|
| `first_bite`       | `first_bite.png`      | Earned after posting first meal   |
| `stumptown_starter` | `stumptown_starter.png`| Earned after posting in Portland  |
| `big_apple_bite`   | `big_apple_bite.png`  | Earned after posting in NYC       |
| `catch_of_the_day` | `catch_of_the_day.png`| Earned after posting seafood meal |
| `plant_curious`    | `plant_curious.png`   | Earned after posting vegetarian meal |
| `plantlandia`      | `plantlandia.png`     | Earned after posting vegan meal in Portland |
| `brew_and_chew`    | `brew_and_chew.png`   | Earned after posting beer in Portland |
| `taco_tuesday`     | `taco_tuesday.png`    | Earned after posting tacos on Tuesday |
| `dreaming_of_sushi`| `dreaming_of_sushi.png`| Earned after posting 5 sushi meals |
| `takeout_tour`     | `takeout_tour.png`    | Earned after posting 5 takeout/to-go meals |
| `urban_explorer`   | `urban_explorer.png`  | Earned after dining in 10 different cities |
| `flavor_nomad`     | `flavor_nomad.png`    | Earned after trying 5 different cuisines |
| `world_on_a_plate` | `world_on_a_plate.png`| Earned after trying 10 different cuisines |

## Important Notes

- If you add new achievements in the `achievementService.ts` file, make sure to add corresponding stamp images with matching filenames to this directory
- You must rebuild the app after adding new images for them to be included in the app bundle
- Images must be bundled at build time as they use `require()` statements for loading

## Testing Your Images

To test how your custom stamps look:
1. Replace the existing images with your designs (keeping the same filenames)
2. Rebuild and run the app
3. Check both the Stamps screen and achievement notifications

If you don't see your custom images:
- Double-check that the filenames match exactly
- Verify the images are in PNG format
- Rebuild the app completely