/** Official GST state/UT codes, used to print the buyer's code and to decide CGST+SGST vs IGST. */
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  maharashtra: '27',
  'andhra pradesh': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh (new)': '37',
  ladakh: '38',
};

/** Best-effort GST state code lookup from a free-text state name (case/whitespace-insensitive). */
export function getGstStateCode(stateName: string | undefined | null): string | undefined {
  if (!stateName) return undefined;
  return GST_STATE_CODES[stateName.trim().toLowerCase()];
}

/**
 * Whether two free-text state names refer to the same GST state — used to
 * decide whether an invoice charges CGST+SGST (same state as the seller) or
 * IGST (different state). Falls back to a direct string compare if either
 * name isn't in the lookup table, so an unrecognized/misspelled state name
 * still degrades to "not the same state" (IGST) rather than crashing.
 */
export function isSameGstState(stateNameA: string | undefined | null, stateNameB: string | undefined | null): boolean {
  const codeA = getGstStateCode(stateNameA);
  const codeB = getGstStateCode(stateNameB);
  if (codeA && codeB) return codeA === codeB;
  return (stateNameA ?? '').trim().toLowerCase() === (stateNameB ?? '').trim().toLowerCase();
}
