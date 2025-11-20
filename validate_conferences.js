const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Configuration
const SCREENSHOT_DIR = path.join(__dirname, '..', 'docs', 'conference-validation-screenshots');
const OUTPUT_EXCEL = path.join(__dirname, '..', 'US_Education_Conferences_2026_VALIDATED.xlsx');
const CONFERENCE_DATA_PATH = path.join(__dirname, 'conference_data.json');

// Create screenshot directory
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Validation results storage
const validationResults = [];
const validationReport = {
  totalConferences: 0,
  websitesVerified: 0,
  websitesFailed: 0,
  datesConfirmed: 0,
  datesTBD: 0,
  cfpFound: 0,
  errors: []
};

// Helper function to create safe filename
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Helper function to wait with delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main validation function
async function validateConference(browser, conference, index) {
  const result = {
    ...conference,
    website_status: 'Not Checked',
    website_status_code: null,
    dates_verified: 'No',
    dates_found: null,
    cfp_link: null,
    cfp_status_verified: 'No',
    screenshot_homepage: null,
    screenshot_dates: null,
    screenshot_cfp: null,
    validation_date: new Date().toISOString().split('T')[0],
    validation_notes: [],
    needs_manual_review: false
  };

  console.log(`\n[${index + 1}] Validating: ${conference.name}`);
  console.log(`    Website: ${conference.website}`);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate to website
    console.log(`    Navigating to website...`);
    const response = await page.goto(conference.website, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    if (response) {
      result.website_status_code = response.status();
      if (response.status() >= 200 && response.status() < 400) {
        result.website_status = 'Live';
        validationReport.websitesVerified++;
        console.log(`    ✓ Website is live (${response.status()})`);
      } else {
        result.website_status = `Error ${response.status()}`;
        result.validation_notes.push(`HTTP ${response.status()}`);
        validationReport.websitesFailed++;
        result.needs_manual_review = true;
        console.log(`    ✗ Website returned ${response.status()}`);
      }
    }

    // Step 2: Take homepage screenshot
    await delay(2000); // Wait for page to fully load
    const screenshotFilename = `${sanitizeFilename(conference.name)}_homepage.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot_homepage = screenshotPath;
    console.log(`    ✓ Screenshot saved`);

    // Step 3: Search for 2026 dates on the page
    const pageContent = await page.content();
    const pageText = await page.innerText('body');

    const datePatterns = [
      /2026/gi,
      /january\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /february\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /march\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /april\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /may\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /june\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /july\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /august\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /september\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /october\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /november\s+\d+[-,]\s*\d+,?\s*2026/gi,
      /december\s+\d+[-,]\s*\d+,?\s*2026/gi
    ];

    let datesFound = [];
    for (const pattern of datePatterns) {
      const matches = pageText.match(pattern);
      if (matches) {
        datesFound = datesFound.concat(matches);
      }
    }

    if (datesFound.length > 0) {
      result.dates_found = [...new Set(datesFound)].join('; ');
      result.dates_verified = 'Yes';
      validationReport.datesConfirmed++;
      console.log(`    ✓ Found dates: ${result.dates_found.substring(0, 60)}...`);
    } else {
      result.dates_verified = 'Not Found';
      validationReport.datesTBD++;
      result.validation_notes.push('No 2026 dates found on homepage');
      console.log(`    ⚠ No 2026 dates found on homepage`);
    }

    // Step 4: Search for CFP/Proposal links
    const cfpKeywords = [
      'call for proposals',
      'cfp',
      'submit proposal',
      'presenter application',
      'speaker application',
      'proposal submission',
      'present at'
    ];

    const links = await page.$$('a[href]');
    let cfpLink = null;

    for (const link of links.slice(0, 100)) { // Check first 100 links
      const text = (await link.innerText()).toLowerCase();
      const href = await link.getAttribute('href');

      if (cfpKeywords.some(keyword => text.includes(keyword))) {
        cfpLink = href;
        break;
      }
    }

    if (cfpLink) {
      result.cfp_link = cfpLink.startsWith('http') ? cfpLink : new URL(cfpLink, conference.website).href;
      result.cfp_status_verified = 'Link Found';
      validationReport.cfpFound++;
      console.log(`    ✓ CFP link found: ${result.cfp_link.substring(0, 50)}...`);
    } else {
      result.cfp_status_verified = 'Not Found';
      result.validation_notes.push('No CFP link found on homepage');
      console.log(`    ⚠ No CFP link found`);
    }

    // Step 5: Look for future conferences or 2026 specific pages
    const futureLinks = await page.$$eval('a[href]', links => {
      return links
        .filter(a => {
          const text = a.innerText.toLowerCase();
          const href = a.href.toLowerCase();
          return text.includes('2026') || href.includes('2026') ||
                 text.includes('future') || text.includes('upcoming');
        })
        .map(a => ({ text: a.innerText, href: a.href }))
        .slice(0, 5);
    });

    if (futureLinks.length > 0) {
      console.log(`    ℹ Found ${futureLinks.length} links to future/2026 pages`);
      result.validation_notes.push(`Found ${futureLinks.length} future conference links`);
    }

  } catch (error) {
    console.log(`    ✗ Error: ${error.message}`);
    result.website_status = 'Error';
    result.validation_notes.push(`Error: ${error.message}`);
    result.needs_manual_review = true;
    validationReport.websitesFailed++;
    validationReport.errors.push({
      conference: conference.name,
      error: error.message
    });
  } finally {
    await context.close();
  }

  return result;
}

// Create Excel workbook with comprehensive data
async function createExcelFile(results) {
  console.log('\n\n=== Creating Excel File ===\n');

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: All Conferences
  const allSheet = workbook.addWorksheet('All Conferences');

  // Define columns
  allSheet.columns = [
    { header: 'Conference Name', key: 'name', width: 35 },
    { header: 'Organization', key: 'organization', width: 30 },
    { header: '2026 Dates', key: 'dates', width: 20 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Format', key: 'format', width: 12 },
    { header: 'Estimated Attendance', key: 'estimated_attendance', width: 18 },
    { header: 'Website URL', key: 'website', width: 40 },
    { header: 'Website Status', key: 'website_status', width: 15 },
    { header: 'Website HTTP Code', key: 'website_status_code', width: 18 },
    { header: 'Dates Verified', key: 'dates_verified', width: 15 },
    { header: 'Dates Found on Site', key: 'dates_found', width: 40 },
    { header: 'Proposal Deadline', key: 'proposal_deadline', width: 20 },
    { header: 'Proposal Status', key: 'proposal_status', width: 15 },
    { header: 'CFP Link', key: 'cfp_link', width: 40 },
    { header: 'CFP Verified', key: 'cfp_status_verified', width: 15 },
    { header: 'Target Audience', key: 'target_audience', width: 35 },
    { header: 'Subject Focus', key: 'subject_focus', width: 35 },
    { header: 'ModelIt Relevance (1-5)', key: 'modelit_relevance', width: 22 },
    { header: 'Priority Tier', key: 'priority_tier', width: 12 },
    { header: 'Quarter', key: 'quarter', width: 10 },
    { header: 'Region', key: 'region', width: 12 },
    { header: 'Screenshot Homepage', key: 'screenshot_homepage', width: 50 },
    { header: 'Validation Date', key: 'validation_date', width: 15 },
    { header: 'Validation Notes', key: 'validation_notes', width: 50 },
    { header: 'Needs Manual Review', key: 'needs_manual_review', width: 20 }
  ];

  // Style header row
  const headerRow = allSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 20;

  // Add data rows
  results.forEach(result => {
    const row = allSheet.addRow({
      ...result,
      validation_notes: result.validation_notes.join('; ')
    });

    // Conditional formatting for website status
    const statusCell = row.getCell('website_status');
    if (result.website_status === 'Live') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' } // Light green
      };
    } else if (result.website_status.includes('Error')) {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCCCC' } // Light red
      };
    }

    // Highlight if needs manual review
    if (result.needs_manual_review) {
      row.getCell('needs_manual_review').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFD700' } // Gold
      };
    }

    // Color code by ModelIt relevance
    const relevanceCell = row.getCell('modelit_relevance');
    if (result.modelit_relevance === 5) {
      relevanceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' } // Green
      };
    } else if (result.modelit_relevance >= 3) {
      relevanceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' } // Yellow
      };
    }
  });

  // Add autofilter
  allSheet.autoFilter = {
    from: 'A1',
    to: 'Y1'
  };

  // Freeze first row
  allSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet 2: High Priority (Tier 1 & 2)
  const highPrioritySheet = workbook.addWorksheet('High Priority');
  highPrioritySheet.columns = allSheet.columns;

  const highPriorityHeader = highPrioritySheet.getRow(1);
  highPriorityHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  highPriorityHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF6600' }
  };
  highPriorityHeader.height = 20;

  results
    .filter(r => r.priority_tier <= 2)
    .forEach(result => {
      highPrioritySheet.addRow({
        ...result,
        validation_notes: result.validation_notes.join('; ')
      });
    });

  highPrioritySheet.autoFilter = { from: 'A1', to: 'Y1' };
  highPrioritySheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet 3: Systems Thinking Focus
  const systemsSheet = workbook.addWorksheet('Systems Thinking');
  systemsSheet.columns = allSheet.columns;

  const systemsHeader = systemsSheet.getRow(1);
  systemsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  systemsHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF9933CC' }
  };
  systemsHeader.height = 20;

  results
    .filter(r => r.subject_focus && r.subject_focus.toLowerCase().includes('system'))
    .forEach(result => {
      systemsSheet.addRow({
        ...result,
        validation_notes: result.validation_notes.join('; ')
      });
    });

  systemsSheet.autoFilter = { from: 'A1', to: 'Y1' };
  systemsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet 4: By Date (Sorted)
  const byDateSheet = workbook.addWorksheet('By Date');
  byDateSheet.columns = allSheet.columns;

  const byDateHeader = byDateSheet.getRow(1);
  byDateHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  byDateHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF006633' }
  };
  byDateHeader.height = 20;

  const sortedByDate = [...results].sort((a, b) => {
    // Simple sort by quarter
    const quarterOrder = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4, 'TBD': 5 };
    return (quarterOrder[a.quarter] || 999) - (quarterOrder[b.quarter] || 999);
  });

  sortedByDate.forEach(result => {
    byDateSheet.addRow({
      ...result,
      validation_notes: result.validation_notes.join('; ')
    });
  });

  byDateSheet.autoFilter = { from: 'A1', to: 'Y1' };
  byDateSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet 5: Validation Report
  const reportSheet = workbook.addWorksheet('Validation Report');
  reportSheet.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value', key: 'value', width: 20 }
  ];

  const reportHeader = reportSheet.getRow(1);
  reportHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  reportHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF333333' }
  };
  reportHeader.height = 20;

  reportSheet.addRow({ metric: 'Total Conferences', value: validationReport.totalConferences });
  reportSheet.addRow({ metric: 'Websites Verified Live', value: validationReport.websitesVerified });
  reportSheet.addRow({ metric: 'Websites Failed/Error', value: validationReport.websitesFailed });
  reportSheet.addRow({ metric: '2026 Dates Confirmed', value: validationReport.datesConfirmed });
  reportSheet.addRow({ metric: '2026 Dates TBD/Not Found', value: validationReport.datesTBD });
  reportSheet.addRow({ metric: 'CFP Links Found', value: validationReport.cfpFound });
  reportSheet.addRow({ metric: 'Validation Date', value: new Date().toISOString().split('T')[0] });

  reportSheet.addRow({});
  reportSheet.addRow({ metric: 'Success Rate', value: `${Math.round(validationReport.websitesVerified / validationReport.totalConferences * 100)}%` });

  // Save workbook
  await workbook.xlsx.writeFile(OUTPUT_EXCEL);
  console.log(`\n✓ Excel file created: ${OUTPUT_EXCEL}`);
}

// Main execution
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   US EDUCATION CONFERENCES 2026 - AUTOMATED VALIDATION    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Load conference data
  console.log('Loading conference data...');
  const rawData = fs.readFileSync(CONFERENCE_DATA_PATH, 'utf8');
  const data = JSON.parse(rawData);
  const conferences = data.conferences;

  validationReport.totalConferences = conferences.length;
  console.log(`✓ Loaded ${conferences.length} conferences\n`);

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    timeout: 60000
  });
  console.log('✓ Browser launched\n');

  console.log('='.repeat(60));
  console.log('STARTING VALIDATION');
  console.log('='.repeat(60));

  // Validate each conference
  for (let i = 0; i < conferences.length; i++) {
    const result = await validateConference(browser, conferences[i], i);
    validationResults.push(result);

    // Add delay between requests to be respectful
    if (i < conferences.length - 1) {
      await delay(2000);
    }
  }

  // Close browser
  await browser.close();
  console.log('\n✓ Browser closed');

  // Create Excel file
  await createExcelFile(validationResults);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nTotal Conferences: ${validationReport.totalConferences}`);
  console.log(`Websites Verified: ${validationReport.websitesVerified}`);
  console.log(`Websites Failed: ${validationReport.websitesFailed}`);
  console.log(`Dates Confirmed: ${validationReport.datesConfirmed}`);
  console.log(`Dates TBD: ${validationReport.datesTBD}`);
  console.log(`CFP Links Found: ${validationReport.cfpFound}`);
  console.log(`Success Rate: ${Math.round(validationReport.websitesVerified / validationReport.totalConferences * 100)}%`);

  console.log(`\n✓ Excel File: ${OUTPUT_EXCEL}`);
  console.log(`✓ Screenshots: ${SCREENSHOT_DIR}`);

  if (validationReport.errors.length > 0) {
    console.log(`\n⚠ Errors encountered: ${validationReport.errors.length}`);
    console.log('  Check "Validation Report" tab in Excel for details');
  }

  console.log('\n🎉 Validation complete! Your conference database is ready.\n');
}

// Run main function
main().catch(console.error);
