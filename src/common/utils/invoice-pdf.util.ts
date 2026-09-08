import PDFDocument = require('pdfkit');
import { SELLER_INFO } from '../constants/seller-info.constant';
import { CompanyProfile } from '../../modules/company-profile/entities/company-profile.entity';
import { Order } from '../../modules/orders/entities/order.entity';
import { amountToIndianWords } from './number-to-words.util';
import { getGstStateCode, isSameGstState } from './gst-state.util';

/** en-IN digit grouping (e.g. 3,04,961.00) for money amounts on the tax invoice. */
function inr(amount: number): string {
  return Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface InvoiceTableRow {
  cells: string[];
  height: number;
  bold?: boolean;
  aligns?: ('left' | 'center' | 'right')[];
}

/** Draws a bordered grid table cell-by-cell starting at (x, y); returns the y just below it. */
function renderInvoiceTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidths: number[],
  rows: InvoiceTableRow[],
): number {
  let curY = y;
  for (const row of rows) {
    let curX = x;
    for (let i = 0; i < row.cells.length; i++) {
      const w = colWidths[i];
      doc.rect(curX, curY, w, row.height).stroke();
      doc
        .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(row.cells[i], curX + 3, curY + 4, { width: w - 6, align: row.aligns?.[i] ?? 'left' });
      curX += w;
    }
    curY += row.height;
  }
  return curY;
}

/**
 * Renders a GST Tax Invoice PDF for one order, matching the standard Indian
 * GST invoice layout (seller/buyer registration blocks, item table with
 * HSN/SAC, CGST+SGST or IGST breakup depending on the buyer's state, an
 * HSN-wise tax summary, and amount-in-words lines).
 *
 * A plain, dependency-free function (no repository access) so it can be
 * called both at order-placement time (checkout.service.ts, to generate the
 * permanent stored copy) and on-demand (admin-orders.service.ts, as a
 * fallback for orders placed before that existed) without either module
 * depending on the other.
 *
 * Not built: the "e-Invoice" IRN/Ack No./QR block seen on some sample
 * invoices — that requires integrating with a GST e-invoice portal (GSP) to
 * actually register the invoice and get a real IRN back; fabricating one
 * here would put a fake IRN on a real financial document, so it's left out
 * entirely rather than faked.
 */
export function renderInvoicePdfBuffer(order: Order, profile?: CompanyProfile | null): Promise<Buffer> {
  const addr = order.shippingAddress ?? ({} as Record<string, string>);

  const buyerStateCode = getGstStateCode(addr['state']) ?? '—';
  const sameState = isSameGstState(addr['state'], SELLER_INFO.stateName);
  const gstAmount = Number(order.gstAmount);
  // Split the already-computed flat 18% GST into CGST+SGST (9%+9%) if the
  // buyer is in the seller's own state, or IGST (18%) otherwise — the total
  // tax charged doesn't change, only how it's labelled/split on the invoice.
  const halfGst = Math.round((gstAmount / 2) * 100) / 100;

  return new Promise((resolve, reject) => {
    const M = 30;
    const doc = new PDFDocument({ margin: M, size: 'A4' });
    const PW = doc.page.width - M * 2;
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    /** Starts a fresh page (with the same margins) if there isn't enough room left. */
    const ensureSpace = (needed: number, y: number): number => {
      if (y + needed <= doc.page.height - M) return y;
      doc.addPage({ margin: M, size: 'A4' });
      return M;
    };

    let y = M;

    // ---- Title bar ----
    doc.rect(M, y, PW, 22).stroke();
    doc.font('Helvetica-Bold').fontSize(12).text('Tax Invoice', M, y + 6, { width: PW, align: 'center' });
    y += 22;

    // ---- Seller block (left) + invoice meta (right) ----
    const leftW = Math.round(PW * 0.62);
    const rightX = M + leftW;
    const rightW = PW - leftW;
    const sectionBTop = y;

    let ly = y + 5;
    doc.font('Helvetica-Bold').fontSize(9).text(SELLER_INFO.name, M + 5, ly, { width: leftW - 10 });
    ly += 12;
    doc.font('Helvetica').fontSize(8);
    const sellerLines = [
      SELLER_INFO.addressLine1,
      SELLER_INFO.addressLine2,
      `GSTIN/UIN: ${SELLER_INFO.gstin}`,
      `State Name: ${SELLER_INFO.stateName}, Code: ${SELLER_INFO.stateCode}`,
      `CIN: ${SELLER_INFO.cin}`,
      `Contact: ${SELLER_INFO.contacts.join(', ')}`,
      `E-Mail: ${SELLER_INFO.emails.join(', ')}`,
      `MSME Reg. No.: ${SELLER_INFO.msmeRegNo}`,
    ];
    for (const line of sellerLines) {
      doc.text(line, M + 5, ly, { width: leftW - 10 });
      ly += doc.heightOfString(line, { width: leftW - 10 }) + 2;
    }

    let ry = y + 5;
    const metaRow = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(8).text(label, rightX + 5, ry, { width: rightW - 10 });
      ry += 10;
      doc.font('Helvetica-Bold').fontSize(8.5).text(value || '—', rightX + 5, ry, { width: rightW - 10 });
      ry += 14;
    };
    metaRow('Invoice No.', order.orderId);
    metaRow('Dated', order.createdAt.toLocaleDateString('en-IN'));
    metaRow('Mode/Terms of Payment', order.paymentMethod ? order.paymentMethod.replace(/_/g, ' ').toUpperCase() : '—');
    metaRow('Reference No. & Date', order.transactionId ? `${order.transactionId}, ${order.createdAt.toLocaleDateString('en-IN')}` : '—');
    metaRow('Destination', [addr['city'], addr['state']].filter(Boolean).join(', ') || '—');

    const sectionBHeight = Math.max(ly - sectionBTop, ry - sectionBTop) + 5;
    doc.rect(M, sectionBTop, PW, sectionBHeight).stroke();
    doc.moveTo(rightX, sectionBTop).lineTo(rightX, sectionBTop + sectionBHeight).stroke();
    y = sectionBTop + sectionBHeight;

    // ---- Buyer (Bill to / Ship to) ----
    // A single combined box: this storefront only captures one delivery
    // address per order (no separate consignee), so a "Consignee (Ship to)"
    // box identical to "Buyer (Bill to)" would just be a duplicate.
    const buyerTop = y;
    let by = y + 5;
    doc.font('Helvetica-Bold').fontSize(8.5).text('Buyer (Bill to / Ship to)', M + 5, by, { width: PW - 10 });
    by += 12;
    doc.font('Helvetica').fontSize(8);
    const buyerName = profile?.companyName ?? order.user?.email ?? 'Customer';
    const buyerLines = [
      buyerName,
      addr['addressLine1'],
      addr['addressLine2'],
      [addr['city'], addr['state'], addr['pincode']].filter(Boolean).join(', '),
      `GSTIN/UIN: ${profile?.gstin || '—'}`,
      `PAN: ${profile?.panNumber || '—'}`,
      `State Name: ${addr['state'] || '—'}, Code: ${buyerStateCode}`,
      `Phone: ${profile?.phone ?? addr['phone'] ?? '—'}`,
    ].filter(Boolean) as string[];
    for (const line of buyerLines) {
      doc.text(line, M + 5, by, { width: PW - 10 });
      by += doc.heightOfString(line, { width: PW - 10 }) + 2;
    }
    const buyerHeight = by - buyerTop + 5;
    doc.rect(M, buyerTop, PW, buyerHeight).stroke();
    y = buyerTop + buyerHeight;

    // ---- Line items ----
    const colWidths = [32, 153, 55, 45, 65, 30, PW - (32 + 153 + 55 + 45 + 65 + 30)];
    const aligns: InvoiceTableRow['aligns'] = ['center', 'left', 'center', 'center', 'right', 'center', 'right'];
    y = ensureSpace(18 + 20, y);
    y = renderInvoiceTable(doc, M, y, colWidths, [
      { cells: ['Sl No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount'], height: 18, bold: true, aligns },
    ]);

    let totalQty = 0;
    order.items.forEach((item, index) => {
      const showModel = item.product?.modelNumber && item.product.modelNumber !== item.productName;
      const rowText = `${item.productName}${showModel ? ` (${item.product.modelNumber})` : ''}`;
      const rowHeight = Math.max(18, doc.font('Helvetica').fontSize(8).heightOfString(rowText, { width: colWidths[1] - 6 }) + 8);
      y = ensureSpace(rowHeight, y);
      y = renderInvoiceTable(doc, M, y, colWidths, [
        {
          cells: [
            String(index + 1),
            rowText,
            item.hsnCode || '—',
            String(item.quantity),
            inr(item.unitPrice),
            'Nos',
            inr(item.totalPrice),
          ],
          height: rowHeight,
          aligns,
        },
      ]);
      totalQty += item.quantity;
    });

    y = ensureSpace(18, y);
    y = renderInvoiceTable(doc, M, y, colWidths, [
      { cells: ['', 'Total', '', String(totalQty), '', '', inr(order.subtotal)], height: 18, bold: true, aligns },
    ]);

    // ---- Tax breakup ----
    y += 6;
    const taxLine = (label: string, value: string, bold = false) => {
      y = ensureSpace(13, y);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9);
      doc.text(label, M, y, { width: PW - 150 });
      doc.text(value, M + PW - 150, y, { width: 150, align: 'right' });
      y += bold ? 15 : 13;
    };
    taxLine('Taxable Value', `Rs. ${inr(order.subtotal)}`);
    if (Number(order.discountAmount)) {
      taxLine(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- Rs. ${inr(order.discountAmount)}`);
    }
    if (sameState) {
      taxLine('CGST @ 9%', `Rs. ${inr(halfGst)}`);
      taxLine('SGST @ 9%', `Rs. ${inr(gstAmount - halfGst)}`);
    } else {
      taxLine('IGST @ 18%', `Rs. ${inr(gstAmount)}`);
    }
    if (Number(order.shippingAmount)) {
      taxLine('Shipping', `Rs. ${inr(order.shippingAmount)}`);
    }
    taxLine('Total', `Rs. ${inr(order.totalAmount)}`, true);

    if (Number(order.advanceAmount)) {
      y = ensureSpace(24, y);
      doc.font('Helvetica-Oblique').fontSize(8);
      doc.text(`Advance paid: Rs. ${inr(order.advanceAmount)} (${order.advancePaid ? 'received' : 'pending'})`, M, y, { width: PW });
      y += 11;
      doc.text(`Balance due: Rs. ${inr(order.balanceAmount)} (${order.balancePaid ? 'received' : 'pending'})`, M, y, { width: PW });
      y += 13;
    }

    // ---- Amount in words ----
    y += 4;
    y = ensureSpace(24, y);
    doc.font('Helvetica-Bold').fontSize(8.5).text('Amount Chargeable (in words):', M, y, { width: PW });
    y += 11;
    doc.font('Helvetica').fontSize(8.5).text(amountToIndianWords(order.totalAmount), M, y, { width: PW - 60 });
    doc.font('Helvetica-Oblique').fontSize(8).text('E. & O.E', M + PW - 60, y, { width: 60, align: 'right' });
    y += 16;

    // ---- HSN/SAC summary ----
    const hsnGroups = new Map<string, { taxable: number }>();
    for (const item of order.items) {
      const key = item.hsnCode || '—';
      const g = hsnGroups.get(key) ?? { taxable: 0 };
      g.taxable += Number(item.totalPrice);
      hsnGroups.set(key, g);
    }
    // Proportionally split order.gstAmount across HSN groups by taxable share,
    // with the last group absorbing any rounding remainder so the column
    // foots exactly to order.gstAmount (largest-remainder method).
    const groupEntries = [...hsnGroups.entries()];
    let allocatedTax = 0;
    const groupTax = groupEntries.map(([, g], idx) => {
      if (idx === groupEntries.length - 1) return Math.round((gstAmount - allocatedTax) * 100) / 100;
      const share = order.subtotal ? (g.taxable / Number(order.subtotal)) * gstAmount : 0;
      const rounded = Math.round(share * 100) / 100;
      allocatedTax += rounded;
      return rounded;
    });

    y = ensureSpace(16 + groupEntries.length * 16 + 16, y);
    if (sameState) {
      const hsnCols = [65, 85, 48, 65, 48, 65, PW - (65 + 85 + 48 + 65 + 48 + 65)];
      const hsnAligns: InvoiceTableRow['aligns'] = ['left', 'right', 'center', 'right', 'center', 'right', 'right'];
      y = renderInvoiceTable(doc, M, y, hsnCols, [
        { cells: ['HSN/SAC', 'Taxable Value', 'CGST Rate', 'CGST Amt', 'SGST Rate', 'SGST Amt', 'Total Tax'], height: 16, bold: true, aligns: hsnAligns },
      ]);
      groupEntries.forEach(([hsn, g], idx) => {
        const half = Math.round((groupTax[idx] / 2) * 100) / 100;
        y = renderInvoiceTable(doc, M, y, hsnCols, [
          { cells: [hsn, inr(g.taxable), '9%', inr(half), '9%', inr(groupTax[idx] - half), inr(groupTax[idx])], height: 16, aligns: hsnAligns },
        ]);
      });
      y = renderInvoiceTable(doc, M, y, hsnCols, [
        { cells: ['Total', inr(order.subtotal), '', inr(halfGst), '', inr(gstAmount - halfGst), inr(gstAmount)], height: 16, bold: true, aligns: hsnAligns },
      ]);
    } else {
      const hsnCols = [110, 140, 70, 100, PW - (110 + 140 + 70 + 100)];
      const hsnAligns: InvoiceTableRow['aligns'] = ['left', 'right', 'center', 'right', 'right'];
      y = renderInvoiceTable(doc, M, y, hsnCols, [
        { cells: ['HSN/SAC', 'Taxable Value', 'IGST Rate', 'IGST Amt', 'Total Tax'], height: 16, bold: true, aligns: hsnAligns },
      ]);
      groupEntries.forEach(([hsn, g], idx) => {
        y = renderInvoiceTable(doc, M, y, hsnCols, [
          { cells: [hsn, inr(g.taxable), '18%', inr(groupTax[idx]), inr(groupTax[idx])], height: 16, aligns: hsnAligns },
        ]);
      });
      y = renderInvoiceTable(doc, M, y, hsnCols, [
        { cells: ['Total', inr(order.subtotal), '', inr(gstAmount), inr(gstAmount)], height: 16, bold: true, aligns: hsnAligns },
      ]);
    }

    y += 8;
    y = ensureSpace(40, y);
    doc.font('Helvetica-Bold').fontSize(8.5).text('Tax Amount (in words):', M, y, { width: PW });
    y += 11;
    doc.font('Helvetica').fontSize(8.5).text(amountToIndianWords(gstAmount), M, y, { width: PW });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(8.5).text(`Company's PAN: ${SELLER_INFO.pan}`, M, y, { width: PW });
    y += 18;

    // ---- Declaration + signature ----
    const declTop = y;
    const declW = Math.round(PW * 0.62);
    const signX = M + declW;
    const signW = PW - declW;
    doc.font('Helvetica-Bold').fontSize(8).text('Declaration', M + 5, declTop + 5, { width: declW - 10 });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
        M + 5,
        declTop + 15,
        { width: declW - 10 },
      );
    doc.font('Helvetica-Bold').fontSize(8).text(`for ${SELLER_INFO.name}`, signX + 5, declTop + 5, { width: signW - 10, align: 'right' });
    doc.font('Helvetica').fontSize(8).text('Authorised Signatory', signX + 5, declTop + 45, { width: signW - 10, align: 'right' });
    const declHeight = 60;
    doc.rect(M, declTop, PW, declHeight).stroke();
    doc.moveTo(signX, declTop).lineTo(signX, declTop + declHeight).stroke();
    y = declTop + declHeight + 10;

    // ---- Footer ----
    y = ensureSpace(24, y);
    doc.font('Helvetica-Bold').fontSize(8).text('SUBJECT TO ONLY DELHI JURISDICTION', M, y, { width: PW, align: 'center' });
    y += 12;
    doc.font('Helvetica').fontSize(7.5).text('This is a Computer Generated Invoice', M, y, { width: PW, align: 'center' });

    doc.end();
  });
}
