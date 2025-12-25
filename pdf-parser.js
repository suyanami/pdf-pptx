/**
 * PDF Parser Module
 * Uses pdf.js to extract content and render PDF pages
 * Supports cropping regions for text OCR and image extraction
 */

// Initialize pdf.js with worker
const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

// Cache for PDF document
let cachedPdf = null;
let cachedFile = null;

/**
 * Get PDF document (with caching)
 */
async function getPdfDocument(file) {
    if (cachedFile === file && cachedPdf) {
        return cachedPdf;
    }
    const arrayBuffer = await file.arrayBuffer();
    cachedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    cachedFile = file;
    return cachedPdf;
}

/**
 * Render a page for preview
 */
export async function renderPagePreview(file, pageNum, canvas, maxWidth = 600) {
    const pdf = await getPdfDocument(file);
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
        canvasContext: context,
        viewport: scaledViewport
    }).promise;
}

/**
 * Check if a PDF page is structured (has extractable text) or image-based
 * @param {File} file - PDF file
 * @param {number} pageNum - Page number
 * @returns {Promise<Object>} { type: 'structured'|'image-based', textLength, itemCount }
 */
export async function checkPageType(file, pageNum) {
    const pdf = await getPdfDocument(file);
    const page = await pdf.getPage(pageNum);

    try {
        const textContent = await page.getTextContent();
        const items = textContent.items || [];

        // Calculate total text length
        const totalText = items.map(item => item.str || '').join('');
        const textLength = totalText.replace(/\s+/g, '').length;

        // Threshold: if less than 50 chars, consider it image-based
        const threshold = 50;
        const type = textLength >= threshold ? 'structured' : 'image-based';

        console.log(`[PDF Parser] Page ${pageNum} type: ${type} (${textLength} chars, ${items.length} items)`);

        return {
            type,
            textLength,
            itemCount: items.length,
            textItems: type === 'structured' ? items : [] // Return items for structured pages
        };
    } catch (err) {
        console.error('[PDF Parser] Error checking page type:', err);
        return { type: 'image-based', textLength: 0, itemCount: 0, textItems: [] };
    }
}

/**
 * Get page count
 */
export async function getPageCount(file) {
    const pdf = await getPdfDocument(file);
    return pdf.numPages;
}

/**
 * Get page dimensions in PDF points
 */
export async function getPageDimensions(file, pageNum) {
    const pdf = await getPdfDocument(file);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    return {
        width: viewport.width,
        height: viewport.height
    };
}

/**
 * Crop a region from a PDF page
 * @param {File} file - PDF file
 * @param {number} pageNum - Page number
 * @param {Object} region - Region with x, y, width, height (in canvas coordinates)
 * @param {number} canvasWidth - Canvas width used for region selection
 * @param {number} canvasHeight - Canvas height used for region selection
 * @returns {Promise<Object>} Cropped region data
 */
export async function cropRegion(file, pageNum, region, canvasWidth, canvasHeight) {
    const pdf = await getPdfDocument(file);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    // Calculate scale from canvas to PDF points
    const scaleX = viewport.width / canvasWidth;
    const scaleY = viewport.height / canvasHeight;

    // Convert region coordinates to PDF points
    const pdfBounds = {
        x: region.x * scaleX,
        y: region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY
    };

    // Render the page at high resolution for cropping
    const renderScale = 4; // Higher scale for better OCR on small text
    const fullViewport = page.getViewport({ scale: renderScale });

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullViewport.width;
    fullCanvas.height = fullViewport.height;

    const ctx = fullCanvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

    await page.render({
        canvasContext: ctx,
        viewport: fullViewport
    }).promise;

    // Crop the region
    const cropX = pdfBounds.x * renderScale;
    const cropY = pdfBounds.y * renderScale;
    const cropW = pdfBounds.width * renderScale;
    const cropH = pdfBounds.height * renderScale;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;

    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return {
        imageData: cropCanvas.toDataURL('image/png'),
        pdfBounds,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        width: cropW,
        height: cropH
    };
}

/**
 * Perform OCR on a cropped region
 * Returns line-level bboxes for accurate PPTX text placement
 * @param {string} imageData - Base64 image data URL
 * @returns {Promise<Object>} { text, lines: [{ text, bbox: {x0,y0,x1,y1}, conf }], avgConf }
 */
export async function ocrRegion(imageData) {
    if (typeof Tesseract === 'undefined') {
        console.error('[PDF Parser] Tesseract not available');
        return { text: '', lines: [], avgConf: 0 };
    }

    console.log('[OCR] Starting recognition...');

    try {
        const worker = await Tesseract.createWorker('eng+jpn');
        const result = await worker.recognize(imageData);
        await worker.terminate();

        const text = result.data.text || '';
        const rawLines = result.data.lines || [];

        // Extract line-level information with bboxes
        const lines = rawLines.map(line => ({
            text: line.text?.trim() || '',
            bbox: line.bbox ? {
                x0: line.bbox.x0,
                y0: line.bbox.y0,
                x1: line.bbox.x1,
                y1: line.bbox.y1
            } : null,
            conf: line.confidence || 0,
            words: (line.words || []).map(word => ({
                text: word.text,
                bbox: word.bbox ? {
                    x0: word.bbox.x0,
                    y0: word.bbox.y0,
                    x1: word.bbox.x1,
                    y1: word.bbox.y1
                } : null,
                conf: word.confidence || 0
            }))
        })).filter(line => line.text.length > 0);

        // Calculate average confidence
        const avgConf = lines.length > 0
            ? lines.reduce((sum, l) => sum + l.conf, 0) / lines.length
            : 0;

        console.log(`[OCR] Recognized ${lines.length} lines, avgConf: ${avgConf.toFixed(1)}%`);
        console.log('[OCR] Sample text:', text.substring(0, 80));

        return {
            text: text.trim(),
            lines,
            avgConf,
            rawData: result.data // Keep raw data for debugging
        };
    } catch (err) {
        console.error('[OCR] Error:', err);
        return { text: '', lines: [], avgConf: 0 };
    }
}

/**
 * Extract background color from a PDF page
 * Samples the corners and edges to determine the dominant background color
 */
export async function getPageBackgroundColor(file, pageNum) {
    const pdf = await getPdfDocument(file);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
        canvasContext: ctx,
        viewport: viewport
    }).promise;

    // Sample colors from corners and edges
    const samplePoints = [
        { x: 5, y: 5 },
        { x: canvas.width - 5, y: 5 },
        { x: 5, y: canvas.height - 5 },
        { x: canvas.width - 5, y: canvas.height - 5 },
        { x: canvas.width / 2, y: 5 },
        { x: canvas.width / 2, y: canvas.height - 5 }
    ];

    const colors = [];
    for (const point of samplePoints) {
        const imageData = ctx.getImageData(point.x, point.y, 1, 1).data;
        colors.push({
            r: imageData[0],
            g: imageData[1],
            b: imageData[2]
        });
    }

    // Find most common color (simple majority)
    const colorCounts = {};
    for (const color of colors) {
        const key = `${color.r},${color.g},${color.b}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    }

    let dominantColor = colors[0];
    let maxCount = 0;
    for (const [key, count] of Object.entries(colorCounts)) {
        if (count > maxCount) {
            maxCount = count;
            const [r, g, b] = key.split(',').map(Number);
            dominantColor = { r, g, b };
        }
    }

    // Convert to hex
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    const hexColor = `${toHex(dominantColor.r)}${toHex(dominantColor.g)}${toHex(dominantColor.b)}`;

    console.log(`[PDF Parser] Page ${pageNum} background color: #${hexColor}`);

    return hexColor;
}
