import { promises as fs } from 'fs';
import { join } from 'path';

// Same convention as product/category uploads: files live under ./public/uploads/*
// and are served statically at /uploads/* (see main.ts's useStaticAssets call).
const INVOICE_DIR = join(process.cwd(), 'public', 'uploads', 'invoices');

/** Filesystem path an order's invoice PDF is (or would be) stored at — deterministic by order id. */
export function getInvoiceFilePath(orderId: string): string {
  return join(INVOICE_DIR, `${orderId}.pdf`);
}

/** The `/uploads/...`-relative path to hand to a URL-building helper (prefix with APP_URL). */
export function getInvoiceRelativePath(orderId: string): string {
  return `/uploads/invoices/${orderId}.pdf`;
}

export async function invoiceFileExists(orderId: string): Promise<boolean> {
  try {
    await fs.access(getInvoiceFilePath(orderId));
    return true;
  } catch {
    return false;
  }
}

export async function readInvoiceFile(orderId: string): Promise<Buffer> {
  return fs.readFile(getInvoiceFilePath(orderId));
}

/** Writes the invoice PDF to disk, creating the uploads/invoices directory if needed. */
export async function saveInvoiceFile(orderId: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(INVOICE_DIR, { recursive: true });
  await fs.writeFile(getInvoiceFilePath(orderId), buffer);
}
