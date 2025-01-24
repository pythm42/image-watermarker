let uploadedImages = [];
let watermarkImage = null;
let watermarkSettings = {
    size: 100,
    opacity: 0.5,
    locked: false
};
let imageSettings = {};
let imageMetadata = {};

// Event Listeners
document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
document.getElementById('watermarkUpload').addEventListener('change', handleWatermarkUpload);
document.getElementById('size').addEventListener('input', updateWatermarkSize);
document.getElementById('opacity').addEventListener('input', updateWatermarkOpacity);
document.getElementById('lockSettings').addEventListener('click', toggleLockSettings);
document.getElementById('downloadAll').addEventListener('click', downloadImages);

async function handleImageUpload(event) {
    const files = event.target.files;
    const formData = new FormData();
    
    for (let file of files) {
        formData.append('images', file);
    }

    try {
        const response = await fetch('/upload-images', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        uploadedImages = data.files;
        
        // Initialize settings and load metadata for each image
        await Promise.all(uploadedImages.map(async (img) => {
            // Load image to get natural dimensions
            const imgElement = new Image();
            await new Promise((resolve) => {
                imgElement.onload = resolve;
                imgElement.src = img.path;
            });
            
            imageMetadata[img.filename] = {
                naturalWidth: imgElement.naturalWidth,
                naturalHeight: imgElement.naturalHeight
            };
            
            imageSettings[img.filename] = {
                displayX: 0,
                displayY: 0,
                scaledX: 0,
                scaledY: 0,
                size: watermarkSettings.size,
                scaledSize: watermarkSettings.size,
                opacity: watermarkSettings.opacity
            };
        }));

        updatePreview();
    } catch (error) {
        console.error('Error uploading images:', error);
    }
}

async function handleWatermarkUpload(event) {
    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('watermark', file);

    try {
        const response = await fetch('/upload-watermark', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        watermarkImage = data;
        
        // Load watermark metadata
        const watermarkElement = new Image();
        await new Promise((resolve) => {
            watermarkElement.onload = resolve;
            watermarkElement.src = watermarkImage.path;
        });
        
        watermarkImage.naturalWidth = watermarkElement.naturalWidth;
        watermarkImage.naturalHeight = watermarkElement.naturalHeight;
        
        updatePreview();
    } catch (error) {
        console.error('Error uploading watermark:', error);
    }
}

function updateWatermarkSize(event) {
    if (!watermarkSettings.locked) {
        const newSize = parseInt(event.target.value);
        watermarkSettings.size = newSize;
        document.getElementById('sizeValue').textContent = `${newSize}px`;

        // Update size in all image settings
        Object.keys(imageSettings).forEach(filename => {
            const metadata = imageMetadata[filename];
            const previewImage = document.querySelector(`[data-filename="${filename}"]`);
            if (previewImage) {
                const scale = metadata.naturalWidth / previewImage.offsetWidth;
                imageSettings[filename].size = newSize;
                imageSettings[filename].scaledSize = Math.round(newSize * scale);
            }
            // imageSettings[filename].size = newSize;
        });
        
        updatePreview();
    }
}

function updateWatermarkOpacity(event) {
    if (!watermarkSettings.locked) {
        const opacity = parseInt(event.target.value) / 100;
        watermarkSettings.opacity = opacity;
        document.getElementById('opacityValue').textContent = `${Math.round(opacity * 100)}%`;
        
        Object.keys(imageSettings).forEach(filename => {
            imageSettings[filename].opacity = opacity;
        });
        
        updatePreview();
    }
}

function toggleLockSettings() {
    watermarkSettings.locked = !watermarkSettings.locked;
    const button = document.getElementById('lockSettings');
    button.textContent = watermarkSettings.locked ? 'Unlock Settings' : 'Lock Settings';
    
    document.getElementById('size').disabled = watermarkSettings.locked;
    document.getElementById('opacity').disabled = watermarkSettings.locked;
}

function updatePreview() {
    const previewContainer = document.getElementById('adjustmentPreview');
    previewContainer.innerHTML = '';

    uploadedImages.forEach(image => {
        const container = document.createElement('div');
        container.className = 'preview-container';
        
        // Create main image
        const img = new Image();
        img.src = image.path;
        img.className = 'main-image';
        img.setAttribute('data-filename', image.filename);
        
        // Create scale indicator
        const scaleIndicator = document.createElement('div');
        scaleIndicator.className = 'scale-indicator';
        
        // Create dimensions display
        const dimensionsDisplay = document.createElement('div');
        dimensionsDisplay.className = 'image-dimensions';
        
        const settings = imageSettings[image.filename];
        
        img.onload = () => {
            const scale = imageMetadata[image.filename].naturalWidth / img.offsetWidth;
            scaleIndicator.textContent = `Scale: ${scale.toFixed(2)}x`;
            dimensionsDisplay.textContent = `${imageMetadata[image.filename].naturalWidth}x${imageMetadata[image.filename].naturalHeight}px`;
            
            if (watermarkImage) {
                const watermarkContainer = document.createElement('div');
                watermarkContainer.className = 'watermark-container';
                watermarkContainer.style.left = `${settings.displayX}px`;
                watermarkContainer.style.top = `${settings.displayY}px`;
                
                const watermark = new Image();
                watermark.src = watermarkImage.path;
                watermark.className = 'watermark-overlay';
                watermark.style.width = `${settings.size}px`;
                watermark.style.opacity = settings.opacity;
                watermark.style.pointerEvents = 'none';
                
                watermarkContainer.appendChild(watermark);
                makeDraggable(watermarkContainer, image.filename);
                container.appendChild(watermarkContainer);
            }
        };
        
        container.appendChild(img);
        container.appendChild(scaleIndicator);
        container.appendChild(dimensionsDisplay);
        previewContainer.appendChild(container);
    });
}

function makeDraggable(element, imageFilename) {
    let isDragging = false;
    let startX;
    let startY;
    let initialLeft;
    let initialTop;
    
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('touchstart', onTouchStart, { passive: false });

    function onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
        
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        moveElement(touch.clientX, touch.clientY);
    }

    function onTouchEnd() {
        endDrag();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    }

    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        moveElement(e.clientX, e.clientY);
    }

    function onMouseUp() {
        endDrag();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    function startDrag(clientX, clientY) {
        isDragging = true;
        startX = clientX;
        startY = clientY;
        initialLeft = element.offsetLeft;
        initialTop = element.offsetTop;
        element.style.cursor = 'grabbing';
    }

    function moveElement(clientX, clientY) {
        const dx = clientX - startX;
        const dy = clientY - startY;
        
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;
        
        const container = element.parentElement;
        const maxLeft = container.clientWidth - element.offsetWidth;
        const maxTop = container.clientHeight - element.offsetHeight;
        
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
        
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        
        const img = container.querySelector('img[data-filename]');
        const scale = imageMetadata[imageFilename].naturalWidth / img.offsetWidth;
        
        imageSettings[imageFilename].displayX = newLeft;
        imageSettings[imageFilename].displayY = newTop;
        imageSettings[imageFilename].scaledX = Math.round(newLeft * scale);
        imageSettings[imageFilename].scaledY = Math.round(newTop * scale);
    }

    function endDrag() {
        isDragging = false;
        element.style.cursor = 'grab';
    }
}

async function downloadImages() {
    const downloadBtn = document.getElementById('downloadAll');
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Processing...';

    try {
        const response = await fetch('/process-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                images: uploadedImages,
                watermark: watermarkImage,
                settings: imageSettings
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'watermarked-images.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            throw new Error('Failed to download images');
        }
    } catch (error) {
        console.error('Error downloading images:', error);
        alert('Failed to download images. Please try again.');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download All Images';
    }
}