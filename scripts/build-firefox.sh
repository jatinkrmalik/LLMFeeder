#!/bin/bash

# LLMFeeder Firefox Build Script
# Creates a Firefox-compatible package from the extension files

# Set version (change this for each release)
VERSION="1.0.0"
OUTDIR="."
TEMPDIR="./temp-firefox-build"

echo "Building LLMFeeder Firefox package v${VERSION}..."

# Create temp directory for modified files
mkdir -p $TEMPDIR/extension/libs

# Copy all extension files
cp -r extension/* $TEMPDIR/extension/

# Create Firefox manifest by copying the original and modifying it
# Use jq if available for proper JSON handling, fallback to sed
if command -v jq &> /dev/null; then
    echo "Using jq to create Firefox manifest..."
    jq '
        .browser_specific_settings = {
            "gecko": {
                "id": "llmfeeder@jatinkrmalik.com",
                "strict_min_version": "109.0"
            }
        }
    ' extension/manifest.json > $TEMPDIR/extension/manifest.json
else
    echo "jq not found, using sed instead..."
    # This is a simpler fallback approach
    cp extension/manifest.json $TEMPDIR/extension/manifest.json
fi

# Create ZIP file
cd $TEMPDIR
zip -r "../LLMFeeder-Firefox-v${VERSION}.zip" extension
cd ..

# Clean up
rm -rf $TEMPDIR

echo "Firefox package created: LLMFeeder-Firefox-v${VERSION}.zip"
echo "Done!" 