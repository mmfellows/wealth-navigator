const { execSync } = require('child_process');
const path = require('path');

/**
 * Parse a Chase credit card PDF statement into structured transactions.
 */
function parseCreditCardStatement(text, filename) {
  const transactions = [];

  // Extract account number (last 4 digits)
  const accountMatch = text.match(/Account Number:\s*XXXX\s*XXXX\s*XXXX\s*(\d{4})/);
  const accountLast4 = accountMatch ? accountMatch[1] : filename.match(/(\d{4})-?\.pdf/)?.[1] || 'unknown';
  const account = `Chase Sapphire ${accountLast4}`;

  // Extract statement date range for year inference
  const dateRangeMatch = text.match(/Opening\/Closing Date\s+(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/);
  let stmtStartYear = null;
  let stmtEndYear = null;
  if (dateRangeMatch) {
    stmtStartYear = 2000 + parseInt(dateRangeMatch[3]);
    stmtEndYear = 2000 + parseInt(dateRangeMatch[6]);
  } else {
    // Try to get year from filename like 20260223-statements-4499-.pdf
    const fnMatch = filename.match(/^(\d{4})/);
    if (fnMatch) {
      stmtEndYear = parseInt(fnMatch[1]);
      stmtStartYear = stmtEndYear;
    } else {
      stmtEndYear = new Date().getFullYear();
      stmtStartYear = stmtEndYear;
    }
  }

  // Find ACCOUNT ACTIVITY section(s)
  const activityBlocks = text.split(/ACCOUNT ACTIVITY/);

  let isPaymentSection = false;

  for (let blockIdx = 1; blockIdx < activityBlocks.length; blockIdx++) {
    const block = activityBlocks[blockIdx];
    const lines = block.split('\n');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      // Detect section headers
      if (line.match(/PAYMENTS AND OTHER CREDITS/i)) {
        isPaymentSection = true;
        i++;
        continue;
      }
      if (line.match(/^PURCHASE/i)) {
        isPaymentSection = false;
        i++;
        continue;
      }

      // Stop at page breaks, fee sections, totals
      if (line.match(/^\d{4} Totals Year-to-Date/) ||
          line.match(/^FEES CHARGED/) ||
          line.match(/^INTEREST CHARGED/) ||
          line.match(/^INTEREST CHARGE CALCULATION/)) {
        break;
      }

      // Match transaction lines: MM/DD followed by merchant and amount
      const txMatch = line.match(/^(\d{2})\/(\d{2})\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})$/);
      if (txMatch) {
        const month = parseInt(txMatch[1]);
        const day = parseInt(txMatch[2]);
        let merchant = txMatch[3].trim();
        const amountStr = txMatch[4].replace(/,/g, '');
        const rawAmount = parseFloat(amountStr);

        // Determine the year based on the statement period
        let year = stmtEndYear;
        // If the transaction month is greater than the statement end month,
        // it's from the previous year
        const stmtEndMonth = dateRangeMatch ? parseInt(dateRangeMatch[4]) : 12;
        if (month > stmtEndMonth) {
          year = stmtStartYear ? stmtStartYear : stmtEndYear - 1;
          // If start and end years differ, use start year
          if (stmtStartYear && stmtStartYear < stmtEndYear) {
            year = stmtStartYear;
          }
        }

        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Skip exchange rate lines that follow international transactions
        // Check if next lines are exchange rate info and skip them
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          if (nextLine.match(/^\d{2}\/\d{2}\s+NEW ZEALAND|EXCHG RATE|^\d[\d,.]+\s+X\s+[\d.]+/i) ||
              nextLine.match(/^\d{6}\s+\d+\s+X\s+/)) {
            j++;
          } else {
            break;
          }
        }

        // Skip payments/credits (negative amounts) - they're not expenses
        if (isPaymentSection || rawAmount < 0) {
          i = j;
          continue;
        }

        transactions.push({
          date,
          merchant: cleanMerchant(merchant),
          amount: Math.abs(rawAmount),
          statement: merchant, // Keep original statement text
          account,
          is_transfer: isPaymentOrTransfer(merchant),
          imported_from: `chase_pdf_${accountLast4}`,
        });

        i = j;
        continue;
      }

      i++;
    }
  }

  return transactions;
}

/**
 * Parse a Chase checking account PDF statement into structured transactions.
 */
function parseCheckingStatement(text, filename) {
  const transactions = [];

  // Extract account number (last 4 digits)
  const accountMatch = text.match(/Account Number:\s*0*(\d+)/);
  const fullAccount = accountMatch ? accountMatch[1] : '';
  const accountLast4 = fullAccount.slice(-4) || filename.match(/-(\d{4})-/)?.[1] || 'unknown';
  const account = `Chase Checking ${accountLast4}`;

  // Extract date range from header
  const dateRangeMatch = text.match(/(\w+ \d+, \d{4}) through (\w+ \d+, \d{4})/);
  let stmtEndYear = new Date().getFullYear();
  if (dateRangeMatch) {
    stmtEndYear = new Date(dateRangeMatch[2]).getFullYear();
  } else {
    const fnMatch = filename.match(/^(\d{4})/);
    if (fnMatch) stmtEndYear = parseInt(fnMatch[1]);
  }

  // Find TRANSACTION DETAIL section
  const detailMatch = text.split(/TRANSACTION DETAIL/);

  for (let blockIdx = 1; blockIdx < detailMatch.length; blockIdx++) {
    const block = detailMatch[blockIdx];
    const lines = block.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Stop at end markers
      if (line.match(/Ending Balance|end\*transaction/i)) break;
      if (line.match(/Beginning Balance/i)) continue;

      // Match checking transaction lines: DATE then DESCRIPTION then AMOUNT then BALANCE
      // Format: MM/DD    Description    -1,234.56    12,345.67
      const txMatch = line.match(/^\s*(\d{2})\/(\d{2})\s{2,}(.+?)\s{2,}(-?[\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s*$/);
      if (txMatch) {
        const month = parseInt(txMatch[1]);
        const day = parseInt(txMatch[2]);
        let description = txMatch[3].trim();
        const amountStr = txMatch[4].replace(/,/g, '');
        const rawAmount = parseFloat(amountStr);

        // Determine year
        let year = stmtEndYear;
        if (dateRangeMatch) {
          const startDate = new Date(dateRangeMatch[1]);
          const endDate = new Date(dateRangeMatch[2]);
          const startMonth = startDate.getMonth() + 1;
          const endMonth = endDate.getMonth() + 1;
          // If transaction month is after the end month, it belongs to prior year
          if (month > endMonth) {
            year = startDate.getFullYear();
          }
          // If statement spans a year boundary (e.g. Dec-Jan), and tx month is
          // in the start year's range
          if (startDate.getFullYear() < stmtEndYear && month >= startMonth) {
            year = startDate.getFullYear();
          }
        }

        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Check for continuation lines (description that wraps)
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          // If the next line doesn't start with a date or known marker, it's a continuation
          if (nextLine && !nextLine.match(/^\d{2}\/\d{2}\s/) &&
              !nextLine.match(/Ending Balance|end\*|start\*/i) &&
              !nextLine.match(/^$/) &&
              !nextLine.match(/^\s*Page \d/)) {
            description += ' ' + nextLine;
            j++;
          } else {
            break;
          }
        }

        // Skip deposits (positive amounts) - only track spending
        if (rawAmount > 0) {
          i = j - 1;
          continue;
        }

        transactions.push({
          date,
          merchant: cleanMerchant(description),
          amount: Math.abs(rawAmount),
          statement: description.trim(),
          account,
          is_transfer: isPaymentOrTransfer(description),
          imported_from: `chase_pdf_${accountLast4}`,
        });

        i = j - 1;
        continue;
      }
    }
  }

  return transactions;
}

/**
 * Parse a Chase ATM receipt PDF.
 */
function parseAtmReceipt(text, filename) {
  const transactions = [];

  // Extract date
  const dateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  if (!dateMatch) return transactions;

  const month = dateMatch[1];
  const day = dateMatch[2];
  const year = `20${dateMatch[3]}`;
  const date = `${year}-${month}-${day}`;

  // Extract card number
  const cardMatch = text.match(/Card#_\s*(\d+)/);
  const cardLast4 = cardMatch ? cardMatch[1] : 'unknown';

  // Extract account
  const acctMatch = text.match(/(?:Chk|Sav) Acct_(\d+)/);
  const acctLast4 = acctMatch ? acctMatch[1] : 'unknown';
  const account = `Chase Checking ${acctLast4}`;

  // Extract amount
  const amountMatch = text.match(/Withdraw.*?\$([\d,]+\.\d{2})/);
  if (amountMatch) {
    transactions.push({
      date,
      merchant: 'ATM Withdrawal',
      amount: parseFloat(amountMatch[1].replace(/,/g, '')),
      statement: `ATM Withdrawal Card ${cardLast4}`,
      account,
      is_transfer: false,
      imported_from: `chase_pdf_atm_${cardLast4}`,
    });
  }

  return transactions;
}

/**
 * Clean up merchant names for readability.
 */
function cleanMerchant(raw) {
  let merchant = raw
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove common prefixes
  merchant = merchant
    .replace(/^TST\*\s*/i, '')
    .replace(/^SQ \*/i, '')
    .replace(/^PP\*/i, '')
    .replace(/^SMZ\*/i, '')
    .replace(/^NYX\*/i, '')
    .replace(/^FH\*\s*/i, '')
    .replace(/^SP\s+/i, '')
    .replace(/^OLO\*/i, '')
    .replace(/^GOOGLE \*/i, 'Google ')
    .replace(/^APPLE\.COM\/BILL.*$/i, 'Apple')
    .replace(/^Amazon\.com\*\w+.*$/i, 'Amazon')
    .replace(/^AMAZON MKTPL\*\w+.*$/i, 'Amazon')
    .replace(/^Prime Video \*\w+.*$/i, 'Prime Video')
    .replace(/^Audible\*\w+.*$/i, 'Audible')
    .replace(/^PAYPAL \*(\w+)/i, (_, name) => name)
    .replace(/^LYFT \*RIDE\s+\w+\s+\w+\s*/i, 'Lyft ')
    .replace(/LYFT\.COM\s+\w{2}$/i, '')
    .replace(/\s+\d{3}-\d{3}-\d{4}.*$/i, '') // Remove phone numbers
    .replace(/\s+\d{3}-\d{4}.*$/i, '')
    .replace(/\s+\w{2}$/, '') // Remove trailing state abbreviation
    .replace(/\s+Amzn\.com\/bill.*$/i, '')
    .replace(/\s+g\.co\/helppay#.*$/i, '')
    .replace(/\s+888-802-3080.*$/i, '')
    .replace(/\s+866-712-7753.*$/i, '')
    .replace(/\s+WWW\.\w+\.\w+.*$/i, '')
    .trim();

  return merchant;
}

/**
 * Detect if a transaction is a transfer/payment (not a real expense).
 */
function isPaymentOrTransfer(description) {
  const transferPatterns = [
    /AUTOMATIC PAYMENT/i,
    /AUTOPAY/i,
    /Online.*Transfer/i,
    /Online.*Payment/i,
    /ACH\s*(Trnsfr|Transf)/i,
    /Realtime Transfer/i,
    /Realtime Payment/i,
    /Zelle Payment/i,
    /Venmo\s+Payment/i,
    /Credit Crd Autopay/i,
    /Chase Credit Crd/i,
    /Interactive\s*Brok/i,
  ];
  return transferPatterns.some(p => p.test(description));
}

/**
 * Detect the type of Chase PDF and parse accordingly.
 */
function detectAndParse(text, filename) {
  const lowerFilename = filename.toLowerCase();
  const lowerText = text.toLowerCase();

  if (lowerFilename.includes('atmreceipt') || lowerText.includes('withdraw from chk acct')) {
    return { type: 'atm_receipt', transactions: parseAtmReceipt(text, filename) };
  }

  if (lowerText.includes('account activity') && lowerText.includes('credit access line')) {
    return { type: 'credit_card', transactions: parseCreditCardStatement(text, filename) };
  }

  if (lowerText.includes('transaction detail') && lowerText.includes('checking summary')) {
    return { type: 'checking', transactions: parseCheckingStatement(text, filename) };
  }

  // Fallback: try credit card first, then checking
  const ccTx = parseCreditCardStatement(text, filename);
  if (ccTx.length > 0) return { type: 'credit_card', transactions: ccTx };

  const chkTx = parseCheckingStatement(text, filename);
  if (chkTx.length > 0) return { type: 'checking', transactions: chkTx };

  return { type: 'unknown', transactions: [] };
}

/**
 * Extract text from a PDF file using pdftotext.
 */
function extractPdfText(filePath) {
  try {
    const output = execSync(`pdftotext -layout "${filePath}" -`, {
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
    });
    return output;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

module.exports = {
  detectAndParse,
  extractPdfText,
  parseCreditCardStatement,
  parseCheckingStatement,
  parseAtmReceipt,
};
