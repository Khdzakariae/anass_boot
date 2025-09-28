#!/usr/bin/env node

/**
 * Quick test script for phone and email extraction fixes
 */

import { TextProcessor } from './utils.js';

// Test email extraction with the provided example
const testEmailContent = `
So bewirbst du dich
Du hast dich entschieden, den Weg zu deinem Wunschberuf mit uns zu gehen? Prima, dann bewirb dich direkt online.

Noch Fragen?

Unser Beratungsteam hilft dir gern weiter!

E-Mail: beratung@ludwig-fresenius.de
Telefon: 02 21 / 92 15 12 14

Bewerben
`;

const testContent = `
  Contact us at: 030 12345678
  Mobile: +49 151 23456789  
  Office: +49 (0)30 987654321
  Invalid numbers: 2147483647, 1758998199660, 28846464178
  Email: contact@example.com
  More JS garbage: window.cmp_id=123456789;
  Year: 2024
  Real phone: 0221 555-1234
`;

console.log('🧪 Testing improved extraction...\n');

// Test the specific example from the user
console.log('📧 Testing email extraction from user example:');
const userEmails = TextProcessor.extractEmails(testEmailContent);
console.log('   Found emails:', userEmails);

// Test phone extraction from the same content
const userPhones = TextProcessor.extractPhoneNumbers(testEmailContent);
console.log('📞 Found phones:', userPhones);

console.log('\n📧 Testing general email extraction:');
const emails = TextProcessor.extractEmails(testContent);
console.log('   Found emails:', emails);

console.log('\n📞 Testing phone extraction:');
const phones = TextProcessor.extractPhoneNumbers(testContent);
console.log('   Found phones:', phones);

console.log('\n� Testing text cleaning:');
const cleanedText = TextProcessor.truncateText(testContent, 200);
console.log('   Cleaned text:', cleanedText);

// Test with HTML-like content
const htmlContent = `
<div>
  <p>Contact: info@company.de</p>
  <p>E-Mail: beratung@ludwig-fresenius.de</p>
  <span>Phone: 030 12345678</span>
</div>
`;

console.log('\n🌐 Testing HTML content extraction:');
const htmlEmails = TextProcessor.extractEmails(htmlContent);
const htmlPhones = TextProcessor.extractPhoneNumbers(htmlContent);
console.log('   HTML emails:', htmlEmails);
console.log('   HTML phones:', htmlPhones);

console.log('\n🎉 All extraction tests completed!');