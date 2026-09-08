const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Converts a 0-999 integer to words (used as a building block by the Indian-numbering converter below). */
function threeDigitsToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + threeDigitsToWords(n % 100) : ''}`;
}

/**
 * Converts a non-negative integer to words using the Indian numbering system
 * (Lakh/Crore rather than Million/Billion) — e.g. 304961 -> "Three Lakh Four
 * Thousand Nine Hundred Sixty One".
 */
function integerToIndianWords(value: number): string {
  if (value === 0) return 'Zero';
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const rest = value % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitsToWords(rest));
  return parts.join(' ');
}

/**
 * Renders a rupee amount as the words a GST tax invoice prints under
 * "Amount Chargeable (in words)" — e.g. 304961.5 -> "Rupees Three Lakh Four
 * Thousand Nine Hundred Sixty One and Fifty Paise Only".
 */
export function amountToIndianWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = integerToIndianWords(rupees);
  const paiseWords = paise ? ` and ${integerToIndianWords(paise)} Paise` : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
