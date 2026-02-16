
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePdf() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const htmlPath = path.join(__dirname, 'analysis_report.html');
  const pdfPath = path.join(__dirname, 'Backend_Analysis_Report.pdf');
  
  // Read HTML content
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      bottom: '20px',
      left: '20px',
      right: '20px'
    }
  });

  await browser.close();
  console.log(`PDF generated successfully at: ${pdfPath}`);
}

generatePdf().catch(console.error);
