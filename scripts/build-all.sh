#!/bin/bash

# LLMFeeder All-in-One Build Script
# Creates a single package with the extension source code

# Set version (change this for each release)
VERSION="1.0.0"

echo "Building LLMFeeder complete package v${VERSION}..."

# Create ZIP file directly from extension directory
# Make sure we're in the root project directory
cd "$(dirname "$0")/.." 

# Create the ZIP file
zip -r "LLMFeeder-v${VERSION}.zip" extension

echo "Complete package created: LLMFeeder-v${VERSION}.zip"
echo "Done!" 