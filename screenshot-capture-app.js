const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3333;

const SCREENSHOT_DIR = path.join(__dirname, 'docs/ui-regeneration/screenshots');

// Screenshot definitions
const SCREENSHOTS = [
    { path: "agent-cards/agent-card-both-online.png", desc: "Agent card with both A and M indicators GREEN (show nginx)" },
    { path: "agent-cards/agent-card-both-offline.png", desc: "Agent card with both A and M indicators RED (should still show version numbers)" },
    { path: "agent-cards/agent-card-agent-offline-manager-online.png", desc: "Agent card with A=RED, M=GREEN" },
    { path: "agent-cards/agent-card-agent-online-manager-offline.png", desc: "Agent card with A=GREEN, M=RED" },
    { path: "agent-cards/agent-card-hover-state.png", desc: "Mouse hovering over any agent card (if there's a hover effect)" },
    { path: "agent-cards/agent-card-with-versions.png", desc: "Close-up of version text when services are online" },
    { path: "agent-cards/agent-card-no-versions.png", desc: "Card showing 'unknown' (only if you have one that's never been polled)" },
    { path: "agent-cards/agent-cards-grid-layout.png", desc: "Multiple agent cards showing the grid spacing" },
    { path: "log-viewer/log-viewer-full-modal.png", desc: "ENTIRE log viewer modal (should show 80vh height)" },
    { path: "log-viewer/log-viewer-title-bar.png", desc: "Close-up of the compact title bar" },
    { path: "log-viewer/log-viewer-header-section.png", desc: "The 2-line header section with command/agent/status" },
    { path: "log-viewer/log-viewer-execution-timeline.png", desc: "The scrollable log content area" },
    { path: "log-viewer/log-viewer-long-lines-wrapped.png", desc: "Example of long log lines wrapping" },
    { path: "log-viewer/log-viewer-empty-state.png", desc: "Log viewer with no logs" },
    { path: "console/console-entry-pending.png", desc: "Blue PENDING status console entry" },
    { path: "console/console-entry-success.png", desc: "Green SUCCESS status console entry" },
    { path: "console/console-entry-failed.png", desc: "Red FAILED status console entry" },
    { path: "console/console-entry-timeout.png", desc: "Orange TIMEOUT status console entry" },
    { path: "console/console-entry-manual-termination.png", desc: "Orange MANUAL TERMINATION entry" },
    { path: "console/console-entry-partial-success.png", desc: "Yellow PARTIAL SUCCESS entry" },
    { path: "console/console-parent-child-hierarchy.png", desc: "Parent command with indented └─ children" },
    { path: "console/console-multiple-operations.png", desc: "Several operations showing scroll behavior" },
    { path: "console/console-timestamp-format.png", desc: "Close-up of timestamp format" },
    { path: "dialogs/dialog-stop-all-success.png", desc: "'Stop All Managers' success dialog" },
    { path: "dialogs/dialog-stop-all-partial.png", desc: "Dialog showing some succeeded, some failed" },
    { path: "dialogs/dialog-stop-all-failed.png", desc: "Dialog showing all operations failed" },
    { path: "dialogs/dialog-start-all-success.png", desc: "'Start All Agents' success dialog" },
    { path: "dialogs/dialog-manager-offline-error.png", desc: "'Cannot Control Agent' error when manager is down" },
    { path: "dialogs/dialog-agent-not-found.png", desc: "Agent not found error (if you have this)" },
    { path: "dialogs/dialog-header-with-timing.png", desc: "Close-up of 'Total time: X.XX seconds'" },
    { path: "dialogs/dialog-individual-timings.png", desc: "Close-up of individual '→ 2.4s' timings" },
    { path: "hamburger-menu/hamburger-menu-closed.png", desc: "The ☰ hamburger icon in header" },
    { path: "hamburger-menu/hamburger-menu-open-full.png", desc: "Full dropdown menu showing all options" },
    { path: "hamburger-menu/hamburger-menu-dividers.png", desc: "Close-up of the divider lines" },
    { path: "hamburger-menu/hamburger-menu-agent-operations.png", desc: "Agent operations section" },
    { path: "hamburger-menu/hamburger-menu-manager-operations.png", desc: "Manager operations section" },
    { path: "context-menu/context-menu-all-online.png", desc: "Right-click menu when both agent and manager are online (Start options grayed out)" },
    { path: "context-menu/context-menu-all-offline.png", desc: "Right-click menu when both are offline (Stop options grayed out)" },
    { path: "context-menu/context-menu-agent-offline-manager-online.png", desc: "Menu with agent offline, manager online" },
    { path: "context-menu/context-menu-agent-online-manager-offline.png", desc: "Menu with agent online, manager offline" },
    { path: "context-menu/context-menu-separators.png", desc: "Close-up showing the separator lines between sections" },
    { path: "context-menu/context-menu-disabled-hover.png", desc: "Hovering over a disabled item (shows not-allowed cursor)" },
    { path: "context-menu/context-menu-enabled-hover.png", desc: "Hovering over enabled item (shows hover highlight)" },
    { path: "status-bar/status-bar-clock-format.png", desc: "Clock showing '2:45:33 PM' format (no leading zero)" },
    { path: "status-bar/status-bar-last-update.png", desc: "The 'Last Update' timestamp" },
    { path: "status-bar/status-bar-complete.png", desc: "Entire status bar at bottom" },
    { path: "full-page-normal-state.png", desc: "ENTIRE hub interface in normal state" },
    { path: "full-page-with-modal.png", desc: "Hub with log viewer modal open" },
    { path: "full-page-operation-running.png", desc: "Hub during active operations (console entries visible)" },
    { path: "responsive-tablet-view.png", desc: "Hub on tablet/iPad view (optional)" },
    { path: "responsive-mobile-view.png", desc: "Hub on mobile view (optional)" }
];

// Multer setup for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // For multipart/form-data, we need to handle this differently
        // The screenshotPath comes from the fieldname
        const screenshotPath = file.fieldname;
        const dir = path.join(SCREENSHOT_DIR, path.dirname(screenshotPath));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // The screenshotPath comes from the fieldname
        const screenshotPath = file.fieldname;
        cb(null, path.basename(screenshotPath));
    }
});

const upload = multer({ storage });

// Serve static files (for showing existing images)
app.use('/screenshots', express.static(SCREENSHOT_DIR));

// API endpoint to get screenshot list with status
app.get('/api/screenshots', (req, res) => {
    const status = SCREENSHOTS.map(s => ({
        ...s,
        exists: fs.existsSync(path.join(SCREENSHOT_DIR, s.path))
    }));
    res.json(status);
});

// API endpoint to handle image upload
app.post('/api/upload', upload.any(), (req, res) => {
    if (req.files && req.files.length > 0) {
        const file = req.files[0];
        res.json({ success: true, path: file.fieldname });
    } else {
        res.status(400).json({ success: false, error: 'No file uploaded' });
    }
});

// Serve the HTML page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Backend AI Screenshot Capture</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .progress {
            text-align: center;
            margin: 20px 0;
            font-size: 18px;
            color: #666;
        }
        .screenshot-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }
        .screenshot-item {
            background: white;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s;
            position: relative;
        }
        .screenshot-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .screenshot-item.complete {
            border-left: 4px solid #10b981;
        }
        .screenshot-path {
            font-size: 12px;
            color: #666;
            font-family: monospace;
            margin-bottom: 8px;
        }
        .screenshot-desc {
            font-size: 14px;
            color: #333;
            margin-bottom: 15px;
            line-height: 1.4;
        }
        .drop-zone {
            border: 2px dashed #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: #fafafa;
        }
        .drop-zone:hover {
            border-color: #3b82f6;
            background: #f0f9ff;
        }
        .drop-zone.drag-over {
            border-color: #3b82f6;
            background: #dbeafe;
        }
        .preview-img {
            width: 150px;
            height: 150px;
            object-fit: contain;
            border-radius: 4px;
            margin: 10px auto;
            display: block;
            background: #f0f0f0;
        }
        .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 10px;
        }
        .status.complete {
            background: #d1fae5;
            color: #065f46;
        }
        .status.pending {
            background: #fee2e2;
            color: #991b1b;
        }
        .stats {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .copy-button {
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            color: #999;
            border: none;
            border-radius: 4px;
            padding: 6px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.3;
        }
        .screenshot-item:hover .copy-button {
            opacity: 0.8;
        }
        .copy-button:hover {
            opacity: 1;
            color: #3b82f6;
        }
        .copy-button:active {
            transform: scale(0.95);
        }
    </style>
</head>
<body>
    <h1>Backend AI Screenshot Capture Tool</h1>
    <div class="progress" id="progress">Loading...</div>
    <div class="stats" id="stats"></div>
    <div class="screenshot-grid" id="screenshot-grid"></div>

    <script>
        let screenshots = [];

        async function loadScreenshots() {
            const response = await fetch('/api/screenshots');
            screenshots = await response.json();
            renderScreenshots();
            updateStats();
        }

        function updateStats() {
            const complete = screenshots.filter(s => s.exists).length;
            const total = screenshots.length;
            document.getElementById('stats').innerHTML = \`
                <strong>Progress:</strong> \${complete}/\${total} captured<br>
                <div style="margin-top: 8px;">
                    <div style="background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: #10b981; height: 100%; width: \${(complete/total*100)}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            \`;
            document.getElementById('progress').textContent = \`\${complete} of \${total} screenshots captured\`;
        }

        function renderScreenshots() {
            const grid = document.getElementById('screenshot-grid');
            grid.innerHTML = screenshots.map((s, index) => \`
                <div class="screenshot-item \${s.exists ? 'complete' : ''}">
                    <button class="copy-button" onclick="copyInfo(\${index})" title="Copy info to clipboard">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <div class="screenshot-path">\${s.path}</div>
                    <div class="status \${s.exists ? 'complete' : 'pending'}">\${s.exists ? '✓ Captured' : '⚠ Needed'}</div>
                    <div class="screenshot-desc">\${s.desc}</div>
                    <div class="drop-zone" data-index="\${index}" 
                         ondrop="handleDrop(event)" 
                         ondragover="handleDragOver(event)" 
                         ondragleave="handleDragLeave(event)">
                        \${s.exists 
                            ? \`<img src="/screenshots/\${s.path}" class="preview-img" onerror="this.style.display='none'">\`
                            : '<div style="color: #999;">Drop image here</div>'
                        }
                    </div>
                </div>
            \`).join('');
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
        }

        function handleDragLeave(e) {
            e.currentTarget.classList.remove('drag-over');
        }

        async function handleDrop(e) {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            
            const index = parseInt(e.currentTarget.dataset.index);
            const screenshot = screenshots[index];
            const file = e.dataTransfer.files[0];
            
            if (file && file.type.startsWith('image/')) {
                const formData = new FormData();
                // Use the screenshot path as the field name
                formData.append(screenshot.path, file);
                
                try {
                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        await loadScreenshots();
                    } else {
                        const error = await response.json();
                        console.error('Upload failed:', error);
                        alert('Upload failed: ' + (error.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                    alert('Upload error: ' + err.message);
                }
            }
        }

        function copyInfo(index) {
            const screenshot = screenshots[index];
            const info = [
                screenshot.path,
                \`captured \${screenshot.exists ? 'y' : 'n'}\`,
                screenshot.desc,
                \`Image: \${screenshot.exists ? screenshot.path : 'not defined'}\`
            ].join('\\n');
            
            // Get the button element (might be the SVG or its parent)
            let button = event.target;
            while (button && !button.classList.contains('copy-button')) {
                button = button.parentElement;
            }
            
            if (!button) {
                console.error('Copy button not found');
                return;
            }
            
            navigator.clipboard.writeText(info).then(() => {
                // Visual feedback
                const originalHTML = button.innerHTML;
                button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                button.style.color = '#10b981';
                
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.style.color = '#999';
                }, 1500);
            }).catch(err => {
                console.error('Copy failed:', err);
                alert('Failed to copy to clipboard: ' + err.message);
            });
        }

        // Initialize
        loadScreenshots();
        
        // Auto-refresh every 2 seconds to catch external changes
        setInterval(loadScreenshots, 2000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`\n🎯 Screenshot Capture App running at http://localhost:${PORT}\n`);
    console.log('Instructions:');
    console.log('1. Open http://localhost:3333 in your browser');
    console.log('2. Take screenshots with Cmd+Shift+4');
    console.log('3. Drag & drop them onto the appropriate boxes');
    console.log('4. Progress is saved automatically\n');
});