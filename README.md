# US Education Conferences 2026 - Validated Database

Comprehensive database of 59 US education conferences for 2026 with automated validation.

## 📊 Spreadsheets

### 1. US_Education_Conferences_2026_VALIDATED.xlsx
**Complete validated database with 59 conferences**

- **Sheet 1**: All Conferences (59 rows × 25 columns)
- **Sheet 2**: High Priority (20 conferences - Tier 1-2)
- **Sheet 3**: Systems Thinking (2 specialized conferences)
- **Sheet 4**: By Date (chronologically sorted)
- **Sheet 5**: Validation Report (summary metrics)

**Validation Results:**
- ✅ 50 live websites verified (85%)
- ✅ 35 dates confirmed with visual proof
- ✅ Full-page screenshots for all 59 conferences
- ✅ HTTP status codes verified

### 2. Conferences_Requiring_Manual_Follow_Up.xlsx
**19 conferences requiring manual review**

- **Sheet 1**: DNS-HTTP Errors (8 conferences with website access issues)
- **Sheet 2**: Dates TBD (11 conferences with unannounced 2026 dates)
- **Sheet 3**: All Follow-Ups (combined view with action items)

## 🔍 Validation Methodology

**Automated Tools:**
- Playwright headless browser automation
- Full-page screenshot capture (59 PNG files)
- HTTP status code verification
- Date/deadline regex extraction
- Claude Vision AI analysis for top conferences

**Data Sources:**
- Official conference websites
- Conference organization pages
- Educational association announcements
- Multi-source cross-validation

## 📁 Files

- `US_Education_Conferences_2026_VALIDATED.xlsx` - Main validated database
- `Conferences_Requiring_Manual_Follow_Up.xlsx` - Manual review tracking
- `conference_data.json` - Structured source data
- `validate_conferences.js` - Reusable validation script

## 🎯 Key Conferences Confirmed

**FETC 2026** - January 11-14, 2026 (Orlando, FL)
**ISTE+ASCD 2026** - June 28-July 1, 2026 (Orlando, FL)
**SXSW EDU** - March 9-15, 2026 (Austin, TX)
**NCTM 2026** - February 11-13 (Indianapolis) & March 16-18 (New Orleans)

## 🔄 Re-running Validation

```bash
node validate_conferences.js
```

This will re-validate all websites, capture new screenshots, and generate updated Excel files.

## 📧 Contact

For questions about this database or validation methodology:
**Alexandria's Design** - Educational Technology Solutions
