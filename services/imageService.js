// services/imageService.js
const sharp = require('sharp');
const axios = require('axios');

// Configuration
const THUMBNAIL_CONFIG = {
  width: 300,
  height: 300,
  fit: 'inside', // Maintain aspect ratio
  quality: 80,
  maxFileSize: 10 * 1024 * 1024, // 10MB max
  maxThumbnailSize: 100 * 1024, // 100KB max for thumbnail
  timeout: 10000, // 10 second timeout for fetching
};

/**
 * Validate if URL is potentially an image
 * We'll do a more thorough check when fetching
 */
function isImageUrl(url) {
  // Basic URL validation
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch image from URL with size limit
 */
async function fetchImageFromUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: THUMBNAIL_CONFIG.timeout,
      maxContentLength: THUMBNAIL_CONFIG.maxFileSize,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Check content type
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('URL does not point to an image');
    }

    return Buffer.from(response.data);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Image fetch timeout');
    }
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
}

/**
 * Generate thumbnail from image buffer
 */
async function generateThumbnail(imageBuffer) {
  try {
    const thumbnail = await sharp(imageBuffer)
      .resize(THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height, {
        fit: THUMBNAIL_CONFIG.fit,
        withoutEnlargement: true
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    // Check thumbnail size
    if (thumbnail.length > THUMBNAIL_CONFIG.maxThumbnailSize) {
      // Re-compress with lower quality if too large
      const compressedThumbnail = await sharp(imageBuffer)
        .resize(THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height, {
          fit: THUMBNAIL_CONFIG.fit,
          withoutEnlargement: true
        })
        .jpeg({ quality: 60 })
        .toBuffer();

      return compressedThumbnail;
    }

    return thumbnail;
  } catch (error) {
    throw new Error(`Failed to generate thumbnail: ${error.message}`);
  }
}

/**
 * Get image metadata
 */
async function getImageMetadata(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: imageBuffer.length
    };
  } catch (error) {
    throw new Error(`Failed to get image metadata: ${error.message}`);
  }
}

/**
 * Process image URL: fetch, validate, generate thumbnail, extract metadata
 */
async function processImageUrl(url) {
  // Validate URL format
  if (!isImageUrl(url)) {
    throw new Error('URL does not appear to be an image');
  }

  // Fetch image
  const imageBuffer = await fetchImageFromUrl(url);

  // Get metadata
  const metadata = await getImageMetadata(imageBuffer);

  // Generate thumbnail
  const thumbnailBuffer = await generateThumbnail(imageBuffer);

  // Convert thumbnail to base64
  const thumbnailBase64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;

  return {
    thumbnail: thumbnailBase64,
    metadata: {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFormat: metadata.format,
      originalSize: metadata.size,
      thumbnailSize: thumbnailBuffer.length
    }
  };
}

/**
 * Process uploaded image file
 */
async function processImageFile(fileBuffer) {
  // Get metadata
  const metadata = await getImageMetadata(fileBuffer);

  // Check size limit
  if (fileBuffer.length > THUMBNAIL_CONFIG.maxFileSize) {
    throw new Error('Image file too large (max 10MB)');
  }

  // Generate thumbnail
  const thumbnailBuffer = await generateThumbnail(fileBuffer);

  // Convert thumbnail to base64
  const thumbnailBase64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;

  return {
    thumbnail: thumbnailBase64,
    metadata: {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFormat: metadata.format,
      originalSize: fileBuffer.length,
      thumbnailSize: thumbnailBuffer.length
    }
  };
}

module.exports = {
  isImageUrl,
  processImageUrl,
  processImageFile,
  THUMBNAIL_CONFIG
};
