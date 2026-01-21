/**
 * Template Preview Controller
 *
 * Provides endpoints for previewing and managing email templates.
 */

import templateService from '../services/templateService.js';

/**
 * Get list of all available templates
 * GET /api/templates
 */
export async function listTemplates(req, res) {
  try {
    const templates = templateService.getAvailableTemplates();
    const templateList = templates.map((name) => {
      const docs = templateService.getTemplateDocumentation(name);
      return {
        name,
        description: docs?.description || 'No description available',
        hasDocumentation: !!docs,
      };
    });

    res.json({
      success: true,
      count: templateList.length,
      templates: templateList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list templates',
      message: error.message,
    });
  }
}

/**
 * Get template documentation
 * GET /api/templates/:templateName/docs
 */
export async function getTemplateDocumentation(req, res) {
  try {
    const { templateName } = req.params;
    const docs = templateService.getTemplateDocumentation(templateName);

    if (!docs) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: `No documentation found for template '${templateName}'`,
        availableTemplates: templateService.getAvailableTemplates(),
      });
    }

    res.json({
      success: true,
      template: docs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get template documentation',
      message: error.message,
    });
  }
}

/**
 * Preview a template with sample or custom data
 * GET /api/templates/:templateName/preview
 * POST /api/templates/:templateName/preview (with custom data in body)
 */
export async function previewTemplate(req, res) {
  try {
    const { templateName } = req.params;
    const customData = req.body || {};
    const format = req.query.format || 'html';

    // Check if template exists
    const availableTemplates = templateService.getAvailableTemplates();
    if (!availableTemplates.includes(templateName)) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: `Template '${templateName}' does not exist`,
        availableTemplates,
      });
    }

    const preview = await templateService.previewTemplate(templateName, customData);

    // Return format based on query parameter
    if (format === 'text') {
      res.type('text/plain').send(preview.text);
    } else if (format === 'json') {
      res.json({
        success: true,
        templateName,
        html: preview.html,
        text: preview.text,
        variables: preview.variables,
        exampleData: preview.exampleData,
        providedData: customData,
      });
    } else {
      // Default: return rendered HTML for browser preview
      res.type('text/html').send(preview.html);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to preview template',
      message: error.message,
    });
  }
}

/**
 * Render a template with provided data
 * POST /api/templates/:templateName/render
 */
export async function renderTemplate(req, res) {
  try {
    const { templateName } = req.params;
    const { data = {}, options = {} } = req.body;

    // Check if template exists
    const availableTemplates = templateService.getAvailableTemplates();
    if (!availableTemplates.includes(templateName)) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: `Template '${templateName}' does not exist`,
        availableTemplates,
      });
    }

    // Validate required fields based on template
    const docs = templateService.getTemplateDocumentation(templateName);
    if (docs?.variables?.required) {
      const missingFields = [];
      for (const field of Object.keys(docs.variables.required)) {
        if (!data[field]) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          missingFields,
          requiredFields: docs.variables.required,
        });
      }
    }

    const rendered = await templateService.renderTemplate(templateName, data, options);

    res.json({
      success: true,
      templateName,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to render template',
      message: error.message,
    });
  }
}

/**
 * Clear template cache (development utility)
 * POST /api/templates/cache/clear
 */
export async function clearCache(req, res) {
  try {
    templateService.clearTemplateCache();

    res.json({
      success: true,
      message: 'Template cache cleared successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message,
    });
  }
}

/**
 * Preview all templates (gallery view)
 * GET /api/templates/gallery
 */
export async function templateGallery(req, res) {
  try {
    const templates = templateService.getAvailableTemplates();
    const previews = [];

    for (const templateName of templates) {
      try {
        const preview = await templateService.previewTemplate(templateName);
        const docs = templateService.getTemplateDocumentation(templateName);
        previews.push({
          name: templateName,
          description: docs?.description || '',
          previewUrl: `/api/templates/${templateName}/preview`,
          docsUrl: `/api/templates/${templateName}/docs`,
        });
      } catch {
        previews.push({
          name: templateName,
          error: 'Failed to load preview',
        });
      }
    }

    // Return HTML gallery page
    const galleryHtml = generateGalleryHtml(previews);
    res.type('text/html').send(galleryHtml);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate gallery',
      message: error.message,
    });
  }
}

/**
 * Generate HTML for template gallery
 */
function generateGalleryHtml(templates) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template Gallery - Uzima Health</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f4f4f5;
      color: #333;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 { font-size: 2rem; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 30px; }
    .card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    }
    .card-preview {
      height: 250px;
      border-bottom: 1px solid #e5e7eb;
      overflow: hidden;
    }
    .card-preview iframe {
      width: 100%;
      height: 400px;
      border: none;
      transform: scale(0.625);
      transform-origin: top left;
      pointer-events: none;
    }
    .card-content { padding: 20px; }
    .card-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; color: #1f2937; }
    .card-description { font-size: 0.9rem; color: #6b7280; margin-bottom: 15px; }
    .card-actions { display: flex; gap: 10px; }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      border-radius: 6px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .api-docs {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-top: 40px;
    }
    .api-docs h2 { margin-bottom: 20px; color: #1f2937; }
    .api-endpoint {
      background: #f9fafb;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      font-family: monospace;
    }
    .api-endpoint .method { color: #10b981; font-weight: 600; }
    .api-endpoint .path { color: #667eea; }
    .api-endpoint .desc { color: #6b7280; font-size: 0.875rem; margin-top: 5px; font-family: sans-serif; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Email Template Gallery</h1>
    <p>Preview and test Uzima Health email templates</p>
  </div>

  <div class="container">
    <div class="grid">
      ${templates
        .map(
          (t) => `
        <div class="card">
          <div class="card-preview">
            ${t.error ? `<div style="padding: 20px; color: #ef4444;">${t.error}</div>` : `<iframe src="${t.previewUrl}" loading="lazy"></iframe>`}
          </div>
          <div class="card-content">
            <h3 class="card-title">${t.name}</h3>
            <p class="card-description">${t.description || 'No description'}</p>
            <div class="card-actions">
              <a href="${t.previewUrl}" target="_blank" class="btn btn-primary">Preview</a>
              <a href="${t.docsUrl}" target="_blank" class="btn btn-secondary">Documentation</a>
              <a href="${t.previewUrl}?format=text" target="_blank" class="btn btn-secondary">Plain Text</a>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="api-docs">
      <h2>API Endpoints</h2>
      <div class="api-endpoint">
        <span class="method">GET</span> <span class="path">/api/templates</span>
        <div class="desc">List all available templates</div>
      </div>
      <div class="api-endpoint">
        <span class="method">GET</span> <span class="path">/api/templates/:name/preview</span>
        <div class="desc">Preview template with sample data (add ?format=json|text for different formats)</div>
      </div>
      <div class="api-endpoint">
        <span class="method">POST</span> <span class="path">/api/templates/:name/preview</span>
        <div class="desc">Preview template with custom data in request body</div>
      </div>
      <div class="api-endpoint">
        <span class="method">GET</span> <span class="path">/api/templates/:name/docs</span>
        <div class="desc">Get template variable documentation</div>
      </div>
      <div class="api-endpoint">
        <span class="method">POST</span> <span class="path">/api/templates/:name/render</span>
        <div class="desc">Render template with { data, options } in request body</div>
      </div>
      <div class="api-endpoint">
        <span class="method">POST</span> <span class="path">/api/templates/cache/clear</span>
        <div class="desc">Clear template cache (development utility)</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export default {
  listTemplates,
  getTemplateDocumentation,
  previewTemplate,
  renderTemplate,
  clearCache,
  templateGallery,
};
