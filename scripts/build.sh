#!/bin/bash

# LLMFeeder build script
# Creates both Chrome and Firefox packages

echo "Building LLMFeeder extension..."

# Make sure we're in the project root
cd "$(dirname "$0")/.."

# Create dist directory if it doesn't exist
mkdir -p dist

# Function to build Chrome extension
build_chrome() {
  echo "Building Chrome extension..."
  
  # Create Chrome directory
  mkdir -p dist/chrome
  
  # Copy files
  cp -r extension/* dist/chrome/
  
  # Create zip
  cd dist
  zip -r llmfeeder-chrome.zip chrome/*
  cd ..
  
  echo "Chrome package created at dist/llmfeeder-chrome.zip"
}

# Function to build Firefox extension
build_firefox() {
  echo "Building Firefox extension..."
  
  # Create Firefox directory
  mkdir -p dist/firefox
  
  # Copy files
  cp -r extension/* dist/firefox/
  
  # Create zip
  cd dist
  zip -r llmfeeder-firefox.zip firefox/*
  cd ..
  
  echo "Firefox package created at dist/llmfeeder-firefox.zip"
}

# Build both versions
build_chrome
build_firefox

echo "Build complete!" 