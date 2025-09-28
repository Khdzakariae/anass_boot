# German Apprenticeship Job Scraper

A complete, standalone Node.js script that scrapes apprenticeship job listings from German job portals **azubi.de** and **ausbildung.de**. The scraper extracts detailed job information and only saves positions that include contact email addresses.

## 🌟 Features

- **Multi-site Support**: Scrape from both azubi.de and ausbildung.de
- **Email-based Filtering**: Only saves jobs with contact email addresses
- **Interactive Configuration**: Easy setup with command-line prompts
- **Robust Error Handling**: Continues scraping even if individual pages fail
- **Rate Limiting**: Built-in delays to be respectful to target websites
- **Clean Output**: Results saved in structured JSON format
- **Real-time Progress**: Live logging of scraping progress
- **Resource Optimization**: Blocks unnecessary resources (images, CSS) for faster scraping

## 📋 Requirements

- **Node.js** (version 14 or higher)
- **npm** (Node Package Manager)

## 🚀 Quick Start

### 1. Installation

First, make sure you have Node.js installed. Then install the required dependency:

```bash
npm install puppeteer
```

### 2. Download the Script

Save the `standalone-scraper.js` file to your desired directory.

### 3. Run the Script

```bash
node standalone-scraper.js
```

The script will prompt you for configuration options:

```
🔧 Apprenticeship Scraper Configuration
==========================================

Use default configuration? (y/n) [y]: n
Website (azubi/ausbildung) [ausbildung]: ausbildung
Search term [Pflegefachmann]: Kaufmann
Location [Bremen]: Berlin
Number of pages [3]: 5
Configure advanced settings? (y/n) [n]: n
```

### 4. View Results

After completion, results will be saved to `scraped_jobs.json` and displayed in the console.

## ⚙️ Configuration Options

### Basic Configuration

| Option | Description | Default | Examples |
|--------|-------------|---------|----------|
| `SEARCH_TERM` | Job title to search for | `'Pflegefachmann'` | `'Kaufmann'`, `'Mechatroniker'`, `'Koch'` |
| `LOCATION` | City/region to search in | `'Bremen'` | `'Berlin'`, `'München'`, `'Hamburg'` |
| `NUM_PAGES_TO_SCRAPE` | Number of result pages | `3` | `1`, `5`, `10` |
| `WEBSITE` | Target website | `'ausbildung'` | `'azubi'`, `'ausbildung'` |

### Advanced Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `DELAY_BETWEEN_REQUESTS` | Delay between job page requests (ms) | `2000` |
| `DELAY_BETWEEN_PAGES` | Delay between search pages (ms) | `3000` |
| `REQUEST_TIMEOUT` | Page load timeout (ms) | `30000` |
| `HEADLESS` | Run browser in background | `true` |
| `OUTPUT_FILE` | Name of result file | `'scraped_jobs.json'` |

## 📊 Output Format

The script generates a JSON file with the following structure:

```json
[
  {
    "title": "Ausbildung zum Pflegefachmann (m/w/d)",
    "institution": "Klinikum Bremen",
    "location": "28359 Bremen",
    "startDate": "01.09.2024",
    "emails": ["bewerbung@klinikum-bremen.de", "hr@klinikum-bremen.de"],
    "url": "https://www.ausbildung.de/stellen/ausbildung-zum-pflegefachmann/",
    "scrapedAt": "2024-03-15T10:30:45.123Z",
    "source": "ausbildung"
  }
]
```

### Field Descriptions

- **title**: Job position title
- **institution**: Company/organization name
- **location**: Job location (city, postal code)
- **startDate**: Training start date
- **emails**: Array of contact email addresses found on the page
- **url**: Direct link to the job posting
- **scrapedAt**: Timestamp when the job was scraped
- **source**: Website source (`azubi` or `ausbildung`)

## 🎯 Website-Specific Features

### ausbildung.de
- Advanced selector fallbacks for reliable data extraction
- Regex pattern matching for start dates
- Company name extraction from URLs as fallback
- Support for multiple email formats

### azubi.de
- Optimized for azubi.de's specific HTML structure
- Direct selector mapping for consistent results
- Structured data extraction using semantic selectors

## 💡 Usage Examples

### Example 1: Healthcare Jobs in Berlin
```bash
node standalone-scraper.js
# Select: ausbildung, Pflegefachmann, Berlin, 5 pages
```

### Example 2: IT Jobs in Munich
```bash
node standalone-scraper.js
# Select: azubi, Fachinformatiker, München, 3 pages
```

### Example 3: Retail Jobs in Hamburg
```bash
node standalone-scraper.js
# Select: ausbildung, Einzelhandelskaufmann, Hamburg, 2 pages
```

## 📈 Performance Tips

1. **Start Small**: Begin with 1-2 pages to test your search terms
2. **Optimize Search Terms**: Use specific German job titles for better results
3. **Respect Rate Limits**: Keep default delays or increase them for stability
4. **Monitor Output**: Check the console for real-time progress and errors

## 🛠️ Troubleshooting

### Common Issues

**No jobs found:**
- Verify your search term is in German
- Check if the location exists on the target website
- Try reducing the number of pages

**Timeout errors:**
- Increase `REQUEST_TIMEOUT` in configuration
- Check your internet connection
- Some pages may be temporarily unavailable

**Browser launch failures:**
- Install/update Puppeteer: `npm install puppeteer --force`
- On Linux: Install missing dependencies for Chromium
- Try running with `HEADLESS: false` to see browser window

**Permission errors:**
- Ensure write permissions in the script directory
- Try running with different output file names

### Debug Mode

To see more detailed logging, modify the script temporarily:

```javascript
// Change this line in the configuration
HEADLESS: false,  // Shows browser window
```

## 🔒 Ethical Usage

This scraper is designed for:
- ✅ Personal job searching
- ✅ Research purposes
- ✅ Educational use
- ✅ Small-scale data collection

Please be respectful:
- Don't overload servers with excessive requests
- Respect robots.txt files
- Use scraped data responsibly
- Consider the website's terms of service

## 📝 License

This script is provided for educational and personal use. Please respect the terms of service of the websites you're scraping.

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section
2. Verify your Node.js and npm versions
3. Ensure stable internet connection
4. Review console error messages for specific issues

## 🎮 Advanced Usage

For developers who want to integrate this into larger applications, the script exports the main classes:

```javascript
import { ApprenticeshipScraper, CONFIG, SITE_CONFIGS } from './standalone-scraper.js';

// Create custom scraper instance
const scraper = new ApprenticeshipScraper({
  SEARCH_TERM: 'Kaufmann',
  LOCATION: 'Berlin',
  WEBSITE: 'ausbildung',
  NUM_PAGES_TO_SCRAPE: 2
});

const results = await scraper.startScraping();
```

## 🔄 Updates

The script is designed to be maintainable:
- Website selectors are centralized in `SITE_CONFIGS`
- Easy to add new websites by extending the configuration
- Modular design allows for easy customization