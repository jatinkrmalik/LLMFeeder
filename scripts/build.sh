#!/bin/bash

# LLMFeeder Build Script
# Consolidated build script for generating Chrome, Firefox, and source packages
# Usage: ./scripts/build.sh [chrome|firefox|source|all]

# Default values
VERSION="2.0.0"
TARGET="all"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"
TEMP_DIR="$ROOT_DIR/.tmp-build"
EXT_DIR="$ROOT_DIR/extension"

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
      echo "  --version VERSION - Set version number (default: 1.0.1)"
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

# Clean up any existing temp directories
rm -rf "$TEMP_DIR" 2>/dev/null
mkdir -p "$TEMP_DIR"

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
  
  # Remove any existing Chrome output files
  rm -f "$DIST_DIR/LLMFeeder-Chrome-v$VERSION.zip" 2>/dev/null
  
  # Create a clean temporary directory
  CHROME_DIR="$TEMP_DIR/chrome"
  rm -rf "$CHROME_DIR" 2>/dev/null
  mkdir -p "$CHROME_DIR"
  
  # Copy extension files to temp directory
  echo "Copying files for Chrome package..."
  cp "$EXT_DIR/background.js" "$CHROME_DIR/"
  cp "$EXT_DIR/content.js" "$CHROME_DIR/"
  cp "$EXT_DIR/popup.html" "$CHROME_DIR/"
  cp "$EXT_DIR/popup.js" "$CHROME_DIR/"
  cp "$EXT_DIR/styles.css" "$CHROME_DIR/"
  cp "$EXT_DIR/token-counter.js" "$CHROME_DIR/" 2>/dev/null || echo "Warning: token-counter.js not found"
  
  # Create directories and copy additional files
  mkdir -p "$CHROME_DIR/icons"
  mkdir -p "$CHROME_DIR/libs"
  cp "$EXT_DIR/icons/"* "$CHROME_DIR/icons/" 2>/dev/null
  cp "$EXT_DIR/libs/"* "$CHROME_DIR/libs/" 2>/dev/null
  
  # Create Chrome-specific manifest
  if command -v jq &> /dev/null; then
    echo "Using jq to create Chrome manifest..."
    # Remove Firefox-specific settings but ensure service_worker is preserved
    jq 'del(.browser_specific_settings)' "$EXT_DIR/manifest.json" > "$CHROME_DIR/manifest.json"
  else
    echo "jq not found, using sed instead..."
    cp "$EXT_DIR/manifest.json" "$CHROME_DIR/manifest.json"
    sed -i.bak '/browser_specific_settings/,/}/d' "$CHROME_DIR/manifest.json" || true
    rm -f "$CHROME_DIR/manifest.json.bak" 2>/dev/null || true
  fi
  
  # Create the ZIP file
  echo "Creating Chrome ZIP file..."
  (cd "$CHROME_DIR" && zip -r "$DIST_DIR/LLMFeeder-Chrome-v$VERSION.zip" * -q)
  
  echo "Chrome package created: $DIST_DIR/LLMFeeder-Chrome-v$VERSION.zip"
  return 0
}

# Function to build Firefox package
build_firefox() {
  echo "Building Firefox package..."
  
  # Remove any existing Firefox output files
  rm -f "$DIST_DIR/LLMFeeder-Firefox-v$VERSION.zip" 2>/dev/null
  
  # Create a clean temporary directory
  FIREFOX_DIR="$TEMP_DIR/firefox"
  rm -rf "$FIREFOX_DIR" 2>/dev/null
  mkdir -p "$FIREFOX_DIR"
  
  # Copy extension files to temp directory
  echo "Copying files for Firefox package..."
  cp "$EXT_DIR/background.js" "$FIREFOX_DIR/"
  cp "$EXT_DIR/content.js" "$FIREFOX_DIR/"
  cp "$EXT_DIR/popup.html" "$FIREFOX_DIR/"
  cp "$EXT_DIR/popup.js" "$FIREFOX_DIR/"
  cp "$EXT_DIR/styles.css" "$FIREFOX_DIR/"
  cp "$EXT_DIR/token-counter.js" "$FIREFOX_DIR/" 2>/dev/null || echo "Warning: token-counter.js not found"
  
  # Create directories and copy additional files
  mkdir -p "$FIREFOX_DIR/icons"
  mkdir -p "$FIREFOX_DIR/libs"
  cp "$EXT_DIR/icons/"* "$FIREFOX_DIR/icons/" 2>/dev/null
  cp "$EXT_DIR/libs/"* "$FIREFOX_DIR/libs/" 2>/dev/null
  
  # Create Firefox-specific manifest with required settings
  if command -v jq &> /dev/null; then
    echo "Using jq to create Firefox manifest..."
    # For Firefox 109, modify the background section to use scripts instead of service_worker
    jq '
    .browser_specific_settings = {
      "gecko": {
        "id": "llmfeeder@j47.in",
        "strict_min_version": "109.0"
      }
    } | 
    if has("background") then
      .background = {
        "scripts": ["background.js"]
      }
    else
      .
    end
    ' "$EXT_DIR/manifest.json" > "$FIREFOX_DIR/manifest.json"
  else
    echo "jq not found, using manual modification..."
    cp "$EXT_DIR/manifest.json" "$FIREFOX_DIR/manifest.json"
    # This is a basic substitution but might not work for all cases
    sed -i.bak 's/"service_worker": "background.js",\s*"type": "module"/"scripts": ["background.js"]/' "$FIREFOX_DIR/manifest.json" || true
    rm -f "$FIREFOX_DIR/manifest.json.bak" 2>/dev/null || true
  fi
  
  # Create the ZIP file
  echo "Creating Firefox ZIP file..."
  (cd "$FIREFOX_DIR" && zip -r "$DIST_DIR/LLMFeeder-Firefox-v$VERSION.zip" * -q)
  
  echo "Firefox package created: $DIST_DIR/LLMFeeder-Firefox-v$VERSION.zip"
  return 0
}

# Function to build source package
build_source() {
  echo "Building source package..."
  
  # Remove any existing source output files
  rm -f "$DIST_DIR/LLMFeeder-Source-v$VERSION.zip" 2>/dev/null
  
  # Create a clean temporary directory
  SOURCE_DIR="$TEMP_DIR/source"
  rm -rf "$SOURCE_DIR" 2>/dev/null
  mkdir -p "$SOURCE_DIR"
  
  # Copy extension files to temp directory
  echo "Copying files for source package..."
  cp "$EXT_DIR/background.js" "$SOURCE_DIR/"
  cp "$EXT_DIR/content.js" "$SOURCE_DIR/"
  cp "$EXT_DIR/popup.html" "$SOURCE_DIR/"
  cp "$EXT_DIR/popup.js" "$SOURCE_DIR/"
  cp "$EXT_DIR/styles.css" "$SOURCE_DIR/"
  cp "$EXT_DIR/token-counter.js" "$SOURCE_DIR/" 2>/dev/null || echo "Warning: token-counter.js not found"
  cp "$EXT_DIR/manifest.json" "$SOURCE_DIR/"
  
  # Create directories and copy additional files
  mkdir -p "$SOURCE_DIR/icons"
  mkdir -p "$SOURCE_DIR/libs"
  cp "$EXT_DIR/icons/"* "$SOURCE_DIR/icons/" 2>/dev/null
  cp "$EXT_DIR/libs/"* "$SOURCE_DIR/libs/" 2>/dev/null
  
  # Create the ZIP file
  echo "Creating source ZIP file..."
  (cd "$SOURCE_DIR" && zip -r "$DIST_DIR/LLMFeeder-Source-v$VERSION.zip" * -q)
  
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