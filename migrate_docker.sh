#!/bin/bash
set -e

SOURCE_DIR="/Users/jeremyuniclick/Library/Containers/com.docker.docker"
DEST_PARENT="/Volumes/Uniclick4TB/ApplicationData/Docker"
DEST_DIR="$DEST_PARENT/com.docker.docker"

echo "Checking source directory..."
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Source directory $SOURCE_DIR does not exist. Skipping Docker migration."
    exit 0
fi

echo "Creating destination parent..."
mkdir -p "$DEST_PARENT"

echo "Moving Docker data (this may take a while for 17GB)..."
# Using rsync to show progress or just mv? mv is simpler but silent.
# Let's use mv, but we need to be patient.
mv "$SOURCE_DIR" "$DEST_PARENT/"

echo "Creating symlink..."
ln -s "$DEST_DIR" "$SOURCE_DIR"

echo "Migration complete!"
ls -l "$SOURCE_DIR"
