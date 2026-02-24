#!/usr/bin/env node

/**
 * Generate Stakeholder Database Documentation
 * 
 * This script updates the stakeholder database overview document
 * with current date and database statistics.
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(process.cwd(), 'docs');
const STAKEHOLDER_DOC = path.join(DOCS_DIR, 'stakeholder-database-overview.md');
const ERD_SVG = path.join(process.cwd(), 'apps/whk-recipe-configuration/prisma/ERD.svg');
const ERD_MD = path.join(process.cwd(), 'apps/whk-recipe-configuration/prisma/ERD.md');

async function updateStakeholderDoc() {
  try {
    // Read the current document
    let content = fs.readFileSync(STAKEHOLDER_DOC, 'utf8');
    
    // Update the last updated date
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    content = content.replace(
      /Last updated: \[Current Date\]/g,
      `Last updated: ${currentDate}`
    );
    
    // Check if ERD files exist and update paths if needed
    const erdSvgExists = fs.existsSync(ERD_SVG);
    const erdMdExists = fs.existsSync(ERD_MD);
    
    if (!erdSvgExists || !erdMdExists) {
      console.log('⚠️  ERD files not found. Run "npm run prisma:generate" first.');
    }
    
    // Write the updated content
    fs.writeFileSync(STAKEHOLDER_DOC, content);
    
    console.log('✅ Stakeholder documentation updated successfully!');
    console.log(`📅 Updated date: ${currentDate}`);
    console.log(`📄 Document location: ${STAKEHOLDER_DOC}`);
    
    if (erdSvgExists) {
      console.log(`🎨 ERD SVG available: ${ERD_SVG}`);
    }
    if (erdMdExists) {
      console.log(`📝 ERD Markdown available: ${ERD_MD}`);
    }
    
  } catch (error) {
    console.error('❌ Error updating stakeholder documentation:', error.message);
    process.exit(1);
  }
}

// Helper function to create a simple HTML wrapper for the ERD
function createHtmlWrapper() {
  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whiskey House Database ERD</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 100%;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .header p {
            color: #666;
            font-size: 16px;
        }
        .erd-container {
            text-align: center;
            overflow: auto;
        }
        .erd-container svg {
            max-width: 100%;
            height: auto;
        }
        .controls {
            margin: 20px 0;
            text-align: center;
        }
        .controls button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            margin: 0 10px;
            border-radius: 4px;
            cursor: pointer;
        }
        .controls button:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🥃 Whiskey House Manufacturing Database</h1>
            <p>Entity Relationship Diagram - Complete Database Structure</p>
            <p><em>Generated on: ${new Date().toLocaleDateString()}</em></p>
        </div>
        
        <div class="controls">
            <button onclick="zoomIn()">🔍 Zoom In</button>
            <button onclick="zoomOut()">🔍 Zoom Out</button>
            <button onclick="resetZoom()">🔄 Reset</button>
            <button onclick="toggleFullscreen()">📺 Fullscreen</button>
        </div>
        
        <div class="erd-container" id="erdContainer">
            <!-- ERD SVG will be inserted here -->
        </div>
    </div>

    <script>
        let currentZoom = 1;
        
        function zoomIn() {
            currentZoom *= 1.2;
            applyZoom();
        }
        
        function zoomOut() {
            currentZoom *= 0.8;
            applyZoom();
        }
        
        function resetZoom() {
            currentZoom = 1;
            applyZoom();
        }
        
        function applyZoom() {
            const svg = document.querySelector('#erdContainer svg');
            if (svg) {
                svg.style.transform = \`scale(\${currentZoom})\`;
            }
        }
        
        function toggleFullscreen() {
            const container = document.getElementById('erdContainer');
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                container.requestFullscreen();
            }
        }
        
        // Load SVG content
        fetch('ERD.svg')
            .then(response => response.text())
            .then(svgContent => {
                document.getElementById('erdContainer').innerHTML = svgContent;
            })
            .catch(error => {
                document.getElementById('erdContainer').innerHTML = 
                    '<p style="color: red;">Error loading ERD diagram. Please ensure ERD.svg is available.</p>';
            });
    </script>
</body>
</html>`;

  const htmlPath = path.join(DOCS_DIR, 'database-erd.html');
  fs.writeFileSync(htmlPath, htmlTemplate);
  console.log(`📄 Interactive HTML ERD created: ${htmlPath}`);
}

// Run the update
updateStakeholderDoc();

// Optionally create HTML wrapper
if (process.argv.includes('--html')) {
  createHtmlWrapper();
} 