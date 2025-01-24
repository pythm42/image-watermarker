const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const port = 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
['uploads', 'output'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
});

// Storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: { 
        fileSize: 50 * 1024 * 1024 // 50 MB file size limit
    }
});

app.post('/upload-images', upload.array('images'), (req, res) => {
    try {
        const files = req.files.map(file => ({
            filename: file.filename,
            path: `/uploads/${file.filename}`
        }));
        res.json({ files });
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

app.post('/upload-watermark', upload.single('watermark'), (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No watermark file provided');
        }
        const watermark = {
            filename: req.file.filename,
            path: `/uploads/${req.file.filename}`
        };
        res.json(watermark);
    } catch (error) {
        console.error('Error uploading watermark:', error);
        res.status(500).json({ error: 'Failed to upload watermark' });
    }
});

app.post('/process-images', async (req, res) => {
    try {
        const { images, watermark, settings } = req.body;
        
        if (!images || !watermark || !settings) {
            return res.status(400).json({ error: 'Missing required data' });
        }

        // Process images concurrently with enhanced quality preservation
        const processedImages = await Promise.all(images.map(async (image) => {
            const imgSettings = settings[image.filename];
            const outputPath = path.join('output', `watermarked-${image.filename}`);
            
            try {
                // Get original image metadata for precise processing
                const originalMetadata = await sharp(path.join('uploads', image.filename)).metadata();
                console.log('Original Image Metadata:', {
                    width: originalMetadata.width,
                    height: originalMetadata.height,
                    format: originalMetadata.format,
                    space: originalMetadata.space,
                    channels: originalMetadata.channels,
                    depth: originalMetadata.depth
                });

                // Prepare watermark with exact pixel size and high-quality settings
                const watermarkBuffer = await sharp(path.join('uploads', watermark.filename))
                    .ensureAlpha()
                    .resize(imgSettings.scaledSize)  // Use scaled size
                    .composite([{
                        input: Buffer.from([255, 255, 255, Math.round(imgSettings.opacity * 255)]),
                        raw: {
                            width: 1,
                            height: 1,
                            channels: 4
                        },
                        tile: true,
                        blend: 'dest-in'
                    }])
                    .toBuffer();

                // Process image with preservation of original quality and metadata
                await sharp(path.join('uploads', image.filename))
                    .composite([{
                        input: watermarkBuffer,
                        left: Math.round(imgSettings.scaledX),
                        top: Math.round(imgSettings.scaledY)
                    }])
                    .withMetadata() // Preserve original image metadata
                    .toFormat(originalMetadata.format, {
                        ...(originalMetadata.format === 'jpeg' ? { quality: 100 } : {}),
                        ...(originalMetadata.format === 'png' ? { compressionLevel: 0 } : {}),
                        ...(originalMetadata.format === 'webp' ? { quality: 100 } : {})
                    })
                    .toFile(outputPath);

                return outputPath;
            } catch (error) {
                console.error(`Detailed error processing image ${image.filename}:`, error);
                return null;
            }
        }));

        // Filter out failed images
        const validImages = processedImages.filter(Boolean);

        if (validImages.length === 0) {
            throw new Error('No images were successfully processed');
        }

        // Create zip file
        const archive = archiver('zip', { zlib: { level: 6 } });
        const zipPath = path.join('output', 'watermarked-images.zip');
        const output = fs.createWriteStream(zipPath);

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            output.on('error', reject);
            archive.on('error', reject);

            archive.pipe(output);
            validImages.forEach(imagePath => {
                archive.file(imagePath, { name: path.basename(imagePath) });
            });
            archive.finalize();
        });

        // Send file and clean up
        res.download(zipPath, 'watermarked-images.zip', (err) => {
            if (err) console.error('Error sending zip:', err);
            
            // Cleanup
            fs.unlink(zipPath, (err) => {
                if (err) console.error('Error removing zip:', err);
            });
            validImages.forEach(imagePath => {
                fs.unlink(imagePath, (err) => {
                    if (err) console.error('Error removing processed image:', err);
                });
            });
        });

    } catch (error) {
        console.error('Error in process-images:', error);
        res.status(500).json({ error: 'Error processing images' });
        
        // Cleanup on error
        fs.readdir('output', (err, files) => {
            if (err) return console.error('Error reading output directory:', err);
            files.forEach(file => {
                fs.unlink(path.join('output', file), err => {
                    if (err) console.error('Error removing file:', err);
                });
            });
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});