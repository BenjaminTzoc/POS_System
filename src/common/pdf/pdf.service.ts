import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Quotation, Sale } from '../../sales/entities';
import { join } from 'path';
import { existsSync } from 'fs';

@Injectable()
export class PdfService {
  async generateInvoicePdf(sale: Sale): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 80mm ticket width is approximately 226 points. We set a large height to prevent premature page breaks.
      const doc = new PDFDocument({ margin: 15, size: [226, 1000] });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // --- Header ---
      doc.fontSize(14).text('SISTEMA POS', { align: 'center' });
      doc.fontSize(8).text(sale.branch?.name || 'Sucursal Principal', { align: 'center' });
      doc.text(sale.branch?.address || 'Ciudad', { align: 'center' });
      doc.text(`Tel: ${sale.branch?.phone || '2222-3333'}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.text('--------------------------------------------------', { align: 'center' });
      doc.moveDown(0.5);

      // --- Sale Info ---
      doc.text(`N° Factura: ${sale.invoiceNumber}`);
      doc.text(`Fecha: ${new Date(sale.date).toLocaleString()}`);

      const customerName = sale.customer ? sale.customer.name : sale.guestCustomer?.name || 'Consumidor Final';
      const customerNit = sale.customer ? sale.customer.nit : sale.guestCustomer?.nit || 'C/F';

      doc.text(`Cliente: ${customerName}`);
      doc.text(`NIT: ${customerNit}`);
      doc.moveDown(0.5);
      doc.text('--------------------------------------------------', { align: 'center' });
      doc.moveDown(0.5);

      // --- Table Header ---
      let startY = doc.y;
      doc.text('CANT', 15, startY, { width: 30 });
      doc.text('PRODUCTO', 45, startY, { width: 100 });
      doc.text('TOTAL', 145, startY, { width: 66, align: 'right' });
      doc.moveDown(0.2);
      
      doc.text('--------------------------------------------------', 15, doc.y, { align: 'center', width: 196 });
      doc.moveDown(0.5);

      // --- Table Content ---
      sale.details.forEach((detail) => {
        startY = doc.y;
        doc.text(Number(detail.quantity).toFixed(2), 15, startY, { width: 30 });
        doc.text(detail.product?.name || 'Producto', 45, startY, { width: 100 });
        doc.text(`Q${Number(detail.lineTotal).toFixed(2)}`, 145, startY, { width: 66, align: 'right' });
        doc.moveDown(0.5);
      });

      doc.text('--------------------------------------------------', 15, doc.y, { align: 'center', width: 196 });
      doc.moveDown(0.5);

      // --- Totals ---
      startY = doc.y;
      doc.text('Subtotal:', 15, startY, { width: 130, align: 'right' });
      doc.text(`Q${Number(sale.subtotal).toFixed(2)}`, 145, startY, { width: 66, align: 'right' });
      doc.moveDown(0.2);

      if (Number(sale.discountAmount) > 0) {
        startY = doc.y;
        doc.text('Descuento:', 15, startY, { width: 130, align: 'right' });
        doc.text(`-Q${Number(sale.discountAmount).toFixed(2)}`, 145, startY, { width: 66, align: 'right' });
        doc.moveDown(0.2);
      }

      startY = doc.y;
      doc.text('Impuestos:', 15, startY, { width: 130, align: 'right' });
      doc.text(`Q${Number(sale.taxAmount).toFixed(2)}`, 145, startY, { width: 66, align: 'right', underline: true });
      doc.moveDown(0.5);

      startY = doc.y;
      doc.fontSize(10).text('TOTAL:', 15, startY, { width: 130, align: 'right' });
      doc.text(`Q${Number(sale.total).toFixed(2)}`, 145, startY, { width: 66, align: 'right' });
      doc.moveDown(1);

      doc.fontSize(8).text('--------------------------------------------------', 15, doc.y, { align: 'center', width: 196 });
      doc.moveDown(0.5);

      // --- Footer ---
      doc.text('¡Gracias por su compra!', { align: 'center', width: 196 });
      doc.text('Vuelva pronto', { align: 'center', width: 196 });
      doc.moveDown(0.5);
      doc.fontSize(6).text('Documento generado digitalmente', { align: 'center', width: 196 });

      doc.end();
    });
  }

  async generateQuotationPdf(quotation: Quotation): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // --- Premium Color Palette ---
      const COLOR_PRIMARY = '#1A273A';      // Deep slate blue for headers
      const COLOR_SECONDARY = '#3B4A6B';    // Card headers
      const COLOR_TEXT = '#3E4A62';         // Body text
      const COLOR_MUTED = '#627CA7';        // Muted label text
      const COLOR_ACCENT = '#0C8ABC';       // Ocean blue for line accents
      const COLOR_RUST = '#C24D2C';         // Rust orange for grand total highlight
      const COLOR_BG_LIGHT = '#F4F7FC';     // Light card fill
      const COLOR_BORDER = '#DAEAF7';       // Elegant borders
      const COLOR_WHITE = '#FFFFFF';

      // --- 1. Top Decorative Bar ---
      doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);

      // --- 2. Logo / Header Column Setup ---
      let headerY = 25;

      // Try to find the logo in several potential locations
      let logoPath = '';
      const potentialLogoPaths = [
        join(process.cwd(), 'src/common/pdf/logo.png'),
        join(process.cwd(), 'dist/common/pdf/logo.png'),
        join(__dirname, 'logo.png'),
        join(process.cwd(), 'logo.png')
      ];

      for (const p of potentialLogoPaths) {
        if (existsSync(p)) {
          logoPath = p;
          break;
        }
      }

      if (logoPath) {
        try {
          doc.image(logoPath, 40, headerY, { width: 110 });
        } catch (e) {
          // Fallback to text if image loading fails
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text('CABEN', 40, headerY);
          doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Soluciones POS', 40, headerY + 24);
        }
      } else {
        // Fallback typography logo
        doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text('CABEN', 40, headerY);
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Soluciones POS', 40, headerY + 24);
      }

      // Branch details under logo/text
      const branchName = quotation.branch?.name || 'Sucursal Principal';
      const branchAddress = quotation.branch?.address || '';
      const branchPhone = quotation.branch?.phone || '';
      const branchEmail = quotation.branch?.email || '';

      // Compute branch details Y dynamically to avoid overlap if logo image is present
      const branchDetailsY = logoPath ? headerY + 95 : headerY + 40;

      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
      doc.text(branchName, 40, branchDetailsY, { width: 250 });
      if (branchAddress) {
        doc.text(branchAddress, 40, doc.y, { width: 250 });
      }
      doc.text(`Tel: ${branchPhone || 'N/A'} ${branchEmail ? ` | Email: ${branchEmail}` : ''}`, 40, doc.y, { width: 250 });

      // Right Column: Quotation Badge & Metadata
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(20).text('COTIZACIÓN', 340, headerY, { align: 'right', width: 215 });

      // Correlative Badge / Pill
      const badgeY = headerY + 26;
      doc.roundedRect(360, badgeY, 195, 24, 4).fill(COLOR_BORDER);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(quotation.correlative, 360, badgeY + 6, { align: 'center', width: 195 });

      // Dates and Metadata
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
      const dateString = new Date(quotation.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      const validUntilString = new Date(quotation.validUntil).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      
      const diffTime = Math.abs(quotation.validUntil.getTime() - quotation.createdAt.getTime());
      const validityDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      doc.text(`Fecha de Emisión: ${dateString}`, 340, badgeY + 34, { align: 'right', width: 215 });
      doc.text(`Validez: ${validityDays} días (Vence el ${validUntilString})`, 340, doc.y, { align: 'right', width: 215 });

      // --- 3. Divider ---
      const dividerY = 155;
      doc.moveTo(40, dividerY).lineTo(555, dividerY).strokeColor(COLOR_BORDER).lineWidth(1).stroke();

      // --- 4. Customer Information Card ---
      const customerY = 168;
      // Draw sub-card container
      doc.roundedRect(40, customerY, 515, 78, 4).fill(COLOR_BG_LIGHT);
      
      const customerName = quotation.customer ? quotation.customer.name : quotation.guestCustomer?.name || 'Consumidor Final';
      const customerNit = quotation.customer ? quotation.customer.nit : quotation.guestCustomer?.nit || 'C/F';
      const customerAddress = quotation.customer ? quotation.customer.address : quotation.guestCustomer?.address || 'Ciudad';
      const customerEmail = quotation.customer ? quotation.customer.email : quotation.guestCustomer?.email || 'N/A';
      const customerPhone = quotation.customer ? quotation.customer.phone : quotation.guestCustomer?.phone || 'N/A';

      // Left Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 52, customerY + 8);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(customerName, 52, customerY + 20, { width: 240, ellipsis: true });
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`Dirección: ${customerAddress}`, 52, customerY + 36, { width: 240, height: 26, ellipsis: true });

      // Right Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE CONTACTO', 320, customerY + 8);
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`NIT / ID: ${customerNit}`, 320, customerY + 20);
      doc.text(`Teléfono: ${customerPhone}`, 320, customerY + 33);
      doc.text(`Email: ${customerEmail}`, 320, customerY + 46, { width: 220, ellipsis: true });

      // --- 5. Table of Products ---
      let currentY = 260;

      // Table Header Draw Function
      const drawTableHeader = (y: number) => {
        doc.roundedRect(40, y, 515, 24, 2).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8.5);
        doc.text('PRODUCTO', 50, y + 7.5, { width: 240 });
        doc.text('CANTIDAD', 300, y + 7.5, { width: 70, align: 'center' });
        doc.text('PRECIO UNIT.', 380, y + 7.5, { width: 85, align: 'right' });
        doc.text('TOTAL', 475, y + 7.5, { width: 70, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 24;

      // Table Rows
      quotation.items.forEach((item, index) => {
        // Page break calculation
        if (currentY > 700) {
          doc.addPage();
          // Draw top accent bar on new page
          doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);
          currentY = 40;
          drawTableHeader(currentY);
          currentY += 24;
        }

        // Row background
        const rowHeight = 24;
        if (index % 2 === 1) {
          doc.rect(40, currentY, 515, rowHeight).fill('#F8FAFC');
        }

        // Values
        const unitPriceAdjusted = (Number(item.lineTotal) - Number(item.taxAmount)) / Number(item.quantity);
        const rowTotal = unitPriceAdjusted * Number(item.quantity);

        doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
        doc.text(item.product?.name || 'Producto', 50, currentY + 7, { width: 240, height: 14, ellipsis: true });
        
        doc.text(Number(item.quantity).toFixed(2), 300, currentY + 7, { width: 70, align: 'center' });
        doc.text(`Q${unitPriceAdjusted.toFixed(2)}`, 380, currentY + 7, { width: 85, align: 'right' });
        
        doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY);
        doc.text(`Q${rowTotal.toFixed(2)}`, 475, currentY + 7, { width: 70, align: 'right' });

        // Line bottom border
        doc.moveTo(40, currentY + rowHeight).lineTo(555, currentY + rowHeight).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

        currentY += rowHeight;
      });

      // --- 6. Summary and Footer Area ---
      // Check space for totals block
      if (currentY > 640) {
        doc.addPage();
        // Draw top accent bar on new page
        doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);
        currentY = 40;
      }

      currentY += 15;

      // Left Column: Note / Legal Information
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('TÉRMINOS Y CONDICIONES', 40, currentY);
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8).text(
        `• Esta cotización tiene una validez de ${validityDays} días a partir de su emisión.\n` +
        `• Vence oficialmente el día ${validUntilString}.\n` +
        `• Pasado este periodo, los precios y existencias pueden estar sujetos a cambios sin previo aviso.`,
        40,
        currentY + 12,
        { width: 270, lineGap: 3 }
      );

      if (quotation.notes) {
        doc.moveDown(0.8);
        doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('NOTAS', 40, doc.y);
        doc.fillColor(COLOR_TEXT).font('Helvetica-Oblique').fontSize(8).text(quotation.notes, 40, doc.y + 4, { width: 270 });
      }

      // Right Column: Financial Totals Block
      const totalsX = 350;
      let totalsY = currentY;

      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Sub Total (sin impuestos):', totalsX, totalsY, { width: 120 });
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').text(`Q${Number(quotation.subtotal - quotation.discountAmount).toFixed(2)}`, 480, totalsY, { align: 'right', width: 75 });

      totalsY += 18;
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Impuestos (IVA 12%):', totalsX, totalsY, { width: 120 });
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').text(`Q${Number(quotation.taxAmount).toFixed(2)}`, 480, totalsY, { align: 'right', width: 75 });

      totalsY += 22;
      // Grand Total Solid Box with Rust Accent Color (#C24D2C)
      doc.roundedRect(totalsX - 5, totalsY - 4, 210, 26, 4).fill(COLOR_RUST);
      doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(11).text('TOTAL', totalsX + 8, totalsY + 4);
      doc.fontSize(12).text(`Q${Number(quotation.total).toFixed(2)}`, 450, totalsY + 3, { align: 'right', width: 95 });

      // --- 7. Page Footer (Fixed at the bottom of the last page) ---
      const footerY = 765;
      doc.moveTo(40, footerY - 5).lineTo(555, footerY - 5).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8.5);
      doc.text('¡Gracias por confiar en nuestras soluciones!', 40, footerY + 2, { align: 'center', width: 515 });
      
      const detailsText = `Dirección: ${branchAddress || 'N/A'}  |  Teléfono: ${branchPhone || 'N/A'}  |  Email: ${branchEmail || 'N/A'}`;
      doc.fillColor(COLOR_TEXT).fontSize(7.5).text(detailsText, 40, footerY + 14, { align: 'center', width: 515 });

      doc.end();
    });
  }
}
