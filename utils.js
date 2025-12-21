/**
 * Utility Functions Module
 */

/**
 * Format file size to human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Download a blob as a file
 * @param {Blob} blob - The blob to download
 * @param {string} fileName - Name for the downloaded file
 */
export function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Validate that a file is a PDF
 * @param {File} file - File to validate
 * @returns {boolean} True if valid PDF
 */
export function isValidPDF(file) {
    return file && (
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
    );
}

/**
 * Generate output filename based on input
 * @param {string} inputFileName - Original PDF filename
 * @returns {string} Output PPTX filename
 */
export function generateOutputFileName(inputFileName) {
    const baseName = inputFileName.replace(/\.pdf$/i, '');
    return `${baseName}.pptx`;
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Show error message to user
 * @param {string} message - Error message
 */
export function showError(message) {
    console.error(message);
    // Could be extended to show a toast notification
    alert(`エラー: ${message}`);
}
