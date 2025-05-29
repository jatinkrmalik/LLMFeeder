#!/bin/bash

# LLMFeeder Build Script
# Consolidated build script for generating Chrome, Firefox, and source packages
# Usage: ./scripts/build.sh [chrome|firefox|source|all]

# Default values
VERSION="1.0.0"
TARGET="all"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"
TEMP_DIR="$ROOT_DIR/.tmp-build"

# Process command line arguments
if [ $# -gt 0 ]; then
  case "$1" in
    "chrome"|"firefox"|"source")
      TARGET="$1"
      ;;
    "all")
      TARGET="all"
      ;;
    "--help"|"-h")
      echo "Usage: $0 [chrome|firefox|source|all]"
      echo "  chrome  - Build Chrome package only"
      echo "  firefox - Build Firefox package only"
      echo "  source  - Build source package only"
      echo "  all     - Build all packages (default)"
      echo ""
      echo "  --version VERSION - Set version number (default: 1.0.0)"
      echo "  --help|-h         - Show this help message"
      exit 0
      ;;
    "--version")
      if [ $# -gt 1 ]; then
        VERSION="$2"
        shift
      else
        echo "Error: --version requires a version number"
        exit 1
      fi
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
  shift
fi

# Create distribution directory if it doesn't exist
mkdir -p "$DIST_DIR"

# Print build information
echo "LLMFeeder Build Script"
echo "======================"
echo "Version: $VERSION"
echo "Target: $TARGET"
echo "Output directory: $DIST_DIR"
echo ""

# Function to build Chrome package
build_chrome() {
  echo "Building Chrome package..."
  
  # Create temp directory
  mkdir -p "$TEMP_DIR/chrome/extension/libs"
  
  # Copy all extension files
  cp -r "$ROOT_DIR/extension/"* "$TEMP_DIR/chrome/extension/"
  
  # Modify manifest.json to remove Firefox-specific settings
  if command -v jq &> /dev/null; then
    echo "Using jq to create Chrome manifest..."
    jq 'del(.browser_specific_settings)' "$ROOT_DIR/extension/manifest.json" > "$TEMP_DIR/chrome/extension/manifest.json"
  else
    echo "jq not found, using sed instead (Firefox settings may remain)..."
    cp "$ROOT_DIR/extension/manifest.json" "$TEMP_DIR/chrome/extension/manifest.json"
    sed -i.bak '/browser_specific_settings/,/}/d' "$TEMP_DIR/chrome/extension/manifest.json" || true
    rm -f "$TEMP_DIR/chrome/extension/manifest.json.bak" 2>/dev/null || true
  fi
  
  # Create ZIP file
  echo "Creating Chrome ZIP file..."
  (cd "$TEMP_DIR/chrome" && zip -r "$DIST_DIR/LLMFeeder-Chrome-v$VERSION.zip" extension -q)
  
  echo "Chrome package created: $DIST_DIR/LLMFeeder-Chrome-v$VERSION.zip"
  return 0
}

# Function to build Firefox package
build_firefox() {
  echo "Building Firefox package..."
  
  # Create temp directory
  mkdir -p "$TEMP_DIR/firefox/extension/libs"
  
  # Copy all extension files
  cp -r "$ROOT_DIR/extension/"* "$TEMP_DIR/firefox/extension/"
  
  # Ensure Firefox manifest has necessary browser_specific_settings
  if command -v jq &> /dev/null; then
    echo "Using jq to create Firefox manifest..."
    jq '.browser_specific_settings = {
      "gecko": {
        "id": "llmfeeder@j47.in",
        "strict_min_version": "109.0"
      }
    }' "$ROOT_DIR/extension/manifest.json" > "$TEMP_DIR/firefox/extension/manifest.json"
  else
    echo "jq not found, using copy instead..."
    cp "$ROOT_DIR/extension/manifest.json" "$TEMP_DIR/firefox/extension/manifest.json"
  fi
  
  # Create ZIP file
  echo "Creating Firefox ZIP file..."
  (cd "$TEMP_DIR/firefox" && zip -r "$DIST_DIR/LLMFeeder-Firefox-v$VERSION.zip" extension -q)
  
  echo "Firefox package created: $DIST_DIR/LLMFeeder-Firefox-v$VERSION.zip"
  return 0
}

# Function to build source package
build_source() {
  echo "Building source package..."
  
  # Create ZIP file directly from extension directory
  echo "Creating source ZIP file..."
  (cd "$ROOT_DIR" && zip -r "$DIST_DIR/LLMFeeder-Source-v$VERSION.zip" extension -q)
  
  echo "Source package created: $DIST_DIR/LLMFeeder-Source-v$VERSION.zip"
  return 0
}

# Build the specified package(s)
case "$TARGET" in
  "chrome")
    build_chrome
    ;;
  "firefox")
    build_firefox
    ;;
  "source")
    build_source
    ;;
  "all")
    build_chrome
    echo ""
    build_firefox
    echo ""
    build_source
    ;;
esac

# Clean up
if [ -d "$TEMP_DIR" ]; then
  echo ""
  echo "Cleaning up temporary files..."
  rm -rf "$TEMP_DIR"
fi

echo ""
echo "Build completed successfully!"
echo "Output files can be found in: $DIST_DIR" 