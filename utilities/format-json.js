#!/usr/bin/env node

/**
 * Format JSON arrays as text or markdown tables
 * Usage: format-json <filename> [-format text|md|json]
 * 
 * Expects JSON with structure:
 * {
 *   "arrayKey": [
 *     { "field1": "value1", "field2": "value2", ... },
 *     { "field1": "value3", "field2": "value4", ... }
 *   ]
 * }
 * 
 * Or just an array at root level:
 * [
 *   { "field1": "value1", "field2": "value2", ... },
 *   { "field1": "value3", "field2": "value4", ... }
 * ]
 */

const fs = require('fs');

// Removed getMaxWidth function - functionality moved into formatAsText

function formatValue(value, key, format) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Special formatting for boolean values in specific columns
    if (typeof value === 'boolean') {
        // For columns that should show checkmarks/x marks
        if (key === 'private' || key === 'enabled' || key === 'prv' || key === 'ena') {
            if (format === 'text') {
                // ANSI color codes for terminal
                return value ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
            } else if (format === 'markdown') {
                // Use clean colored circles for markdown
                return value ? '🟢' : '🔴';
            }
            return value ? '✓' : '✗';
        }
        return String(value);
    }
    
    if (typeof value === 'object') {
        // Handle nested objects specially
        if (value.ip !== undefined && value.port !== undefined) {
            return `${value.ip}:${value.port}`;
        }
        // For arrays, join with comma
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        // For other objects, try to create a simple string representation
        return JSON.stringify(value);
    }
    return String(value);
}

function formatAsText(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return 'No data to display';
    }
    
    // Get all unique keys from all objects
    const allKeys = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });
    let keys = Array.from(allKeys);
    
    // Map full column names to abbreviations
    const columnAbbrev = {
        'private': 'prv',
        'enabled': 'ena'
    };
    
    // Calculate column widths (using original keys for data access)
    const widths = {};
    keys.forEach(key => {
        const displayKey = columnAbbrev[key] || key;
        let maxWidth = displayKey.length;
        data.forEach(item => {
            // Strip ANSI codes for width calculation
            const value = formatValue(item[key], key, 'text').replace(/\x1b\[[0-9;]*m/g, '');
            if (value.length > maxWidth) {
                maxWidth = value.length;
            }
        });
        widths[key] = Math.max(maxWidth, 3); // Minimum width of 3 for ✓/✗
    });
    
    // Build header
    let output = '';
    keys.forEach((key, index) => {
        const displayKey = columnAbbrev[key] || key;
        output += displayKey.padEnd(widths[key]);
        if (index < keys.length - 1) output += '  ';
    });
    output += '\n';
    
    // Build separator
    keys.forEach((key, index) => {
        const displayKey = columnAbbrev[key] || key;
        output += '-'.repeat(displayKey.length).padEnd(widths[key]);
        if (index < keys.length - 1) output += '  ';
    });
    output += '\n';
    
    // Build rows
    data.forEach(item => {
        keys.forEach((key, index) => {
            const value = formatValue(item[key], key, 'text');
            // Account for ANSI codes when padding
            const visibleLength = value.replace(/\x1b\[[0-9;]*m/g, '').length;
            const padding = widths[key] - visibleLength;
            output += value + ' '.repeat(Math.max(0, padding));
            if (index < keys.length - 1) output += '  ';
        });
        output += '\n';
    });
    
    return output.trim();
}

function formatAsMarkdown(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return 'No data to display';
    }
    
    // Get all unique keys from all objects
    const allKeys = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });
    const keys = Array.from(allKeys);
    
    // Map full column names to abbreviations
    const columnAbbrev = {
        'private': 'prv',
        'enabled': 'ena'
    };
    
    // Build markdown table with abbreviated headers
    const headers = keys.map(key => columnAbbrev[key] || key);
    let output = '| ' + headers.join(' | ') + ' |\n';
    output += '|' + headers.map(() => '---').join('|') + '|\n';
    
    data.forEach(item => {
        const values = keys.map(key => formatValue(item[key], key, 'markdown'));
        output += '| ' + values.join(' | ') + ' |\n';
    });
    
    return output.trim();
}

function extractArray(json) {
    // If it's already an array, return it
    if (Array.isArray(json)) {
        return json;
    }
    
    // If it's an object, find the first array property
    if (typeof json === 'object' && json !== null) {
        for (const key of Object.keys(json)) {
            if (Array.isArray(json[key])) {
                return json[key];
            }
        }
    }
    
    return [];
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: format-json <filename> [-format text|md|json]');
        console.error('  filename: JSON file to format (or - for stdin)');
        console.error('  -format: Output format (default: text)');
        process.exit(1);
    }
    
    const filename = args[0];
    let format = 'text';
    
    // Parse format argument
    const formatIndex = args.indexOf('-format');
    if (formatIndex !== -1 && args[formatIndex + 1]) {
        format = args[formatIndex + 1].toLowerCase();
    }
    
    try {
        let content;
        
        // Read from stdin or file
        if (filename === '-') {
            content = fs.readFileSync(0, 'utf8');
        } else {
            content = fs.readFileSync(filename, 'utf8');
        }
        
        const json = JSON.parse(content);
        const data = extractArray(json);
        
        switch (format) {
            case 'md':
            case 'markdown':
                console.log(formatAsMarkdown(data));
                break;
            case 'json':
                console.log(JSON.stringify(json, null, 2));
                break;
            case 'text':
            default:
                console.log(formatAsText(data));
                break;
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = { formatAsText, formatAsMarkdown, extractArray };