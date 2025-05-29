#!/bin/bash

# LLMFeeder Build Script
# Runs all build scripts to create distribution packages

echo "Building LLMFeeder packages..."
echo "------------------------------"

# Run Chrome build script
echo "Building Chrome package..."
./scripts/build-chrome.sh

echo ""

# Run Firefox build script
echo "Building Firefox package..."
./scripts/build-firefox.sh

echo ""

# Run all-in-one build script
echo "Building complete source package..."
./scripts/build-all.sh

echo ""
echo "All packages built successfully!"
echo "------------------------------" 