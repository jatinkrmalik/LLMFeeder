#!/bin/bash

# LLMFeeder Chrome Build Script
# Creates a Chrome-compatible package from the extension files

# Set version (change this for each release)
VERSION="1.0.0"
OUTDIR="."
TEMPDIR="./temp-chrome-build"

echo "Building LLMFeeder Chrome package v${VERSION}..."

# Create temp directory
mkdir -p $TEMPDIR/extension/libs

# Copy all extension files
cp -r extension/* $TEMPDIR/extension/

# Modify manifest.json to remove Firefox-specific settings if present
if command -v jq &> /dev/null; then
    echo "Using jq to create Chrome manifest..."
    jq 'del(.browser_specific_settings)' extension/manifest.json > $TEMPDIR/extension/manifest.json
else
    echo "jq not found, using sed instead..."
    # Simple fallback approach
    cp extension/manifest.json $TEMPDIR/extension/manifest.json
fi

# Create ZIP file
cd $TEMPDIR
zip -r "../LLMFeeder-Chrome-v${VERSION}.zip" extension
cd ..

# Clean up
rm -rf $TEMPDIR

echo "Chrome package created: LLMFeeder-Chrome-v${VERSION}.zip"
echo "Done!" 