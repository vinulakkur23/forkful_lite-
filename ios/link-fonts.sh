#!/bin/bash

# Clean up any previous font files
rm -f *.ttf *.otf 2>/dev/null

# Copy font files to the iOS Resources
cp ../assets/fonts/*.{ttf,otf} ./

# Print a message to verify the script ran
echo "Font files copied to iOS directory:"
ls -la *.ttf *.otf 2>/dev/null