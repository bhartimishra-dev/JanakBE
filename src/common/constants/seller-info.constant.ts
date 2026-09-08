/**
 * The seller's own registration details for the GST tax invoice — this is a
 * single registered entity, so unlike buyer details these are fixed constants
 * rather than something read from the database.
 */
export const SELLER_INFO = {
  name: 'Janak Positioning & Surveying Systems Pvt Ltd.',
  addressLine1: 'B-28, Sector -4, Noida, Uttar Pradesh -201301',
  addressLine2: 'H.O 304B, Pal Mohan Plaza 11/56 D.B Gupta Road, Karol Bagh, New Delhi-110005',
  gstin: '09AABCJ0148A1Z5',
  stateName: 'Uttar Pradesh',
  /** First 2 digits of the GSTIN — used to decide CGST+SGST vs IGST against the buyer's state. */
  stateCode: '09',
  cin: 'U32019DL2001PTC112019',
  contacts: ['9811008317', '9711008317', '9811537441'],
  emails: ['janak.ji@yahoo.com', 'renu1jpss@yahoo.com'],
  msmeRegNo: 'UDHYAM-DL-01-0003519/UP28B0000363',
  /**
   * A GSTIN's characters 3-12 (0-indexed 2..11) are always the PAN it was
   * issued against — derived here rather than duplicated as a separate
   * constant so it can never drift out of sync with `gstin` above.
   */
  get pan(): string {
    return this.gstin.slice(2, 12);
  },
} as const;
